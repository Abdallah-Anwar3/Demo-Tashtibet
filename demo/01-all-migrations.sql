-- ===== 001_schema.sql =====
-- ============================================================
-- Tashtibet PWA — Complete Supabase Migration Script
-- Interior Finishing & Contracting Company
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. PROFILES
-- ============================================================
CREATE TABLE public.profiles (
  id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name    TEXT NOT NULL,
  phone        TEXT,
  role         TEXT NOT NULL CHECK (role IN ('admin', 'project_manager', 'site_engineer')),
  base_salary  NUMERIC(12,2) DEFAULT 0,
  site_allowance_rate NUMERIC(10,2) DEFAULT 0, -- per verified field day
  avatar_url   TEXT,
  is_active    BOOLEAN DEFAULT TRUE,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 2. PROJECTS
-- ============================================================
CREATE TABLE public.projects (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title                TEXT NOT NULL,
  client_name          TEXT NOT NULL,
  address              TEXT,
  location_lat         NUMERIC(10,7),
  location_lng         NUMERIC(10,7),
  geofence_radius_m    INTEGER DEFAULT 300,
  status               TEXT NOT NULL DEFAULT 'active'
                         CHECK (status IN ('active','paused','completed','cancelled')),
  stage                TEXT NOT NULL DEFAULT 'foundation'
                         CHECK (stage IN (
                           'foundation',    -- تأسيس
                           'masonry',       -- محارة
                           'plumbing',      -- سباكة
                           'electrical',    -- كهرباء
                           'painting',      -- دهانات
                           'final_finish'   -- تشطيب نهائي
                         )),
  assigned_engineer_ids UUID[] DEFAULT '{}',
  budget               NUMERIC(14,2) DEFAULT 0,
  start_date           DATE,
  delivery_date        DATE,
  notes                TEXT,
  created_by           UUID REFERENCES public.profiles(id),
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 3. ATTENDANCE
-- ============================================================
CREATE TABLE public.attendance (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  engineer_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  project_id     UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  check_in_time  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  check_out_time TIMESTAMPTZ,
  check_in_lat   NUMERIC(10,7),
  check_in_lng   NUMERIC(10,7),
  check_out_lat  NUMERIC(10,7),
  check_out_lng  NUMERIC(10,7),
  is_within_geofence BOOLEAN DEFAULT FALSE,
  is_verified    BOOLEAN DEFAULT FALSE,
  date           DATE NOT NULL DEFAULT CURRENT_DATE,
  notes          TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_attendance_engineer_date ON public.attendance(engineer_id, date);
CREATE INDEX idx_attendance_project_date  ON public.attendance(project_id, date);

-- ============================================================
-- 4. DAILY REPORTS
-- ============================================================
CREATE TABLE public.daily_reports (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id      UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  engineer_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  completed_work  TEXT,
  remaining_work  TEXT,
  issues          TEXT,
  notes           TEXT,
  photos_urls     TEXT[] DEFAULT '{}',
  date            DATE NOT NULL DEFAULT CURRENT_DATE,
  sync_status     TEXT DEFAULT 'synced' CHECK (sync_status IN ('pending','synced','failed')),
  offline_id      TEXT UNIQUE, -- Dexie local ID for dedup on sync
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_daily_reports_project_date   ON public.daily_reports(project_id, date);
CREATE INDEX idx_daily_reports_engineer_date  ON public.daily_reports(engineer_id, date);

-- ============================================================
-- 5. CUSTODY WALLETS
-- ============================================================
CREATE TABLE public.custody_wallets (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  engineer_id      UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  total_disbursed  NUMERIC(14,2) DEFAULT 0,
  current_balance  NUMERIC(14,2) DEFAULT 0,
  last_settled_at  TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 6. EXPENSES
-- ============================================================
CREATE TABLE public.expenses (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  custody_id   UUID NOT NULL REFERENCES public.custody_wallets(id) ON DELETE CASCADE,
  project_id   UUID REFERENCES public.projects(id),
  engineer_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount       NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  category     TEXT NOT NULL CHECK (category IN (
                  'labor_wages',        -- يوميات عمالة
                  'subcontractor',      -- مقاولو باطن
                  'materials',          -- شراء خامات
                  'transportation'      -- نقل ونثريات
               )),
  description  TEXT,
  receipt_url  TEXT,
  status       TEXT DEFAULT 'pending_review'
               CHECK (status IN ('approved','pending_review','rejected')),
  reviewed_by  UUID REFERENCES public.profiles(id),
  reviewed_at  TIMESTAMPTZ,
  offline_id   TEXT UNIQUE,
  sync_status  TEXT DEFAULT 'synced' CHECK (sync_status IN ('pending','synced','failed')),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_expenses_engineer     ON public.expenses(engineer_id);
CREATE INDEX idx_expenses_project      ON public.expenses(project_id);
CREATE INDEX idx_expenses_status       ON public.expenses(status);
CREATE INDEX idx_expenses_created_at   ON public.expenses(created_at DESC);

-- ============================================================
-- 7. PAYROLL RECORDS
-- ============================================================
CREATE TABLE public.payroll_records (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  engineer_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  month         INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  year          INTEGER NOT NULL CHECK (year >= 2020),
  base_salary   NUMERIC(12,2) DEFAULT 0,
  allowances    NUMERIC(12,2) DEFAULT 0,  -- auto-calculated from attendance
  bonuses       NUMERIC(12,2) DEFAULT 0,
  advances      NUMERIC(12,2) DEFAULT 0,  -- personal advances (separate from custody)
  deductions    NUMERIC(12,2) DEFAULT 0,
  net_salary    NUMERIC(12,2) GENERATED ALWAYS AS
                  (base_salary + allowances + bonuses - advances - deductions) STORED,
  field_days    INTEGER DEFAULT 0,
  status        TEXT DEFAULT 'draft' CHECK (status IN ('draft','approved','paid')),
  notes         TEXT,
  created_by    UUID REFERENCES public.profiles(id),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (engineer_id, month, year)
);

-- ============================================================
-- HELPER: auto-update updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_profiles_updated_at      BEFORE UPDATE ON public.profiles      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_projects_updated_at      BEFORE UPDATE ON public.projects      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_daily_reports_updated_at BEFORE UPDATE ON public.daily_reports FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_custody_updated_at       BEFORE UPDATE ON public.custody_wallets FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_payroll_updated_at       BEFORE UPDATE ON public.payroll_records  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- AUTO-DEDUCT BALANCE ON EXPENSE INSERT
-- ============================================================
CREATE OR REPLACE FUNCTION deduct_expense_from_wallet()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.custody_wallets
  SET current_balance = current_balance - NEW.amount
  WHERE id = NEW.custody_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_expense_deduct
  AFTER INSERT ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION deduct_expense_from_wallet();

-- RESTORE BALANCE IF EXPENSE DELETED
CREATE OR REPLACE FUNCTION restore_expense_to_wallet()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.custody_wallets
  SET current_balance = current_balance + OLD.amount
  WHERE id = OLD.custody_id;
  RETURN OLD;
END;
$$;

CREATE TRIGGER trg_expense_restore
  AFTER DELETE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION restore_expense_to_wallet();

-- ============================================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================================

ALTER TABLE public.profiles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_reports   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custody_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_records ENABLE ROW LEVEL SECURITY;

-- Helper function: get current user role
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS TEXT LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

-- Helper function: check if admin or pm
CREATE OR REPLACE FUNCTION is_admin_or_pm()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT role IN ('admin','project_manager') FROM public.profiles WHERE id = auth.uid();
$$;

-- ---- PROFILES ----
CREATE POLICY "profiles_read_all"   ON public.profiles FOR SELECT USING (TRUE);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE USING (id = auth.uid());
CREATE POLICY "profiles_admin_all"  ON public.profiles FOR ALL USING (is_admin_or_pm());

-- ---- PROJECTS ----
CREATE POLICY "projects_read_assigned" ON public.projects FOR SELECT USING (
  is_admin_or_pm() OR auth.uid() = ANY(assigned_engineer_ids)
);
CREATE POLICY "projects_admin_write" ON public.projects FOR INSERT WITH CHECK (is_admin_or_pm());
CREATE POLICY "projects_admin_update" ON public.projects FOR UPDATE USING (is_admin_or_pm());
CREATE POLICY "projects_admin_delete" ON public.projects FOR DELETE USING (get_my_role() = 'admin');

-- ---- ATTENDANCE ----
CREATE POLICY "attendance_read" ON public.attendance FOR SELECT USING (
  is_admin_or_pm() OR engineer_id = auth.uid()
);
CREATE POLICY "attendance_insert_own" ON public.attendance FOR INSERT WITH CHECK (engineer_id = auth.uid());
CREATE POLICY "attendance_update_own" ON public.attendance FOR UPDATE USING (
  is_admin_or_pm() OR engineer_id = auth.uid()
);

-- ---- DAILY REPORTS ----
CREATE POLICY "reports_read" ON public.daily_reports FOR SELECT USING (
  is_admin_or_pm() OR engineer_id = auth.uid()
);
CREATE POLICY "reports_insert_own" ON public.daily_reports FOR INSERT WITH CHECK (engineer_id = auth.uid());
CREATE POLICY "reports_update_own" ON public.daily_reports FOR UPDATE USING (
  is_admin_or_pm() OR engineer_id = auth.uid()
);

-- ---- CUSTODY WALLETS ----
CREATE POLICY "wallet_read" ON public.custody_wallets FOR SELECT USING (
  is_admin_or_pm() OR engineer_id = auth.uid()
);
CREATE POLICY "wallet_admin_write" ON public.custody_wallets FOR ALL USING (is_admin_or_pm());

-- ---- EXPENSES ----
CREATE POLICY "expenses_read" ON public.expenses FOR SELECT USING (
  is_admin_or_pm() OR engineer_id = auth.uid()
);
CREATE POLICY "expenses_insert_own" ON public.expenses FOR INSERT WITH CHECK (engineer_id = auth.uid());
CREATE POLICY "expenses_update" ON public.expenses FOR UPDATE USING (
  is_admin_or_pm() OR (engineer_id = auth.uid() AND status = 'pending_review')
);

-- ---- PAYROLL ----
CREATE POLICY "payroll_read" ON public.payroll_records FOR SELECT USING (
  is_admin_or_pm() OR engineer_id = auth.uid()
);
CREATE POLICY "payroll_admin_write" ON public.payroll_records FOR ALL USING (is_admin_or_pm());

-- ============================================================
-- STORAGE BUCKETS
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('site-reports', 'site-reports', FALSE, 2097152, ARRAY['image/jpeg','image/png','image/webp']),
  ('receipts',     'receipts',     FALSE, 2097152, ARRAY['image/jpeg','image/png','image/webp','application/pdf']),
  ('avatars',      'avatars',      TRUE,  524288,  ARRAY['image/jpeg','image/png','image/webp']);

-- Storage RLS
CREATE POLICY "reports_upload_own" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'site-reports' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "reports_read" ON storage.objects FOR SELECT
  USING (bucket_id = 'site-reports' AND (
    is_admin_or_pm() OR auth.uid()::text = (storage.foldername(name))[1]
  ));

CREATE POLICY "receipts_upload_own" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'receipts' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "receipts_read" ON storage.objects FOR SELECT
  USING (bucket_id = 'receipts' AND (
    is_admin_or_pm() OR auth.uid()::text = (storage.foldername(name))[1]
  ));

CREATE POLICY "avatars_public" ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

CREATE POLICY "avatars_upload_own" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);


-- ===== 002_admin_security.sql =====
-- ============================================================
-- Migration 002 — close privilege-escalation holes in profiles
-- Run AFTER supabase-migration.sql
--
-- Problem in v1: "profiles_update_own" let ANY user update their own
-- row, including `role`, `base_salary` and `is_active` (an engineer
-- could make themselves admin or raise their own salary).
-- "profiles_admin_all" also let project managers edit any profile.
-- ============================================================

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_admin_all"  ON public.profiles;

-- Admin only: create / edit / delete any profile
CREATE POLICY "profiles_admin_write" ON public.profiles
  FOR ALL USING (get_my_role() = 'admin') WITH CHECK (get_my_role() = 'admin');

-- Everyone: may edit only harmless columns of their own row
CREATE POLICY "profiles_update_own_safe" ON public.profiles
  FOR UPDATE USING (id = auth.uid()) WITH CHECK (id = auth.uid());

REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT  UPDATE (full_name, phone, avatar_url) ON public.profiles TO authenticated;
-- (Admins write through the admin-users Edge Function, which uses the
--  service role and therefore bypasses these column grants.)

-- Engineers must not approve their own expenses or edit amounts after submit.
DROP POLICY IF EXISTS "expenses_update" ON public.expenses;
CREATE POLICY "expenses_update_admin" ON public.expenses
  FOR UPDATE USING (is_admin_or_pm());

-- Only admins hand out custody money.
DROP POLICY IF EXISTS "wallet_admin_write" ON public.custody_wallets;
CREATE POLICY "wallet_admin_write" ON public.custody_wallets
  FOR ALL USING (get_my_role() = 'admin') WITH CHECK (get_my_role() = 'admin');

-- Allow project managers to see profiles (needed for assignment pickers)
-- while hiding salary data from engineers: expose a safe view.

-- Salary columns readable only by admin or the owner.
DROP POLICY IF EXISTS "profiles_read_all" ON public.profiles;
CREATE POLICY "profiles_read_scoped" ON public.profiles
  FOR SELECT USING (id = auth.uid() OR is_admin_or_pm());


-- ===== 003_server_side_rules.sql =====
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


-- ===== 004_features_and_hardening.sql =====
-- 004: profile e-mail, progress %, stage history, audit log, notifications, budget alerts, hardening.
-- Identical to the migration applied to the live "PWA" project.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email text;
UPDATE public.profiles p SET email = u.email FROM auth.users u WHERE u.id = p.id AND p.email IS NULL;

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS progress_pct smallint NOT NULL DEFAULT 0 CHECK (progress_pct BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS budget_alert_level smallint NOT NULL DEFAULT 0;
ALTER TABLE public.daily_reports
  ADD COLUMN IF NOT EXISTS progress_pct smallint CHECK (progress_pct BETWEEN 0 AND 100);

CREATE TABLE public.project_stage_history (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  stage      text NOT NULL,
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_stage_history_project ON public.project_stage_history(project_id, changed_at);
ALTER TABLE public.project_stage_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stage_history_read" ON public.project_stage_history FOR SELECT USING (is_admin_or_pm());
INSERT INTO public.project_stage_history (project_id, stage, changed_at) SELECT id, stage, created_at FROM public.projects;

CREATE TABLE public.audit_log (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id   uuid,
  action     text NOT NULL,
  entity     text NOT NULL,
  entity_id  text,
  details    jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_created ON public.audit_log(created_at DESC);
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_admin_read" ON public.audit_log FOR SELECT USING (get_my_role() = 'admin');

CREATE TABLE public.notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind       text NOT NULL,
  title      text NOT NULL,
  body       text,
  link       text,
  is_read    boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_user ON public.notifications(user_id, created_at DESC);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notif_read_own"   ON public.notifications FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "notif_update_own" ON public.notifications FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "notif_delete_own" ON public.notifications FOR DELETE USING (user_id = auth.uid());
REVOKE INSERT, UPDATE ON public.notifications FROM authenticated;
GRANT UPDATE (is_read) ON public.notifications TO authenticated;

CREATE OR REPLACE FUNCTION public.notify_managers(p_kind text, p_title text, p_body text, p_link text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.notifications (user_id, kind, title, body, link)
  SELECT id, p_kind, p_title, p_body, p_link FROM public.profiles
  WHERE role IN ('admin','project_manager') AND is_active;
$$;

CREATE OR REPLACE FUNCTION public.check_budget(p_project uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pr public.projects; spent numeric; lvl smallint;
BEGIN
  SELECT * INTO pr FROM public.projects WHERE id = p_project;
  IF pr.id IS NULL OR COALESCE(pr.budget, 0) <= 0 THEN RETURN; END IF;
  SELECT COALESCE(sum(amount), 0) INTO spent FROM public.expenses WHERE project_id = p_project AND status <> 'rejected';
  lvl := CASE WHEN spent >= pr.budget THEN 100 WHEN spent >= pr.budget * 0.8 THEN 80 ELSE 0 END;
  IF lvl > pr.budget_alert_level THEN
    PERFORM public.notify_managers('budget',
      CASE lvl WHEN 100 THEN 'تجاوز الميزانية: ' ELSE 'اقتراب من حد الميزانية: ' END || pr.title,
      'المصروف ' || round(spent)::text || ' من ' || round(pr.budget)::text || ' ج (' || round(spent / pr.budget * 100)::text || '%)',
      '/admin/projects/' || pr.id::text);
  END IF;
  IF lvl <> pr.budget_alert_level THEN
    UPDATE public.projects SET budget_alert_level = lvl WHERE id = p_project;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.trg_expense_notify() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE eng text; proj text;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'pending_review' THEN
    SELECT full_name INTO eng FROM public.profiles WHERE id = NEW.engineer_id;
    SELECT title INTO proj FROM public.projects WHERE id = NEW.project_id;
    PERFORM public.notify_managers('expense', 'مصروف جديد بانتظار الاعتماد',
      COALESCE(eng, '') || ' · ' || round(NEW.amount)::text || ' ج · ' || COALESCE(proj, ''), '/admin/expenses');
  END IF;
  IF NEW.project_id IS NOT NULL THEN PERFORM public.check_budget(NEW.project_id); END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_expense_notify_ins AFTER INSERT ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.trg_expense_notify();
CREATE TRIGGER trg_expense_notify_upd AFTER UPDATE OF status ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.trg_expense_notify();

CREATE OR REPLACE FUNCTION public.trg_project_budget() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN PERFORM public.check_budget(NEW.id); RETURN NEW; END $$;
CREATE TRIGGER trg_project_budget AFTER UPDATE OF budget ON public.projects FOR EACH ROW EXECUTE FUNCTION public.trg_project_budget();

CREATE OR REPLACE FUNCTION public.trg_report_after_insert() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE eng text; proj text;
BEGIN
  IF NEW.progress_pct IS NOT NULL THEN
    UPDATE public.projects SET progress_pct = NEW.progress_pct WHERE id = NEW.project_id;
  END IF;
  IF COALESCE(btrim(NEW.issues), '') <> '' THEN
    SELECT full_name INTO eng FROM public.profiles WHERE id = NEW.engineer_id;
    SELECT title INTO proj FROM public.projects WHERE id = NEW.project_id;
    PERFORM public.notify_managers('report', 'تقرير يومي يتضمن معوقات',
      COALESCE(eng, '') || ' · ' || COALESCE(proj, ''), '/admin/reports');
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_report_after_insert AFTER INSERT ON public.daily_reports FOR EACH ROW EXECUTE FUNCTION public.trg_report_after_insert();

CREATE OR REPLACE FUNCTION public.trg_stage_history() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.stage IS DISTINCT FROM OLD.stage THEN
    INSERT INTO public.project_stage_history (project_id, stage, changed_by) VALUES (NEW.id, NEW.stage, auth.uid());
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_stage_history AFTER INSERT OR UPDATE OF stage ON public.projects FOR EACH ROW EXECUTE FUNCTION public.trg_stage_history();

CREATE OR REPLACE FUNCTION public.audit_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE col text; d jsonb := '{}'::jsonb; o jsonb; n jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  o := CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) END;
  n := CASE WHEN TG_OP IN ('UPDATE','INSERT') THEN to_jsonb(NEW) END;
  FOREACH col IN ARRAY TG_ARGV LOOP
    IF TG_OP = 'UPDATE' THEN
      IF (o -> col) IS DISTINCT FROM (n -> col) THEN
        d := d || jsonb_build_object(col, jsonb_build_object('old', o -> col, 'new', n -> col));
      END IF;
    ELSE
      d := d || jsonb_build_object(col, COALESCE(n -> col, o -> col));
    END IF;
  END LOOP;
  IF TG_OP = 'UPDATE' AND d = '{}'::jsonb THEN RETURN NEW; END IF;
  INSERT INTO public.audit_log (actor_id, action, entity, entity_id, details)
  VALUES (auth.uid(), lower(TG_OP), TG_TABLE_NAME, COALESCE(n ->> 'id', o ->> 'id'), d);
  RETURN COALESCE(NEW, OLD);
END $$;

CREATE TRIGGER trg_audit_expenses AFTER UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.audit_change('status','amount');
CREATE TRIGGER trg_audit_payroll AFTER UPDATE OR DELETE ON public.payroll_records
  FOR EACH ROW EXECUTE FUNCTION public.audit_change('engineer_id','month','year','bonuses','advances','deductions','status','net_salary');
CREATE TRIGGER trg_audit_projects AFTER INSERT OR UPDATE OR DELETE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.audit_change('title','status','stage','budget','progress_pct','delivery_date');
CREATE TRIGGER trg_audit_wallets AFTER UPDATE ON public.custody_wallets
  FOR EACH ROW EXECUTE FUNCTION public.audit_change('total_disbursed');

ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- hardening (security advisor)
DROP VIEW IF EXISTS public.team_directory;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
REVOKE EXECUTE ON FUNCTION
  public.update_updated_at(), public.deduct_expense_from_wallet(), public.restore_expense_to_wallet(),
  public.expense_before_insert(), public.expense_status_change(), public.notify_managers(text,text,text,text),
  public.check_budget(uuid), public.trg_expense_notify(), public.trg_project_budget(),
  public.trg_report_after_insert(), public.trg_stage_history(), public.audit_change()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_my_role(), public.is_admin_or_pm() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_my_role(), public.is_admin_or_pm() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.distance_m(numeric,numeric,numeric,numeric) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.distance_m(numeric,numeric,numeric,numeric) TO authenticated;


-- ===== 005_client_portal.sql =====
-- 005: client portal. A 4th role "client" that sees ONLY curated data of its own projects.
-- Default-deny: no existing table policy matches a client, so every base table stays invisible.
-- The client reads through project_clients / client_updates (RLS) and the client_dashboard() RPC.

DO $$
DECLARE c text;
BEGIN
  SELECT conname INTO c FROM pg_constraint
   WHERE conrelid = 'public.profiles'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%site_engineer%';
  IF c IS NOT NULL THEN EXECUTE format('ALTER TABLE public.profiles DROP CONSTRAINT %I', c); END IF;
END $$;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'project_manager', 'site_engineer', 'client'));

CREATE TABLE public.project_clients (
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  client_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, client_id)
);
CREATE INDEX idx_project_clients_client ON public.project_clients(client_id);
ALTER TABLE public.project_clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pc_read" ON public.project_clients FOR SELECT USING (is_admin_or_pm() OR client_id = auth.uid());
CREATE POLICY "pc_admin_write" ON public.project_clients FOR ALL
  USING (get_my_role() = 'admin') WITH CHECK (get_my_role() = 'admin');

-- The curated daily update a manager publishes for the client (never the raw engineer report).
CREATE TABLE public.client_updates (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  date         date NOT NULL DEFAULT CURRENT_DATE,
  summary      text NOT NULL,
  next_steps   text,
  photos       text[] NOT NULL DEFAULT '{}',
  published_by uuid REFERENCES public.profiles(id),
  published_at timestamptz NOT NULL DEFAULT now(),
  emailed_at   timestamptz,
  UNIQUE (project_id, date)
);
CREATE INDEX idx_client_updates_project ON public.client_updates(project_id, date DESC);
ALTER TABLE public.client_updates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cu_manager_all" ON public.client_updates FOR ALL
  USING (is_admin_or_pm()) WITH CHECK (is_admin_or_pm());
CREATE POLICY "cu_client_read" ON public.client_updates FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.project_clients pc WHERE pc.project_id = client_updates.project_id AND pc.client_id = auth.uid()));
REVOKE UPDATE (emailed_at) ON public.client_updates FROM authenticated;

-- A client may open ONLY photos that a manager attached to a published update of the client's project.
CREATE POLICY "client_read_published_photos" ON storage.objects FOR SELECT USING (
  bucket_id = 'site-reports' AND EXISTS (
    SELECT 1 FROM public.client_updates cu
    JOIN public.project_clients pc ON pc.project_id = cu.project_id
    WHERE pc.client_id = auth.uid() AND storage.objects.name = ANY (cu.photos)));

-- Curated numbers for the client: no salaries, wallets, engineers, notes or other projects.
CREATE OR REPLACE FUNCTION public.client_dashboard() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', p.id, 'title', p.title, 'address', p.address, 'status', p.status, 'stage', p.stage,
    'progress_pct', p.progress_pct, 'start_date', p.start_date, 'delivery_date', p.delivery_date,
    'budget', p.budget,
    'spent', COALESCE((SELECT sum(e.amount) FROM expenses e WHERE e.project_id = p.id AND e.status = 'approved'), 0),
    'by_category', COALESCE((SELECT jsonb_agg(jsonb_build_object('category', x.category, 'total', x.t) ORDER BY x.t DESC)
        FROM (SELECT category, sum(amount) t FROM expenses WHERE project_id = p.id AND status = 'approved' GROUP BY category) x), '[]'::jsonb),
    'stages', COALESCE((SELECT jsonb_agg(jsonb_build_object('stage', h.stage, 'changed_at', h.changed_at) ORDER BY h.changed_at)
        FROM project_stage_history h WHERE h.project_id = p.id), '[]'::jsonb)
  ) ORDER BY p.created_at DESC), '[]'::jsonb)
  FROM projects p
  JOIN project_clients pc ON pc.project_id = p.id AND pc.client_id = auth.uid()
  WHERE EXISTS (SELECT 1 FROM profiles me WHERE me.id = auth.uid() AND me.role = 'client' AND me.is_active);
$$;
REVOKE EXECUTE ON FUNCTION public.client_dashboard() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.client_dashboard() TO authenticated;


-- ===== 006_client_extras.sql =====
-- 006: client payments, client requests (+ replies), stage ratings, weekly report log.

-- ============ payments schedule (what the client owes / has paid) ============
CREATE TABLE public.project_payments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  title      text NOT NULL,
  amount     numeric(14,2) NOT NULL CHECK (amount > 0),
  due_date   date NOT NULL,
  status     text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid')),
  paid_at    timestamptz,
  note       text,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_payments_project ON public.project_payments(project_id, due_date);
ALTER TABLE public.project_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pay_read" ON public.project_payments FOR SELECT USING (
  is_admin_or_pm() OR EXISTS (SELECT 1 FROM public.project_clients pc WHERE pc.project_id = project_payments.project_id AND pc.client_id = auth.uid()));
