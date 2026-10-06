import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users, FolderKanban, CheckSquare, CalendarClock, Clock, Video,
  ArrowRight, Eye, Hand,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';
import { StatCard, Avatar, AvatarGroup, Badge, ProgressBar, Button, LoadingState } from '@/components/ui';
import { cn, getGreeting, formatDate, formatTime, getStatusColor } from '@/lib/utils';
import { useAuthStore, isExecutiveLeadership } from '@/stores';
import {
  getProjects, getTasks, getMeetings, getUsers, getAttendance, getUserById,
} from '@/services/api';
import { StreakAndPointsCard } from '@/components/dashboard/StreakAndPointsCard';
import { DashboardPunchClock } from '@/components/dashboard/DashboardPunchClock';
import type { Project, Task, Meeting, User, AttendanceRecord } from '@/types';

const weeklyTaskData = [
  { day: 'Mon', completed: 8, created: 5 },
  { day: 'Tue', completed: 12, created: 7 },
  { day: 'Wed', completed: 6, created: 10 },
  { day: 'Thu', completed: 15, created: 8 },
  { day: 'Fri', completed: 10, created: 4 },
];

export function AdminDashboard() {
  const { currentUser, activeOrganization } = useAuthStore();
  const navigate = useNavigate();

  const [isLoading, setIsLoading] = useState(true);
  const [users, setUsers] = useState<User[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);

  const loadDashboardData = async () => {
    try {
      const [u, p, t, m, a] = await Promise.all([
        getUsers(),
        getProjects(),
        getTasks(),
        getMeetings(),
        getAttendance(),
      ]);
      setUsers(u);
      setProjects(p);
      setTasks(t);
      setMeetings(m);
      setAttendance(a);
    } catch (err) {
      console.error('Error loading dashboard data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, []);

  if (isLoading) return <LoadingState />;

  const todayStr = new Date().toISOString().split('T')[0];
  const todayAttendance = attendance.filter(a => a.date === todayStr);
  const presentCount = todayAttendance.filter(a => a.status === 'present' || a.status === 'late').length;
  const lateCount = todayAttendance.filter(a => a.status === 'late').length;
  const absentCount = todayAttendance.filter(a => a.status === 'absent').length;
  const leaveCount = todayAttendance.filter(a => a.status === 'leave').length;

  const pendingTasks = tasks.filter(t => t.status !== 'completed' && t.status !== 'backlog').length;
  const activeProjects = projects.filter(p => p.status === 'active').length;

  const upcomingMeetings = meetings
    .filter(m => m.status === 'scheduled')
    .sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`))
    .slice(0, 3);

  const pendingReviews = tasks.filter(t => t.status === 'in-review' && t.submission?.reviewStatus === 'pending');

  const taskStatusData = [
    { name: 'Completed', value: tasks.filter(t => t.status === 'completed').length || 1, color: '#10b981' },
    { name: 'In Progress', value: tasks.filter(t => t.status === 'in-progress').length || 1, color: '#2041F0' },
    { name: 'In Review', value: tasks.filter(t => t.status === 'in-review').length || 1, color: '#D5DAFD' },
    { name: 'Blocked', value: tasks.filter(t => t.status === 'blocked').length || 1, color: '#FF0000' },
    { name: 'Todo', value: tasks.filter(t => t.status === 'todo').length || 1, color: '#7B8DF8' },
    { name: 'Backlog', value: tasks.filter(t => t.status === 'backlog').length || 1, color: '#ABABAB' },
  ];

  return (
    <div className="page-container">
      {/* Header */}
      <div className="page-header">
        <h1 className="page-title flex items-center gap-2">
          {getGreeting()}, {currentUser?.name?.split(' ')[0] || 'Team Lead'} 
          <Hand className="w-6 h-6 text-yellow-500" />
        </h1>
        <p className="page-description">Here's what's happening at {activeOrganization} today.</p>
      </div>

      {/* Top Punch Clock Bar for User-Friendly Attendance Check-In / Check-Out */}
      <DashboardPunchClock
        attendanceRecords={attendance}
        onAttendanceChanged={loadDashboardData}
      />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Total Members" value={users.filter(u => u.status === 'active').length} change={8} icon={Users} iconColor="text-blue-500" />
        <StatCard label="Active Projects" value={activeProjects} change={12} icon={FolderKanban} iconColor="text-violet-500" className="stagger-1" />
        <StatCard label="Pending Tasks" value={pendingTasks} change={-5} icon={CheckSquare} iconColor="text-amber-500" className="stagger-2" />
        <StatCard label="Today's Attendance" value={`${presentCount}/${users.filter(u => u.status === 'active').length || 1}`} change={2} icon={CalendarClock} iconColor="text-emerald-500" className="stagger-3" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left column */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          {/* Daily Streaks & Attendance Points (Above Project Overview) */}
          <StreakAndPointsCard
            userId={currentUser?.id || ''}
            attendanceRecords={attendance}
            onAttendanceUpdated={loadDashboardData}
          />

          {/* Project overview */}
          <div className="card p-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold">Project Overview</h2>
              <Button variant="ghost" size="sm" onClick={() => navigate('/admin/projects')}>
                View all <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </div>
            <div className="space-y-4">
              {projects.filter(p => p.status === 'active').map((project, idx) => (
                <div
                  key={`${project.id}-${idx}`}
                  className="flex items-center gap-4 p-3 rounded-lg hover:bg-[var(--color-muted)] transition-colors cursor-pointer group"
                  onClick={() => navigate(`/admin/projects/${project.id}`)}
                >
                  <div
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: project.color }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">{project.name}</p>
                      <Badge className={getStatusColor(project.status)}>
                        {project.status}
                      </Badge>
                    </div>
                    <ProgressBar value={project.progress} showLabel className="mt-2" />
                  </div>
                  <AvatarGroup
                    names={project.memberIds.map(id => getUserById(id)?.name || '').filter(Boolean)}
                    max={3}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Task & Activity charts */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Weekly task chart */}
            <div className="card p-6 animate-in fade-in slide-in-from-bottom-4 duration-500 stagger-1">
              <h2 className="text-base font-semibold mb-4">Weekly Tasks</h2>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={weeklyTaskData} barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 12, fill: 'var(--color-muted-foreground)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 12, fill: 'var(--color-muted-foreground)' }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--color-card)',
                      border: '1px solid var(--color-border)',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                  />
                  <Bar dataKey="completed" fill="#2041F0" radius={[4, 4, 0, 0]} maxBarSize={24} />
                  <Bar dataKey="created" fill="#7B8DF8" radius={[4, 4, 0, 0]} maxBarSize={24} />
                </BarChart>
              </ResponsiveContainer>
              <div className="flex items-center gap-4 mt-3 justify-center">
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-sm bg-[#2041F0]" />
                  <span className="text-xs text-[var(--color-muted-foreground)]">Completed</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-sm bg-[#7B8DF8]" />
                  <span className="text-xs text-[var(--color-muted-foreground)]">Created</span>
                </div>
              </div>
            </div>

            {/* Task status pie */}
            <div className="card p-6 animate-in fade-in slide-in-from-bottom-4 duration-500 stagger-2">
              <h2 className="text-base font-semibold mb-4">Task Overview</h2>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={taskStatusData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {taskStatusData.map((entry, idx) => (
                      <Cell key={idx} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--color-card)',
                      border: '1px solid var(--color-border)',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-x-4 gap-y-1 justify-center mt-2">
                {taskStatusData.map(item => (
                  <div key={item.name} className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                    <span className="text-[11px] text-[var(--color-muted-foreground)]">{item.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Pending reviews */}
          {pendingReviews.length > 0 && (
            <div className="card p-6 animate-in fade-in slide-in-from-bottom-4 duration-500 stagger-3">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold">Pending Reviews</h2>
                <span className="text-xs text-[var(--color-muted-foreground)]">{pendingReviews.length} tasks</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[var(--color-muted-foreground)]">
                      <th className="pb-3 font-medium">Task</th>
                      <th className="pb-3 font-medium hidden sm:table-cell">Member</th>
                      <th className="pb-3 font-medium hidden md:table-cell">Project</th>
                      <th className="pb-3 font-medium">Submitted</th>
                      <th className="pb-3 font-medium text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border)]">
                    {pendingReviews.map(task => {
                      const member = getUserById(task.assigneeId);
                      const project = projects.find(p => p.id === task.projectId);
                      return (
                        <tr key={task.id} className="hover:bg-[var(--color-muted)] transition-colors">
                          <td className="py-3 pr-4">
                            <p className="font-medium truncate max-w-[200px]">{task.title}</p>
                          </td>
                          <td className="py-3 pr-4 hidden sm:table-cell">
                            <div className="flex items-center gap-2">
                              <Avatar name={member?.name || ''} size="xs" />
                              <span className="truncate">{member?.name}</span>
                            </div>
                          </td>
                          <td className="py-3 pr-4 hidden md:table-cell text-[var(--color-muted-foreground)]">{project?.name}</td>
                          <td className="py-3 pr-4 text-[var(--color-muted-foreground)]">{task.submission ? formatDate(task.submission.submittedAt) : '-'}</td>
                          <td className="py-3 text-right">
                            <Button variant="outline" size="sm" onClick={() => navigate('/admin/tasks')}>
                              <Eye className="w-3.5 h-3.5 mr-1" /> Review
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Recent members - Only visible to CEO, CTO, COO */}
          {isExecutiveLeadership(currentUser) && (
            <div className="card p-6 animate-in fade-in slide-in-from-bottom-4 duration-500 stagger-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold">Team Members</h2>
                <Button variant="ghost" size="sm" onClick={() => navigate('/admin/members')}>
                  View all
                </Button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {users.slice(0, 6).map(user => (
                  <div
                    key={user.id}
                    className="flex items-center gap-3 p-3 rounded-lg border border-[var(--color-border)] hover:bg-[var(--color-muted)] transition-colors cursor-pointer"
                    onClick={() => navigate(`/admin/members/${user.id}`)}
                  >
                    <Avatar name={user.name} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{user.name}</p>
                      <p className="text-xs text-[var(--color-muted-foreground)] truncate">{user.designation}</p>
                    </div>
                    <div className={cn(
                      'w-2 h-2 rounded-full shrink-0',
                      user.status === 'active' ? 'bg-emerald-500' : 'bg-zinc-300',
                    )} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-6 lg:col-span-1 sticky top-6">
          {/* Today's attendance */}
          <div className="card p-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h2 className="text-base font-semibold mb-4">Today's Attendance</h2>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Present', value: presentCount, color: 'text-emerald-500', bg: 'bg-[#10b981]/10' },
                { label: 'Late', value: lateCount, color: 'text-amber-500', bg: 'bg-[#f59e0b]/10' },
                { label: 'Absent', value: absentCount, color: 'text-[#FF0000]', bg: 'bg-[#FF0000]/10' },
                { label: 'On Leave', value: leaveCount, color: 'text-[#7B8DF8]', bg: 'bg-[#7B8DF8]/10' },
              ].map(item => (
                <div key={item.label} className={cn('rounded-xl p-3 text-center', item.bg)}>
                  <p className={cn('text-2xl font-semibold', item.color)}>{item.value}</p>
                  <p className="text-xs text-[var(--color-muted-foreground)] mt-0.5">{item.label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Upcoming meetings */}
          <div className="card p-6 animate-in fade-in slide-in-from-bottom-4 duration-500 stagger-1">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold">Upcoming Meetings</h2>
              <Button variant="ghost" size="sm" onClick={() => navigate('/admin/meetings')}>
                View all
              </Button>
            </div>
            <div className="space-y-3">
              {upcomingMeetings.map(meeting => (
                <div 
                  key={meeting.id} 
                  onClick={() => navigate(`/admin/meetings/${meeting.id}`)}
                  className="p-3.5 rounded-xl border border-[var(--color-border)] hover:border-indigo-500/50 hover:bg-[var(--color-muted)]/40 hover:shadow-sm transition-all cursor-pointer group"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                      {meeting.title}
                    </p>
                    <Badge className="text-[10px] uppercase font-bold tracking-wider py-0 px-1.5 shrink-0 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                      {meeting.type}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 mt-1.5 text-xs text-[var(--color-muted-foreground)]">
                    <Clock className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                    <span>{formatDate(meeting.date)} • {formatTime(meeting.startTime)}</span>
                  </div>
                  <div className="flex items-center justify-between mt-3">
                    <AvatarGroup
                      names={meeting.participantIds.slice(0, 6).map(id => getUserById(id)?.name || '').filter(Boolean)}
                      max={4}
                    />
                    <span className="text-xs text-[var(--color-muted-foreground)]">
                      {meeting.participantIds.length} participants
                    </span>
                  </div>
                  {(() => {
                    const isLive = meeting.status === 'live' || meeting.status === 'in-progress';
                    const link = (meeting.meetingLink || '').trim();
                    const isExternal = link.startsWith('http://') || link.startsWith('https://');
                    const roomId = meeting.meetingRoomId || (link.includes('/meeting/') ? link.split('/meeting/')[1] : meeting.id);

                    return (
                      <Button 
                        variant={isLive ? "primary" : "outline"} 
                        size="sm" 
                        className={cn(
                          "w-full mt-3 text-xs font-semibold",
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
          </div>

        </div>
      </div>
    </div>
  );
}
