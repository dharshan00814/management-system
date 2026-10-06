-- ============================================================
-- HYNA STUDIO MANAGEMENT - DATABASE MIGRATION SCRIPT
-- Compatible with Supabase / PostgreSQL 14+
-- Migration: 20260925000000_hyna_init.sql
-- Description: Core Schema, Auth Integration, Role Functions, & Server-Side RLS
-- ============================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. ENUM TYPES
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('admin', 'manager', 'member');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE project_status AS ENUM ('planning', 'active', 'on-hold', 'completed');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE task_status AS ENUM ('backlog', 'todo', 'in-progress', 'in-review', 'completed', 'blocked');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE task_priority AS ENUM ('low', 'medium', 'high', 'urgent');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE attendance_status AS ENUM ('present', 'late', 'absent', 'leave');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE leave_type AS ENUM ('casual', 'sick', 'earned', 'unpaid');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE leave_status AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE meeting_type AS ENUM ('team', 'one-on-one', 'standup', 'review', 'planning', 'other');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE meeting_status AS ENUM ('scheduled', 'in-progress', 'completed', 'cancelled');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE notification_type AS ENUM ('task', 'meeting', 'announcement', 'comment', 'deadline', 'approval', 'general');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE announcement_priority AS ENUM ('low', 'normal', 'high', 'urgent');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE announcement_audience AS ENUM ('all', 'admin', 'manager', 'member');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE file_type AS ENUM ('document', 'image', 'video', 'code', 'archive', 'spreadsheet', 'presentation', 'other');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE review_status AS ENUM ('pending', 'approved', 'changes-requested');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 3. UPDATED_AT TRIGGER FUNCTION
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 4. TABLES DEFINITION
-- ============================================================

