import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Clock, LogIn, LogOut, CheckCircle2, AlertCircle,
  Timer, RotateCcw, ArrowRight, Sparkles, Zap, Flame,
  ShieldCheck, HelpCircle
} from 'lucide-react';
import { Button, Badge } from '@/components/ui';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores';
import { checkIn, checkOut, resetTodayAttendance, getUserAttendance } from '@/services/api';
import {
  getPunchInStatus,
  getPunchOutStatus,
  calculateRecordPoints,
  calculateUserStreakAndPoints,
  POINTS_ON_TIME,
  POINTS_GRACE,
} from '@/lib/attendanceRules';
import { toast } from 'sonner';
import type { AttendanceRecord } from '@/types';

interface DashboardPunchClockProps {
  onAttendanceChanged?: () => void;
  className?: string;
  todayRecord?: AttendanceRecord;
  attendanceRecords?: AttendanceRecord[];
}

function getElapsedDuration(checkInStr?: string, now = new Date()): string {
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

  const checkInDate = new Date();
  checkInDate.setHours(h, m, 0, 0);

  const diffMs = Math.max(0, now.getTime() - checkInDate.getTime());
  const totalSec = Math.floor(diffMs / 1000);
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;

  return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export function DashboardPunchClock({
  onAttendanceChanged,
  className,
  todayRecord: propTodayRecord,
  attendanceRecords: propAttendanceRecords,
}: DashboardPunchClockProps) {
  const navigate = useNavigate();
  const { currentUser, effectiveRole } = useAuthStore();
  const userId = currentUser?.id || '';
  const rolePrefix = effectiveRole === 'member' ? '/member' : effectiveRole === 'manager' ? '/manager' : '/admin';

  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [simulatedTime, setSimulatedTime] = useState<Date | null>(null);
  const [showSimMenu, setShowSimMenu] = useState(false);

  // Local fallback record if prop not passed
  const [fetchedTodayRecord, setFetchedTodayRecord] = useState<AttendanceRecord | null>(null);
  const [fetchedAllRecords, setFetchedAllRecords] = useState<AttendanceRecord[]>([]);

  // Effective time (real or simulated for test mode)
  const effectiveTime = simulatedTime || currentTime;

  // Real-time clock ticker
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch user attendance if records not supplied via props
  useEffect(() => {
    if (propTodayRecord || (propAttendanceRecords && propAttendanceRecords.length > 0) || !userId) return;

    let isMounted = true;
    getUserAttendance(userId)
      .then(records => {
        if (!isMounted) return;
        setFetchedAllRecords(records);
        const todayStr = new Date().toISOString().split('T')[0];
        const match = records.find(r => r.date === todayStr);
        if (match) setFetchedTodayRecord(match);
      })
      .catch(console.error);

    return () => {
      isMounted = false;
    };
  }, [userId, propTodayRecord, propAttendanceRecords]);

  const todayStr = effectiveTime.toISOString().split('T')[0];
  const allRecords = propAttendanceRecords || fetchedAllRecords;
  const todayRecord = propTodayRecord || fetchedTodayRecord || allRecords.find(r => r.date === todayStr && (r.userId === userId || !r.userId));

  const isClockedIn = Boolean(todayRecord && todayRecord.checkIn && !todayRecord.checkOut);
  const isClockedOut = Boolean(todayRecord && todayRecord.checkOut);
  const notClockedIn = !isClockedIn && !isClockedOut;

  const punchInStatus = getPunchInStatus(effectiveTime);
  const punchOutStatus = getPunchOutStatus(effectiveTime, todayRecord?.checkIn);
  const pointEval = todayRecord ? calculateRecordPoints(todayRecord, effectiveTime) : null;
  const streakInfo = calculateUserStreakAndPoints(allRecords, userId, effectiveTime);

  // Formatted date and time strings
  const formattedTime = effectiveTime.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });

  const formattedDate = effectiveTime.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  // Action: Punch In
  const handlePunchIn = async (overrideDate?: Date) => {
    if (!userId) {
      toast.error('User session not found.');
      return;
    }
    const timeToUse = overrideDate || effectiveTime;
    const status = getPunchInStatus(timeToUse);

    if (!status.canPunchIn && !overrideDate) {
      toast.error(status.tooltip);
      return;
    }

    try {
      setIsSubmitting(true);
      const record = await checkIn(userId, timeToUse);
      setFetchedTodayRecord(record);
      setFetchedAllRecords(prev => [record, ...prev.filter(r => r.date !== todayStr)]);

      toast.success(
        status.phase === 'on_time'
          ? `🎉 Punched In on-time at ${record.checkIn}! +10 Points earned! 🎯`
          : `⏱️ Punched In during grace window at ${record.checkIn}! +5 Points earned! ⏱️`
      );

      if (onAttendanceChanged) {
        onAttendanceChanged();
      }
    } catch (err: any) {
      toast.error(err?.message || 'Check-in failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Action: Punch Out
  const handlePunchOut = async (overrideDate?: Date) => {
    if (!userId) {
      toast.error('User session not found.');
      return;
    }
    const timeToUse = overrideDate || effectiveTime;
    const status = getPunchOutStatus(timeToUse, todayRecord?.checkIn);

    if (!status.canPunchOut && !overrideDate) {
      toast.error(status.tooltip);
      return;
    }

    try {
      setIsSubmitting(true);
      const record = await checkOut(userId, timeToUse);
      setFetchedTodayRecord(record);
      setFetchedAllRecords(prev => [record, ...prev.filter(r => r.date !== todayStr)]);

      toast.success(`🎉 Punched Out at ${record.checkOut}! Full shift points preserved.`);

      if (onAttendanceChanged) {
        onAttendanceChanged();
      }
    } catch (err: any) {
      toast.error(err?.message || 'Check-out failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Reset shift for testing / demo
  const handleReset = async () => {
    if (!userId) return;
    try {
      setIsSubmitting(true);
      await resetTodayAttendance(userId);
      setFetchedTodayRecord(null);
      setFetchedAllRecords(prev => prev.filter(r => r.date !== todayStr));
      setSimulatedTime(null);
      toast.success("Today's shift record has been reset!");
      if (onAttendanceChanged) {
        onAttendanceChanged();
      }
    } catch (err) {
      toast.error('Failed to reset attendance record.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Quick simulation helper
  const handleSimulate = (hours: number, minutes: number) => {
    const sim = new Date();
    sim.setHours(hours, minutes, 0, 0);
    setSimulatedTime(sim);
    setShowSimMenu(false);
    toast.info(`Clock simulated to ${sim.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}`);
  };

  const handleClearSimulation = () => {
    setSimulatedTime(null);
    setShowSimMenu(false);
    toast.success('Live clock restored.');
  };

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl border border-border/80 bg-gradient-to-r from-card via-card to-primary/5 p-4 sm:p-5 shadow-sm hover:shadow-md transition-all mb-6',
        isClockedIn && 'border-emerald-500/30 bg-gradient-to-r from-card via-emerald-500/[0.04] to-emerald-500/10',
        isClockedOut && 'border-blue-500/30 bg-gradient-to-r from-card via-blue-500/[0.04] to-blue-500/10',
        className
      )}
    >
      {/* Ambient decorative glow */}
      {isClockedIn && (
        <div className="absolute -top-12 -right-12 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none animate-pulse" />
      )}
      {isClockedOut && (
        <div className="absolute -top-12 -right-12 w-48 h-48 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
      )}

      {/* Simulation Active Indicator Banner */}
      {simulatedTime && (
        <div className="mb-3 px-3 py-1.5 rounded-lg bg-violet-500/15 border border-violet-500/30 text-violet-700 dark:text-violet-300 text-xs flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Timer className="w-3.5 h-3.5 animate-spin" />
            <span className="font-semibold">
              Simulation Active: {formattedTime} ({formattedDate})
            </span>
          </div>
          <button
            onClick={handleClearSimulation}
            className="hover:underline font-bold text-[11px] text-violet-600 dark:text-violet-400 cursor-pointer"
          >
            Reset to Real Clock ✕
          </button>
        </div>
      )}

      {/* Main Responsive Grid Container:
          - Mobile / Tablet (< xl): Stacks into 3 neatly aligned rows
          - Desktop (xl+): 3 cleanly balanced horizontal columns
      */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        
        {/* ======================================================== */}
        {/* ROW 1 (Desktop: Left): Live Clock, Status Badge & Date */}
        {/* ======================================================== */}
        <div className="flex items-center gap-3.5 shrink-0">
          {/* Status Icon */}
          <div
            className={cn(
              'w-11 h-11 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl flex items-center justify-center shrink-0 border shadow-xs transition-colors',
              isClockedIn
                ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                : isClockedOut
                ? 'bg-blue-500/15 border-blue-500/30 text-blue-600 dark:text-blue-400'
                : 'bg-primary/10 border-primary/20 text-primary'
            )}
          >
            {isClockedIn ? (
              <Zap className="w-5 h-5 sm:w-6 sm:h-6 animate-pulse" />
            ) : isClockedOut ? (
              <CheckCircle2 className="w-5 h-5 sm:w-6 sm:h-6" />
            ) : (
              <Clock className="w-5 h-5 sm:w-6 sm:h-6" />
            )}
          </div>

          {/* Time, Badge & Subtitle */}
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="font-mono text-xl sm:text-2xl font-black tracking-tight text-[var(--color-foreground)] whitespace-nowrap">
                {formattedTime}
              </span>
              <Badge
                variant="outline"
                className={cn(
                  'text-[11px] font-semibold px-2 py-0.5 border flex items-center gap-1.5 shrink-0 whitespace-nowrap',
                  isClockedIn
                    ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
                    : isClockedOut
                    ? 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30'
                    : punchInStatus.canPunchIn
                    ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
                    : 'bg-muted text-muted-foreground border-border'
                )}
              >
                <span
                  className={cn(
                    'w-1.5 h-1.5 rounded-full shrink-0',
                    isClockedIn
                      ? 'bg-emerald-500 animate-ping'
                      : isClockedOut
                      ? 'bg-blue-500'
                      : punchInStatus.canPunchIn
                      ? 'bg-emerald-500 animate-pulse'
                      : 'bg-muted-foreground'
                  )}
                />
                {isClockedIn
                  ? 'Shift Active'
                  : isClockedOut
                  ? 'Shift Completed'
                  : punchInStatus.badgeText}
              </Badge>
            </div>
            <p className="text-[11px] sm:text-xs text-[var(--color-muted-foreground)] mt-0.5 whitespace-nowrap truncate">
              <span>{formattedDate}</span>
              <span className="mx-1.5 opacity-60">•</span>
              <span>Shift: 9:00 AM – 10:00 PM</span>
            </p>
          </div>
        </div>

        {/* ======================================================== */}
        {/* ROW 2 (Desktop: Middle): 3-Column Metrics Matrix        */}
        {/* ======================================================== */}
        <div className="w-full xl:w-auto xl:min-w-[380px] 2xl:min-w-[430px] rounded-xl bg-background/70 dark:bg-background/40 border border-border/60 p-2 sm:p-2.5 shadow-xs">
          <div className="grid grid-cols-3 divide-x divide-border/60 text-center items-center">
            {isClockedIn ? (
              <>
                <div className="px-1.5 sm:px-3">
                  <span className="text-[10px] uppercase font-bold text-[var(--color-muted-foreground)] block whitespace-nowrap">
                    Punched In
                  </span>
                  <span className="font-mono font-bold text-xs sm:text-sm text-[var(--color-foreground)] block whitespace-nowrap mt-0.5">
                    {todayRecord?.checkIn || '--:--'}
                  </span>
                </div>
                <div className="px-1.5 sm:px-3">
                  <span className="text-[10px] uppercase font-bold text-[var(--color-muted-foreground)] block whitespace-nowrap">
                    Elapsed Time
                  </span>
                  <span className="font-mono font-bold text-xs sm:text-sm text-emerald-600 dark:text-emerald-400 flex items-center justify-center gap-1 mt-0.5 whitespace-nowrap">
                    <Timer className="w-3 h-3 animate-spin shrink-0" />
                    {getElapsedDuration(todayRecord?.checkIn, effectiveTime)}
                  </span>
                </div>
                <div className="px-1.5 sm:px-3">
                  <span className="text-[10px] uppercase font-bold text-[var(--color-muted-foreground)] block whitespace-nowrap">
                    Points Earned
                  </span>
                  <span className="font-bold text-xs sm:text-sm text-emerald-600 dark:text-emerald-400 flex items-center justify-center gap-1 mt-0.5 whitespace-nowrap">
                    <Sparkles className="w-3 h-3 shrink-0" />
                    {pointEval?.finalPoints || 10} Pts
                  </span>
                </div>
              </>
            ) : isClockedOut ? (
              <>
                <div className="px-1.5 sm:px-3">
                  <span className="text-[10px] uppercase font-bold text-[var(--color-muted-foreground)] block whitespace-nowrap">
                    Shift Duration
                  </span>
                  <span className="font-mono font-bold text-xs sm:text-sm text-[var(--color-foreground)] block whitespace-nowrap mt-0.5">
                    {todayRecord?.workingHours || 'Logged'}
                  </span>
                </div>
                <div className="px-1.5 sm:px-3">
                  <span className="text-[10px] uppercase font-bold text-[var(--color-muted-foreground)] block whitespace-nowrap">
                    Shift Window
                  </span>
                  <span className="font-mono font-medium text-[11px] sm:text-xs text-[var(--color-muted-foreground)] block whitespace-nowrap mt-0.5">
                    {todayRecord?.checkIn} → {todayRecord?.checkOut}
                  </span>
                </div>
                <div className="px-1.5 sm:px-3">
                  <span className="text-[10px] uppercase font-bold text-[var(--color-muted-foreground)] block whitespace-nowrap">
                    Points Locked
                  </span>
                  <span className="font-bold text-xs sm:text-sm text-blue-600 dark:text-blue-400 flex items-center justify-center gap-1 mt-0.5 whitespace-nowrap">
                    <Sparkles className="w-3 h-3 shrink-0" />
                    +{pointEval?.finalPoints || 10} Pts
                  </span>
                </div>
              </>
            ) : (
              <>
                <div className="px-1 sm:px-2">
                  <span className="text-[10px] uppercase font-bold text-[var(--color-muted-foreground)] block whitespace-nowrap">
                    On-Time (+10)
                  </span>
                  <span className="font-mono font-semibold text-[11px] sm:text-xs text-emerald-600 dark:text-emerald-400 block whitespace-nowrap mt-0.5">
                    9:00 – 10:00 AM
                  </span>
                </div>
                <div className="px-1 sm:px-2">
                  <span className="text-[10px] uppercase font-bold text-[var(--color-muted-foreground)] block whitespace-nowrap">
                    Grace (+5)
                  </span>
                  <span className="font-mono font-semibold text-[11px] sm:text-xs text-amber-600 dark:text-amber-400 block whitespace-nowrap mt-0.5">
                    10:00 – 10:15 AM
                  </span>
                </div>
                <div className="px-1 sm:px-2">
                  <span className="text-[10px] uppercase font-bold text-[var(--color-muted-foreground)] block whitespace-nowrap">
                    Punch Out
                  </span>
                  <span className="font-mono font-semibold text-[11px] sm:text-xs text-[var(--color-muted-foreground)] block whitespace-nowrap mt-0.5">
                    9:00 – 10:00 PM
                  </span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* ======================================================== */}
        {/* ROW 3 (Desktop: Right): Action Buttons & Simulator Pill  */}
        {/* ======================================================== */}
        <div className="flex items-center gap-2 w-full xl:w-auto shrink-0">
          {notClockedIn && (
            <>
              {punchInStatus.canPunchIn ? (
                <Button
                  size="md"
                  onClick={() => handlePunchIn()}
                  disabled={isSubmitting}
                  className="w-full xl:w-auto bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-500 hover:to-teal-500 text-white font-bold px-5 py-2.5 rounded-xl shadow-md shadow-emerald-500/25 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer h-10"
                  title={punchInStatus.tooltip}
                >
                  <LogIn className="w-4 h-4 shrink-0" />
                  <span className="whitespace-nowrap">
                    {punchInStatus.phase === 'on_time'
                      ? 'Punch In (+10 Pts)'
                      : 'Punch In (+5 Pts Grace)'}
                  </span>
                </Button>
              ) : (
                <Button
                  size="md"
                  disabled={isSubmitting}
                  onClick={() => {
                    toast.info(punchInStatus.tooltip);
                    setShowSimMenu(true);
                  }}
                  variant="outline"
                  className="w-full xl:w-auto border-dashed font-semibold px-4 py-2.5 rounded-xl opacity-85 hover:opacity-100 flex items-center justify-center gap-2 h-10"
                  title={punchInStatus.tooltip}
                >
                  <LogIn className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="whitespace-nowrap">{punchInStatus.label}</span>
                </Button>
              )}
            </>
          )}

          {isClockedIn && (
            <>
              {punchOutStatus.canPunchOut ? (
                <Button
                  size="md"
                  variant="destructive"
                  onClick={() => handlePunchOut()}
                  disabled={isSubmitting}
                  className="w-full xl:w-auto bg-gradient-to-r from-rose-600 via-red-600 to-rose-700 hover:from-rose-500 hover:to-red-500 text-white font-bold px-5 py-2.5 rounded-xl shadow-md shadow-rose-500/25 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer h-10"
                  title={punchOutStatus.tooltip}
                >
                  <LogOut className="w-4 h-4 shrink-0" />
                  <span className="whitespace-nowrap">Punch Out (Keep 10 Pts)</span>
                </Button>
              ) : (
                <Button
                  size="md"
                  disabled={isSubmitting}
                  onClick={() => {
                    toast.info(punchOutStatus.tooltip);
                    setShowSimMenu(true);
                  }}
                  variant="outline"
                  className="w-full xl:w-auto border-dashed font-semibold px-4 py-2.5 rounded-xl opacity-85 hover:opacity-100 flex items-center justify-center gap-2 h-10"
                  title={punchOutStatus.tooltip}
                >
                  <LogOut className="w-4 h-4 text-amber-500 shrink-0" />
                  <span className="whitespace-nowrap">{punchOutStatus.label}</span>
                </Button>
              )}
            </>
          )}

          {isClockedOut && (
            <Button
              size="md"
              variant="outline"
              onClick={() => navigate(`${rolePrefix}/attendance`)}
              className="w-full xl:w-auto font-semibold px-4 py-2.5 rounded-xl flex items-center justify-center gap-2 bg-background/60 hover:bg-background h-10"
            >
              <span className="whitespace-nowrap">Attendance Log</span>
              <ArrowRight className="w-4 h-4 text-primary shrink-0" />
            </Button>
          )}

          {/* Quick Simulation / Testing Helper Menu */}
          <div className="relative shrink-0">
            <button
              onClick={() => setShowSimMenu(!showSimMenu)}
              className="h-10 w-10 flex items-center justify-center rounded-xl border border-border/80 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              title="Test Shift Windows & Simulation"
            >
              <Timer className="w-4 h-4" />
            </button>

            {showSimMenu && (
              <div className="absolute right-0 top-full mt-2 w-72 p-3 bg-popover text-popover-foreground border border-border rounded-xl shadow-xl z-50 text-xs space-y-2 animate-in fade-in zoom-in-95 duration-150">
                <div className="flex items-center justify-between pb-1 border-b border-border/60">
                  <span className="font-bold flex items-center gap-1.5">
                    <Timer className="w-3.5 h-3.5 text-primary" /> Test Shift Window
                  </span>
                  <button
                    onClick={() => setShowSimMenu(false)}
                    className="text-muted-foreground hover:text-foreground p-0.5 cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Simulate clock times to test Punch In / Punch Out during any hour of the day:
                </p>
                <div className="grid grid-cols-2 gap-1.5 pt-1">
                  <button
                    onClick={() => handleSimulate(9, 15)}
                    className="p-1.5 text-left rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20 font-medium cursor-pointer"
                  >
                    9:15 AM (+10 Pts)
                  </button>
                  <button
                    onClick={() => handleSimulate(10, 8)}
                    className="p-1.5 text-left rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/20 font-medium cursor-pointer"
                  >
                    10:08 AM (+5 Pts)
                  </button>
                  <button
                    onClick={() => handleSimulate(21, 30)}
                    className="p-1.5 text-left rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-700 dark:text-blue-300 border border-blue-500/20 font-medium cursor-pointer"
                  >
                    9:30 PM (Punch Out)
                  </button>
                  <button
                    onClick={() => handleSimulate(22, 15)}
                    className="p-1.5 text-left rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-500/20 font-medium cursor-pointer"
                  >
                    10:15 PM (Cut-off)
                  </button>
                </div>
                <div className="pt-2 border-t border-border/60 flex items-center justify-between">
                  <button
                    onClick={handleReset}
                    className="text-[11px] font-semibold text-rose-600 hover:underline flex items-center gap-1 cursor-pointer"
                    title="Reset today's attendance record"
                  >
                    <RotateCcw className="w-3 h-3" /> Reset Today
                  </button>
                  <button
                    onClick={handleClearSimulation}
                    className="text-[11px] font-semibold text-primary hover:underline cursor-pointer"
                  >
                    Restore Live Clock
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
