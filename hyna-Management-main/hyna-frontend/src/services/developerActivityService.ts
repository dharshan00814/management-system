// ============================================================
// HYNA STUDIO MANAGEMENT - LIVE DEVELOPER ACTIVITY SERVICE
// Core Service for IDE Integrations, Sessions, Events & Realtime
// ============================================================

import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import type {
  DeveloperTool,
  DeveloperActivityEvent,
  DeveloperIntegration,
  DeveloperSession,
  LiveDeveloperCardData,
  LiveDeveloperMetrics,
} from '@/types/developerActivity';
import type { User, Project, Task } from '@/types';
import { getUsers, getProjects, getTasks } from './api';

let tableWarningShown = false;

function isTableMissingError(error: any): boolean {
  if (!error) return false;
  const msg = typeof error === 'string' ? error : (error.message || '');
  const code = error.code || '';
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    error.status === 404 ||
    msg.includes('does not exist') ||
    msg.includes('schema cache') ||
    msg.includes('Could not find the table')
  );
}

function handleTableError(actionDesc: string, error: any) {
  if (isTableMissingError(error)) {
    if (!tableWarningShown) {
      console.info(
        '[DeveloperActivityService] Note: developer activity tables are not yet created in Supabase. Apply migration in supabase/migrations/20260927000000_live_developer_activity.sql to activate live tracking.'
      );
      tableWarningShown = true;
    }
  } else {
    console.warn(`[DeveloperActivityService] ${actionDesc}:`, error?.message || error);
  }
}

// Memory caches to avoid redundant foreign key joins
let cachedUsersMap: Map<string, User> = new Map();
let cachedProjectsMap: Map<string, Project> = new Map();
let cachedTasksMap: Map<string, Task> = new Map();

async function preloadLookupMaps() {
  try {
    const [users, projects, tasks] = await Promise.all([
      getUsers().catch(() => []),
      getProjects().catch(() => []),
      getTasks().catch(() => []),
    ]);

    cachedUsersMap = new Map();
    users.forEach((u) => cachedUsersMap.set(u.id, u));
    cachedProjectsMap = new Map();
    projects.forEach((p) => cachedProjectsMap.set(p.id, p));
    cachedTasksMap = new Map();
    tasks.forEach((t) => cachedTasksMap.set(t.id, t));
  } catch (err) {
    console.warn('[DeveloperActivityService] Lookup preload non-fatal error:', err);
  }
}

// ------------------------------------------------------------
// 1. INTEGRATIONS API
// ------------------------------------------------------------

/**
 * Fetches the authenticated user's connected IDE integrations.
 */
