CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. CREATE / ENSURE MEETINGS TABLE
CREATE TABLE IF NOT EXISTS public.meetings (
  id TEXT PRIMARY KEY DEFAULT ('mt_' || encode(gen_random_bytes(6), 'hex')),
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  host_id TEXT,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  participant_ids TEXT[] DEFAULT '{}',
  type TEXT DEFAULT 'team',
  meeting_type TEXT DEFAULT 'video',
  meeting_room_id TEXT,
  is_recurring BOOLEAN DEFAULT false,
  meeting_link TEXT DEFAULT '',
  status TEXT DEFAULT 'scheduled',
  notes TEXT DEFAULT '',
  scheduled_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure all required columns exist on meetings (for preexisting tables)
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS date TEXT;
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS start_time TEXT;
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS end_time TEXT;
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS host_id TEXT;
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS participant_ids TEXT[] DEFAULT '{}';
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'team';
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS meeting_type TEXT DEFAULT 'video';
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS meeting_room_id TEXT;
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN DEFAULT false;
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS meeting_link TEXT DEFAULT '';
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'scheduled';
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT '';
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ;
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Backfill meeting_room_id and links if empty
UPDATE public.meetings
SET meeting_room_id = 'room_' || encode(gen_random_bytes(8), 'hex')
WHERE meeting_room_id IS NULL OR meeting_room_id = '';

UPDATE public.meetings
SET meeting_link = '/meeting/' || meeting_room_id
WHERE meeting_link IS NULL OR meeting_link = '';

-- Indexes for meetings
CREATE INDEX IF NOT EXISTS idx_meetings_room_id ON public.meetings(meeting_room_id);
CREATE INDEX IF NOT EXISTS idx_meetings_status ON public.meetings(status);
CREATE INDEX IF NOT EXISTS idx_meetings_host_id ON public.meetings(host_id);
CREATE INDEX IF NOT EXISTS idx_meetings_created_by ON public.meetings(created_by);
CREATE INDEX IF NOT EXISTS idx_meetings_date ON public.meetings(date);

-- 3. CREATE / ENSURE MEETING PARTICIPANTS TABLE
CREATE TABLE IF NOT EXISTS public.meeting_participants (
  id TEXT PRIMARY KEY DEFAULT ('mtp_' || encode(gen_random_bytes(6), 'hex')),
  meeting_id TEXT NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  member_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  invited_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  invited_at TIMESTAMPTZ DEFAULT NOW(),
  joined_at TIMESTAMPTZ,
  left_at TIMESTAMPTZ,
  status TEXT DEFAULT 'invited',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.meeting_participants ADD COLUMN IF NOT EXISTS meeting_id TEXT REFERENCES public.meetings(id) ON DELETE CASCADE;
ALTER TABLE public.meeting_participants ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.meeting_participants ADD COLUMN IF NOT EXISTS member_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.meeting_participants ADD COLUMN IF NOT EXISTS invited_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.meeting_participants ADD COLUMN IF NOT EXISTS invited_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.meeting_participants ADD COLUMN IF NOT EXISTS joined_at TIMESTAMPTZ;
ALTER TABLE public.meeting_participants ADD COLUMN IF NOT EXISTS left_at TIMESTAMPTZ;
ALTER TABLE public.meeting_participants ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'invited';
ALTER TABLE public.meeting_participants ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.meeting_participants ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_meeting_participants_meeting_id ON public.meeting_participants(meeting_id);
CREATE INDEX IF NOT EXISTS idx_meeting_participants_user_id ON public.meeting_participants(user_id);

-- 4. CREATE / ENSURE MEETING ATTENDANCE TABLE
CREATE TABLE IF NOT EXISTS public.meeting_attendance (
  id TEXT PRIMARY KEY DEFAULT ('mta_' || encode(gen_random_bytes(6), 'hex')),
  meeting_id TEXT NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  member_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  left_at TIMESTAMPTZ,
  duration_seconds INTEGER DEFAULT 0,
  status TEXT DEFAULT 'joined',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.meeting_attendance ADD COLUMN IF NOT EXISTS meeting_id TEXT REFERENCES public.meetings(id) ON DELETE CASCADE;
ALTER TABLE public.meeting_attendance ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.meeting_attendance ADD COLUMN IF NOT EXISTS member_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.meeting_attendance ADD COLUMN IF NOT EXISTS joined_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.meeting_attendance ADD COLUMN IF NOT EXISTS left_at TIMESTAMPTZ;
ALTER TABLE public.meeting_attendance ADD COLUMN IF NOT EXISTS duration_seconds INTEGER DEFAULT 0;
ALTER TABLE public.meeting_attendance ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'joined';
ALTER TABLE public.meeting_attendance ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.meeting_attendance ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_meeting_attendance_meeting_id ON public.meeting_attendance(meeting_id);
CREATE INDEX IF NOT EXISTS idx_meeting_attendance_user_id ON public.meeting_attendance(user_id);

-- 5. CREATE / ENSURE MEETING MESSAGES TABLE (IN-CALL CHAT)
CREATE TABLE IF NOT EXISTS public.meeting_messages (
  id TEXT PRIMARY KEY DEFAULT ('mtm_' || encode(gen_random_bytes(6), 'hex')),
  meeting_id TEXT NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  sender_name TEXT,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.meeting_messages ADD COLUMN IF NOT EXISTS meeting_id TEXT REFERENCES public.meetings(id) ON DELETE CASCADE;
ALTER TABLE public.meeting_messages ADD COLUMN IF NOT EXISTS sender_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.meeting_messages ADD COLUMN IF NOT EXISTS sender_name TEXT;
ALTER TABLE public.meeting_messages ADD COLUMN IF NOT EXISTS message TEXT;
ALTER TABLE public.meeting_messages ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_meeting_messages_meeting_id ON public.meeting_messages(meeting_id);
CREATE INDEX IF NOT EXISTS idx_meeting_messages_created_at ON public.meeting_messages(created_at);

-- 6. REMOVE DEMO / SAMPLE / SPECIFIED MEETINGS
DELETE FROM public.meeting_messages
WHERE meeting_id IN (
  SELECT id FROM public.meetings
  WHERE LOWER(TRIM(title)) IN (
    'summa', 'testing01', 'testing02', 'daily engineering standup',
    'product review & sprint demo', 'vvv', 'hi', 'ast', 'core architecture & security sync'
  ) OR id IN ('mt_standup_daily', 'mt_product_review', 'mt_arch_planning', 'mt_apeavegg', 'mt_wt94rs6f')
);

DELETE FROM public.meeting_attendance
WHERE meeting_id IN (
  SELECT id FROM public.meetings
  WHERE LOWER(TRIM(title)) IN (
    'summa', 'testing01', 'testing02', 'daily engineering standup',
    'product review & sprint demo', 'vvv', 'hi', 'ast', 'core architecture & security sync'
  ) OR id IN ('mt_standup_daily', 'mt_product_review', 'mt_arch_planning', 'mt_apeavegg', 'mt_wt94rs6f')
);

DELETE FROM public.meeting_participants
WHERE meeting_id IN (
  SELECT id FROM public.meetings
  WHERE LOWER(TRIM(title)) IN (
    'summa', 'testing01', 'testing02', 'daily engineering standup',
    'product review & sprint demo', 'vvv', 'hi', 'ast', 'core architecture & security sync'
  ) OR id IN ('mt_standup_daily', 'mt_product_review', 'mt_arch_planning', 'mt_apeavegg', 'mt_wt94rs6f')
);

DELETE FROM public.meetings 
WHERE LOWER(TRIM(title)) IN (
  'summa', 'testing01', 'testing02', 'daily engineering standup',
  'product review & sprint demo', 'vvv', 'hi', 'ast', 'core architecture & security sync'
) OR id IN ('mt_standup_daily', 'mt_product_review', 'mt_arch_planning', 'mt_apeavegg', 'mt_wt94rs6f');

-- 7. ENABLE REALTIME BROADCASTING
DO $$
BEGIN
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
EXCEPTION
  WHEN others THEN null;
END $$;

-- 8. ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_messages ENABLE ROW LEVEL SECURITY;

-- Meetings Policies (Clean, direct, non-recursive, guest & team accessible)
DROP POLICY IF EXISTS "meetings_select_policy" ON public.meetings;
DROP POLICY IF EXISTS "meetings_select_all_authenticated" ON public.meetings;
DROP POLICY IF EXISTS "meetings_select" ON public.meetings;
DROP POLICY IF EXISTS "meetings_insert_policy" ON public.meetings;
DROP POLICY IF EXISTS "meetings_insert" ON public.meetings;
DROP POLICY IF EXISTS "meetings_update_policy" ON public.meetings;
DROP POLICY IF EXISTS "meetings_update" ON public.meetings;
DROP POLICY IF EXISTS "meetings_delete_policy" ON public.meetings;
DROP POLICY IF EXISTS "meetings_delete" ON public.meetings;

CREATE POLICY "meetings_select_policy" ON public.meetings
  FOR SELECT TO authenticated, anon
  USING (true);

CREATE POLICY "meetings_insert_policy" ON public.meetings
  FOR INSERT TO authenticated, anon
  WITH CHECK (true);

CREATE POLICY "meetings_update_policy" ON public.meetings
  FOR UPDATE TO authenticated, anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "meetings_delete_policy" ON public.meetings
  FOR DELETE TO authenticated, anon
  USING (true);

-- Meeting Participants Policies
DROP POLICY IF EXISTS "meeting_participants_select" ON public.meeting_participants;
DROP POLICY IF EXISTS "meeting_participants_insert" ON public.meeting_participants;
DROP POLICY IF EXISTS "meeting_participants_update" ON public.meeting_participants;
DROP POLICY IF EXISTS "meeting_participants_delete" ON public.meeting_participants;

CREATE POLICY "meeting_participants_select" ON public.meeting_participants
  FOR SELECT TO authenticated, anon
  USING (true);

CREATE POLICY "meeting_participants_insert" ON public.meeting_participants
  FOR INSERT TO authenticated, anon
  WITH CHECK (true);

CREATE POLICY "meeting_participants_update" ON public.meeting_participants
  FOR UPDATE TO authenticated, anon
  USING (true);

CREATE POLICY "meeting_participants_delete" ON public.meeting_participants
  FOR DELETE TO authenticated, anon
  USING (true);

-- Meeting Attendance Policies
DROP POLICY IF EXISTS "meeting_attendance_select" ON public.meeting_attendance;
DROP POLICY IF EXISTS "meeting_attendance_insert" ON public.meeting_attendance;
DROP POLICY IF EXISTS "meeting_attendance_update" ON public.meeting_attendance;
DROP POLICY IF EXISTS "meeting_attendance_delete" ON public.meeting_attendance;

CREATE POLICY "meeting_attendance_select" ON public.meeting_attendance
  FOR SELECT TO authenticated, anon
  USING (true);

CREATE POLICY "meeting_attendance_insert" ON public.meeting_attendance
  FOR INSERT TO authenticated, anon
  WITH CHECK (true);

CREATE POLICY "meeting_attendance_update" ON public.meeting_attendance
  FOR UPDATE TO authenticated, anon
  USING (true);

CREATE POLICY "meeting_attendance_delete" ON public.meeting_attendance
  FOR DELETE TO authenticated, anon
  USING (true);

-- Meeting Messages Policies (In-Call Chat)
DROP POLICY IF EXISTS "meeting_messages_select" ON public.meeting_messages;
DROP POLICY IF EXISTS "meeting_messages_insert" ON public.meeting_messages;
DROP POLICY IF EXISTS "meeting_messages_delete" ON public.meeting_messages;

CREATE POLICY "meeting_messages_select" ON public.meeting_messages
  FOR SELECT TO authenticated, anon
  USING (true);

CREATE POLICY "meeting_messages_insert" ON public.meeting_messages
  FOR INSERT TO authenticated, anon
  WITH CHECK (true);

CREATE POLICY "meeting_messages_delete" ON public.meeting_messages
  FOR DELETE TO authenticated, anon
  USING (true);
