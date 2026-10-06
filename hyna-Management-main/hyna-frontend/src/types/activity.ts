// ============================================================
// HYNA STUDIO MANAGEMENT - ACTIVITY TRACKING TYPES
// ============================================================

import type { User } from './index';

export type SupportedApplication =
  | 'Visual Studio Code'
  | 'Cursor'
  | 'Antigravity'
  | string;

export interface ActivitySession {
  id: string;
  userId: string;
  application: string;
  projectName?: string | null;
  startedAt: string;
  endedAt: string;
  activeSeconds: number;
  idleSeconds: number;
  createdAt: string;
  updatedAt?: string;
  user?: User;
}

export interface CreateActivitySessionDTO {
  userId?: string;
  application: string;
  projectName?: string | null;
  startedAt: string;
  endedAt: string;
  activeSeconds: number;
  idleSeconds: number;
}

export interface ActivityFilter {
  startDate?: string;
  endDate?: string;
  userId?: string;
  application?: string;
  projectName?: string;
}

export interface AppUsageStat {
  application: string;
  activeSeconds: number;
  percentage: number;
  color: string;
  sessionCount: number;
}

export interface DailyActivityTrend {
  date: string;
  displayDate: string;
  activeHours: number;
  idleHours: number;
  sessionCount: number;
}

export interface ActivitySummary {
  totalActiveSeconds: number;
  totalIdleSeconds: number;
  totalDurationSeconds: number;
  sessionCount: number;
  appBreakdown: AppUsageStat[];
  dailyTrend: DailyActivityTrend[];
  activeVsIdle: { name: string; value: number; color: string }[];
}

export interface PrivacyPolicyNotice {
  trackedFields: string[];
  untrackedFields: string[];
  purpose: string;
}
