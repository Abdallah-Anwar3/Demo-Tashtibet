-- Demo environment: fake accounts + fake data + nightly reset.
-- Run ONLY in the separate Demo Supabase project, after all migrations (see demo/README.md).
-- Everything here is invented. Demo password for all accounts: Demo@2026!

-- Safety marker: demo_reset() refuses to run in any database that lacks this row.
CREATE TABLE IF NOT EXISTS public.demo_marker (id boolean PRIMARY KEY DEFAULT true CHECK (id));
INSERT INTO public.demo_marker VALUES (true) ON CONFLICT DO NOTHING;
ALTER TABLE public.demo_marker ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.demo_seed() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, extensions AS $$
DECLARE
  pw text := 'Demo@2026!';
  u_admin uuid := gen_random_uuid(); u_pm uuid := gen_random_uuid();
  u_e1 uuid := gen_random_uuid();    u_e2 uuid := gen_random_uuid(); u_cl uuid := gen_random_uuid();
  p1 uuid := gen_random_uuid(); p2 uuid := gen_random_uuid(); p3 uuid := gen_random_uuid();
  w1 uuid; w2 uuid; sup1 uuid := gen_random_uuid(); sup2 uuid := gen_random_uuid();
  inv1 uuid := gen_random_uuid(); inv2 uuid := gen_random_uuid();
  m1 uuid := gen_random_uuid(); m2 uuid := gen_random_uuid();
  q1 uuid := gen_random_uuid(); sc1 uuid := gen_random_uuid(); rq1 uuid := gen_random_uuid();
  d int; mo int := extract(month FROM (current_date - interval '1 month'))::int;
  yr int := extract(year FROM (current_date - interval '1 month'))::int;
  rec record; x uuid;
