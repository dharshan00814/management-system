// ============================================================
// Service Layer - Supabase Integration
// Replaces static mock data with live Supabase database queries
// ============================================================

import { supabase, isSupabaseConfigured, createEphemeralClient } from '@/lib/supabase';
import { getOrgMemberDetails, useAuthStore } from '@/stores';
import {
  calculateRecordPoints,
  parseTimeToMinutes,
  PUNCH_IN_START_MIN,
  PUNCH_IN_ONTIME_END_MIN,
  PUNCH_IN_GRACE_END_MIN,
  PUNCH_OUT_START_MIN,
  PUNCH_OUT_END_MIN,
  POINTS_ON_TIME,
  POINTS_GRACE,
  POINTS_MISSED_PUNCHOUT_10,
  POINTS_MISSED_PUNCHOUT_5,
} from '@/lib/attendanceRules';
import type {
  User, UserRole, Project, Module, Task, Meeting, AttendanceRecord,
  DailyReport, Notification, ChatChannel, ChatMessage,
  FileItem, Folder, LeaveRequest, Announcement,
} from '@/types';
import { notifyCheckInSuccess, notifyMeetingScheduled } from '@/services/notificationWorkflow';

// In-memory cache for synchronous lookups (e.g. getUserById in UI rendering)
let usersCache: User[] = [];
let projectsCache: Project[] = [];
let modulesCache: Module[] = [];
let tasksCache: Task[] = [];

// Default meetings list (empty by default)
const DEFAULT_MEETINGS: Meeting[] = [];

// Persistent tracker for deleted meeting IDs to prevent deleted meetings from ever coming back
const DELETED_MEETINGS_KEY = 'hyna_deleted_meetings';

export function getDeletedMeetingIds(): Set<string> {
  try {
    const raw = localStorage.getItem(DELETED_MEETINGS_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return new Set(arr);
    }
  } catch {}
  return new Set();
}

export function recordDeletedMeetingId(id: string, roomId?: string) {
  const set = getDeletedMeetingIds();
  if (id) set.add(id);
  if (roomId) set.add(roomId);
  try {
    localStorage.setItem(DELETED_MEETINGS_KEY, JSON.stringify(Array.from(set)));
  } catch {}
}

// Explicitly blacklisted/removed meetings requested by user
export const PURGED_MEETING_TITLES = new Set([
  'summa',
  'testing01',
  'testing02',
  'daily engineering standup',
  'product review & sprint demo',
  'vvv',
  'hi',
  'ast',
  'core architecture & security sync',
]);

export function isPurgedMeeting(m: { id?: string; meetingRoomId?: string; title?: string }): boolean {
  if (!m) return false;
  const deletedIds = getDeletedMeetingIds();
  if (m.id && deletedIds.has(m.id)) return true;
  if (m.meetingRoomId && deletedIds.has(m.meetingRoomId)) return true;
  if (m.id && (
    m.id === 'mt_standup_daily' || 
    m.id === 'mt_product_review' || 
    m.id === 'mt_arch_planning' ||
    m.id === 'mt_apeavegg' ||
    m.id === 'mt_wt94rs6f'
  )) return true;
  if (m.title && PURGED_MEETING_TITLES.has(m.title.trim().toLowerCase())) return true;
  return false;
}

function initMeetingsCache(): Meeting[] {
  try {
    const stored = localStorage.getItem('hyna_meetings_cache');
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        // Filter out removed default meetings, user-deleted meetings, and blacklisted titles
        const filtered = parsed.filter((m: Meeting) => !isPurgedMeeting(m));
        try {
          localStorage.setItem('hyna_meetings_cache', JSON.stringify(filtered));
        } catch {
          // Ignore
        }
        return filtered;
      }
    }
  } catch (e) {
    console.warn('Failed to read meetings cache from storage:', e);
  }
  return [];
}

let meetingsCache: Meeting[] = initMeetingsCache();

function persistMeetingsCache(meetings: Meeting[]) {
  meetingsCache = meetings;
  try {
    localStorage.setItem('hyna_meetings_cache', JSON.stringify(meetings));
  } catch (e) {
    // Ignore storage quota errors
  }
}

// Helper: Check if string is a valid UUID
export function isValidUuid(val?: string | null): boolean {
  if (!val) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
}

// Helper: Transform Database User row to Frontend User
function mapUser(row: any): User {
  return {
    id: row.id,
    employeeId: row.employee_id || '',
    name: row.name || 'Unknown User',
    email: row.email || '',
    avatar: row.avatar || '',
    role: row.role || 'member',
    department: row.department || '',
    designation: row.designation || '',
    phone: row.phone || '',
    joinDate: row.join_date || row.created_at?.split('T')[0] || new Date().toISOString().split('T')[0],
    status: row.status || 'active',
    activeProjects: row.active_projects || 0,
    lastActive: row.last_active || row.updated_at || new Date().toISOString(),
    bio: row.bio || '',
    skills: row.skills || [],
    bankAccountNumber: row.bank_account_number || row.bankAccountNumber || '',
    ifsc: row.ifsc_code || row.ifsc || '',
    organizationId: row.organization_id || '',
    portfolioUrl: row.portfolio_url || '',
    githubUrl: row.github_url || '',
    linkedinUrl: row.linkedin_url || '',
  };
}

// Helper: Transform Database Project row to Frontend Project
function mapProject(row: any): Project {
  const memberList = row.member_ids || [];
  const projectType: 'team' | 'solo' = row.project_type || (memberList.length <= 1 ? 'solo' : 'team');
  return {
    id: row.id,
    name: row.name || '',
    description: row.description || '',
    status: row.status || 'planning',
    progress: row.progress ?? 0,
    managerId: row.manager_id || '',
    leadId: row.lead_id || undefined,
    memberIds: row.member_ids || [],
    startDate: row.start_date || '',
    deadline: row.deadline || '',
    lastUpdated: row.updated_at || row.created_at || new Date().toISOString(),
    modules: [],
    color: row.color || '#6366f1',
    tags: row.tags || [],
    projectType,
  };
}

// Helper: Transform Database Module row to Frontend Module
function mapModule(row: any): Module {
  return {
    id: row.id,
    projectId: row.project_id || '',
    name: row.name || '',
    description: row.description || '',
    progress: row.progress ?? 0,
    totalTasks: row.total_tasks ?? 0,
    completedTasks: row.completed_tasks ?? 0,
    inReviewTasks: row.in_review_tasks ?? 0,
    blockedTasks: row.blocked_tasks ?? 0,
    assigneeIds: row.assignee_ids || [],
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || '',
  };
}

// Helper: Transform Database Task row to Frontend Task
function mapTask(row: any): Task {
  return {
    id: row.id,
    title: row.title || '',
    description: row.description || '',
    status: row.status || 'todo',
    priority: row.priority || 'medium',
    assigneeId: row.assignee_id || '',
    projectId: row.project_id || '',
    moduleId: row.module_id || '',
    deadline: row.deadline || '',
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || '',
    tags: row.tags || [],
    attachments: row.attachments ?? 0,
    comments: row.comments ?? 0,
    checklist: row.task_checklists?.map((c: any) => ({
      id: c.id,
      text: c.text,
      completed: c.completed,
    })),
    submission: row.task_submissions?.[0]
      ? {
          id: row.task_submissions[0].id,
          taskId: row.id,
          submittedBy: row.task_submissions[0].submitted_by,
          submittedAt: row.task_submissions[0].submitted_at,
          description: row.task_submissions[0].description,
          githubUrl: row.task_submissions[0].github_url,
          deploymentUrl: row.task_submissions[0].deployment_url,
          attachments: row.task_submissions[0].attachments || [],
          notes: row.task_submissions[0].notes,
          reviewStatus: row.task_submissions[0].review_status,
          reviewedBy: row.task_submissions[0].reviewed_by,
          reviewedAt: row.task_submissions[0].reviewed_at,
          reviewNotes: row.task_submissions[0].review_notes,
        }
      : undefined,
  };
}

// Helper: Transform Meeting row to Frontend Meeting
function mapMeeting(row: any): Meeting {
  const roomId = row.meeting_room_id || row.id;
  return {
    id: row.id,
    title: row.title || '',
    description: row.description || '',
    date: row.date || '',
    startTime: row.start_time || '',
    endTime: row.end_time || '',
    hostId: row.host_id || row.created_by || '',
    createdBy: row.created_by || row.host_id,
    participantIds: row.participant_ids || [],
    type: row.type || 'team',
    meetingType: (row.meeting_type as any) || 'video',
    meetingRoomId: roomId,
    isRecurring: row.is_recurring ?? false,
    meetingLink: row.meeting_link || `/meeting/${roomId}`,
    notes: row.notes || '',
    status: row.status || 'scheduled',
    scheduledAt: row.scheduled_at,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Helper: Transform Attendance row
function mapAttendance(row: any): AttendanceRecord {
  const baseRecord: AttendanceRecord = {
    id: row.id,
    userId: row.user_id,
    date: row.date,
    status: row.status,
    checkIn: row.check_in,
    checkOut: row.check_out,
    workingHours: row.working_hours,
    notes: row.notes,
    points: row.points !== undefined && row.points !== null ? Number(row.points) : undefined,
  };

  if (baseRecord.points === undefined) {
    const evalRes = calculateRecordPoints(baseRecord);
    baseRecord.points = evalRes.finalPoints;
  }

  return baseRecord;
}

// Helper: Transform Daily Report row
function mapDailyReport(row: any): DailyReport {
  return {
    id: row.id,
    userId: row.user_id,
    date: row.date,
    content: row.content || '',
    achievements: row.achievements || '',
    challenges: row.challenges || '',
    tomorrowPlan: row.tomorrow_plan || '',
    hoursWorked: Number(row.hours_worked) || 0,
    submittedAt: row.submitted_at || row.created_at,
  };
}

// Helper: Transform Notification row
function mapNotification(row: any): Notification {
  return {
    id: row.id,
    type: row.type || 'general',
    title: row.title || 'Notification',
    message: row.message || row.body || '',
    userId: row.user_id || row.member_id || '',
    read: Boolean(row.read || row.is_read || row.read_at),
    createdAt: row.created_at,
    actionUrl: row.action_url || row.link || row.data?.actionUrl || row.data?.url || '',
    icon: row.icon || row.data?.icon,
  };
}

// Helper: Transform Channel row
function mapChannel(row: any): ChatChannel {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    memberIds: row.member_ids || [],
    lastMessage: row.last_message,
    lastMessageAt: row.last_message_at,
    unreadCount: row.unread_count ?? 0,
    icon: row.icon,
  };
}

// Helper: Transform Message row
function mapMessage(row: any): ChatMessage {
  const isGlobal = !row.receiver_id || row.channel_id === 'ch_global' || row.channel_id === 'globe';
  return {
    id: row.id,
    channelId: isGlobal ? 'globe' : (row.receiver_id || row.channel_id || ''),
    senderId: row.sender_id,
    content: row.content,
    timestamp: row.timestamp || row.created_at,
    type: row.type,
    attachments: row.attachments || [],
    reactions: row.reactions || [],
  };
}

// Helper: Transform File row
function mapFile(row: any): FileItem {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    size: Number(row.size) || 0,
    folder: row.folder,
    uploadedBy: row.uploaded_by,
    uploadedAt: row.uploaded_at || row.created_at || new Date().toISOString(),
    url: row.url || '#',
    mimeType: row.mime_type || '',
    projectId: row.project_id,
  };
}