export async function getMyDeveloperIntegrations(): Promise<DeveloperIntegration[]> {
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return [];

    const { data, error } = await supabase
      .from('developer_integrations')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      handleTableError('Error fetching developer integrations', error);
      return [];
    }

    return (data || []).map((row) => ({
      id: row.id,
      userId: row.user_id,
      tool: row.tool as DeveloperTool,
      status: row.status,
      deviceName: row.device_name || 'Developer Workstation',
      connectionCode: row.connection_code,
      apiKey: row.api_key,
      lastConnectedAt: row.last_connected_at,
      lastSeenAt: row.last_seen_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  } catch (err) {
    console.warn('[DeveloperActivityService] Failed to load integrations:', err);
    return [];
  }
}

/**
 * Checks if the developer activity tables exist in the Supabase schema cache.
 */
export async function checkDeveloperTablesExist(): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('developer_integrations')
      .select('id')
      .limit(1);
    if (error && isTableMissingError(error)) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Generates or refreshes a secure connection code and API key for an IDE.
 * Format: HYNA-{TOOL}-{RANDOM} (e.g., HYNA-CRSR-8724)

 */
export async function generateIntegrationPairingCode(
  tool: DeveloperTool,
  deviceName: string = 'Developer Machine'
): Promise<{ success: boolean; connectionCode?: string; apiKey?: string; error?: string }> {
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return { success: false, error: 'Authentication required' };
    }

    const toolTag = tool === 'vscode' ? 'VSCD' : tool === 'cursor' ? 'CRSR' : 'AGY';
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const connectionCode = `HYNA-${toolTag}-${randomSuffix}`;
    const apiKey = `hyna_dev_${tool}_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;

    // Check if user already has an integration record for this tool
    const { data: existing } = await supabase
      .from('developer_integrations')
      .select('id, device_name')
      .eq('user_id', user.id)
      .eq('tool', tool)
      .order('last_seen_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let data;
    let error;

    if (existing) {
      const updateRes = await supabase
        .from('developer_integrations')
        .update({
          connection_code: connectionCode,
          api_key: apiKey,
          status: 'disconnected',
          last_seen_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select()
        .single();
      data = updateRes.data;
      error = updateRes.error;
    } else {
      const upsertRes = await supabase
        .from('developer_integrations')
        .upsert(
          {
            user_id: user.id,
            tool,
            device_name: deviceName.trim() || 'Developer Machine',
            status: 'disconnected',
            connection_code: connectionCode,
            api_key: apiKey,
            last_seen_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,tool,device_name' }
        )
        .select()
        .single();
      data = upsertRes.data;
      error = upsertRes.error;
    }

    if (error) {
      handleTableError('Failed to generate integration pairing code', error);
      const friendlyMsg = isTableMissingError(error)
        ? 'Developer activity tables are not yet created in Supabase. Run supabase/run_this_in_supabase_sql_editor.sql in your Supabase SQL Editor.'
        : error.message;
      return { success: false, error: friendlyMsg };
    }

    return {
      success: true,
      connectionCode: data.connection_code || connectionCode,
      apiKey: data.api_key || apiKey,
    };
  } catch (err: any) {
    console.error('[DeveloperActivityService] Exception generating connection code:', err);
    return { success: false, error: err?.message || 'Failed to create code' };
  }
}

/**
 * Disconnects an IDE integration and marks active developer sessions as ended.
 */
export async function disconnectIntegration(integrationId: string): Promise<boolean> {
  try {
    const nowIso = new Date().toISOString();

    // 1. Fetch integration row to know user_id and tool
    const { data: integ } = await supabase
      .from('developer_integrations')
      .select('user_id, tool')
      .eq('id', integrationId)
      .maybeSingle();

    // 2. Mark integration as disconnected
    const { error } = await supabase
      .from('developer_integrations')
      .update({
        status: 'disconnected',
        connection_code: null,
        last_seen_at: nowIso,
        updated_at: nowIso,
      })
      .eq('id', integrationId);

    if (error) {
      handleTableError('Failed to disconnect integration', error);
      return false;
    }

    // 3. Mark active/idle sessions in developer_sessions as ended
    if (integ?.user_id && integ?.tool) {
      await supabase
        .from('developer_sessions')
        .update({
          status: 'ended',
          ended_at: nowIso,
          last_activity_at: nowIso,
        })
        .eq('user_id', integ.user_id)
        .eq('tool', integ.tool)
        .in('status', ['active', 'idle']);
    }

    return true;
  } catch (err) {
    console.warn('[DeveloperActivityService] Disconnect exception:', err);
    return false;
  }
}

// ------------------------------------------------------------
// 2. ACTIVITY EVENTS & SESSION HEARTBEAT
// ------------------------------------------------------------

/**
 * Common Activity Event Ingestion Endpoint.
 * Ingests uniformly formatted events from VS Code, Cursor, and Antigravity.
 * Strictly derives authenticated user_id from active Supabase session.
 */
export async function sendDeveloperActivityEvent(
  event: Omit<DeveloperActivityEvent, 'userId'> & { userId?: string }
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return { success: false, error: 'Unauthorized: No active user session' };
    }

    const verifiedUserId = user.id; // Enforce server-side user verification
    const nowIso = new Date().toISOString();

    // 1. Locate or create active session for this user and tool
    let sessionId: string | undefined;

    const { data: existingSessions } = await supabase
      .from('developer_sessions')
      .select('id, started_at, status')
      .eq('user_id', verifiedUserId)
      .eq('tool', event.tool)
      .in('status', ['active', 'idle'])
      .order('started_at', { ascending: false })
      .limit(1);

    const activeSession = existingSessions && existingSessions[0];

    const sessionStatus: 'active' | 'idle' | 'ended' =
      event.eventType === 'session_ended'
        ? 'ended'
        : event.eventType === 'idle'
        ? 'idle'
        : 'active';

    if (activeSession && event.eventType !== 'session_started') {
      sessionId = activeSession.id;
      // Update session state
      await supabase
        .from('developer_sessions')
        .update({
          project_id: event.projectId || null,
          task_id: event.taskId || null,
          workspace_name: event.workspaceName || '',
          current_file: event.filePath || event.fileName || '',
          git_branch: event.gitBranch || '',
          last_activity_at: nowIso,
          status: sessionStatus,
          ended_at: event.eventType === 'session_ended' ? nowIso : null,
        })
        .eq('id', sessionId);
    } else {
      // Create new session
      const { data: newSession, error: createSessionErr } = await supabase
        .from('developer_sessions')
        .insert({
          user_id: verifiedUserId,
          project_id: event.projectId || null,
          task_id: event.taskId || null,
          tool: event.tool,
          workspace_name: event.workspaceName || '',
          current_file: event.filePath || event.fileName || '',
          git_branch: event.gitBranch || '',
          started_at: nowIso,
          last_activity_at: nowIso,
          status: sessionStatus,
        })
        .select('id')
        .single();

      if (!createSessionErr && newSession) {
        sessionId = newSession.id;
      }
    }

    // 2. Insert safe activity event
    const { error: eventError } = await supabase
      .from('developer_activity_events')
      .insert({
        user_id: verifiedUserId,
        session_id: sessionId || null,
        project_id: event.projectId || null,
        task_id: event.taskId || null,
        tool: event.tool,
        event_type: event.eventType,
        workspace_name: event.workspaceName || '',
        file_name: event.fileName || '',
        file_path: event.filePath || '',
        git_branch: event.gitBranch || '',
        metadata: event.metadata || {},
        created_at: event.timestamp || nowIso,
      });

    if (eventError) {
      handleTableError('Error inserting activity event', eventError);
    }

    // 3. Touch integration last_seen_at
    await supabase
      .from('developer_integrations')
      .update({ last_seen_at: nowIso, status: 'connected' })
      .eq('user_id', verifiedUserId)
      .eq('tool', event.tool);

    return { success: true };
  } catch (err: any) {
    console.error('[DeveloperActivityService] Exception processing activity event:', err);
    return { success: false, error: err?.message || 'Activity processing failed' };
  }
}

// ------------------------------------------------------------
// 3. LIVE DEVELOPER DASHBOARD QUERIES
// ------------------------------------------------------------

/**
 * Fetches current active/recent developer sessions across the team/org.
 * Enforces RLS:
 * - Admin (CEO/CTO/COO/CPO/Admin) gets org-wide activity.
 * - Manager gets assigned project members.
 * - Member gets own activity.
 */
export async function getLiveDeveloperCards(): Promise<{
  cards: LiveDeveloperCardData[];
  metrics: LiveDeveloperMetrics;
}> {
  try {
    await preloadLookupMaps();

    const [{ data: sessions, error }, { data: integrations }] = await Promise.all([
      supabase.from('developer_sessions').select('*').order('last_activity_at', { ascending: false }),
      supabase.from('developer_integrations').select('*'),
    ]);

    if (error) {
      handleTableError('Error loading live developer sessions', error);
      return {
        cards: [],
        metrics: {
          activeCount: 0,
          idleCount: 0,
          offlineCount: 0,
          totalTeamCount: 0,
          toolBreakdown: { vscode: 0, cursor: 0, antigravity: 0 },
        },
      };
    }

    const now = Date.now();
    const IDLE_CUTOFF_MS = 2.5 * 60 * 1000; // 2.5 minutes inactivity without heartbeat = idle
    const OFFLINE_CUTOFF_MS = 5 * 60 * 1000; // 5 minutes inactivity without heartbeat = offline

    // Map connected status: `${user_id}:${tool}` -> boolean
    const connectedToolMap = new Map<string, boolean>();
    (integrations || []).forEach((item) => {
      const isConnected = item.status === 'connected';
      connectedToolMap.set(`${item.user_id}:${item.tool}`, isConnected);
    });

    // Group latest session by user
    const userLatestSessionMap = new Map<string, any>();
    (sessions || []).forEach((s) => {
      if (!userLatestSessionMap.has(s.user_id)) {
        userLatestSessionMap.set(s.user_id, s);
      }
    });

    const cards: LiveDeveloperCardData[] = [];
    const toolBreakdown: Record<DeveloperTool, number> = {
      vscode: 0,
      cursor: 0,
      antigravity: 0,
    };

    let activeCount = 0;
    let idleCount = 0;
    let offlineCount = 0;

    const allUsers = Array.from(cachedUsersMap.values());

    allUsers.forEach((user) => {
      const s = userLatestSessionMap.get(user.id);
      let status: 'active' | 'idle' | 'offline' = 'offline';
      let activeDurationSeconds = 0;
      let lastActivityAgo = 'Offline';

      if (s) {
        const lastActMs = new Date(s.last_activity_at).getTime();
        const startMs = new Date(s.started_at).getTime();
        const diffMs = Math.max(0, now - lastActMs);
        const isToolConnected = s.tool ? connectedToolMap.get(`${s.user_id}:${s.tool}`) : false;

        // If session is explicitly ended, or the tool is disconnected, or inactivity passed cutoff -> offline
        if (s.status === 'ended' || isToolConnected === false || diffMs > OFFLINE_CUTOFF_MS) {
          status = 'offline';
        } else if (s.status === 'idle' || diffMs > IDLE_CUTOFF_MS) {
          status = 'idle';
        } else {
          status = 'active';
        }

        // Live continuous usage prediction:
        if (status === 'active') {
          activeDurationSeconds = Math.max(0, Math.round((now - startMs) / 1000));
        } else if (status === 'idle') {
          activeDurationSeconds = Math.max(0, Math.round((lastActMs - startMs) / 1000));
        } else {
          const sessionEnd = s.ended_at ? new Date(s.ended_at).getTime() : lastActMs;
          activeDurationSeconds = Math.max(0, Math.round((sessionEnd - startMs) / 1000));
        }

        lastActivityAgo = status === 'active' ? 'Active now' : formatTimeAgo(s.last_activity_at);

        if (status !== 'offline') {
          const t = s.tool as DeveloperTool;
          if (toolBreakdown[t] !== undefined) toolBreakdown[t]++;
        }
      }

      if (status === 'active') activeCount++;
      else if (status === 'idle') idleCount++;
      else offlineCount++;

      const project = s?.project_id ? cachedProjectsMap.get(s.project_id) : undefined;
      const task = s?.task_id ? cachedTasksMap.get(s.task_id) : undefined;

      const currentSession: DeveloperSession | undefined = s
        ? {
            id: s.id,
            userId: s.user_id,
            integrationId: s.integration_id,
            projectId: s.project_id,
            taskId: s.task_id,
            tool: s.tool as DeveloperTool,
            workspaceName: s.workspace_name,
            currentFile: s.current_file,
            gitBranch: s.git_branch,
            startedAt: s.started_at,
            started_at: s.started_at,
            lastActivityAt: s.last_activity_at,
            last_activity_at: s.last_activity_at,
            endedAt: s.ended_at,
            status: s.status,
            createdAt: s.created_at,
            updatedAt: s.updated_at,
            user,
            project,
            task,
          }
        : undefined;

      cards.push({
        user,
        status,
        tool: s?.tool as DeveloperTool | undefined,
        currentSession,
        projectName: project?.name || s?.workspace_name || undefined,
        taskTitle: task?.title || undefined,
        workspaceName: s?.workspace_name || undefined,
        currentFile: sanitizeFilePath(s?.current_file),
        gitBranch: s?.git_branch || undefined,
        activeDurationSeconds,
        lastActivityAt: s?.last_activity_at,
        lastActivityAgo,
      });
    });

    // Sort: Active first, then Idle, then Offline
    cards.sort((a, b) => {
      const order = { active: 0, idle: 1, offline: 2 };
      if (order[a.status] !== order[b.status]) {
        return order[a.status] - order[b.status];
      }
      return (b.activeDurationSeconds || 0) - (a.activeDurationSeconds || 0);
    });

    return {
      cards,
      metrics: {
        activeCount,
        idleCount,
        offlineCount,
        totalTeamCount: allUsers.length,
        toolBreakdown,
      },
    };
  } catch (err) {
    console.warn('[DeveloperActivityService] Failed to load developer cards:', err);
    return {
      cards: [],
      metrics: {
        activeCount: 0,
        idleCount: 0,
        offlineCount: 0,
        totalTeamCount: 0,
        toolBreakdown: { vscode: 0, cursor: 0, antigravity: 0 },
      },
    };
  }
}

/**
 * Fetches recent activity timeline events for a specific user or session.
 */
export async function getDeveloperActivityTimeline(
  userId?: string,
  limit: number = 20
): Promise<DeveloperActivityEvent[]> {
  try {
    let query = supabase
      .from('developer_activity_events')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { data, error } = await query;
    if (error) {
      handleTableError('Error fetching activity timeline', error);
      return [];
    }

    return (data || []).map((row) => ({
      id: row.id,
      userId: row.user_id,
      tool: row.tool as DeveloperTool,
      eventType: row.event_type,
      projectId: row.project_id,
      taskId: row.task_id,
      workspaceName: row.workspace_name,
      fileName: row.file_name,
      filePath: row.file_path,
      gitBranch: row.git_branch,
      timestamp: row.created_at,
      metadata: row.metadata,
    }));
  } catch (err) {
    console.warn('[DeveloperActivityService] Failed to load timeline:', err);
    return [];
  }
}

// ------------------------------------------------------------
// 4. MEMBER SUMMARY & REALTIME SUBSCRIPTION
// ------------------------------------------------------------

/**
 * Summarizes the current user's activity for today (/my-activity).
 */
export async function getMyDeveloperTodaySummary(): Promise<{
  activeSeconds: number;
  idleSeconds: number;
  sessionCount: number;
  toolBreakdown: { tool: DeveloperTool; seconds: number; percentage: number }[];
  projectBreakdown: { projectName: string; seconds: number }[];
}> {
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return {
        activeSeconds: 0,
        idleSeconds: 0,
        sessionCount: 0,
        toolBreakdown: [],
        projectBreakdown: [],
      };
    }

    const todayStr = new Date().toISOString().split('T')[0];
    const { data: sessions, error } = await supabase
      .from('developer_sessions')
      .select('*')
      .eq('user_id', user.id)
      .gte('started_at', `${todayStr}T00:00:00Z`);

    if (error) {
      handleTableError('Failed to load my activity summary', error);
      return {
        activeSeconds: 0,
        idleSeconds: 0,
        sessionCount: 0,
        toolBreakdown: [],
        projectBreakdown: [],
      };
    }

    let totalActiveSec = 0;
    let totalIdleSec = 0;
    const toolTimeMap: Record<DeveloperTool, number> = {
      vscode: 0,
      cursor: 0,
      antigravity: 0,
    };
    const projectTimeMap: Record<string, number> = {};

    (sessions || []).forEach((s) => {
      const start = new Date(s.started_at).getTime();
      const end = s.ended_at ? new Date(s.ended_at).getTime() : new Date(s.last_activity_at).getTime();
      const durationSec = Math.max(0, Math.round((end - start) / 1000));

      if (s.status === 'idle') {
        totalIdleSec += durationSec;
      } else {
        totalActiveSec += durationSec;
      }

      const t = s.tool as DeveloperTool;
      if (toolTimeMap[t] !== undefined) {
        toolTimeMap[t] += durationSec;
      }

      const pName = s.workspace_name || 'General Workspace';
      projectTimeMap[pName] = (projectTimeMap[pName] || 0) + durationSec;
    });

    const totalTracked = totalActiveSec + totalIdleSec || 1;
    const toolBreakdown = (['cursor', 'vscode', 'antigravity'] as DeveloperTool[]).map((tool) => ({
      tool,
      seconds: toolTimeMap[tool],
      percentage: Math.round((toolTimeMap[tool] / totalTracked) * 100),
    }));

    const projectBreakdown = Object.entries(projectTimeMap).map(([projectName, seconds]) => ({
      projectName,
      seconds,
    }));

    return {
      activeSeconds: totalActiveSec,
      idleSeconds: totalIdleSec,
      sessionCount: (sessions || []).length,
      toolBreakdown,
      projectBreakdown,
    };
  } catch (err) {
    console.warn('[DeveloperActivityService] Exception calculating summary:', err);
    return {
      activeSeconds: 0,
      idleSeconds: 0,
      sessionCount: 0,
      toolBreakdown: [],
      projectBreakdown: [],
    };
  }
}

/**
 * Subscribes to Supabase Realtime broadcast channels for live developer sessions.
 */
export function subscribeToLiveDeveloperActivity(onUpdate: () => void): () => void {
  try {
    const channel = supabase
      .channel('live-developer-activity-feed')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'developer_sessions' },
        () => onUpdate()
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'developer_activity_events' },
        () => onUpdate()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'developer_integrations' },
        () => onUpdate()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  } catch (err) {
    console.warn('[DeveloperActivityService] Realtime subscription fallback:', err);
    return () => {};
  }
}

// ------------------------------------------------------------
// UTILITY FUNCTIONS
// ------------------------------------------------------------

/**
 * Strips sensitive local path prefixes (e.g. C:\Users\Username\...)
 * Leaving only safe relative workspace paths (e.g. src/routes/admin.tsx)
 */
export function sanitizeFilePath(fullPath?: string): string {
  if (!fullPath) return '';
  const cleaned = fullPath.replace(/\\/g, '/');
  // Match common project source folders
  const match = cleaned.match(/(src|app|pages|components|lib|services|server)\/.*$/i);
  if (match) return match[0];
  const parts = cleaned.split('/');
  return parts.slice(-2).join('/');
}

export function formatTimeAgo(isoString?: string): string {
  if (!isoString) return 'Offline';
  const diffSec = Math.max(0, Math.round((Date.now() - new Date(isoString).getTime()) / 1000));
  if (diffSec < 20) return 'Just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.floor(diffHours / 24)}d ago`;
}

export function getToolBrandColor(tool?: DeveloperTool | string): string {
  const t = (tool || '').toLowerCase();
  if (t === 'cursor') return '#00D1B2'; // Cursor Cyan/Teal
  if (t === 'vscode') return '#007ACC'; // VS Code Blue
  if (t === 'antigravity') return '#8B5CF6'; // Antigravity Purple
  return '#6B7280';
}

export function getToolDisplayName(tool?: DeveloperTool | string): string {
  const t = (tool || '').toLowerCase();
  if (t === 'cursor') return 'Cursor';
  if (t === 'vscode') return 'Visual Studio Code';
  if (t === 'antigravity') return 'Antigravity';
  return 'Development IDE';
}
