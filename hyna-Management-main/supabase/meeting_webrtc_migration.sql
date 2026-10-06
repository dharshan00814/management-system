-- ====================================================================
-- HYNA STUDIO: GROUP VIDEO & AUDIO MEETINGS + WEBRTC + ATTENDANCE MIGRATION
-- Run this script in your Supabase Dashboard -> SQL Editor
-- Fully idempotent and resilient against pre-existing tables/columns
-- ====================================================================

-- 1. EXTEND MEETINGS TABLE WITH ROOM ID, MEDIA TYPE, AND LIFECYCLE TIMESTAMPS
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS meeting_room_id TEXT;
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS meeting_type TEXT DEFAULT 'video';
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ;

-- Backfill meeting_room_id for existing meetings if empty
UPDATE public.meetings 
SET meeting_room_id = 'room_' || encode(gen_random_bytes(8), 'hex') 
WHERE meeting_room_id IS NULL OR meeting_room_id = '';

-- Backfill created_by with host_id if empty
UPDATE public.meetings
SET created_by = host_id
WHERE created_by IS NULL AND host_id IS NOT NULL;

-- Backfill meeting_link if empty to point to internal meeting room
UPDATE public.meetings
SET meeting_link = '/meeting/' || meeting_room_id
WHERE meeting_link IS NULL OR meeting_link = '';

-- Create indexes on meetings
CREATE UNIQUE INDEX IF NOT EXISTS idx_meetings_room_id ON public.meetings(meeting_room_id);
CREATE INDEX IF NOT EXISTS idx_meetings_status ON public.meetings(status);
CREATE INDEX IF NOT EXISTS idx_meetings_host_id ON public.meetings(host_id);
CREATE INDEX IF NOT EXISTS idx_meetings_created_by ON public.meetings(created_by);

