-- Fix infinite recursion in profiles RLS (Postgres error 42P17).
-- Symptom in Render logs:
--   HTTP 500 | GET /api/v1/cases/ | infinite recursion detected in policy for relation "profiles"
--
-- Cause: admin policies use `(SELECT role FROM public.profiles WHERE id = auth.uid())`
-- which re-enters profiles RLS while evaluating a profiles policy.
--
-- Fix: security-definer helper that reads role bypassing RLS, then use it in policies.
-- Run this once in Supabase → SQL Editor.

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role::text FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.current_user_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated, anon, service_role;

-- Replace recursive admin policies that probe public.profiles for role.
-- Only policies that already exist are recreated.

DO $$
DECLARE
  pol record;
  tbl text;
  polname text;
BEGIN
  FOR pol IN
    SELECT schemaname, tablename, policyname, cmd
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (
        qual ILIKE '%role FROM public.profiles%'
        OR with_check ILIKE '%role FROM public.profiles%'
        OR policyname LIKE '%_select_admin'
        OR policyname LIKE '%_admin%'
      )
  LOOP
    -- We only rewrite known SELECT admin patterns; drop + recreate via explicit list below.
    NULL;
  END LOOP;
END $$;

-- Explicit, safe rewrites for core tables
DROP POLICY IF EXISTS profiles_select_admin ON public.profiles;
CREATE POLICY profiles_select_admin
ON public.profiles
FOR SELECT
USING (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS query_history_select_admin ON public.query_history;
CREATE POLICY query_history_select_admin
ON public.query_history
FOR SELECT
USING (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS consultations_select_admin ON public.consultations;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'consultations'
  ) THEN
    EXECUTE $p$
      CREATE POLICY consultations_select_admin
      ON public.consultations
      FOR SELECT
      USING (public.current_user_role() = 'admin')
    $p$;
  END IF;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;
