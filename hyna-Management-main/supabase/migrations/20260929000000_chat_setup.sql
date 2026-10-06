-- Migration: Setup single Global Chat channel and clean up extra channels

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

DELETE FROM public.chat_channels
WHERE name IN ('announcements', 'development', 'random', 'general')
   OR type = 'direct';

INSERT INTO public.chat_channels (id, name, type, icon, member_ids)
VALUES ('ch_global', 'global-chat', 'general', 'globe', '{}')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE IF EXISTS public.chat_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.chat_messages ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  DROP POLICY IF EXISTS "channels_select" ON public.chat_channels;
  DROP POLICY IF EXISTS "channels_insert" ON public.chat_channels;
  DROP POLICY IF EXISTS "channels_update" ON public.chat_channels;
  DROP POLICY IF EXISTS "channels_all" ON public.chat_channels;
  DROP POLICY IF EXISTS "channels_anon_all" ON public.chat_channels;

  DROP POLICY IF EXISTS "messages_select" ON public.chat_messages;
  DROP POLICY IF EXISTS "messages_insert" ON public.chat_messages;
  DROP POLICY IF EXISTS "messages_all" ON public.chat_messages;
  DROP POLICY IF EXISTS "messages_anon_all" ON public.chat_messages;
EXCEPTION WHEN others THEN null;
END $$;

CREATE POLICY "channels_all"
ON public.chat_channels FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "channels_anon_all"
ON public.chat_channels FOR ALL
TO anon
USING (true)
WITH CHECK (true);

CREATE POLICY "messages_all"
ON public.chat_messages FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "messages_anon_all"
ON public.chat_messages FOR ALL
TO anon
USING (true)
WITH CHECK (true);

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_channels;
EXCEPTION
  WHEN others THEN null;
END $$;
