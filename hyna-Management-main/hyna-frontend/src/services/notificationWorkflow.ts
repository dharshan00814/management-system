// ============================================================
// Hyna Management: Notification Workflow Service
// Integrates all application events (Tasks, Projects, Meetings,
// Attendance, Announcements, Files, Weekly Bash, System Alerts)
// with native Web Push and in-app Notification Center.
// ============================================================

import { supabase, isSupabaseConfigured } from '@/lib/supabase';

export interface DispatchNotificationParams {
  title: string;
  message: string;
  type: 'task' | 'project' | 'module' | 'meeting' | 'attendance' | 'announcement' | 'event' | 'general';
  actionUrl: string;
  data?: Record<string, any>;
  recipients: {
    type: 'all' | 'users' | 'role' | 'project';
    userIds?: string[];
    role?: 'admin' | 'manager' | 'member';
    projectId?: string;
  };
}

// Low-level dispatcher: Calls send-notification Edge function or falls back to DB insert
export async function dispatchNotification(params: DispatchNotificationParams): Promise<boolean> {
  try {
    const { data, error } = await supabase.functions.invoke('send-notification', {
      body: params,
    });

    if (!error && data?.success) {
      return true;
    }
  } catch {
    // Edge function offline or local dev fallback
  }

  // Fallback: Direct database insert for in-app history
  if (isSupabaseConfigured()) {
    try {
      let recipientIds: string[] = [];

      if (params.recipients.type === 'users' && params.recipients.userIds) {
        recipientIds = params.recipients.userIds.filter((id) =>
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
        );
      } else if (params.recipients.type === 'all') {
        const { data: allProfiles } = await supabase.from('profiles').select('id');
        recipientIds = (allProfiles || []).map((p: any) => p.id);
      } else if (params.recipients.type === 'role' && params.recipients.role) {
        const { data: roleProfiles } = await supabase.from('profiles').select('id').eq('role', params.recipients.role);
        recipientIds = (roleProfiles || []).map((p: any) => p.id);
      }

      const rows = recipientIds.map((uId) => ({
        user_id: uId,
        title: params.title,
        message: params.message,
        type: params.type,
        link: params.actionUrl,
        data: params.data || {},
        is_read: false,
        created_at: new Date().toISOString(),
      }));

      if (rows.length > 0) {
        await supabase.from('notifications').insert(rows);
      }
    } catch (e) {
      console.warn('Fallback notification insert failed:', e);
    }
  }

  return true;
}

// ------------------------------------------------------------
// 1. TASK WORKFLOW NOTIFICATIONS
// ------------------------------------------------------------

export async function notifyTaskAssigned(task: {
  id: string;
  title: string;
  assigneeId: string;
  assignerName?: string;
}) {
  return dispatchNotification({
    title: 'New Task Assigned',
    message: `${task.assignerName || 'A lead'} assigned you to "${task.title}".`,
    type: 'task',
    actionUrl: `/member/tasks`,
    data: { taskId: task.id },
    recipients: { type: 'users', userIds: [task.assigneeId] },
  });
}

export async function notifyTaskSubmitted(task: {
  id: string;
  title: string;
  submitterName: string;
  managerId?: string;
}) {
  return dispatchNotification({
    title: 'Task Submitted for Review',
    message: `${task.submitterName} submitted "${task.title}" for approval.`,
    type: 'task',
    actionUrl: `/manager/tasks`,
    data: { taskId: task.id },
    recipients: task.managerId ? { type: 'users', userIds: [task.managerId] } : { type: 'role', role: 'manager' },
  });
}

export async function notifyTaskReviewed(task: {
  id: string;
  title: string;
  approved: boolean;
  reviewerName: string;
  assigneeId: string;
}) {
  return dispatchNotification({
    title: task.approved ? 'Task Approved' : 'Task Revision Requested',
    message: `Your task "${task.title}" was ${task.approved ? 'approved' : 'sent back for revision'} by ${task.reviewerName}.`,
    type: 'task',
    actionUrl: `/member/tasks`,
    data: { taskId: task.id, approved: task.approved },
    recipients: { type: 'users', userIds: [task.assigneeId] },
  });
}

export async function notifyTaskComment(task: {
  id: string;
  title: string;
  authorName: string;
  recipientId: string;
  commentSnippet: string;
}) {
  return dispatchNotification({
    title: 'New Comment on Task',
    message: `${task.authorName} commented on "${task.title}": "${task.commentSnippet.slice(0, 60)}"`,
    type: 'task',
    actionUrl: `/member/tasks`,
    data: { taskId: task.id },
    recipients: { type: 'users', userIds: [task.recipientId] },
  });
}

// ------------------------------------------------------------
// 2. MODULE WORKFLOW NOTIFICATIONS
// ------------------------------------------------------------