CREATE POLICY "pay_admin_write" ON public.project_payments FOR ALL
  USING (get_my_role() = 'admin') WITH CHECK (get_my_role() = 'admin');

CREATE OR REPLACE FUNCTION public.trg_payment_paid_at() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status = 'paid' AND NEW.paid_at IS NULL THEN NEW.paid_at := now(); END IF;
  IF NEW.status = 'pending' THEN NEW.paid_at := NULL; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_payment_paid_at BEFORE INSERT OR UPDATE OF status ON public.project_payments
  FOR EACH ROW EXECUTE FUNCTION public.trg_payment_paid_at();
CREATE TRIGGER trg_audit_payments AFTER INSERT OR UPDATE OR DELETE ON public.project_payments
  FOR EACH ROW EXECUTE FUNCTION public.audit_change('project_id','title','amount','due_date','status');

-- ============ client requests + conversation ============
CREATE TABLE public.client_requests (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  client_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind       text NOT NULL DEFAULT 'note' CHECK (kind IN ('note','complaint','change')),
  subject    text NOT NULL CHECK (char_length(subject) BETWEEN 1 AND 200),
  body       text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
  status     text NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','resolved')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_requests_project ON public.client_requests(project_id, created_at DESC);
ALTER TABLE public.client_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "req_read" ON public.client_requests FOR SELECT USING (is_admin_or_pm() OR client_id = auth.uid());
CREATE POLICY "req_client_insert" ON public.client_requests FOR INSERT WITH CHECK (
  client_id = auth.uid() AND status = 'open' AND EXISTS (
    SELECT 1 FROM public.project_clients pc WHERE pc.project_id = client_requests.project_id AND pc.client_id = auth.uid()));
CREATE POLICY "req_manager_update" ON public.client_requests FOR UPDATE USING (is_admin_or_pm()) WITH CHECK (is_admin_or_pm());
REVOKE UPDATE ON public.client_requests FROM authenticated;
GRANT UPDATE (status, updated_at) ON public.client_requests TO authenticated;
CREATE TRIGGER trg_requests_updated_at BEFORE UPDATE ON public.client_requests FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TABLE public.client_request_messages (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.client_requests(id) ON DELETE CASCADE,
  author_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body       text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_req_messages ON public.client_request_messages(request_id, created_at);
ALTER TABLE public.client_request_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "msg_read" ON public.client_request_messages FOR SELECT USING (
  is_admin_or_pm() OR EXISTS (SELECT 1 FROM public.client_requests r WHERE r.id = request_id AND r.client_id = auth.uid()));
CREATE POLICY "msg_insert" ON public.client_request_messages FOR INSERT WITH CHECK (
  author_id = auth.uid() AND (is_admin_or_pm() OR EXISTS (
    SELECT 1 FROM public.client_requests r WHERE r.id = request_id AND r.client_id = auth.uid())));

CREATE OR REPLACE FUNCTION public.trg_request_notify() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE who text; proj uuid; subj text;
BEGIN
  IF TG_TABLE_NAME = 'client_requests' THEN
    SELECT full_name INTO who FROM public.profiles WHERE id = NEW.client_id;
    PERFORM public.notify_managers('client', 'طلب جديد من العميل',
      COALESCE(who, '') || ' · ' || NEW.subject, '/admin/projects/' || NEW.project_id::text || '?tab=requests');
  ELSE
    -- only a client's message notifies managers; a manager's reply moves an open request to in_progress
    IF EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.author_id AND role = 'client') THEN
      SELECT r.project_id, r.subject INTO proj, subj FROM public.client_requests r WHERE r.id = NEW.request_id;
      SELECT full_name INTO who FROM public.profiles WHERE id = NEW.author_id;
      PERFORM public.notify_managers('client', 'رد جديد من العميل',
        COALESCE(who, '') || ' · ' || COALESCE(subj, ''), '/admin/projects/' || proj::text || '?tab=requests');
    ELSE
      UPDATE public.client_requests SET status = 'in_progress' WHERE id = NEW.request_id AND status = 'open';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_request_notify AFTER INSERT ON public.client_requests FOR EACH ROW EXECUTE FUNCTION public.trg_request_notify();
CREATE TRIGGER trg_message_notify AFTER INSERT ON public.client_request_messages FOR EACH ROW EXECUTE FUNCTION public.trg_request_notify();

-- ============ satisfaction rating per finished stage ============
CREATE TABLE public.stage_ratings (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  stage      text NOT NULL CHECK (stage IN ('foundation','masonry','plumbing','electrical','painting','final_finish')),
  client_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  rating     smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment    text CHECK (comment IS NULL OR char_length(comment) <= 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, stage, client_id)
);
ALTER TABLE public.stage_ratings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rating_read" ON public.stage_ratings FOR SELECT USING (is_admin_or_pm() OR client_id = auth.uid());
CREATE POLICY "rating_client_insert" ON public.stage_ratings FOR INSERT WITH CHECK (
  client_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.project_clients pc WHERE pc.project_id = stage_ratings.project_id AND pc.client_id = auth.uid()));

