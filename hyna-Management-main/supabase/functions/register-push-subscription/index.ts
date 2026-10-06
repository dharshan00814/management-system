// ============================================================
// Hyna Management: register-push-subscription Edge Function
// Registers or updates a member's native Web Push subscription
// ============================================================

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { corsHeaders } from '../_shared/cors.ts';

serve(async (req: Request) => {
  // Handle CORS preflight
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
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json().catch(() => null);
    if (!body || !body.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Invalid payload: endpoint and keys (p256dh, auth) are required',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { endpoint, keys, userAgent, memberId } = body;
    let targetMemberId: string | null = null;
    const rawToken = (authHeader || '').replace(/^Bearer\s+/i, '').trim();

    // 1. Verify user via JWT if provided
    if (rawToken && rawToken !== supabaseAnonKey) {
      try {
        const userClient = createClient(supabaseUrl, supabaseAnonKey);
        const { data: userData, error: userError } = await userClient.auth.getUser(rawToken);
        if (!userError && userData?.user?.id) {
          targetMemberId = userData.user.id;
        }
      } catch {
        // Fallback
      }
    }

    // 2. Fallback: verify memberId against profiles table
    if (!targetMemberId && memberId) {
      const { data: profile } = await adminClient
        .from('profiles')
        .select('id')
        .eq('id', memberId)
        .maybeSingle();

      if (profile?.id) {
        targetMemberId = profile.id;
      }
    }

    if (!targetMemberId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized or invalid member' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Upsert subscription
    const { data: subscription, error: upsertError } = await adminClient
      .from('push_subscriptions')
      .upsert(
        {
          member_id: targetMemberId,
          endpoint,
          p256dh: keys.p256dh,
          auth: keys.auth,
          user_agent: userAgent || req.headers.get('user-agent') || 'Browser',
          last_seen_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'endpoint' }
      )
      .select('id, member_id, created_at')
      .single();

    if (upsertError) {
      console.error('Error saving push subscription:', upsertError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to record push subscription' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Ensure member preferences exist
    await adminClient
      .from('notification_preferences')
      .upsert({ member_id: targetMemberId }, { onConflict: 'member_id' });

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Push subscription registered successfully',
        subscriptionId: subscription.id,
        memberId: targetMemberId,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('register-push-subscription error:', err);
    return new Response(
      JSON.stringify({ success: false, error: err?.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
