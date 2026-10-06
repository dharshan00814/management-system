// ============================================================
// Hyna Studio Management - Core Type Definitions
// ============================================================

// --- Enums & Constants ---
export type UserRole = 'admin' | 'manager' | 'member';
export type ProjectStatus = 'planning' | 'active' | 'on-hold' | 'completed';
export type TaskStatus = 'backlog' | 'todo' | 'in-progress' | 'in-review' | 'completed' | 'blocked';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';
export type AttendanceStatus = 'present' | 'late' | 'absent' | 'leave';
export type LeaveType = 'casual' | 'sick' | 'earned' | 'unpaid';
export type LeaveStatus = 'pending' | 'approved' | 'rejected';
export type MeetingType = 'team' | 'one-on-one' | 'standup' | 'review' | 'planning' | 'other';
export type NotificationType = 'task' | 'meeting' | 'announcement' | 'comment' | 'deadline' | 'approval' | 'general';
export type AnnouncementPriority = 'low' | 'normal' | 'high' | 'urgent';
export type FileType = 'document' | 'image' | 'video' | 'code' | 'archive' | 'spreadsheet' | 'presentation' | 'other';

// --- User ---
export interface User {
  id: string;
  employeeId?: string;
  name: string;
  email: string;
  avatar: string;
  role: UserRole;
  department: string;
  designation: string;
  phone: string;
  joinDate: string;
  status: 'active' | 'inactive';
  activeProjects: number;
  lastActive: string;
  bio?: string;
  skills?: string[];
  bankAccountNumber?: string;
  ifsc?: string;
  organizationId?: string;
  portfolioUrl?: string;
  githubUrl?: string;
  linkedinUrl?: string;
}

// --- Project ---
export interface Project {
  id: string;
  name: string;
  description: string;
  status: ProjectStatus;
  progress: number;
  managerId: string;
  leadId?: string;
  memberIds: string[];
  startDate: string;
  deadline: string;
  lastUpdated: string;
  modules: Module[];
  color: string;
  tags: string[];
  projectType?: 'team' | 'solo';
}

// --- Module ---
export interface Module {
  id: string;
  projectId: string;
  name: string;
  description: string;
  progress: number;
  totalTasks: number;
  completedTasks: number;
  inReviewTasks: number;
  blockedTasks: number;
  assigneeIds: string[];
  createdAt: string;
  updatedAt: string;
}

// --- Task ---
export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeId: string;
  projectId: string;
  moduleId: string;
  deadline: string;
  createdAt: string;
  updatedAt: string;
  tags: string[];
  attachments: number;
  comments: number;
  checklist?: ChecklistItem[];
  submission?: TaskSubmission;
}

export interface ChecklistItem {
  id: string;
  text: string;
  completed: boolean;
}

export interface TaskSubmission {
  id: string;
  taskId: string;
  submittedBy: string;
  submittedAt: string;
  description: string;
  githubUrl?: string;
  deploymentUrl?: string;
  attachments: string[];
  notes?: string;
  reviewStatus: 'pending' | 'approved' | 'changes-requested';
  reviewedBy?: string;
  reviewedAt?: string;
  reviewNotes?: string;
}

// --- Meeting ---
export * from './meeting';


// --- Attendance ---
export interface AttendanceRecord {
  id: string;
  userId: string;
  date: string;
  status: AttendanceStatus;
  checkIn?: string;
  checkOut?: string;
  workingHours?: string;
  notes?: string;
  points?: number;
}

export interface UserStreakAndPoints {
  currentStreak: number;
  longestStreak: number;
  totalPoints: number;
  todayPoints: number;
  todayStatus: 'not_started' | 'checked_in' | 'completed' | 'missed';
  penaltyAppliedToday: boolean;
  historyDays: {
    date: string;
    dayLabel: string;
    isToday: boolean;
    attended: boolean;
    points: number;
  }[];
}

// --- Daily Report ---
export interface DailyReport {
  id: string;
  userId: string;
  date: string;
  content: string;
  achievements: string;
  challenges: string;
  tomorrowPlan: string;
  hoursWorked: number;
  submittedAt: string;
}

// --- Notification ---
export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  userId: string;
  read: boolean;
  createdAt: string;
  actionUrl?: string;
  icon?: string;
}

// --- Message / Chat ---
export interface ChatChannel {
  id: string;
  name: string;
  type: 'general' | 'project' | 'direct';
  memberIds: string[];
  lastMessage?: string;
  lastMessageAt?: string;
  unreadCount: number;
  icon?: string;
}

export interface ChatMessage {
  id: string;
  channelId: string;
  senderId: string;
  content: string;
  timestamp: string;
  type: 'text' | 'file' | 'system';
  attachments?: { name: string; path: string; type: string; url?: string }[];
  reactions?: { emoji: string; userIds: string[] }[];
}

// --- File ---
export interface FileItem {
  id: string;
  name: string;
  type: FileType;
  size: number;
  folder: string;
  uploadedBy: string;
  uploadedAt: string;
  projectId?: string;
  url: string;
  mimeType: string;
}

export interface Folder {
  id: string;
  name: string;
  parentId?: string;
  fileCount: number;
  icon: string;
}

// --- Leave Request ---
export interface LeaveRequest {
  id: string;
  userId: string;
  type: LeaveType;
  startDate: string;
  endDate: string;
  reason: string;
  status: LeaveStatus;
  appliedAt: string;
  reviewedBy?: string;
  reviewedAt?: string;
}

// --- Announcement ---
export interface Announcement {
  id: string;
  title: string;
  content: string;
  priority: AnnouncementPriority;
  createdBy: string;
  createdAt: string;
  audience: 'all' | 'admin' | 'manager' | 'member';
  isPublished: boolean;
  scheduledAt?: string;
}

// --- Dashboard Stats ---
export interface AdminDashboardStats {
  totalMembers: number;
  activeProjects: number;
  pendingTasks: number;
  todayAttendance: { present: number; total: number };
  memberChange: number;
  projectChange: number;
  taskChange: number;
  attendanceChange: number;
}

export interface MemberDashboardStats {
  myTasks: number;
  completed: number;
  inReview: number;
  workingHours: string;
  taskChange: number;
  completedChange: number;
}

// Activity Tracking Type Exports
export * from './activity';
export * from './developerActivity';
