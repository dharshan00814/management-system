-- ============================================================
-- HYNA STUDIO MANAGEMENT - ACTIVITY TRACKING MIGRATION
-- Compatible with Supabase / PostgreSQL 14+
-- Migration: 20260926000000_activity_tracking.sql
-- Description: Privacy-conscious Development Activity Tracking
-- ============================================================

-- 1. Ensure required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. CREATE TABLE: activity_sessions
CREATE TABLE IF NOT EXISTS public.activity_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  application TEXT NOT NULL,
  project_name TEXT,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ NOT NULL,
  active_seconds INTEGER NOT NULL DEFAULT 0 CHECK (active_seconds >= 0),
  idle_seconds INTEGER NOT NULL DEFAULT 0 CHECK (idle_seconds >= 0),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Validation Constraints
  CONSTRAINT check_session_timestamps CHECK (ended_at >= started_at),
  CONSTRAINT check_application_name CHECK (length(trim(application)) >= 2 AND length(application) <= 100),
  CONSTRAINT check_project_name_len CHECK (project_name IS NULL OR length(project_name) <= 150)
);

-- 3. INDEXES for Performance
CREATE INDEX IF NOT EXISTS idx_activity_sessions_user_id 
  ON public.activity_sessions(user_id);

CREATE INDEX IF NOT EXISTS idx_activity_sessions_started_at 
  ON public.activity_sessions(started_at DESC);

CREATE INDEX IF NOT EXISTS idx_activity_sessions_application 
  ON public.activity_sessions(application);

CREATE INDEX IF NOT EXISTS idx_activity_sessions_user_started 
  ON public.activity_sessions(user_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_activity_sessions_created_at 
  ON public.activity_sessions(created_at DESC);

-- 4. ATTACH UPDATED_AT TRIGGER
DO $$ BEGIN
  DROP TRIGGER IF EXISTS trg_activity_sessions_updated_at ON public.activity_sessions;
  CREATE TRIGGER trg_activity_sessions_updated_at 
    BEFORE UPDATE ON public.activity_sessions 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN others THEN null;
END $$;

-- 5. ROW LEVEL SECURITY (RLS)
ALTER TABLE public.activity_sessions ENABLE ROW LEVEL SECURITY;

-- Clean existing policies for activity_sessions
DO $$ BEGIN
  DROP POLICY IF EXISTS "activity_sessions_select" ON public.activity_sessions;
  DROP POLICY IF EXISTS "activity_sessions_insert" ON public.activity_sessions;
  DROP POLICY IF EXISTS "activity_sessions_update" ON public.activity_sessions;
  DROP POLICY IF EXISTS "activity_sessions_delete" ON public.activity_sessions;
EXCEPTION WHEN others THEN null;
END $$;

-- SELECT POLICY:
-- 1. CEO, CTO, COO, CPO, Admin can view organization-wide activity.
-- 2. Managers can view activity of members who belong to projects they manage.
-- 3. Members can view ONLY their own activity records.
CREATE POLICY "activity_sessions_select" 
  ON public.activity_sessions 
  FOR SELECT 
  TO authenticated 
  USING (
    -- Executive org-wide access
    public.is_executive()
    -- Member self-access
    OR user_id = auth.uid()
    -- Manager team-access (projects where manager is current user and member is assigned)
    OR (
      public.is_manager() AND EXISTS (
        SELECT 1 FROM public.projects p
        WHERE p.manager_id = auth.uid() 
          AND activity_sessions.user_id::text = ANY(p.member_ids)
      )
    )
  );

-- INSERT POLICY:
-- Users can ONLY insert activity sessions for their OWN verified auth identity.
-- Client cannot submit an arbitrary user_id to record activity for another person.
CREATE POLICY "activity_sessions_insert" 
  ON public.activity_sessions 
  FOR INSERT 
  TO authenticated 
  WITH CHECK (
    user_id = auth.uid()
    AND active_seconds >= 0
    AND idle_seconds >= 0
    AND ended_at >= started_at
  );

-- UPDATE POLICY:
-- Users can only modify their own sessions (e.g., closing open local batch), or executive admins.
CREATE POLICY "activity_sessions_update" 
  ON public.activity_sessions 
  FOR UPDATE 
  TO authenticated 
  USING (
    user_id = auth.uid() OR public.is_executive()
  )
  WITH CHECK (
    (user_id = auth.uid() OR public.is_executive())
    AND active_seconds >= 0
    AND idle_seconds >= 0
    AND ended_at >= started_at
  );

-- DELETE POLICY:
-- Strictly limited to Executive Admins for data hygiene / privacy compliance.
CREATE POLICY "activity_sessions_delete" 
  ON public.activity_sessions 
  FOR DELETE 
  TO authenticated 
  USING (
    public.is_executive()
  );

-- 6. REALTIME REPLICATION (Optional: enable for live dashboard updates if needed)
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_sessions;
EXCEPTION WHEN duplicate_object THEN null;
WHEN others THEN null;
END $$;

-- 7. SCHEMA COMPATIBILITY ENHANCEMENTS
DO $$ BEGIN
  ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT '';
  ALTER TABLE public.files ADD COLUMN IF NOT EXISTS uploaded_at TIMESTAMPTZ DEFAULT NOW();
EXCEPTION WHEN others THEN null;
END $$;

