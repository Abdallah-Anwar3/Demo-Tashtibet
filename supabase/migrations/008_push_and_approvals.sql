-- 008: Web Push subscriptions, client notifications, and client stage approvals.
-- Needs pg_net (enabled in 007). Replace rragdyhfitbckoznomxm with your project ref if different.

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
      url := 'https://rragdyhfitbckoznomxm.supabase.co/functions/v1/send-push',
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
