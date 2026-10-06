// ============================================================
// HYNA STUDIO MANAGEMENT - ACTIVITY SERVICE
// Privacy-Conscious Development Activity Tracking API
// ============================================================

import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import type {
  ActivitySession,
  CreateActivitySessionDTO,
  ActivityFilter,
  ActivitySummary,
  AppUsageStat,
  DailyActivityTrend,
} from '@/types/activity';
import type { User } from '@/types';
import { getUsers } from './api';

// Cache for user profiles when displaying team/org activity
let usersCacheMap: Map<string, User> = new Map();
let tableWarningShown = false;

/**
 * Checks if a Supabase error is caused by a missing table or missing schema cache.
 * PostgREST returns 'PGRST205' when a relation is not found in the schema cache.
 * Direct PostgreSQL returns '42P01'.
 */
function isTableMissingError(error: any): boolean {
  if (!error) return false;
  const msg = typeof error === 'string' ? error : (error.message || '');
  const code = error.code || '';
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    code === 'PGRST200' ||
    error.status === 404 ||
    error.status === 400 || // PostgREST returns 400 for schema cache misses too
    msg.includes('does not exist') ||
    msg.includes('schema cache') ||
    msg.includes('Could not find the table') ||
    msg.includes('relation') ||
    msg.includes('undefined table')
  );
}

function handleTableError(actionDesc: string, error: any) {
  if (isTableMissingError(error)) {
    if (!tableWarningShown) {
      console.info(
        '[ActivityService] Note: activity_sessions table is not yet created in Supabase. Apply migration in supabase/migrations/activity_tracking.sql to enable live tracking.'
      );
      tableWarningShown = true;
    }
  } else {
    console.warn(`[ActivityService] ${actionDesc}:`, error?.message || error);
  }
}

async function getCachedUsersMap(): Promise<Map<string, User>> {
  if (usersCacheMap.size > 0) return usersCacheMap;
  try {
    const users = await getUsers();
    users.forEach((u) => usersCacheMap.set(u.id, u));
  } catch (err) {
    console.warn('[ActivityService] Could not preload users map:', err);
  }
  return usersCacheMap;
}

// Transform database row to Frontend ActivitySession
function mapActivitySession(row: any, userMap?: Map<string, User>): ActivitySession {
  const user = userMap?.get(row.user_id);

  return {
    id: row.id,
    userId: row.user_id,
    application: row.application || 'Unknown',
    projectName: row.project_name || null,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    activeSeconds: Math.max(0, Number(row.active_seconds) || 0),
    idleSeconds: Math.max(0, Number(row.idle_seconds) || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    user,
  };
}

/**
 * Validates session inputs prior to persistence.
 * Rejects negative durations, impossible timestamps, or missing application.
 */
function validateSessionPayload(payload: CreateActivitySessionDTO): { valid: boolean; error?: string } {
  if (!payload.application || payload.application.trim().length < 2) {
    return { valid: false, error: 'Application name is required (min 2 characters).' };
  }

  const startMs = new Date(payload.startedAt).getTime();
  const endMs = new Date(payload.endedAt).getTime();

  if (isNaN(startMs) || isNaN(endMs)) {
    return { valid: false, error: 'Invalid session timestamp.' };
  }

  if (endMs < startMs) {
    return { valid: false, error: 'Session end time cannot precede start time.' };
  }

  if (payload.activeSeconds < 0 || payload.idleSeconds < 0) {
    return { valid: false, error: 'Duration values cannot be negative.' };
  }

  if (payload.projectName && payload.projectName.length > 150) {
    return { valid: false, error: 'Project name exceeds maximum length (150 chars).' };
  }

  return { valid: true };
}

/**
 * Persists an aggregated activity session to Supabase.
 * Enforces authenticated identity verification server-side via Supabase Auth & RLS.
 */
export async function createActivitySession(
  session: CreateActivitySessionDTO
): Promise<{ success: boolean; data?: ActivitySession; error?: string }> {
  const validation = validateSessionPayload(session);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return { success: false, error: 'Unauthenticated: No active Supabase session.' };
    }

    // Force user_id to authenticated identity to prevent client spoofing
    const verifiedUserId = user.id;

    const rowToInsert = {
      user_id: verifiedUserId,
      application: session.application.trim(),
      project_name: session.projectName?.trim() || null,
      started_at: session.startedAt,
      ended_at: session.endedAt,
      active_seconds: Math.round(session.activeSeconds),
      idle_seconds: Math.round(session.idleSeconds),
    };

    const { data, error } = await supabase
      .from('activity_sessions')
      .insert(rowToInsert)
      .select('*')
      .single();

    if (error) {
      handleTableError('Could not insert activity session', error);
      return { success: false, error: isTableMissingError(error) ? 'Activity tracking table not yet initialized in database' : error.message };
    }

    const userMap = await getCachedUsersMap();
    return { success: true, data: mapActivitySession(data, userMap) };
  } catch (err: any) {
    console.error('[ActivityService] Unexpected error creating activity session:', err);
    return { success: false, error: err?.message || 'Failed to create session' };
  }
}

