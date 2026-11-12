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
