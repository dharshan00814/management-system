import { useState, useEffect } from 'react';
import {
  Clock,
  Calendar,
  CheckCircle2,
  LogIn,
  LogOut,
  Search,
  ChevronLeft,
  ChevronRight,
  Users,
  Timer,
  Sparkles,
  ArrowUpRight,
  ShieldCheck,
  Download,
} from 'lucide-react';
import { Avatar, Badge, Button, LoadingState } from '@/components/ui';
import { getStatusColor, formatDate, cn } from '@/lib/utils';
import { useAuthStore } from '@/stores';
import { getUsers, getAttendance, getUserById, checkIn, checkOut, resetTodayAttendance } from '@/services/api';
import { toast } from 'sonner';
import type { AttendanceRecord } from '@/types';
import { StreakAndPointsCard } from '@/components/dashboard/StreakAndPointsCard';
import {
  getPunchInStatus,
  getPunchOutStatus,
  calculateRecordPoints,
  calculateUserStreakAndPoints,
} from '@/lib/attendanceRules';

function getElapsedDuration(checkInStr?: string): string {
  if (!checkInStr) return '00:00:00';
  const cleaned = checkInStr.trim();
  const isPM = /pm/i.test(cleaned);
  const isAM = /am/i.test(cleaned);
  const digits = cleaned.replace(/[^0-9:]/g, '');
  const [hRaw, mRaw] = digits.split(':');
  let h = parseInt(hRaw || '0', 10);
  const m = parseInt(mRaw || '0', 10);
  if (isPM && h < 12) h += 12;
  if (isAM && h === 12) h = 0;

  const now = new Date();
  const checkInDate = new Date();
  checkInDate.setHours(h, m, 0, 0);

  const diffMs = Math.max(0, now.getTime() - checkInDate.getTime());
  const totalSec = Math.floor(diffMs / 1000);
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;

  return `${hrs}h ${mins.toString().padStart(2, '0')}m ${secs.toString().padStart(2, '0')}s`;
}

