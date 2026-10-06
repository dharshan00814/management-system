-- ============================================================
-- HYNA MANAGEMENT - AUTH TRIGGER, ROLES & ACCESS CONTROL
-- Executives: Dharshan (Admin), Vignesh (CEO), Jashwin (COO)
-- Manager: Asthamil (Engineering Manager)
-- Members: Team Members (Zarif, Hajira, Linciya, Arshiya, etc.)
-- ============================================================

-- 1. Ensure employee_id column exists on public.profiles
ALTER TABLE IF EXISTS public.profiles 
  ADD COLUMN IF NOT EXISTS employee_id TEXT UNIQUE;

CREATE INDEX IF NOT EXISTS idx_profiles_employee_id ON public.profiles(employee_id);

ALTER TABLE IF EXISTS public.profiles 
  ALTER COLUMN name SET DEFAULT 'Team Member',
  ALTER COLUMN role SET DEFAULT 'member',
  ALTER COLUMN department SET DEFAULT 'Engineering',
  ALTER COLUMN designation SET DEFAULT 'Software Engineer',
  ALTER COLUMN status SET DEFAULT 'active';

-- 2. Clean and Fix Row Level Security policies on public.profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_auth" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_self" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_exec" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert" ON public.profiles;
DROP POLICY IF EXISTS "profiles_delete_exec" ON public.profiles;

CREATE POLICY "profiles_select_auth" 
  ON public.profiles 
  FOR SELECT 
  TO authenticated 
  USING (true);

CREATE POLICY "profiles_insert" 
  ON public.profiles 
  FOR INSERT 
  WITH CHECK (true);

CREATE POLICY "profiles_update_self" 
  ON public.profiles 
  FOR UPDATE 
  TO authenticated 
  USING (id = auth.uid() OR public.is_executive())
  WITH CHECK (id = auth.uid() OR public.is_executive());

CREATE POLICY "profiles_delete_exec" 
  ON public.profiles 
  FOR DELETE 
  TO authenticated 
  USING (public.is_executive());

-- 3. Security functions:
-- Executives: Dharshan (Admin), Vignesh (CEO), Jashwin (COO)
CREATE OR REPLACE FUNCTION public.is_executive()
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
        role = 'admin'
        OR UPPER(TRIM(designation)) IN ('CEO', 'CTO', 'CPO', 'COO', 'ADMIN', 'EXECUTIVE ADMIN')
        OR LOWER(TRIM(name)) IN ('dharshan', 'vignesh', 'jashwin')
        OR LOWER(TRIM(email)) LIKE '%dharshan%'
        OR LOWER(TRIM(email)) LIKE '%vignesh%'
        OR LOWER(TRIM(email)) LIKE '%jashwin%'
      )
  );
$$;

-- Managers: Asthamil + any user with manager role or designation
CREATE OR REPLACE FUNCTION public.is_manager()
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
        role = 'manager'
        OR UPPER(TRIM(designation)) LIKE '%MANAGER%'
        OR LOWER(TRIM(name)) LIKE '%asthamil%'
        OR LOWER(TRIM(email)) LIKE '%asthamil%'
      )
  );
$$;

