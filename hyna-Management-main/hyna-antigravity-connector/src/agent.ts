import { createClient, SupabaseClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as crypto from "crypto";
import { DeveloperActivityEvent, DeveloperEventType, StoredCredentials, ProjectTaskMapping } from "./types";
import { getCredentials, enqueueOfflineEvent, getOfflineQueue, clearOfflineQueue, getLocalProjectTaskConfig } from "./storage";
import { getSafeGitMetadata } from "./git";

const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes default
const HEARTBEAT_INTERVAL_MS = 45 * 1000; // 45 seconds

export class AntigravityActivityAgent {
  private client: SupabaseClient | null = null;
  private creds: StoredCredentials | null = null;
  private currentSessionId: string | null = null;
  private isIdle = false;
  private lastActivityTime = Date.now();
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private idleCheckTimer: NodeJS.Timeout | null = null;
  private watcher: fs.FSWatcher | null = null;
  private currentFile: string | undefined;
  private currentFilePath: string | undefined;
  private projectTask: ProjectTaskMapping = {};
  private workspaceName: string;
  private workspacePath: string;

  constructor(workspacePath: string = process.cwd()) {
    this.workspacePath = workspacePath;
    this.workspaceName = path.basename(workspacePath);
    this.projectTask = getLocalProjectTaskConfig(workspacePath) || {};
  }

  public async start(): Promise<void> {
    this.creds = getCredentials();
    if (!this.creds) {
      console.error("\x1b[31m[Hyna Antigravity Agent] Error: Not connected. Run 'hyna-antigravity connect' first.\x1b[0m");
      process.exit(1);
    }

    this.client = createClient(this.creds.supabaseUrl, this.creds.supabaseAnonKey);

    console.log("\x1b[32m[Hyna Antigravity Agent] Connected to Hyna Studio\x1b[0m");
    console.log(`[Hyna Antigravity Agent] Workspace: ${this.workspaceName}`);
    console.log(`[Hyna Antigravity Agent] Device: ${this.creds.deviceName || os.hostname()}`);
    if (this.projectTask.projectName) {
      console.log(`[Hyna Antigravity Agent] Project: ${this.projectTask.projectName}`);
    }
    if (this.projectTask.taskTitle) {
      console.log(`[Hyna Antigravity Agent] Task: ${this.projectTask.taskTitle}`);
    }

    // Start session
    await this.sendEvent("session_started");

    // Start file watcher (safe metadata only)
    this.startSafeWatcher();

    // Start heartbeat
    this.heartbeatTimer = setInterval(() => {
      this.heartbeat();
    }, HEARTBEAT_INTERVAL_MS);

    // Start idle checker
    this.idleCheckTimer = setInterval(() => {
      this.checkIdleState();
    }, 15 * 1000);

    // Setup graceful exit
    process.on("SIGINT", async () => {
      await this.stop();
      process.exit(0);
    });

    process.on("SIGTERM", async () => {
      await this.stop();
      process.exit(0);
    });

    // Flush any pending offline queue
    await this.flushOfflineQueue();

    console.log("\x1b[36m[Hyna Antigravity Agent] Tracking active work. Press Ctrl+C to stop.\x1b[0m");
  }

  public async stop(): Promise<void> {
    console.log("\n[Hyna Antigravity Agent] Ending session and disconnecting...");
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.idleCheckTimer) clearInterval(this.idleCheckTimer);
    if (this.watcher) this.watcher.close();

    await this.sendEvent("session_ended");

    if (this.client && this.creds) {
      try {
        await this.client
          .from("developer_integrations")
          .update({
            status: "disconnected",
            last_seen_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", this.creds.userId)
          .eq("tool", "antigravity");
      } catch {
        // ignore
      }
    }
    console.log("\x1b[32m[Hyna Antigravity Agent] Session ended safely. Workstation disconnected.\x1b[0m");
  }

  public recordActivity(relativeFilePath?: string): void {
    const wasIdle = this.isIdle;
    this.lastActivityTime = Date.now();
    this.isIdle = false;

    if (relativeFilePath) {
      this.currentFilePath = relativeFilePath.replace(/\\/g, "/");
      this.currentFile = path.basename(relativeFilePath);
    }

    if (wasIdle) {
      console.log("\x1b[32m[Hyna Antigravity Agent] Member resumed activity (ACTIVE)\x1b[0m");
      this.sendEvent("active");
    }
  }

  private checkIdleState(): void {
    const elapsed = Date.now() - this.lastActivityTime;
    if (elapsed >= IDLE_TIMEOUT_MS && !this.isIdle) {
      this.isIdle = true;
      console.log(`\x1b[33m[Hyna Antigravity Agent] No activity detected for 5m. Status: IDLE\x1b[0m`);
      this.sendEvent("idle");
    }
  }

  private async heartbeat(): Promise<void> {
    const eventType: DeveloperEventType = this.isIdle ? "idle" : "session_heartbeat";
    await this.sendEvent(eventType);
    await this.flushOfflineQueue();
  }

  private startSafeWatcher(): void {
    const ignoredPatterns = [
      /node_modules/,
      /\.git/,
      /\.next/,
      /dist/,
      /build/,
      /\.env/,
      /\.turbo/,
      /coverage/,
      /\.hyna/,
    ];

    try {
      let debounceTimeout: NodeJS.Timeout | null = null;
      this.watcher = fs.watch(this.workspacePath, { recursive: true }, (eventType, filename) => {
        if (!filename) return;

        // Ensure safe relative file path
        const norm = filename.replace(/\\/g, "/");
        for (const pattern of ignoredPatterns) {
          if (pattern.test(norm)) return;
        }

        if (debounceTimeout) clearTimeout(debounceTimeout);
        debounceTimeout = setTimeout(() => {
          this.recordActivity(norm);
          this.sendEvent("file_activity");
        }, 1500);
      });
    } catch (err) {
      console.warn("[Hyna Antigravity Agent] Note: Directory watcher fallback enabled.", err);
    }
  }

  public async sendEvent(eventType: DeveloperEventType): Promise<void> {
    if (!this.creds || !this.client) return;

    const gitMeta = getSafeGitMetadata(this.workspacePath);
    const event: DeveloperActivityEvent = {
      userId: this.creds.userId,
      tool: "antigravity",
      eventType,
      projectId: this.projectTask.projectId,
      taskId: this.projectTask.taskId,
      workspaceName: this.workspaceName,
      fileName: this.currentFile,
      filePath: this.currentFilePath,
      gitBranch: gitMeta.branch,
      timestamp: new Date().toISOString(),
      metadata: {
        commitsToday: gitMeta.commitsToday,
        lastCommitAgo: gitMeta.lastCommitAgo,
        deviceName: this.creds.deviceName,
      },
    };

    try {
      // 1. Maintain developer_sessions table
      if (eventType === "session_started" || !this.currentSessionId) {
        this.currentSessionId = crypto.randomUUID();
        const { error: sErr } = await this.client
          .from("developer_sessions")
          .insert({
            id: this.currentSessionId,
            user_id: this.creds.userId,
            tool: "antigravity",
            workspace_name: this.workspaceName,
            project_id: this.projectTask.projectId || null,
            task_id: this.projectTask.taskId || null,
            current_file: this.currentFilePath || null,
            git_branch: gitMeta.branch || null,
            started_at: event.timestamp,
            last_activity_at: event.timestamp,
            status: "active",
          });

        if (sErr) throw sErr;
      } else if (this.currentSessionId) {
        const sessionStatus = eventType === "session_ended" ? "ended" : this.isIdle ? "idle" : "active";
        await this.client
          .from("developer_sessions")
          .update({
            last_activity_at: event.timestamp,
            status: sessionStatus,
            ended_at: eventType === "session_ended" ? event.timestamp : null,
            current_file: this.currentFilePath || null,
            git_branch: gitMeta.branch || null,
            project_id: this.projectTask.projectId || null,
            task_id: this.projectTask.taskId || null,
          })
          .eq("id", this.currentSessionId);
      }

      // 2. Insert event into developer_activity_events
      await this.client.from("developer_activity_events").insert({
        user_id: this.creds.userId,
        session_id: this.currentSessionId,
        tool: "antigravity",
        event_type: event.eventType,
        workspace_name: this.workspaceName,
        project_id: this.projectTask.projectId || null,
        task_id: this.projectTask.taskId || null,
        file_name: this.currentFile || null,
        file_path: this.currentFilePath || null,
        git_branch: gitMeta.branch || null,
        metadata: event.metadata || {},
        created_at: event.timestamp,
      });

      // 3. Update developer_integrations last_seen_at
      await this.client
        .from("developer_integrations")
        .update({
          last_seen_at: event.timestamp,
          status: eventType === "session_ended" ? "disconnected" : "connected",
        })
        .eq("user_id", this.creds.userId)
        .eq("tool", "antigravity");
    } catch (error) {
      console.warn("[Hyna Antigravity Agent] Network offline. Enqueuing event safely locally...");
      enqueueOfflineEvent(event);
    }
  }

  private async flushOfflineQueue(): Promise<void> {
    const queue = getOfflineQueue();
    if (queue.length === 0 || !this.client || !this.creds) return;

    try {
      const inserts = queue.map((ev) => ({
        user_id: this.creds!.userId,
        session_id: this.currentSessionId,
        tool: "antigravity",
        event_type: ev.eventType,
        workspace_name: ev.workspaceName,
        project_id: ev.projectId || null,
        task_id: ev.taskId || null,
        file_name: ev.fileName || null,
        file_path: ev.filePath || null,
        git_branch: ev.gitBranch || null,
        metadata: ev.metadata || {},
        created_at: ev.timestamp,
      }));

      const { error } = await this.client.from("developer_activity_events").insert(inserts);
      if (!error) {
        clearOfflineQueue();
        console.log(`[Hyna Antigravity Agent] Flushed ${queue.length} offline events.`);
      }
    } catch {
      // Keep in queue for next heartbeat retry
    }
  }
}
