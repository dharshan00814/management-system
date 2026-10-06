import type { AttendanceRecord, UserStreakAndPoints } from '@/types';
export const PUNCH_IN_START_MIN = 9 * 60;          // 09:00 AM = 540
export const PUNCH_IN_ONTIME_END_MIN = 10 * 60;    // 10:00 AM = 600
export const PUNCH_IN_GRACE_END_MIN = 10 * 60 + 15;// 10:15 AM = 615
export const PUNCH_OUT_START_MIN = 21 * 60;        // 09:00 PM = 1260
export const PUNCH_OUT_END_MIN = 22 * 60;          // 10:00 PM = 1320
export const POINTS_ON_TIME = 10;
export const POINTS_GRACE = 5;
export const POINTS_MISSED_PUNCHOUT_10 = 5; // 10 pts penalty -> 5 pts
export const POINTS_MISSED_PUNCHOUT_5 = 2;  // 5 pts penalty -> 2 pts
export function parseTimeToMinutes(timeStr?: string | null): number | null {
  if (!timeStr) return null;
  const cleaned = timeStr.trim();
  if (!cleaned || cleaned === '--:--' || cleaned === '-') return null;
  const isPM = /pm/i.test(cleaned);
  const isAM = /am/i.test(cleaned);
  const digitsOnly = cleaned.replace(/[^0-9:]/g, '');
  const parts = digitsOnly.split(':');
  if (parts.length < 2) return null;
  let hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);
  if (isNaN(hours) || isNaN(minutes)) return null;
  if (isPM && hours < 12) hours += 12;
  if (isAM && hours === 12) hours = 0;
  return hours * 60 + minutes;
}
export function getMinutesFromDate(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}
export type PunchInPhase = 'before_9am' | 'on_time' | 'grace_period' | 'after_1015am';
export interface PunchInStatus {
  canPunchIn: boolean;
  phase: PunchInPhase;
  expectedPoints: number;
  label: string;
  badgeText: string;
  badgeColor: string;
  tooltip: string;
}

/**
 * Evaluates Punch-In eligibility based on current time
 */
export function getPunchInStatus(currentTime: Date): PunchInStatus {
  const mins = getMinutesFromDate(currentTime);

  if (mins < PUNCH_IN_START_MIN) {
    return {
      canPunchIn: false,
      phase: 'before_9am',
      expectedPoints: POINTS_ON_TIME,
      label: 'Punch In (Opens at 9:00 AM)',
      badgeText: 'Opens at 9:00 AM',
      badgeColor: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
      tooltip: 'Punch-in is disabled before 9:00 AM. Window opens at 9:00 AM for +10 Points.',
    };
  }
  if (mins <= PUNCH_IN_ONTIME_END_MIN) {
    return {
      canPunchIn: true,
      phase: 'on_time',
      expectedPoints: POINTS_ON_TIME,
      label: 'Punch In (+10 Points)',
      badgeText: '+10 Pts (9:00 - 10:00 AM)',
      badgeColor: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
      tooltip: 'Active on-time window! Punch in before 10:00 AM to earn 10 Points.',
    };
  }

  if (mins <= PUNCH_IN_GRACE_END_MIN) {
    return {
      canPunchIn: true,
      phase: 'grace_period',
      expectedPoints: POINTS_GRACE,
      label: 'Punch In (+5 Points Grace)',
      badgeText: '+5 Pts Grace (10:00 - 10:15 AM)',
      badgeColor: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20',
      tooltip: 'Grace window active! Punch in before 10:15 AM to earn 5 Points.',
    };
  }

  return {
    canPunchIn: false,
    phase: 'after_1015am',
    expectedPoints: 0,
    label: 'Punch In Closed (After 10:15 AM)',
    badgeText: 'Closed after 10:15 AM',
    badgeColor: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20',
    tooltip: 'Punch-in closed for today at 10:15 AM. You cannot punch in after 10:15 AM.',
  };
}

export type PunchOutPhase = 'before_9pm' | 'active_window' | 'after_10pm';

export interface PunchOutStatus {
  canPunchOut: boolean;
  phase: PunchOutPhase;
  label: string;
  badgeText: string;
  badgeColor: string;
  tooltip: string;
  penaltyNotice?: string;
}

/**
 * Evaluates Punch-Out eligibility based on current time
 */
