import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as vscode from 'vscode';
import * as crypto from 'crypto';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import type { DeveloperActivityEvent, DeveloperTool, ExtensionSessionState } from './types';

function getHynaDirPath(): string {
  return path.join(os.homedir(), '.hyna');
}

function getCredentialsFilePath(): string {
  return path.join(getHynaDirPath(), 'credentials.json');
}

interface SharedCredentials {
  userId?: string;
  tool?: DeveloperTool;
  deviceName?: string;
  apiKey?: string;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  lastConnectedAt?: string;
}

function getSharedCredentials(): SharedCredentials | null {
  try {
    const credsPath = getCredentialsFilePath();
    if (fs.existsSync(credsPath)) {
      const content = fs.readFileSync(credsPath, 'utf8');
      return JSON.parse(content) as SharedCredentials;
    }
  } catch {
    // ignore
  }
  return null;
}

function saveSharedCredentials(creds: Partial<SharedCredentials>): void {
  try {
    const hynaDir = getHynaDirPath();
    if (!fs.existsSync(hynaDir)) {
      fs.mkdirSync(hynaDir, { recursive: true });
    }
    const credsPath = getCredentialsFilePath();
    let existing: any = {};
    if (fs.existsSync(credsPath)) {
      try {
        existing = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
      } catch {
        existing = {};
      }
    }
    const updated = {
      ...existing,
      ...creds,
      lastConnectedAt: new Date().toISOString(),
    };
    fs.writeFileSync(credsPath, JSON.stringify(updated, null, 2), { mode: 0o600 });
  } catch {
    // ignore
  }
}

function clearSharedCredentials(): void {
  try {
    const credsPath = getCredentialsFilePath();
    if (fs.existsSync(credsPath)) {
      fs.unlinkSync(credsPath);
    }
  } catch {
    // ignore
  }
}

