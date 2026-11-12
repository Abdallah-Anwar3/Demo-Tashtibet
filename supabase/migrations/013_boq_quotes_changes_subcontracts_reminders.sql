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