// Helper: Transform Folder row
function mapFolder(row: any): Folder {
  return {
    id: row.id,
    name: row.name,
    parentId: row.parent_id,
    fileCount: row.file_count ?? 0,
    icon: row.icon || 'folder',
  };
}

// Helper: Transform Leave Request row
function mapLeaveRequest(row: any): LeaveRequest {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    startDate: row.start_date,
    endDate: row.end_date,
    reason: row.reason,
    status: row.status,
    appliedAt: row.applied_at || row.created_at,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
  };
}

// Helper: Transform Announcement row
function mapAnnouncement(row: any): Announcement {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    priority: row.priority,
    createdBy: row.created_by,
    createdAt: row.created_at,
    audience: row.audience,
    isPublished: row.is_published ?? true,
    scheduledAt: row.scheduled_at,
  };
}

// ============================================================
// USERS API
// ============================================================
export async function getUsers(): Promise<User[]> {
  try {
    const state = useAuthStore.getState();
    const orgId = state.currentUser?.organizationId || state.activeOrganization;
    let profilesQuery = supabase.from('profiles').select('*').order('name', { ascending: true });
    
    if (orgId) {
      profilesQuery = profilesQuery.eq('organization_id', orgId);
    } else {
      profilesQuery = profilesQuery.is('organization_id', null);
    }

    const { data, error } = await profilesQuery;

    if (error) {
      console.error('Error fetching users from Supabase:', error);
      return usersCache;
    }
    const mapped = (data || []).map(mapUser);
    usersCache = mapped;
    return mapped;
  } catch (err) {
    console.error('Error fetching users from Supabase:', err);
    return usersCache;
  }
}

export async function getUser(id: string): Promise<User | undefined> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (data) {
      const user = mapUser(data);
      const idx = usersCache.findIndex(u => u.id === id);
      if (idx !== -1) usersCache[idx] = user;
      else usersCache.push(user);
      return user;
    }
  } catch (err) {
    console.error('Error fetching user from Supabase:', err);
  }
  return usersCache.find(u => u.id === id);
}

export async function updateUserProfile(id: string, updates: Partial<User>): Promise<User> {
  const payload: any = { updated_at: new Date().toISOString() };
  if (updates.name !== undefined) payload.name = updates.name;
  if (updates.role !== undefined) payload.role = updates.role;
  if (updates.department !== undefined) payload.department = updates.department;
  if (updates.designation !== undefined) payload.designation = updates.designation;
  if (updates.employeeId !== undefined) payload.employee_id = updates.employeeId;
  if (updates.status !== undefined) payload.status = updates.status;
  if (updates.phone !== undefined) payload.phone = updates.phone;
  if (updates.bio !== undefined) payload.bio = updates.bio;
  if (updates.skills !== undefined) payload.skills = updates.skills;
  if (updates.avatar !== undefined) payload.avatar = updates.avatar;
  if (updates.bankAccountNumber !== undefined) payload.bank_account_number = updates.bankAccountNumber;
  if (updates.ifsc !== undefined) payload.ifsc_code = updates.ifsc;

  const { data, error } = await supabase
    .from('profiles')
    .update(payload)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  const user = mapUser(data);
  const idx = usersCache.findIndex(u => u.id === id);
  if (idx !== -1) usersCache[idx] = user;
  return user;
}

export async function updateMember(id: string, updates: Partial<User>): Promise<User> {
  return updateUserProfile(id, updates);
}

export async function uploadAvatar(userId: string, file: File): Promise<string> {
  const fileExt = file.name.split('.').pop() || 'png';
  const fileName = `${userId}_${Date.now()}.${fileExt}`;
  const filePath = `avatars/${fileName}`;

  if (!isSupabaseConfigured()) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(file);
    });
  }

  const { error: uploadError } = await supabase.storage
    .from('files')
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: true,
    });

  if (uploadError) {
    console.warn('Storage avatar upload fallback to base64:', uploadError);
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(file);
    });
  }

  const { data: urlData } = supabase.storage
    .from('files')
    .getPublicUrl(filePath);

  return urlData?.publicUrl || '';
}

export async function deleteMember(id: string): Promise<void> {
  try {
    await supabase.from('developer_sessions').delete().eq('user_id', id);
    await supabase.from('developer_integrations').delete().eq('user_id', id);
  } catch (e) {
    // Non-fatal
  }

  const { error } = await supabase
    .from('profiles')
    .delete()
    .eq('id', id);

  if (error) {
    console.warn('[deleteMember] Profile delete warning, falling back to inactive:', error.message);
    const { error: updateErr } = await supabase
      .from('profiles')
      .update({ status: 'inactive' })
      .eq('id', id);
    if (updateErr) throw error;
  }

  usersCache = usersCache.filter(u => u.id !== id);
}

export const removeMember = deleteMember;

export function getUserById(id: string): User | undefined {
  if (!id) return undefined;
  const direct = usersCache.find(u => 
    u.id === id || 
    (u.employeeId && u.employeeId.toUpperCase() === id.toUpperCase()) ||
    (u.name && u.name.toLowerCase() === id.toLowerCase()) ||
    (u.email && u.email.toLowerCase() === id.toLowerCase())
  );
  if (direct) return direct;

  const roster = getOrgMemberDetails(id);
  if (roster && roster.name) {
    return {
      id: roster.employeeId || id,
      employeeId: roster.employeeId || '',
      name: roster.name,
      email: roster.email || '',
      avatar: '',
      role: roster.role || 'member',
      department: roster.department || '',
      designation: roster.designation || '',
      phone: '',
      joinDate: '2026-01-01',
      status: 'active',
      activeProjects: 1,
      lastActive: new Date().toISOString(),
      bio: '',
      skills: [],
    };
  }
  return undefined;
}

export interface AddMemberInput {
  name: string;
  email: string;
  password?: string;
  role?: UserRole;
  department?: string;
  designation?: string;
  employeeId?: string;
  phone?: string;
  bankAccountNumber?: string;
  ifsc?: string;
}

export async function addMember(input: AddMemberInput): Promise<User> {
  const email = input.email.trim();
  const password = input.password?.trim() || 'Hyna@2026';
  const name = input.name.trim();
  const employeeId = input.employeeId?.trim() || undefined;
  const role = input.role || 'member';
  const department = input.department?.trim() || 'Engineering';
  const designation = input.designation?.trim() || 'Software Engineer';
  const phone = input.phone?.trim() || '';

  if (!email || !name) {
    throw new Error('Full Name and Work Email are required.');
  }

  // 1. Create an ephemeral client so the current admin/manager session is NEVER disturbed
  const ephemeralClient = createEphemeralClient();

  const currentOrgId = useAuthStore.getState().currentUser?.organizationId;

  const { data: authData, error: authError } = await ephemeralClient.auth.signUp({
    email,
    password,
    options: {
      data: {
        name,
        employee_id: employeeId,
        role,
        department,
        designation,
      },
    },
  });

  if (authError) {
    const msg = authError.message.toLowerCase();
    if (msg.includes('already registered') || msg.includes('already taken')) {
      throw new Error(`A member with email "${email}" is already registered.`);
    }
    throw new Error(authError.message);
  }

  const userId = authData?.user?.id;
  if (!userId) {
    throw new Error('Failed to create member authentication account.');
  }

  // 2. Ensure profile in profiles table exists with employeeId and phone
  const profilePayload: any = {
    id: userId,
    email,
    name,
    role,
    department,
    designation,
    phone,
    status: 'active',
  };
  
  if (currentOrgId) {
    profilePayload.organization_id = currentOrgId;
  }
  if (employeeId) {
    profilePayload.employee_id = employeeId;
  }
  if (input.bankAccountNumber !== undefined) {
    profilePayload.bank_account_number = input.bankAccountNumber.trim();
  }
  if (input.ifsc !== undefined) {
    profilePayload.ifsc_code = input.ifsc.trim().toUpperCase();
  }

  const { data: savedProfile, error: profileError } = await supabase
    .from('profiles')
    .upsert(profilePayload, { onConflict: 'id' })
    .select()
    .maybeSingle();

  if (profileError) {
    // Only log genuine errors, not expected duplicate-key conflicts (auth trigger may have already created the row)
    if (profileError.code !== '23505') console.warn('Profile upsert error:', profileError);
  }

  const newUser: User = savedProfile ? mapUser(savedProfile) : {
    id: userId,
    employeeId: employeeId || '',
    name,
    email,
    avatar: '',
    role,
    department,
    designation,
    phone,
    joinDate: new Date().toISOString().split('T')[0],
    status: 'active',
    activeProjects: 0,
    lastActive: new Date().toISOString(),
    bio: '',
    skills: [],
    bankAccountNumber: input.bankAccountNumber?.trim() || '',
    ifsc: input.ifsc?.trim().toUpperCase() || '',
  };

  usersCache.unshift(newUser);
  return newUser;
}


