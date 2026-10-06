-- ====================================================================
-- HYNA STUDIO: ANNOUNCEMENT CEO DELETE SECURITY POLICY
-- Run this script in your Supabase Dashboard -> SQL Editor
-- ====================================================================

-- 1. Ensure CEO verification helper function exists
CREATE OR REPLACE FUNCTION public.is_ceo()
RETURNS BOOLEAN 
LANGUAGE sql 
STABLE 
SECURITY DEFINER 
SET search_path = public, auth, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND (
        UPPER(TRIM(designation)) = 'CEO'
        OR LOWER(TRIM(name)) = 'vignesh'
        OR LOWER(TRIM(email)) LIKE '%vignesh%'
        OR UPPER(TRIM(COALESCE(employee_id, ''))) = 'EMP-001'
      )
  );
$$;

-- 2. Ensure RLS is active on announcements
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

-- 3. Dedicated DELETE Policy: Restricted strictly to CEO Vignesh
DROP POLICY IF EXISTS "announcements_delete" ON public.announcements;
DROP POLICY IF EXISTS "announcements_delete_ceo" ON public.announcements;

CREATE POLICY "announcements_delete_ceo" ON public.announcements
  FOR DELETE 
  TO authenticated 
  USING (
    public.is_ceo()
  );

-- 4. Enable Supabase Realtime for announcements table (if not already added)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'announcements'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.announcements;
  END IF;
END $$;
