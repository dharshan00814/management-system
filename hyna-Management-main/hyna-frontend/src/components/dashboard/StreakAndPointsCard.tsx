import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Flame, Award, Clock, CheckCircle2, AlertCircle, ArrowRight,
  Info, ShieldCheck, ChevronRight, Sparkles, HelpCircle,
  LogIn, LogOut, X, Timer
} from 'lucide-react';
import { Button, Badge } from '@/components/ui';
import { cn } from '@/lib/utils';
import type { AttendanceRecord } from '@/types';
import {
  calculateUserStreakAndPoints,
  getPunchInStatus,
  getPunchOutStatus,
  POINTS_ON_TIME,
  POINTS_GRACE,
  POINTS_MISSED_PUNCHOUT_10,
  POINTS_MISSED_PUNCHOUT_5,
} from '@/lib/attendanceRules';
import { checkIn, checkOut, resetTodayAttendance } from '@/services/api';
import { useAuthStore } from '@/stores';
import { toast } from 'sonner';

interface StreakAndPointsCardProps {
  userId: string;
  attendanceRecords: AttendanceRecord[];
  onAttendanceUpdated?: () => void;
  className?: string;
  simulatedTime?: Date | null;
  onSimulatedTimeChange?: (time: Date | null) => void;
}

export function StreakAndPointsCard({
  userId,
  attendanceRecords,
  onAttendanceUpdated,
  className,
  simulatedTime: externalSimulatedTime,
  onSimulatedTimeChange,
}: StreakAndPointsCardProps) {
  const navigate = useNavigate();
  const { effectiveRole } = useAuthStore();
  const rolePrefix = effectiveRole === 'member' ? '/member' : effectiveRole === 'manager' ? '/manager' : '/admin';
  const attendancePath = `${rolePrefix}/attendance`;

  const [internalTime, setInternalTime] = useState<Date>(new Date());
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [showSimulator, setShowSimulator] = useState(false);
  const [isPunching, setIsPunching] = useState(false);

  // Use external simulated time if provided, otherwise real live ticking time
  const effectiveTime = externalSimulatedTime || internalTime;

  useEffect(() => {
    if (externalSimulatedTime) return;
    const interval = setInterval(() => {
      setInternalTime(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, [externalSimulatedTime]);

  const safeRecords = Array.isArray(attendanceRecords) ? attendanceRecords : [];
  const streakData = calculateUserStreakAndPoints(safeRecords, userId, effectiveTime);
  const punchInStatus = getPunchInStatus(effectiveTime);

  const todayStr = effectiveTime.toISOString().split('T')[0];
  const todayRecord = safeRecords.find(r => r.userId === userId && r.date === todayStr);
  const isClockedIn = Boolean(todayRecord && todayRecord.checkIn && !todayRecord.checkOut);
  const isClockedOut = Boolean(todayRecord && todayRecord.checkOut);

  const punchOutStatus = getPunchOutStatus(effectiveTime, todayRecord?.checkIn);

  // Quick Punch Handlers
  const handleQuickPunchIn = async () => {
    if (!punchInStatus.canPunchIn) {
      toast.error(punchInStatus.tooltip);
      return;
    }
    try {
      setIsPunching(true);
      const record = await checkIn(userId, effectiveTime);
      toast.success(
        punchInStatus.phase === 'on_time'
          ? `🎉 Punched in on-time at ${record.checkIn}! +10 Points earned.`
          : `⏱️ Punched in during grace window at ${record.checkIn}! +5 Points earned.`
      );
      if (onAttendanceUpdated) onAttendanceUpdated();
    } catch (err: any) {
      toast.error(err?.message || 'Check-in failed');
    } finally {
      setIsPunching(false);
    }
  };

  const handleQuickPunchOut = async () => {
    if (!punchOutStatus.canPunchOut) {
      toast.error(punchOutStatus.tooltip);
      return;
    }
    try {
      setIsPunching(true);
      const record = await checkOut(userId, effectiveTime);
      toast.success(`🎉 Clocked out at ${record.checkOut}! Full points preserved.`);
      if (onAttendanceUpdated) onAttendanceUpdated();
    } catch (err: any) {
      toast.error(err?.message || 'Check-out failed');
    } finally {
      setIsPunching(false);
    }
  };

  const handleResetToday = async () => {
    if (!userId) return;
    try {
      setIsPunching(true);
      await resetTodayAttendance(userId);
      toast.success("Today's shift record has been reset!");
      if (onAttendanceUpdated) onAttendanceUpdated();
    } catch (err: any) {
      toast.error('Failed to reset attendance');
    } finally {
      setIsPunching(false);
    }
  };

  const setSimulated = (hours: number, minutes: number) => {
    const sim = new Date();
    sim.setHours(hours, minutes, 0, 0);
    if (onSimulatedTimeChange) {
      onSimulatedTimeChange(sim);
    } else {
      setInternalTime(sim);
    }
    toast.info(`Simulated clock set to ${sim.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}`);
  };

  const resetToRealClock = () => {
    if (onSimulatedTimeChange) {
      onSimulatedTimeChange(null);
    } else {
      setInternalTime(new Date());
    }
    toast.success('Restored to live real-time system clock');
  };

  return (
    <div className={cn('space-y-4 animate-in fade-in slide-in-from-bottom-3 duration-500', className)}>
      {/* Simulation Toolbar (if toggled) */}
      {showSimulator && (
        <div className="p-3 rounded-xl bg-violet-500/10 border border-violet-500/30 text-xs flex flex-wrap items-center justify-between gap-2 shadow-sm">
          <div className="flex items-center gap-2">
            <Timer className="w-4 h-4 text-violet-500 animate-pulse" />
            <span className="font-semibold text-violet-700 dark:text-violet-300">
              Shift Window Simulator (Active: {effectiveTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })})
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => setSimulated(8, 45)}
              className="px-2 py-1 rounded bg-background border hover:bg-muted text-[11px] font-medium"
            >
              8:45 AM (Pre-Shift)
            </button>
            <button
              onClick={() => setSimulated(9, 15)}
              className="px-2 py-1 rounded bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30 text-[11px] font-medium"
            >
              9:15 AM (+10 Pts)
            </button>
            <button
              onClick={() => setSimulated(10, 8)}
              className="px-2 py-1 rounded bg-yellow-500/20 text-yellow-700 dark:text-yellow-300 border border-yellow-500/30 hover:bg-yellow-500/30 text-[11px] font-medium"
            >
              10:08 AM (+5 Pts)
            </button>
            <button
              onClick={() => setSimulated(11, 30)}
              className="px-2 py-1 rounded bg-background border hover:bg-muted text-[11px] font-medium"
            >
              11:30 AM (In Closed)
            </button>
            <button
              onClick={() => setSimulated(21, 30)}
              className="px-2 py-1 rounded bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30 text-[11px] font-medium"
            >
              9:30 PM (Out Active)
            </button>
            <button
              onClick={() => setSimulated(22, 30)}
              className="px-2 py-1 rounded bg-red-500/20 text-red-700 dark:text-red-300 border border-red-500/30 hover:bg-red-500/30 text-[11px] font-medium"
            >
              10:30 PM (Penalty)
            </button>
            <button
              onClick={handleResetToday}
              className="px-2 py-1 rounded bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-500/30 hover:bg-rose-500/30 text-[11px] font-semibold"
              title="Reset today's shift records"
            >
              Reset Today
            </button>
            <button
              onClick={resetToRealClock}
              className="px-2 py-1 rounded bg-primary text-primary-foreground text-[11px] font-semibold"
            >
              Live Clock
            </button>
            <button
              onClick={() => setShowSimulator(false)}
              className="p-1 rounded hover:bg-muted text-muted-foreground ml-1"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Main Container: Points next to Daily Streaks */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* ========================================================= */}
        {/* CARD 1: DAILY STREAKS (🔥)                               */}
        {/* ========================================================= */}
        <div className="relative overflow-hidden rounded-2xl border border-amber-500/25 bg-gradient-to-br from-amber-500/10 via-orange-500/5 to-transparent p-5 shadow-sm hover:shadow-md transition-all group">
          {/* Ambient decorative glow */}
          <div className="absolute -top-12 -right-12 w-32 h-32 bg-amber-500/15 rounded-full blur-2xl pointer-events-none group-hover:scale-125 transition-transform" />

          {/* Header */}
          <div className="flex items-center justify-between mb-3 relative z-10">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center border border-amber-500/30 shadow-xs">
                <Flame className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-[var(--color-foreground)] flex items-center gap-1.5">
                  Daily Streak
                </h3>
                <p className="text-[11px] text-[var(--color-muted-foreground)]">
                  Consecutive workdays attended
                </p>
              </div>
            </div>

            <Badge
              variant="outline"
              className={cn(
                'text-[10px] font-bold px-2 py-0.5 border',
                streakData.currentStreak > 0
                  ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40'
                  : 'bg-muted text-muted-foreground border-border'
              )}
            >
              {streakData.currentStreak > 0 ? '🔥 On Fire' : 'Start Today'}
            </Badge>
          </div>

          {/* Metric */}
          <div className="flex items-baseline gap-2 mb-4 relative z-10">
            <span className="text-4xl font-black font-mono tracking-tight text-[var(--color-foreground)]">
              {streakData.currentStreak}
            </span>
            <span className="text-sm font-semibold text-[var(--color-muted-foreground)]">
              {streakData.currentStreak === 1 ? 'Day' : 'Days'} Streak
            </span>
            <span className="text-[11px] text-amber-600 dark:text-amber-400 font-medium ml-auto">
              Best: {streakData.longestStreak}d
            </span>
          </div>

          {/* 7-Day Visual Matrix */}
          <div className="bg-[var(--color-background)]/60 rounded-xl p-2.5 border border-border/50 relative z-10 mb-3">
            <div className="text-[10px] font-semibold text-[var(--color-muted-foreground)] mb-2 flex items-center justify-between">
              <span>Recent 7-Day Activity</span>
              <span className="font-mono text-[9px]">Mon–Sun</span>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center">
              {streakData.historyDays.map((day, idx) => (
                <div
                  key={idx}
                  className={cn(
                    'flex flex-col items-center justify-center p-1 rounded-lg transition-all',
                    day.isToday
                      ? 'ring-1.5 ring-amber-500 bg-amber-500/15'
                      : day.attended
                      ? 'bg-emerald-500/10'
                      : 'bg-muted/40'
                  )}
                >
                  <span className="text-[9px] font-medium text-[var(--color-muted-foreground)]">
                    {day.dayLabel}
                  </span>
                  <div className="w-5 h-5 flex items-center justify-center mt-0.5">
                    {day.attended ? (
                      <Flame className="w-3.5 h-3.5 text-amber-500" />
                    ) : day.isToday ? (
                      <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
                    ) : (
                      <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30" />
                    )}
                  </div>
                  <span className="text-[9px] font-mono font-bold mt-0.5 text-emerald-600 dark:text-emerald-400">
                    {day.points > 0 ? `+${day.points}` : '0'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Streak Subtext / Footer */}
          <div className="flex items-center justify-between text-[11px] text-[var(--color-muted-foreground)] relative z-10 pt-1">
            <span>Punch in before 10:15 AM daily</span>
            <button
              onClick={() => setShowRulesModal(true)}
              className="text-amber-600 dark:text-amber-400 font-semibold hover:underline flex items-center gap-1"
            >
              Rules <Info className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* ========================================================= */}
        {/* CARD 2: ATTENDANCE POINTS (⭐)                           */}
        {/* ========================================================= */}
        <div className="relative overflow-hidden rounded-2xl border border-indigo-500/25 bg-gradient-to-br from-indigo-500/10 via-purple-500/5 to-transparent p-5 shadow-sm hover:shadow-md transition-all group">
          {/* Ambient decorative glow */}
          <div className="absolute -top-12 -right-12 w-32 h-32 bg-indigo-500/15 rounded-full blur-2xl pointer-events-none group-hover:scale-125 transition-transform" />

          {/* Header */}
          <div className="flex items-center justify-between mb-3 relative z-10">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center border border-indigo-500/30 shadow-xs">
                <Award className="w-5 h-5 text-indigo-500" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-[var(--color-foreground)] flex items-center gap-1.5">
                  Attendance Points
                </h3>
                <p className="text-[11px] text-[var(--color-muted-foreground)]">
                  Punctuality rewards & shift score
                </p>
              </div>
            </div>

            <Badge
              variant="outline"
              className={cn(
                'text-[10px] font-bold px-2 py-0.5 border',
                streakData.todayPoints > 0
                  ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40'
                  : 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-500/40'
              )}
            >
              {streakData.todayPoints > 0 ? `+${streakData.todayPoints} Today` : 'Pending Check-in'}
            </Badge>
          </div>

          {/* Metric */}
          <div className="flex items-baseline gap-2 mb-4 relative z-10">
            <span className="text-4xl font-black font-mono tracking-tight text-[var(--color-foreground)]">
              {streakData.totalPoints}
            </span>
            <span className="text-sm font-semibold text-[var(--color-muted-foreground)]">
              Total Points
            </span>
            <div className="ml-auto text-right">
              <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 block">
                {isClockedIn ? `+${streakData.todayPoints} pts active` : isClockedOut ? `+${streakData.todayPoints} pts locked` : '0 pts logged'}
              </span>
            </div>
          </div>

          {/* Points Rules Chips */}
          <div className="bg-[var(--color-background)]/60 rounded-xl p-2.5 border border-border/50 relative z-10 mb-3 space-y-1.5">
            <div className="flex items-center justify-between text-[10px] font-semibold text-[var(--color-muted-foreground)]">
              <span>Timing Point Schedule</span>
              <span className="font-mono text-[9px]">Standard</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5 text-[11px]">
              <div className="flex items-center justify-between p-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300">
                <span className="text-[10px] font-medium">9:00–10:00 AM</span>
                <span className="font-bold font-mono">+10 Pts</span>
              </div>
              <div className="flex items-center justify-between p-1.5 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-yellow-700 dark:text-yellow-300">
                <span className="text-[10px] font-medium">10:00–10:15 AM</span>
                <span className="font-bold font-mono">+5 Pts</span>
              </div>
              <div className="flex items-center justify-between p-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-700 dark:text-blue-300">
                <span className="text-[10px] font-medium">9:00–10:00 PM</span>
                <span className="font-bold font-mono">Keep Pts</span>
              </div>
              <div className="flex items-center justify-between p-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-700 dark:text-red-300">
                <span className="text-[10px] font-medium">Missed 10 PM</span>
                <span className="font-bold font-mono">10→5 / 5→2</span>
              </div>
            </div>
          </div>

          {/* Points Alert / Real-time Message */}
          <div className="flex items-center justify-between text-[11px] relative z-10 pt-1">
            <span className="text-[var(--color-muted-foreground)] truncate max-w-[200px]">
              {isClockedIn
                ? punchOutStatus.canPunchOut
                  ? '⚡ Punch out active! Retain full points.'
                  : '⏳ Punch out opens at 9:00 PM'
                : isClockedOut
                ? '✓ Shift completed on time'
                : punchInStatus.canPunchIn
                ? `⚡ ${punchInStatus.badgeText}`
                : punchInStatus.badgeText}
            </span>
            <button
              onClick={() => setShowSimulator(!showSimulator)}
              className="text-indigo-600 dark:text-indigo-400 font-semibold hover:underline flex items-center gap-1 text-[11px]"
            >
              Test Simulator <Timer className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>

      {/* Real-time Quick Action Bar */}
      <div className="card p-3.5 bg-gradient-to-r from-[var(--color-card)] via-[var(--color-muted)]/20 to-[var(--color-card)] border border-[var(--color-border)] rounded-xl flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Clock className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-[var(--color-foreground)]">
                Today's Shift: {effectiveTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}
              </span>
              <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-semibold border', punchInStatus.badgeColor)}>
                {isClockedIn ? 'Active Shift' : isClockedOut ? 'Completed' : punchInStatus.badgeText}
              </span>
            </div>
            <p className="text-[11px] text-[var(--color-muted-foreground)]">
              {isClockedIn
                ? `Checked in at ${todayRecord?.checkIn}. ${punchOutStatus.canPunchOut ? 'Punch out is OPEN!' : 'Punch out opens 9:00 PM – 10:00 PM.'}`
                : isClockedOut
                ? `Shift concluded (${todayRecord?.checkIn} – ${todayRecord?.checkOut}). Total: ${todayRecord?.workingHours || 'Logged'}`
                : punchInStatus.tooltip}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          {/* Dynamic Punch Button */}
          {isClockedIn ? (
            <Button
              size="sm"
              variant={punchOutStatus.canPunchOut ? 'destructive' : 'outline'}
              disabled={!punchOutStatus.canPunchOut || isPunching}
              onClick={handleQuickPunchOut}
              className={cn(
                'text-xs font-semibold gap-1.5 shadow-xs',
                !punchOutStatus.canPunchOut && 'opacity-60 cursor-not-allowed'
              )}
              title={punchOutStatus.tooltip}
            >
              <LogOut className="w-3.5 h-3.5" />
              {isPunching ? 'Clocking Out...' : punchOutStatus.canPunchOut ? 'Punch Out Now' : 'Punch Out (9–10 PM)'}
            </Button>
          ) : isClockedOut ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => navigate(attendancePath)}
              className="text-xs font-semibold gap-1.5"
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              Day Completed
            </Button>
          ) : (
            <Button
              size="sm"
              variant="primary"
              disabled={!punchInStatus.canPunchIn || isPunching}
              onClick={handleQuickPunchIn}
              className={cn(
                'text-xs font-semibold gap-1.5 shadow-xs bg-emerald-600 hover:bg-emerald-700 text-white',
                !punchInStatus.canPunchIn && 'opacity-60 cursor-not-allowed bg-muted text-muted-foreground hover:bg-muted'
              )}
              title={punchInStatus.tooltip}
            >
              <LogIn className="w-3.5 h-3.5" />
              {isPunching ? 'Recording...' : punchInStatus.canPunchIn ? `Punch In (${punchInStatus.expectedPoints} Pts)` : punchInStatus.label}
            </Button>
          )}

          {(isClockedIn || isClockedOut || todayRecord?.checkIn) && (
            <button
              onClick={handleResetToday}
              disabled={isPunching}
              className="text-[11px] text-[var(--color-muted-foreground)] hover:text-red-500 underline ml-1 cursor-pointer"
              title="Reset today's attendance"
            >
              Reset Today
            </button>
          )}

          <Button
            size="sm"
            variant="ghost"
            onClick={() => navigate(attendancePath)}
            className="text-xs text-[var(--color-primary)] gap-1 px-2.5"
          >
            Attendance Page <ArrowRight className="w-3 h-3" />
          </Button>
        </div>
      </div>

      {/* Rules Explanatory Modal */}
      {showRulesModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-2xl max-w-lg w-full p-6 shadow-2xl relative space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-600 flex items-center justify-center">
                  <Flame className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold">Attendance & Points Policy</h3>
                  <p className="text-xs text-[var(--color-muted-foreground)]">Official Hyna punctuality scoring guidelines</p>
                </div>
              </div>
              <button
                onClick={() => setShowRulesModal(false)}
                className="p-1 rounded-lg hover:bg-[var(--color-muted)] text-[var(--color-muted-foreground)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs leading-relaxed">
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 space-y-1">
                <span className="font-bold text-emerald-700 dark:text-emerald-300 block">
                  1. Punch-In Window (9:00 AM – 10:15 AM)
                </span>
                <p className="text-[var(--color-foreground)]">
                  • <strong>Before 9:00 AM:</strong> Punch In is disabled / unclickable.<br />
                  • <strong>9:00 AM – 10:00 AM:</strong> Active Punch In = <strong>+10 Points</strong> (On-time).<br />
                  • <strong>10:00 AM – 10:15 AM:</strong> Active Punch In = <strong>+5 Points</strong> (Grace Window).<br />
                  • <strong>After 10:15 AM:</strong> Punch In disabled for the remainder of the day (0 Points).
                </p>
              </div>

              <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 space-y-1">
                <span className="font-bold text-blue-700 dark:text-blue-300 block">
                  2. Punch-Out Window (9:00 PM – 10:00 PM)
                </span>
                <p className="text-[var(--color-foreground)]">
                  • <strong>Before 9:00 PM:</strong> Punch Out is disabled until shift conclusion.<br />
                  • <strong>9:00 PM – 10:00 PM:</strong> Active Punch Out. Punch out here to <strong>keep full points</strong> (10 or 5 pts).<br />
                  • <strong>After 10:00 PM:</strong> Punch Out is disabled.
                </p>
              </div>

              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 space-y-1">
                <span className="font-bold text-red-700 dark:text-red-300 block">
                  3. Missed Punch-Out Penalty
                </span>
                <p className="text-[var(--color-foreground)]">
                  Failing to punch out by 10:00 PM incurs an automatic point deduction:<br />
                  • <strong>10 Points</strong> earned at check-in is reduced to <strong>5 Points</strong>.<br />
                  • <strong>5 Points</strong> earned at check-in is reduced to <strong>2 Points</strong>.
                </p>
              </div>

              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 space-y-1">
                <span className="font-bold text-amber-700 dark:text-amber-300 block">
                  4. Daily Streaks
                </span>
                <p className="text-[var(--color-foreground)]">
                  Maintain an unbroken sequence of daily check-ins within the active window (9:00 AM – 10:15 AM) to build your organizational streak!
                </p>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <Button onClick={() => setShowRulesModal(false)} size="sm">
                Understood
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