/**
 * Bulk synchronizes offline stored activity session summaries.
 */
export async function syncActivitySessions(
  sessions: CreateActivitySessionDTO[]
): Promise<{ success: boolean; syncedCount: number; errors: string[] }> {
  if (!sessions || sessions.length === 0) {
    return { success: true, syncedCount: 0, errors: [] };
  }

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return { success: false, syncedCount: 0, errors: ['Unauthenticated'] };
    }

    const validRows: any[] = [];
    const errors: string[] = [];

    for (const session of sessions) {
      const v = validateSessionPayload(session);
      if (!v.valid) {
        errors.push(v.error || 'Invalid session payload');
        continue;
      }
      validRows.push({
        user_id: user.id, // Strictly bind to authenticated user
        application: session.application.trim(),
        project_name: session.projectName?.trim() || null,
        started_at: session.startedAt,
        ended_at: session.endedAt,
        active_seconds: Math.round(session.activeSeconds),
        idle_seconds: Math.round(session.idleSeconds),
      });
    }

    if (validRows.length === 0) {
      return { success: false, syncedCount: 0, errors };
    }

    const { data, error } = await supabase
      .from('activity_sessions')
      .insert(validRows)
      .select('id');

    if (error) {
      handleTableError('Bulk sync failed', error);
      return { success: false, syncedCount: 0, errors: [error.message, ...errors] };
    }

    return {
      success: true,
      syncedCount: data ? data.length : validRows.length,
      errors,
    };
  } catch (err: any) {
    console.error('[ActivityService] Bulk sync exception:', err);
    return { success: false, syncedCount: 0, errors: [err?.message || 'Sync error'] };
  }
}

// Transform developer_sessions row to Frontend ActivitySession
function mapDeveloperSessionToActivitySession(row: any, userMap?: Map<string, User>): ActivitySession {
  const user = userMap?.get(row.user_id);
  const startedAt = row.started_at || new Date().toISOString();
  const lastActivityAt = row.last_activity_at || startedAt;
  const endedAt = row.ended_at || null;

  const startMs = new Date(startedAt).getTime();
  const endMs = endedAt ? new Date(endedAt).getTime() : new Date(lastActivityAt).getTime();
  const nowMs = Date.now();

  // If ongoing session: calculate elapsed up to now or last_activity_at
  const totalElapsedSeconds = Math.max(1, Math.round((Math.max(endMs, startMs) - startMs) / 1000));
  
  let activeSeconds = totalElapsedSeconds;
  let idleSeconds = 0;

  if (row.status === 'idle') {
    const idleDuration = Math.max(0, Math.round((nowMs - new Date(lastActivityAt).getTime()) / 1000));
    idleSeconds = Math.min(totalElapsedSeconds, Math.max(300, idleDuration));
    activeSeconds = Math.max(0, totalElapsedSeconds - idleSeconds);
  }

  // Application name mapping
  let application = 'VS Code';
  const toolLower = (row.tool || '').toLowerCase();
  if (toolLower === 'cursor') application = 'Cursor';
  else if (toolLower === 'antigravity') application = 'Antigravity';
  else if (toolLower === 'vscode') application = 'Visual Studio Code';

  return {
    id: row.id,
    userId: row.user_id,
    application,
    projectName: row.workspace_name || row.project_id || 'Hyna Studio',
    startedAt,
    endedAt,
    activeSeconds,
    idleSeconds,
    createdAt: row.created_at || startedAt,
    updatedAt: row.updated_at || lastActivityAt,
    user,
  };
}

