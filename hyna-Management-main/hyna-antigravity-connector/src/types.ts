export type DeveloperTool = "vscode" | "cursor" | "antigravity";

export type DeveloperEventType =
  | "session_started"
  | "session_heartbeat"
  | "file_activity"
  | "workspace_changed"
  | "task_started"
  | "task_changed"
  | "idle"
  | "active"
  | "session_ended";

export interface DeveloperActivityEvent {
  userId: string;
  tool: DeveloperTool;
  eventType: DeveloperEventType;
  projectId?: string;
  taskId?: string;
  workspaceName?: string;
  fileName?: string;
  filePath?: string;
  gitBranch?: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface StoredCredentials {
  supabaseUrl: string;
  supabaseAnonKey: string;
  userId: string;
  apiKey: string;
  tool: DeveloperTool;
  deviceName: string;
  lastConnectedAt: string;
}

export interface ProjectTaskMapping {
  projectId?: string;
  projectName?: string;
  taskId?: string;
  taskTitle?: string;
}
