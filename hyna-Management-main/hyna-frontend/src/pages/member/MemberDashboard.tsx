import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CheckSquare, Clock, CheckCircle2, Send, Video, ArrowRight,
  Check, Edit3, Calendar, Hand, PartyPopper
} from 'lucide-react';
import { StatCard, AvatarGroup, Badge, Button, Textarea, LoadingState } from '@/components/ui';
import { cn, getGreeting, formatDate, formatTime, getStatusColor, getPriorityColor } from '@/lib/utils';
import { useAuthStore } from '@/stores';
import {
  getUserTasks, getUserMeetings, getUserAttendance,
  submitDailyReport, checkIn, checkOut, getUserById, getUsers,
} from '@/services/api';
import { StreakAndPointsCard } from '@/components/dashboard/StreakAndPointsCard';
import { DashboardPunchClock } from '@/components/dashboard/DashboardPunchClock';
import {
  getPunchInStatus,
  getPunchOutStatus,
  calculateRecordPoints,
} from '@/lib/attendanceRules';
import { toast } from 'sonner';
import type { Task, Meeting, AttendanceRecord } from '@/types';

export function MemberDashboard() {
  const { currentUser } = useAuthStore();
  const navigate = useNavigate();
  const [dailyReport, setDailyReport] = useState('');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [isCheckedIn, setIsCheckedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const [currentTime, setCurrentTime] = useState(new Date());

  const userId = currentUser?.id || '';
  const todayStr = new Date().toISOString().split('T')[0];

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const loadData = async () => {
    if (!userId) return;
    try {
      await getUsers();
      const [t, m, a] = await Promise.all([
        getUserTasks(userId),
        getUserMeetings(userId),
        getUserAttendance(userId),
      ]);
      setTasks(t);
      setMeetings(m);
      setAttendance(a);
      const todayRecord = a.find(record => record.date === todayStr);
      if (todayRecord && todayRecord.checkIn && !todayRecord.checkOut) {
        setIsCheckedIn(true);
      } else {
        setIsCheckedIn(false);
      }
    } catch (err) {
      console.error('Error loading member dashboard data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [userId, todayStr]);

  const completedTasks = tasks.filter(t => t.status === 'completed');
  const inReviewTasks = tasks.filter(t => t.status === 'in-review');
  const todayTasks = tasks.filter(t => t.status !== 'completed' && t.status !== 'backlog');
  const todayAttendance = attendance.find(a => a.date === todayStr);

  const upcomingMeetings = meetings
    .filter(m => m.status === 'scheduled')
    .sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`))
    .slice(0, 2);

  const handleSubmitReport = async () => {
    if (!dailyReport.trim()) {
      toast.error('Please write your daily report before submitting.');
      return;
    }
    try {
      await submitDailyReport({
        userId,
        date: todayStr,
        content: dailyReport,
        hoursWorked: 8,
      });
      toast.success('Daily report submitted successfully!');
      setDailyReport('');
    } catch (err) {
      toast.error('Failed to submit report');
    }
  };

  const punchInStatus = getPunchInStatus(currentTime);
  const punchOutStatus = getPunchOutStatus(currentTime, todayAttendance?.checkIn);
  const todayPointEval = todayAttendance ? calculateRecordPoints(todayAttendance, currentTime) : null;

  const handleCheckIn = async () => {
    const status = getPunchInStatus(currentTime);
    if (!status.canPunchIn) {
      toast.error(status.tooltip);
      return;
    }
    try {
      const record = await checkIn(userId, currentTime);
      setAttendance(prev => [record, ...prev.filter(a => a.date !== todayStr)]);
      setIsCheckedIn(true);
      toast.success(
        status.phase === 'on_time'
          ? `Checked in on-time at ${record.checkIn}! +10 Points earned! 🎯`
          : `Checked in during grace window at ${record.checkIn}! +5 Points earned! ⏱️`
      );
    } catch (err: any) {
      toast.error(err?.message || 'Check in failed');
    }
  };

  const handleCheckOut = async () => {
    const status = getPunchOutStatus(currentTime, todayAttendance?.checkIn);
    if (!status.canPunchOut) {
      toast.error(status.tooltip);
      return;
    }
    try {
      const record = await checkOut(userId, currentTime);
      setAttendance(prev => [record, ...prev.filter(a => a.date !== todayStr)]);
      setIsCheckedIn(false);
      toast.success(`Checked out successfully at ${record.checkOut}! Full points preserved.`);
    } catch (err: any) {
      toast.error(err?.message || 'Check out failed');
    }
  };

  if (isLoading) return <LoadingState />;

  return (
    <div className="page-container">
      {/* Header */}
      <div className="page-header">
        <h1 className="page-title flex items-center gap-2">
          {getGreeting()}, {currentUser?.name?.split(' ')[0] || 'Team Member'}
          <Hand className="w-6 h-6 text-yellow-500" />
        </h1>
        <p className="page-description">Here's your work overview for today.</p>
      </div>

      {/* Top Punch Clock Bar for User-Friendly Attendance Check-In / Check-Out */}
      <DashboardPunchClock
        todayRecord={todayAttendance}
        attendanceRecords={attendance}
        onAttendanceChanged={loadData}
      />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="My Tasks" value={tasks.length} change={5} icon={CheckSquare} iconColor="text-blue-500" />
        <StatCard label="Completed" value={completedTasks.length} change={15} icon={CheckCircle2} iconColor="text-emerald-500" className="stagger-1" />
        <StatCard label="In Review" value={inReviewTasks.length} icon={Send} iconColor="text-violet-500" className="stagger-2" />
        <StatCard label="Working Hours" value={todayAttendance?.workingHours || '0h 0m'} icon={Clock} iconColor="text-amber-500" className="stagger-3" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Daily Streaks & Attendance Points */}
          <StreakAndPointsCard
            userId={userId}
            attendanceRecords={attendance}
            onAttendanceUpdated={loadData}
          />

          {/* Today's tasks */}
          <div className="card p-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold">Today's Tasks</h2>
              <Button variant="ghost" size="sm" onClick={() => navigate('/member/tasks')}>
                View all <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </div>
            <div className="space-y-1">
              {todayTasks.length === 0 ? (
                <p className="text-sm text-[var(--color-muted-foreground)] py-4 flex items-center justify-center gap-2">
                  No tasks for today <PartyPopper className="w-4 h-4 text-emerald-500" />
                </p>
              ) : (
                todayTasks.map((task) => (
                  <div
                    key={task.id}
                    className="flex items-center gap-3 p-3 rounded-lg hover:bg-[var(--color-muted)] transition-colors cursor-pointer group"
                    onClick={() => navigate('/member/tasks')}
                  >
                    <div className={cn(
                      'w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors',
                      task.status === 'completed' ? 'border-emerald-500 bg-emerald-500' : 'border-[var(--color-border)] group-hover:border-[var(--color-primary)]',
                    )}>
                      {task.status === 'completed' && <Check className="w-3 h-3 text-white" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={cn(
                        'text-sm font-medium truncate',
                        task.status === 'completed' && 'line-through text-[var(--color-muted-foreground)]',
                      )}>
                        {task.title}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Badge className={getPriorityColor(task.priority)}>{task.priority}</Badge>
                        {task.deadline && (
                          <span className="text-xs text-[var(--color-muted-foreground)]">
                            Due {formatDate(task.deadline)}
                          </span>
                        )}
                      </div>
                    </div>
                    <Badge className={getStatusColor(task.status)}>
                      {task.status.replace('-', ' ')}
                    </Badge>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Daily work report */}
          <div className="card p-6 animate-in fade-in slide-in-from-bottom-4 duration-500 stagger-1">
            <div className="flex items-center gap-2 mb-4">
              <Edit3 className="w-4 h-4 text-[var(--color-primary)]" />
              <h2 className="text-base font-semibold">Today's Work Report</h2>
            </div>
            <Textarea
              placeholder="What did you work on today? Describe your achievements, challenges, and tomorrow's plan..."
              value={dailyReport}
              onChange={(e) => setDailyReport(e.target.value)}
              rows={4}
              className="mb-3"
            />
            <div className="flex justify-end">
              <Button onClick={handleSubmitReport}>
                <Send className="w-3.5 h-3.5 mr-1" /> Submit Report
              </Button>
            </div>
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          {/* Daily check-in */}
          <div className="card p-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h2 className="text-base font-semibold mb-4">Today's Attendance</h2>
            <div className="text-center py-4">
              {isCheckedIn ? (
                <>
                  <div className="w-16 h-16 rounded-full bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center mx-auto mb-3">
                    <CheckCircle2 className="w-8 h-8 text-emerald-500 animate-pulse" />
                  </div>
                  <p className="text-lg font-bold text-[var(--color-foreground)]">{todayAttendance?.checkIn}</p>
                  <div className="flex items-center justify-center gap-1.5 mt-0.5">
                    <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                      Active Shift • {todayPointEval ? `${todayPointEval.finalPoints} Pts` : '10 Pts'}
                    </span>
                    {todayPointEval?.penaltyApplied && (
                      <span className="text-[10px] px-1 rounded bg-red-500/15 text-red-600">Penalty</span>
                    )}
                  </div>
                  <div className="flex items-center justify-center gap-2 mt-3 text-sm">
                    <Clock className="w-4 h-4 text-[var(--color-muted-foreground)]" />
                    <span className="font-medium text-xs">Tracking active work hours</span>
                  </div>
                  <div className="mt-4 flex flex-col items-center gap-1.5 w-full">
                    <Button
                      variant={punchOutStatus.canPunchOut ? 'destructive' : 'outline'}
                      className={cn(
                        'w-full font-semibold',
                        !punchOutStatus.canPunchOut && 'opacity-60 cursor-not-allowed border-dashed'
                      )}
                      disabled={!punchOutStatus.canPunchOut}
                      onClick={handleCheckOut}
                      title={punchOutStatus.tooltip}
                    >
                      {punchOutStatus.canPunchOut ? 'Check Out (Keep Points)' : punchOutStatus.label}
                    </Button>
                    <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full border', punchOutStatus.badgeColor)}>
                      {punchOutStatus.badgeText}
                    </span>
                  </div>
                </>
              ) : todayAttendance?.checkOut ? (
                <>
                  <div className="w-16 h-16 rounded-full bg-blue-50 dark:bg-blue-950/30 flex items-center justify-center mx-auto mb-3">
                    <CheckCircle2 className="w-8 h-8 text-blue-500" />
                  </div>
                  <p className="text-base font-bold text-[var(--color-foreground)]">Shift Completed</p>
                  <p className="text-xs text-[var(--color-muted-foreground)] mt-1">
                    {todayAttendance.checkIn} — {todayAttendance.checkOut}
                  </p>
                  <div className="flex items-center justify-center gap-2 mt-3 text-sm">
                    <Clock className="w-4 h-4 text-blue-500" />
                    <span className="font-semibold text-xs text-[var(--color-foreground)]">
                      Total: {todayAttendance.workingHours || 'Logged'} • {todayPointEval?.finalPoints || 10} Pts
                    </span>
                  </div>
                  <Button variant="ghost" size="sm" className="mt-3 w-full text-xs text-[var(--color-primary)]" onClick={() => navigate('/member/attendance')}>
                    View Attendance History
                  </Button>
                </>
              ) : (
                <>
                  <div className="w-16 h-16 rounded-full bg-[var(--color-muted)] flex items-center justify-center mx-auto mb-3">
                    <Clock className="w-8 h-8 text-[var(--color-muted-foreground)]" />
                  </div>
                  <p className="text-sm font-medium text-[var(--color-muted-foreground)]">You haven't checked in yet today</p>
                  <div className="mt-4 flex flex-col items-center gap-1.5 w-full">
                    <Button
                      className={cn(
                        'w-full font-semibold',
                        punchInStatus.canPunchIn
                          ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                          : 'opacity-50 cursor-not-allowed bg-muted text-muted-foreground hover:bg-muted'
                      )}
                      disabled={!punchInStatus.canPunchIn}
                      onClick={handleCheckIn}
                      title={punchInStatus.tooltip}
                    >
                      {punchInStatus.canPunchIn ? punchInStatus.label : punchInStatus.label}
                    </Button>
                    <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full border', punchInStatus.badgeColor)}>
                      {punchInStatus.badgeText}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Upcoming meetings */}
          <div className="card p-6 animate-in fade-in slide-in-from-bottom-4 duration-500 stagger-1">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold">Upcoming Meetings</h2>
              <Button variant="ghost" size="sm" onClick={() => navigate('/member/meetings')}>
                View all
              </Button>
            </div>
            <div className="space-y-3">
              {upcomingMeetings.length === 0 ? (
                <p className="text-sm text-[var(--color-muted-foreground)] text-center py-4">No upcoming meetings</p>
              ) : (
                upcomingMeetings.map(meeting => (
                  <div 
                    key={meeting.id} 
                    onClick={() => navigate(`/member/meetings/${meeting.id}`)}
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
                        names={meeting.participantIds.slice(0, 4).map(id => getUserById(id)?.name || '').filter(Boolean)}
                        max={3}
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
                ))
              )}
            </div>
          </div>

          {/* My activity summary */}
          <div className="card p-6 animate-in fade-in slide-in-from-bottom-4 duration-500 stagger-2">
            <h2 className="text-base font-semibold mb-4">Activity Summary</h2>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-[var(--color-muted-foreground)]">Tasks completed</span>
                <span className="text-sm font-semibold">{completedTasks.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-[var(--color-muted-foreground)]">Tasks in review</span>
                <span className="text-sm font-semibold">{inReviewTasks.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-[var(--color-muted-foreground)]">Total assigned</span>
                <span className="text-sm font-semibold">{tasks.length}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
