// ============================================================
// Hyna Management: send-notification Edge Function
// Encrypted Web Push dispatch (RFC 8291/8292), In-app History & Auto-Pruning
// ============================================================

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { corsHeaders } from '../_shared/cors.ts';
import { sendWebPush, VapidDetails } from '../_shared/webpush.ts';

// Default VAPID keys configured for Hyna Management
const DEFAULT_VAPID_PUBLIC_KEY =
  'BF-KCxXr3btAZHOV-bue50RbRyP-eqacJZp6Uaw1cweYSEWTykzUCMmm7vGbPO2QpF9mF9Ieig4SStzBdB_Lh4s';
const DEFAULT_VAPID_PRIVATE_KEY =
  'Go5WBLVixsF0Feh4wTwD4es-iJdJdpUXa-fb2ZxMyBw';
const DEFAULT_VAPID_SUBJECT = 'mailto:admin@hynastudio.com';

interface NotificationRequest {
  title: string;
  message: string;
  type?: string;
  actionUrl?: string;
  icon?: string;
  badge?: string;
  data?: Record<string, any>;
  recipients: {
    type: 'all' | 'users' | 'role' | 'project';
    userIds?: string[];
    role?: 'admin' | 'manager' | 'member';
    projectId?: string;
  };
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || supabaseAnonKey;

    const vapid: VapidDetails = {
      publicKey: Deno.env.get('VAPID_PUBLIC_KEY') || DEFAULT_VAPID_PUBLIC_KEY,
      privateKey: Deno.env.get('VAPID_PRIVATE_KEY') || DEFAULT_VAPID_PRIVATE_KEY,
      subject: Deno.env.get('VAPID_SUBJECT') || DEFAULT_VAPID_SUBJECT,
    };

    // Parse request body first
    const body: (NotificationRequest & { callerId?: string; memberId?: string }) = await req.json().catch(() => null);
    if (!body || !body.title || !body.message || !body.recipients) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid payload: title, message, and recipients are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Privileged admin client for reading members & push subscriptions
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    let callerId: string | null = null;
    let callerRole: string = 'member';
    let callerProfile: any = null;
    const rawToken = (authHeader || '').replace(/^Bearer\s+/i, '').trim();

    // 1. Authenticate calling user via JWT
    if (rawToken && rawToken !== supabaseAnonKey) {
      try {
        const userClient = createClient(supabaseUrl, supabaseAnonKey);
        const { data: userData } = await userClient.auth.getUser(rawToken);
        if (userData?.user?.id) {
          callerId = userData.user.id;
        }
      } catch {
        // Fallback below
      }
    }

    // 2. Fallback: check candidate ID against profiles
    const candidateId = callerId || body.callerId || body.memberId;
    if (candidateId) {
      const { data: profile } = await adminClient
        .from('profiles')
        .select('id, name, role, department')
        .eq('id', candidateId)
        .maybeSingle();

      if (profile) {
        callerProfile = profile;
        callerId = profile.id;
        callerRole = profile.role || 'member';
      }
    }