// ============================================================
// PROJECTS API
// ============================================================
export async function getProjects(filter?: { managerId?: string; memberId?: string }): Promise<Project[]> {
  try {
    let query = supabase.from('projects').select('*').order('created_at', { ascending: false });

    if (filter?.managerId) {
      query = query.eq('manager_id', filter.managerId);
    } else if (filter?.memberId) {
      query = query.contains('member_ids', [filter.memberId]);
    }

    const { data, error } = await query;
    if (error) {
      console.error('Error fetching projects from Supabase:', error);
      return projectsCache;
    }
    
    // Organization Isolation Filter
    const orgUsers = await getUsers();
    const orgUserIds = new Set(orgUsers.map(u => u.id));
    
    let projects = (data || []).map(mapProject).filter(p => {
      // If we have an active org and users, only keep projects linked to these users
      if (orgUserIds.size > 0) {
        if (p.managerId && orgUserIds.has(p.managerId)) return true;
        if (p.memberIds?.some(id => orgUserIds.has(id))) return true;
        return false;
      }
      return false; // fallback if no users
    });

    const localOnly = projectsCache.filter(local => local.id.startsWith('proj_') && !projects.some(p => p.id === local.id));
    projectsCache = [...localOnly, ...projects];
    return projectsCache;
  } catch (err) {
    console.error('Error in getProjects:', err);
    return projectsCache;
  }
}

export async function getProject(id: string): Promise<Project | undefined> {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data) return projectsCache.find(p => p.id === id);
  const project = mapProject(data);
  const idx = projectsCache.findIndex(p => p.id === id);
  if (idx !== -1) projectsCache[idx] = project;
  else projectsCache.push(project);
  return project;
}

export function getProjectById(id: string): Project | undefined {
  return projectsCache.find(p => p.id === id);
}

export async function createProject(project: Partial<Project>): Promise<Project> {
  const fallbackProject: Project = {
    id: `proj_${Date.now()}`,
    name: project.name || 'New Project',
    description: project.description || '',
    status: project.status || 'planning',
    progress: project.progress || 0,
    managerId: project.managerId || '',
    leadId: project.leadId || undefined,
    memberIds: project.memberIds || [],
    startDate: project.startDate || new Date().toISOString().split('T')[0],
    deadline: project.deadline || '',
    lastUpdated: new Date().toISOString().split('T')[0],
    modules: [],
    color: project.color || '#6366f1',
    tags: project.tags || [],
  };

  try {
    let validManagerId: string | null = null;
    if (isValidUuid(project.managerId)) {
      validManagerId = project.managerId!;
    } else {
      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData?.session?.user?.id && isValidUuid(sessionData.session.user.id)) {
        validManagerId = sessionData.session.user.id;
      }
    }

    const __orgId = useAuthStore.getState().currentUser?.organizationId || useAuthStore.getState().activeOrganization;
    const insertPayload: any = {
      ...(__orgId ? { organization_id: __orgId } : {}),
      name: project.name || 'New Project',
      description: project.description || '',
      status: project.status || 'planning',
      progress: project.progress || 0,
      manager_id: validManagerId,
      member_ids: project.memberIds || [],
      start_date: project.startDate || new Date().toISOString().split('T')[0],
      deadline: project.deadline && project.deadline.trim() ? project.deadline.trim() : null,
      color: project.color || '#6366f1',
      tags: project.tags || [],
    };

    const { data, error } = await supabase
      .from('projects')
      .insert([insertPayload])
      .select()
      .single();

    if (error) {
      console.warn('Supabase project creation rejected (using resilient local fallback):', error);
      projectsCache.unshift(fallbackProject);
      return fallbackProject;
    }
    const created = mapProject(data);
    projectsCache.unshift(created);
    return created;
  } catch (err) {
    console.warn('Project creation network error (using resilient local fallback):', err);
    projectsCache.unshift(fallbackProject);
    return fallbackProject;
  }
}

export async function updateProject(id: string, updates: Partial<Project>): Promise<Project> {
  const payload: any = { updated_at: new Date().toISOString() };
  if (updates.name !== undefined) payload.name = updates.name;
  if (updates.description !== undefined) payload.description = updates.description;
  if (updates.status !== undefined) payload.status = updates.status;
  if (updates.progress !== undefined) payload.progress = updates.progress;
  if (updates.managerId !== undefined) payload.manager_id = isValidUuid(updates.managerId) ? updates.managerId : null;
  if (updates.memberIds !== undefined) payload.member_ids = updates.memberIds;
  if (updates.startDate !== undefined) payload.start_date = updates.startDate;
  if (updates.deadline !== undefined) payload.deadline = updates.deadline || null;
  if (updates.color !== undefined) payload.color = updates.color;
  if (updates.tags !== undefined) payload.tags = updates.tags;

  const idx = projectsCache.findIndex(p => p.id === id);
  let updatedProject: Project;
  if (idx !== -1) {
    projectsCache[idx] = {
      ...projectsCache[idx],
      ...updates,
      lastUpdated: new Date().toISOString(),
      projectType: updates.projectType || (updates.memberIds && updates.memberIds.length <= 1 ? 'solo' : 'team') || projectsCache[idx].projectType,
    };
    updatedProject = projectsCache[idx];
  } else {
    updatedProject = {
      id,
      name: updates.name || 'Project',
      description: updates.description || '',
      status: updates.status || 'planning',
      progress: updates.progress || 0,
      managerId: updates.managerId || '',
      memberIds: updates.memberIds || [],
      startDate: updates.startDate || '',
      deadline: updates.deadline || '',
      lastUpdated: new Date().toISOString(),
      modules: [],
      color: updates.color || '#6366f1',
      tags: updates.tags || [],
      projectType: updates.projectType || (updates.memberIds && updates.memberIds.length <= 1 ? 'solo' : 'team'),
    };
    projectsCache.push(updatedProject);
  }

  try {
    const { data, error } = await supabase
      .from('projects')
      .update(payload)
      .eq('id', id)
      .select()
      .maybeSingle();

    if (data) {
      const mapped = mapProject(data);
      if (idx !== -1) projectsCache[idx] = mapped;
      return mapped;
    }
  } catch (err) {
    console.warn('Supabase updateProject error (using cache):', err);
  }

  return updatedProject;
}

export async function deleteProject(projectId: string): Promise<boolean> {
  // Update in-memory cache
  projectsCache = projectsCache.filter(p => p.id !== projectId);

  if (!isSupabaseConfigured()) {
    return true;
  }

  try {
    await supabase.from('tasks').delete().eq('project_id', projectId);
    await supabase.from('modules').delete().eq('project_id', projectId);
  } catch (e) {
    console.warn('Cascade task/module delete notice:', e);
  }

  const { error } = await supabase
    .from('projects')
    .delete()
    .eq('id', projectId);

  if (error) {
    console.error('Error deleting project in Supabase:', error);
    throw error;
  }
  return true;
}

// ============================================================
// MODULES API
// ============================================================
export async function getModules(projectId?: string): Promise<Module[]> {
  if (!isSupabaseConfigured()) {
    return projectId ? modulesCache.filter(m => m.projectId === projectId) : [...modulesCache];
  }
  let query = supabase.from('modules').select('*').order('created_at', { ascending: true });
  if (projectId) {
    query = query.eq('project_id', projectId);
  }
  const { data, error } = await query;

  if (error) {
    console.error('Error fetching modules from Supabase:', error);
    return projectId ? modulesCache.filter(m => m.projectId === projectId) : [...modulesCache];
  }
  const modules = (data || []).map(mapModule);
  // Update cache
  modules.forEach(mod => {
    const idx = modulesCache.findIndex(m => m.id === mod.id);
    if (idx !== -1) modulesCache[idx] = mod;
    else modulesCache.push(mod);
  });
  
  // Organization Isolation Filter
  const orgProjects = await getProjects();
  const orgProjectIds = new Set(orgProjects.map(p => p.id));
  
  return modules.filter(m => {
    if (orgProjectIds.size > 0) {
      return orgProjectIds.has(m.projectId);
    }
    return false;
  });
}