/**
 * Fetches the authenticated user's personal activity records.
 * Integrates both developer_sessions (from IDEs) and legacy activity_sessions.
 */
export async function getMyActivity(filters?: ActivityFilter): Promise<ActivitySession[]> {
  try {
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return [];

    const userMap = await getCachedUsersMap();

    // 1. Fetch live developer_sessions — individually try-caught for graceful degradation
    let mappedDev: ActivitySession[] = [];
    try {
      let devQuery = supabase
        .from('developer_sessions')
        .select('*')
        .eq('user_id', user.id)
        .order('started_at', { ascending: false });

      if (filters?.startDate) {
        devQuery = devQuery.gte('started_at', `${filters.startDate}T00:00:00Z`);
      }
      if (filters?.endDate) {
        devQuery = devQuery.lte('started_at', `${filters.endDate}T23:59:59Z`);
      }
      if (filters?.application && filters.application !== 'all') {
        const appLower = filters.application.toLowerCase();
        if (appLower.includes('cursor')) devQuery = devQuery.eq('tool', 'cursor');
        else if (appLower.includes('antigravity')) devQuery = devQuery.eq('tool', 'antigravity');
        else if (appLower.includes('code')) devQuery = devQuery.eq('tool', 'vscode');
      }
      if (filters?.projectName && filters.projectName !== 'all') {
        devQuery = devQuery.ilike('workspace_name', `%${filters.projectName}%`);
      }

      const { data: devSessions, error: devError } = await devQuery;
      if (devError && isTableMissingError(devError)) {
        handleTableError('developer_sessions (my activity)', devError);
      } else {
        mappedDev = (devSessions || []).map((row) => mapDeveloperSessionToActivitySession(row, userMap));
      }
    } catch (devErr) {
      console.info('[ActivityService] developer_sessions not available:', (devErr as any)?.message);
    }

    // 2. Fetch legacy activity_sessions — individually try-caught
    let mappedLegacy: ActivitySession[] = [];
    try {
      let query = supabase
        .from('activity_sessions')
        .select('*')
        .eq('user_id', user.id)
        .order('started_at', { ascending: false });

      if (filters?.startDate) {
        query = query.gte('started_at', `${filters.startDate}T00:00:00Z`);
      }
      if (filters?.endDate) {
        query = query.lte('started_at', `${filters.endDate}T23:59:59Z`);
      }
      if (filters?.application && filters.application !== 'all') {
        query = query.ilike('application', `%${filters.application}%`);
      }
      if (filters?.projectName && filters.projectName !== 'all') {
        query = query.ilike('project_name', `%${filters.projectName}%`);
      }

      const { data: legacySessions, error: legacyError } = await query;
      if (legacyError && isTableMissingError(legacyError)) {
        handleTableError('activity_sessions (my activity)', legacyError);
      } else {
        mappedLegacy = (legacySessions || []).map((row) => mapActivitySession(row, userMap));
      }
    } catch (legacyErr) {
      console.info('[ActivityService] activity_sessions not available:', (legacyErr as any)?.message);
    }

    // Combine without duplicate IDs
    const seen = new Set<string>();
    const combined: ActivitySession[] = [];
    [...mappedDev, ...mappedLegacy].forEach((s) => {
      if (!seen.has(s.id)) {
        seen.add(s.id);
        combined.push(s);
      }
    });

    return combined.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  } catch (err) {
    console.warn('[ActivityService] Failed to load my activity:', err);
    return [];
  }
}

/**
 * Fetches team activity for managers based on projects they manage.
 */
