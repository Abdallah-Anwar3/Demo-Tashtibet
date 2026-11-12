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