-- 4. Protect profile roles while guaranteeing executive roles for Dharshan, Vignesh, Jashwin & manager for Asthamil
CREATE OR REPLACE FUNCTION public.protect_profile_role()
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  -- Enforce Executive Admin status for Dharshan, Vignesh, and Jashwin
  IF LOWER(TRIM(NEW.name)) IN ('dharshan', 'vignesh', 'jashwin') 
     OR LOWER(TRIM(NEW.email)) LIKE '%dharshan%' 
     OR LOWER(TRIM(NEW.email)) LIKE '%vignesh%' 
     OR LOWER(TRIM(NEW.email)) LIKE '%jashwin%' THEN
    NEW.role := 'admin';
    IF LOWER(TRIM(NEW.name)) LIKE '%vignesh%' OR LOWER(TRIM(NEW.email)) LIKE '%vignesh%' THEN
      NEW.designation := 'CEO';
      NEW.employee_id := COALESCE(NEW.employee_id, 'EMP-001');
    ELSIF LOWER(TRIM(NEW.name)) LIKE '%jashwin%' OR LOWER(TRIM(NEW.email)) LIKE '%jashwin%' THEN
      NEW.designation := 'COO';
      NEW.employee_id := COALESCE(NEW.employee_id, 'EMP-002');
    ELSE
      NEW.designation := 'Admin';
      NEW.employee_id := COALESCE(NEW.employee_id, 'EMP-003');
    END IF;
    NEW.department := 'Executive';
    RETURN NEW;
  END IF;

  -- Enforce Manager status for Asthamil
  IF LOWER(TRIM(NEW.name)) LIKE '%asthamil%' OR LOWER(TRIM(NEW.email)) LIKE '%asthamil%' THEN
    NEW.role := 'manager';
    NEW.designation := 'Engineering Manager';
    NEW.employee_id := COALESCE(NEW.employee_id, 'EMP-004');
    NEW.department := 'Engineering';
    RETURN NEW;
  END IF;

  -- Only enforce role modification restrictions for active non-executive end-user sessions
  IF auth.uid() IS NOT NULL AND NOT public.is_executive() THEN
    IF NEW.role <> OLD.role THEN
      RAISE EXCEPTION 'Access Denied: You cannot modify your own role.';
    END IF;
    IF NEW.designation <> OLD.designation AND UPPER(TRIM(NEW.designation)) IN ('CEO', 'CTO', 'CPO', 'COO', 'ADMIN') THEN
      RAISE EXCEPTION 'Access Denied: You cannot assign executive designations.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profile_role ON public.profiles;
CREATE TRIGGER trg_protect_profile_role
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE PROCEDURE public.protect_profile_role();

-- 5. Safe, production-ready handle_new_user trigger
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_name TEXT;
  v_role public.user_role := 'member';
  v_designation TEXT;
  v_department TEXT;
  v_employee_id TEXT;
  v_is_first BOOLEAN := FALSE;
  v_email_prefix TEXT;
