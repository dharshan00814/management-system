import { describe, it, expect } from 'vitest';
import {
  parseTimeToMinutes,
  getPunchInStatus,
  getPunchOutStatus,
  calculateRecordPoints,
  calculateUserStreakAndPoints,
  POINTS_ON_TIME,
  POINTS_GRACE,
  POINTS_MISSED_PUNCHOUT_10,
  POINTS_MISSED_PUNCHOUT_5,
} from '@/lib/attendanceRules';
import type { AttendanceRecord } from '@/types';

describe('Attendance Points & Streak Timing Rules', () => {
  const createMockDate = (hours: number, minutes: number): Date => {
    const d = new Date('2026-10-01T00:00:00Z');
    d.setHours(hours, minutes, 0, 0);
    return d;
  };

  describe('1. Punch In Window Rules', () => {
    it('disables punch-in before 9:00 AM (unclickable)', () => {
      const timeBefore9 = createMockDate(8, 59);
      const status = getPunchInStatus(timeBefore9);
      expect(status.canPunchIn).toBe(false);
      expect(status.phase).toBe('before_9am');
      expect(status.label).toContain('Opens at 9:00 AM');
    });

    it('enables punch-in between 9:00 AM and 10:00 AM and awards 10 points', () => {
      const time9am = createMockDate(9, 0);
      const status9am = getPunchInStatus(time9am);
      expect(status9am.canPunchIn).toBe(true);
      expect(status9am.phase).toBe('on_time');
      expect(status9am.expectedPoints).toBe(POINTS_ON_TIME); // 10

      const time930am = createMockDate(9, 30);
      const status930am = getPunchInStatus(time930am);
      expect(status930am.canPunchIn).toBe(true);
      expect(status930am.phase).toBe('on_time');
      expect(status930am.expectedPoints).toBe(POINTS_ON_TIME); // 10

      const time10am = createMockDate(10, 0);
      const status10am = getPunchInStatus(time10am);
      expect(status10am.canPunchIn).toBe(true);
      expect(status10am.phase).toBe('on_time');
      expect(status10am.expectedPoints).toBe(POINTS_ON_TIME); // 10
    });

    it('enables punch-in between 10:00 AM and 10:15 AM (grace period) and awards 5 points', () => {
      const time1005am = createMockDate(10, 5);
      const status = getPunchInStatus(time1005am);
      expect(status.canPunchIn).toBe(true);
      expect(status.phase).toBe('grace_period');
      expect(status.expectedPoints).toBe(POINTS_GRACE); // 5

      const time1015am = createMockDate(10, 15);
      const status1015 = getPunchInStatus(time1015am);
      expect(status1015.canPunchIn).toBe(true);
      expect(status1015.phase).toBe('grace_period');
      expect(status1015.expectedPoints).toBe(POINTS_GRACE); // 5
    });

    it('disables punch-in after 10:15 AM (unclickable)', () => {
      const time1016am = createMockDate(10, 16);
      const status = getPunchInStatus(time1016am);
      expect(status.canPunchIn).toBe(false);
      expect(status.phase).toBe('after_1015am');
      expect(status.expectedPoints).toBe(0);
      expect(status.label).toContain('Closed');

      const time12pm = createMockDate(12, 0);
      expect(getPunchInStatus(time12pm).canPunchIn).toBe(false);
    });
  });

  describe('2. Punch Out Window Rules', () => {
    it('disables punch-out before 9:00 PM (21:00)', () => {
      const time8pm = createMockDate(20, 59);
      const status = getPunchOutStatus(time8pm, '09:15 AM');
      expect(status.canPunchOut).toBe(false);
      expect(status.phase).toBe('before_9pm');
      expect(status.label).toContain('Opens at 9:00 PM');
    });

    it('enables punch-out between 9:00 PM (21:00) and 10:00 PM (22:00)', () => {
      const time9pm = createMockDate(21, 0);
      const status9pm = getPunchOutStatus(time9pm, '09:15 AM');
      expect(status9pm.canPunchOut).toBe(true);
      expect(status9pm.phase).toBe('active_window');

      const time930pm = createMockDate(21, 30);
      const status930pm = getPunchOutStatus(time930pm, '09:15 AM');
      expect(status930pm.canPunchOut).toBe(true);
      expect(status930pm.phase).toBe('active_window');

      const time10pm = createMockDate(22, 0);
      const status10pm = getPunchOutStatus(time10pm, '09:15 AM');
      expect(status10pm.canPunchOut).toBe(true);
      expect(status10pm.phase).toBe('active_window');
    });

    it('disables punch-out after 10:00 PM (22:00)', () => {
      const time1001pm = createMockDate(22, 1);
      const status = getPunchOutStatus(time1001pm, '09:15 AM');
      expect(status.canPunchOut).toBe(false);
      expect(status.phase).toBe('after_10pm');
      expect(status.label).toContain('Closed');
    });
  });

  describe('3. Points & Penalty Calculation', () => {
    it('retains 10 points when punch-in is 9-10 AM and punch-out is 9-10 PM', () => {
      const record: AttendanceRecord = {
        id: 'att_1',
        userId: 'user_1',
        date: '2026-10-01',
        status: 'present',
        checkIn: '09:20 AM',
        checkOut: '09:45 PM',
      };
      const evalRes = calculateRecordPoints(record);
      expect(evalRes.basePoints).toBe(10);
      expect(evalRes.finalPoints).toBe(10);
      expect(evalRes.penaltyApplied).toBe(false);
    });

    it('retains 5 points when punch-in is 10-10:15 AM and punch-out is 9-10 PM', () => {
      const record: AttendanceRecord = {
        id: 'att_2',
        userId: 'user_1',
        date: '2026-10-01',
        status: 'late',
        checkIn: '10:08 AM',
        checkOut: '09:30 PM',
      };
      const evalRes = calculateRecordPoints(record);
      expect(evalRes.basePoints).toBe(5);
      expect(evalRes.finalPoints).toBe(5);
      expect(evalRes.penaltyApplied).toBe(false);
    });

    it('applies penalty (10 pts -> 5 pts) when user failed to punch out after 10:00 PM', () => {
      const recordPast: AttendanceRecord = {
        id: 'att_3',
        userId: 'user_1',
        date: '2026-09-30', // past day without checkout
        status: 'present',
        checkIn: '09:15 AM',
        checkOut: undefined,
      };
      const evalRes = calculateRecordPoints(recordPast);
      expect(evalRes.basePoints).toBe(10);
      expect(evalRes.finalPoints).toBe(POINTS_MISSED_PUNCHOUT_10); // 5
      expect(evalRes.penaltyApplied).toBe(true);
    });

    it('applies penalty (5 pts -> 2 pts) when late grace user failed to punch out after 10:00 PM', () => {
      const recordPast: AttendanceRecord = {
        id: 'att_4',
        userId: 'user_1',
        date: '2026-09-30', // past day without checkout
        status: 'late',
        checkIn: '10:10 AM',
        checkOut: undefined,
      };
      const evalRes = calculateRecordPoints(recordPast);
      expect(evalRes.basePoints).toBe(5);
      expect(evalRes.finalPoints).toBe(POINTS_MISSED_PUNCHOUT_5); // 2
      expect(evalRes.penaltyApplied).toBe(true);
    });

    it('applies penalty if today is past 10:00 PM without punch-out', () => {
      const currentTimeAfter10pm = createMockDate(22, 30);
      const todayStr = currentTimeAfter10pm.toISOString().split('T')[0];
      const recordToday: AttendanceRecord = {
        id: 'att_5',
        userId: 'user_1',
        date: todayStr,
        status: 'present',
        checkIn: '09:30 AM',
        checkOut: undefined,
      };
      const evalRes = calculateRecordPoints(recordToday, currentTimeAfter10pm);
      expect(evalRes.finalPoints).toBe(POINTS_MISSED_PUNCHOUT_10); // 5
      expect(evalRes.penaltyApplied).toBe(true);
    });

    it('keeps full points pending during workday if today is before 10:00 PM', () => {
      const currentTimeMidday = createMockDate(14, 0); // 2:00 PM
      const todayStr = currentTimeMidday.toISOString().split('T')[0];
      const recordToday: AttendanceRecord = {
        id: 'att_6',
        userId: 'user_1',
        date: todayStr,
        status: 'present',
        checkIn: '09:30 AM',
        checkOut: undefined,
      };
      const evalRes = calculateRecordPoints(recordToday, currentTimeMidday);
      expect(evalRes.finalPoints).toBe(10);
      expect(evalRes.penaltyApplied).toBe(false);
    });
  });

  describe('4. Daily Streak Calculation', () => {
    it('calculates consecutive attended days', () => {
      const now = new Date('2026-10-01T10:00:00Z');
      const records: AttendanceRecord[] = [
        { id: '1', userId: 'u1', date: '2026-10-01', status: 'present', checkIn: '09:15 AM' },
        { id: '2', userId: 'u1', date: '2026-09-30', status: 'present', checkIn: '09:20 AM', checkOut: '09:30 PM' },
        { id: '3', userId: 'u1', date: '2026-09-29', status: 'present', checkIn: '09:10 AM', checkOut: '09:40 PM' },
      ];

      const streakData = calculateUserStreakAndPoints(records, 'u1', now);
      expect(streakData.currentStreak).toBe(3);
      expect(streakData.todayPoints).toBe(10);
      expect(streakData.totalPoints).toBe(30);
    });
  });
});