export async function getTeamActivity(
  managerId: string,
  filters?: ActivityFilter
): Promise<ActivitySession[]> {
  try {
    const userMap = await getCachedUsersMap();

    // 1. Identify members in projects managed by this manager
    const { data: managedProjects } = await supabase
      .from('projects')
      .select('member_ids')
      .eq('manager_id', managerId);

    const memberSet = new Set<string>();
    (managedProjects || []).forEach((p) => {
      (p.member_ids || []).forEach((m: string) => memberSet.add(m));
    });
    if (managerId) memberSet.add(managerId);

    const teamUserIds = Array.from(memberSet);
    if (teamUserIds.length === 0) {
      return [];
    }

    // 2. Fetch from developer_sessions — individually try-caught
    let mappedDev: ActivitySession[] = [];
    try {
      let devQuery = supabase
        .from('developer_sessions')
        .select('*')
        .in('user_id', teamUserIds)
        .order('started_at', { ascending: false });

      if (filters?.userId && filters.userId !== 'all') {
        devQuery = devQuery.eq('user_id', filters.userId);
      }
      if (filters?.startDate) {
        devQuery = devQuery.gte('started_at', `${filters.startDate}T00:00:00Z`);
      }
      if (filters?.endDate) {
        devQuery = devQuery.lte('started_at', `${filters.endDate}T23:59:59Z`);
      }
      if (filters?.application && filters.application !== 'all') {
        const appLower = filters.application.toLowerCase();
        if (appLower.includes('cursor')) devQuery = devQuery.eq('tool', 'cursor');
        else if (appLower.includes('antigravity')) devQuery = devQuery.eq('tool', 'antigravity');
        else if (appLower.includes('code')) devQuery = devQuery.eq('tool', 'vscode');
      }
      if (filters?.projectName && filters.projectName !== 'all') {
        devQuery = devQuery.ilike('workspace_name', `%${filters.projectName}%`);
      }

      const { data: devSessions, error: devError } = await devQuery;
      if (devError && isTableMissingError(devError)) {
        handleTableError('developer_sessions (team)', devError);
      } else {
        mappedDev = (devSessions || []).map((row) => mapDeveloperSessionToActivitySession(row, userMap));
      }
    } catch (devErr) {
      console.info('[ActivityService] developer_sessions not available:', (devErr as any)?.message);
    }

    // 3. Also fetch legacy activity_sessions — individually try-caught
    let mappedLegacy: ActivitySession[] = [];
    try {
      let query = supabase
        .from('activity_sessions')
        .select('*')
        .in('user_id', teamUserIds)
        .order('started_at', { ascending: false });

      if (filters?.userId && filters.userId !== 'all') {
        query = query.eq('user_id', filters.userId);
      }
      if (filters?.startDate) {
        query = query.gte('started_at', `${filters.startDate}T00:00:00Z`);
      }
      if (filters?.endDate) {
        query = query.lte('started_at', `${filters.endDate}T23:59:59Z`);
      }
      if (filters?.application && filters.application !== 'all') {
        query = query.ilike('application', `%${filters.application}%`);
      }
      if (filters?.projectName && filters.projectName !== 'all') {
        query = query.ilike('project_name', `%${filters.projectName}%`);
      }

      const { data: legacySessions, error: legacyError } = await query;
      if (legacyError && isTableMissingError(legacyError)) {
        handleTableError('activity_sessions (team)', legacyError);
      } else {
        mappedLegacy = (legacySessions || []).map((row) => mapActivitySession(row, userMap));
      }
    } catch (legacyErr) {
      console.info('[ActivityService] activity_sessions not available:', (legacyErr as any)?.message);
    }

    const seen = new Set<string>();
    const combined: ActivitySession[] = [];
    [...mappedDev, ...mappedLegacy].forEach((s) => {
      if (!seen.has(s.id)) {
        seen.add(s.id);
        combined.push(s);
      }
    });

    return combined.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  } catch (err) {
    console.warn('[ActivityService] Failed to load team activity:', err);
    return [];
  }
}

/**
 * Fetches organization-wide activity for executives (Admin / CEO / CTO / COO / CPO).
 * Seamlessly integrates live developer sessions from VS Code, Cursor, and Antigravity.
 */
