-- ============================================================
-- HYNA STUDIO MANAGEMENT - LIVE DEVELOPER ACTIVITY TRACKING
-- Migration: 20260927000000_live_developer_activity.sql
-- Compatible with Supabase / PostgreSQL 14+
-- Privacy-conscious IDE Activity Tracking (VS Code, Cursor, Antigravity)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- 1. DEVELOPER INTEGRATIONS TABLE
-- Tracks connected IDEs (VS Code, Cursor, Antigravity) per user & device
-- ============================================================
CREATE TABLE IF NOT EXISTS public.developer_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tool TEXT NOT NULL CHECK (tool IN ('vscode', 'cursor', 'antigravity')),
  status TEXT NOT NULL DEFAULT 'connected' CHECK (status IN ('connected', 'disconnected')),
  device_name TEXT NOT NULL DEFAULT 'Developer Workstation',
  connection_code TEXT,
  api_key TEXT,
  last_connected_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT uq_developer_integration_user_tool_device UNIQUE (user_id, tool, device_name)
);

CREATE INDEX IF NOT EXISTS idx_dev_integrations_user_tool 
  ON public.developer_integrations(user_id, tool);
CREATE INDEX IF NOT EXISTS idx_dev_integrations_code 
  ON public.developer_integrations(connection_code);
CREATE INDEX IF NOT EXISTS idx_dev_integrations_api_key 
  ON public.developer_integrations(api_key);

-- ============================================================
-- 2. DEVELOPER SESSIONS TABLE
-- Tracks active / idle / ended live working sessions
-- ============================================================
CREATE TABLE IF NOT EXISTS public.developer_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  integration_id UUID REFERENCES public.developer_integrations(id) ON DELETE SET NULL,
  project_id TEXT REFERENCES public.projects(id) ON DELETE SET NULL,
  task_id TEXT REFERENCES public.tasks(id) ON DELETE SET NULL,
  tool TEXT NOT NULL CHECK (tool IN ('vscode', 'cursor', 'antigravity')),
  workspace_name TEXT DEFAULT '',
  current_file TEXT DEFAULT '',
  git_branch TEXT DEFAULT '',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'idle', 'ended')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dev_sessions_user_status 
  ON public.developer_sessions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_dev_sessions_last_activity 
  ON public.developer_sessions(last_activity_at DESC);
CREATE INDEX IF NOT EXISTS idx_dev_sessions_project 
  ON public.developer_sessions(project_id);

-- ============================================================
-- 3. DEVELOPER ACTIVITY EVENTS TABLE
-- Immutable event stream of safe activity events (heartbeats, git, tasks)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.developer_activity_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  session_id UUID REFERENCES public.developer_sessions(id) ON DELETE CASCADE,
  project_id TEXT REFERENCES public.projects(id) ON DELETE SET NULL,
  task_id TEXT REFERENCES public.tasks(id) ON DELETE SET NULL,
  tool TEXT NOT NULL CHECK (tool IN ('vscode', 'cursor', 'antigravity')),
  event_type TEXT NOT NULL CHECK (
    event_type IN (
      'session_started',
      'session_heartbeat',
      'file_activity',
      'workspace_changed',
      'task_started',
      'task_changed',
      'idle',
      'active',
      'session_ended'
    )
  ),
  workspace_name TEXT DEFAULT '',
  file_name TEXT DEFAULT '',
  file_path TEXT DEFAULT '',
  git_branch TEXT DEFAULT '',
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dev_events_user_created 
  ON public.developer_activity_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dev_events_session 
  ON public.developer_activity_events(session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dev_events_tool 
  ON public.developer_activity_events(tool);

-- ============================================================
-- 4. UPDATED_AT TRIGGERS
-- ============================================================
DO $$ BEGIN
  DROP TRIGGER IF EXISTS trg_dev_integrations_updated_at ON public.developer_integrations;
  CREATE TRIGGER trg_dev_integrations_updated_at 
    BEFORE UPDATE ON public.developer_integrations 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN others THEN null;
END $$;

DO $$ BEGIN
  DROP TRIGGER IF EXISTS trg_dev_sessions_updated_at ON public.developer_sessions;
  CREATE TRIGGER trg_dev_sessions_updated_at 
    BEFORE UPDATE ON public.developer_sessions 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN others THEN null;
END $$;

-- ============================================================
-- 5. ROW LEVEL SECURITY (RLS) POLICIES
-- Strict verification: Users cannot impersonate others, managers see
-- only assigned members, executives see organization-wide.
-- ============================================================
ALTER TABLE public.developer_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.developer_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.developer_activity_events ENABLE ROW LEVEL SECURITY;

-- Clean existing policies
DO $$ BEGIN
  DROP POLICY IF EXISTS "dev_integrations_select" ON public.developer_integrations;
  DROP POLICY IF EXISTS "dev_integrations_insert" ON public.developer_integrations;
  DROP POLICY IF EXISTS "dev_integrations_update" ON public.developer_integrations;
  DROP POLICY IF EXISTS "dev_integrations_delete" ON public.developer_integrations;

  DROP POLICY IF EXISTS "dev_sessions_select" ON public.developer_sessions;
  DROP POLICY IF EXISTS "dev_sessions_insert" ON public.developer_sessions;
  DROP POLICY IF EXISTS "dev_sessions_update" ON public.developer_sessions;
  DROP POLICY IF EXISTS "dev_sessions_delete" ON public.developer_sessions;

  DROP POLICY IF EXISTS "dev_events_select" ON public.developer_activity_events;
  DROP POLICY IF EXISTS "dev_events_insert" ON public.developer_activity_events;
  DROP POLICY IF EXISTS "dev_events_update" ON public.developer_activity_events;
  DROP POLICY IF EXISTS "dev_events_delete" ON public.developer_activity_events;
EXCEPTION WHEN others THEN null;
END $$;

-- ------------------------------------------------------------
-- developer_integrations Policies
-- ------------------------------------------------------------
CREATE POLICY "dev_integrations_select"
  ON public.developer_integrations
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid() OR public.is_executive()
  );

