-- ============================================================
-- Tashtibet PWA — Complete Supabase Migration Script
-- Interior Finishing & Contracting Company
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. PROFILES
-- ============================================================
CREATE TABLE public.profiles (
  id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name    TEXT NOT NULL,
  phone        TEXT,
  role         TEXT NOT NULL CHECK (role IN ('admin', 'project_manager', 'site_engineer')),
  base_salary  NUMERIC(12,2) DEFAULT 0,
  site_allowance_rate NUMERIC(10,2) DEFAULT 0, -- per verified field day
  avatar_url   TEXT,
  is_active    BOOLEAN DEFAULT TRUE,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 2. PROJECTS
-- ============================================================
CREATE TABLE public.projects (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title                TEXT NOT NULL,
  client_name          TEXT NOT NULL,
  address              TEXT,
  location_lat         NUMERIC(10,7),
  location_lng         NUMERIC(10,7),
  geofence_radius_m    INTEGER DEFAULT 300,
  status               TEXT NOT NULL DEFAULT 'active'
                         CHECK (status IN ('active','paused','completed','cancelled')),
  stage                TEXT NOT NULL DEFAULT 'foundation'
                         CHECK (stage IN (
                           'foundation',    -- تأسيس
                           'masonry',       -- محارة
                           'plumbing',      -- سباكة
                           'electrical',    -- كهرباء
                           'painting',      -- دهانات
                           'final_finish'   -- تشطيب نهائي
                         )),
  assigned_engineer_ids UUID[] DEFAULT '{}',
  budget               NUMERIC(14,2) DEFAULT 0,
  start_date           DATE,
  delivery_date        DATE,
  notes                TEXT,
  created_by           UUID REFERENCES public.profiles(id),
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 3. ATTENDANCE
-- ============================================================
CREATE TABLE public.attendance (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  engineer_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  project_id     UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  check_in_time  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  check_out_time TIMESTAMPTZ,
  check_in_lat   NUMERIC(10,7),
  check_in_lng   NUMERIC(10,7),
  check_out_lat  NUMERIC(10,7),
  check_out_lng  NUMERIC(10,7),
  is_within_geofence BOOLEAN DEFAULT FALSE,
  is_verified    BOOLEAN DEFAULT FALSE,
  date           DATE NOT NULL DEFAULT CURRENT_DATE,
  notes          TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_attendance_engineer_date ON public.attendance(engineer_id, date);
CREATE INDEX idx_attendance_project_date  ON public.attendance(project_id, date);

-- ============================================================
-- 4. DAILY REPORTS
-- ============================================================
CREATE TABLE public.daily_reports (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id      UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  engineer_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  completed_work  TEXT,
  remaining_work  TEXT,
  issues          TEXT,
  notes           TEXT,
  photos_urls     TEXT[] DEFAULT '{}',
  date            DATE NOT NULL DEFAULT CURRENT_DATE,
  sync_status     TEXT DEFAULT 'synced' CHECK (sync_status IN ('pending','synced','failed')),
  offline_id      TEXT UNIQUE, -- Dexie local ID for dedup on sync
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_daily_reports_project_date   ON public.daily_reports(project_id, date);
CREATE INDEX idx_daily_reports_engineer_date  ON public.daily_reports(engineer_id, date);

-- ============================================================
-- 5. CUSTODY WALLETS
-- ============================================================
CREATE TABLE public.custody_wallets (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  engineer_id      UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  total_disbursed  NUMERIC(14,2) DEFAULT 0,
  current_balance  NUMERIC(14,2) DEFAULT 0,
  last_settled_at  TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 6. EXPENSES
-- ============================================================
CREATE TABLE public.expenses (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  custody_id   UUID NOT NULL REFERENCES public.custody_wallets(id) ON DELETE CASCADE,
  project_id   UUID REFERENCES public.projects(id),
  engineer_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount       NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  category     TEXT NOT NULL CHECK (category IN (
                  'labor_wages',        -- يوميات عمالة
                  'subcontractor',      -- مقاولو باطن
                  'materials',          -- شراء خامات
                  'transportation'      -- نقل ونثريات
               )),
  description  TEXT,
  receipt_url  TEXT,
  status       TEXT DEFAULT 'pending_review'
               CHECK (status IN ('approved','pending_review','rejected')),
  reviewed_by  UUID REFERENCES public.profiles(id),
  reviewed_at  TIMESTAMPTZ,
  offline_id   TEXT UNIQUE,
  sync_status  TEXT DEFAULT 'synced' CHECK (sync_status IN ('pending','synced','failed')),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_expenses_engineer     ON public.expenses(engineer_id);
CREATE INDEX idx_expenses_project      ON public.expenses(project_id);
CREATE INDEX idx_expenses_status       ON public.expenses(status);
CREATE INDEX idx_expenses_created_at   ON public.expenses(created_at DESC);

-- ============================================================
-- 7. PAYROLL RECORDS
-- ============================================================
CREATE TABLE public.payroll_records (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  engineer_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  month         INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  year          INTEGER NOT NULL CHECK (year >= 2020),
  base_salary   NUMERIC(12,2) DEFAULT 0,
  allowances    NUMERIC(12,2) DEFAULT 0,  -- auto-calculated from attendance
  bonuses       NUMERIC(12,2) DEFAULT 0,
  advances      NUMERIC(12,2) DEFAULT 0,  -- personal advances (separate from custody)
  deductions    NUMERIC(12,2) DEFAULT 0,
  net_salary    NUMERIC(12,2) GENERATED ALWAYS AS
                  (base_salary + allowances + bonuses - advances - deductions) STORED,
  field_days    INTEGER DEFAULT 0,
  status        TEXT DEFAULT 'draft' CHECK (status IN ('draft','approved','paid')),
  notes         TEXT,
  created_by    UUID REFERENCES public.profiles(id),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (engineer_id, month, year)
);

-- ============================================================
-- HELPER: auto-update updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_profiles_updated_at      BEFORE UPDATE ON public.profiles      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_projects_updated_at      BEFORE UPDATE ON public.projects      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_daily_reports_updated_at BEFORE UPDATE ON public.daily_reports FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_custody_updated_at       BEFORE UPDATE ON public.custody_wallets FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_payroll_updated_at       BEFORE UPDATE ON public.payroll_records  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- AUTO-DEDUCT BALANCE ON EXPENSE INSERT
-- ============================================================
CREATE OR REPLACE FUNCTION deduct_expense_from_wallet()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.custody_wallets
  SET current_balance = current_balance - NEW.amount
  WHERE id = NEW.custody_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_expense_deduct
  AFTER INSERT ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION deduct_expense_from_wallet();

-- RESTORE BALANCE IF EXPENSE DELETED
CREATE OR REPLACE FUNCTION restore_expense_to_wallet()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.custody_wallets
  SET current_balance = current_balance + OLD.amount
  WHERE id = OLD.custody_id;
  RETURN OLD;
END;
$$;

CREATE TRIGGER trg_expense_restore
  AFTER DELETE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION restore_expense_to_wallet();

-- ============================================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================================

ALTER TABLE public.profiles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_reports   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custody_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_records ENABLE ROW LEVEL SECURITY;

-- Helper function: get current user role
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS TEXT LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

-- Helper function: check if admin or pm
CREATE OR REPLACE FUNCTION is_admin_or_pm()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT role IN ('admin','project_manager') FROM public.profiles WHERE id = auth.uid();
$$;

-- ---- PROFILES ----
CREATE POLICY "profiles_read_all"   ON public.profiles FOR SELECT USING (TRUE);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE USING (id = auth.uid());
CREATE POLICY "profiles_admin_all"  ON public.profiles FOR ALL USING (is_admin_or_pm());

-- ---- PROJECTS ----
CREATE POLICY "projects_read_assigned" ON public.projects FOR SELECT USING (
  is_admin_or_pm() OR auth.uid() = ANY(assigned_engineer_ids)
);
CREATE POLICY "projects_admin_write" ON public.projects FOR INSERT WITH CHECK (is_admin_or_pm());
CREATE POLICY "projects_admin_update" ON public.projects FOR UPDATE USING (is_admin_or_pm());
CREATE POLICY "projects_admin_delete" ON public.projects FOR DELETE USING (get_my_role() = 'admin');

-- ---- ATTENDANCE ----
CREATE POLICY "attendance_read" ON public.attendance FOR SELECT USING (
  is_admin_or_pm() OR engineer_id = auth.uid()
);
CREATE POLICY "attendance_insert_own" ON public.attendance FOR INSERT WITH CHECK (engineer_id = auth.uid());
CREATE POLICY "attendance_update_own" ON public.attendance FOR UPDATE USING (
  is_admin_or_pm() OR engineer_id = auth.uid()
);

-- ---- DAILY REPORTS ----
CREATE POLICY "reports_read" ON public.daily_reports FOR SELECT USING (
  is_admin_or_pm() OR engineer_id = auth.uid()
);
CREATE POLICY "reports_insert_own" ON public.daily_reports FOR INSERT WITH CHECK (engineer_id = auth.uid());
CREATE POLICY "reports_update_own" ON public.daily_reports FOR UPDATE USING (
  is_admin_or_pm() OR engineer_id = auth.uid()
);

-- ---- CUSTODY WALLETS ----
CREATE POLICY "wallet_read" ON public.custody_wallets FOR SELECT USING (
  is_admin_or_pm() OR engineer_id = auth.uid()
);
CREATE POLICY "wallet_admin_write" ON public.custody_wallets FOR ALL USING (is_admin_or_pm());

-- ---- EXPENSES ----
CREATE POLICY "expenses_read" ON public.expenses FOR SELECT USING (
  is_admin_or_pm() OR engineer_id = auth.uid()
);
CREATE POLICY "expenses_insert_own" ON public.expenses FOR INSERT WITH CHECK (engineer_id = auth.uid());
CREATE POLICY "expenses_update" ON public.expenses FOR UPDATE USING (
  is_admin_or_pm() OR (engineer_id = auth.uid() AND status = 'pending_review')
);

-- ---- PAYROLL ----
CREATE POLICY "payroll_read" ON public.payroll_records FOR SELECT USING (
  is_admin_or_pm() OR engineer_id = auth.uid()
);
CREATE POLICY "payroll_admin_write" ON public.payroll_records FOR ALL USING (is_admin_or_pm());

-- ============================================================
-- STORAGE BUCKETS
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('site-reports', 'site-reports', FALSE, 2097152, ARRAY['image/jpeg','image/png','image/webp']),
  ('receipts',     'receipts',     FALSE, 2097152, ARRAY['image/jpeg','image/png','image/webp','application/pdf']),
  ('avatars',      'avatars',      TRUE,  524288,  ARRAY['image/jpeg','image/png','image/webp']);

-- Storage RLS
CREATE POLICY "reports_upload_own" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'site-reports' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "reports_read" ON storage.objects FOR SELECT
  USING (bucket_id = 'site-reports' AND (
    is_admin_or_pm() OR auth.uid()::text = (storage.foldername(name))[1]
  ));

CREATE POLICY "receipts_upload_own" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'receipts' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "receipts_read" ON storage.objects FOR SELECT
  USING (bucket_id = 'receipts' AND (
    is_admin_or_pm() OR auth.uid()::text = (storage.foldername(name))[1]
  ));

CREATE POLICY "avatars_public" ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

CREATE POLICY "avatars_upload_own" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