-- A stage can be rated only once it is finished (earlier than the current stage, or the project is completed).
CREATE OR REPLACE FUNCTION public.trg_rating_check() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE order_ text[] := ARRAY['foundation','masonry','plumbing','electrical','painting','final_finish']; pr public.projects; who text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT * INTO pr FROM public.projects WHERE id = NEW.project_id;
    IF NOT (array_position(order_, NEW.stage) < array_position(order_, pr.stage) OR (pr.status = 'completed' AND NEW.stage = pr.stage)) THEN
      RAISE EXCEPTION 'لا يمكن تقييم مرحلة لم تنتهِ بعد';
    END IF;
    IF NEW.rating <= 2 THEN
      SELECT full_name INTO who FROM public.profiles WHERE id = NEW.client_id;
      PERFORM public.notify_managers('client', 'تقييم منخفض من العميل',
        COALESCE(who, '') || ' · ' || pr.title || ' · ' || NEW.rating::text || '/5', '/admin/projects/' || pr.id::text || '?tab=requests');
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_rating_check BEFORE INSERT ON public.stage_ratings FOR EACH ROW EXECUTE FUNCTION public.trg_rating_check();

-- ============ weekly e-mail log (service role only; makes the weekly job idempotent) ============
CREATE TABLE public.weekly_report_log (
  client_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  sent_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (client_id, week_start)
);
ALTER TABLE public.weekly_report_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.weekly_report_log FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.trg_payment_paid_at(), public.trg_request_notify(), public.trg_rating_check() FROM PUBLIC, anon, authenticated;