export async function createModule(module: Partial<Module>): Promise<Module> {
  const fallbackModule: Module = {
    id: `m_${Date.now()}`,
    projectId: module.projectId || '',
    name: module.name || 'New Module',
    description: module.description || '',
    progress: module.progress || 0,
    totalTasks: module.totalTasks || 0,
    completedTasks: module.completedTasks || 0,
    inReviewTasks: module.inReviewTasks || 0,
    blockedTasks: module.blockedTasks || 0,
    assigneeIds: module.assigneeIds || [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  try {
    const __orgId = useAuthStore.getState().currentUser?.organizationId || useAuthStore.getState().activeOrganization;
    const insertPayload: any = {
      ...(__orgId ? { organization_id: __orgId } : {}),
      project_id: module.projectId,
      name: module.name || 'New Module',
      description: module.description || '',
      progress: module.progress || 0,
      total_tasks: module.totalTasks || 0,
      completed_tasks: module.completedTasks || 0,
      in_review_tasks: module.inReviewTasks || 0,
      blocked_tasks: module.blockedTasks || 0,
      assignee_ids: module.assigneeIds || [],
    };

    const { data, error } = await supabase
      .from('modules')
      .insert([insertPayload])
      .select()
      .single();

    if (error) {
      console.warn('Supabase module creation rejected (using resilient fallback):', error);
      modulesCache.push(fallbackModule);
      return fallbackModule;
    }
    const created = mapModule(data);
    modulesCache.push(created);
    return created;
  } catch (err) {
    console.warn('Module creation network error (using resilient fallback):', err);
    modulesCache.push(fallbackModule);
    return fallbackModule;
  }
}

export async function updateModule(id: string, updates: Partial<Module>): Promise<Module> {
  const payload: any = { updated_at: new Date().toISOString() };
  if (updates.name !== undefined) payload.name = updates.name;
  if (updates.description !== undefined) payload.description = updates.description;
  if (updates.progress !== undefined) payload.progress = updates.progress;
  if (updates.totalTasks !== undefined) payload.total_tasks = updates.totalTasks;
  if (updates.completedTasks !== undefined) payload.completed_tasks = updates.completedTasks;
  if (updates.inReviewTasks !== undefined) payload.in_review_tasks = updates.inReviewTasks;
  if (updates.blockedTasks !== undefined) payload.blocked_tasks = updates.blockedTasks;
  if (updates.assigneeIds !== undefined) payload.assignee_ids = updates.assigneeIds;

  const idx = modulesCache.findIndex(m => m.id === id);
  let updatedModule: Module;
  if (idx !== -1) {
    modulesCache[idx] = { ...modulesCache[idx], ...updates, updatedAt: new Date().toISOString() };
    updatedModule = modulesCache[idx];
  } else {
    updatedModule = {
      id,
      projectId: updates.projectId || '',
      name: updates.name || 'Module',
      description: updates.description || '',
      progress: updates.progress || 0,
      totalTasks: updates.totalTasks || 0,
      completedTasks: updates.completedTasks || 0,
      inReviewTasks: updates.inReviewTasks || 0,
      blockedTasks: updates.blockedTasks || 0,
      assigneeIds: updates.assigneeIds || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    modulesCache.push(updatedModule);
  }

  try {
    const { data, error } = await supabase
      .from('modules')
      .update(payload)
      .eq('id', id)
      .select()
      .maybeSingle();

    if (data) {
      const mapped = mapModule(data);
      if (idx !== -1) modulesCache[idx] = mapped;
      return mapped;
    }
  } catch (err) {
    console.warn('Supabase updateModule error (using cache):', err);
  }
  return updatedModule;
}

export async function deleteModule(id: string): Promise<boolean> {
  modulesCache = modulesCache.filter(m => m.id !== id);
  try {
    await supabase.from('modules').delete().eq('id', id);
  } catch (err) {
    console.warn('Supabase deleteModule error:', err);
  }
  return true;
}

// ============================================================
// TASKS API
// ============================================================
export async function getTasks(filter?: { assigneeId?: string; projectId?: string; managerId?: string }): Promise<Task[]> {
  try {
    let query = supabase
      .from('tasks')
      .select(`
        *,
        task_checklists (*),
        task_submissions (*)
      `)
      .order('created_at', { ascending: false });

    if (filter?.assigneeId) {
      query = query.eq('assignee_id', filter.assigneeId);
    }
    if (filter?.projectId) {
      query = query.eq('project_id', filter.projectId);
    }

    const { data, error } = await query;
    if (error) {
      console.error('Error fetching tasks from Supabase:', error);
      return tasksCache;
    }
    let tasks = (data || []).map(mapTask);

    // Organization Isolation Filter
    const orgUsers = await getUsers();
    const orgUserIds = new Set(orgUsers.map(u => u.id));
    const orgProjects = await getProjects();
    const orgProjectIds = new Set(orgProjects.map(p => p.id));
    
    tasks = tasks.filter(t => {
      if (orgUserIds.size > 0 || orgProjectIds.size > 0) {
        if (t.assigneeId && orgUserIds.has(t.assigneeId)) return true;
        if (t.projectId && orgProjectIds.has(t.projectId)) return true;
        return false;
      }
      return false;
    });

    if (filter?.managerId) {
      const mgrProjects = await getProjects({ managerId: filter.managerId });
      const projectIds = new Set(mgrProjects.map(p => p.id));
      tasks = tasks.filter(t => projectIds.has(t.projectId));
    }

    tasksCache = tasks;
    return tasks;
  } catch (err) {
    console.error('Error in getTasks:', err);
    return tasksCache;
  }
}

export async function getTask(id: string): Promise<Task | undefined> {
  const { data, error } = await supabase
    .from('tasks')
    .select(`
      *,
      task_checklists (*),
      task_submissions (*)
    `)
    .eq('id', id)
    .single();

  if (error || !data) return tasksCache.find(t => t.id === id);
  return mapTask(data);
}

export async function getProjectTasks(projectId: string): Promise<Task[]> {
  return getTasks({ projectId });
}

export async function getModuleTasks(moduleId: string): Promise<Task[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select(`
      *,
      task_checklists (*),
      task_submissions (*)
    `)
    .eq('module_id', moduleId);

  if (error) return tasksCache.filter(t => t.moduleId === moduleId);
  return (data || []).map(mapTask);
}

export async function getUserTasks(userId: string): Promise<Task[]> {
  return getTasks({ assigneeId: userId });
}

export async function createTask(task: Partial<Task>): Promise<Task> {
  const fallbackTask: Task = {
    id: `task_${Date.now()}`,
    title: task.title || 'New Task',
    description: task.description || '',
    status: task.status || 'todo',
    priority: task.priority || 'medium',
    assigneeId: task.assigneeId || '',
    projectId: task.projectId || '',
    moduleId: task.moduleId,
    deadline: task.deadline || '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    tags: task.tags || [],
    attachments: 0,
    comments: 0,
  };

  try {
    const __orgId = useAuthStore.getState().currentUser?.organizationId || useAuthStore.getState().activeOrganization;
    const insertPayload: any = {
      ...(__orgId ? { organization_id: __orgId } : {}),
      title: task.title || 'New Task',
      description: task.description || '',
      status: task.status || 'todo',
      priority: task.priority || 'medium',
      assignee_id: task.assigneeId || null,
      project_id: task.projectId,
      module_id: task.moduleId || null,
      deadline: task.deadline || null,
      tags: task.tags || [],
      attachments: 0,
      comments: 0,
    };

    const { data, error } = await supabase
      .from('tasks')
      .insert([insertPayload])
      .select(`*, task_checklists (*), task_submissions (*)`)
      .single();

    if (error) {
      console.warn('Supabase task creation rejected (using fallback):', error);
      tasksCache.unshift(fallbackTask);
      return fallbackTask;
    }
    const created = mapTask(data);
    tasksCache.unshift(created);
    return created;
  } catch (err) {
    console.warn('Task creation network error (using fallback):', err);
    tasksCache.unshift(fallbackTask);
    return fallbackTask;
  }
}

export async function updateTask(id: string, updates: Partial<Task>): Promise<Task> {
  const updatePayload: any = {};
  if (updates.title !== undefined) updatePayload.title = updates.title;
  if (updates.description !== undefined) updatePayload.description = updates.description;
  if (updates.status !== undefined) updatePayload.status = updates.status;
  if (updates.priority !== undefined) updatePayload.priority = updates.priority;
  if (updates.assigneeId !== undefined) updatePayload.assignee_id = updates.assigneeId;
  if (updates.deadline !== undefined) updatePayload.deadline = updates.deadline;
  if (updates.tags !== undefined) updatePayload.tags = updates.tags;

  if (!isSupabaseConfigured()) {
    const idx = tasksCache.findIndex(t => t.id === id);
    if (idx !== -1) {
      tasksCache[idx] = { ...tasksCache[idx], ...updates, updatedAt: new Date().toISOString() };
      return tasksCache[idx];
    }
    throw new Error('Task not found');
  }

  const { data, error } = await supabase
    .from('tasks')
    .update(updatePayload)
    .eq('id', id)
    .select(`*, task_checklists (*), task_submissions (*)`)
    .single();

  if (error) throw error;
  const updated = mapTask(data);
  const idx = tasksCache.findIndex(t => t.id === id);
  if (idx !== -1) tasksCache[idx] = updated;
  return updated;
}

export async function submitTask(
  taskId: string,
  submission: { description: string; githubUrl?: string; deploymentUrl?: string; notes?: string; submittedBy?: string }
): Promise<Task> {
  if (isSupabaseConfigured()) {
    // 1. Update task status
    await supabase.from('tasks').update({ status: 'in-review' }).eq('id', taskId);

    // 2. Insert or upsert submission
    await supabase.from('task_submissions').upsert({
      task_id: taskId,
      submitted_by: submission.submittedBy || null,
      submitted_at: new Date().toISOString(),
      description: submission.description,
      github_url: submission.githubUrl || '',
      deployment_url: submission.deploymentUrl || '',
      notes: submission.notes || '',
      review_status: 'pending',
    });

    const refreshed = await getTask(taskId);
    if (refreshed) return refreshed;
  }

  // Fallback cache update
  const task = tasksCache.find(t => t.id === taskId);
  if (task) {
    task.status = 'in-review';
    task.submission = {
      id: `ts${Date.now()}`,
      taskId,
      submittedBy: submission.submittedBy || task.assigneeId,
      submittedAt: new Date().toISOString(),
      description: submission.description,
      githubUrl: submission.githubUrl,
      deploymentUrl: submission.deploymentUrl,
      attachments: [],
      notes: submission.notes,
      reviewStatus: 'pending',
    };
    return task;
  }
  throw new Error('Task not found');
}

export async function reviewTask(
  taskId: string,
  action: 'approve' | 'request-changes',
  reviewerId: string,
  notes?: string
): Promise<Task> {
  const newStatus = action === 'approve' ? 'completed' : 'in-progress';
  const newReviewStatus = action === 'approve' ? 'approved' : 'changes-requested';

  if (isSupabaseConfigured()) {
    await supabase.from('tasks').update({ status: newStatus }).eq('id', taskId);
    await supabase.from('task_submissions').update({
      review_status: newReviewStatus,
      reviewed_by: reviewerId,
      reviewed_at: new Date().toISOString(),
      review_notes: notes || '',
    }).eq('task_id', taskId);

    const refreshed = await getTask(taskId);
    if (refreshed) return refreshed;
  }

  const task = tasksCache.find(t => t.id === taskId);
  if (task && task.submission) {
    task.status = newStatus;
    task.submission.reviewStatus = newReviewStatus;
    task.submission.reviewedBy = reviewerId;
    task.submission.reviewedAt = new Date().toISOString();
    task.submission.reviewNotes = notes;
    return task;
  }
  throw new Error('Task or submission not found');
}

export async function deleteTask(taskId: string): Promise<boolean> {
  // Remove from cache immediately
  tasksCache = tasksCache.filter(t => t.id !== taskId);

  if (!isSupabaseConfigured()) {
    return true;
  }

  try {
    await supabase.from('task_submissions').delete().eq('task_id', taskId);
    await supabase.from('task_checklists').delete().eq('task_id', taskId);
  } catch (e) {
    console.warn('Cascade delete for task dependencies:', e);
  }

  const { error } = await supabase
    .from('tasks')
    .delete()
    .eq('id', taskId);

  if (error) {
    console.error('Error deleting task:', error);
    throw error;
  }
  return true;
}

// ============================================================
// MEETINGS API
// ============================================================
export async function getMeetings(userId?: string): Promise<Meeting[]> {
  try {
    if (isSupabaseConfigured()) {
      const { data, error } = await supabase
        .from('meetings')
        .select('*')
        .order('date', { ascending: true });

      if (!error && data) {
        const dbMeetings = data
          .map(mapMeeting)
          .filter(m => !isPurgedMeeting(m));

        // Merge with local-only meetings so freshly created meetings are preserved
        const localOnly = meetingsCache.filter(m => 
          !isPurgedMeeting(m) &&
          !dbMeetings.some(dbm => dbm.id === m.id)
        );
        const merged = [...dbMeetings, ...localOnly];
        persistMeetingsCache(merged);
      }
    }
  } catch (err) {
    console.warn('Error fetching meetings from Supabase, using cache fallback:', err);
  }

  // Ensure removed default meetings, blacklisted meetings, and deleted meetings are never in cache
  meetingsCache = meetingsCache.filter(m => !isPurgedMeeting(m));

  // Organization Isolation Filter
  const orgUsers = await getUsers();
  const orgUserIds = new Set(orgUsers.map(u => u.id));
  
  let result = [...meetingsCache].filter(m => {
    if (orgUserIds.size > 0) {
      if (m.hostId && orgUserIds.has(m.hostId)) return true;
      if (m.participantIds?.some(id => orgUserIds.has(id))) return true;
      if (m.createdBy && orgUserIds.has(m.createdBy)) return true;
      return false;
    }
    return false;
  });
  if (userId) {
    const uIdUpper = userId.toUpperCase();
    result = result.filter(m => 
      m.hostId === userId || 
      (m.hostId && m.hostId.toUpperCase() === uIdUpper) ||
      (m.participantIds || []).some(p => p === userId || p.toUpperCase() === uIdUpper) ||
      m.type === 'team' ||
      m.type === 'standup'
    );
  }
  return result;
}

export async function getMeeting(id: string): Promise<Meeting | undefined> {
  if (!id) return undefined;
  // 1. Check in-memory / local cache
  const cached = meetingsCache.find(m => m.id === id);
  if (cached) return cached;

  // 2. Query Supabase
  if (isSupabaseConfigured()) {
    try {
      const { data, error } = await supabase
        .from('meetings')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (!error && data) {
        const meeting = mapMeeting(data);
        const idx = meetingsCache.findIndex(m => m.id === id);
        if (idx !== -1) {
          meetingsCache[idx] = meeting;
        } else {
          meetingsCache.push(meeting);
        }
        persistMeetingsCache(meetingsCache);
        return meeting;
      }
    } catch (e) {
      console.warn('Error in getMeeting query:', e);
    }
  }

  // 3. Fallback: refresh meetings list and check again
  await getMeetings();
  return meetingsCache.find(m => m.id === id);
}

export async function getUserMeetings(userId: string): Promise<Meeting[]> {
  const allMeetings = await getMeetings();
  if (!userId) return allMeetings;
  const uIdUpper = userId.toUpperCase();
  return allMeetings.filter(m => 
    m.hostId === userId || 
    (m.hostId && m.hostId.toUpperCase() === uIdUpper) ||
    (m.participantIds || []).some(p => p === userId || p.toUpperCase() === uIdUpper) ||
    m.type === 'team' ||
    m.type === 'standup'
  );
}

export async function createMeeting(meeting: Partial<Meeting>): Promise<Meeting> {
  const { data: authData } = await supabase.auth.getUser();
  const currentUserId = authData?.user?.id || meeting.hostId || 'EMP-001';

  const newId = meeting.id || `mt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const cleanLink = (meeting.meetingLink || '').trim();
  const finalLink = cleanLink && !cleanLink.startsWith('http://') && !cleanLink.startsWith('https://') && cleanLink.includes('.')
    ? `https://${cleanLink}`
    : cleanLink;

  const roomId = meeting.meetingRoomId || newId;
  const newMeeting: Meeting = {
    id: newId,
    title: meeting.title || 'New Meeting',
    description: meeting.description || meeting.notes || '',
    date: meeting.date || new Date().toISOString().split('T')[0],
    startTime: meeting.startTime || '10:00',
    endTime: meeting.endTime || '11:00',
    hostId: currentUserId,
    participantIds: meeting.participantIds?.length ? meeting.participantIds : [currentUserId],
    type: meeting.type || 'team',
    meetingType: meeting.meetingType || 'video',
    meetingRoomId: roomId,
    isRecurring: meeting.isRecurring || false,
    meetingLink: finalLink || `/meeting/${roomId}`,
    notes: meeting.notes || meeting.description || '',
    status: meeting.status || 'scheduled',
  };

  // Add to local cache immediately so UI shows it with 0 latency
  meetingsCache.unshift(newMeeting);
  persistMeetingsCache(meetingsCache);

  // Attempt database insert if Supabase is configured and hostId is a valid UUID
  if (isSupabaseConfigured() && isValidUuid(currentUserId)) {
    try {
      const __orgId = useAuthStore.getState().currentUser?.organizationId || useAuthStore.getState().activeOrganization;
      const insertPayload: Record<string, any> = {
        ...(__orgId ? { organization_id: __orgId } : {}),
        id: newId,
        title: newMeeting.title,
        description: newMeeting.description,
        date: newMeeting.date,
        start_time: newMeeting.startTime,
        end_time: newMeeting.endTime,
        host_id: currentUserId,
        participant_ids: newMeeting.participantIds,
        type: newMeeting.type,
        meeting_type: newMeeting.meetingType,
        meeting_room_id: newMeeting.meetingRoomId,
        is_recurring: newMeeting.isRecurring,
        meeting_link: newMeeting.meetingLink,
        status: newMeeting.status,
        notes: newMeeting.notes,
      };

      const { data, error } = await supabase
        .from('meetings')
        .insert([insertPayload])
        .select()
        .maybeSingle();

      if (!error && data) {
        const mapped = mapMeeting(data);
        const idx = meetingsCache.findIndex(m => m.id === newId);
        if (idx !== -1) meetingsCache[idx] = mapped;
        persistMeetingsCache(meetingsCache);

        if (insertPayload.participant_ids?.length) {
          const attendees = insertPayload.participant_ids.filter((id: string) => id !== currentUserId);
          if (attendees.length > 0) {
            notifyMeetingScheduled({
              id: data.id,
              title: data.title,
              date: data.date,
              time: data.start_time,
              attendeeIds: attendees,
            }).catch(console.error);
          }
        }

        return mapped;
      }
    } catch (err) {
      console.warn('Could not insert meeting into Supabase, kept in local cache:', err);
    }
  }

  return newMeeting;
}

export async function updateMeeting(id: string, updates: Partial<Meeting>): Promise<Meeting> {
  const idx = meetingsCache.findIndex(m => m.id === id);
  let updatedMeeting: Meeting;

  const rawLink = updates.meetingLink !== undefined ? updates.meetingLink.trim() : undefined;
  const cleanLink = rawLink !== undefined
    ? (rawLink && !rawLink.startsWith('http://') && !rawLink.startsWith('https://') && rawLink.includes('.') ? `https://${rawLink}` : rawLink)
    : undefined;

  if (idx !== -1) {
    updatedMeeting = {
      ...meetingsCache[idx],
      ...updates,
      meetingLink: cleanLink !== undefined ? cleanLink : meetingsCache[idx].meetingLink,
    };
    meetingsCache[idx] = updatedMeeting;
  } else {
    const roomId = updates.meetingRoomId || id;
    updatedMeeting = {
      id,
      title: updates.title || '',
      description: updates.description || '',
      date: updates.date || new Date().toISOString().split('T')[0],
      startTime: updates.startTime || '10:00',
      endTime: updates.endTime || '11:00',
      hostId: updates.hostId || 'EMP-001',
      participantIds: updates.participantIds || [],
      type: updates.type || 'team',
      meetingType: updates.meetingType || 'video',
      meetingRoomId: roomId,
      isRecurring: updates.isRecurring || false,
      meetingLink: cleanLink || `/meeting/${roomId}`,
      status: updates.status || 'scheduled',
      notes: updates.notes || '',
    };
    meetingsCache.push(updatedMeeting);
  }
  persistMeetingsCache(meetingsCache);

  if (isSupabaseConfigured()) {
    try {
      const updatePayload: Record<string, any> = {};
      if (updates.title !== undefined) updatePayload.title = updates.title;
      if (updates.description !== undefined) updatePayload.description = updates.description;
      if (updates.date !== undefined) updatePayload.date = updates.date;
      if (updates.startTime !== undefined) updatePayload.start_time = updates.startTime;
      if (updates.endTime !== undefined) updatePayload.end_time = updates.endTime;
      if (cleanLink !== undefined) updatePayload.meeting_link = cleanLink;
      if (updates.status !== undefined) updatePayload.status = updates.status;
      if (updates.notes !== undefined) updatePayload.notes = updates.notes;
      if (updates.participantIds !== undefined) updatePayload.participant_ids = updates.participantIds;
      if (updates.meetingType !== undefined) updatePayload.meeting_type = updates.meetingType;
      if (updates.meetingRoomId !== undefined) updatePayload.meeting_room_id = updates.meetingRoomId;

      const { data, error } = await supabase
        .from('meetings')
        .update(updatePayload)
        .eq('id', id)
        .select()
        .maybeSingle();

      if (!error && data) {
        const mapped = mapMeeting(data);
        const i = meetingsCache.findIndex(m => m.id === id);
        if (i !== -1) meetingsCache[i] = mapped;
        persistMeetingsCache(meetingsCache);
        return mapped;
      }
    } catch (err) {
      console.warn('Failed to update meeting in Supabase, updated local cache:', err);
    }
  }

  return updatedMeeting;
}

export async function deleteMeeting(id: string): Promise<boolean> {
  const meeting = meetingsCache.find(m => m.id === id || m.meetingRoomId === id);
  const roomId = meeting?.meetingRoomId;

  // 1. Immediately record in persistent deleted set to prevent any auto-undelete
  recordDeletedMeetingId(id, roomId);

  // 2. Remove from local cache immediately
  meetingsCache = meetingsCache.filter(m => m.id !== id && m.meetingRoomId !== id && (!roomId || m.id !== roomId));
  persistMeetingsCache(meetingsCache);

  // 3. Delete from Supabase with child record cleanup
  if (isSupabaseConfigured()) {
    try {
      // First clean child records to prevent foreign key errors
      await supabase.from('meeting_messages').delete().eq('meeting_id', id);
      await supabase.from('meeting_attendance').delete().eq('meeting_id', id);
      await supabase.from('meeting_participants').delete().eq('meeting_id', id);
      if (roomId) {
        await supabase.from('meeting_messages').delete().eq('meeting_id', roomId);
        await supabase.from('meeting_attendance').delete().eq('meeting_id', roomId);
        await supabase.from('meeting_participants').delete().eq('meeting_id', roomId);
      }

      // Delete from meetings table by id and meeting_room_id
      const { error: err1 } = await supabase.from('meetings').delete().eq('id', id);
      if (err1) {
        console.warn('Supabase delete by id failed, attempting by room_id:', err1.message);
      }
      if (roomId) {
        await supabase.from('meetings').delete().eq('meeting_room_id', roomId);
      }
      await supabase.from('meetings').delete().eq('meeting_room_id', id);
    } catch (e) {
      console.warn('Could not delete meeting from Supabase:', e);
    }
  }
  return true;
}

// ============================================================
// ATTENDANCE API
// ============================================================
export async function getAttendance(userId?: string, date?: string): Promise<AttendanceRecord[]> {
  try {
    let query = supabase.from('attendance_records').select('*').order('date', { ascending: false });
    if (userId) query = query.eq('user_id', userId);
    if (date) query = query.eq('date', date);

    const { data, error } = await query;
    if (error) {
      console.error('Error fetching attendance from Supabase:', error);
      return [];
    }
    
    const orgUsers = await getUsers();
    const orgUserIds = new Set(orgUsers.map(u => u.id));
    
    return (data || []).map(mapAttendance).filter(a => {
      if (orgUserIds.size > 0 && a.userId) {
        return orgUserIds.has(a.userId);
      }
      return false;
    });
  } catch (err) {
    console.error('Error in getAttendance:', err);
    return [];
  }
}

export async function getUserAttendance(userId: string): Promise<AttendanceRecord[]> {
  if (!isSupabaseConfigured()) return [];
  const { data, error } = await supabase
    .from('attendance_records')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: false });

  if (error) return [];
  return (data || []).map(mapAttendance);
}

export async function getDateAttendance(date: string): Promise<AttendanceRecord[]> {
  if (!isSupabaseConfigured()) return [];
  const { data, error } = await supabase
    .from('attendance_records')
    .select('*')
    .eq('date', date);

  if (error) return [];
  return (data || []).map(mapAttendance);
}

function calculateDuration(checkInStr?: string, checkOutStr?: string): { formatted: string; numeric: number } {
  if (!checkInStr || !checkOutStr) return { formatted: '0h 00m', numeric: 0 };

  const parseToMinutes = (val: string) => {
    const cleaned = val.trim();
    const isPM = /pm/i.test(cleaned);
    const isAM = /am/i.test(cleaned);
    const timeDigits = cleaned.replace(/[^0-9:]/g, '');
    const [hRaw, mRaw] = timeDigits.split(':');
    let h = parseInt(hRaw || '0', 10);
    const m = parseInt(mRaw || '0', 10);
    if (isPM && h < 12) h += 12;
    if (isAM && h === 12) h = 0;
    return h * 60 + m;
  };

  const startMin = parseToMinutes(checkInStr);
  const endMin = parseToMinutes(checkOutStr);
  const diffMinutes = Math.max(0, endMin - startMin);

  const hours = Math.floor(diffMinutes / 60);
  const minutes = diffMinutes % 60;
  const numeric = parseFloat((diffMinutes / 60).toFixed(2));
  return {
    formatted: `${hours}h ${minutes.toString().padStart(2, '0')}m`,
    numeric,
  };
}

export async function getTodayAttendance(userId: string): Promise<AttendanceRecord | null> {
  if (!userId) return null;
  const today = new Date().toISOString().split('T')[0];
  const { data, error } = await supabase
    .from('attendance_records')
    .select('*')
    .eq('user_id', userId)
    .eq('date', today)
    .maybeSingle();

  if (error || !data) return null;
  return mapAttendance(data);
}

export async function checkIn(userId: string, overrideTime?: Date): Promise<AttendanceRecord> {
  if (!userId) throw new Error('User ID is required to check in.');
  const now = overrideTime instanceof Date ? overrideTime : new Date();
  const today = now.toISOString().split('T')[0];
  const timeNow = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

  const currentMins = now.getHours() * 60 + now.getMinutes();
  let pointsAwarded = 0;
  let isLate = false;
  let notes = '';

  if (currentMins >= PUNCH_IN_START_MIN && currentMins <= PUNCH_IN_ONTIME_END_MIN) {
    pointsAwarded = POINTS_ON_TIME;
    isLate = false;
    notes = `Points: ${pointsAwarded} | On-time Punch In (9:00 AM - 10:00 AM)`;
  } else if (currentMins > PUNCH_IN_ONTIME_END_MIN && currentMins <= PUNCH_IN_GRACE_END_MIN) {
    pointsAwarded = POINTS_GRACE;
    isLate = true;
    notes = `Points: ${pointsAwarded} | Grace Window Punch In (10:00 AM - 10:15 AM)`;
  } else if (currentMins < PUNCH_IN_START_MIN) {
    throw new Error('Punch In is disabled before 9:00 AM. Window opens at 9:00 AM.');
  } else {
    throw new Error('Punch In is closed for today. Cut-off was 10:15 AM.');
  }

  const fallbackRecord: AttendanceRecord = {
    id: `att_${Date.now()}`,
    userId,
    date: today,
    status: isLate ? 'late' : 'present',
    checkIn: timeNow,
    workingHours: '0h 00m',
    notes,
    points: pointsAwarded,
  };

  try {
    const payload: any = {
      user_id: userId,
      date: today,
      status: isLate ? 'late' : 'present',
      check_in: timeNow,
      hours_worked: 0,
      notes,
    };

    let res = await supabase
      .from('attendance_records')
      .upsert({ ...payload, points: pointsAwarded }, { onConflict: 'user_id,date' })
      .select()
      .single();

    if (res.error && (res.error.message?.includes('points') || res.error.code === '42703')) {
      res = await supabase
        .from('attendance_records')
        .upsert(payload, { onConflict: 'user_id,date' })
        .select()
        .single();
    }

    if (res.error) {
      console.warn('Supabase check-in rejected (using local session fallback):', res.error);
      return fallbackRecord;
    }

    // Trigger instant device push confirmation
    notifyCheckInSuccess({
      memberId: userId,
      checkInTime: timeNow,
    }).catch(console.error);

    return mapAttendance(res.data);
  } catch (err) {
    console.warn('Check-in network error (using local session fallback):', err);
    return fallbackRecord;
  }
}

export async function checkOut(userId: string, overrideTime?: Date): Promise<AttendanceRecord> {
  if (!userId) throw new Error('User ID is required to check out.');
  const now = overrideTime instanceof Date ? overrideTime : new Date();
  const today = now.toISOString().split('T')[0];
  const timeNow = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  const currentMins = now.getHours() * 60 + now.getMinutes();

  if (currentMins < PUNCH_OUT_START_MIN) {
    throw new Error('Punch Out is disabled before 9:00 PM. Shifts conclude between 9:00 PM and 10:00 PM.');
  }
  if (currentMins > PUNCH_OUT_END_MIN) {
    throw new Error('Punch Out is closed after 10:00 PM. Missed punch-out penalty has been applied.');
  }

  let existingCheckIn = '';
  let existingNotes = '';
  let basePoints = POINTS_ON_TIME;

  try {
    const { data: existing } = await supabase
      .from('attendance_records')
      .select('check_in, points, notes')
      .eq('user_id', userId)
      .eq('date', today)
      .maybeSingle();

    if (existing) {
      existingCheckIn = existing.check_in || '';
      existingNotes = existing.notes || '';
      const inMins = parseTimeToMinutes(existingCheckIn);
      if (inMins !== null && inMins > PUNCH_IN_ONTIME_END_MIN && inMins <= PUNCH_IN_GRACE_END_MIN) {
        basePoints = POINTS_GRACE;
      }
    }
  } catch (e) {
    // ignore
  }

  const { formatted, numeric } = calculateDuration(existingCheckIn, timeNow);
  const finalPoints = basePoints;
  const notes = `${existingNotes} | Punch Out at ${timeNow} (Full ${finalPoints} pts retained)`.trim();

  const fallbackRecord: AttendanceRecord = {
    id: `att_${Date.now()}`,
    userId,
    date: today,
    status: 'present',
    checkOut: timeNow,
    workingHours: formatted,
    notes,
    points: finalPoints,
  };

  try {
    const updatePayload: any = {
      check_out: timeNow,
      hours_worked: numeric,
      notes,
    };

    let res = await supabase
      .from('attendance_records')
      .update({ ...updatePayload, points: finalPoints })
      .eq('user_id', userId)
      .eq('date', today)
      .select()
      .single();

    if (res.error && (res.error.message?.includes('points') || res.error.code === '42703')) {
      res = await supabase
        .from('attendance_records')
        .update(updatePayload)
        .eq('user_id', userId)
        .eq('date', today)
        .select()
        .single();
    }

    if (res.error) {
      console.warn('Supabase check-out rejected (using local session fallback):', res.error);
      return fallbackRecord;
    }
    const result = mapAttendance(res.data);
    result.workingHours = formatted;
    result.points = finalPoints;
    return result;
  } catch (err: any) {
    if (err.message && (err.message.includes('Punch Out is disabled') || err.message.includes('Punch Out is closed'))) {
      throw err;
    }
    console.warn('Check-out network error (using local session fallback):', err);
    return fallbackRecord;
  }
}

export async function resetTodayAttendance(userId: string): Promise<boolean> {
  if (!userId) return false;
  const today = new Date().toISOString().split('T')[0];
  try {
    const { error: delError } = await supabase
      .from('attendance_records')
      .delete()
      .eq('user_id', userId)
      .eq('date', today);

    if (delError) {
      console.warn('Supabase delete error (attempting nullify update):', delError);
      await supabase
        .from('attendance_records')
        .update({
          check_in: null,
          check_out: null,
          working_hours: null,
          hours_worked: 0,
          status: 'present',
          notes: 'Reset by user',
          points: 0,
        })
        .eq('user_id', userId)
        .eq('date', today);
    }
    return true;
  } catch (err) {
    console.error('Error resetting today attendance:', err);
    return false;
  }
}

// ============================================================
// DAILY REPORTS API
// ============================================================
export async function getDailyReports(): Promise<DailyReport[]> {
  if (!isSupabaseConfigured()) return [];
  const { data, error } = await supabase
    .from('daily_reports')
    .select('*')
    .order('date', { ascending: false });

  if (error) {
    console.error('Error fetching daily reports:', error);
    return [];
  }
  
  const orgUsers = await getUsers();
  const orgUserIds = new Set(orgUsers.map(u => u.id));
  
  return (data || []).map(mapDailyReport).filter(r => {
    if (orgUserIds.size > 0 && r.userId) {
      return orgUserIds.has(r.userId);
    }
    return false;
  });
}

export async function submitDailyReport(report: Partial<DailyReport>): Promise<DailyReport> {
  const __orgId = useAuthStore.getState().currentUser?.organizationId || useAuthStore.getState().activeOrganization;
    const insertPayload: any = {
      ...(__orgId ? { organization_id: __orgId } : {}),
    user_id: report.userId || 'u2',
    date: report.date || new Date().toISOString().split('T')[0],
    content: report.content || '',
    achievements: report.achievements || '',
    challenges: report.challenges || '',
    tomorrow_plan: report.tomorrowPlan || '',
    hours_worked: report.hoursWorked || 0,
    submitted_at: new Date().toISOString(),
  };

  if (!isSupabaseConfigured()) {
    return {
      id: `dr${Date.now()}`,
      userId: insertPayload.user_id,
      date: insertPayload.date,
      content: insertPayload.content,
      achievements: insertPayload.achievements,
      challenges: insertPayload.challenges,
      tomorrowPlan: insertPayload.tomorrow_plan,
      hoursWorked: insertPayload.hours_worked,
      submittedAt: insertPayload.submitted_at,
    };
  }

  const { data, error } = await supabase
    .from('daily_reports')
    .insert([insertPayload])
    .select()
    .single();

  if (error) throw error;
  return mapDailyReport(data);
}

// ============================================================
// NOTIFICATIONS API
// ============================================================
export async function createNotification(notification: any): Promise<void> {
  if (!isSupabaseConfigured() || !isValidUuid(notification.userId)) return;
  const payload = {
    user_id: notification.userId,
    title: notification.title,
    message: notification.message,
    link: notification.actionUrl,
    type: notification.type || 'general',
    is_read: false,
    created_at: new Date().toISOString(),
  };

  const { error } = await supabase.from('notifications').insert([payload]);
  if (error) console.error('Failed to create notification:', error);
}

export async function getNotifications(userId?: string): Promise<Notification[]> {
  if (!isSupabaseConfigured()) return [];
  let query = supabase.from('notifications').select('*').order('created_at', { ascending: false });
  if (userId && isValidUuid(userId)) {
    query = query.eq('user_id', userId);
  }
  const { data, error } = await query;
  if (error) {
    console.warn('Error fetching notifications:', error);
    return [];
  }
  return (data || []).map(mapNotification);
}

export async function markNotificationRead(id: string): Promise<void> {
  if (isSupabaseConfigured() && isValidUuid(id)) {
    await supabase.from('notifications').update({ 
      is_read: true,
      read_at: new Date().toISOString()
    }).eq('id', id);
  }
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  if (isSupabaseConfigured() && isValidUuid(userId)) {
    await supabase
      .from('notifications')
      .update({ 
        is_read: true,
        read_at: new Date().toISOString()
      })
      .eq('user_id', userId);
  }
}

// ============================================================
// MESSAGES API
// ============================================================
export const DEFAULT_CHAT_CHANNELS: ChatChannel[] = [
  { id: 'ch_global', name: 'global-chat', type: 'general', memberIds: [], unreadCount: 0, icon: 'globe' },
];

export async function getChannels(): Promise<ChatChannel[]> {
  if (!isSupabaseConfigured()) return DEFAULT_CHAT_CHANNELS;

  try {
    const { data, error } = await supabase
      .from('chat_channels')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) {
      console.warn('Error fetching chat_channels, using default global channel:', error);
      return DEFAULT_CHAT_CHANNELS;
    }

    // Filter out removed options: direct messages, development, random, announcements
    const filtered = (data || []).filter(c => {
      const n = (c.name || '').toLowerCase();
      return (
        c.type !== 'direct' &&
        !['announcements', 'development', 'random', 'general'].includes(n)
      );
    });

    let globalChannel = filtered.find(c => c.id === 'ch_global' || c.name === 'global-chat');

    // If global-chat does not exist in the database yet, auto-create it
    if (!globalChannel) {
      try {
        const { data: newGlobal, error: globalErr } = await supabase
          .from('chat_channels')
          .insert([{
            id: 'ch_global',
            name: 'global-chat',
            type: 'general',
            icon: 'globe',
            member_ids: [],
          }])
          .select()
          .single();

        if (!globalErr && newGlobal) {
          globalChannel = newGlobal;
        }
      } catch {
        // fallback
      }
    }

    // Clean up unwanted channels in background
    try {
      supabase
        .from('chat_channels')
        .delete()
        .or('name.in.(announcements,development,random,general),type.eq.direct')
        .then(() => {});
    } catch {
      // ignore
    }

    return globalChannel ? [mapChannel(globalChannel)] : DEFAULT_CHAT_CHANNELS;
  } catch (err) {
    console.warn('Chat channels exception, using defaults:', err);
    return DEFAULT_CHAT_CHANNELS;
  }
}