export async function notifyModuleAssigned(mod: {
  id: string;
  name: string;
  recipientId: string;
  projectId: string;
}) {
  return dispatchNotification({
    title: 'Module Assigned',
    message: `You were assigned to module "${mod.name}".`,
    type: 'module',
    actionUrl: `/member/projects/${mod.projectId}`,
    data: { moduleId: mod.id, projectId: mod.projectId },
    recipients: { type: 'users', userIds: [mod.recipientId] },
  });
}

// ------------------------------------------------------------
// 3. PROJECT WORKFLOW NOTIFICATIONS
// ------------------------------------------------------------

export async function notifyMemberAddedToProject(project: {
  id: string;
  name: string;
  memberId: string;
}) {
  return dispatchNotification({
    title: 'Added to Project',
    message: `You have been added to the project "${project.name}".`,
    type: 'project',
    actionUrl: `/member/projects/${project.id}`,
    data: { projectId: project.id },
    recipients: { type: 'users', userIds: [project.memberId] },
  });
}

export async function notifyProjectStatusChanged(project: {
  id: string;
  name: string;
  status: string;
}) {
  return dispatchNotification({
    title: 'Project Status Updated',
    message: `Project "${project.name}" status changed to ${project.status.toUpperCase()}.`,
    type: 'project',
    actionUrl: `/member/projects/${project.id}`,
    data: { projectId: project.id, status: project.status },
    recipients: { type: 'project', projectId: project.id },
  });
}

// ------------------------------------------------------------
// 4. ATTENDANCE & CHECK-IN NOTIFICATIONS
// ------------------------------------------------------------

export async function notifyCheckInSuccess(attendance: {
  memberId: string;
  checkInTime: string;
}) {
  return dispatchNotification({
    title: 'Attendance Recorded',
    message: `Check-in recorded at ${attendance.checkInTime}. Have a productive session!`,
    type: 'attendance',
    actionUrl: `/member/attendance`,
    recipients: { type: 'users', userIds: [attendance.memberId] },
  });
}

// ------------------------------------------------------------
// 5. MEETING WORKFLOW NOTIFICATIONS
// ------------------------------------------------------------

export async function notifyMeetingScheduled(meeting: {
  id: string;
  title: string;
  date: string;
  time: string;
  attendeeIds: string[];
  creatorName?: string;
}) {
  return dispatchNotification({
    title: 'New Meeting Scheduled',
    message: `${meeting.creatorName || 'A team lead'} scheduled "${meeting.title}" on ${meeting.date} at ${meeting.time}.`,
    type: 'meeting',
    actionUrl: `/member/meetings/${meeting.id}`,
    data: { meetingId: meeting.id },
    recipients: { type: 'users', userIds: meeting.attendeeIds },
  });
}

export async function notifyMeetingCancelled(meeting: {
  id: string;
  title: string;
  attendeeIds: string[];
}) {
  return dispatchNotification({
    title: 'Meeting Cancelled',
    message: `The meeting "${meeting.title}" has been cancelled.`,
    type: 'meeting',
    actionUrl: `/member/meetings`,
    data: { meetingId: meeting.id },
    recipients: { type: 'users', userIds: meeting.attendeeIds },
  });
}

// ------------------------------------------------------------
// 6. ANNOUNCEMENT & BROADCAST NOTIFICATIONS
// ------------------------------------------------------------

export async function notifyStudioAnnouncement(announcement: {
  title: string;
  message: string;
  authorName?: string;
  department?: string;
}) {
  return dispatchNotification({
    title: `Announcement: ${announcement.title}`,
    message: announcement.message,
    type: 'announcement',
    actionUrl: `/announcements`,
    recipients: { type: 'all' },
  });
}

// ------------------------------------------------------------
// 7. FILE NOTIFICATIONS
// ------------------------------------------------------------

export async function notifyFileShared(file: {
  fileName: string;
  sharedByName: string;
  recipientIds: string[];
}) {
  return dispatchNotification({
    title: 'New File Shared',
    message: `${file.sharedByName} shared "${file.fileName}" with your team.`,
    type: 'general',
    actionUrl: `/files`,
    recipients: { type: 'users', userIds: file.recipientIds },
  });
}

// ------------------------------------------------------------
// 8. WEEKLY BASH NOTIFICATIONS
// ------------------------------------------------------------

export async function notifyWeeklyBashPublished(event: {
  title: string;
  date: string;
  venue?: string;
}) {
  return dispatchNotification({
    title: `Weekly Bash: ${event.title}`,
    message: `Join the team celebration on ${event.date} ${event.venue ? `at ${event.venue}` : ''}!`,
    type: 'event',
    actionUrl: `/announcements`,
    recipients: { type: 'all' },
  });
}

// ------------------------------------------------------------
// 9. SECURITY & ACCOUNT NOTIFICATIONS
// ------------------------------------------------------------

export async function notifySecurityAlert(memberId: string, alert: {
  title: string;
  message: string;
}) {
  return dispatchNotification({
    title: alert.title,
    message: alert.message,
    type: 'general',
    actionUrl: `/settings`,
    recipients: { type: 'users', userIds: [memberId] },
  });
}