export function AttendancePage() {
  const { currentRole, effectiveRole, currentUser } = useAuthStore();
  const todayStr = new Date().toISOString().split('T')[0];

  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [search, setSearch] = useState('');
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isPunching, setIsPunching] = useState(false);
  const [activeTab, setActiveTab] = useState<'team' | 'personal'>('team');

  // Real-time ticking clock & simulated test override
  const [currentTime, setCurrentTime] = useState(new Date());
  const [simulatedTime, setSimulatedTime] = useState<Date | null>(null);

  const isAdminOrManager = Boolean(
    currentRole === 'admin' ||
    currentRole === 'manager' ||
    effectiveRole === 'admin' ||
    effectiveRole === 'manager' ||
    currentUser?.role === 'admin' ||
    currentUser?.role === 'manager' ||
    currentUser?.designation?.toUpperCase().includes('CEO') ||
    currentUser?.designation?.toUpperCase().includes('CTO') ||
    currentUser?.designation?.toUpperCase().includes('CPO')
  );

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const loadAttendance = async () => {
    try {
      await getUsers();
      const records = await getAttendance();
      setAttendance(records);
    } catch (err) {
      console.error('Error loading attendance records:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAttendance();
  }, []);

  // User's own today attendance
  const myTodayRecord = attendance.find(
    a => a.userId === currentUser?.id && a.date === todayStr
  );
  const isClockedIn = Boolean(myTodayRecord && myTodayRecord.checkIn && !myTodayRecord.checkOut);
  const isClockedOut = Boolean(myTodayRecord && myTodayRecord.checkOut);

  const effectiveTime = simulatedTime || currentTime;
  const punchInStatus = getPunchInStatus(effectiveTime);
  const punchOutStatus = getPunchOutStatus(effectiveTime, myTodayRecord?.checkIn);
  const todayPointEval = myTodayRecord ? calculateRecordPoints(myTodayRecord, effectiveTime) : null;
  const userStreak = calculateUserStreakAndPoints(attendance, currentUser?.id || '', effectiveTime);

  if (isLoading) return <LoadingState message="Loading attendance records..." />;

  // Handlers for Punch In / Out
  const handlePunchIn = async () => {
    if (!currentUser?.id) {
      toast.error('User session not found.');
      return;
    }
    const status = getPunchInStatus(effectiveTime);
    if (!status.canPunchIn) {
      toast.error(status.tooltip);
      return;
    }
    try {
      setIsPunching(true);
      const record = await checkIn(currentUser.id, effectiveTime);
      setAttendance(prev => [record, ...prev.filter(a => !(a.userId === currentUser.id && a.date === todayStr))]);
      toast.success(
        status.phase === 'on_time'
          ? `Clocked in on-time at ${record.checkIn}! +10 Points earned! 🎯`
          : `Clocked in during grace window at ${record.checkIn}! +5 Points earned! ⏱️`
      );
    } catch (err: any) {
      toast.error(err?.message || 'Failed to record check-in');
    } finally {
      setIsPunching(false);
    }
  };

  const handlePunchOut = async () => {
    if (!currentUser?.id) {
      toast.error('User session not found.');
      return;
    }
    const status = getPunchOutStatus(effectiveTime, myTodayRecord?.checkIn);
    if (!status.canPunchOut) {
      toast.error(status.tooltip);
      return;
    }
    try {
      setIsPunching(true);
      const record = await checkOut(currentUser.id, effectiveTime);
      setAttendance(prev => [record, ...prev.filter(a => !(a.userId === currentUser.id && a.date === todayStr))]);
      toast.success(`Clocked out successfully at ${record.checkOut}! Full points preserved! Logged: ${record.workingHours || 'today'}`);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to record check-out');
    } finally {
      setIsPunching(false);
    }
  };

  const handleResetToday = async () => {
    if (!currentUser?.id) return;
    try {
      setIsPunching(true);
      await resetTodayAttendance(currentUser.id);
      setAttendance(prev => prev.filter(a => !(a.userId === currentUser.id && a.date === todayStr)));
      toast.success("Today's attendance has been completely reset!");
    } catch (err: any) {
      toast.error(err?.message || 'Failed to reset attendance');
    } finally {
      setIsPunching(false);
    }
  };

  // Team records for selected date
  const teamRecords = attendance.filter(a => a.date === selectedDate);
  const filteredTeamRecords = teamRecords.filter(r => {
    const user = getUserById(r.userId);
    return (
      !search ||
      (user?.name.toLowerCase().includes(search.toLowerCase()) ?? false) ||
      (user?.employeeId?.toLowerCase().includes(search.toLowerCase()) ?? false)
    );
  });

  // Team stats on selected date
  const teamPresent = teamRecords.filter(r => r.status === 'present').length;
  const teamLate = teamRecords.filter(r => r.status === 'late').length;
  const teamAbsent = teamRecords.filter(r => r.status === 'absent').length;
  const teamLeave = teamRecords.filter(r => r.status === 'leave').length;

  // Personal user records
  const myRecords = attendance.filter(a => a.userId === currentUser?.id);
  const myPresent = myRecords.filter(r => r.status === 'present').length;
  const myLate = myRecords.filter(r => r.status === 'late').length;
  const myLeave = myRecords.filter(r => r.status === 'leave').length;

  // Helper: get week date range from any date string
  const getWeekRange = (dateStr: string) => {
    const d = new Date(dateStr);
    const day = d.getDay(); // 0=Sun
    const diffToMon = (day === 0 ? -6 : 1 - day);
    const mon = new Date(d);
    mon.setDate(d.getDate() + diffToMon);
    const sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    return { start: mon.toISOString().split('T')[0], end: sun.toISOString().split('T')[0] };
  };

  const downloadCSV = (rows: string[][], filename: string) => {
    const csvContent = rows.map(r => r.map(cell => `"${(cell || '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadWeeklyReport = () => {
    const { start, end } = getWeekRange(selectedDate);
    const weekRecords = attendance.filter(a => a.date >= start && a.date <= end);
    const rows: string[][] = [
      ['Employee Name', 'Employee ID', 'Department', 'Date', 'Status', 'Check In', 'Check Out', 'Working Hours'],
      ...weekRecords.map(r => {
        const u = getUserById(r.userId);
        return [
          u?.name || r.userId,
          u?.employeeId || '',
          u?.department || '',
          r.date,
          r.status,
          r.checkIn || '',
          r.checkOut || '',
          r.workingHours || '',
        ];
      }),
    ];
    downloadCSV(rows, `attendance-weekly-${start}-to-${end}.csv`);
    toast.success(`Weekly report downloaded (${start} to ${end})`);
  };

  const handleDownloadMonthlyReport = () => {
    const d = new Date(selectedDate);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const prefix = `${year}-${month}`;
    const monthRecords = attendance.filter(a => a.date.startsWith(prefix));
    const rows: string[][] = [
      ['Employee Name', 'Employee ID', 'Department', 'Date', 'Status', 'Check In', 'Check Out', 'Working Hours'],
      ...monthRecords.map(r => {
        const u = getUserById(r.userId);
        return [
          u?.name || r.userId,
          u?.employeeId || '',
          u?.department || '',
          r.date,
          r.status,
          r.checkIn || '',
          r.checkOut || '',
          r.workingHours || '',
        ];
      }),
    ];
    const monthName = d.toLocaleString('en-US', { month: 'long', year: 'numeric' });
    downloadCSV(rows, `attendance-monthly-${prefix}.csv`);
    toast.success(`Monthly report downloaded (${monthName})`);
  };

  return (
    <div className="page-container">
      {/* Header */}
      <div className="page-header flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="page-title">
            {isAdminOrManager ? 'Attendance Management' : 'My Attendance & Hours'}
          </h1>
          <p className="page-description">
            {isAdminOrManager
              ? 'Real-time team punch tracking, working hours and personal attendance'
              : 'Punch in and out daily, monitor active shift duration and view attendance history'}
          </p>
        </div>

        {/* Tab switch for Admin & Manager */}
        {isAdminOrManager && (
          <div className="flex items-center gap-1 p-1 rounded-xl bg-[var(--color-muted)] self-start sm:self-auto border border-[var(--color-border)]">
            <button
              onClick={() => setActiveTab('team')}
              className={cn(
                'flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all',
                activeTab === 'team'
                  ? 'bg-[var(--color-background)] text-[var(--color-foreground)] shadow-sm'
                  : 'text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]'
              )}
            >
              <Users className="w-3.5 h-3.5" />
              Team Overview
            </button>
            <button
              onClick={() => setActiveTab('personal')}
              className={cn(
                'flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all',
                activeTab === 'personal'
                  ? 'bg-[var(--color-background)] text-[var(--color-foreground)] shadow-sm'
                  : 'text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]'
              )}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              My History
            </button>
          </div>
        )}
      </div>

      {/* Daily Streaks and Attendance Points Overview */}
      <StreakAndPointsCard
        userId={currentUser?.id || ''}
        attendanceRecords={attendance}
        onAttendanceUpdated={loadAttendance}
        simulatedTime={simulatedTime}
        onSimulatedTimeChange={setSimulatedTime}
        className="mb-8"
      />

      {/* ============================================================ */}
      {/* REAL-TIME LIVE ATTENDANCE PUNCH CARD (FOR ALL MEMBERS & ADMINS) */}
      {/* ============================================================ */}
      <div className="card p-8 mb-8 border border-[var(--color-border)] bg-gradient-to-br from-[var(--color-background)] via-[var(--color-card)] to-[var(--color-muted)]/30 shadow-md relative">
        {/* Day Completed Badge Top Right */}
        {isClockedOut && (
          <div className="absolute top-6 right-6 hidden md:flex">
             <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
               <CheckCircle2 className="w-3.5 h-3.5" />
               Day Completed
             </span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-center">
          {/* Left Column: Digital Clock & Date */}
          <div className="flex flex-col items-center md:items-start text-center md:text-left space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-[var(--color-primary)]/10 text-[var(--color-primary)] flex items-center justify-center border border-[var(--color-primary)]/20 shadow-sm">
              <Clock className="w-8 h-8" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2 justify-center md:justify-start">
                <span className="text-4xl font-extrabold tracking-tight font-mono text-[var(--color-foreground)]">
                  {currentTime.toLocaleTimeString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: true,
                  })}
                </span>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  LIVE
                </span>
              </div>
              <p className="text-sm text-[var(--color-muted-foreground)] mt-2 flex items-center gap-2 justify-center md:justify-start">
                <Calendar className="w-4 h-4" />
                {currentTime.toLocaleDateString('en-US', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </p>
            </div>
          </div>

          {/* Middle/Right Columns: Shift Details & Action */}
          <div className="md:col-span-2 flex flex-col md:flex-row items-center gap-8 justify-between">
            {/* Shift Details 2x2 Grid */}
            <div className="grid grid-cols-2 gap-4 w-full md:w-auto flex-1">
              {/* Shift Status */}
              <div className="bg-[var(--color-muted)]/50 p-4 rounded-xl border border-[var(--color-border)]/50">
                <p className="text-xs text-[var(--color-muted-foreground)] font-medium mb-2">Shift Status</p>
                {isClockedIn ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    Active Shift
                  </span>
                ) : isClockedOut ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Completed
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                    <Clock className="w-3.5 h-3.5" />
                    Not Clocked In
                  </span>
                )}
              </div>

              {/* Running Duration / Total Logged */}
              <div className="bg-[var(--color-muted)]/50 p-4 rounded-xl border border-[var(--color-border)]/50">
                <p className="text-xs text-[var(--color-muted-foreground)] font-medium mb-1">
                  {isClockedIn ? 'Running Duration' : isClockedOut ? 'Total Logged' : 'Today Check In'}
                </p>
                <p className="text-sm font-bold font-mono text-[var(--color-foreground)] mt-1">
                  {isClockedIn
                    ? getElapsedDuration(myTodayRecord?.checkIn)
                    : isClockedOut
                    ? myTodayRecord?.workingHours || 'Completed'
                    : 'Pending Punch'}
                </p>
              </div>

              {/* Checked In At */}
              <div className="bg-[var(--color-muted)]/50 p-4 rounded-xl border border-[var(--color-border)]/50">
                <p className="text-xs text-[var(--color-muted-foreground)] font-medium mb-1">Checked In At</p>
                <p className="text-sm font-semibold text-[var(--color-foreground)] mt-1">
                  {myTodayRecord?.checkIn || '--:--'}
                </p>
              </div>

              {/* Checked Out At */}
              <div className="bg-[var(--color-muted)]/50 p-4 rounded-xl border border-[var(--color-border)]/50">
                <p className="text-xs text-[var(--color-muted-foreground)] font-medium mb-1">Checked Out At</p>
                <p className="text-sm font-semibold text-[var(--color-foreground)] mt-1">
                  {myTodayRecord?.checkOut || '--:--'}
                </p>
              </div>

              {/* Today's Points & Shift Rule */}
              <div className="bg-[var(--color-muted)]/50 p-3.5 rounded-xl border border-[var(--color-border)]/50 col-span-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-[var(--color-muted-foreground)] font-medium">Shift Points</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-base font-bold font-mono text-[var(--color-foreground)]">
                        {todayPointEval ? `${todayPointEval.finalPoints} Pts` : punchInStatus.canPunchIn ? `+${punchInStatus.expectedPoints} Pts Available` : '0 Pts'}
                      </span>
                      {todayPointEval?.penaltyApplied && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-500/15 text-red-600 border border-red-500/20">
                          Penalty Applied
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                    🔥 {userStreak.currentStreak}d Streak
                  </span>
                </div>
              </div>
            </div>

            {/* Action Button: Check In / Check Out */}
            <div className="shrink-0 w-full md:w-auto flex flex-col items-center justify-center">
              {isClockedIn ? (
                <div className="flex flex-col items-center gap-2 w-full md:w-auto">
                  <Button
                    variant={punchOutStatus.canPunchOut ? 'destructive' : 'outline'}
                    size="lg"
                    onClick={handlePunchOut}
                    disabled={!punchOutStatus.canPunchOut || isPunching}
                    className={cn(
                      'w-full md:w-auto px-6 py-6 shadow-md hover:shadow-lg transition-all rounded-xl font-semibold gap-2',
                      !punchOutStatus.canPunchOut && 'opacity-60 cursor-not-allowed border-dashed'
                    )}
                    title={punchOutStatus.tooltip}
                  >
                    <LogOut className="w-5 h-5" />
                    {isPunching
                      ? 'Clocking Out...'
                      : punchOutStatus.canPunchOut
                      ? 'Punch Out (Keep Points)'
                      : punchOutStatus.label}
                  </Button>
                  <span className={cn('text-[11px] font-semibold px-2 py-0.5 rounded-full border', punchOutStatus.badgeColor)}>
                    {punchOutStatus.badgeText}
                  </span>
                </div>
              ) : isClockedOut ? (
                <div className="text-center mt-2">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Day Completed ({todayPointEval?.finalPoints || 10} Pts)
                  </span>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 w-full md:w-auto">
                  <Button
                    variant="primary"
                    size="lg"
                    onClick={handlePunchIn}
                    disabled={!punchInStatus.canPunchIn || isPunching}
                    className={cn(
                      'w-full md:w-auto px-8 py-6 shadow-lg hover:shadow-xl transition-all rounded-xl font-semibold gap-2',
                      punchInStatus.canPunchIn
                        ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                        : 'opacity-50 cursor-not-allowed bg-muted text-muted-foreground hover:bg-muted'
                    )}
                    title={punchInStatus.tooltip}
                  >
                    <LogIn className="w-5 h-5" />
                    {isPunching ? 'Recording...' : punchInStatus.label}
                  </Button>
                  <span className={cn('text-[11px] font-semibold px-2 py-0.5 rounded-full border', punchInStatus.badgeColor)}>
                    {punchInStatus.badgeText}
                  </span>
                </div>
              )}

              {/* Reset Today's Shift for Admin/Testing */}
              {(myTodayRecord?.checkIn || isClockedIn || isClockedOut) && (
                <button
                  onClick={handleResetToday}
                  disabled={isPunching}
                  className="mt-3 text-[11px] text-[var(--color-muted-foreground)] hover:text-red-500 underline transition-colors cursor-pointer"
                  title="Reset today's shift record"
                >
                  Reset Today's Attendance
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* VIEW: ADMIN TEAM ATTENDANCE OVERVIEW                         */}
      {/* ============================================================ */}
      {isAdminOrManager && activeTab === 'team' ? (
        <>
          {/* Team Metric Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="card p-4 text-center animate-slide-up bg-emerald-500/5 border border-emerald-500/20">
              <p className="text-2xl font-bold text-emerald-500">{teamPresent}</p>
              <p className="text-xs text-[var(--color-muted-foreground)] font-medium mt-0.5">Present Today</p>
            </div>
            <div className="card p-4 text-center animate-slide-up stagger-1 bg-amber-500/5 border border-amber-500/20">
              <p className="text-2xl font-bold text-amber-500">{teamLate}</p>
              <p className="text-xs text-[var(--color-muted-foreground)] font-medium mt-0.5">Late Check-ins</p>
            </div>
            <div className="card p-4 text-center animate-slide-up stagger-2 bg-red-500/5 border border-red-500/20">
              <p className="text-2xl font-bold text-red-500">{teamAbsent}</p>
              <p className="text-xs text-[var(--color-muted-foreground)] font-medium mt-0.5">Absent</p>
            </div>
            <div className="card p-4 text-center animate-slide-up stagger-3 bg-blue-500/5 border border-blue-500/20">
              <p className="text-2xl font-bold text-blue-500">{teamLeave}</p>
              <p className="text-xs text-[var(--color-muted-foreground)] font-medium mt-0.5">On Leave</p>
            </div>
          </div>

          {/* Date Picker & Search Filter */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  const d = new Date(selectedDate);
                  d.setDate(d.getDate() - 1);
                  setSelectedDate(d.toISOString().split('T')[0]);
                }}
                className="p-2 rounded-lg border border-[var(--color-border)] hover:bg-[var(--color-muted)] transition-colors"
                title="Previous Day"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <input
                type="date"
                value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
                className="h-9 px-3 rounded-lg border border-[var(--color-input)] bg-[var(--color-background)] text-sm font-medium focus:ring-2 focus:ring-[var(--color-ring)]"
              />
              <button
                onClick={() => {
                  const d = new Date(selectedDate);
                  d.setDate(d.getDate() + 1);
                  setSelectedDate(d.toISOString().split('T')[0]);
                }}
                className="p-2 rounded-lg border border-[var(--color-border)] hover:bg-[var(--color-muted)] transition-colors"
                title="Next Day"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              {selectedDate !== todayStr && (
                <button
                  onClick={() => setSelectedDate(todayStr)}
                  className="px-2.5 py-1 text-xs font-semibold text-[var(--color-primary)] hover:underline"
                >
                  Jump to Today
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-muted-foreground)]" />
                <input
                  type="text"
                  placeholder="Search by team member or ID..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full h-9 pl-9 pr-3 rounded-lg border border-[var(--color-input)] bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)]"
                />
              </div>
              {/* Download Reports */}
              <button
                onClick={handleDownloadWeeklyReport}
                className="flex items-center gap-1.5 h-9 px-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)] hover:bg-[var(--color-border)] text-xs font-semibold transition-colors"
                title="Download Weekly Report as CSV"
              >
                <Download className="w-3.5 h-3.5" />
                Weekly
              </button>
              <button
                onClick={handleDownloadMonthlyReport}
                className="flex items-center gap-1.5 h-9 px-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-primary)] text-white hover:opacity-90 text-xs font-semibold transition-colors"
                title="Download Monthly Report as CSV"
              >
                <Download className="w-3.5 h-3.5" />
                Monthly
              </button>
            </div>
          </div>

          {/* Team Attendance Table */}
          <div className="card overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[var(--color-muted-foreground)] border-b border-[var(--color-border)] bg-[var(--color-muted)]/40">
                    <th className="px-4 py-3.5 font-semibold text-left">Team Member</th>
                    <th className="px-4 py-3.5 font-semibold text-left">Department</th>
                    <th className="px-4 py-3.5 font-semibold text-center">Date</th>
                    <th className="px-4 py-3.5 font-semibold text-center">Status</th>
                    <th className="px-4 py-3.5 font-semibold text-center">Clock In</th>
                    <th className="px-4 py-3.5 font-semibold text-center">Clock Out</th>
                    <th className="px-4 py-3.5 font-semibold text-center">Duration</th>
                    <th className="px-4 py-3.5 font-semibold text-center">Points</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {filteredTeamRecords.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-12 text-center text-[var(--color-muted-foreground)]">
                        No team check-in records found for this date.
                      </td>
                    </tr>
                  ) : (
                    filteredTeamRecords.map(record => {
                      const user = getUserById(record.userId);
                      return (
                        <tr key={record.id} className="hover:bg-[var(--color-muted)]/50 transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <Avatar name={user?.name || ''} size="sm" />
                              <div>
                                <p className="font-semibold text-[var(--color-foreground)] leading-snug">
                                  {user?.name || 'Member'}
                                </p>
                                <p className="text-xs text-[var(--color-muted-foreground)]">
                                  {user?.designation || 'Staff'} {user?.employeeId ? `• ${user.employeeId}` : ''}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-xs text-[var(--color-muted-foreground)] text-left">
                            {user?.department || 'Engineering'}
                          </td>
                          <td className="px-4 py-3 text-xs text-[var(--color-muted-foreground)] text-center">
                            {formatDate(record.date)}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <Badge className={getStatusColor(record.status)}>{record.status}</Badge>
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-center">{record.checkIn || '-'}</td>
                          <td className="px-4 py-3 font-mono text-xs text-center">{record.checkOut || '-'}</td>
                          <td className="px-4 py-3 font-semibold text-xs text-[var(--color-foreground)] text-center">
                            {record.workingHours || (record.checkIn && !record.checkOut ? 'Active' : '-')}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={cn(
                              'px-2 py-0.5 rounded-full text-[11px] font-bold font-mono',
                              calculateRecordPoints(record, effectiveTime).finalPoints >= 10
                                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                                : calculateRecordPoints(record, effectiveTime).finalPoints > 0
                                ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                                : 'bg-muted text-muted-foreground'
                            )}>
                              {calculateRecordPoints(record, effectiveTime).finalPoints} pts
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        /* ============================================================ */
        /* VIEW: PERSONAL ATTENDANCE HISTORY (MEMBERS & ADMIN PERSONAL)  */
        /* ============================================================ */
        <>
          {/* Member Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="card p-4 text-center animate-slide-up bg-emerald-500/5 border border-emerald-500/20">
              <p className="text-2xl font-bold text-emerald-500">{myPresent}</p>
              <p className="text-xs text-[var(--color-muted-foreground)] font-medium mt-0.5">Days Present</p>
            </div>
            <div className="card p-4 text-center animate-slide-up stagger-1 bg-amber-500/5 border border-amber-500/20">
              <p className="text-2xl font-bold text-amber-500">{myLate}</p>
              <p className="text-xs text-[var(--color-muted-foreground)] font-medium mt-0.5">Late Days</p>
            </div>
            <div className="card p-4 text-center animate-slide-up stagger-2 bg-blue-500/5 border border-blue-500/20">
              <p className="text-2xl font-bold text-blue-500">{myLeave}</p>
              <p className="text-xs text-[var(--color-muted-foreground)] font-medium mt-0.5">Approved Leaves</p>
            </div>
            <div className="card p-4 text-center animate-slide-up stagger-3 bg-violet-500/5 border border-violet-500/20">
              <p className="text-2xl font-bold text-[var(--color-primary)]">
                {myTodayRecord?.workingHours || (isClockedIn ? 'In Progress' : '0h 0m')}
              </p>
              <p className="text-xs text-[var(--color-muted-foreground)] font-medium mt-0.5">Today Logged</p>
            </div>
          </div>

          {/* Member Attendance Records Table */}
          <div className="card overflow-hidden shadow-sm">
            <div className="px-4 py-3.5 border-b border-[var(--color-border)] flex items-center justify-between">
              <h2 className="text-sm font-semibold">Attendance Log History</h2>
              <span className="text-xs text-[var(--color-muted-foreground)]">{myRecords.length} records</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[var(--color-muted-foreground)] border-b border-[var(--color-border)] bg-[var(--color-muted)]/40">
                    <th className="px-4 py-3 font-semibold text-left">Date</th>
                    <th className="px-4 py-3 font-semibold text-center">Status</th>
                    <th className="px-4 py-3 font-semibold text-center">Check In</th>
                    <th className="px-4 py-3 font-semibold text-center">Check Out</th>
                    <th className="px-4 py-3 font-semibold text-center">Working Hours</th>
                    <th className="px-4 py-3 font-semibold text-center">Points</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {myRecords.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center text-[var(--color-muted-foreground)]">
                        No attendance history found. Punch in above to record your first shift!
                      </td>
                    </tr>
                  ) : (
                    myRecords.map(record => (
                      <tr key={record.id} className="hover:bg-[var(--color-muted)]/50 transition-colors">
                        <td className="px-4 py-3 font-medium text-[var(--color-foreground)] text-left">
                          {formatDate(record.date)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Badge className={getStatusColor(record.status)}>{record.status}</Badge>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-center">{record.checkIn || '-'}</td>
                        <td className="px-4 py-3 font-mono text-xs text-center">{record.checkOut || '-'}</td>
                        <td className="px-4 py-3 font-semibold text-xs text-[var(--color-foreground)] text-center">
                          {record.workingHours || (record.checkIn && !record.checkOut ? 'Active' : '-')}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={cn(
                            'px-2 py-0.5 rounded-full text-[11px] font-bold font-mono',
                            calculateRecordPoints(record, effectiveTime).finalPoints >= 10
                              ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                              : calculateRecordPoints(record, effectiveTime).finalPoints > 0
                              ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                              : 'bg-muted text-muted-foreground'
                          )}>
                            {calculateRecordPoints(record, effectiveTime).finalPoints} pts
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
