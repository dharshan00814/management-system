// ============================================================
// Hyna Studio Management - WebRTC Meeting Service
// Supabase Database CRUD + Attendance + In-Meeting Chat Persistence
// ============================================================

import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import type { 
  Meeting, 
  MeetingParticipant, 
  MeetingAttendance, 
  MeetingChatMessage, 
  MeetingMediaType, 
  MeetingStatus, 
  MeetingType 
} from '@/types';
import { notifyMeetingScheduled } from './notificationWorkflow';
import { isPurgedMeeting } from './api';

// Helper: Generate secure 6-character clean meeting code (e.g. 8K4X92)
export function generateMeetingCode(): string {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Helper: Generate secure formatted meeting room ID (e.g. room-ab12-cd34-ef56)
// Uses crypto-secure randomness with a Math.random fallback for non-browser runtimes.
export function generateMeetingRoomId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';

  const randomBlock = (length: number): string => {
    let block = '';
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      const randomValues = new Uint32Array(length);
      crypto.getRandomValues(randomValues);
      for (let i = 0; i < length; i++) {
        block += chars.charAt(randomValues[i] % chars.length);
      }
    } else {
      for (let i = 0; i < length; i++) {
        block += chars.charAt(Math.floor(Math.random() * chars.length));
      }
    }
    return block;
  };

  return `room-${randomBlock(4)}-${randomBlock(4)}-${randomBlock(4)}`;
}

// Clean and extract meeting code from raw input (URLs, paths, or code)
export function cleanMeetingCode(input: string): string {
  if (!input) return '';
  let cleaned = input.trim();
  if (cleaned.includes('/meeting/')) {
    cleaned = cleaned.substring(cleaned.lastIndexOf('/meeting/') + 9);
  } else if (cleaned.includes('/')) {
    cleaned = cleaned.substring(cleaned.lastIndexOf('/') + 1);
  }
  return cleaned.replace(/[^a-zA-Z0-9_-]/g, '').trim();
}