BEGIN
  -- ---------- accounts ----------
  FOR rec IN SELECT * FROM (VALUES
      (u_admin, 'admin@demo.test',   'أحمد المدير (تجريبي)',    'admin',          0::numeric,    0::numeric),
      (u_pm,    'manager@demo.test', 'سارة مدير المشاريع',      'project_manager', 14000,        0),
      (u_e1,    'eng1@demo.test',    'محمود مهندس الموقع',       'site_engineer',   9000,         150),
      (u_e2,    'eng2@demo.test',    'هبة مهندسة الموقع',        'site_engineer',   8500,         150),
      (u_cl,    'client@demo.test',  'خالد السيد (عميل)',        'client',          0,            0)
    ) AS t(id, email, name, role, sal, rate) LOOP
    INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
    VALUES ('00000000-0000-0000-0000-000000000000', rec.id, 'authenticated', 'authenticated', rec.email,
      crypt(pw, gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');
    INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    VALUES (gen_random_uuid(), rec.id, rec.id::text, jsonb_build_object('sub', rec.id::text, 'email', rec.email, 'email_verified', true), 'email', now(), now(), now());
    INSERT INTO public.profiles (id, full_name, role, base_salary, site_allowance_rate, email, is_active, phone)
    VALUES (rec.id, rec.name, rec.role, rec.sal, rec.rate, rec.email, true, '010' || lpad((random()*99999999)::int::text, 8, '0'));
  END LOOP;

  -- ---------- projects ----------
  INSERT INTO public.projects (id, title, client_name, address, location_lat, location_lng, geofence_radius_m, status, stage, assigned_engineer_ids, budget, start_date, delivery_date, notes, created_by, progress_pct) VALUES
   (p1, 'فيلا التجمع الخامس', 'خالد السيد',  'التجمع الخامس، القاهرة الجديدة', 30.0074, 31.4913, 200, 'active', 'electrical',  ARRAY[u_e1, u_e2], 850000, current_date - 70, current_date + 50, 'فيلا دورين، تشطيب كامل', u_pm, 55),
   (p2, 'شقة الشيخ زايد',     'منى عبدالله', 'الحي الثامن، الشيخ زايد',        30.0131, 30.9876, 150, 'active', 'painting',    ARRAY[u_e2],       320000, current_date - 95, current_date + 20, 'شقة 180 متر', u_pm, 80),
   (p3, 'مكتب مصر الجديدة',   'شركة النيل',  'شارع الحجاز، مصر الجديدة',       30.0900, 31.3400, 150, 'active', 'foundation',  ARRAY[u_e1],       450000, current_date - 15, current_date + 110, 'مكتب إداري 300 متر', u_pm, 15);
  INSERT INTO public.project_clients (project_id, client_id) VALUES (p1, u_cl), (p2, u_cl);

  -- ---------- attendance: last 6 working days ----------
  FOR d IN 1..6 LOOP
    INSERT INTO public.attendance (engineer_id, project_id, check_in_time, check_out_time, check_in_lat, check_in_lng, check_out_lat, check_out_lng, is_within_geofence, is_verified, date)
    VALUES (u_e1, CASE WHEN d % 2 = 0 THEN p1 ELSE p3 END, (current_date - d) + time '08:30', (current_date - d) + time '16:15', 30.0074, 31.4913, 30.0074, 31.4913, true, true, current_date - d),
           (u_e2, CASE WHEN d % 3 = 0 THEN p2 ELSE p1 END, (current_date - d) + time '09:00', (current_date - d) + time '17:00', 30.0131, 30.9876, 30.0131, 30.9876, d <> 4, d <> 4, current_date - d);
  END LOOP;

  -- ---------- daily reports ----------
  INSERT INTO public.daily_reports (project_id, engineer_id, completed_work, remaining_work, issues, notes, photos_urls, date, sync_status) VALUES
   (p1, u_e1, 'تمديد مواسير الكهرباء للدور الأرضي وتركيب علب التوزيع', 'تمديد الدور الأول وتركيب اللوحة الرئيسية', NULL, 'العمل يسير حسب الجدول', '{}', current_date - 1, 'synced'),
   (p1, u_e2, 'تأسيس نقاط التكييف في غرف النوم', 'نقاط الإنارة الخارجية', 'تأخر توريد الكابلات يومين', NULL, '{}', current_date - 2, 'synced'),
   (p2, u_e2, 'معجون وأول وجه دهان للصالة والمعيشة', 'الوجه الثاني وغرف النوم', NULL, 'العميل طلب درجة لون أفتح للصالة', '{}', current_date - 1, 'synced'),
   (p3, u_e1, 'تسوية الأرضيات وتجهيز الحوائط للمحارة', 'بدء المحارة بالدور الأول', NULL, NULL, '{}', current_date - 3, 'synced');

  -- ---------- custody wallets, expenses, returns ----------
  INSERT INTO public.custody_wallets (engineer_id, total_disbursed, current_balance) VALUES (u_e1, 25000, 25000) RETURNING id INTO w1;
  INSERT INTO public.custody_wallets (engineer_id, total_disbursed, current_balance) VALUES (u_e2, 18000, 18000) RETURNING id INTO w2;
  INSERT INTO public.expenses (custody_id, project_id, engineer_id, amount, category, description) VALUES
   (w1, p1, u_e1, 3500, 'materials',      'مواسير وعلب كهرباء'),
   (w1, p3, u_e1, 1800, 'labor_wages',    'يوميات عمالة 4 أفراد'),
   (w1, p1, u_e1,  450, 'transportation', 'نقل خامات للموقع'),
   (w2, p2, u_e2, 2600, 'materials',      'معجون ودهانات'),
   (w2, p1, u_e2, 6000, 'subcontractor',  'دفعة مقاول تكييف'),
   (w2, p2, u_e2,  900, 'labor_wages',    'يومية نقاش');
  -- before-insert forces new expenses to pending_review; review a few like a manager would
  UPDATE public.expenses SET status = 'approved' WHERE description IN ('مواسير وعلب كهرباء', 'يوميات عمالة 4 أفراد', 'معجون ودهانات', 'دفعة مقاول تكييف');
  UPDATE public.expenses SET status = 'rejected' WHERE description = 'نقل خامات للموقع';
  INSERT INTO public.custody_returns (custody_id, engineer_id, project_id, amount, description) VALUES
   (w2, u_e2, p2, 700, 'مرتجع علب دهان زائدة للمورد'), (w1, u_e1, p1, 350, 'مرتجع كابلات غير مطابقة');
  UPDATE public.custody_returns SET status = 'approved' WHERE description LIKE 'مرتجع علب%';

  -- ---------- payroll (previous month) ----------
  INSERT INTO public.payroll_records (engineer_id, month, year, base_salary, allowances, bonuses, advances, deductions, field_days, status, created_by) VALUES
   (u_e1, mo, yr, 9000, 3300, 500, 1000, 0,   22, 'paid',     u_admin),
   (u_e2, mo, yr, 8500, 3000, 0,   0,    250, 20, 'approved', u_admin);

  -- ---------- suppliers, invoices, payments ----------
  INSERT INTO public.suppliers (id, name, trade, phone, rating, notes) VALUES
   (sup1, 'مصنع الأمل للدهانات', 'دهانات', '01000000001', 5, 'تسليم سريع'),
   (sup2, 'النور للأدوات الكهربائية', 'كهرباء', '01000000002', 4, NULL);
  INSERT INTO public.supplier_invoices (id, supplier_id, project_id, amount, paid_amount, invoice_date, note) VALUES
   (inv1, sup1, p2, 42000, 0, current_date - 20, 'دهانات الشقة'),
   (inv2, sup2, p1, 61000, 0, current_date - 12, 'كابلات ومفاتيح');
  INSERT INTO public.supplier_payments (invoice_id, amount, paid_on, note, created_by) VALUES
   (inv1, 42000, current_date - 10, 'سداد كامل', u_admin), (inv2, 25000, current_date - 5, 'دفعة أولى', u_admin);

  -- ---------- inventory ----------
  INSERT INTO public.materials (id, project_id, name, unit, min_qty) VALUES
   (m1, p2, 'دهان بلاستيك أبيض', 'جردل', 5), (m2, p1, 'كابل كهرباء 3×2.5', 'لفة', 4);
  INSERT INTO public.stock_moves (material_id, kind, qty, note, moved_by, moved_on) VALUES
   (m1, 'in', 20, 'توريد', u_admin, current_date - 20), (m1, 'out', 14, 'استهلاك الصالة', u_e2, current_date - 5),
   (m2, 'in', 12, 'توريد', u_admin, current_date - 12), (m2, 'out', 9, 'تمديد الدور الأرضي', u_e1, current_date - 3);

  -- ---------- quote ----------
  INSERT INTO public.quotes (id, kind, project_id, client_name, client_phone, issue_date, valid_until, discount, tax_pct, notes, status, created_by)
  VALUES (q1, 'quote', p3, 'شركة النيل', '01000000009', current_date - 14, current_date + 16, 5000, 14, 'العرض شامل التوريد والتركيب', 'sent', u_pm);
  INSERT INTO public.quote_items (quote_id, description, unit, qty, unit_price, sort) VALUES
   (q1, 'محارة وتجهيز حوائط', 'م²', 600, 180, 1), (q1, 'دهانات داخلية', 'م²', 900, 120, 2), (q1, 'أرضيات بورسلين', 'م²', 300, 450, 3);

  -- ---------- BOQ, milestones, client payments, change order, subcontract ----------
  INSERT INTO public.boq_items (project_id, category, title, unit, qty, unit_price, done_qty) VALUES
   (p1, 'materials', 'كابلات كهرباء', 'لفة', 20, 1800, 12), (p1, 'labor_wages', 'عمالة كهرباء', 'يوم', 40, 450, 25), (p2, 'materials', 'دهانات', 'جردل', 30, 900, 24);
  INSERT INTO public.project_milestones (project_id, title, start_date, end_date, done_at, visible_to_client) VALUES
   (p1, 'أعمال التأسيس', current_date - 70, current_date - 40, current_date - 38, true),
   (p1, 'أعمال الكهرباء', current_date - 35, current_date + 5, NULL, true),
   (p2, 'الدهانات', current_date - 25, current_date + 10, NULL, true);
  INSERT INTO public.project_payments (project_id, title, amount, due_date, status, paid_at, created_by) VALUES
   (p1, 'الدفعة الأولى', 250000, current_date - 60, 'paid', now() - interval '58 days', u_pm),
   (p1, 'الدفعة الثانية', 250000, current_date + 7, 'pending', NULL, u_pm),
   (p2, 'دفعة الدهانات', 80000, current_date + 3, 'pending', NULL, u_pm);
  INSERT INTO public.change_orders (project_id, title, description, cost_delta, days_delta, status, created_by) VALUES
   (p1, 'إضافة إنارة حديقة', 'إضافة 12 نقطة إنارة خارجية', 18000, 4, 'pending', u_pm);
  INSERT INTO public.subcontracts (id, project_id, name, trade, phone, agreed_amount) VALUES (sc1, p1, 'م. رامي للتكييف', 'تكييف', '01000000003', 90000);
  INSERT INTO public.subcontract_payments (subcontract_id, amount, paid_on, note, created_by) VALUES (sc1, 30000, current_date - 15, 'دفعة مقدمة', u_admin);

  -- ---------- client portal content ----------
  INSERT INTO public.client_updates (project_id, date, summary, next_steps, photos, published_by, published_at) VALUES
   (p1, current_date - 3, 'اكتمل تأسيس كهرباء الدور الأرضي وبدأنا الدور الأول.', 'تركيب اللوحة الرئيسية الأسبوع القادم', '{}', u_pm, now() - interval '3 days'),
   (p2, current_date - 2, 'تم الانتهاء من الوجه الأول للدهانات في الصالة.', 'الوجه الثاني وغرف النوم', '{}', u_pm, now() - interval '2 days');
  INSERT INTO public.client_requests (id, project_id, client_id, kind, subject, body, status) VALUES
   (rq1, p2, u_cl, 'note', 'درجة لون الصالة', 'أفضّل درجة أفتح قليلاً للصالة.', 'in_progress');
  INSERT INTO public.client_request_messages (request_id, author_id, body) VALUES
   (rq1, u_pm, 'تمام يا فندم، هنجهز لك عينتين للاختيار بينهم.');
  INSERT INTO public.stage_approvals (project_id, stage, client_id, decision, comment) VALUES (p1, 'plumbing', u_cl, 'approved', 'ممتاز، نكمل');
  INSERT INTO public.stage_ratings (project_id, stage, client_id, rating, comment) VALUES (p1, 'plumbing', u_cl, 5, 'شغل نضيف ومنظم');

  -- the seed itself fires "new expense/report" notifications and audit rows; start the demo clean
  DELETE FROM public.notifications;
  DELETE FROM public.audit_log;
  UPDATE public.projects SET budget_alert_level = 0;
  x := NULL;
END $$;

-- Wipes every demo user and all business data, then seeds again. Refuses to run outside the demo project.
CREATE OR REPLACE FUNCTION public.demo_reset() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, extensions AS $$
DECLARE t text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.demo_marker) THEN RAISE EXCEPTION 'not a demo database'; END IF;
  DELETE FROM auth.users;
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT IN ('cron_secret', 'demo_marker') LOOP
    EXECUTE format('TRUNCATE TABLE public.%I RESTART IDENTITY CASCADE', t);
  END LOOP;
  PERFORM public.demo_seed();
END $$;
REVOKE ALL ON FUNCTION public.demo_seed(), public.demo_reset() FROM PUBLIC, anon, authenticated;

-- First load, and every night at 02:00 UTC (04:00 Cairo).
SELECT public.demo_reset();
SELECT cron.unschedule('demo-reset') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'demo-reset');
SELECT cron.schedule('demo-reset', '0 2 * * *', 'SELECT public.demo_reset()');