export async function getOrganizationActivity(
  filters?: ActivityFilter
): Promise<ActivitySession[]> {
  try {
    const userMap = await getCachedUsersMap();

    // 1. Fetch live developer_sessions (VS Code, Cursor, Antigravity)
    // Wrapped separately so a missing table doesn't crash the whole function
    let mappedDev: ActivitySession[] = [];
    try {
      let devQuery = supabase
        .from('developer_sessions')
        .select('*')
        .order('started_at', { ascending: false });

      if (filters?.userId && filters.userId !== 'all') {
        devQuery = devQuery.eq('user_id', filters.userId);
      }
      if (filters?.startDate) {
        devQuery = devQuery.gte('started_at', `${filters.startDate}T00:00:00Z`);
      }
      if (filters?.endDate) {
        devQuery = devQuery.lte('started_at', `${filters.endDate}T23:59:59Z`);
      }
      if (filters?.application && filters.application !== 'all') {
        const appLower = filters.application.toLowerCase();
        if (appLower.includes('cursor')) devQuery = devQuery.eq('tool', 'cursor');
        else if (appLower.includes('antigravity')) devQuery = devQuery.eq('tool', 'antigravity');
        else if (appLower.includes('code')) devQuery = devQuery.eq('tool', 'vscode');
      }
      if (filters?.projectName && filters.projectName !== 'all') {
        devQuery = devQuery.ilike('workspace_name', `%${filters.projectName}%`);
      }

      const { data: devSessions, error: devError } = await devQuery;
      if (devError && isTableMissingError(devError)) {
        handleTableError('developer_sessions query', devError);
      } else {
        mappedDev = (devSessions || []).map((row) => mapDeveloperSessionToActivitySession(row, userMap));
      }
    } catch (devErr) {
      console.info('[ActivityService] developer_sessions not available yet:', (devErr as any)?.message);
    }

    // 2. Fetch legacy activity_sessions
    // Wrapped separately — table may not exist until migration is applied
    let mappedLegacy: ActivitySession[] = [];
    try {
      let query = supabase
        .from('activity_sessions')
        .select('*')
        .order('started_at', { ascending: false });

      if (filters?.userId && filters.userId !== 'all') {
        query = query.eq('user_id', filters.userId);
      }
      if (filters?.startDate) {
        query = query.gte('started_at', `${filters.startDate}T00:00:00Z`);
      }
      if (filters?.endDate) {
        query = query.lte('started_at', `${filters.endDate}T23:59:59Z`);
      }
      if (filters?.application && filters.application !== 'all') {
        query = query.ilike('application', `%${filters.application}%`);
      }
      if (filters?.projectName && filters.projectName !== 'all') {
        query = query.ilike('project_name', `%${filters.projectName}%`);
      }

      const { data: legacySessions, error: legacyError } = await query;
      if (legacyError && isTableMissingError(legacyError)) {
        handleTableError('activity_sessions query', legacyError);
      } else {
        mappedLegacy = (legacySessions || []).map((row) => mapActivitySession(row, userMap));
      }
    } catch (legacyErr) {
      console.info('[ActivityService] activity_sessions not available yet:', (legacyErr as any)?.message);
    }

    // Merge without duplicates
    const seen = new Set<string>();
    const combined: ActivitySession[] = [];
    [...mappedDev, ...mappedLegacy].forEach((s) => {
      if (!seen.has(s.id)) {
        seen.add(s.id);
        combined.push(s);
      }
    });

    return combined.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  } catch (err) {
    console.warn('[ActivityService] Failed to load organization activity:', err);
    return [];
  }
}

/**
 * Subscribes to Supabase Realtime broadcast channels for live activity session updates.
 */
export function subscribeToActivitySessions(onUpdate: () => void): () => void {
  try {
    const channel = supabase
      .channel('activity-sessions-realtime-listener')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'developer_sessions' },
        () => onUpdate()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'developer_activity_events' },
        () => onUpdate()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'activity_sessions' },
        () => onUpdate()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  } catch (err) {
    console.warn('[ActivityService] Realtime subscription fallback:', err);
    return () => {};
  }
}

/**
 * Application color mapping for consistent charts and tags
 */