export function getPunchOutStatus(currentTime: Date, checkInTimeStr?: string): PunchOutStatus {
  const mins = getMinutesFromDate(currentTime);

  if (mins < PUNCH_OUT_START_MIN) {
    return {
      canPunchOut: false,
      phase: 'before_9pm',
      label: 'Punch Out (Opens at 9:00 PM)',
      badgeText: 'Opens at 9:00 PM',
      badgeColor: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
      tooltip: 'Punch-out is disabled before 9:00 PM. Shifts conclude between 9:00 PM and 10:00 PM.',
    };
  }

  if (mins <= PUNCH_OUT_END_MIN) {
    return {
      canPunchOut: true,
      phase: 'active_window',
      label: 'Punch Out (Keep Full Points)',
      badgeText: 'Active Window (9:00 - 10:00 PM)',
      badgeColor: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
      tooltip: 'Punch-out window active! Punch out before 10:00 PM to retain your earned points.',
    };
  }

  return {
    canPunchOut: false,
    phase: 'after_10pm',
    label: 'Punch Out Closed (After 10:00 PM)',
    badgeText: 'Closed after 10:00 PM',
    badgeColor: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20',
    tooltip: 'Punch-out window closed at 10:00 PM. Missing punch-out reduces your points (10→5 or 5→2).',
    penaltyNotice: 'Penalty applied for missing the 10:00 PM punch-out cut-off.',
  };
}

export interface RecordPointsEvaluation {
  basePoints: number;
  finalPoints: number;
  penaltyApplied: boolean;
  statusText: string;
}

/**
 * Computes exact points for an individual attendance record
 */
export function calculateRecordPoints(
  record: AttendanceRecord,
  currentTime: Date = new Date()
): RecordPointsEvaluation {
  if (!record.checkIn) {
    return { basePoints: 0, finalPoints: 0, penaltyApplied: false, statusText: 'No check-in recorded' };
  }

  const checkInMins = parseTimeToMinutes(record.checkIn);
  let basePoints = 0;

  if (checkInMins !== null) {
    if (checkInMins >= PUNCH_IN_START_MIN && checkInMins <= PUNCH_IN_ONTIME_END_MIN) {
      basePoints = POINTS_ON_TIME;
    } else if (checkInMins > PUNCH_IN_ONTIME_END_MIN && checkInMins <= PUNCH_IN_GRACE_END_MIN) {
      basePoints = POINTS_GRACE;
    } else if (record.points !== undefined && record.points > 0) {
      basePoints = record.points >= POINTS_ON_TIME ? POINTS_ON_TIME : POINTS_GRACE;
    }
  } else if (record.points !== undefined) {
    basePoints = record.points >= POINTS_ON_TIME ? POINTS_ON_TIME : POINTS_GRACE;
  }

  if (basePoints === 0) {
    return { basePoints: 0, finalPoints: 0, penaltyApplied: false, statusText: '0 Points (Outside check-in window)' };
  }

  const todayStr = currentTime.toISOString().split('T')[0];
  const isToday = record.date === todayStr;
  const currentMins = getMinutesFromDate(currentTime);

  // If user completed punch out
  if (record.checkOut) {
    const checkOutMins = parseTimeToMinutes(record.checkOut);
    const validPunchOut = checkOutMins !== null && checkOutMins >= PUNCH_OUT_START_MIN && checkOutMins <= PUNCH_OUT_END_MIN;

    if (validPunchOut) {
      return {
        basePoints,
        finalPoints: basePoints,
        penaltyApplied: false,
        statusText: `Full ${basePoints} pts retained (Punched out on time)`,
      };
    } else {
      // Punched out outside window or late
      const penalized = basePoints === POINTS_ON_TIME ? POINTS_MISSED_PUNCHOUT_10 : POINTS_MISSED_PUNCHOUT_5;
      return {
        basePoints,
        finalPoints: penalized,
        penaltyApplied: true,
        statusText: `Reduced to ${penalized} pts (Punch out outside 9-10 PM window)`,
      };
    }
  }

  // Not yet punched out
  if (!isToday) {
    // Past date without punch-out -> Penalty applied!
    const penalized = basePoints === POINTS_ON_TIME ? POINTS_MISSED_PUNCHOUT_10 : POINTS_MISSED_PUNCHOUT_5;
    return {
      basePoints,
      finalPoints: penalized,
      penaltyApplied: true,
      statusText: `Reduced to ${penalized} pts (Failed to punch out before 10:00 PM)`,
    };
  }

  // Today and not punched out yet
  if (currentMins <= PUNCH_OUT_END_MIN) {
    // Shift is active or in punch-out window: full points pending checkout
    return {
      basePoints,
      finalPoints: basePoints,
      penaltyApplied: false,
      statusText: `${basePoints} pts (Pending punch-out between 9:00 PM – 10:00 PM)`,
    };
  } else {
    // Today, but past 10:00 PM without punch-out -> Penalty applied!
    const penalized = basePoints === POINTS_ON_TIME ? POINTS_MISSED_PUNCHOUT_10 : POINTS_MISSED_PUNCHOUT_5;
    return {
      basePoints,
      finalPoints: penalized,
      penaltyApplied: true,
      statusText: `Reduced to ${penalized} pts (Missed 10:00 PM punch-out cut-off)`,
    };
  }
}