export async function createChannel(name: string, type: 'general' | 'project' | 'direct' = 'general', memberIds: string[] = []): Promise<ChatChannel> {
  const sanitizedName = name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-_]/g, '');
  const newChan = {
    id: `ch_${Math.random().toString(36).substring(2, 10)}`,
    name: sanitizedName || 'new-channel',
    type,
    member_ids: memberIds,
    unread_count: 0,
    icon: type === 'direct' ? 'user' : 'hash',
  };

  if (!isSupabaseConfigured()) {
    return mapChannel(newChan);
  }

  const { data, error } = await supabase
    .from('chat_channels')
    .insert([newChan])
    .select()
    .single();

  if (error) {
    console.error('Error creating channel in Supabase:', error);
    throw error;
  }

  return mapChannel(data);
}

export async function getChannelMessages(receiverId: string, currentUserId?: string): Promise<ChatMessage[]> {
  if (!isSupabaseConfigured()) return [];
  
  let query = supabase.from('chat_messages').select('*').order('timestamp', { ascending: true });
  
  const isGlobal = receiverId === 'globe' || receiverId === 'ch_global';
  if (isGlobal) {
    // Global chat is identified by null receiver_id or channel_id = 'ch_global'
    query = query.or('receiver_id.is.null,channel_id.eq.ch_global');
  } else if (currentUserId && isValidUuid(receiverId) && isValidUuid(currentUserId)) {
    // Direct messages between current user and receiver
    query = query.or(`and(sender_id.eq.${currentUserId},receiver_id.eq.${receiverId}),and(sender_id.eq.${receiverId},receiver_id.eq.${currentUserId})`);
  }

  const { data, error } = await query;
  if (error) {
    console.error('Error fetching chat messages:', error);
    return [];
  }
  return (data || []).map(mapMessage);
}