export function getApplicationColor(app: string): string {
  const lower = (app || '').toLowerCase();
  if (lower.includes('code') || lower.includes('vs code') || lower.includes('visual studio')) {
    return '#007ACC'; // VS Code Blue
  }
  if (lower.includes('cursor')) {
    return '#8B5CF6'; // Cursor Purple / Violet
  }
  if (lower.includes('antigravity')) {
    return '#06B6D4'; // Antigravity Cyan / Teal
  }
  return '#6366F1'; // Default Indigo
}

/**
 * Formats duration in seconds to "Xh Ym" or "Ym Zs"
 */
export function formatDurationDetailed(totalSeconds: number): string {
  if (!totalSeconds || totalSeconds <= 0) return '00h 00m';
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  return `${hours.toString().padStart(2, '0')}h ${minutes.toString().padStart(2, '0')}m`;
}

/**
 * Formats duration with seconds: "01h 18m 42s"
 */
export function formatDurationWithSeconds(totalSeconds: number): string {
  if (!totalSeconds || totalSeconds <= 0) return '00h 00m 00s';
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours.toString().padStart(2, '0')}h ${minutes.toString().padStart(2, '0')}m ${seconds.toString().padStart(2, '0')}s`;
}

/**
 * Calculates aggregated summary metrics from a list of sessions.
 * Pure function: NO mock data, returns exact zeroed metrics if sessions is empty.
 */
export function getActivitySummary(sessions: ActivitySession[]): ActivitySummary {
  let totalActiveSeconds = 0;
  let totalIdleSeconds = 0;

  const appMap = new Map<string, { activeSeconds: number; sessionCount: number }>();
  const dayMap = new Map<string, { activeSeconds: number; idleSeconds: number; count: number }>();

  // Aggregate sessions
  for (const s of sessions) {
    totalActiveSeconds += s.activeSeconds;
    totalIdleSeconds += s.idleSeconds;

    // App breakdown
    const appKey = s.application || 'Other';
    const appData = appMap.get(appKey) || { activeSeconds: 0, sessionCount: 0 };
    appData.activeSeconds += s.activeSeconds;
    appData.sessionCount += 1;
    appMap.set(appKey, appData);

    // Daily trend
    const dateKey = s.startedAt ? s.startedAt.split('T')[0] : 'Unknown';
    const dayData = dayMap.get(dateKey) || { activeSeconds: 0, idleSeconds: 0, count: 0 };
    dayData.activeSeconds += s.activeSeconds;
    dayData.idleSeconds += s.idleSeconds;
    dayData.count += 1;
    dayMap.set(dateKey, dayData);
  }

  const totalDurationSeconds = totalActiveSeconds + totalIdleSeconds;

  // App breakdown list
  const appBreakdown: AppUsageStat[] = Array.from(appMap.entries()).map(([application, data]) => ({
    application,
    activeSeconds: data.activeSeconds,
    percentage: totalActiveSeconds > 0 ? Math.round((data.activeSeconds / totalActiveSeconds) * 100) : 0,
    color: getApplicationColor(application),
    sessionCount: data.sessionCount,
  })).sort((a, b) => b.activeSeconds - a.activeSeconds);

  // Daily trend list (sorted chronologically)
  const dailyTrend: DailyActivityTrend[] = Array.from(dayMap.entries())
    .map(([date, data]) => {
      const d = new Date(date);
      const displayDate = isNaN(d.getTime())
        ? date
        : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      return {
        date,
        displayDate,
        activeHours: Number((data.activeSeconds / 3600).toFixed(2)),
        idleHours: Number((data.idleSeconds / 3600).toFixed(2)),
        sessionCount: data.count,
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  // Active vs Idle
  const activeVsIdle = [
    { name: 'Active Time', value: Math.round(totalActiveSeconds / 60), color: '#10B981' },
    { name: 'Idle Time', value: Math.round(totalIdleSeconds / 60), color: '#F59E0B' },
  ];

  return {
    totalActiveSeconds,
    totalIdleSeconds,
    totalDurationSeconds,
    sessionCount: sessions.length,
    appBreakdown,
    dailyTrend,
    activeVsIdle,
  };
}