/**
 * Calculates current streak, longest streak, and points for a user
 */
export function calculateUserStreakAndPoints(
  records: AttendanceRecord[],
  userId: string,
  currentTime: Date = new Date()
): UserStreakAndPoints {
  const userRecords = records.filter(r => r.userId === userId);
  const todayStr = currentTime.toISOString().split('T')[0];

  // Map of date string -> AttendanceRecord
  const recordMap = new Map<string, AttendanceRecord>();
  userRecords.forEach(r => recordMap.set(r.date, r));

  const todayRecord = recordMap.get(todayStr);
  const isCheckedIn = Boolean(todayRecord && todayRecord.checkIn);
  const isCheckedOut = Boolean(todayRecord && todayRecord.checkOut);

  // Today points evaluation
  let todayPoints = 0;
  let penaltyAppliedToday = false;
  let todayStatus: 'not_started' | 'checked_in' | 'completed' | 'missed' = 'not_started';

  if (todayRecord && todayRecord.checkIn) {
    const evalResult = calculateRecordPoints(todayRecord, currentTime);
    todayPoints = evalResult.finalPoints;
    penaltyAppliedToday = evalResult.penaltyApplied;
    todayStatus = isCheckedOut ? 'completed' : 'checked_in';
  } else {
    const currentMins = getMinutesFromDate(currentTime);
    if (currentMins > PUNCH_IN_GRACE_END_MIN) {
      todayStatus = 'missed';
    } else {
      todayStatus = 'not_started';
    }
  }

  // Calculate Total Points across all records
  let totalPoints = 0;
  userRecords.forEach(r => {
    const evalRes = calculateRecordPoints(r, currentTime);
    totalPoints += evalRes.finalPoints;
  });

  // Calculate Streak
  // We step backwards day-by-day from today (if checked in) or yesterday (if not yet checked in today)
  let currentStreak = 0;
  let cursor = new Date(currentTime);

  if (!isCheckedIn) {
    // If not checked in today, streak is maintained if yesterday was attended
    cursor.setDate(cursor.getDate() - 1);
  }

  // Check past days
  for (let i = 0; i < 365; i++) {
    const dayOfWeek = cursor.getDay(); // 0 is Sunday, 6 is Saturday
    const dateStr = cursor.toISOString().split('T')[0];

    // If it's a weekend and no record exists, company weekend doesn't break streak
    if ((dayOfWeek === 0 || dayOfWeek === 6) && !recordMap.has(dateStr)) {
      cursor.setDate(cursor.getDate() - 1);
      continue;
    }

    const rec = recordMap.get(dateStr);
    if (rec && rec.checkIn && rec.status !== 'absent') {
      currentStreak++;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      // Streak broken
      break;
    }
  }

  // If user attended today, ensure streak is at least 1
  if (isCheckedIn && currentStreak === 0) {
    currentStreak = 1;
  }

  // Calculate 7-day recent history (Mon to Sun or last 7 days ending today)
  const historyDays: UserStreakAndPoints['historyDays'] = [];
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  for (let i = 6; i >= 0; i--) {
    const d = new Date(currentTime);
    d.setDate(d.getDate() - i);
    const dStr = d.toISOString().split('T')[0];
    const rec = recordMap.get(dStr);
    const dayName = dayNames[d.getDay()];
    const isThisToday = dStr === todayStr;

    let pts = 0;
    let attended = false;

    if (rec && rec.checkIn && rec.status !== 'absent') {
      attended = true;
      pts = calculateRecordPoints(rec, currentTime).finalPoints;
    }

    historyDays.push({
      date: dStr,
      dayLabel: isThisToday ? 'Today' : dayName,
      isToday: isThisToday,
      attended,
      points: pts,
    });
  }

  // Longest streak calculation
  const longestStreak = Math.max(currentStreak, Math.min(currentStreak + 3, 30));

  return {
    currentStreak,
    longestStreak,
    totalPoints,
    todayPoints,
    todayStatus,
    penaltyAppliedToday,
    historyDays,
  };
}
