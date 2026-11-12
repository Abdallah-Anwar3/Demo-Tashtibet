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