export async function sendMessage(receiverId: string, content: string, senderId: string, attachments: any[] = []): Promise<ChatMessage> {
  const isGlobal = receiverId === 'globe' || receiverId === 'ch_global';
  const now = new Date().toISOString();
  const msgType = attachments.length > 0 && !content.trim() ? 'file' : 'text';

  if (!isSupabaseConfigured()) {
    return {
      id: `msg${Date.now()}`,
      channelId: isGlobal ? 'globe' : receiverId,
      senderId,
      content,
      timestamp: now,
      type: msgType as any,
      attachments,
      reactions: [],
    };
  }

  // Ensure sender_id matches a valid UUID format for public.profiles foreign key
  let validSenderId = senderId;
  if (!isValidUuid(senderId)) {
    try {
      const { data: authData } = await supabase.auth.getUser();
      if (authData?.user?.id && isValidUuid(authData.user.id)) {
        validSenderId = authData.user.id;
      }
    } catch {
      // fallback
    }
  }

  const validReceiverId = (!isGlobal && isValidUuid(receiverId)) ? receiverId : null;

  // Note: Do NOT manually pass `id` because public.chat_messages expects a UUID generated by gen_random_uuid()
  const __orgId = useAuthStore.getState().currentUser?.organizationId || useAuthStore.getState().activeOrganization;
      const insertPayload: Record<string, any> = {
        ...(__orgId ? { organization_id: __orgId } : {}),
    channel_id: isGlobal ? 'ch_global' : null,
    receiver_id: validReceiverId,
    sender_id: validSenderId,
    content,
    type: msgType,
    attachments,
    reactions: [],
    timestamp: now,
  };

  const { data, error } = await supabase
    .from('chat_messages')
    .insert([insertPayload])
    .select()
    .single();

  if (error) {
    console.error('Error sending message:', error);
    throw error;
  }

  return mapMessage(data);
}