CREATE POLICY "dev_integrations_insert"
  ON public.developer_integrations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
  );

CREATE POLICY "dev_integrations_update"
  ON public.developer_integrations
  FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid() OR public.is_executive()
  )
  WITH CHECK (
    user_id = auth.uid() OR public.is_executive()
  );

CREATE POLICY "dev_integrations_delete"
  ON public.developer_integrations
  FOR DELETE
  TO authenticated
  USING (
    user_id = auth.uid() OR public.is_executive()
  );

-- ------------------------------------------------------------
-- developer_sessions Policies
-- Members view own, Managers view assigned project members, Executives view all
-- ------------------------------------------------------------
CREATE POLICY "dev_sessions_select"
  ON public.developer_sessions
  FOR SELECT
  TO authenticated
  USING (
    public.is_executive()
    OR user_id = auth.uid()
    OR (
      public.is_manager() AND EXISTS (
        SELECT 1 FROM public.projects p
        WHERE p.manager_id = auth.uid()
          AND developer_sessions.user_id::text = ANY(p.member_ids)
      )
    )
  );

CREATE POLICY "dev_sessions_insert"
  ON public.developer_sessions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
  );

CREATE POLICY "dev_sessions_update"
  ON public.developer_sessions
  FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid() OR public.is_executive()
  )
  WITH CHECK (
    user_id = auth.uid() OR public.is_executive()
  );

CREATE POLICY "dev_sessions_delete"
  ON public.developer_sessions
  FOR DELETE
  TO authenticated
  USING (
    public.is_executive()
  );

-- ------------------------------------------------------------
-- developer_activity_events Policies
-- Members view own, Managers view assigned project members, Executives view all
-- ------------------------------------------------------------
CREATE POLICY "dev_events_select"
  ON public.developer_activity_events
  FOR SELECT
  TO authenticated
  USING (
    public.is_executive()
    OR user_id = auth.uid()
    OR (
      public.is_manager() AND EXISTS (
        SELECT 1 FROM public.projects p
        WHERE p.manager_id = auth.uid()
          AND developer_activity_events.user_id::text = ANY(p.member_ids)
      )
    )
  );

CREATE POLICY "dev_events_insert"
  ON public.developer_activity_events
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
  );

CREATE POLICY "dev_events_update"
  ON public.developer_activity_events
  FOR UPDATE
  TO authenticated
  USING (
    public.is_executive()
  );

CREATE POLICY "dev_events_delete"
  ON public.developer_activity_events
  FOR DELETE
  TO authenticated
  USING (
    public.is_executive()
  );

-- ============================================================
-- 6. REALTIME REPLICATION PUBLICATION
-- Enable live broadcast for real-time manager dashboard updates
-- ============================================================
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.developer_integrations;
EXCEPTION WHEN duplicate_object THEN null;
WHEN others THEN null;
END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.developer_sessions;
EXCEPTION WHEN duplicate_object THEN null;
WHEN others THEN null;
END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.developer_activity_events;
EXCEPTION WHEN duplicate_object THEN null;
WHEN others THEN null;
END $$;

-- ============================================================
-- 7. RPC FUNCTION FOR ATOMIC IDE PAIRING
-- ============================================================
CREATE OR REPLACE FUNCTION public.verify_developer_connection_code(
  p_code TEXT,
  p_tool TEXT,
  p_device_name TEXT DEFAULT 'Developer Machine'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_rec RECORD;
  v_api_key TEXT;
BEGIN
  IF p_code IS NULL OR length(trim(p_code)) < 4 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid pairing code format');
  END IF;

  SELECT * INTO v_rec
  FROM public.developer_integrations
  WHERE connection_code = upper(trim(p_code))
    AND tool = lower(trim(p_tool))
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid or expired pairing code');
  END IF;

  v_api_key := 'hyna_' || lower(trim(p_tool)) || '_' || encode(gen_random_bytes(16), 'hex');

  -- Remove any stale duplicate integration for the same user, tool, and device
  DELETE FROM public.developer_integrations
  WHERE user_id = v_rec.user_id
    AND tool = v_rec.tool
    AND p_device_name IS NOT NULL
    AND length(trim(p_device_name)) > 0
    AND device_name = trim(p_device_name)
    AND id != v_rec.id;

  UPDATE public.developer_integrations
  SET status = 'connected',
      device_name = COALESCE(NULLIF(trim(p_device_name), ''), device_name),
      api_key = v_api_key,
      connection_code = NULL,
      last_connected_at = NOW(),
      last_seen_at = NOW(),
      updated_at = NOW()
  WHERE id = v_rec.id;

  RETURN jsonb_build_object(
    'success', true,
    'user_id', v_rec.user_id,
    'integration_id', v_rec.id,
    'api_key', v_api_key,
    'tool', v_rec.tool
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_developer_connection_code TO anon, authenticated;