-- 2. CREATE / ENSURE MEETING PARTICIPANTS TABLE
CREATE TABLE IF NOT EXISTS public.meeting_participants (
  id TEXT PRIMARY KEY DEFAULT ('mtp_' || encode(gen_random_bytes(6), 'hex')),
  meeting_id TEXT NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  member_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  invited_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  invited_at TIMESTAMPTZ DEFAULT NOW(),
  joined_at TIMESTAMPTZ,
  left_at TIMESTAMPTZ,
  status TEXT DEFAULT 'invited',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Crucial: Ensure member_id and user_id columns exist even if table was created previously with older schema
ALTER TABLE public.meeting_participants ADD COLUMN IF NOT EXISTS meeting_id TEXT REFERENCES public.meetings(id) ON DELETE CASCADE;
ALTER TABLE public.meeting_participants ADD COLUMN IF NOT EXISTS member_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.meeting_participants ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.meeting_participants ADD COLUMN IF NOT EXISTS invited_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.meeting_participants ADD COLUMN IF NOT EXISTS invited_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.meeting_participants ADD COLUMN IF NOT EXISTS joined_at TIMESTAMPTZ;
ALTER TABLE public.meeting_participants ADD COLUMN IF NOT EXISTS left_at TIMESTAMPTZ;
ALTER TABLE public.meeting_participants ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'invited';
ALTER TABLE public.meeting_participants ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.meeting_participants ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Bi-directional backfill between member_id and user_id for maximum compatibility
UPDATE public.meeting_participants SET member_id = user_id WHERE member_id IS NULL AND user_id IS NOT NULL;
UPDATE public.meeting_participants SET user_id = member_id WHERE user_id IS NULL AND member_id IS NOT NULL;

-- Indexes for meeting_participants
CREATE INDEX IF NOT EXISTS idx_meeting_participants_meeting_id ON public.meeting_participants(meeting_id);
CREATE INDEX IF NOT EXISTS idx_meeting_participants_member_id ON public.meeting_participants(member_id);
CREATE INDEX IF NOT EXISTS idx_meeting_participants_status ON public.meeting_participants(status);

-- Safe Unique Constraint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_meeting_participant') THEN
    ALTER TABLE public.meeting_participants ADD CONSTRAINT uq_meeting_participant UNIQUE (meeting_id, member_id);
  END IF;
EXCEPTION
  WHEN others THEN null;
END $$;

-- 3. CREATE / ENSURE MEETING ATTENDANCE TABLE (AUTOMATIC TRACKING)
CREATE TABLE IF NOT EXISTS public.meeting_attendance (
  id TEXT PRIMARY KEY DEFAULT ('mta_' || encode(gen_random_bytes(6), 'hex')),
  meeting_id TEXT NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  member_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  left_at TIMESTAMPTZ,
  duration_seconds INTEGER DEFAULT 0,
  status TEXT DEFAULT 'joined',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Crucial: Ensure member_id and user_id columns exist even if table was created previously
ALTER TABLE public.meeting_attendance ADD COLUMN IF NOT EXISTS meeting_id TEXT REFERENCES public.meetings(id) ON DELETE CASCADE;
ALTER TABLE public.meeting_attendance ADD COLUMN IF NOT EXISTS member_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.meeting_attendance ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.meeting_attendance ADD COLUMN IF NOT EXISTS joined_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.meeting_attendance ADD COLUMN IF NOT EXISTS left_at TIMESTAMPTZ;
ALTER TABLE public.meeting_attendance ADD COLUMN IF NOT EXISTS duration_seconds INTEGER DEFAULT 0;
ALTER TABLE public.meeting_attendance ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'joined';
ALTER TABLE public.meeting_attendance ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.meeting_attendance ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Bi-directional backfill between member_id and user_id
UPDATE public.meeting_attendance SET member_id = user_id WHERE member_id IS NULL AND user_id IS NOT NULL;
UPDATE public.meeting_attendance SET user_id = member_id WHERE user_id IS NULL AND member_id IS NOT NULL;

-- Indexes for meeting_attendance
CREATE INDEX IF NOT EXISTS idx_meeting_attendance_meeting_id ON public.meeting_attendance(meeting_id);
CREATE INDEX IF NOT EXISTS idx_meeting_attendance_member_id ON public.meeting_attendance(member_id);

-- Safe Unique Constraint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_meeting_attendance') THEN
    ALTER TABLE public.meeting_attendance ADD CONSTRAINT uq_meeting_attendance UNIQUE (meeting_id, member_id);
  END IF;
EXCEPTION
  WHEN others THEN null;
END $$;

-- 4. CREATE MEETING MESSAGES TABLE (IN-MEETING CHAT PERSISTENCE)
CREATE TABLE IF NOT EXISTS public.meeting_messages (
  id TEXT PRIMARY KEY DEFAULT ('mtm_' || encode(gen_random_bytes(6), 'hex')),
  meeting_id TEXT NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meeting_messages_meeting_id ON public.meeting_messages(meeting_id);
CREATE INDEX IF NOT EXISTS idx_meeting_messages_created_at ON public.meeting_messages(created_at);

-- 5. TRIGGER FOR UPDATED_AT COLUMNS
DROP TRIGGER IF EXISTS trg_meeting_participants_updated_at ON public.meeting_participants;
CREATE TRIGGER trg_meeting_participants_updated_at
  BEFORE UPDATE ON public.meeting_participants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_meeting_attendance_updated_at ON public.meeting_attendance;
CREATE TRIGGER trg_meeting_attendance_updated_at
  BEFORE UPDATE ON public.meeting_attendance
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6. ENABLE ROW LEVEL SECURITY (RLS)
ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_messages ENABLE ROW LEVEL SECURITY;

-- 7. CLEAN & NON-RECURSIVE RLS POLICIES (NO MUTUAL SUBQUERIES)

-- MEETINGS:
DROP POLICY IF EXISTS "meetings_select_policy" ON public.meetings;
DROP POLICY IF EXISTS "meetings_select_all_authenticated" ON public.meetings;
DROP POLICY IF EXISTS "meetings_select" ON public.meetings;

CREATE POLICY "meetings_select_policy" ON public.meetings
  FOR SELECT TO authenticated
  USING (
    auth.uid() IS NOT NULL
  );

DROP POLICY IF EXISTS "meetings_insert_policy" ON public.meetings;
DROP POLICY IF EXISTS "meetings_insert" ON public.meetings;

CREATE POLICY "meetings_insert_policy" ON public.meetings
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
  );

DROP POLICY IF EXISTS "meetings_update_policy" ON public.meetings;
DROP POLICY IF EXISTS "meetings_update" ON public.meetings;

CREATE POLICY "meetings_update_policy" ON public.meetings
  FOR UPDATE TO authenticated
  USING (
    host_id = auth.uid()
    OR created_by = auth.uid()
    OR public.is_executive()
    OR public.is_manager()
    OR auth.uid()::text = ANY(participant_ids)
  );

DROP POLICY IF EXISTS "meetings_delete_policy" ON public.meetings;
DROP POLICY IF EXISTS "meetings_delete" ON public.meetings;

CREATE POLICY "meetings_delete_policy" ON public.meetings
  FOR DELETE TO authenticated
  USING (
    host_id = auth.uid()
    OR created_by = auth.uid()
    OR public.is_executive()
  );

-- MEETING PARTICIPANTS:
DROP POLICY IF EXISTS "meeting_participants_select" ON public.meeting_participants;
CREATE POLICY "meeting_participants_select" ON public.meeting_participants
  FOR SELECT TO authenticated
  USING (
    auth.uid() IS NOT NULL
  );

DROP POLICY IF EXISTS "meeting_participants_insert" ON public.meeting_participants;
CREATE POLICY "meeting_participants_insert" ON public.meeting_participants
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
  );

DROP POLICY IF EXISTS "meeting_participants_update" ON public.meeting_participants;
CREATE POLICY "meeting_participants_update" ON public.meeting_participants
  FOR UPDATE TO authenticated
  USING (
    member_id::text = auth.uid()::text
    OR user_id::text = auth.uid()::text
    OR invited_by = auth.uid()
    OR public.is_executive()
    OR public.is_manager()
  );

DROP POLICY IF EXISTS "meeting_participants_delete" ON public.meeting_participants;
CREATE POLICY "meeting_participants_delete" ON public.meeting_participants
  FOR DELETE TO authenticated
  USING (
    member_id::text = auth.uid()::text
    OR invited_by = auth.uid()
    OR public.is_executive()
  );

-- MEETING ATTENDANCE:
DROP POLICY IF EXISTS "meeting_attendance_select" ON public.meeting_attendance;
CREATE POLICY "meeting_attendance_select" ON public.meeting_attendance
  FOR SELECT TO authenticated
  USING (
    auth.uid() IS NOT NULL
  );

DROP POLICY IF EXISTS "meeting_attendance_insert" ON public.meeting_attendance;
CREATE POLICY "meeting_attendance_insert" ON public.meeting_attendance
  FOR INSERT TO authenticated
  WITH CHECK (
    member_id::text = auth.uid()::text
    OR user_id::text = auth.uid()::text
    OR public.is_executive()
  );

DROP POLICY IF EXISTS "meeting_attendance_update" ON public.meeting_attendance;
CREATE POLICY "meeting_attendance_update" ON public.meeting_attendance
  FOR UPDATE TO authenticated
  USING (
    member_id::text = auth.uid()::text
    OR user_id::text = auth.uid()::text
    OR public.is_executive()
  );

DROP POLICY IF EXISTS "meeting_attendance_delete" ON public.meeting_attendance;
CREATE POLICY "meeting_attendance_delete" ON public.meeting_attendance
  FOR DELETE TO authenticated
  USING (
    member_id::text = auth.uid()::text
    OR user_id::text = auth.uid()::text
    OR public.is_executive()
  );

-- MEETING MESSAGES:
DROP POLICY IF EXISTS "meeting_messages_select" ON public.meeting_messages;
CREATE POLICY "meeting_messages_select" ON public.meeting_messages
  FOR SELECT TO authenticated
  USING (
    auth.uid() IS NOT NULL
  );

DROP POLICY IF EXISTS "meeting_messages_insert" ON public.meeting_messages;
CREATE POLICY "meeting_messages_insert" ON public.meeting_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
  );

DROP POLICY IF EXISTS "meeting_messages_delete" ON public.meeting_messages;
CREATE POLICY "meeting_messages_delete" ON public.meeting_messages
  FOR DELETE TO authenticated
  USING (
    sender_id = auth.uid()
    OR public.is_executive()
  );

-- 8. REALTIME REPLICATION SETUP
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'meetings'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.meetings;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'meeting_participants'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.meeting_participants;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'meeting_attendance'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.meeting_attendance;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'meeting_messages'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.meeting_messages;
    END IF;
  END IF;
END $$;

-- 9. SAFE ENUM CONFIGURATION: Ensure meeting_status exists and supports 'live' without 42710 error
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'meeting_status') THEN
    CREATE TYPE public.meeting_status AS ENUM ('scheduled', 'in-progress', 'completed', 'cancelled', 'live');
  END IF;
END $$;

ALTER TYPE public.meeting_status ADD VALUE IF NOT EXISTS 'live';