    if (!callerProfile && !callerId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized: valid user token or member profile required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const payload: NotificationRequest = body;

    // 3. Authorization check: Non-admins/managers cannot broadcast to 'all'
    if (payload.recipients.type === 'all' && callerRole === 'member') {
      return new Response(
        JSON.stringify({ success: false, error: 'Only administrators and managers can broadcast notifications to all members' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 4. Resolve recipient member IDs
    let targetMemberIds: string[] = [];

    if (payload.recipients.type === 'all') {
      const { data: allProfiles } = await adminClient
        .from('profiles')
        .select('id')
        .eq('status', 'active');
      targetMemberIds = (allProfiles || []).map((p: any) => p.id);
    } else if (payload.recipients.type === 'role' && payload.recipients.role) {
      const { data: roleProfiles } = await adminClient
        .from('profiles')
        .select('id')
        .eq('role', payload.recipients.role)
        .eq('status', 'active');
      targetMemberIds = (roleProfiles || []).map((p: any) => p.id);
    } else if (payload.recipients.type === 'project' && payload.recipients.projectId) {
      const { data: proj } = await adminClient
        .from('projects')
        .select('member_ids, manager_id, lead_id')
        .eq('id', payload.recipients.projectId)
        .maybeSingle();

      const memberSet = new Set<string>();
      if (proj) {
        if (proj.manager_id) memberSet.add(proj.manager_id);
        if (proj.lead_id) memberSet.add(proj.lead_id);
        (proj.member_ids || []).forEach((m: string) => memberSet.add(m));
      }
      targetMemberIds = Array.from(memberSet);
    } else if (payload.recipients.type === 'users' && payload.recipients.userIds) {
      targetMemberIds = payload.recipients.userIds;
    }

    // Remove duplicates
    targetMemberIds = Array.from(new Set(targetMemberIds)).filter(Boolean);

    if (targetMemberIds.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          recipientsCount: 0,
          notificationsCreated: 0,
          pushSent: 0,
          pushFailed: 0,
          cleanedCount: 0,
          message: 'No eligible recipients found',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 5. Fetch notification preferences for all target recipients
    const { data: prefsList } = await adminClient
      .from('notification_preferences')
      .select('*')
      .in('member_id', targetMemberIds);

    const prefsMap = new Map<string, any>();
    (prefsList || []).forEach((pref: any) => {
      prefsMap.set(pref.member_id, pref);
    });

    const notifType = payload.type || 'general';

    // Helper: Verify if push is allowed by member's preferences
    const isPushAllowedForMember = (memberId: string): boolean => {
      const pref = prefsMap.get(memberId);
      if (!pref) return true; // default allowed
      if (pref.push_enabled === false) return false;

      // Check category toggles
      if (notifType === 'task' && pref.tasks_enabled === false) return false;
      if (notifType === 'project' && pref.projects_enabled === false) return false;
      if (notifType === 'module' && pref.modules_enabled === false) return false;
      if (notifType === 'meeting' && pref.meetings_enabled === false) return false;
      if (notifType === 'attendance' && pref.attendance_enabled === false) return false;
      if (notifType === 'announcement' && pref.announcements_enabled === false) return false;
      if (notifType === 'event' && pref.events_enabled === false) return false;

      return true;
    };

    // 6. Insert in-app notifications records into public.notifications
    const historyRows = targetMemberIds.map((mId) => ({
      user_id: mId,
      title: payload.title,
      message: payload.message,
      type: notifType,
      link: payload.actionUrl || '/',
      data: payload.data || {},
      is_read: false,
      created_at: new Date().toISOString(),
    }));

    const { error: insertError } = await adminClient
      .from('notifications')
      .insert(historyRows);

    if (insertError) {
      console.warn('Warning: Could not insert in-app notifications batch:', insertError);
    }

    // 7. Filter recipients who have push enabled
    const pushEligibleMemberIds = targetMemberIds.filter(isPushAllowedForMember);

    // 8. Fetch active Web Push subscriptions
    const { data: subscriptions } = await adminClient
      .from('push_subscriptions')
      .select('id, member_id, endpoint, p256dh, auth')
      .in('member_id', pushEligibleMemberIds);

    let pushSent = 0;
    let pushFailed = 0;
    const expiredSubscriptionIds: string[] = [];

    // Push notification payload for Service Worker
    const pushPayload = {
      title: payload.title,
      body: payload.message,
      icon: payload.icon || '/pwa-192x192.png',
      badge: payload.badge || '/favicon.svg',
      data: {
        url: payload.actionUrl || '/',
        type: notifType,
        ...payload.data,
      },
      tag: `hyna-${notifType}-${Date.now()}`,
    };

    // 9. Dispatch encrypted Web Push messages in parallel
    if (subscriptions && subscriptions.length > 0) {
      await Promise.all(
        subscriptions.map(async (sub: any) => {
          const pushTarget = {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          };

          const result = await sendWebPush(pushTarget, pushPayload, vapid);

          if (result.success) {
            pushSent++;
          } else {
            pushFailed++;
            // 10. Automatically mark permanently expired subscriptions for safe removal
            if (result.isPermanentFailure) {
              expiredSubscriptionIds.push(sub.id);
            }
          }
        })
      );
    }

    // 11. Prune dead subscriptions (404/410)
    let cleanedCount = 0;
    if (expiredSubscriptionIds.length > 0) {
      const { error: pruneError } = await adminClient
        .from('push_subscriptions')
        .delete()
        .in('id', expiredSubscriptionIds);

      if (!pruneError) {
        cleanedCount = expiredSubscriptionIds.length;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        recipientsCount: targetMemberIds.length,
        notificationsCreated: historyRows.length,
        pushEligibleCount: pushEligibleMemberIds.length,
        pushSent,
        pushFailed,
        cleanedCount,
        message: `Notification dispatched to ${targetMemberIds.length} members (${pushSent} Web Push delivered)`,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('send-notification error:', err);
    return new Response(
      JSON.stringify({ success: false, error: err?.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