-- ============ client_dashboard v2: + payment totals ============
CREATE OR REPLACE FUNCTION public.client_dashboard() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', p.id, 'title', p.title, 'address', p.address, 'status', p.status, 'stage', p.stage,
    'progress_pct', p.progress_pct, 'start_date', p.start_date, 'delivery_date', p.delivery_date,
    'budget', p.budget,
    'spent', COALESCE((SELECT sum(e.amount) FROM expenses e WHERE e.project_id = p.id AND e.status = 'approved'), 0),
    'by_category', COALESCE((SELECT jsonb_agg(jsonb_build_object('category', x.category, 'total', x.t) ORDER BY x.t DESC)
        FROM (SELECT category, sum(amount) t FROM expenses WHERE project_id = p.id AND status = 'approved' GROUP BY category) x), '[]'::jsonb),
    'stages', COALESCE((SELECT jsonb_agg(jsonb_build_object('stage', h.stage, 'changed_at', h.changed_at) ORDER BY h.changed_at)
        FROM project_stage_history h WHERE h.project_id = p.id), '[]'::jsonb),
    'pay_total', COALESCE((SELECT sum(amount) FROM project_payments WHERE project_id = p.id), 0),
    'pay_paid', COALESCE((SELECT sum(amount) FROM project_payments WHERE project_id = p.id AND status = 'paid'), 0),
    'next_due', (SELECT jsonb_build_object('title', n.title, 'amount', n.amount, 'due_date', n.due_date)
        FROM (SELECT title, amount, due_date FROM project_payments WHERE project_id = p.id AND status = 'pending' ORDER BY due_date LIMIT 1) n)
  ) ORDER BY p.created_at DESC), '[]'::jsonb)
  FROM projects p
  JOIN project_clients pc ON pc.project_id = p.id AND pc.client_id = auth.uid()
  WHERE EXISTS (SELECT 1 FROM profiles me WHERE me.id = auth.uid() AND me.role = 'client' AND me.is_active);
$$;


-- ===== 007_weekly_report_cron.sql =====
-- 007: weekly client e-mail. Needs the Edge Function send-weekly-report and the secrets
-- RESEND_API_KEY / MAIL_FROM / APP_URL. Replace ieaoirypglvgmklorame with your project ref.
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron;
-- Thursday 15:00 UTC (17:00-18:00 Cairo). The function is idempotent per client per week.
SELECT cron.schedule('weekly-client-report', '0 15 * * 4', $$
  SELECT net.http_post(
    url := 'https://ieaoirypglvgmklorame.supabase.co/functions/v1/send-weekly-report',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb);
$$);


-- ===== 008_push_and_approvals.sql =====
-- 008: Web Push subscriptions, client notifications, and client stage approvals.
-- Needs pg_net (enabled in 007). Replace ieaoirypglvgmklorame with your project ref if different.

-- ============ push subscriptions (written only through the RPCs below) ============
CREATE TABLE public.push_subscriptions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  endpoint   text NOT NULL UNIQUE,
  p256dh     text NOT NULL,
  auth       text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_push_user ON public.push_subscriptions(user_id);
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.push_subscriptions FROM anon, authenticated;

-- A device that signs in as someone else moves to the new user (shared phone).
CREATE OR REPLACE FUNCTION public.register_push(p_endpoint text, p_p256dh text, p_auth text, p_ua text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF char_length(p_endpoint) NOT BETWEEN 10 AND 2000 THEN RAISE EXCEPTION 'bad endpoint'; END IF;
  INSERT INTO public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  VALUES (auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_ua, 300))
  ON CONFLICT (endpoint) DO UPDATE
    SET user_id = auth.uid(), p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, user_agent = EXCLUDED.user_agent;
END $$;

CREATE OR REPLACE FUNCTION public.unregister_push(p_endpoint text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM public.push_subscriptions WHERE endpoint = p_endpoint AND user_id = auth.uid();
$$;
REVOKE EXECUTE ON FUNCTION public.register_push(text,text,text,text), public.unregister_push(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.register_push(text,text,text,text), public.unregister_push(text) TO authenticated;

-- ============ push delivery: every new notification is sent once by the send-push Edge Function ============
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS pushed_at timestamptz;

CREATE OR REPLACE FUNCTION public.trg_notification_push() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  BEGIN
    PERFORM net.http_post(
      url := 'https://ieaoirypglvgmklorame.supabase.co/functions/v1/send-push',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := jsonb_build_object('id', NEW.id));
  EXCEPTION WHEN OTHERS THEN NULL;  -- a push failure must never block the business transaction
  END;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_notification_push AFTER INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.trg_notification_push();

-- ============ notify one user (internal helper) ============
CREATE OR REPLACE FUNCTION public.notify_user(p_user uuid, p_kind text, p_title text, p_body text, p_link text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.notifications (user_id, kind, title, body, link)
  SELECT id, p_kind, p_title, p_body, p_link FROM public.profiles WHERE id = p_user AND is_active;
$$;

-- ============ clients are notified when a daily update is published ============
CREATE OR REPLACE FUNCTION public.trg_client_update_notify() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t text;
BEGIN
  SELECT title INTO t FROM public.projects WHERE id = NEW.project_id;
  INSERT INTO public.notifications (user_id, kind, title, body, link)
  SELECT pc.client_id, 'update', 'تقرير جديد عن مشروعك', COALESCE(t, ''), '/client/updates'
  FROM public.project_clients pc JOIN public.profiles pr ON pr.id = pc.client_id AND pr.is_active
  WHERE pc.project_id = NEW.project_id;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_client_update_notify AFTER INSERT ON public.client_updates
  FOR EACH ROW EXECUTE FUNCTION public.trg_client_update_notify();

-- ============ stage approvals (append-only record of what the client approved / objected to) ============
CREATE TABLE public.stage_approvals (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  stage      text NOT NULL CHECK (stage IN ('foundation','masonry','plumbing','electrical','painting','final_finish')),
  client_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  decision   text NOT NULL CHECK (decision IN ('approved','changes')),
  comment    text CHECK (comment IS NULL OR char_length(comment) <= 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT changes_need_comment CHECK (decision = 'approved' OR (comment IS NOT NULL AND char_length(btrim(comment)) > 0))
);
CREATE INDEX idx_approvals_project ON public.stage_approvals(project_id, stage, created_at DESC);
ALTER TABLE public.stage_approvals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "appr_read" ON public.stage_approvals FOR SELECT USING (is_admin_or_pm() OR client_id = auth.uid());
CREATE POLICY "appr_client_insert" ON public.stage_approvals FOR INSERT WITH CHECK (
  client_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.project_clients pc WHERE pc.project_id = stage_approvals.project_id AND pc.client_id = auth.uid()));
-- no UPDATE / DELETE policies: records can never be edited or removed through the API.

CREATE OR REPLACE FUNCTION public.trg_approval_check() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE order_ text[] := ARRAY['foundation','masonry','plumbing','electrical','painting','final_finish']; pr public.projects;
BEGIN
  SELECT * INTO pr FROM public.projects WHERE id = NEW.project_id;
  IF NOT (array_position(order_, NEW.stage) < array_position(order_, pr.stage) OR (pr.status = 'completed' AND NEW.stage = pr.stage)) THEN
    RAISE EXCEPTION 'لا يمكن اعتماد مرحلة لم تنتهِ بعد';
  END IF;
  IF EXISTS (SELECT 1 FROM public.stage_approvals a
             WHERE a.project_id = NEW.project_id AND a.stage = NEW.stage AND a.client_id = NEW.client_id AND a.decision = 'approved') THEN
    RAISE EXCEPTION 'تم اعتماد هذه المرحلة مسبقاً';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_approval_check BEFORE INSERT ON public.stage_approvals FOR EACH ROW EXECUTE FUNCTION public.trg_approval_check();

-- Approval notifies the managers. A "changes" decision also opens a request thread (kind 'change'),
-- and that request's own trigger is what notifies the managers.
CREATE OR REPLACE FUNCTION public.trg_approval_after() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE who text; t text; lbl text;
BEGIN
  lbl := CASE NEW.stage WHEN 'foundation' THEN 'التأسيس' WHEN 'masonry' THEN 'المحارة' WHEN 'plumbing' THEN 'السباكة'
         WHEN 'electrical' THEN 'الكهرباء' WHEN 'painting' THEN 'الدهانات' ELSE 'التشطيب النهائي' END;
  IF NEW.decision = 'approved' THEN
    SELECT full_name INTO who FROM public.profiles WHERE id = NEW.client_id;
    SELECT title INTO t FROM public.projects WHERE id = NEW.project_id;
    PERFORM public.notify_managers('client', 'العميل اعتمد مرحلة ' || lbl,
      COALESCE(who, '') || ' · ' || COALESCE(t, ''), '/admin/projects/' || NEW.project_id::text || '?tab=requests');
  ELSE
    INSERT INTO public.client_requests (project_id, client_id, kind, subject, body)
    VALUES (NEW.project_id, NEW.client_id, 'change', 'طلب تعديل على مرحلة ' || lbl, left(NEW.comment, 4000));
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_approval_after AFTER INSERT ON public.stage_approvals FOR EACH ROW EXECUTE FUNCTION public.trg_approval_after();
CREATE TRIGGER trg_audit_approvals AFTER INSERT ON public.stage_approvals
  FOR EACH ROW EXECUTE FUNCTION public.audit_change('project_id','stage','decision');

-- ============ a manager's reply now also notifies the client ============
CREATE OR REPLACE FUNCTION public.trg_request_notify() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE who text; proj uuid; subj text; owner uuid;
BEGIN
  IF TG_TABLE_NAME = 'client_requests' THEN
    SELECT full_name INTO who FROM public.profiles WHERE id = NEW.client_id;
    PERFORM public.notify_managers('client', 'طلب جديد من العميل',
      COALESCE(who, '') || ' · ' || NEW.subject, '/admin/projects/' || NEW.project_id::text || '?tab=requests');
  ELSE
    SELECT r.project_id, r.subject, r.client_id INTO proj, subj, owner FROM public.client_requests r WHERE r.id = NEW.request_id;
    IF EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.author_id AND role = 'client') THEN
      SELECT full_name INTO who FROM public.profiles WHERE id = NEW.author_id;
      PERFORM public.notify_managers('client', 'رد جديد من العميل',
        COALESCE(who, '') || ' · ' || COALESCE(subj, ''), '/admin/projects/' || proj::text || '?tab=requests');
    ELSE
      UPDATE public.client_requests SET status = 'in_progress' WHERE id = NEW.request_id AND status = 'open';
      PERFORM public.notify_user(owner, 'reply', 'رد جديد على طلبك', COALESCE(subj, ''), '/client/requests');
    END IF;
  END IF;
  RETURN NEW;
END $$;

REVOKE EXECUTE ON FUNCTION public.trg_notification_push(), public.notify_user(uuid,text,text,text,text),
  public.trg_client_update_notify(), public.trg_approval_check(), public.trg_approval_after(), public.trg_request_notify()
  FROM PUBLIC, anon, authenticated;


-- ===== 009_schedule_suppliers_inventory_finance.sql =====
-- 009: project schedule (milestones), suppliers, inventory, finance summary, client contact. All free (no extra services).

-- ============ schedule ============
CREATE TABLE public.project_milestones (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  title             text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  start_date        date NOT NULL,
  end_date          date NOT NULL,
  done_at           date,
  visible_to_client boolean NOT NULL DEFAULT true,
  late_notified_at  timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT milestone_dates CHECK (end_date >= start_date)
);
CREATE INDEX idx_milestones_project ON public.project_milestones(project_id, start_date);
ALTER TABLE public.project_milestones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ms_manager" ON public.project_milestones FOR ALL USING (is_admin_or_pm()) WITH CHECK (is_admin_or_pm());
CREATE POLICY "ms_engineer_read" ON public.project_milestones FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_milestones.project_id AND auth.uid() = ANY(p.assigned_engineer_ids)));
CREATE POLICY "ms_client_read" ON public.project_milestones FOR SELECT USING (
  visible_to_client AND EXISTS (SELECT 1 FROM public.project_clients pc WHERE pc.project_id = project_milestones.project_id AND pc.client_id = auth.uid()));

