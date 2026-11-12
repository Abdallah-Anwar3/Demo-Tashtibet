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
