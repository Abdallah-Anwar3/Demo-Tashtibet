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