export class HynaClient {
  private supabase: SupabaseClient | null = null;
  private context: vscode.ExtensionContext;
  private queuedEvents: DeveloperActivityEvent[] = [];
  private activeSessionId: string | null = null;
  private isNetworkOffline = false;
  private connectivityTimer: NodeJS.Timeout | null = null;
  public onNetworkRestored?: () => void;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.loadQueuedEvents();
    this.initializeClient();
  }

  public setActiveSessionId(id: string | null) {
    this.activeSessionId = id;
  }

  public getActiveSessionId(): string | null {
    return this.activeSessionId;
  }

  public initializeClient() {
    const config = vscode.workspace.getConfiguration('hyna');
    const shared = getSharedCredentials();

    const supabaseUrl =
      config.get<string>('supabaseUrl') ||
      shared?.supabaseUrl ||
      process.env.VITE_SUPABASE_URL ||
      process.env.SUPABASE_URL ||
      '';

    const anonKey =
      config.get<string>('supabaseAnonKey') ||
      shared?.supabaseAnonKey ||
      process.env.VITE_SUPABASE_ANON_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      '';

    if (supabaseUrl && anonKey) {
      this.supabase = createClient(supabaseUrl, anonKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: true,
        },
      });
    }
  }

  /**
   * Helper to infer tool from code prefix (HYNA-AGY-, HYNA-CRSR-, HYNA-VSCD-)
   */
  public inferToolFromCode(code: string, fallback: DeveloperTool): DeveloperTool {
    const clean = (code || '').toUpperCase().trim();
    if (clean.includes('-AGY-') || clean.includes('ANTIGRAVITY')) return 'antigravity';
    if (clean.includes('-CRSR-') || clean.includes('CURSOR')) return 'cursor';
    if (clean.includes('-VSCD-') || clean.includes('VSCODE')) return 'vscode';
    return fallback;
  }

  /**
   * Connects extension to Hyna using a connection code generated on /settings/integrations.
   */
  public async connectWithCode(
    code: string,
    tool: DeveloperTool,
    deviceName: string
  ): Promise<{ success: boolean; userId?: string; tool?: DeveloperTool; error?: string }> {
    if (!this.supabase) {
      this.initializeClient();
    }
    if (!this.supabase) {
      const config = vscode.workspace.getConfiguration('hyna');
      let url = config.get<string>('supabaseUrl') || getSharedCredentials()?.supabaseUrl || process.env.VITE_SUPABASE_URL || '';
      if (!url) {
        url = (await vscode.window.showInputBox({
          title: 'Hyna Studio: Supabase URL',
          prompt: 'Enter your Hyna Supabase Project URL (e.g. https://xyz.supabase.co)',
          ignoreFocusOut: true,
        })) || '';
        if (url) {
          await config.update('supabaseUrl', url, vscode.ConfigurationTarget.Global);
        }
      }

      let key = config.get<string>('supabaseAnonKey') || getSharedCredentials()?.supabaseAnonKey || process.env.VITE_SUPABASE_ANON_KEY || '';
      if (!key) {
        key = (await vscode.window.showInputBox({
          title: 'Hyna Studio: Supabase Anon Key',
          prompt: 'Enter your Hyna Supabase Anon Public Key',
          password: true,
          ignoreFocusOut: true,
        })) || '';
        if (key) {
          await config.update('supabaseAnonKey', key, vscode.ConfigurationTarget.Global);
        }
      }

      this.initializeClient();
    }
    if (!this.supabase) {
      return { success: false, error: 'Supabase URL and Anon Key are required. Please configure them in Settings or supply environment variables.' };
    }

    const cleanCode = code.trim().toUpperCase();
    const effectiveTool = this.inferToolFromCode(cleanCode, tool);

    try {
      // 1. Try secure RPC function first
      try {
        let { data: rpcData, error: rpcErr } = await this.supabase.rpc('verify_developer_connection_code', {
          p_code: cleanCode,
          p_tool: effectiveTool,
          p_device_name: deviceName,
        });

        if (rpcErr && (rpcErr.code === '23505' || rpcErr.message?.includes('uq_developer_integration'))) {
          const retry = await this.supabase.rpc('verify_developer_connection_code', {
            p_code: cleanCode,
            p_tool: effectiveTool,
            p_device_name: null,
          });
          if (!retry.error && retry.data?.success) {
            rpcData = retry.data;
            rpcErr = null;
          }
        }

        if (!rpcErr && rpcData && rpcData.success) {
          const finalTool = (rpcData.tool as DeveloperTool) || effectiveTool;
          const finalUserId = rpcData.user_id;
          const finalApiKey = rpcData.api_key;

          await this.context.secrets.store('hyna_user_id', finalUserId);
          await this.context.secrets.store('hyna_tool', finalTool);
          await this.context.secrets.store('hyna_device_name', deviceName);
          if (finalApiKey) {
            await this.context.secrets.store('hyna_api_key', finalApiKey);
          }

          const config = vscode.workspace.getConfiguration('hyna');
          const shared = getSharedCredentials();
          const supabaseUrl = config.get<string>('supabaseUrl') || shared?.supabaseUrl || process.env.VITE_SUPABASE_URL || '';
          const anonKey = config.get<string>('supabaseAnonKey') || shared?.supabaseAnonKey || process.env.VITE_SUPABASE_ANON_KEY || '';

          saveSharedCredentials({
            userId: finalUserId,
            tool: finalTool,
            deviceName,
            apiKey: finalApiKey,
            supabaseUrl,
            supabaseAnonKey: anonKey,
          });

          return { success: true, userId: finalUserId, tool: finalTool };
        }
      } catch {
        // Fallback to direct query below
      }

      // 2. Direct table query fallback
      const { data, error } = await this.supabase
        .from('developer_integrations')
        .select('*')
        .eq('connection_code', cleanCode)
        .single();

      if (error || !data) {
        return { success: false, error: 'Invalid or expired connection code.' };
      }

      const finalTool = (data.tool as DeveloperTool) || effectiveTool;
      const apiKey = data.api_key || `hyna_dev_${finalTool}_${Date.now()}`;

      // Save credentials in extension secure storage
      await this.context.secrets.store('hyna_user_id', data.user_id);
      await this.context.secrets.store('hyna_tool', finalTool);
      await this.context.secrets.store('hyna_device_name', deviceName);
      await this.context.secrets.store('hyna_api_key', apiKey);

      const config = vscode.workspace.getConfiguration('hyna');
      const shared = getSharedCredentials();
      const supabaseUrl = config.get<string>('supabaseUrl') || shared?.supabaseUrl || process.env.VITE_SUPABASE_URL || '';
      const anonKey = config.get<string>('supabaseAnonKey') || shared?.supabaseAnonKey || process.env.VITE_SUPABASE_ANON_KEY || '';

      saveSharedCredentials({
        userId: data.user_id,
        tool: finalTool,
        deviceName,
        apiKey,
        supabaseUrl,
        supabaseAnonKey: anonKey,
      });

      // Update integration state to connected
      await this.supabase
        .from('developer_integrations')
        .update({
          status: 'connected',
          device_name: deviceName,
          api_key: apiKey,
          connection_code: null,
          last_connected_at: new Date().toISOString(),
          last_seen_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', data.id);

      return { success: true, userId: data.user_id, tool: finalTool };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Connection error' };
    }
  }

  public async getStoredUserId(): Promise<string | undefined> {
    const fromSecret = await this.context.secrets.get('hyna_user_id');
    if (fromSecret) return fromSecret;

    const shared = getSharedCredentials();
    if (shared?.userId) {
      await this.context.secrets.store('hyna_user_id', shared.userId);
      if (shared.tool) await this.context.secrets.store('hyna_tool', shared.tool);
      if (shared.deviceName) await this.context.secrets.store('hyna_device_name', shared.deviceName);
      if (shared.apiKey) await this.context.secrets.store('hyna_api_key', shared.apiKey);
      return shared.userId;
    }

    const config = vscode.workspace.getConfiguration('hyna');
    const fromConfig = config.get<string>('userId');
    if (fromConfig) return fromConfig;

    return undefined;
  }

  public async getStoredTool(): Promise<DeveloperTool | undefined> {
    const fromSecret = (await this.context.secrets.get('hyna_tool')) as DeveloperTool | undefined;
    if (fromSecret) return fromSecret;

    const shared = getSharedCredentials();
    if (shared?.tool) return shared.tool;

    return undefined;
  }

  public async getStoredDeviceName(): Promise<string | undefined> {
    const fromSecret = await this.context.secrets.get('hyna_device_name');
    if (fromSecret) return fromSecret;

    const shared = getSharedCredentials();
    if (shared?.deviceName) return shared.deviceName;

    return (process.env.COMPUTERNAME || process.env.HOSTNAME || 'Developer PC').trim();
  }

  public async getStoredApiKey(): Promise<string | undefined> {
    const fromSecret = await this.context.secrets.get('hyna_api_key');
    if (fromSecret) return fromSecret;

    const shared = getSharedCredentials();
    return shared?.apiKey;
  }

  /**
   * Sets integration status to 'disconnected' in Supabase without clearing local stored credentials.
   * Useful when IDE closes or session ends.
   */
  public async setDisconnectedStatus(): Promise<void> {
    const userId = await this.getStoredUserId();
    const tool = await this.getStoredTool();

    if (this.supabase && userId) {
      const nowIso = new Date().toISOString();
      try {
        // 1. Mark integration record as disconnected
        let query = this.supabase
          .from('developer_integrations')
          .update({
            status: 'disconnected',
            last_seen_at: nowIso,
            updated_at: nowIso,
          })
          .eq('user_id', userId);

        if (tool) {
          query = query.eq('tool', tool);
        }
        await query;

        // 2. Terminate any active or idle sessions in developer_sessions
        let sessQuery = this.supabase
          .from('developer_sessions')
          .update({
            status: 'ended',
            ended_at: nowIso,
            last_activity_at: nowIso,
          })
          .eq('user_id', userId)
          .in('status', ['active', 'idle']);

        if (tool) {
          sessQuery = sessQuery.eq('tool', tool);
        }
        await sessQuery;

        this.activeSessionId = null;
        await this.context.globalState.update('hyna_active_session_id', undefined);
      } catch (e) {
        console.warn('[Hyna] setDisconnectedStatus warning:', e);
      }
    }
  }

  /**
   * Complete disconnect - marks status disconnected and purges local secrets and shared config.
   */
  public async disconnect(): Promise<void> {
    await this.setDisconnectedStatus();
    await this.context.secrets.delete('hyna_user_id');
    await this.context.secrets.delete('hyna_tool');
    await this.context.secrets.delete('hyna_device_name');
    await this.context.secrets.delete('hyna_api_key');
    await this.context.globalState.update('hyna_active_session_id', undefined);
    clearSharedCredentials();
    this.activeSessionId = null;
  }

  /**
   * Sends activity event to Hyna backend. Queues locally if offline.
   * Immediately updates presence in developer_sessions and developer_integrations.
   */
  public async sendActivityEvent(event: DeveloperActivityEvent): Promise<boolean> {
    if (!this.supabase) {
      this.initializeClient();
    }
    if (!this.supabase) {
      this.enqueueOfflineEvent(event);
      return false;
    }

    try {
      const nowIso = new Date().toISOString();
      const isEnded = event.eventType === 'session_ended';

      // 1. Maintain or update developer_sessions row
      if (event.eventType === 'session_started' || !this.activeSessionId) {
        this.activeSessionId = crypto.randomUUID();
        await this.context.globalState.update('hyna_active_session_id', this.activeSessionId);
        const initialStatus = isEnded ? 'ended' : event.eventType === 'idle' ? 'idle' : 'active';

        const { error: sessErr } = await this.supabase
          .from('developer_sessions')
          .insert({
            id: this.activeSessionId,
            user_id: event.userId,
            tool: event.tool,
            project_id: event.projectId || null,
            task_id: event.taskId || null,
            workspace_name: event.workspaceName || '',
            current_file: event.filePath || event.fileName || '',
            git_branch: event.gitBranch || '',
            started_at: nowIso,
            last_activity_at: nowIso,
            ended_at: isEnded ? nowIso : null,
            status: initialStatus,
          });

        if (sessErr) {
          console.warn('[Hyna] Developer session insert warning:', sessErr?.message || sessErr);
        }
      } else {
        const sessionStatus = isEnded ? 'ended' : event.eventType === 'idle' ? 'idle' : 'active';

        const { error: updateErr } = await this.supabase
          .from('developer_sessions')
          .update({
            project_id: event.projectId || null,
            task_id: event.taskId || null,
            workspace_name: event.workspaceName || '',
            current_file: event.filePath || event.fileName || '',
            git_branch: event.gitBranch || '',
            last_activity_at: nowIso,
            status: sessionStatus,
            ended_at: isEnded ? nowIso : null,
          })
          .eq('id', this.activeSessionId);

        if (updateErr) {
          console.warn('[Hyna] Developer session update warning:', updateErr?.message || updateErr);
        }
      }

      // 2. Insert developer_activity_events
      await this.supabase.from('developer_activity_events').insert({
        user_id: event.userId,
        session_id: this.activeSessionId,
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

      // 3. Touch integration last_seen_at & status
      // First update matching user_id AND tool
      const { data: updatedRows } = await this.supabase
        .from('developer_integrations')
        .update({
          last_seen_at: nowIso,
          status: isEnded ? 'disconnected' : 'connected',
          updated_at: nowIso,
        })
        .eq('user_id', event.userId)
        .eq('tool', event.tool)
        .select('id');

      // If no integration matched this specific tool (e.g. registered as antigravity but detected as vscode),
      // update user's integration row so the Dashboard immediately recognizes the active presence!
      if (!updatedRows || updatedRows.length === 0) {
        await this.supabase
          .from('developer_integrations')
          .update({
            last_seen_at: nowIso,
            status: isEnded ? 'disconnected' : 'connected',
            tool: event.tool,
            updated_at: nowIso,
          })
          .eq('user_id', event.userId);
      }

      if (isEnded) {
        this.activeSessionId = null;
        await this.context.globalState.update('hyna_active_session_id', undefined);
      }

      // Reconnection check: if we were previously offline and now succeeded:
      if (this.isNetworkOffline) {
        this.isNetworkOffline = false;
        if (this.connectivityTimer) {
          clearInterval(this.connectivityTimer);
          this.connectivityTimer = null;
        }
        if (this.onNetworkRestored) {
          this.onNetworkRestored();
        }
      }

      // Drain any queued offline events
      await this.flushOfflineEvents();
      return true;
    } catch (err: any) {
      console.warn('[Hyna] Offline or network error, queuing event locally:', err?.message || err);
      this.isNetworkOffline = true;
      this.startConnectivityCheck();
      this.enqueueOfflineEvent(event);
      return false;
    }
  }

  private startConnectivityCheck() {
    if (this.connectivityTimer) return;
    this.connectivityTimer = setInterval(async () => {
      if (!this.isNetworkOffline) {
        if (this.connectivityTimer) {
          clearInterval(this.connectivityTimer);
          this.connectivityTimer = null;
        }
        return;
      }
      try {
        const config = vscode.workspace.getConfiguration('hyna');
        const shared = getSharedCredentials();
        const supabaseUrl =
          config.get<string>('supabaseUrl') ||
          shared?.supabaseUrl ||
          process.env.VITE_SUPABASE_URL ||
          process.env.SUPABASE_URL ||
          '';
        const anonKey =
          config.get<string>('supabaseAnonKey') ||
          shared?.supabaseAnonKey ||
          process.env.VITE_SUPABASE_ANON_KEY ||
          process.env.SUPABASE_ANON_KEY ||
          '';

        if (!supabaseUrl || !anonKey) return;

        const res = await fetch(`${supabaseUrl}/rest/v1/`, {
          method: 'HEAD',
          headers: { apikey: anonKey },
        });

        if (res.ok || res.status < 500) {
          this.isNetworkOffline = false;
          if (this.connectivityTimer) {
            clearInterval(this.connectivityTimer);
            this.connectivityTimer = null;
          }
          if (this.onNetworkRestored) {
            this.onNetworkRestored();
          }
        }
      } catch {
        // Still offline
      }
    }, 10000);
  }

  public async fetchProjects(): Promise<{ id: string; name: string }[]> {
    if (!this.supabase) this.initializeClient();
    if (!this.supabase) return [];
    try {
      const { data } = await this.supabase
        .from('projects')
        .select('id, name')
        .order('name', { ascending: true });
      return data || [];
    } catch {
      return [];
    }
  }

  public async fetchTasks(projectId: string): Promise<{ id: string; title: string }[]> {
    if (!this.supabase) this.initializeClient();
    if (!this.supabase) return [];
    try {
      const { data } = await this.supabase
        .from('tasks')
        .select('id, title')
        .eq('project_id', projectId)
        .order('title', { ascending: true });
      return data || [];
    } catch {
      return [];
    }
  }

  private enqueueOfflineEvent(event: DeveloperActivityEvent) {
    if (this.queuedEvents.length > 100) {
      this.queuedEvents.shift(); // keep bounded
    }
    this.queuedEvents.push(event);
    this.saveQueuedEvents();
  }

  private async flushOfflineEvents() {
    if (this.queuedEvents.length === 0 || !this.supabase) return;
    const batch = [...this.queuedEvents];
    this.queuedEvents = [];
    this.saveQueuedEvents();

    try {
      const rows = batch.map((evt) => ({
        user_id: evt.userId,
        session_id: this.activeSessionId,
        project_id: evt.projectId || null,
        task_id: evt.taskId || null,
        tool: evt.tool,
        event_type: evt.eventType,
        workspace_name: evt.workspaceName || '',
        file_name: evt.fileName || '',
        file_path: evt.filePath || '',
        git_branch: evt.gitBranch || '',
        metadata: evt.metadata || {},
        created_at: evt.timestamp,
      }));

      await this.supabase.from('developer_activity_events').insert(rows);
    } catch {
      // Re-queue on failure
      this.queuedEvents = [...batch, ...this.queuedEvents];
      this.saveQueuedEvents();
    }
  }

  private loadQueuedEvents() {
    const raw = this.context.globalState.get<string>('hyna_offline_events');
    if (raw) {
      try {
        this.queuedEvents = JSON.parse(raw);
      } catch {
        this.queuedEvents = [];
      }
    }
  }

  private saveQueuedEvents() {
    this.context.globalState.update(
      'hyna_offline_events',
      JSON.stringify(this.queuedEvents)
    );
  }
}
