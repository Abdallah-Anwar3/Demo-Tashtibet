-- 007: weekly client e-mail. Needs the Edge Function send-weekly-report and the secrets
-- RESEND_API_KEY / MAIL_FROM / APP_URL. Replace rragdyhfitbckoznomxm with your project ref.
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron;
-- Thursday 15:00 UTC (17:00-18:00 Cairo). The function is idempotent per client per week.
SELECT cron.schedule('weekly-client-report', '0 15 * * 4', $$
  SELECT net.http_post(
    url := 'https://rragdyhfitbckoznomxm.supabase.co/functions/v1/send-weekly-report',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb);
$$);
