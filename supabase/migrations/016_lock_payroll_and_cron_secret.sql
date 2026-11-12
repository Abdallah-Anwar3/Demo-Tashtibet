-- 016: (1) المرتبات: المدير وصاحب السجل فقط (مدير المشاريع لم يعد يقرأها)
--      (2) سر مشترك بين pg_cron ودالة send-weekly-report حتى لا يستدعيها أحد من الخارج
DROP POLICY IF EXISTS payroll_read ON public.payroll_records;
CREATE POLICY payroll_read ON public.payroll_records FOR SELECT
  USING ((SELECT public.get_my_role()) = 'admin' OR engineer_id = (SELECT auth.uid()));

CREATE TABLE IF NOT EXISTS public.cron_secret (id boolean PRIMARY KEY DEFAULT true CHECK (id), value text NOT NULL);
ALTER TABLE public.cron_secret ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cron_secret FROM anon, authenticated;
INSERT INTO public.cron_secret (id, value)
  VALUES (true, replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
  ON CONFLICT (id) DO NOTHING;

-- ملاحظة: استبدل YOUR_PROJECT_REF بمرجع مشروع الشركة (سكربت new-company.mjs يفعل ذلك تلقائياً)
SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'weekly-client-report'),
  command := $cmd$
  SELECT net.http_post(
    url := 'https://rragdyhfitbckoznomxm.supabase.co/functions/v1/send-weekly-report',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (SELECT value FROM public.cron_secret WHERE id)),
    body := '{}'::jsonb);
  $cmd$);