BEGIN
  v_email_prefix := LOWER(split_part(new.email, '@', 1));
  v_name := COALESCE(NULLIF(new.raw_user_meta_data->>'name', ''), initcap(v_email_prefix), 'Team Member');
  v_designation := COALESCE(NULLIF(new.raw_user_meta_data->>'designation', ''), 'Software Engineer');
  v_department := COALESCE(NULLIF(new.raw_user_meta_data->>'department', ''), 'Engineering');
  v_employee_id := NULLIF(new.raw_user_meta_data->>'employee_id', '');

  SELECT NOT EXISTS (SELECT 1 FROM public.profiles LIMIT 1) INTO v_is_first;

  -- Executive Admin Auto-Mapping:
  -- Dharshan -> Admin (Full Access), EMP-003
  IF v_email_prefix ILIKE '%dharshan%' OR v_name ILIKE '%dharshan%' THEN
    v_role := 'admin';
    v_designation := 'Admin';
    v_department := 'Executive';
    v_employee_id := COALESCE(v_employee_id, 'EMP-003');
  -- Vignesh -> CEO (Full Access), EMP-001
  ELSIF v_email_prefix ILIKE '%vignesh%' OR v_name ILIKE '%vignesh%' OR UPPER(TRIM(v_designation)) = 'CEO' THEN
    v_role := 'admin';
    v_designation := 'CEO';
    v_department := 'Executive';
    v_employee_id := COALESCE(v_employee_id, 'EMP-001');
  -- Jashwin -> COO (Full Access), EMP-002
  ELSIF v_email_prefix ILIKE '%jashwin%' OR v_name ILIKE '%jashwin%' OR UPPER(TRIM(v_designation)) = 'COO' THEN
    v_role := 'admin';
    v_designation := 'COO';
    v_department := 'Executive';
    v_employee_id := COALESCE(v_employee_id, 'EMP-002');
  -- Asthamil -> Manager (EMP-004)
  ELSIF v_email_prefix ILIKE '%asthamil%' OR v_name ILIKE '%asthamil%' THEN
    v_role := 'manager';
    v_designation := 'Engineering Manager';
    v_department := 'Engineering';
    v_employee_id := COALESCE(v_employee_id, 'EMP-004');
  ELSIF v_is_first THEN
    v_role := 'admin';
    v_designation := 'Admin';
    v_department := 'Executive';
    v_employee_id := COALESCE(v_employee_id, 'EMP-003');
  ELSIF new.raw_user_meta_data->>'role' = 'admin' AND UPPER(TRIM(v_designation)) IN ('CEO', 'CTO', 'CPO', 'COO', 'ADMIN') THEN
    v_role := 'admin';
  ELSIF new.raw_user_meta_data->>'role' = 'manager' OR UPPER(TRIM(v_designation)) LIKE '%MANAGER%' THEN
    v_role := 'manager';
  END IF;

  -- Organization Employee ID Auto-Mapping:
  IF v_employee_id IS NULL THEN
    IF v_email_prefix ILIKE '%asthamil%' THEN v_employee_id := 'EMP-004';
    ELSIF v_email_prefix ILIKE '%zarif%' THEN v_employee_id := 'EMP-005';
    ELSIF v_email_prefix ILIKE '%hajira%' THEN v_employee_id := 'EMP-006';
    ELSIF v_email_prefix ILIKE '%linciya%' THEN v_employee_id := 'EMP-007';
    ELSIF v_email_prefix ILIKE '%arshiya%' THEN v_employee_id := 'EMP-008';
    ELSIF v_email_prefix ILIKE '%akshaya%' THEN v_employee_id := 'EMP-009';
    ELSIF v_email_prefix ILIKE '%thivan%' THEN v_employee_id := 'EMP-010';
    ELSIF v_email_prefix ILIKE '%rohit%' THEN v_employee_id := 'EMP-011';
    ELSIF v_email_prefix ILIKE '%tharun%' THEN v_employee_id := 'EMP-012';
    ELSIF v_email_prefix ILIKE '%anzar%' THEN v_employee_id := 'EMP-013';
    END IF;
  END IF;

  INSERT INTO public.profiles (
    id,
    employee_id,
    name,
    email,
    role,
    designation,
    department,
    status
  )
  VALUES (
    new.id,
    v_employee_id,
    v_name,
    new.email,
    v_role,
    v_designation,
    v_department,
    'active'
  )
  ON CONFLICT (id) DO UPDATE
  SET
    email = EXCLUDED.email,
    employee_id = COALESCE(public.profiles.employee_id, EXCLUDED.employee_id),
    name = CASE WHEN public.profiles.name = '' OR public.profiles.name IS NULL THEN EXCLUDED.name ELSE public.profiles.name END,
    role = CASE WHEN public.profiles.role IN ('admin', 'manager') THEN public.profiles.role ELSE EXCLUDED.role END,
    designation = CASE WHEN public.profiles.role IN ('admin', 'manager') THEN public.profiles.designation ELSE EXCLUDED.designation END,
    updated_at = NOW();

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'handle_new_user failed for user %: %', new.id, SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 6. Automatically confirm new user email so Supabase allows instant login without sending email
CREATE OR REPLACE FUNCTION public.auto_confirm_new_user()
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  NEW.email_confirmed_at := COALESCE(NEW.email_confirmed_at, NOW());
  NEW.confirmed_at := COALESCE(NEW.confirmed_at, NOW());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_confirm_new_user ON auth.users;
