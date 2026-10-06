import { useEffect } from 'react';
import { toast } from 'sonner';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useAuthStore } from '@/stores';

export function useRealtime() {
  const { currentUser } = useAuthStore();

  useEffect(() => {
    if (!isSupabaseConfigured() || !currentUser?.id) return;

    const channel = supabase.channel('app-realtime');

    // 1. Listen for new notifications assigned to current user
    channel.on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${currentUser.id}`,
      },
      (payload) => {
        const newNotif = payload.new;
        if (newNotif.type === 'announcement') {
          toast('New announcement posted!', { description: newNotif.title });
        } else {
          toast.info(newNotif.title, { description: newNotif.message });
        }
        window.dispatchEvent(new CustomEvent('realtime-notification', { detail: newNotif }));
      }
    );

    // 2. Listen for global announcements (user_id='all')
    channel.on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.all`,
      },
      (payload) => {
        const newNotif = payload.new;
        toast('New announcement posted!', { description: newNotif.title });
        window.dispatchEvent(new CustomEvent('realtime-notification', { detail: newNotif }));
      }
    );

    // 3. Listen for tasks assigned to current user
    channel.on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'tasks',
        filter: `assignee_id=eq.${currentUser.id}`,
      },
      (payload) => {
        const newTask = payload.new;
        toast.success('New task assigned', { description: newTask.title });
        window.dispatchEvent(new CustomEvent('realtime-task', { detail: newTask }));
      }
    );

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUser?.id]);
}
