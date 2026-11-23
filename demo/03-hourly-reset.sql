-- Run in the DEMO Supabase project only, if 02-demo-seed.sql was already run with the nightly schedule.
-- Moves the demo reset from once a night to the start of every hour. Safe to run more than once.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.demo_marker) THEN RAISE EXCEPTION 'not a demo database'; END IF;
END $$;
SELECT cron.unschedule('demo-reset') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'demo-reset');
SELECT cron.schedule('demo-reset', '0 * * * *', 'SELECT public.demo_reset()');
-- check: should show one row with schedule '0 * * * *'
SELECT jobname, schedule FROM cron.job WHERE jobname = 'demo-reset';