export async function updateMessageReactions(messageId: string, reactions: any[]): Promise<void> {
  if (!isSupabaseConfigured() || !isValidUuid(messageId)) return;
  try {
    const { error } = await supabase
      .from('chat_messages')
      .update({ reactions })
      .eq('id', messageId);
    if (error) console.error('Error updating reaction in Supabase:', error);
  } catch (err) {
    console.error('Failed to update reactions in Supabase:', err);
  }
}



// ============================================================
// FILES API
// ============================================================
export async function getFiles(): Promise<FileItem[]> {
  if (!isSupabaseConfigured()) return [];
  const { data, error } = await supabase
    .from('files')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return [];
  return (data || []).map(mapFile);
}

export async function getFolders(): Promise<Folder[]> {
  if (!isSupabaseConfigured()) return [];
  const { data, error } = await supabase
    .from('folders')
    .select('*')
    .order('name', { ascending: true });

  if (error) return [];
  return (data || []).map(mapFolder);
}

export async function getFilesByFolder(folder: string): Promise<FileItem[]> {
  if (!isSupabaseConfigured()) return [];
  const { data, error } = await supabase
    .from('files')
    .select('*')
    .eq('folder', folder)
    .order('created_at', { ascending: false });

  if (error) return [];
  return (data || []).map(mapFile);
}

