-- ============================================================
-- FIX: Infinite Recursion Detected in Policy for Relation "meetings"
-- Execute this script in your Supabase SQL Editor:
-- https://supabase.com/dashboard/project/bpawtpzyodgzqjeglsye/sql
-- ============================================================

BEGIN;

-- 1. DROP ALL EXISTING / RECURSIVE POLICIES ON MEETINGS
DROP POLICY IF EXISTS "meetings_select_policy" ON public.meetings;
DROP POLICY IF EXISTS "meetings_select_all_authenticated" ON public.meetings;
DROP POLICY IF EXISTS "meetings_select" ON public.meetings;
DROP POLICY IF EXISTS "meetings_insert_policy" ON public.meetings;
DROP POLICY IF EXISTS "meetings_insert" ON public.meetings;
DROP POLICY IF EXISTS "meetings_update_policy" ON public.meetings;
DROP POLICY IF EXISTS "meetings_update" ON public.meetings;
DROP POLICY IF EXISTS "meetings_delete_policy" ON public.meetings;
DROP POLICY IF EXISTS "meetings_delete" ON public.meetings;

-- 2. RE-CREATE CLEAN, NON-RECURSIVE POLICIES ON MEETINGS
CREATE POLICY "meetings_select_policy" ON public.meetings
  FOR SELECT TO authenticated
  USING (
    auth.uid() IS NOT NULL
  );

CREATE POLICY "meetings_insert_policy" ON public.meetings
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
  );

CREATE POLICY "meetings_update_policy" ON public.meetings
  FOR UPDATE TO authenticated
  USING (
    host_id = auth.uid()
    OR created_by = auth.uid()
    OR public.is_executive()
    OR public.is_manager()
    OR auth.uid()::text = ANY(participant_ids)
  );

CREATE POLICY "meetings_delete_policy" ON public.meetings
  FOR DELETE TO authenticated
  USING (
    host_id = auth.uid()
    OR created_by = auth.uid()
    OR public.is_executive()
  );

-- 3. DROP ALL EXISTING / RECURSIVE POLICIES ON MEETING_PARTICIPANTS
DROP POLICY IF EXISTS "meeting_participants_select" ON public.meeting_participants;
DROP POLICY IF EXISTS "meeting_participants_insert" ON public.meeting_participants;
DROP POLICY IF EXISTS "meeting_participants_update" ON public.meeting_participants;
DROP POLICY IF EXISTS "meeting_participants_delete" ON public.meeting_participants;

CREATE POLICY "meeting_participants_select" ON public.meeting_participants
  FOR SELECT TO authenticated
  USING (
    auth.uid() IS NOT NULL
  );

CREATE POLICY "meeting_participants_insert" ON public.meeting_participants
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
  );

CREATE POLICY "meeting_participants_update" ON public.meeting_participants
  FOR UPDATE TO authenticated
  USING (
    member_id::text = auth.uid()::text
    OR user_id::text = auth.uid()::text
    OR invited_by = auth.uid()
    OR public.is_executive()
    OR public.is_manager()
  );

CREATE POLICY "meeting_participants_delete" ON public.meeting_participants
  FOR DELETE TO authenticated
  USING (
    member_id::text = auth.uid()::text
    OR invited_by = auth.uid()
    OR public.is_executive()
  );

-- 4. DROP & RE-CREATE POLICIES ON MEETING_ATTENDANCE
DROP POLICY IF EXISTS "meeting_attendance_select" ON public.meeting_attendance;
DROP POLICY IF EXISTS "meeting_attendance_insert" ON public.meeting_attendance;
DROP POLICY IF EXISTS "meeting_attendance_update" ON public.meeting_attendance;
DROP POLICY IF EXISTS "meeting_attendance_delete" ON public.meeting_attendance;

CREATE POLICY "meeting_attendance_select" ON public.meeting_attendance
  FOR SELECT TO authenticated
  USING (
    auth.uid() IS NOT NULL
  );

CREATE POLICY "meeting_attendance_insert" ON public.meeting_attendance
  FOR INSERT TO authenticated
  WITH CHECK (
    member_id::text = auth.uid()::text
    OR user_id::text = auth.uid()::text
    OR public.is_executive()
  );

CREATE POLICY "meeting_attendance_update" ON public.meeting_attendance
  FOR UPDATE TO authenticated
  USING (
    member_id::text = auth.uid()::text
    OR user_id::text = auth.uid()::text
    OR public.is_executive()
  );

CREATE POLICY "meeting_attendance_delete" ON public.meeting_attendance
  FOR DELETE TO authenticated
  USING (
    member_id::text = auth.uid()::text
    OR user_id::text = auth.uid()::text
    OR public.is_executive()
  );

-- 5. DROP & RE-CREATE POLICIES ON MEETING_MESSAGES
DROP POLICY IF EXISTS "meeting_messages_select" ON public.meeting_messages;
DROP POLICY IF EXISTS "meeting_messages_insert" ON public.meeting_messages;
DROP POLICY IF EXISTS "meeting_messages_update" ON public.meeting_messages;
DROP POLICY IF EXISTS "meeting_messages_delete" ON public.meeting_messages;

CREATE POLICY "meeting_messages_select" ON public.meeting_messages
  FOR SELECT TO authenticated
  USING (
    auth.uid() IS NOT NULL
  );

CREATE POLICY "meeting_messages_insert" ON public.meeting_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
  );

CREATE POLICY "meeting_messages_delete" ON public.meeting_messages
  FOR DELETE TO authenticated
  USING (
    sender_id = auth.uid()
    OR public.is_executive()
  );

COMMIT;

-- 6. ENSURE meeting_status ENUM ACCEPTS 'live' WITHOUT 42710 (type already exists) ERROR
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'meeting_status') THEN
    CREATE TYPE public.meeting_status AS ENUM ('scheduled', 'in-progress', 'completed', 'cancelled', 'live');
  END IF;
END $$;

-- If meeting_status already exists, add 'live' value safely outside transaction block
ALTER TYPE public.meeting_status ADD VALUE IF NOT EXISTS 'live';



