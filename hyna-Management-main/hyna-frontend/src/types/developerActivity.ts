// ============================================================
// HYNA STUDIO MANAGEMENT - DEVELOPER ACTIVITY TYPES
// Live Developer Activity Tracking Protocol (VS Code, Cursor, Antigravity)
// ============================================================

import type { User, Project, Task } from './index';

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

export type DeveloperEventType = ActivityEventType;

export type DeveloperSessionStatus = 'active' | 'idle' | 'ended';

export type IntegrationStatus = 'connected' | 'disconnected';

/**
 * Common Activity Event Format as specified in Section 4.
 * Sent uniformly across VS Code, Cursor, and Antigravity.
 */
export type DeveloperActivityEvent = {
  id?: string;
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

/**
 * Registered IDE Integration per user and workstation.
 */
export interface DeveloperIntegration {
  id: string;
  userId: string;
  tool: DeveloperTool;
  status: IntegrationStatus;
  deviceName: string;
  connectionCode?: string;
  apiKey?: string;
  lastConnectedAt: string;
  lastSeenAt: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Continuous live working session in an IDE.
 */
export interface DeveloperSession {
  id: string;
  userId: string;
  integrationId?: string;
  projectId?: string;
  taskId?: string;
  tool: DeveloperTool;
  workspaceName?: string;
  currentFile?: string;
  gitBranch?: string;
  startedAt: string;
  started_at?: string;
  lastActivityAt: string;
  last_activity_at?: string;
  endedAt?: string | null;
  status: DeveloperSessionStatus;
  createdAt: string;
  updatedAt: string;

  // Joined / enriched references for display
  user?: User;
  project?: Project;
  task?: Task;
}

/**
 * Aggregated live state of a team member for the live dashboard.
 */
export interface LiveDeveloperCardData {
  user: User;
  status: 'active' | 'idle' | 'offline';
  tool?: DeveloperTool;
  currentSession?: DeveloperSession;
  projectName?: string;
  taskTitle?: string;
  workspaceName?: string;
  currentFile?: string;
  gitBranch?: string;
  activeDurationSeconds: number;
  lastActivityAt?: string;
  lastActivityAgo: string;
}

/**
 * Live Dashboard high-level counters.
 */
export interface LiveDeveloperMetrics {
  activeCount: number;
  idleCount: number;
  offlineCount: number;
  totalTeamCount: number;
  toolBreakdown: Record<DeveloperTool, number>;
}
