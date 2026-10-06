import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FolderKanban,
  CheckSquare,
  Users,
  Clock,
  CheckCircle2,
  AlertCircle,
  Calendar,
  ExternalLink,
  ChevronRight,
  TrendingUp,
  FileCheck,
  Plus,
  Video,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  StatCard,
  Avatar,
  AvatarGroup,
  Badge,
  ProgressBar,
  Button,
  Modal,
  Textarea,
  LoadingState,
  EmptyState,
} from '@/components/ui';
import { useAuthStore } from '@/stores';
import {
  getManagerDashboardData,
  reviewTask,
  getUserById,
  createTask,
  getAttendance,
} from '@/services/api';
import { StreakAndPointsCard } from '@/components/dashboard/StreakAndPointsCard';
import { DashboardPunchClock } from '@/components/dashboard/DashboardPunchClock';
import { cn, formatDate, formatTime, getStatusColor, getPriorityColor } from '@/lib/utils';
import type { Project, Task, User, Meeting, AttendanceRecord } from '@/types';

export function ManagerDashboard() {
  const navigate = useNavigate();
  const { currentUser } = useAuthStore();

  const [isLoading, setIsLoading] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [teamMembers, setTeamMembers] = useState<User[]>([]);
  const [pendingSubmissions, setPendingSubmissions] = useState<{ task: Task; submission: any }[]>([]);
  const [teamAttendance, setTeamAttendance] = useState<AttendanceRecord[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);

  // Review Modal state
  const [activeReview, setActiveReview] = useState<{ task: Task; submission: any } | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);

  const [managerAttendance, setManagerAttendance] = useState<AttendanceRecord[]>([]);

  const loadData = async () => {
    if (!currentUser?.id) return;
    try {
      setIsLoading(true);
      const [data, allAttendance] = await Promise.all([
        getManagerDashboardData(currentUser.id),
        getAttendance(currentUser.id),
      ]);
      setProjects(data.managedProjects);
      setTasks(data.managerTasks);
      setTeamMembers(data.teamMembers);
      setPendingSubmissions(data.pendingSubmissions);
      setTeamAttendance(data.teamAttendance);
      setMeetings(data.meetings);
      setManagerAttendance(allAttendance);
    } catch (err) {
      console.error('Failed to load manager dashboard:', err);
      toast.error('Could not load manager metrics');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [currentUser?.id]);

  const handleReviewAction = async (action: 'approve' | 'request-changes') => {
    if (!activeReview || !currentUser?.id) return;
    try {
      setIsSubmittingReview(true);
      await reviewTask(activeReview.task.id, action, currentUser.id, reviewNotes);
      toast.success(action === 'approve' ? 'Task deliverable approved!' : 'Changes requested.');
      setActiveReview(null);
      setReviewNotes('');
      await loadData();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to submit review');
    } finally {
      setIsSubmittingReview(false);
    }
  };

  if (isLoading) {
    return <LoadingState message="Loading manager command center..." />;
  }

  const completedTasksCount = tasks.filter(t => t.status === 'completed').length;
  const sprintCompletionRate = tasks.length > 0 ? Math.round((completedTasksCount / tasks.length) * 100) : 0;
  const inProgressTasks = tasks.filter(t => t.status === 'in-progress' || t.status === 'todo');

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Welcome Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 p-8 text-white shadow-xl">
        <div className="absolute -right-10 -bottom-10 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/20 text-blue-200 border border-blue-400/30">
                Manager Workspace
              </span>
              <span className="text-xs text-indigo-200">
                Department: {currentUser?.department || 'Engineering'}
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
              Welcome back, {currentUser?.name}
            </h1>
            <p className="text-sm text-slate-300 max-w-xl">
              Track your team's sprint progress, review task deliverables, and maintain cross-module momentum.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              className="text-white border-white/20 hover:bg-white/10"
              onClick={() => navigate('/manager/projects')}
            >
              All Projects
            </Button>
            <Button
              className="bg-white text-indigo-950 hover:bg-white/90 shadow-md font-semibold"
              onClick={() => navigate('/manager/tasks')}
            >
              <Plus className="w-4 h-4 mr-1.5" />
              Manage Tasks
            </Button>
          </div>
        </div>
      </div>

      {/* Top Punch Clock Bar for User-Friendly Attendance Check-In / Check-Out */}
      <DashboardPunchClock
        attendanceRecords={managerAttendance}
        onAttendanceChanged={loadData}
      />

      {/* KPI Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Managed Projects"
          value={projects.length}
          icon={FolderKanban}
          iconColor="text-indigo-500"
        />
        <StatCard
          label="Team Members"
          value={teamMembers.length}
          icon={Users}
          iconColor="text-blue-500"
        />
        <StatCard
          label="Pending Reviews"
          value={pendingSubmissions.length}
          icon={FileCheck}
          iconColor="text-amber-500"
        />
        <StatCard
          label="Sprint Progress"
          value={`${sprintCompletionRate}%`}
          icon={TrendingUp}
          iconColor="text-emerald-500"
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Projects & Submissions (2 cols) */}
        <div className="lg:col-span-2 space-y-8">
          {/* Pending Submissions / Deliverables Review Queue */}
          <div className="card p-6 space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold">Deliverables Queue</h2>
                <p className="text-xs text-[var(--color-muted-foreground)]">
                  Submissions awaiting manager review and sign-off
                </p>
              </div>
              <Badge variant={pendingSubmissions.length > 0 ? 'warning' : 'outline'}>
                {pendingSubmissions.length} Pending
              </Badge>
            </div>

            {pendingSubmissions.length === 0 ? (
              <div className="py-8 text-center text-sm text-[var(--color-muted-foreground)]">
                <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2 opacity-80" />
                No pending deliverables. Great job keeping the review queue empty!
              </div>
            ) : (
              <div className="divide-y divide-[var(--color-border)]">
                {pendingSubmissions.map(({ task, submission }) => {
                  const submitter = getUserById(task.assigneeId);
                  return (
                    <div key={task.id} className="py-4 first:pt-0 last:pb-0 flex items-center justify-between gap-4">
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium truncate">{task.title}</span>
                          <span className={cn('badge text-[10px]', getPriorityColor(task.priority))}>
                            {task.priority}
                          </span>
                        </div>
                        <p className="text-xs text-[var(--color-muted-foreground)] truncate">
                          Submitted by {submitter?.name || 'Team Member'} • {submission?.description || 'Work completed'}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => {
                          setActiveReview({ task, submission });
                          setReviewNotes('');
                        }}
                      >
                        Review
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Daily Streaks & Points */}
          <StreakAndPointsCard
            userId={currentUser?.id || ''}
            attendanceRecords={managerAttendance}
            onAttendanceUpdated={loadData}
          />

          {/* Managed Projects Overview */}
          <div className="card p-6 space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold">My Managed Projects</h2>
                <p className="text-xs text-[var(--color-muted-foreground)]">
                  Projects where you are assigned as the engineering lead
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={() => navigate('/manager/projects')}>
                View All
              </Button>
            </div>

            {projects.length === 0 ? (
              <EmptyState
                icon={FolderKanban}
                title="No active projects"
                description="You are not currently assigned as manager to any active projects."
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {projects.map((proj, idx) => {
                  const projectMembers = proj.memberIds
                    .map(id => getUserById(id))
                    .filter((u): u is User => Boolean(u));

                  return (
                    <div
                      key={`${proj.id}-${idx}`}
                      onClick={() => navigate(`/manager/projects/${proj.id}`)}
                      className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] hover:border-[var(--color-primary)] transition-all cursor-pointer space-y-3 group"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="font-semibold text-sm group-hover:text-[var(--color-primary)] transition-colors truncate">
                            {proj.name}
                          </h3>
                          <p className="text-xs text-[var(--color-muted-foreground)] line-clamp-1">
                            {proj.description || 'Enterprise project module'}
                          </p>
                        </div>
                        <span className={cn('badge text-[10px] shrink-0', getStatusColor(proj.status))}>
                          {proj.status}
                        </span>
                      </div>

                      <div className="space-y-1.5">
                        <div className="flex justify-between text-xs">
                          <span className="text-[var(--color-muted-foreground)]">Progress</span>
                          <span className="font-semibold">{proj.progress}%</span>
                        </div>
                        <ProgressBar value={proj.progress} size="sm" />
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-[var(--color-border)] text-xs text-[var(--color-muted-foreground)]">
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5" />
                          <span>Due {formatDate(proj.deadline)}</span>
                        </div>
                        <AvatarGroup names={projectMembers.map(m => m.name)} max={3} size="xs" />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Team & Attendance (1 col) */}
        <div className="space-y-8">
          {/* Team Members */}
          <div className="card p-6 space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">Assigned Team</h2>
              <span className="text-xs text-[var(--color-muted-foreground)]">
                {teamMembers.length} Members
              </span>
            </div>

            {teamMembers.length === 0 ? (
              <p className="text-xs text-[var(--color-muted-foreground)]">No team members assigned yet.</p>
            ) : (
              <div className="divide-y divide-[var(--color-border)]">
                {teamMembers.map((member) => {
                  const memberTasksCount = tasks.filter(t => t.assigneeId === member.id && t.status !== 'completed').length;
                  return (
                    <div key={member.id} className="py-3 first:pt-0 last:pb-0 flex items-center justify-between">
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar name={member.name} size="sm" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{member.name}</p>
                          <p className="text-xs text-[var(--color-muted-foreground)] truncate">
                            {member.designation}
                          </p>
                        </div>
                      </div>
                      <Badge variant="outline" className="text-[10px] shrink-0">
                        {memberTasksCount} Active
                      </Badge>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Today's Team Attendance */}
          <div className="card p-6 space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">Team Attendance Today</h2>
              <Badge variant="success">{teamAttendance.length} Checked In</Badge>
            </div>

            {teamAttendance.length === 0 ? (
              <p className="text-xs text-[var(--color-muted-foreground)]">
                No team check-ins recorded today yet.
              </p>
            ) : (
              <div className="space-y-3">
                {teamAttendance.map((rec) => {
                  const u = getUserById(rec.userId);
                  return (
                    <div key={rec.id} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <Avatar name={u?.name || 'Member'} size="sm" />
                        <span className="font-medium truncate">{u?.name || 'Member'}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[var(--color-muted-foreground)]">{rec.checkIn || 'Present'}</span>
                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Upcoming Team Meetings */}
          <div className="card p-6 space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">Upcoming Meetings</h2>
              <Button size="sm" variant="ghost" onClick={() => navigate('/manager/meetings')}>
                <Calendar className="w-4 h-4" />
              </Button>
            </div>

            {meetings.length === 0 ? (
              <p className="text-xs text-[var(--color-muted-foreground)]">No scheduled meetings today.</p>
            ) : (
              <div className="space-y-3">
                {meetings.slice(0, 3).map((m) => (
                  <div 
                    key={m.id} 
                    onClick={() => navigate(`/manager/meetings/${m.id}`)}
                    className="p-3.5 rounded-xl border border-[var(--color-border)] hover:border-indigo-500/50 hover:bg-[var(--color-muted)]/40 hover:shadow-sm transition-all cursor-pointer group space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                        {m.title}
                      </p>
                      <Badge className="text-[10px] uppercase font-bold tracking-wider py-0 px-1.5 shrink-0 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                        {m.type}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-[var(--color-muted-foreground)]">
                      <Clock className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                      <span>{formatDate(m.date)} • {formatTime(m.startTime)}</span>
                    </div>
                    {m.participantIds && m.participantIds.length > 0 && (
                      <div className="flex items-center justify-between pt-1">
                        <AvatarGroup
                          names={m.participantIds.slice(0, 4).map(id => getUserById(id)?.name || '').filter(Boolean)}
                          max={3}
                        />
                        <span className="text-[11px] text-[var(--color-muted-foreground)]">
                          {m.participantIds.length} participants
                        </span>
                      </div>
                    )}
                    {(() => {
                      const isLive = m.status === 'live' || m.status === 'in-progress';
                      const link = (m.meetingLink || '').trim();
                      const isExternal = link.startsWith('http://') || link.startsWith('https://');
                      const roomId = m.meetingRoomId || (link.includes('/meeting/') ? link.split('/meeting/')[1] : m.id);

                      return (
                        <Button 
                          variant={isLive ? "primary" : "outline"} 
                          size="sm" 
                          className={cn(
                            "w-full mt-2 text-xs h-7 font-semibold",
                            isLive && "bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/20"
                          )}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (isExternal) {
                              window.open(link, '_blank', 'noopener,noreferrer');
                            } else {
                              navigate(`/meeting/${roomId}`);
                            }
                          }}
                        >
                          <Video className="w-3.5 h-3.5 mr-1" />
                          {isLive ? 'Join Now (Live)' : link.includes('meet.google.com') ? 'Join Google Meet' : 'Join Meeting'}
                        </Button>
                      );
                    })()}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Deliverable Review Modal */}
      {activeReview && (
        <Modal
          isOpen={Boolean(activeReview)}
          onClose={() => setActiveReview(null)}
          title={`Review: ${activeReview.task.title}`}
          footer={
            <div className="flex items-center justify-end gap-3 w-full">
              <Button
                variant="outline"
                onClick={() => handleReviewAction('request-changes')}
                isLoading={isSubmittingReview}
              >
                Request Changes
              </Button>
              <Button
                variant="primary"
                onClick={() => handleReviewAction('approve')}
                isLoading={isSubmittingReview}
              >
                Approve & Mark Complete
              </Button>
            </div>
          }
        >
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-[var(--color-muted-foreground)]">
                Submission Description
              </label>
              <p className="text-sm p-3 bg-[var(--color-muted)] rounded-lg mt-1">
                {activeReview.submission?.description || 'No description provided.'}
              </p>
            </div>

            {activeReview.submission?.attachments?.length > 0 && (
              <div>
                <label className="text-xs font-medium text-[var(--color-muted-foreground)]">
                  Attachments / Deliverables
                </label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {activeReview.submission.attachments.map((att: string, i: number) => (
                    <span key={i} className="badge badge-secondary text-xs flex items-center gap-1">
                      <ExternalLink className="w-3 h-3" />
                      {att}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <Textarea
              label="Manager Review Notes / Feedback"
              placeholder="Add feedback or change instructions for the team member..."
              value={reviewNotes}
              onChange={(e) => setReviewNotes(e.target.value)}
              rows={3}
            />
          </div>
        </Modal>
      )}
    </div>
  );
}
