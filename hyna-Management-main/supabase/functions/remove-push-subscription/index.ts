// ============================================================
// Hyna Management: remove-push-subscription Edge Function
// Removes a member's native Web Push subscription safely
// ============================================================

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { corsHeaders } from '../_shared/cors.ts';

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
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json().catch(() => ({}));
    const { endpoint, all, memberId } = body;

    let targetMemberId: string | null = null;
    const rawToken = (authHeader || '').replace(/^Bearer\s+/i, '').trim();

    if (rawToken && rawToken !== supabaseAnonKey) {
      try {
        const userClient = createClient(supabaseUrl, supabaseAnonKey);
        const { data: userData } = await userClient.auth.getUser(rawToken);
        if (userData?.user?.id) {
          targetMemberId = userData.user.id;
        }
      } catch {
        // Fallback
      }
    }

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

    let query = adminClient.from('push_subscriptions').delete().eq('member_id', targetMemberId);

    if (!all && endpoint) {
      query = query.eq('endpoint', endpoint);
    }

    const { error: deleteError } = await query;
    if (deleteError) {
      console.error('Error removing subscription:', deleteError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to remove push subscription' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Push subscription removed successfully' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('remove-push-subscription error:', err);
    return new Response(
      JSON.stringify({ success: false, error: err?.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