// Transform database meeting row to typed Meeting object
export function mapDbMeeting(row: any): Meeting {
  const roomId = row.meeting_room_id || row.id;
  const rawLink = row.meeting_link || '';
  const internalLink = `/meeting/${roomId}`;
  
  return {
    id: row.id,
    title: row.title || 'Untitled Meeting',
    description: row.description || '',
    date: row.date || new Date().toISOString().split('T')[0],
    startTime: row.start_time || '10:00',
    endTime: row.end_time || '11:00',
    hostId: row.host_id || row.created_by || '',
    createdBy: row.created_by || row.host_id,
    participantIds: row.participant_ids || [],
    type: (row.type as MeetingType) || 'team',
    meetingType: (row.meeting_type as MeetingMediaType) || 'video',
    meetingRoomId: roomId,
    meetingCode: roomId,
    isRecurring: Boolean(row.is_recurring),
    meetingLink: rawLink || internalLink,
    notes: row.notes || '',
    status: (row.status as MeetingStatus) || 'scheduled',
    scheduledAt: row.scheduled_at,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ------------------------------------------------------------
// 1. MEETING CRUD OPERATIONS
// ------------------------------------------------------------

export async function fetchAllMeetings(userId?: string): Promise<Meeting[]> {
  if (!isSupabaseConfigured()) {
    return [];
  }

  try {
    let query = supabase
      .from('meetings')
      .select('*')
      .order('date', { ascending: false })
      .order('start_time', { ascending: false });

    const { data, error } = await query;
    if (error) {
      console.warn('[MeetingService] Error fetching meetings:', error.message);
      return [];
    }

    const meetings = (data || []).map(mapDbMeeting).filter(m => !isPurgedMeeting(m));

    if (userId) {
      const uIdUpper = userId.toUpperCase();
      return meetings.filter(m => 
        m.hostId === userId || 
        m.createdBy === userId ||
        (m.hostId && m.hostId.toUpperCase() === uIdUpper) ||
        (m.participantIds || []).some(p => p === userId || p.toUpperCase() === uIdUpper) ||
        m.type === 'team' ||
        m.type === 'standup'
      );
    }

    return meetings;
  } catch (err) {
    console.error('[MeetingService] fetchAllMeetings exception:', err);
    return [];
  }
}

export async function fetchMeetingByIdOrRoomId(rawIdentifier: string): Promise<Meeting | null> {
  const identifier = cleanMeetingCode(rawIdentifier);
  if (!identifier) return null;

  if (isSupabaseConfigured()) {
    try {
      // 1. Search by meeting_room_id (case insensitive)
      const { data: byRoom, error: roomErr } = await supabase
        .from('meetings')
        .select('*')
        .ilike('meeting_room_id', identifier)
        .maybeSingle();

      if (!roomErr && byRoom) {
        return mapDbMeeting(byRoom);
      }

      // 2. Search by meeting_link
      const { data: byLink, error: linkErr } = await supabase
        .from('meetings')
        .select('*')
        .ilike('meeting_link', `%${identifier}%`)
        .maybeSingle();

      if (!linkErr && byLink) {
        return mapDbMeeting(byLink);
      }

      // 3. Search by primary key ID
      const { data: byId, error: idErr } = await supabase
        .from('meetings')
        .select('*')
        .eq('id', identifier)
        .maybeSingle();

      if (!idErr && byId) {
        return mapDbMeeting(byId);
      }
    } catch (err) {
      console.error('[MeetingService] fetchMeetingByIdOrRoomId error:', err);
    }
  }

  return null;
}

export interface CreateMeetingInput {
  title: string;
  description?: string;
  date: string;
  startTime: string;
  endTime?: string;
  type?: MeetingType;
  meetingType?: MeetingMediaType;
  meetingRoomId?: string;
  status?: MeetingStatus;
  participantIds: string[];
  hostId: string;
  notes?: string;
  isRecurring?: boolean;
}

export async function createNewMeeting(input: CreateMeetingInput): Promise<Meeting> {
  const roomId = input.meetingRoomId || generateMeetingCode();
  const newId = 'mt_' + Math.random().toString(36).slice(2, 10);
  const meetingLink = `/meeting/${roomId}`;
  const now = new Date().toISOString();

  const payload: Record<string, any> = {
    id: newId,
    title: input.title.trim(),
    description: (input.description || '').trim(),
    date: input.date,
    start_time: input.startTime,
    end_time: input.endTime || '11:00',
    host_id: input.hostId,
    created_by: input.hostId,
    participant_ids: input.participantIds,
    type: input.type || 'team',
    meeting_type: input.meetingType || 'video',
    meeting_room_id: roomId,
    meeting_link: meetingLink,
    notes: (input.notes || '').trim(),
    is_recurring: Boolean(input.isRecurring),
    status: input.status || 'scheduled',
    created_at: now,
    updated_at: now,
  };

  if (input.status === 'live' || input.status === 'in-progress') {
    payload.started_at = now;
  }

  if (isSupabaseConfigured()) {
    try {
      const { data, error } = await supabase
        .from('meetings')
        .insert([payload])
        .select()
        .single();

      if (error) {
        console.error('[MeetingService] Failed to insert meeting into Supabase:', error.message);
      } else if (data) {
        // Automatically create meeting_participants records
        const participantsToInsert = input.participantIds.map(memberId => ({
          meeting_id: data.id,
          member_id: memberId,
          user_id: memberId,
          invited_by: input.hostId,
          status: 'invited',
        }));

        if (participantsToInsert.length > 0) {
          try {
            await supabase
              .from('meeting_participants')
              .upsert(participantsToInsert, { onConflict: 'meeting_id,member_id' });
          } catch (partErr) {
            console.warn('[MeetingService] Upsert participants failed, trying insert:', partErr);
            try {
              await supabase.from('meeting_participants').insert(participantsToInsert);
            } catch (_) {}
          }
        }

        // Notify invited participants
        const otherAttendees = input.participantIds.filter(id => id !== input.hostId);
        if (otherAttendees.length > 0) {
          notifyMeetingScheduled({
            id: data.id,
            title: data.title,
            date: data.date,
            time: data.start_time,
            attendeeIds: otherAttendees,
          }).catch(console.error);
        }

        return mapDbMeeting(data);
      }
    } catch (err) {
      console.error('[MeetingService] Exception creating meeting:', err);
    }
  }

  // Fallback return
  return mapDbMeeting(payload);
}

// Quick Helper: Start an Instant Meeting right now
export async function createInstantMeeting(hostUser: { id: string; name: string }): Promise<Meeting> {
  const code = generateMeetingCode();
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const hh = now.getHours().toString().padStart(2, '0');
  const mm = now.getMinutes().toString().padStart(2, '0');
  const startTime = `${hh}:${mm}`;

  const endH = (now.getHours() + 1) % 24;
  const endTime = `${endH.toString().padStart(2, '0')}:${mm}`;

  return await createNewMeeting({
    title: `${hostUser.name || 'Team'}'s Meeting`,
    description: 'Instant real-time H-Meet video session',
    date: dateStr,
    startTime,
    endTime,
    type: 'team',
    meetingType: 'video',
    meetingRoomId: code,
    status: 'live',
    participantIds: [hostUser.id],
    hostId: hostUser.id,
    notes: 'Started as instant meeting',
  });
}

export async function updateMeetingStatus(meetingId: string, status: MeetingStatus): Promise<boolean> {
  if (!isSupabaseConfigured() || !meetingId) return false;

  try {
    // PostgreSQL enum meeting_status: ('scheduled', 'in-progress', 'completed', 'cancelled')
    const dbStatus = (status as string) === 'live' ? 'in-progress' : status;

    const updates: Record<string, any> = {
      status: dbStatus,
      updated_at: new Date().toISOString(),
    };

    if (status === 'live' || status === 'in-progress') {
      updates.started_at = new Date().toISOString();
    } else if (status === 'completed') {
      updates.ended_at = new Date().toISOString();
    }

    const { error } = await supabase
      .from('meetings')
      .update(updates)
      .eq('id', meetingId);

    if (error) {
      console.warn('[MeetingService] updateMeetingStatus error:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[MeetingService] updateMeetingStatus exception:', err);
    return false;
  }
}

// ------------------------------------------------------------
// 2. AUTOMATIC ATTENDANCE TRACKING
// ------------------------------------------------------------

export async function recordParticipantJoined(meetingId: string, memberId: string): Promise<MeetingAttendance | null> {
  if (!isSupabaseConfigured() || !meetingId || !memberId) return null;

  try {
    // Check if an attendance record already exists for this member + meeting
    const { data: existing } = await supabase
      .from('meeting_attendance')
      .select('*')
      .eq('meeting_id', meetingId)
      .or(`member_id.eq.${memberId},user_id.eq.${memberId}`)
      .maybeSingle();

    const now = new Date().toISOString();

    if (existing) {
      // Reconnection: keep original joined_at, reset left_at, update status to joined
      const { data, error } = await supabase
        .from('meeting_attendance')
        .update({
          status: 'joined',
          left_at: null,
          updated_at: now,
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (!error && data) {
        return {
          id: data.id,
          meetingId: data.meeting_id,
          memberId: data.member_id || data.user_id,
          joinedAt: data.joined_at,
          leftAt: data.left_at,
          durationSeconds: data.duration_seconds || 0,
          status: data.status,
          createdAt: data.created_at,
          updatedAt: data.updated_at,
        };
      }
    } else {
      // First time join: create new attendance record with both member_id and user_id
      const { data, error } = await supabase
        .from('meeting_attendance')
        .insert([{
          meeting_id: meetingId,
          member_id: memberId,
          user_id: memberId,
          joined_at: now,
          status: 'joined',
          duration_seconds: 0,
        }])
        .select()
        .single();

      // Also update participant status in meeting_participants
      try {
        await supabase
          .from('meeting_participants')
          .update({ status: 'joined', joined_at: now })
          .eq('meeting_id', meetingId)
          .or(`member_id.eq.${memberId},user_id.eq.${memberId}`);
      } catch (_) {}

      if (!error && data) {
        return {
          id: data.id,
          meetingId: data.meeting_id,
          memberId: data.member_id || data.user_id,
          joinedAt: data.joined_at,
          leftAt: data.left_at,
          durationSeconds: data.duration_seconds || 0,
          status: data.status,
          createdAt: data.created_at,
          updatedAt: data.updated_at,
        };
      }
    }
    return null;
  } catch (err) {
    console.error('[MeetingService] recordParticipantJoined error:', err);
    return null;
  }
}

export async function recordParticipantLeft(meetingId: string, memberId: string): Promise<boolean> {
  if (!isSupabaseConfigured() || !meetingId || !memberId) return false;

  try {
    const { data: record } = await supabase
      .from('meeting_attendance')
      .select('*')
      .eq('meeting_id', meetingId)
      .or(`member_id.eq.${memberId},user_id.eq.${memberId}`)
      .maybeSingle();

    if (!record) return false;

    const leftTime = new Date();
    const joinedTime = new Date(record.joined_at);
    const sessionDurationSeconds = Math.max(0, Math.floor((leftTime.getTime() - joinedTime.getTime()) / 1000));
    const totalDurationSeconds = (record.duration_seconds || 0) + sessionDurationSeconds;

    const { error } = await supabase
      .from('meeting_attendance')
      .update({
        left_at: leftTime.toISOString(),
        duration_seconds: totalDurationSeconds,
        status: 'left',
        updated_at: leftTime.toISOString(),
      })
      .eq('id', record.id);

    // Update meeting_participants
    try {
      await supabase
        .from('meeting_participants')
        .update({
          status: 'left',
          left_at: leftTime.toISOString(),
        })
        .eq('meeting_id', meetingId)
        .or(`member_id.eq.${memberId},user_id.eq.${memberId}`);
    } catch (_) {}

    return !error;
  } catch (err) {
    console.error('[MeetingService] recordParticipantLeft error:', err);
    return false;
  }
}

export async function fetchMeetingAttendanceSummary(meetingId: string): Promise<MeetingAttendance[]> {
  if (!isSupabaseConfigured() || !meetingId) return [];

  try {
    const { data, error } = await supabase
      .from('meeting_attendance')
      .select('*')
      .eq('meeting_id', meetingId)
      .order('joined_at', { ascending: true });

    if (error) {
      console.warn('[MeetingService] fetchMeetingAttendanceSummary error:', error.message);
      return [];
    }

    return (data || []).map(row => ({
      id: row.id,
      meetingId: row.meeting_id,
      memberId: row.member_id,
      joinedAt: row.joined_at,
      leftAt: row.left_at,
      durationSeconds: row.duration_seconds || 0,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  } catch (err) {
    console.error('[MeetingService] fetchMeetingAttendanceSummary error:', err);
    return [];
  }
}

// ------------------------------------------------------------
// 3. IN-MEETING CHAT PERSISTENCE
// ------------------------------------------------------------

export async function sendMeetingChatMessage(meetingId: string, senderId: string, message: string): Promise<boolean> {
  if (!isSupabaseConfigured() || !meetingId || !senderId || !message.trim()) return false;

  try {
    const { error } = await supabase
      .from('meeting_messages')
      .insert([{
        meeting_id: meetingId,
        sender_id: senderId,
        message: message.trim(),
      }]);

    if (error) {
      console.warn('[MeetingService] sendMeetingChatMessage error:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[MeetingService] sendMeetingChatMessage error:', err);
    return false;
  }
}

export async function fetchMeetingChatMessages(meetingId: string): Promise<MeetingChatMessage[]> {
  if (!isSupabaseConfigured() || !meetingId) return [];

  try {
    const { data, error } = await supabase
      .from('meeting_messages')
      .select(`
        id,
        meeting_id,
        sender_id,
        message,
        created_at,
        profiles:sender_id (
          name,
          avatar,
          designation,
          role
        )
      `)
      .eq('meeting_id', meetingId)
      .order('created_at', { ascending: true });

    if (error) {
      console.warn('[MeetingService] fetchMeetingChatMessages error:', error.message);
      return [];
    }

    return (data || []).map((row: any) => ({
      id: row.id,
      meetingId: row.meeting_id,
      senderId: row.sender_id,
      senderName: row.profiles?.name || 'Team Member',
      senderAvatar: row.profiles?.avatar || '',
      senderRole: row.profiles?.designation || row.profiles?.role || 'Member',
      message: row.message,
      timestamp: row.created_at,
    }));
  } catch (err) {
    console.error('[MeetingService] fetchMeetingChatMessages error:', err);
    return [];
  }
}
