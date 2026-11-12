-- ============================================================
-- Migration 003 — move business rules to the server
-- Run AFTER 001_schema.sql and 002_admin_security.sql
--
-- Why: v1 trusted the browser for things a user could fake
--   * attendance time and "inside geofence" flag
--   * which custody wallet an expense is charged to
--   * balance after a rejected expense (money was never given back)
--   * payroll allowances (calculated by hand)
-- ============================================================

-- ---------- helpers ----------
CREATE OR REPLACE FUNCTION public.distance_m(lat1 numeric, lng1 numeric, lat2 numeric, lng2 numeric)
RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
  SELECT 6371000 * 2 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  ));
$$;

-- ---------- ATTENDANCE: only through RPCs, time comes from the server ----------
DROP POLICY IF EXISTS "attendance_insert_own" ON public.attendance;
DROP POLICY IF EXISTS "attendance_update_own" ON public.attendance;
CREATE POLICY "attendance_admin_write" ON public.attendance
  FOR ALL USING (is_admin_or_pm()) WITH CHECK (is_admin_or_pm());

CREATE OR REPLACE FUNCTION public.check_in(p_project uuid, p_lat numeric, p_lng numeric)
RETURNS public.attendance LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  proj public.projects;
  inside boolean := false;
  row public.attendance;
BEGIN
  SELECT * INTO proj FROM public.projects WHERE id = p_project;
  IF proj.id IS NULL OR NOT (auth.uid() = ANY (proj.assigned_engineer_ids)) THEN
    RAISE EXCEPTION 'الموقع غير مسند إليك';
  END IF;
  IF EXISTS (SELECT 1 FROM public.attendance
             WHERE engineer_id = auth.uid() AND check_out_time IS NULL) THEN
    RAISE EXCEPTION 'لديك تسجيل وصول مفتوح، سجّل المغادرة أولاً';
  END IF;
  IF proj.location_lat IS NOT NULL AND p_lat IS NOT NULL THEN
    inside := distance_m(proj.location_lat, proj.location_lng, p_lat, p_lng) <= COALESCE(proj.geofence_radius_m, 300);
  END IF;
  INSERT INTO public.attendance (engineer_id, project_id, check_in_lat, check_in_lng,
                                 is_within_geofence, is_verified, date)
  VALUES (auth.uid(), p_project, p_lat, p_lng, inside, inside, (now() AT TIME ZONE 'Africa/Cairo')::date)
  RETURNING * INTO row;
  RETURN row;
END $$;

CREATE OR REPLACE FUNCTION public.check_out(p_attendance uuid, p_lat numeric, p_lng numeric)
RETURNS public.attendance LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE row public.attendance;
BEGIN
  UPDATE public.attendance
     SET check_out_time = now(), check_out_lat = p_lat, check_out_lng = p_lng
   WHERE id = p_attendance AND engineer_id = auth.uid() AND check_out_time IS NULL
   RETURNING * INTO row;
  IF row.id IS NULL THEN RAISE EXCEPTION 'لا يوجد تسجيل وصول مفتوح'; END IF;
  RETURN row;
END $$;

GRANT EXECUTE ON FUNCTION public.check_in(uuid, numeric, numeric)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_out(uuid, numeric, numeric) TO authenticated;

-- ---------- EXPENSES ----------
-- Always charge the engineer's own wallet; engineers cannot pick a status.
CREATE OR REPLACE FUNCTION public.expense_before_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  SELECT id INTO NEW.custody_id FROM public.custody_wallets WHERE engineer_id = NEW.engineer_id;
  IF NEW.custody_id IS NULL THEN RAISE EXCEPTION 'لا توجد عهدة لهذا المهندس'; END IF;
  IF NOT is_admin_or_pm() THEN NEW.status := 'pending_review'; END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_expense_before_insert ON public.expenses;
CREATE TRIGGER trg_expense_before_insert BEFORE INSERT ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.expense_before_insert();

-- Rejected expense gives the money back; un-rejecting takes it again.
CREATE OR REPLACE FUNCTION public.expense_status_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;
  IF NEW.status = 'rejected' THEN
    UPDATE public.custody_wallets SET current_balance = current_balance + OLD.amount WHERE id = OLD.custody_id;
  ELSIF OLD.status = 'rejected' THEN
    UPDATE public.custody_wallets SET current_balance = current_balance - OLD.amount WHERE id = OLD.custody_id;
  END IF;
  NEW.reviewed_by := auth.uid();
  NEW.reviewed_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_expense_status_change ON public.expenses;