-- Profiles Table (Linked to Supabase Auth auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  employee_id TEXT UNIQUE,
  name TEXT NOT NULL DEFAULT 'Team Member',
  email TEXT NOT NULL UNIQUE,
  avatar TEXT DEFAULT '',
  role user_role NOT NULL DEFAULT 'member',
  department TEXT DEFAULT 'Engineering',
  designation TEXT DEFAULT 'Software Engineer',
  phone TEXT DEFAULT '',
  join_date DATE DEFAULT CURRENT_DATE,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  bio TEXT DEFAULT '',
  skills TEXT[] DEFAULT '{}',
  active_projects INTEGER DEFAULT 0,
  last_active TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Backward compatibility view
CREATE OR REPLACE VIEW public.users AS
  SELECT * FROM public.profiles;

-- Projects Table
CREATE TABLE IF NOT EXISTS public.projects (
  id TEXT PRIMARY KEY DEFAULT ('p_' || encode(gen_random_bytes(6), 'hex')),
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  status project_status NOT NULL DEFAULT 'planning',
  progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  manager_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  member_ids TEXT[] DEFAULT '{}',
  start_date DATE DEFAULT CURRENT_DATE,
  deadline DATE,
  color TEXT DEFAULT '#6366f1',
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Modules Table
CREATE TABLE IF NOT EXISTS public.modules (
  id TEXT PRIMARY KEY DEFAULT ('m_' || encode(gen_random_bytes(6), 'hex')),
  project_id TEXT NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  total_tasks INTEGER DEFAULT 0,
  completed_tasks INTEGER DEFAULT 0,
  in_review_tasks INTEGER DEFAULT 0,
  blocked_tasks INTEGER DEFAULT 0,
  assignee_ids TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tasks Table
CREATE TABLE IF NOT EXISTS public.tasks (
  id TEXT PRIMARY KEY DEFAULT ('t_' || encode(gen_random_bytes(6), 'hex')),
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  status task_status NOT NULL DEFAULT 'todo',
  priority task_priority NOT NULL DEFAULT 'medium',
  assignee_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  project_id TEXT NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  module_id TEXT REFERENCES public.modules(id) ON DELETE SET NULL,
  deadline DATE,
  tags TEXT[] DEFAULT '{}',
  attachments INTEGER DEFAULT 0,
  comments INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Task Checklists Table
CREATE TABLE IF NOT EXISTS public.task_checklists (
  id TEXT PRIMARY KEY DEFAULT ('chk_' || encode(gen_random_bytes(6), 'hex')),
  task_id TEXT NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed BOOLEAN DEFAULT false,
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Task Submissions Table
CREATE TABLE IF NOT EXISTS public.task_submissions (
  id TEXT PRIMARY KEY DEFAULT ('sub_' || encode(gen_random_bytes(6), 'hex')),
  task_id TEXT NOT NULL UNIQUE REFERENCES public.tasks(id) ON DELETE CASCADE,
  submitted_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  description TEXT DEFAULT '',
  attachments TEXT[] DEFAULT '{}',
  review_status review_status DEFAULT 'pending',
  feedback TEXT,
  reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ
);

-- Meetings Table
CREATE TABLE IF NOT EXISTS public.meetings (
  id TEXT PRIMARY KEY DEFAULT ('mt_' || encode(gen_random_bytes(6), 'hex')),
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  date DATE NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  host_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  participant_ids TEXT[] DEFAULT '{}',
  type meeting_type DEFAULT 'team',
  is_recurring BOOLEAN DEFAULT false,
  meeting_link TEXT DEFAULT '',
  status meeting_status DEFAULT 'scheduled',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Attendance Records Table
CREATE TABLE IF NOT EXISTS public.attendance_records (
  id TEXT PRIMARY KEY DEFAULT ('att_' || encode(gen_random_bytes(6), 'hex')),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  check_in TEXT,
  check_out TEXT,
  status attendance_status DEFAULT 'present',
  hours_worked NUMERIC(4, 2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_user_attendance_date UNIQUE(user_id, date)
);

CREATE OR REPLACE VIEW public.attendance AS
  SELECT * FROM public.attendance_records;

-- Daily Reports Table
CREATE TABLE IF NOT EXISTS public.daily_reports (
  id TEXT PRIMARY KEY DEFAULT ('dr_' || encode(gen_random_bytes(6), 'hex')),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  content TEXT NOT NULL,
  achievements TEXT DEFAULT '',
  challenges TEXT DEFAULT '',
  tomorrow_plan TEXT DEFAULT '',
  hours_worked NUMERIC(4, 2) DEFAULT 8.0,
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_user_daily_report_date UNIQUE(user_id, date)
);

-- Notifications Table
CREATE TABLE IF NOT EXISTS public.notifications (
  id TEXT PRIMARY KEY DEFAULT ('nt_' || encode(gen_random_bytes(6), 'hex')),
  user_id TEXT NOT NULL, -- UUID or 'all'
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type notification_type DEFAULT 'general',
  is_read BOOLEAN DEFAULT false,
  link TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Chat Channels Table
CREATE TABLE IF NOT EXISTS public.chat_channels (
  id TEXT PRIMARY KEY DEFAULT ('ch_' || encode(gen_random_bytes(6), 'hex')),
  name TEXT NOT NULL,
  type TEXT DEFAULT 'general',
  member_ids TEXT[] DEFAULT '{}',
  last_message TEXT DEFAULT '',
  last_message_at TIMESTAMPTZ DEFAULT NOW(),
  unread_count INTEGER DEFAULT 0,
  icon TEXT DEFAULT 'hash',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Chat Messages Table
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id TEXT PRIMARY KEY DEFAULT ('msg_' || encode(gen_random_bytes(6), 'hex')),
  channel_id TEXT NOT NULL REFERENCES public.chat_channels(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  type TEXT DEFAULT 'text',
  attachments TEXT[] DEFAULT '{}',
  reactions JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Folders Table
CREATE TABLE IF NOT EXISTS public.folders (
  id TEXT PRIMARY KEY DEFAULT ('fld_' || encode(gen_random_bytes(6), 'hex')),
  name TEXT NOT NULL,
  parent_id TEXT REFERENCES public.folders(id) ON DELETE CASCADE,
  file_count INTEGER DEFAULT 0,
  icon TEXT DEFAULT 'folder',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Files Table
CREATE TABLE IF NOT EXISTS public.files (
  id TEXT PRIMARY KEY DEFAULT ('fl_' || encode(gen_random_bytes(6), 'hex')),
  name TEXT NOT NULL,
  type file_type DEFAULT 'document',
  size BIGINT DEFAULT 0,
  folder TEXT DEFAULT 'General',
  uploaded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  url TEXT DEFAULT '#',
  mime_type TEXT DEFAULT 'application/octet-stream',
  project_id TEXT REFERENCES public.projects(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Leave Requests Table
CREATE TABLE IF NOT EXISTS public.leave_requests (
  id TEXT PRIMARY KEY DEFAULT ('lv_' || encode(gen_random_bytes(6), 'hex')),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type leave_type NOT NULL DEFAULT 'casual',
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reason TEXT NOT NULL,
  status leave_status NOT NULL DEFAULT 'pending',
  applied_at TIMESTAMPTZ DEFAULT NOW(),
  reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Announcements Table
CREATE TABLE IF NOT EXISTS public.announcements (
  id TEXT PRIMARY KEY DEFAULT ('ann_' || encode(gen_random_bytes(6), 'hex')),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  priority announcement_priority DEFAULT 'normal',
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  audience announcement_audience DEFAULT 'all',
  is_published BOOLEAN DEFAULT true,
  scheduled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 5. BUSINESS LOGIC & ROLE SECURITY FUNCTIONS
-- ============================================================

-- Function: Check if current auth user has Executive / Admin privileges
-- Only CEO, CTO, CPO, COO qualify for Admin access
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

-- Function: Check if current auth user is a Manager
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

-- Function: Check if current auth user is the manager of a given project
CREATE OR REPLACE FUNCTION public.is_project_manager(proj_id TEXT)
RETURNS BOOLEAN 
LANGUAGE sql 
STABLE 
SECURITY DEFINER 
SET search_path = public, auth, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.projects
    WHERE id = proj_id AND manager_id = auth.uid()
  );
$$;

-- Trigger: Automatically create public.profiles when a new user signs up in auth.users
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
  -- Safe failure: Log warning but never abort the user registration in auth.users
  RAISE WARNING 'handle_new_user failed for user %: %', new.id, SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Trigger: Automatically confirm new user email so Supabase allows instant login without sending email
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

-- Trigger: Prevent regular users from modifying their own role or assigning executive designations
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

  -- Only enforce role modification restrictions for active end-user sessions
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

-- ============================================================
-- 6. ATTACH UPDATED_AT TRIGGERS
-- ============================================================
DO $$ BEGIN
  DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
  CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

  DROP TRIGGER IF EXISTS trg_projects_updated_at ON public.projects;
  CREATE TRIGGER trg_projects_updated_at BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

  DROP TRIGGER IF EXISTS trg_modules_updated_at ON public.modules;
  CREATE TRIGGER trg_modules_updated_at BEFORE UPDATE ON public.modules FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

  DROP TRIGGER IF EXISTS trg_tasks_updated_at ON public.tasks;
  CREATE TRIGGER trg_tasks_updated_at BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

  DROP TRIGGER IF EXISTS trg_meetings_updated_at ON public.meetings;
  CREATE TRIGGER trg_meetings_updated_at BEFORE UPDATE ON public.meetings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

  DROP TRIGGER IF EXISTS trg_attendance_records_updated_at ON public.attendance_records;
  CREATE TRIGGER trg_attendance_records_updated_at BEFORE UPDATE ON public.attendance_records FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

  DROP TRIGGER IF EXISTS trg_daily_reports_updated_at ON public.daily_reports;
  CREATE TRIGGER trg_daily_reports_updated_at BEFORE UPDATE ON public.daily_reports FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

  DROP TRIGGER IF EXISTS trg_leave_requests_updated_at ON public.leave_requests;
  CREATE TRIGGER trg_leave_requests_updated_at BEFORE UPDATE ON public.leave_requests FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

  DROP TRIGGER IF EXISTS trg_announcements_updated_at ON public.announcements;
  CREATE TRIGGER trg_announcements_updated_at BEFORE UPDATE ON public.announcements FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
END $$;

-- ============================================================
-- 7. ROW LEVEL SECURITY (SERVER-SIDE AUTHORIZATION)
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

-- Clean existing policies
DO $$ BEGIN
  EXECUTE (
    SELECT string_agg('DROP POLICY IF EXISTS ' || quote_ident(policyname) || ' ON ' || quote_ident(tablename) || ';', ' ')
    FROM pg_policies
    WHERE schemaname = 'public'
  );
EXCEPTION WHEN others THEN null;
END $$;

-- Profiles: Authenticated users can view team profiles; users can update self; executives can manage all
CREATE POLICY "profiles_select_auth" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_insert" ON public.profiles FOR INSERT WITH CHECK (true);
CREATE POLICY "profiles_update_self" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid() OR public.is_executive()) WITH CHECK (id = auth.uid() OR public.is_executive());
CREATE POLICY "profiles_delete_exec" ON public.profiles FOR DELETE TO authenticated USING (public.is_executive());

-- Projects: Executives view all; Managers view their projects; Members view projects they belong to
CREATE POLICY "projects_select" ON public.projects FOR SELECT TO authenticated USING (
  public.is_executive()
  OR manager_id = auth.uid()
  OR auth.uid()::text = ANY(member_ids)
);
CREATE POLICY "projects_insert" ON public.projects FOR INSERT TO authenticated WITH CHECK (
  public.is_executive()
  OR (public.is_manager() AND manager_id = auth.uid())
);
CREATE POLICY "projects_update" ON public.projects FOR UPDATE TO authenticated USING (
  public.is_executive()
  OR manager_id = auth.uid()
);
CREATE POLICY "projects_delete" ON public.projects FOR DELETE TO authenticated USING (
  public.is_executive()
);

-- Modules: Inherit access from parent project
CREATE POLICY "modules_select" ON public.modules FOR SELECT TO authenticated USING (
  public.is_executive()
  OR EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = modules.project_id
      AND (p.manager_id = auth.uid() OR auth.uid()::text = ANY(p.member_ids))
  )
);
CREATE POLICY "modules_write" ON public.modules FOR ALL TO authenticated USING (
  public.is_executive()
  OR EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = modules.project_id AND p.manager_id = auth.uid()
  )
);

-- Tasks:
-- Executives: full access
-- Managers: full access in their managed projects
-- Members: view tasks in assigned projects/tasks; update assigned tasks (status/submissions)
CREATE POLICY "tasks_select" ON public.tasks FOR SELECT TO authenticated USING (
  public.is_executive()
  OR assignee_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = tasks.project_id
      AND (p.manager_id = auth.uid() OR auth.uid()::text = ANY(p.member_ids))
  )
);
CREATE POLICY "tasks_insert" ON public.tasks FOR INSERT TO authenticated WITH CHECK (
  public.is_executive()
  OR EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = tasks.project_id AND p.manager_id = auth.uid()
  )
);
CREATE POLICY "tasks_update" ON public.tasks FOR UPDATE TO authenticated USING (
  public.is_executive()
  OR assignee_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = tasks.project_id AND p.manager_id = auth.uid()
  )
);
CREATE POLICY "tasks_delete" ON public.tasks FOR DELETE TO authenticated USING (
  public.is_executive()
  OR EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = tasks.project_id AND p.manager_id = auth.uid()
  )
);

-- Task Checklists & Submissions
CREATE POLICY "task_checklists_all" ON public.task_checklists FOR ALL TO authenticated USING (true);
CREATE POLICY "task_submissions_all" ON public.task_submissions FOR ALL TO authenticated USING (true);

-- Attendance:
-- Executives: see all
-- Managers: see team members in their projects
-- Members: see/record ONLY their own attendance
CREATE POLICY "attendance_select" ON public.attendance_records FOR SELECT TO authenticated USING (
  public.is_executive()
  OR user_id = auth.uid()
  OR (
    public.is_manager() AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.manager_id = auth.uid() AND attendance_records.user_id::text = ANY(p.member_ids)
    )
  )
);
CREATE POLICY "attendance_insert_self" ON public.attendance_records FOR INSERT TO authenticated WITH CHECK (
  user_id = auth.uid() OR public.is_executive()
);
CREATE POLICY "attendance_update_self" ON public.attendance_records FOR UPDATE TO authenticated USING (
  user_id = auth.uid() OR public.is_executive()
);

-- Daily Reports:
-- Executives: see all
-- Managers: see reports from members in their projects
-- Members: see and insert ONLY their own reports
CREATE POLICY "daily_reports_select" ON public.daily_reports FOR SELECT TO authenticated USING (
  public.is_executive()
  OR user_id = auth.uid()
  OR (
    public.is_manager() AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.manager_id = auth.uid() AND daily_reports.user_id::text = ANY(p.member_ids)
    )
  )
);
CREATE POLICY "daily_reports_insert_self" ON public.daily_reports FOR INSERT TO authenticated WITH CHECK (
  user_id = auth.uid()
);
CREATE POLICY "daily_reports_update_self" ON public.daily_reports FOR UPDATE TO authenticated USING (
  user_id = auth.uid() OR public.is_executive()
);

-- Leave Requests:
-- Executives/Managers: view and review team requests
-- Members: view and create ONLY their own requests
CREATE POLICY "leave_select" ON public.leave_requests FOR SELECT TO authenticated USING (
  public.is_executive()
  OR public.is_manager()
  OR user_id = auth.uid()
);
CREATE POLICY "leave_insert_self" ON public.leave_requests FOR INSERT TO authenticated WITH CHECK (
  user_id = auth.uid()
);
CREATE POLICY "leave_update_mgr" ON public.leave_requests FOR UPDATE TO authenticated USING (
  public.is_executive() OR public.is_manager() OR user_id = auth.uid()
);

-- Meetings: View if host, participant, or executive
CREATE POLICY "meetings_select" ON public.meetings FOR SELECT TO authenticated USING (
  public.is_executive()
  OR host_id = auth.uid()
  OR auth.uid()::text = ANY(participant_ids)
);
CREATE POLICY "meetings_insert" ON public.meetings FOR INSERT TO authenticated WITH CHECK (
  host_id = auth.uid() OR public.is_executive()
);
CREATE POLICY "meetings_update" ON public.meetings FOR UPDATE TO authenticated USING (
  host_id = auth.uid() OR public.is_executive()
);
CREATE POLICY "meetings_delete" ON public.meetings FOR DELETE TO authenticated USING (
  host_id = auth.uid() OR public.is_executive()
);

-- Notifications: User's own notifications or broadcasts
CREATE POLICY "notifications_select" ON public.notifications FOR SELECT TO authenticated USING (
  user_id = auth.uid()::text OR user_id = 'all'
);
CREATE POLICY "notifications_update" ON public.notifications FOR UPDATE TO authenticated USING (
  user_id = auth.uid()::text
);

-- Chat Channels & Messages
CREATE POLICY "channels_select" ON public.chat_channels FOR SELECT TO authenticated USING (
  type = 'general' OR auth.uid()::text = ANY(member_ids) OR public.is_executive()
);
CREATE POLICY "channels_insert" ON public.chat_channels FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "messages_select" ON public.chat_messages FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.chat_channels c
    WHERE c.id = chat_messages.channel_id
      AND (c.type = 'general' OR auth.uid()::text = ANY(c.member_ids) OR public.is_executive())
  )
);
CREATE POLICY "messages_insert" ON public.chat_messages FOR INSERT TO authenticated WITH CHECK (
  sender_id = auth.uid()
);

-- Folders & Files
CREATE POLICY "folders_all" ON public.folders FOR ALL TO authenticated USING (true);
CREATE POLICY "files_all" ON public.files FOR ALL TO authenticated USING (true);

-- Announcements: Viewable if published; writeable by executives and managers
CREATE POLICY "announcements_select" ON public.announcements FOR SELECT TO authenticated USING (
  is_published = true OR public.is_executive() OR public.is_manager()
);
CREATE POLICY "announcements_write" ON public.announcements FOR ALL TO authenticated USING (
  public.is_executive() OR public.is_manager()
);

-- ============================================================
-- 8. SUPABASE REALTIME REPLICATION CONFIGURATION
-- ============================================================
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.attendance_records;
EXCEPTION
  WHEN undefined_object THEN null;
  WHEN others THEN null;
END $$;

-- ============================================================
-- 9. AUTO-CONFIRM TRIGGER (INSTANT REGISTRATION WITHOUT EMAIL LINK)
-- ============================================================
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

-- ============================================================
-- 10. ROLE SYNCHRONIZATION FOR EXISTING ACCOUNTS
-- Dharshan -> Admin (EMP-003)
-- Vignesh  -> CEO (EMP-001)
-- Jashwin  -> COO (EMP-002)
-- Asthamil -> Manager (EMP-004)
-- ============================================================
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