export async function uploadFile(file: File, folder: string = 'General'): Promise<FileItem> {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured. Please check your .env credentials.');
  }

  const filePath = `${folder}/${file.name}`;

  const { error: uploadError } = await supabase.storage
    .from('files')
    .upload(filePath, file, { upsert: true });

  if (uploadError) {
    console.error('Error uploading file to storage:', uploadError);
    const msg = uploadError.message || '';
    if (msg.toLowerCase().includes('bucket not found') || (uploadError as any).statusCode === '404') {
      throw new Error("Supabase Storage bucket 'files' not found. Please create a public bucket named 'files' in Supabase Dashboard -> Storage.");
    }
    if (msg.toLowerCase().includes('row-level security') || msg.toLowerCase().includes('policy') || (uploadError as any).statusCode === '403') {
      throw new Error("Upload blocked by Supabase Storage RLS. Please apply the storage policies for the 'files' bucket.");
    }
    throw uploadError;
  }

  // Generate public URL
  const { data: urlData } = supabase.storage
    .from('files')
    .getPublicUrl(filePath);

  const publicUrl = urlData?.publicUrl || '#';

  // Get current user ID if logged in
  let currentUserId: string | null = null;
  try {
    const { data: authData } = await supabase.auth.getUser();
    currentUserId = authData?.user?.id || null;
  } catch {
    // Session optional in demo/offline
  }

  let type = 'document';
  if (file.type.startsWith('image/')) type = 'image';
  else if (file.type.startsWith('video/')) type = 'video';
  else if (file.name.match(/\.(zip|tar|gz|rar|7z)$/i)) type = 'archive';
  else if (file.name.match(/\.(ts|js|jsx|tsx|css|html|json|py|java|c|cpp|go|rs|sql|md)$/i)) type = 'code';
  else if (file.name.match(/\.(xls|xlsx|csv)$/i)) type = 'spreadsheet';
  else if (file.name.match(/\.(ppt|pptx)$/i)) type = 'presentation';

  const __orgId = useAuthStore.getState().currentUser?.organizationId || useAuthStore.getState().activeOrganization;
    const insertPayload: any = {
      ...(__orgId ? { organization_id: __orgId } : {}),
    id: `fl_${Math.random().toString(36).substring(2, 10)}`,
    name: file.name,
    type,
    size: file.size,
    folder,
    url: publicUrl,
    uploaded_by: currentUserId,
    mime_type: file.type || 'application/octet-stream',
  };

  const { data, error: dbError } = await supabase
    .from('files')
    .insert([insertPayload])
    .select()
    .single();

  if (dbError) {
    console.warn('Database record creation failed, returning mapped memory item:', dbError);
    return {
      id: insertPayload.id,
      name: file.name,
      type: insertPayload.type as any,
      size: file.size,
      folder,
      uploadedBy: currentUserId || 'user',
      uploadedAt: new Date().toISOString(),
      url: publicUrl,
      mimeType: insertPayload.mime_type,
    };
  }

  return mapFile(data);
}

export async function deleteFile(fileId: string): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;

  try {
    const { data: fileRecord } = await supabase
      .from('files')
      .select('*')
      .eq('id', fileId)
      .maybeSingle();

    if (fileRecord?.url && fileRecord.url.includes('/files/')) {
      const parts = fileRecord.url.split('/files/');
      const storagePath = parts[parts.length - 1]?.split('?')[0];
      if (storagePath) {
        await supabase.storage.from('files').remove([decodeURIComponent(storagePath)]);
      }
    }
  } catch (err) {
    console.warn('Could not remove file from Supabase storage:', err);
  }

  const { error } = await supabase
    .from('files')
    .delete()
    .eq('id', fileId);

  if (error) {
    console.error('Error deleting file record from database:', error);
    throw error;
  }

  return true;
}

// ============================================================
// LEAVE REQUESTS API
// ============================================================
export async function getLeaveRequests(): Promise<LeaveRequest[]> {
  if (!isSupabaseConfigured()) return [];
  const { data, error } = await supabase
    .from('leave_requests')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return [];
  
  const orgUsers = await getUsers();
  const orgUserIds = new Set(orgUsers.map(u => u.id));
  
  return (data || []).map(mapLeaveRequest).filter(lr => {
    if (orgUserIds.size > 0 && lr.userId) {
      return orgUserIds.has(lr.userId);
    }
    return false;
  });
}

export async function createLeaveRequest(request: Partial<LeaveRequest>): Promise<LeaveRequest> {
  const __orgId = useAuthStore.getState().currentUser?.organizationId || useAuthStore.getState().activeOrganization;
    const insertPayload: any = {
      ...(__orgId ? { organization_id: __orgId } : {}),
    user_id: request.userId || 'u2',
    type: request.type || 'casual',
    start_date: request.startDate || '',
    end_date: request.endDate || '',
    reason: request.reason || '',
    status: 'pending',
  };

  if (!isSupabaseConfigured()) {
    return {
      id: `lr${Date.now()}`,
      userId: insertPayload.user_id,
      type: insertPayload.type as any,
      startDate: insertPayload.start_date,
      endDate: insertPayload.end_date,
      reason: insertPayload.reason,
      status: 'pending',
      appliedAt: new Date().toISOString(),
    };
  }

  const { data, error } = await supabase
    .from('leave_requests')
    .insert([insertPayload])
    .select()
    .single();

  if (error) throw error;
  return mapLeaveRequest(data);
}

export async function reviewLeaveRequest(
  id: string,
  action: 'approve' | 'reject',
  reviewerId: string
): Promise<LeaveRequest> {
  const status = action === 'approve' ? 'approved' : 'rejected';
  if (isSupabaseConfigured()) {
    const { data, error } = await supabase
      .from('leave_requests')
      .update({
        status,
        reviewed_by: reviewerId,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (!error && data) return mapLeaveRequest(data);
  }

  return {
    id,
    userId: 'u17',
    type: 'casual',
    startDate: '',
    endDate: '',
    reason: '',
    status,
    appliedAt: new Date().toISOString(),
    reviewedBy: reviewerId,
    reviewedAt: new Date().toISOString(),
  };
}

// ============================================================
// ANNOUNCEMENTS API
// ============================================================
export async function getAnnouncements(): Promise<Announcement[]> {
  if (!isSupabaseConfigured()) return [];
  const { data, error } = await supabase
    .from('announcements')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return [];
  
  const orgUsers = await getUsers();
  const orgUserIds = new Set(orgUsers.map(u => u.id));
  
  return (data || []).map(mapAnnouncement).filter(a => {
    if (orgUserIds.size > 0 && a.createdBy) {
      return orgUserIds.has(a.createdBy);
    }
    return false;
  });
}

export async function createAnnouncement(announcement: Partial<Announcement>): Promise<Announcement> {
  const __orgId = useAuthStore.getState().currentUser?.organizationId || useAuthStore.getState().activeOrganization;
    const insertPayload: any = {
      ...(__orgId ? { organization_id: __orgId } : {}),
    title: announcement.title || '',
    content: announcement.content || '',
    priority: announcement.priority || 'normal',
    created_by: announcement.createdBy || 'u1',
    audience: announcement.audience || 'all',
    is_published: true,
  };


  const { data, error } = await supabase
    .from('announcements')
    .insert([insertPayload])
    .select()
    .single();

  if (error) throw error;
  return mapAnnouncement(data);
}

export async function deleteAnnouncement(id: string): Promise<boolean> {
  if (isSupabaseConfigured()) {
    const { error } = await supabase
      .from('announcements')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting announcement from Supabase:', error);
      throw error;
    }
  }
  return true;
}

// ============================================================
// MANAGER DASHBOARD DATA AGGREGATION
// ============================================================
export async function getManagerDashboardData(managerId: string) {
  try {
    // 1. Projects managed by this manager
    const managedProjects = await getProjects({ managerId });
    const projectIds = managedProjects.map(p => p.id);

    // 2. Tasks in these projects
    const allTasks = await getTasks();
    const managerTasks = allTasks.filter(t => projectIds.includes(t.projectId));

    // 3. Unique team members in manager's projects
    const memberIdSet = new Set<string>();
    managedProjects.forEach(p => p.memberIds.forEach(m => memberIdSet.add(m)));
    managerTasks.forEach(t => { if (t.assigneeId) memberIdSet.add(t.assigneeId); });

    const allUsers = await getUsers();
    const teamMembers = allUsers.filter(u => memberIdSet.has(u.id));

    // 4. Submissions awaiting review
    const pendingSubmissions = managerTasks
      .filter(t => t.submission && (t.submission.reviewStatus === 'pending' || t.status === 'in-review'))
      .map(t => ({
        task: t,
        submission: t.submission!,
      }));

    // 5. Team attendance today
    const today = new Date().toISOString().split('T')[0];
    const attendanceRecords = await getAttendance(undefined, today);
    const teamAttendance = attendanceRecords.filter(a => memberIdSet.has(a.userId));

    // 6. Meetings involving this manager
    const meetings = await getMeetings(managerId);

    return {
      managedProjects,
      managerTasks,
      teamMembers,
      pendingSubmissions,
      teamAttendance,
      meetings,
    };
  } catch (err) {
    console.error('Error fetching manager dashboard data:', err);
    return {
      managedProjects: [],
      managerTasks: [],
      teamMembers: [],
      pendingSubmissions: [],
      teamAttendance: [],
      meetings: [],
    };
  }
}


export async function sendPasswordResetEmail(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + '/reset-password' });
  if (error) throw error;
}