CREATE TRIGGER trg_auto_confirm_new_user
  BEFORE INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.auto_confirm_new_user();

-- 7. Update existing profiles if already registered in the database
UPDATE public.profiles 
SET role = 'admin', designation = 'Admin', department = 'Executive', employee_id = COALESCE(employee_id, 'EMP-003')
WHERE LOWER(name) LIKE '%dharshan%' OR LOWER(email) LIKE '%dharshan%';

UPDATE public.profiles 
SET role = 'admin', designation = 'CEO', department = 'Executive', employee_id = COALESCE(employee_id, 'EMP-001')
WHERE LOWER(name) LIKE '%vignesh%' OR LOWER(email) LIKE '%vignesh%';

UPDATE public.profiles 
SET role = 'admin', designation = 'COO', department = 'Executive', employee_id = COALESCE(employee_id, 'EMP-002')
WHERE LOWER(name) LIKE '%jashwin%' OR LOWER(email) LIKE '%jashwin%';

UPDATE public.profiles 
SET role = 'manager', designation = 'Engineering Manager', department = 'Engineering', employee_id = COALESCE(employee_id, 'EMP-004')
WHERE LOWER(name) LIKE '%asthamil%' OR LOWER(email) LIKE '%asthamil%';

-- ============================================================
-- 8. TASKS PERMISSIONS & ACCESS CONTROL
-- Rule: Members ONLY view their own assigned task (assignee_id = auth.uid())
-- Rule: Admin (and Managers) allocate and assign tasks to team members
-- ============================================================
ALTER TABLE IF EXISTS public.tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tasks_select" ON public.tasks;
DROP POLICY IF EXISTS "tasks_insert" ON public.tasks;
DROP POLICY IF EXISTS "tasks_update" ON public.tasks;
DROP POLICY IF EXISTS "tasks_delete" ON public.tasks;

CREATE POLICY "tasks_select" ON public.tasks FOR SELECT TO authenticated USING (
  public.is_executive()
  OR public.is_manager()
  OR assignee_id = auth.uid()
);

CREATE POLICY "tasks_insert" ON public.tasks FOR INSERT TO authenticated WITH CHECK (
  public.is_executive()
  OR public.is_manager()
);

CREATE POLICY "tasks_update" ON public.tasks FOR UPDATE TO authenticated USING (
  public.is_executive()
  OR public.is_manager()
  OR assignee_id = auth.uid()
);

CREATE POLICY "tasks_delete" ON public.tasks FOR DELETE TO authenticated USING (
  public.is_executive()
  OR public.is_manager()
);

-- ============================================================
-- 9. ATTENDANCE & CHECK-IN / CHECK-OUT FOR ALL MEMBERS
-- Rule: All members can check in and check out their own attendance
-- Rule: Executives can view and manage all attendance
-- ============================================================
ALTER TABLE IF EXISTS public.attendance_records 
  ADD COLUMN IF NOT EXISTS working_hours TEXT,
  ADD COLUMN IF NOT EXISTS notes TEXT;

ALTER TABLE IF EXISTS public.attendance_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "attendance_select" ON public.attendance_records;
DROP POLICY IF EXISTS "attendance_insert_self" ON public.attendance_records;
DROP POLICY IF EXISTS "attendance_update_self" ON public.attendance_records;

CREATE POLICY "attendance_select" ON public.attendance_records FOR SELECT TO authenticated USING (
  public.is_executive()
  OR public.is_manager()
  OR user_id = auth.uid()
);

CREATE POLICY "attendance_insert_self" ON public.attendance_records FOR INSERT TO authenticated WITH CHECK (
  user_id = auth.uid() OR public.is_executive()
);

CREATE POLICY "attendance_update_self" ON public.attendance_records FOR UPDATE TO authenticated USING (
  user_id = auth.uid() OR public.is_executive()
) WITH CHECK (
  user_id = auth.uid() OR public.is_executive()
);

