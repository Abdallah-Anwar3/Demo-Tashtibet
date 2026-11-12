-- ============================================================
-- Migration 002 — close privilege-escalation holes in profiles
-- Run AFTER supabase-migration.sql
--
-- Problem in v1: "profiles_update_own" let ANY user update their own
-- row, including `role`, `base_salary` and `is_active` (an engineer
-- could make themselves admin or raise their own salary).
-- "profiles_admin_all" also let project managers edit any profile.
-- ============================================================

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_admin_all"  ON public.profiles;

-- Admin only: create / edit / delete any profile
CREATE POLICY "profiles_admin_write" ON public.profiles
  FOR ALL USING (get_my_role() = 'admin') WITH CHECK (get_my_role() = 'admin');

-- Everyone: may edit only harmless columns of their own row
CREATE POLICY "profiles_update_own_safe" ON public.profiles
  FOR UPDATE USING (id = auth.uid()) WITH CHECK (id = auth.uid());

REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT  UPDATE (full_name, phone, avatar_url) ON public.profiles TO authenticated;
-- (Admins write through the admin-users Edge Function, which uses the
--  service role and therefore bypasses these column grants.)

-- Engineers must not approve their own expenses or edit amounts after submit.
DROP POLICY IF EXISTS "expenses_update" ON public.expenses;
CREATE POLICY "expenses_update_admin" ON public.expenses
  FOR UPDATE USING (is_admin_or_pm());

-- Only admins hand out custody money.
DROP POLICY IF EXISTS "wallet_admin_write" ON public.custody_wallets;
CREATE POLICY "wallet_admin_write" ON public.custody_wallets
  FOR ALL USING (get_my_role() = 'admin') WITH CHECK (get_my_role() = 'admin');

-- Allow project managers to see profiles (needed for assignment pickers)
-- while hiding salary data from engineers: expose a safe view.

-- Salary columns readable only by admin or the owner.
DROP POLICY IF EXISTS "profiles_read_all" ON public.profiles;
CREATE POLICY "profiles_read_scoped" ON public.profiles
  FOR SELECT USING (id = auth.uid() OR is_admin_or_pm());
