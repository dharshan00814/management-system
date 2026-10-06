-- ====================================================================
-- HYNA STUDIO: UNIFIED SQL SCRIPT
-- 1. CEO Delete Security & Cascade Delete
-- 2. Executive Project Creation with Team Lead & Member Selection
-- 3. Operational Queries for Project Deletion & Member Management
-- 
-- Instructions: You can copy and RUN this ENTIRE script directly in 
-- Supabase Dashboard -> SQL Editor without any errors.
-- ====================================================================

-- --------------------------------------------------------------------
-- SECTION 1: CASCADE DELETE CONSTRAINTS
-- Ensures deleting a project cleanly removes associated modules & tasks
-- --------------------------------------------------------------------
ALTER TABLE IF EXISTS public.modules
  DROP CONSTRAINT IF EXISTS modules_project_id_fkey,
  ADD CONSTRAINT modules_project_id_fkey 
    FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS public.tasks
  DROP CONSTRAINT IF EXISTS tasks_project_id_fkey,
  ADD CONSTRAINT tasks_project_id_fkey 
    FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;

-- --------------------------------------------------------------------
-- SECTION 2: CEO IDENTITY VERIFICATION FUNCTION
-- Checks if the authenticated user is Vignesh / CEO / EMP-001
-- --------------------------------------------------------------------
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
-- Ensure RLS is active on projects
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

-- 3A. DELETE: Restricted STRICTLY to CEO
DROP POLICY IF EXISTS "projects_delete" ON public.projects;
DROP POLICY IF EXISTS "projects_delete_ceo" ON public.projects;

CREATE POLICY "projects_delete_ceo" ON public.projects
  FOR DELETE 
  TO authenticated 
  USING (
    public.is_ceo()
  );

-- 3B. INSERT: Executives (CEO, CTO, COO) or Project Lead Managers
DROP POLICY IF EXISTS "projects_insert" ON public.projects;
CREATE POLICY "projects_insert" ON public.projects
  FOR INSERT 
  TO authenticated 
  WITH CHECK (
    public.is_executive()
    OR (public.is_manager() AND manager_id = auth.uid())
  );

-- 3C. UPDATE: Executives or Assigned Project Lead
DROP POLICY IF EXISTS "projects_update" ON public.projects;
CREATE POLICY "projects_update" ON public.projects
  FOR UPDATE 
  TO authenticated 
  USING (
    public.is_executive() 
    OR manager_id = auth.uid()
  );

-- 3D. SELECT: All authenticated team members can view projects
DROP POLICY IF EXISTS "projects_select_all" ON public.projects;
CREATE POLICY "projects_select_all" ON public.projects
  FOR SELECT 
  TO authenticated 
  USING (true);

-- --------------------------------------------------------------------
-- SECTION 4: HELPER RPC FUNCTIONS (FOR FRONTEND & BACKEND INVOCATION)
-- --------------------------------------------------------------------

-- Function: Delete project with strict CEO verification
CREATE OR REPLACE FUNCTION public.delete_project_as_ceo(target_project_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  IF NOT public.is_ceo() THEN
    RAISE EXCEPTION 'Unauthorized: Only the CEO has permission to delete projects.';
  END IF;

  DELETE FROM public.projects WHERE id = target_project_id;
  RETURN TRUE;
END;
$$;

-- ====================================================================
-- OPERATIONAL QUERIES FOR COPY-PASTING / TESTING
-- (Uncomment and replace parameters as needed)
-- ====================================================================

-- [QUERY 1] Fetch all people to populate Project Head & Member selection lists:
-- SELECT 
--   id,
--   name,
--   email,
--   role,
--   designation,
--   department,
--   employee_id
-- FROM public.profiles
-- WHERE status = 'active'
-- ORDER BY 
--   CASE 
--     WHEN UPPER(TRIM(designation)) IN ('CEO', 'CTO', 'COO', 'CPO', 'ADMIN') THEN 1
--     WHEN role = 'manager' THEN 2
--     ELSE 3 
--   END, 
--   name ASC;

-- [QUERY 2] Create a new project dynamically using real profiles from your database:
-- INSERT INTO public.projects (
--   name,
--   description,
--   status,
--   progress,
--   manager_id,
--   member_ids,
--   start_date,
--   deadline,
--   color,
--   tags
-- ) VALUES (
--   'AI Platform',
--   'Core backend and frontend integration for Hyna Studio automations.',
--   'planning',
--   0,
--   -- Dynamic valid team lead UUID:
--   (SELECT id FROM public.profiles WHERE UPPER(TRIM(designation)) = 'CEO' OR LOWER(TRIM(name)) = 'vignesh' LIMIT 1),
--   -- Dynamic team member IDs array:
--   ARRAY[
--     (SELECT id::text FROM public.profiles WHERE UPPER(TRIM(designation)) = 'CEO' OR LOWER(TRIM(name)) = 'vignesh' LIMIT 1)
--   ]::text[],
--   CURRENT_DATE,
--   CURRENT_DATE + INTERVAL '60 days',
--   '#6366f1',
--   ARRAY['AI', 'Automation']::text[]
-- ) RETURNING *;

-- [QUERY 3] CEO Delete a Project by ID:
-- DELETE FROM public.projects 
-- WHERE id = 'TARGET_PROJECT_ID';

-- [QUERY 4] Change Project Team Lead (Project Head):
-- UPDATE public.projects 
-- SET 
--   manager_id = (SELECT id FROM public.profiles WHERE email = 'lead@hynastudio.com'),
--   updated_at = NOW()
-- WHERE id = 'TARGET_PROJECT_ID';

-- [QUERY 5] Add a Member to Project:
-- UPDATE public.projects
-- SET 
--   member_ids = array_append(member_ids, (SELECT id::text FROM public.profiles WHERE email = 'member@hynastudio.com')),
--   updated_at = NOW()
-- WHERE id = 'TARGET_PROJECT_ID'
--   AND NOT ((SELECT id::text FROM public.profiles WHERE email = 'member@hynastudio.com') = ANY(member_ids));

-- [QUERY 6] Remove a Member from Project:
-- UPDATE public.projects
-- SET 
--   member_ids = array_remove(member_ids, (SELECT id::text FROM public.profiles WHERE email = 'member@hynastudio.com')),
--   updated_at = NOW()
-- WHERE id = 'TARGET_PROJECT_ID';
