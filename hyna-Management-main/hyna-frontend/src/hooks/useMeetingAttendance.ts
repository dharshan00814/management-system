// ============================================================
// Hyna Studio Management - Automatic Attendance Hook
// Real-Time Attendance Session Tracking & Persistence
// ============================================================

import { useEffect, useRef, useState, useCallback } from 'react';
import { recordParticipantJoined, recordParticipantLeft } from '@/services/meetingService';
import type { MeetingAttendance } from '@/types/meeting';

export function useMeetingAttendance(
  meetingId: string | undefined,
  memberId: string | undefined,
  isJoinedRoom: boolean
) {
  const [attendanceRecord, setAttendanceRecord] = useState<MeetingAttendance | null>(null);
  const [sessionDuration, setSessionDuration] = useState<number>(0);
  const intervalRef = useRef<any>(null);
  const isTrackingRef = useRef<boolean>(false);

  // Mark attendance as joined when user enters the actual room
  useEffect(() => {
    if (!meetingId || !memberId || !isJoinedRoom) {
      return;
    }

    let isMounted = true;
    isTrackingRef.current = true;

    async function initAttendance() {
      try {
        const record = await recordParticipantJoined(meetingId!, memberId!);
        if (isMounted && record) {
          setAttendanceRecord(record);
        }
      } catch (err) {
        console.error('[useMeetingAttendance] Join recording error:', err);
      }
    }

    initAttendance();

    // Start live duration counter
    const startTime = Date.now();
    intervalRef.current = setInterval(() => {
      const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
      setSessionDuration(elapsedSeconds);
    }, 1000);

    return () => {
      isMounted = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }

      // Record departure if was tracking
      if (isTrackingRef.current && meetingId && memberId) {
        recordParticipantLeft(meetingId, memberId).catch(err => {
          console.warn('[useMeetingAttendance] Left recording error:', err);
        });
        isTrackingRef.current = false;
      }
    };
  }, [meetingId, memberId, isJoinedRoom]);

  const finalizeAttendance = useCallback(async () => {
    if (meetingId && memberId && isTrackingRef.current) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      await recordParticipantLeft(meetingId, memberId);
      isTrackingRef.current = false;
    }
  }, [meetingId, memberId]);

  return {
    attendanceRecord,
    sessionDuration,
    finalizeAttendance,
  };
}