-- Daily: tell the managers about milestones that passed their end date without being finished (once per milestone).
CREATE OR REPLACE FUNCTION public.notify_late_milestones() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT m.id, m.title, m.end_date, p.id AS pid, p.title AS ptitle
    FROM public.project_milestones m JOIN public.projects p ON p.id = m.project_id
    WHERE m.done_at IS NULL AND m.late_notified_at IS NULL AND p.status = 'active'
      AND m.end_date < (now() AT TIME ZONE 'Africa/Cairo')::date
  LOOP
    PERFORM public.notify_managers('schedule', 'تأخر في الجدول: ' || r.ptitle,
      r.title || ' (كان مفترضاً ينتهي ' || to_char(r.end_date, 'YYYY-MM-DD') || ')', '/admin/projects/' || r.pid::text || '?tab=schedule');
    UPDATE public.project_milestones SET late_notified_at = now() WHERE id = r.id;
  END LOOP;
END $$;
REVOKE EXECUTE ON FUNCTION public.notify_late_milestones() FROM PUBLIC, anon, authenticated;
SELECT cron.schedule('late-milestones', '0 6 * * *', $$SELECT public.notify_late_milestones();$$);

-- ============ suppliers ============
CREATE TABLE public.suppliers (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  trade      text,
  phone      text,
  rating     smallint CHECK (rating BETWEEN 1 AND 5),
  notes      text,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.supplier_invoices (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id  uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  project_id   uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  amount       numeric(14,2) NOT NULL CHECK (amount > 0),
  paid_amount  numeric(14,2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  invoice_date date NOT NULL DEFAULT CURRENT_DATE,
  note         text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT paid_le_amount CHECK (paid_amount <= amount)
);
CREATE INDEX idx_supplier_invoices ON public.supplier_invoices(supplier_id, invoice_date DESC);
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sup_manager" ON public.suppliers FOR ALL USING (is_admin_or_pm()) WITH CHECK (is_admin_or_pm());
CREATE POLICY "supinv_manager" ON public.supplier_invoices FOR ALL USING (is_admin_or_pm()) WITH CHECK (is_admin_or_pm());
CREATE TRIGGER trg_audit_supplier_invoices AFTER INSERT OR UPDATE OR DELETE ON public.supplier_invoices
  FOR EACH ROW EXECUTE FUNCTION public.audit_change('supplier_id','project_id','amount','paid_amount');

-- ============ inventory ============
CREATE TABLE public.materials (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name       text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  unit       text NOT NULL DEFAULT 'قطعة',
  min_qty    numeric(12,2) NOT NULL DEFAULT 0 CHECK (min_qty >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, name)
);
CREATE TABLE public.stock_moves (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id uuid NOT NULL REFERENCES public.materials(id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('in','out','waste')),
  qty         numeric(12,2) NOT NULL CHECK (qty > 0),
  note        text,
  moved_by    uuid REFERENCES public.profiles(id) DEFAULT auth.uid(),
  moved_on    date NOT NULL DEFAULT CURRENT_DATE,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_stock_moves ON public.stock_moves(material_id, created_at DESC);
ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_moves ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mat_manager" ON public.materials FOR ALL USING (is_admin_or_pm()) WITH CHECK (is_admin_or_pm());
CREATE POLICY "mat_engineer_read" ON public.materials FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.projects p WHERE p.id = materials.project_id AND auth.uid() = ANY(p.assigned_engineer_ids)));
CREATE POLICY "mv_manager" ON public.stock_moves FOR ALL USING (is_admin_or_pm()) WITH CHECK (is_admin_or_pm());
CREATE POLICY "mv_engineer_read" ON public.stock_moves FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.materials m JOIN public.projects p ON p.id = m.project_id
          WHERE m.id = stock_moves.material_id AND auth.uid() = ANY(p.assigned_engineer_ids)));
CREATE POLICY "mv_engineer_insert" ON public.stock_moves FOR INSERT WITH CHECK (
  moved_by = auth.uid() AND EXISTS (SELECT 1 FROM public.materials m JOIN public.projects p ON p.id = m.project_id
          WHERE m.id = stock_moves.material_id AND auth.uid() = ANY(p.assigned_engineer_ids)));

CREATE OR REPLACE FUNCTION public.trg_stock_check() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE bal numeric;
BEGIN
  PERFORM 1 FROM public.materials WHERE id = NEW.material_id FOR UPDATE;   -- serialize concurrent moves
  SELECT COALESCE(SUM(CASE WHEN kind = 'in' THEN qty ELSE -qty END), 0) INTO bal FROM public.stock_moves WHERE material_id = NEW.material_id;
  IF NEW.kind <> 'in' AND NEW.qty > bal THEN
    RAISE EXCEPTION 'الكمية أكبر من الرصيد المتاح (%)', bal;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_stock_check BEFORE INSERT ON public.stock_moves FOR EACH ROW EXECUTE FUNCTION public.trg_stock_check();

CREATE OR REPLACE FUNCTION public.trg_stock_low() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE m public.materials; bal numeric;
BEGIN
  IF NEW.kind = 'in' THEN RETURN NEW; END IF;
  SELECT * INTO m FROM public.materials WHERE id = NEW.material_id;
  IF m.min_qty <= 0 THEN RETURN NEW; END IF;
  SELECT COALESCE(SUM(CASE WHEN kind = 'in' THEN qty ELSE -qty END), 0) INTO bal FROM public.stock_moves WHERE material_id = NEW.material_id;
  IF bal <= m.min_qty AND bal + NEW.qty > m.min_qty THEN          -- only when it crosses the minimum
    PERFORM public.notify_managers('stock', 'مخزون منخفض: ' || m.name,
      'الرصيد ' || bal::text || ' ' || m.unit || ' (الحد الأدنى ' || m.min_qty::text || ')', '/admin/projects/' || m.project_id::text || '?tab=inventory');
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_stock_low AFTER INSERT ON public.stock_moves FOR EACH ROW EXECUTE FUNCTION public.trg_stock_low();

CREATE VIEW public.material_stock WITH (security_invoker = true) AS
SELECT m.id, m.project_id, m.name, m.unit, m.min_qty,
  COALESCE(SUM(s.qty) FILTER (WHERE s.kind = 'in'), 0)    AS qty_in,
  COALESCE(SUM(s.qty) FILTER (WHERE s.kind = 'out'), 0)   AS qty_out,
  COALESCE(SUM(s.qty) FILTER (WHERE s.kind = 'waste'), 0) AS qty_waste,
  COALESCE(SUM(CASE WHEN s.kind = 'in' THEN s.qty ELSE -s.qty END), 0) AS balance
FROM public.materials m LEFT JOIN public.stock_moves s ON s.material_id = m.id
GROUP BY m.id;
REVOKE ALL ON public.material_stock FROM anon;

