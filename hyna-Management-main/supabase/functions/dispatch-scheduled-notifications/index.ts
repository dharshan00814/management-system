// ============================================================
// Hyna Management: dispatch-scheduled-notifications Edge Function
// Evaluates approaching deadlines, upcoming meetings, check-in reminders
// ============================================================

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { corsHeaders } from '../_shared/cors.ts';
import { sendWebPush, VapidDetails } from '../_shared/webpush.ts';

const DEFAULT_VAPID_PUBLIC_KEY =
  'BF-KCxXr3btAZHOV-bue50RbRyP-eqacJZp6Uaw1cweYSEWTykzUCMmm7vGbPO2QpF9mF9Ieig4SStzBdB_Lh4s';
const DEFAULT_VAPID_PRIVATE_KEY =
  'Go5WBLVixsF0Feh4wTwD4es-iJdJdpUXa-fb2ZxMyBw';
const DEFAULT_VAPID_SUBJECT = 'mailto:admin@hynastudio.com';

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY') || '';

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    const vapid: VapidDetails = {
      publicKey: Deno.env.get('VAPID_PUBLIC_KEY') || DEFAULT_VAPID_PUBLIC_KEY,
      privateKey: Deno.env.get('VAPID_PRIVATE_KEY') || DEFAULT_VAPID_PRIVATE_KEY,
      subject: Deno.env.get('VAPID_SUBJECT') || DEFAULT_VAPID_SUBJECT,
    };

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    let scheduledDispatched = 0;

    // 1. Task Deadlines Approaching (within 24 hours and not yet completed)
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const { data: dueTasks } = await adminClient
      .from('tasks')
      .select('id, title, assignee_id, deadline, status')
      .neq('status', 'completed')
      .lte('deadline', tomorrow)
      .gte('deadline', todayStr);

    if (dueTasks && dueTasks.length > 0) {
      for (const task of dueTasks) {
        if (!task.assignee_id) continue;

        // Check if reminder was already sent today
        const idempotencyKey = `deadline-remind-${task.id}-${todayStr}`;
        const { data: existingNotif } = await adminClient
          .from('notifications')
          .select('id')
          .eq('user_id', task.assignee_id)
          .contains('data', { idempotencyKey })
          .maybeSingle();

        if (!existingNotif) {
          // Send notification
          await adminClient.from('notifications').insert({
            user_id: task.assignee_id,
            title: 'Task Deadline Approaching',
            message: `"${task.title}" is due soon (${task.deadline}). Please review or update progress.`,
            type: 'task',
            link: '/member/tasks',
            data: { taskId: task.id, idempotencyKey },
            is_read: false,
          });

          // Fetch push subscriptions
          const { data: subs } = await adminClient
            .from('push_subscriptions')
            .select('endpoint, p256dh, auth')
            .eq('member_id', task.assignee_id);

          if (subs && subs.length > 0) {
            for (const sub of subs) {
              await sendWebPush(
                { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
                {
                  title: 'Task Deadline Approaching',
                  body: `"${task.title}" is due soon.`,
                  icon: '/pwa-192x192.png',
                  data: { url: '/member/tasks', type: 'task' },
                },
                vapid
              );
            }
          }
          scheduledDispatched++;
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, scheduledDispatched, timestamp: now.toISOString() }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('dispatch-scheduled-notifications error:', err);
    return new Response(
      JSON.stringify({ success: false, error: err?.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
