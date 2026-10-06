// ============================================================
// Hyna Studio Management - In-Meeting Chat Hook
// Realtime Messaging + Persistent Database History
// ============================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { fetchMeetingChatMessages, sendMeetingChatMessage } from '@/services/meetingService';
import type { MeetingChatMessage } from '@/types/meeting';

export function useMeetingChat(
  meetingId: string | undefined,
  currentUser: { id: string; name: string; avatar?: string; designation?: string; role?: string } | null
) {
  const [messages, setMessages] = useState<MeetingChatMessage[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const isChatOpenRef = useRef<boolean>(false);

  // Load message history from DB
  useEffect(() => {
    if (!meetingId) return;

    let isMounted = true;
    async function loadChat() {
      const history = await fetchMeetingChatMessages(meetingId!);
      if (isMounted) {
        setMessages(history);
      }
    }

    loadChat();

    // Subscribe to Postgres changes on meeting_messages for this meeting
    let channel: any = null;
    if (isSupabaseConfigured()) {
      channel = supabase
        .channel(`meeting-chat:${meetingId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'meeting_messages',
            filter: `meeting_id=eq.${meetingId}`,
          },
          async (payload) => {
            const newRow = payload.new;
            if (!newRow) return;

            // Fetch sender profile details if needed
            let senderName = 'Team Member';
            let senderAvatar = '';
            let senderRole = 'Member';

            if (newRow.sender_id === currentUser?.id) {
              senderName = currentUser.name;
              senderAvatar = currentUser.avatar || '';
              senderRole = currentUser.designation || currentUser.role || 'Member';
            } else {
              const { data: prof } = await supabase
                .from('profiles')
                .select('name, avatar, designation, role')
                .eq('id', newRow.sender_id)
                .maybeSingle();

              if (prof) {
                senderName = prof.name;
                senderAvatar = prof.avatar;
                senderRole = prof.designation || prof.role || 'Member';
              }
            }

            const newMsg: MeetingChatMessage = {
              id: newRow.id,
              meetingId: newRow.meeting_id,
              senderId: newRow.sender_id,
              senderName,
              senderAvatar,
              senderRole,
              message: newRow.message,
              timestamp: newRow.created_at,
            };

            setMessages(prev => {
              if (prev.some(m => m.id === newMsg.id)) return prev;
              return [...prev, newMsg];
            });

            if (!isChatOpenRef.current && newRow.sender_id !== currentUser?.id) {
              setUnreadCount(prev => prev + 1);
            }
          }
        )
        .subscribe();
    }

    return () => {
      isMounted = false;
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [meetingId, currentUser]);

  const setChatOpen = useCallback((open: boolean) => {
    isChatOpenRef.current = open;
    if (open) {
      setUnreadCount(0);
    }
  }, []);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || !meetingId || !currentUser?.id) return;

      const optimisticMsg: MeetingChatMessage = {
        id: 'msg_opt_' + Date.now(),
        meetingId,
        senderId: currentUser.id,
        senderName: currentUser.name,
        senderAvatar: currentUser.avatar,
        senderRole: currentUser.designation || currentUser.role || 'Member',
        message: text.trim(),
        timestamp: new Date().toISOString(),
      };

      setMessages(prev => [...prev, optimisticMsg]);
      await sendMeetingChatMessage(meetingId, currentUser.id, text.trim());
    },
    [meetingId, currentUser]
  );

  return {
    messages,
    unreadCount,
    setChatOpen,
    sendMessage,
  };
}