-- ============ finance summary (managers only) ============
CREATE OR REPLACE FUNCTION public.finance_summary()
RETURNS TABLE (project_id uuid, title text, client_name text, status text, budget numeric, spent numeric, pending numeric,
               client_total numeric, client_paid numeric, supplier_due numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin_or_pm() THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY
  SELECT p.id, p.title::text, p.client_name::text, p.status::text, COALESCE(p.budget, 0)::numeric,
    COALESCE((SELECT SUM(e.amount) FROM public.expenses e WHERE e.project_id = p.id AND e.status = 'approved'), 0)::numeric,
    COALESCE((SELECT SUM(e.amount) FROM public.expenses e WHERE e.project_id = p.id AND e.status = 'pending_review'), 0)::numeric,
    COALESCE((SELECT SUM(x.amount) FROM public.project_payments x WHERE x.project_id = p.id), 0)::numeric,
    COALESCE((SELECT SUM(x.amount) FROM public.project_payments x WHERE x.project_id = p.id AND x.status = 'paid'), 0)::numeric,
    COALESCE((SELECT SUM(s.amount - s.paid_amount) FROM public.supplier_invoices s WHERE s.project_id = p.id), 0)::numeric
  FROM public.projects p ORDER BY p.created_at DESC;
END $$;
REVOKE EXECUTE ON FUNCTION public.finance_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finance_summary() TO authenticated;

-- ============ who can the client contact (first assigned engineer with a phone) ============
CREATE OR REPLACE FUNCTION public.client_contact(p_project uuid)
RETURNS TABLE (full_name text, phone text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.project_clients pc WHERE pc.project_id = p_project AND pc.client_id = auth.uid()) THEN RETURN; END IF;
  RETURN QUERY
  SELECT pr.full_name::text, pr.phone::text
  FROM public.projects p JOIN public.profiles pr ON pr.id = ANY(p.assigned_engineer_ids)
  WHERE p.id = p_project AND pr.is_active AND pr.phone IS NOT NULL AND btrim(pr.phone) <> ''
  ORDER BY pr.created_at LIMIT 1;
END $$;
REVOKE EXECUTE ON FUNCTION public.client_contact(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.client_contact(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.trg_stock_check(), public.trg_stock_low() FROM PUBLIC, anon, authenticated;


-- ===== 010_documents.sql =====
-- 010: client documents and before/after photos (private Storage bucket "project-docs"). Free: Supabase Storage includes 1 GB.
CREATE TABLE public.project_documents (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  kind              text NOT NULL CHECK (kind IN ('document','before_after')),
  title             text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  file_path         text NOT NULL,
  file_path_after   text,
  visible_to_client boolean NOT NULL DEFAULT true,
  created_by        uuid DEFAULT auth.uid() REFERENCES public.profiles(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT after_needed CHECK (kind = 'document' OR file_path_after IS NOT NULL)
);
CREATE INDEX idx_pdocs_project ON public.project_documents(project_id, created_at DESC);
ALTER TABLE public.project_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pdoc_read" ON public.project_documents FOR SELECT USING (
  is_admin_or_pm() OR (visible_to_client AND EXISTS (
    SELECT 1 FROM public.project_clients pc WHERE pc.project_id = project_documents.project_id AND pc.client_id = auth.uid())));
CREATE POLICY "pdoc_manager_write" ON public.project_documents FOR ALL USING (is_admin_or_pm()) WITH CHECK (is_admin_or_pm());

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('project-docs', 'project-docs', false, 10485760,
  ARRAY['application/pdf','image/jpeg','image/png','image/webp',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "pdocs_manager_insert" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'project-docs' AND is_admin_or_pm());
CREATE POLICY "pdocs_manager_delete" ON storage.objects FOR DELETE USING (bucket_id = 'project-docs' AND is_admin_or_pm());
CREATE POLICY "pdocs_read" ON storage.objects FOR SELECT USING (
  bucket_id = 'project-docs' AND (
    is_admin_or_pm() OR EXISTS (
      SELECT 1 FROM public.project_documents d
      JOIN public.project_clients pc ON pc.project_id = d.project_id AND pc.client_id = auth.uid()
      WHERE d.visible_to_client AND storage.objects.name IN (d.file_path, d.file_path_after))));

CREATE TRIGGER trg_audit_project_documents AFTER INSERT OR DELETE ON public.project_documents
  FOR EACH ROW EXECUTE FUNCTION public.audit_change('project_id','kind','title');


-- ===== 011_supplier_payments_performance.sql =====
-- 011: supplier payments in instalments (history) + engineer performance report.

CREATE TABLE public.supplier_payments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.supplier_invoices(id) ON DELETE CASCADE,
  amount     numeric(14,2) NOT NULL CHECK (amount > 0),
  paid_on    date NOT NULL DEFAULT CURRENT_DATE,
  note       text,
  created_by uuid DEFAULT auth.uid() REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_supplier_payments_invoice ON public.supplier_payments(invoice_id, paid_on DESC);
ALTER TABLE public.supplier_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "supay_manager" ON public.supplier_payments FOR ALL USING (is_admin_or_pm()) WITH CHECK (is_admin_or_pm());

-- keep what was already recorded as paid
INSERT INTO public.supplier_payments (invoice_id, amount, paid_on, note)
SELECT id, paid_amount, invoice_date, 'رصيد سابق' FROM public.supplier_invoices WHERE paid_amount > 0;

-- a payment can never exceed what is still due
CREATE OR REPLACE FUNCTION public.trg_supplier_payment_check() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE inv public.supplier_invoices;
BEGIN
  SELECT * INTO inv FROM public.supplier_invoices WHERE id = NEW.invoice_id FOR UPDATE;
  IF NEW.amount > inv.amount - inv.paid_amount THEN
    RAISE EXCEPTION 'المبلغ أكبر من المتبقي على الفاتورة (%)', inv.amount - inv.paid_amount;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_supplier_payment_check BEFORE INSERT ON public.supplier_payments
  FOR EACH ROW EXECUTE FUNCTION public.trg_supplier_payment_check();

-- invoice.paid_amount = sum of its payments (always)
CREATE OR REPLACE FUNCTION public.trg_supplier_payment_sync() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE inv uuid := COALESCE(NEW.invoice_id, OLD.invoice_id);
BEGIN
  UPDATE public.supplier_invoices
     SET paid_amount = COALESCE((SELECT SUM(amount) FROM public.supplier_payments WHERE invoice_id = inv), 0)
   WHERE id = inv;
  RETURN NULL;
END $$;
CREATE TRIGGER trg_supplier_payment_sync AFTER INSERT OR DELETE ON public.supplier_payments
  FOR EACH ROW EXECUTE FUNCTION public.trg_supplier_payment_sync();
CREATE TRIGGER trg_audit_supplier_payments AFTER INSERT OR DELETE ON public.supplier_payments
  FOR EACH ROW EXECUTE FUNCTION public.audit_change('invoice_id','amount');
REVOKE EXECUTE ON FUNCTION public.trg_supplier_payment_check(), public.trg_supplier_payment_sync() FROM PUBLIC, anon, authenticated;

-- ============ engineer performance (managers, read-only) ============
CREATE OR REPLACE FUNCTION public.engineer_performance(p_from date, p_to date)
RETURNS TABLE (engineer_id uuid, full_name text, active_projects int, field_days int, verified_days int,
               report_days int, missing_reports int, avg_hours numeric,
               expenses_approved numeric, expenses_pending int, expenses_rejected int)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin_or_pm() THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY
  SELECT p.id, p.full_name::text,
    (SELECT count(*)::int FROM public.projects pr WHERE pr.status = 'active' AND p.id = ANY(pr.assigned_engineer_ids)),
    (SELECT count(DISTINCT a.date)::int FROM public.attendance a WHERE a.engineer_id = p.id AND a.date BETWEEN p_from AND p_to),
    (SELECT count(DISTINCT a.date)::int FROM public.attendance a WHERE a.engineer_id = p.id AND a.is_verified AND a.date BETWEEN p_from AND p_to),
    (SELECT count(DISTINCT r.date)::int FROM public.daily_reports r WHERE r.engineer_id = p.id AND r.date BETWEEN p_from AND p_to),
    (SELECT count(DISTINCT a.date)::int FROM public.attendance a
       WHERE a.engineer_id = p.id AND a.is_verified AND a.date BETWEEN p_from AND p_to
         AND NOT EXISTS (SELECT 1 FROM public.daily_reports r WHERE r.engineer_id = p.id AND r.date = a.date)),
    COALESCE((SELECT round(avg(extract(epoch FROM a.check_out_time - a.check_in_time) / 3600)::numeric, 1)
       FROM public.attendance a WHERE a.engineer_id = p.id AND a.check_out_time IS NOT NULL AND a.date BETWEEN p_from AND p_to), 0),
    COALESCE((SELECT sum(e.amount) FROM public.expenses e WHERE e.engineer_id = p.id AND e.status = 'approved'
       AND (e.created_at AT TIME ZONE 'Africa/Cairo')::date BETWEEN p_from AND p_to), 0)::numeric,
    (SELECT count(*)::int FROM public.expenses e WHERE e.engineer_id = p.id AND e.status = 'pending_review'
       AND (e.created_at AT TIME ZONE 'Africa/Cairo')::date BETWEEN p_from AND p_to),
    (SELECT count(*)::int FROM public.expenses e WHERE e.engineer_id = p.id AND e.status = 'rejected'
       AND (e.created_at AT TIME ZONE 'Africa/Cairo')::date BETWEEN p_from AND p_to)
  FROM public.profiles p WHERE p.role = 'site_engineer' AND p.is_active ORDER BY p.full_name;
END $$;
REVOKE EXECUTE ON FUNCTION public.engineer_performance(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.engineer_performance(date, date) TO authenticated;


-- ===== 012_project_whatsapp_group.sql =====
-- 012: رابط جروب واتساب لكل مشروع (يضبطه المدير، ويراه العميل المرتبط بالمشروع فقط)
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS whatsapp_group_url text;
ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_wa_group_chk;
ALTER TABLE public.projects ADD CONSTRAINT projects_wa_group_chk
  CHECK (whatsapp_group_url IS NULL OR whatsapp_group_url ~ '^https://chat\.whatsapp\.com/[A-Za-z0-9_-]{10,60}/?(\?.*)?$');

CREATE OR REPLACE FUNCTION public.client_group_link(p_project uuid)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.project_clients pc WHERE pc.project_id = p_project AND pc.client_id = auth.uid()) THEN RETURN NULL; END IF;
  RETURN (SELECT whatsapp_group_url FROM public.projects WHERE id = p_project);
END $$;
REVOKE EXECUTE ON FUNCTION public.client_group_link(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.client_group_link(uuid) TO authenticated;


-- ===== 013_boq_quotes_changes_subcontracts_reminders.sql =====
-- 013: مقايسة المشروع (BOQ) · عروض أسعار/فواتير · أوامر التغيير · مقاولو الباطن · تذكير التقارير

-- ============ 1) BOQ ============
CREATE TABLE public.boq_items (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  category   text NOT NULL CHECK (category IN ('materials','labor_wages','subcontractor','transportation')),
  title      text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 160),
  unit       text NOT NULL DEFAULT 'وحدة' CHECK (char_length(unit) BETWEEN 1 AND 20),
  qty        numeric(14,2) NOT NULL CHECK (qty > 0),
  unit_price numeric(14,2) NOT NULL CHECK (unit_price >= 0),
  done_qty   numeric(14,2) NOT NULL DEFAULT 0 CHECK (done_qty >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT boq_done_le_qty CHECK (done_qty <= qty)
);
CREATE INDEX idx_boq_project ON public.boq_items(project_id, category);
ALTER TABLE public.boq_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "boq_manager" ON public.boq_items FOR ALL USING (is_admin_or_pm()) WITH CHECK (is_admin_or_pm());
CREATE TRIGGER trg_audit_boq AFTER INSERT OR UPDATE OR DELETE ON public.boq_items
  FOR EACH ROW EXECUTE FUNCTION public.audit_change('project_id','title','qty','unit_price');

-- مقدَّر (من المقايسة) ↔ منفَّذ (كمية منجزة × السعر) ↔ فعلي (مصروفات معتمدة) لكل نوع تكلفة
CREATE OR REPLACE FUNCTION public.boq_summary(p_project uuid)
RETURNS TABLE (cat text, planned numeric, executed numeric, actual numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin_or_pm() THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY
  SELECT c.cat,
         COALESCE(b.planned, 0)::numeric, COALESCE(b.executed, 0)::numeric, COALESCE(e.actual, 0)::numeric
  FROM (VALUES ('materials'), ('labor_wages'), ('subcontractor'), ('transportation')) AS c(cat)
  LEFT JOIN (SELECT i.category AS k, SUM(i.qty * i.unit_price) AS planned, SUM(i.done_qty * i.unit_price) AS executed
             FROM public.boq_items i WHERE i.project_id = p_project GROUP BY i.category) b ON b.k = c.cat
  LEFT JOIN (SELECT x.category AS k, SUM(x.amount) AS actual
             FROM public.expenses x WHERE x.project_id = p_project AND x.status = 'approved' GROUP BY x.category) e ON e.k = c.cat;
END $$;
REVOKE EXECUTE ON FUNCTION public.boq_summary(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.boq_summary(uuid) TO authenticated;

-- ============ 2) عروض الأسعار والفواتير ============
CREATE SEQUENCE public.quote_seq;
CREATE TABLE public.quotes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind         text NOT NULL DEFAULT 'quote' CHECK (kind IN ('quote','invoice')),
  number       text UNIQUE,
  project_id   uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  client_name  text NOT NULL CHECK (char_length(client_name) BETWEEN 1 AND 120),
  client_phone text,
  issue_date   date NOT NULL DEFAULT CURRENT_DATE,
  valid_until  date,
  discount     numeric(14,2) NOT NULL DEFAULT 0 CHECK (discount >= 0),
  tax_pct      numeric(5,2) NOT NULL DEFAULT 0 CHECK (tax_pct BETWEEN 0 AND 100),
  notes        text,
  status       text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','accepted','rejected','paid')),
  created_by   uuid DEFAULT auth.uid() REFERENCES public.profiles(id),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.quote_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id    uuid NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  description text NOT NULL CHECK (char_length(description) BETWEEN 1 AND 300),
  unit        text NOT NULL DEFAULT 'وحدة',
  qty         numeric(14,2) NOT NULL CHECK (qty > 0),
  unit_price  numeric(14,2) NOT NULL CHECK (unit_price >= 0),
  sort        int NOT NULL DEFAULT 0
);
CREATE INDEX idx_quote_items ON public.quote_items(quote_id, sort);
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "quotes_manager" ON public.quotes FOR ALL USING (is_admin_or_pm()) WITH CHECK (is_admin_or_pm());
CREATE POLICY "quote_items_manager" ON public.quote_items FOR ALL USING (is_admin_or_pm()) WITH CHECK (is_admin_or_pm());

CREATE OR REPLACE FUNCTION public.trg_quote_number() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.number IS NULL OR NEW.number = '' THEN
    NEW.number := CASE WHEN NEW.kind = 'invoice' THEN 'INV-' ELSE 'Q-' END
                  || to_char(NEW.issue_date, 'YYYY') || '-' || lpad(nextval('public.quote_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_quote_number BEFORE INSERT ON public.quotes FOR EACH ROW EXECUTE FUNCTION public.trg_quote_number();
CREATE TRIGGER trg_audit_quotes AFTER INSERT OR UPDATE OR DELETE ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.audit_change('number','client_name','status');

-- ============ 3) أوامر التغيير ============
CREATE TABLE public.change_orders (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  title       text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 160),
  description text,
  cost_delta  numeric(14,2) NOT NULL DEFAULT 0,
  days_delta  int NOT NULL DEFAULT 0,
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  client_note text,
  decided_by  uuid REFERENCES public.profiles(id),
  decided_at  timestamptz,
  created_by  uuid DEFAULT auth.uid() REFERENCES public.profiles(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_change_orders ON public.change_orders(project_id, created_at DESC);
ALTER TABLE public.change_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "co_manager" ON public.change_orders FOR ALL USING (is_admin_or_pm()) WITH CHECK (is_admin_or_pm());
CREATE POLICY "co_client_read" ON public.change_orders FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.project_clients pc WHERE pc.project_id = change_orders.project_id AND pc.client_id = auth.uid()));
CREATE TRIGGER trg_audit_change_orders AFTER INSERT OR UPDATE OR DELETE ON public.change_orders
  FOR EACH ROW EXECUTE FUNCTION public.audit_change('project_id','title','cost_delta','status');

-- بعد قرار العميل: لا يتغير المبلغ ولا العنوان ولا الحالة، والحالة لا تتغير إلا عبر دالة القرار
CREATE OR REPLACE FUNCTION public.trg_change_order_lock() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'pending' THEN RAISE EXCEPTION 'لا يمكن حذف أمر تغيير تم البت فيه'; END IF;
    RETURN OLD;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND COALESCE(current_setting('app.co_decide', true), '') <> '1' THEN
    RAISE EXCEPTION 'قرار أمر التغيير يصدر من العميل فقط';
  END IF;
  IF OLD.status <> 'pending' AND COALESCE(current_setting('app.co_decide', true), '') <> '1'
     AND (NEW.title, NEW.description, NEW.cost_delta, NEW.days_delta) IS DISTINCT FROM (OLD.title, OLD.description, OLD.cost_delta, OLD.days_delta) THEN
    RAISE EXCEPTION 'لا يمكن تعديل أمر تغيير تم البت فيه';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_change_order_lock BEFORE UPDATE OR DELETE ON public.change_orders
  FOR EACH ROW EXECUTE FUNCTION public.trg_change_order_lock();

CREATE OR REPLACE FUNCTION public.trg_change_order_notify() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t text;
BEGIN
  SELECT title INTO t FROM public.projects WHERE id = NEW.project_id;
  INSERT INTO public.notifications (user_id, kind, title, body, link)
  SELECT pc.client_id, 'change', 'طلب اعتماد تغيير في مشروعك', COALESCE(t, '') || ' — ' || NEW.title, '/client'
  FROM public.project_clients pc JOIN public.profiles pr ON pr.id = pc.client_id AND pr.is_active
  WHERE pc.project_id = NEW.project_id;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_change_order_notify AFTER INSERT ON public.change_orders
  FOR EACH ROW EXECUTE FUNCTION public.trg_change_order_notify();

CREATE OR REPLACE FUNCTION public.decide_change_order(p_id uuid, p_approve boolean, p_note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE co public.change_orders; t text;
BEGIN
  SELECT * INTO co FROM public.change_orders WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM public.project_clients pc WHERE pc.project_id = co.project_id AND pc.client_id = auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF co.status <> 'pending' THEN RAISE EXCEPTION 'تم البت في هذا الطلب مسبقاً'; END IF;
  PERFORM set_config('app.co_decide', '1', true);
  UPDATE public.change_orders
     SET status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
         client_note = NULLIF(left(btrim(COALESCE(p_note, '')), 500), ''),
         decided_by = auth.uid(), decided_at = now()
   WHERE id = p_id;
  SELECT title INTO t FROM public.projects WHERE id = co.project_id;
  PERFORM public.notify_managers('client',
    CASE WHEN p_approve THEN 'العميل وافق على تغيير' ELSE 'العميل رفض تغييراً' END,
    COALESCE(t, '') || ' — ' || co.title, '/admin/projects/' || co.project_id::text || '?tab=changes');
END $$;
REVOKE EXECUTE ON FUNCTION public.decide_change_order(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decide_change_order(uuid, boolean, text) TO authenticated;

-- ============ 4) مقاولو الباطن ============
CREATE TABLE public.subcontracts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name          text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  trade         text,
  phone         text,
  agreed_amount numeric(14,2) NOT NULL CHECK (agreed_amount > 0),
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.subcontract_payments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subcontract_id uuid NOT NULL REFERENCES public.subcontracts(id) ON DELETE CASCADE,
  amount         numeric(14,2) NOT NULL CHECK (amount > 0),
  paid_on        date NOT NULL DEFAULT CURRENT_DATE,
  note           text,
  created_by     uuid DEFAULT auth.uid() REFERENCES public.profiles(id),
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_subcontracts_project ON public.subcontracts(project_id);
CREATE INDEX idx_subcontract_payments ON public.subcontract_payments(subcontract_id, paid_on DESC);
ALTER TABLE public.subcontracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subcontract_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "subc_manager" ON public.subcontracts FOR ALL USING (is_admin_or_pm()) WITH CHECK (is_admin_or_pm());
CREATE POLICY "subcpay_manager" ON public.subcontract_payments FOR ALL USING (is_admin_or_pm()) WITH CHECK (is_admin_or_pm());

CREATE OR REPLACE FUNCTION public.trg_subcontract_payment_check() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE agreed numeric; paid numeric;
BEGIN
  SELECT agreed_amount INTO agreed FROM public.subcontracts WHERE id = NEW.subcontract_id FOR UPDATE;
  SELECT COALESCE(SUM(amount), 0) INTO paid FROM public.subcontract_payments WHERE subcontract_id = NEW.subcontract_id;
  IF NEW.amount > agreed - paid THEN
    RAISE EXCEPTION 'المبلغ أكبر من المتبقي على المقاول (%)', agreed - paid;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_subcontract_payment_check BEFORE INSERT ON public.subcontract_payments
  FOR EACH ROW EXECUTE FUNCTION public.trg_subcontract_payment_check();
CREATE TRIGGER trg_audit_subcontracts AFTER INSERT OR UPDATE OR DELETE ON public.subcontracts
  FOR EACH ROW EXECUTE FUNCTION public.audit_change('project_id','name','agreed_amount');
CREATE TRIGGER trg_audit_subcontract_payments AFTER INSERT OR DELETE ON public.subcontract_payments
  FOR EACH ROW EXECUTE FUNCTION public.audit_change('subcontract_id','amount');

-- ============ 5) تذكير التقارير ============
-- p_managers=false: يذكّر كل مهندس سجّل حضوراً اليوم ولم يكتب تقريراً لنفس المشروع
-- p_managers=true : ملخص للإدارة بمن لم يكتب بعد
CREATE OR REPLACE FUNCTION public.remind_missing_reports(p_managers boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; names text; n int; today date := (now() AT TIME ZONE 'Africa/Cairo')::date;
BEGIN
  IF NOT p_managers THEN
    FOR r IN
      SELECT DISTINCT a.engineer_id, a.project_id, p.title
      FROM public.attendance a JOIN public.projects p ON p.id = a.project_id
      JOIN public.profiles e ON e.id = a.engineer_id AND e.is_active
      WHERE a.date = today
        AND NOT EXISTS (SELECT 1 FROM public.daily_reports d WHERE d.engineer_id = a.engineer_id AND d.project_id = a.project_id AND d.date = today)
    LOOP
      PERFORM public.notify_user(r.engineer_id, 'report', 'لم تسجّل تقرير اليوم', 'مشروع: ' || r.title, '/app/report');
    END LOOP;
  ELSE
    SELECT count(DISTINCT a.engineer_id), string_agg(DISTINCT e.full_name, '، ')
      INTO n, names
    FROM public.attendance a JOIN public.profiles e ON e.id = a.engineer_id AND e.is_active
    WHERE a.date = today
      AND NOT EXISTS (SELECT 1 FROM public.daily_reports d WHERE d.engineer_id = a.engineer_id AND d.project_id = a.project_id AND d.date = today);
    IF n > 0 THEN
      PERFORM public.notify_managers('report', n || ' مهندس لم يسجّل تقرير اليوم', left(names, 200), '/admin/reports');
    END IF;
  END IF;
END $$;
REVOKE EXECUTE ON FUNCTION public.remind_missing_reports(boolean) FROM PUBLIC, anon, authenticated;
-- 15:00 UTC ≈ 5-6 مساءً بتوقيت القاهرة للمهندس، و19:00 UTC ≈ 9-10 مساءً للإدارة
SELECT cron.schedule('remind-reports-engineers', '0 15 * * *', $$SELECT public.remind_missing_reports(false);$$);
SELECT cron.schedule('remind-reports-managers',  '0 19 * * *', $$SELECT public.remind_missing_reports(true);$$);

REVOKE EXECUTE ON FUNCTION public.trg_quote_number(), public.trg_change_order_lock(), public.trg_change_order_notify(),
  public.trg_subcontract_payment_check() FROM PUBLIC, anon, authenticated;


-- ===== 014_project_finance_group.sql =====
-- 014: جروب واتساب ثاني لكل مشروع: جروب المالية والدفعات (يضبطه المدير، ويراه العميل المرتبط بالمشروع فقط)
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS whatsapp_finance_group_url text;
ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_wa_finance_group_chk;
ALTER TABLE public.projects ADD CONSTRAINT projects_wa_finance_group_chk
  CHECK (whatsapp_finance_group_url IS NULL OR whatsapp_finance_group_url ~ '^https://chat\.whatsapp\.com/[A-Za-z0-9_-]{10,60}/?(\?.*)?$');

CREATE OR REPLACE FUNCTION public.client_finance_group_link(p_project uuid)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.project_clients pc WHERE pc.project_id = p_project AND pc.client_id = auth.uid()) THEN RETURN NULL; END IF;
  RETURN (SELECT whatsapp_finance_group_url FROM public.projects WHERE id = p_project);
END $$;
REVOKE EXECUTE ON FUNCTION public.client_finance_group_link(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.client_finance_group_link(uuid) TO authenticated;


-- ===== 015_progress_managers_only.sql =====
-- 015: نسبة إنجاز المشروع يحدّثها المدير ومدير المشاريع فقط. التقرير اليومي لم يعد يغيّرها.
CREATE OR REPLACE FUNCTION public.trg_report_after_insert() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE eng text; proj text;
BEGIN
  IF COALESCE(btrim(NEW.issues), '') <> '' THEN
    SELECT full_name INTO eng FROM public.profiles WHERE id = NEW.engineer_id;
    SELECT title INTO proj FROM public.projects WHERE id = NEW.project_id;
    PERFORM public.notify_managers('report', 'تقرير يومي يتضمن معوقات',
      COALESCE(eng, '') || ' · ' || COALESCE(proj, ''), '/admin/reports');
  END IF;
  RETURN NEW;
END $$;


-- ===== 016_lock_payroll_and_cron_secret.sql =====
-- 016: (1) المرتبات: المدير وصاحب السجل فقط (مدير المشاريع لم يعد يقرأها)
--      (2) سر مشترك بين pg_cron ودالة send-weekly-report حتى لا يستدعيها أحد من الخارج
DROP POLICY IF EXISTS payroll_read ON public.payroll_records;
CREATE POLICY payroll_read ON public.payroll_records FOR SELECT
  USING ((SELECT public.get_my_role()) = 'admin' OR engineer_id = (SELECT auth.uid()));

CREATE TABLE IF NOT EXISTS public.cron_secret (id boolean PRIMARY KEY DEFAULT true CHECK (id), value text NOT NULL);
ALTER TABLE public.cron_secret ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cron_secret FROM anon, authenticated;
INSERT INTO public.cron_secret (id, value)
  VALUES (true, replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
  ON CONFLICT (id) DO NOTHING;

-- ملاحظة: استبدل YOUR_PROJECT_REF بمرجع مشروع الشركة (سكربت new-company.mjs يفعل ذلك تلقائياً)
SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'weekly-client-report'),
  command := $cmd$
  SELECT net.http_post(
    url := 'https://ieaoirypglvgmklorame.supabase.co/functions/v1/send-weekly-report',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (SELECT value FROM public.cron_secret WHERE id)),
    body := '{}'::jsonb);
  $cmd$);


-- ===== 017_custody_returns.sql =====
-- 017: custody returns (مرتجع العهدة).
-- An engineer records money coming back to his custody (e.g. returned materials refunded in cash).
-- The amount is added to his wallet immediately, like an expense is deducted immediately.
-- A manager then approves it, or rejects it, which takes the amount back out of the wallet.
CREATE TABLE public.custody_returns (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  custody_id  uuid NOT NULL REFERENCES public.custody_wallets(id) ON DELETE CASCADE,
  engineer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  project_id  uuid REFERENCES public.projects(id),
  amount      numeric(12,2) NOT NULL CHECK (amount > 0),
  description text,
  receipt_url text,
  status      text NOT NULL DEFAULT 'pending_review' CHECK (status IN ('approved','pending_review','rejected')),
  reviewed_by uuid REFERENCES public.profiles(id),
  reviewed_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_returns_engineer ON public.custody_returns(engineer_id, created_at DESC);
CREATE INDEX idx_returns_status   ON public.custody_returns(status);
ALTER TABLE public.custody_returns ENABLE ROW LEVEL SECURITY;

CREATE POLICY returns_read   ON public.custody_returns FOR SELECT TO authenticated
  USING (is_admin_or_pm() OR engineer_id = auth.uid());
CREATE POLICY returns_insert ON public.custody_returns FOR INSERT TO authenticated
  WITH CHECK (engineer_id = auth.uid() AND get_my_role() = 'site_engineer');
CREATE POLICY returns_review ON public.custody_returns FOR UPDATE TO authenticated
  USING (is_admin_or_pm()) WITH CHECK (is_admin_or_pm());
-- Managers may change only the status; everything else is fixed once recorded.
REVOKE ALL ON public.custody_returns FROM anon, authenticated;
GRANT SELECT, INSERT ON public.custody_returns TO authenticated;
GRANT UPDATE (status) ON public.custody_returns TO authenticated;

CREATE OR REPLACE FUNCTION public.return_before_insert() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  SELECT id INTO NEW.custody_id FROM public.custody_wallets WHERE engineer_id = NEW.engineer_id;
  IF NEW.custody_id IS NULL THEN RAISE EXCEPTION 'لا توجد عهدة لهذا المهندس'; END IF;
  NEW.status := 'pending_review'; NEW.reviewed_by := NULL; NEW.reviewed_at := NULL;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_return_before_insert BEFORE INSERT ON public.custody_returns
  FOR EACH ROW EXECUTE FUNCTION public.return_before_insert();

CREATE OR REPLACE FUNCTION public.return_after_insert() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE eng text; proj text;
BEGIN
  UPDATE public.custody_wallets SET current_balance = current_balance + NEW.amount WHERE id = NEW.custody_id;
  SELECT full_name INTO eng FROM public.profiles WHERE id = NEW.engineer_id;
  SELECT title INTO proj FROM public.projects WHERE id = NEW.project_id;
  PERFORM public.notify_managers('return', 'مرتجع عهدة بانتظار الاعتماد',
    COALESCE(eng, '') || ' · ' || round(NEW.amount)::text || ' ج · ' || COALESCE(proj, ''), '/admin/expenses');
  RETURN NEW;
END $$;
CREATE TRIGGER trg_return_after_insert AFTER INSERT ON public.custody_returns
  FOR EACH ROW EXECUTE FUNCTION public.return_after_insert();

-- Rejecting takes the money back out of the wallet; un-rejecting adds it again.
CREATE OR REPLACE FUNCTION public.return_status_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;
  IF NEW.status = 'rejected' THEN
    UPDATE public.custody_wallets SET current_balance = current_balance - OLD.amount WHERE id = OLD.custody_id;
  ELSIF OLD.status = 'rejected' THEN
    UPDATE public.custody_wallets SET current_balance = current_balance + OLD.amount WHERE id = OLD.custody_id;
  END IF;
  NEW.reviewed_by := auth.uid(); NEW.reviewed_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER trg_return_status_change BEFORE UPDATE OF status ON public.custody_returns
  FOR EACH ROW EXECUTE FUNCTION public.return_status_change();

REVOKE EXECUTE ON FUNCTION public.return_before_insert(), public.return_after_insert(), public.return_status_change() FROM PUBLIC, anon, authenticated;
