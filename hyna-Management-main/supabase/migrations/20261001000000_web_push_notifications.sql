-- ============================================================
-- Hyna Management: Native Web Push Notification System Migration
-- ============================================================

-- 1. Create View for 'members' to resolve 'permission denied for table members'
-- The system's primary user identity table is 'profiles'. 
-- This view aliases 'profiles' to 'members' with SECURITY DEFINER to ensure 
-- Drop existing view if column definitions differ
DROP VIEW IF EXISTS public.members CASCADE;

CREATE VIEW public.members 
WITH (security_invoker = false) AS 
SELECT 
  id,
  employee_id,
  name,
  email,
  avatar,
  role,
  department,
  designation,
  phone,
  status,
  active_projects,
  join_date,
  last_active,
  created_at,
  updated_at
FROM public.profiles;

-- Grant permissions on members view
GRANT SELECT ON public.members TO anon, authenticated, service_role;

-- 2. Create Push Subscriptions Table
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for push_subscriptions
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_member_id ON public.push_subscriptions(member_id);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_endpoint ON public.push_subscriptions(endpoint);

-- Enable RLS on push_subscriptions
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Members can view own subscriptions" ON public.push_subscriptions;
DROP POLICY IF EXISTS "Members can insert own subscriptions" ON public.push_subscriptions;
DROP POLICY IF EXISTS "Members can update own subscriptions" ON public.push_subscriptions;
DROP POLICY IF EXISTS "Members can delete own subscriptions" ON public.push_subscriptions;
DROP POLICY IF EXISTS "Service role has full access to push_subscriptions" ON public.push_subscriptions;

-- RLS Policies for push_subscriptions
CREATE POLICY "Members can view own subscriptions"
  ON public.push_subscriptions FOR SELECT
  TO authenticated
  USING (auth.uid() = member_id);

CREATE POLICY "Members can insert own subscriptions"
  ON public.push_subscriptions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = member_id);

CREATE POLICY "Members can update own subscriptions"
  ON public.push_subscriptions FOR UPDATE
  TO authenticated
  USING (auth.uid() = member_id)
  WITH CHECK (auth.uid() = member_id);

CREATE POLICY "Members can delete own subscriptions"
  ON public.push_subscriptions FOR DELETE
  TO authenticated
  USING (auth.uid() = member_id);

CREATE POLICY "Service role has full access to push_subscriptions"
  ON public.push_subscriptions FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 3. Create Notification Preferences Table
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  member_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  push_enabled BOOLEAN NOT NULL DEFAULT true,
  tasks_enabled BOOLEAN NOT NULL DEFAULT true,
  projects_enabled BOOLEAN NOT NULL DEFAULT true,
  modules_enabled BOOLEAN NOT NULL DEFAULT true,
  meetings_enabled BOOLEAN NOT NULL DEFAULT true,
  attendance_enabled BOOLEAN NOT NULL DEFAULT true,
  announcements_enabled BOOLEAN NOT NULL DEFAULT true,
  events_enabled BOOLEAN NOT NULL DEFAULT true,
  quiet_hours_enabled BOOLEAN NOT NULL DEFAULT false,
  quiet_hours_start TEXT NOT NULL DEFAULT '22:00',
  quiet_hours_end TEXT NOT NULL DEFAULT '08:00',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS on notification_preferences
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Members can view own preferences" ON public.notification_preferences;
DROP POLICY IF EXISTS "Members can insert own preferences" ON public.notification_preferences;
DROP POLICY IF EXISTS "Members can update own preferences" ON public.notification_preferences;
DROP POLICY IF EXISTS "Service role has full access to notification_preferences" ON public.notification_preferences;

-- RLS Policies for notification_preferences
CREATE POLICY "Members can view own preferences"
  ON public.notification_preferences FOR SELECT
  TO authenticated
  USING (auth.uid() = member_id);

CREATE POLICY "Members can insert own preferences"
  ON public.notification_preferences FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = member_id);

CREATE POLICY "Members can update own preferences"
  ON public.notification_preferences FOR UPDATE
  TO authenticated
  USING (auth.uid() = member_id)
  WITH CHECK (auth.uid() = member_id);

CREATE POLICY "Service role has full access to notification_preferences"
  ON public.notification_preferences FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 4. Harmonize Notifications Table
-- Ensure columns exist and indexes are created
DO $$
BEGIN
  -- Add data JSONB column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'data'
  ) THEN
    ALTER TABLE public.notifications ADD COLUMN data JSONB DEFAULT '{}'::jsonb;
  END IF;

  -- Add read_at timestamp if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'read_at'
  ) THEN
    ALTER TABLE public.notifications ADD COLUMN read_at TIMESTAMPTZ;
  END IF;
END $$;

-- Indexes for notifications
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON public.notifications(is_read);

-- Ensure RLS on notifications is properly enabled
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Members can update own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Authenticated users can create notifications" ON public.notifications;
DROP POLICY IF EXISTS "Service role has full access to notifications" ON public.notifications;

CREATE POLICY "Members can view own notifications"
  ON public.notifications FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Members can update own notifications"
  ON public.notifications FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Authenticated users can create notifications"
  ON public.notifications FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Service role has full access to notifications"
  ON public.notifications FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 5. Helper Function: Auto-create notification_preferences for new profiles
CREATE OR REPLACE FUNCTION public.handle_new_member_preferences()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.notification_preferences (member_id)
  VALUES (NEW.id)
  ON CONFLICT (member_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_profile_created_preferences ON public.profiles;
CREATE TRIGGER on_profile_created_preferences
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_member_preferences();

-- Initialize preferences for any existing profiles
INSERT INTO public.notification_preferences (member_id)
SELECT id FROM public.profiles
ON CONFLICT (member_id) DO NOTHING;

-- Grant table access
GRANT ALL ON public.push_subscriptions TO authenticated, service_role;
GRANT ALL ON public.notification_preferences TO authenticated, service_role;
GRANT ALL ON public.notifications TO authenticated, service_role;
