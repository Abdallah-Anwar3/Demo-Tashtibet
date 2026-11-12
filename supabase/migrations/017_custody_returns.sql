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