CREATE TRIGGER trg_expense_status_change BEFORE UPDATE OF status ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.expense_status_change();

-- Deleting a rejected expense must not refund twice.
CREATE OR REPLACE FUNCTION public.restore_expense_to_wallet()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF OLD.status <> 'rejected' THEN
    UPDATE public.custody_wallets SET current_balance = current_balance + OLD.amount WHERE id = OLD.custody_id;
  END IF;
  RETURN OLD;
END $$;

-- Admin tops up a wallet (adds to both counters atomically).
CREATE OR REPLACE FUNCTION public.disburse_custody(p_engineer uuid, p_amount numeric)
RETURNS public.custody_wallets LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE w public.custody_wallets;
BEGIN
  IF get_my_role() <> 'admin' THEN RAISE EXCEPTION 'صلاحيات المدير مطلوبة'; END IF;
  IF p_amount <= 0 THEN RAISE EXCEPTION 'المبلغ غير صالح'; END IF;
  INSERT INTO public.custody_wallets (engineer_id, total_disbursed, current_balance)
  VALUES (p_engineer, p_amount, p_amount)
  ON CONFLICT (engineer_id) DO UPDATE
    SET total_disbursed = custody_wallets.total_disbursed + p_amount,
        current_balance = custody_wallets.current_balance + p_amount
  RETURNING * INTO w;
  RETURN w;
END $$;
GRANT EXECUTE ON FUNCTION public.disburse_custody(uuid, numeric) TO authenticated;

-- ---------- PAYROLL: one-click monthly sheet ----------
-- Allowance = verified field days × engineer's rate.
-- Re-running keeps manual bonuses/advances/deductions and only touches drafts.
CREATE OR REPLACE FUNCTION public.calculate_payroll(p_month int, p_year int)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int;
BEGIN
  IF get_my_role() <> 'admin' THEN RAISE EXCEPTION 'صلاحيات المدير مطلوبة'; END IF;

  WITH days AS (
    SELECT engineer_id, count(DISTINCT date) AS d
    FROM public.attendance
    WHERE is_verified AND check_out_time IS NOT NULL
      AND extract(month FROM date) = p_month AND extract(year FROM date) = p_year
    GROUP BY engineer_id
  ), upserted AS (
    INSERT INTO public.payroll_records (engineer_id, month, year, base_salary, allowances, field_days, created_by)
    SELECT p.id, p_month, p_year, p.base_salary,
           COALESCE(d.d, 0) * p.site_allowance_rate, COALESCE(d.d, 0), auth.uid()
    FROM public.profiles p LEFT JOIN days d ON d.engineer_id = p.id
    WHERE p.role = 'site_engineer' AND p.is_active
    ON CONFLICT (engineer_id, month, year) DO UPDATE
      SET base_salary = EXCLUDED.base_salary,
          allowances  = EXCLUDED.allowances,
          field_days  = EXCLUDED.field_days
      WHERE payroll_records.status = 'draft'
    RETURNING 1
  )
  SELECT count(*) INTO n FROM upserted;
  RETURN n;
END $$;
GRANT EXECUTE ON FUNCTION public.calculate_payroll(int, int) TO authenticated;

-- Payroll rows are admin-only for writes (policy from 001 allowed PMs too).
DROP POLICY IF EXISTS "payroll_admin_write" ON public.payroll_records;
CREATE POLICY "payroll_admin_write" ON public.payroll_records
  FOR ALL USING (get_my_role() = 'admin') WITH CHECK (get_my_role() = 'admin');

-- ---------- Daily reports: engineer only for assigned projects ----------
DROP POLICY IF EXISTS "reports_insert_own" ON public.daily_reports;
CREATE POLICY "reports_insert_own" ON public.daily_reports FOR INSERT WITH CHECK (
  engineer_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.projects p WHERE p.id = project_id AND auth.uid() = ANY (p.assigned_engineer_ids))
);

-- ---------- Realtime for the admin live feed ----------
ALTER PUBLICATION supabase_realtime ADD TABLE public.attendance, public.daily_reports, public.expenses;
