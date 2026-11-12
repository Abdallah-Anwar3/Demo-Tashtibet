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
