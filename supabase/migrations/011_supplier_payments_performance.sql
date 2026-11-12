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
