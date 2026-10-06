// ============================================================
// HYNA VS CODE & CURSOR EXTENSION - COMMON ACTIVITY PROTOCOL
// ============================================================

export type DeveloperTool = 'vscode' | 'cursor' | 'antigravity';

export type ActivityEventType =
  | 'session_started'
  | 'session_heartbeat'
  | 'file_activity'
  | 'workspace_changed'
  | 'task_started'
  | 'task_changed'
  | 'idle'
  | 'active'
  | 'session_ended';

/**
 * Common Activity Event Format as specified in Section 4.
 */
export type DeveloperActivityEvent = {
  userId: string;
  tool: DeveloperTool;
  eventType: ActivityEventType;
  projectId?: string;
  taskId?: string;
  workspaceName?: string;
  fileName?: string;
  filePath?: string;
  gitBranch?: string;
  timestamp: string;
  metadata?: Record<string, any>;
};

export interface ExtensionSessionState {
  userId: string;
  tool: DeveloperTool;
  sessionId?: string;
  projectId?: string;
  projectName?: string;
  taskId?: string;
  taskTitle?: string;
  workspaceName?: string;
  currentFile?: string;
  gitBranch?: string;
  status: 'active' | 'idle' | 'ended';
  lastActivityAt: number;
}
