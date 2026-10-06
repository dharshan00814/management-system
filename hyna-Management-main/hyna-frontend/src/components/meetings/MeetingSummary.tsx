// ============================================================
// Hyna Studio Management - Post-Meeting Attendance Summary
// Comprehensive Duration & Attendance Report
// ============================================================

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  CheckCircle2, Clock, Users, ArrowLeft, Calendar, 
  FileText, Download, ShieldCheck
} from 'lucide-react';
import { Button, Avatar, Badge } from '@/components/ui';
import { fetchMeetingAttendanceSummary } from '@/services/meetingService';
import { getUsers, getUserById } from '@/services/api';
import type { Meeting, MeetingAttendance } from '@/types/meeting';
import type { User } from '@/types';
import { formatDate, formatTime } from '@/lib/utils';

export interface MeetingSummaryProps {
  meeting: Meeting | null;
  onBackToMeetings: () => void;
}

export function MeetingSummary({ meeting, onBackToMeetings }: MeetingSummaryProps) {
  const [attendance, setAttendance] = useState<MeetingAttendance[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    async function loadSummary() {
      try {
        const users = await getUsers();
        if (isMounted) setAllUsers(users);

        if (meeting?.id) {
          const summary = await fetchMeetingAttendanceSummary(meeting.id);
          if (isMounted) setAttendance(summary);
        }
      } catch (err) {
        console.error('Error loading attendance summary:', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }
    loadSummary();
    return () => { isMounted = false; };
  }, [meeting]);

  const invitedMemberIds = meeting?.participantIds || [];

  // Merge invited participants with recorded attendance
  const summaryRows = invitedMemberIds.map(memberId => {
    const user = allUsers.find(u => u.id === memberId) || getUserById(memberId);
    const record = attendance.find(a => a.memberId === memberId);

    const isPresent = Boolean(record && record.joinedAt);
    const durationMinutes = record ? Math.ceil((record.durationSeconds || 0) / 60) : 0;

    return {
      memberId,
      name: user?.name || 'Team Member',
      avatar: user?.avatar || '',
      role: user?.designation || user?.role || 'Member',
      joinedAt: record?.joinedAt ? new Date(record.joinedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—',
      leftAt: record?.leftAt ? new Date(record.leftAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—',
      durationMinutes,
      status: isPresent ? (record?.status || 'joined') : 'absent',
    };
  });

  return (
    <div className="min-h-screen w-full bg-[#0a0a0c] text-white flex flex-col items-center justify-center p-4 md:p-8">
      <div className="max-w-3xl w-full bg-[#131317] border border-white/10 rounded-2xl p-6 md:p-8 shadow-2xl space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-white/10">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="p-1 rounded-full bg-emerald-500/20 text-emerald-400">
                <CheckCircle2 className="w-4 h-4" />
              </span>
              <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
                Meeting Concluded
              </span>
            </div>
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-white">
              {meeting?.title || 'Team Meeting'}
            </h1>
            <p className="text-xs text-white/50 mt-1">
              {meeting?.date ? formatDate(meeting.date) : 'Today'} • {meeting?.startTime ? formatTime(meeting.startTime) : ''}
            </p>
          </div>

          <Button
            variant="primary"
            size="sm"
            onClick={onBackToMeetings}
            className="bg-white text-black hover:bg-white/90 text-xs rounded-xl"
          >
            <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
            Back to Meetings
          </Button>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="p-3.5 bg-white/5 rounded-xl border border-white/5">
            <span className="text-[11px] text-white/40 block">Invited Team</span>
            <span className="text-base font-semibold text-white mt-1 block">
              {invitedMemberIds.length} Members
            </span>
          </div>

          <div className="p-3.5 bg-white/5 rounded-xl border border-white/5">
            <span className="text-[11px] text-white/40 block">Attendance Rate</span>
            <span className="text-base font-semibold text-emerald-400 mt-1 block">
              {summaryRows.filter(r => r.status !== 'absent').length} / {invitedMemberIds.length || 1}
            </span>
          </div>

          <div className="p-3.5 bg-white/5 rounded-xl border border-white/5 col-span-2 sm:col-span-1">
            <span className="text-[11px] text-white/40 block">Session Mode</span>
            <span className="text-base font-semibold text-white capitalize mt-1 block">
              {meeting?.meetingType === 'audio' ? 'Group Audio' : 'Group Video'}
            </span>
          </div>
        </div>

        {/* Attendance Table */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-white/60">
              Verified Attendance Roster
            </h3>
            <span className="text-[11px] text-white/40">
              Automatically saved to database
            </span>
          </div>

          <div className="border border-white/10 rounded-xl overflow-hidden bg-black/30">
            <div className="grid grid-cols-12 text-[11px] font-semibold text-white/50 p-3 bg-white/5 border-b border-white/10">
              <span className="col-span-5">Member</span>
              <span className="col-span-2 text-center">Joined</span>
              <span className="col-span-2 text-center">Left</span>
              <span className="col-span-3 text-right">Duration / Status</span>
            </div>

            <div className="divide-y divide-white/5 text-xs max-h-72 overflow-y-auto">
              {summaryRows.map(row => (
                <div key={row.memberId} className="grid grid-cols-12 items-center p-3 hover:bg-white/5 transition-colors">
                  <div className="col-span-5 flex items-center gap-2.5 min-w-0 pr-2">
                    <Avatar name={row.name} src={row.avatar} className="w-7 h-7 text-[10px] shrink-0" />
                    <div className="min-w-0">
                      <p className="font-medium text-white truncate">{row.name}</p>
                      <p className="text-[10px] text-white/40 truncate">{row.role}</p>
                    </div>
                  </div>

                  <span className="col-span-2 text-center text-white/70 text-[11px]">
                    {row.joinedAt}
                  </span>

                  <span className="col-span-2 text-center text-white/70 text-[11px]">
                    {row.leftAt}
                  </span>

                  <div className="col-span-3 text-right">
                    {row.status === 'absent' ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-500/10 text-red-400 border border-red-500/20">
                        Absent
                      </span>
                    ) : (
                      <div className="flex flex-col items-end">
                        <span className="font-medium text-emerald-400">
                          {row.durationMinutes} min
                        </span>
                        <span className="text-[10px] text-white/40 capitalize">
                          {row.status}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer info */}
        <div className="pt-2 text-center text-[11px] text-white/40">
          Attendance has been recorded in the permanent organization audit log.
        </div>
      </div>
    </div>
  );
}
