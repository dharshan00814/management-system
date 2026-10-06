// ============================================================
// Hyna Studio Management - WebRTC Group Meetings Type Definitions
// ============================================================

import type { MeetingType, UserRole } from './index';

export type MeetingMediaType = 'video' | 'audio';
export type MeetingStatus = 'scheduled' | 'live' | 'in-progress' | 'completed' | 'cancelled';

export interface Meeting {
  id: string;
  title: string;
  description: string;
  date: string;
  startTime: string;
  endTime: string;
  hostId: string;
  createdBy?: string;
  participantIds: string[];
  type: MeetingType;
  meetingType: MeetingMediaType;
  meetingRoomId: string;
  meetingCode?: string;
  isRecurring: boolean;
  meetingLink?: string;
  notes?: string;
  status: MeetingStatus;
  scheduledAt?: string;
  startedAt?: string;
  endedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export type ParticipantStatus = 'invited' | 'accepted' | 'declined' | 'joined' | 'left' | 'absent';

export interface MeetingParticipant {
  id: string;
  meetingId: string;
  memberId: string;
  invitedBy?: string;
  invitedAt: string;
  joinedAt?: string;
  leftAt?: string;
  status: ParticipantStatus;
  createdAt?: string;
  updatedAt?: string;
}

export interface MeetingAttendance {
  id: string;
  meetingId: string;
  memberId: string;
  joinedAt: string;
  leftAt?: string;
  durationSeconds: number;
  status: 'invited' | 'joined' | 'left' | 'absent';
  createdAt?: string;
  updatedAt?: string;
}

export interface MeetingChatMessage {
  id: string;
  meetingId: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  senderRole?: string;
  message: string;
  timestamp: string;
}

export type SignalingMessageType = 
  | 'JOIN' 
  | 'JOIN_ACK'
  | 'ANNOUNCE'
  | 'LEAVE' 
  | 'OFFER' 
  | 'ANSWER' 
  | 'ICE_CANDIDATE' 
  | 'MUTE_CHANGED' 
  | 'CAMERA_CHANGED' 
  | 'SCREEN_SHARE_STARTED' 
  | 'SCREEN_SHARE_STOPPED'
  | 'MEETING_ENDED';

export interface SignalingMessage {
  type: SignalingMessageType;
  senderId: string;
  targetId?: string;
  senderName: string;
  senderAvatar?: string;
  senderRole?: string;
  offer?: RTCSessionDescriptionInit;
  answer?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
  micEnabled?: boolean;
  videoEnabled?: boolean;
  isScreenSharing?: boolean;
  timestamp?: number;
}

export interface ParticipantState {
  memberId: string;
  socketId?: string;
  name: string;
  avatar: string;
  role?: string;
  designation?: string;
  micEnabled: boolean;
  videoEnabled: boolean;
  isScreenSharing: boolean;
  isSpeaking: boolean;
  isHost: boolean;
  joinedAt: string;
  connectionState: RTCPeerConnectionState;
}

export interface MediaDeviceOption {
  deviceId: string;
  label: string;
  groupId?: string;
}

export interface UserDeviceSettings {
  selectedCameraId: string;
  selectedMicrophoneId: string;
  selectedSpeakerId: string;
  preferredVideo: boolean;
  preferredAudio: boolean;
}

export interface MeetingSettings {
  allowScreenShare: boolean;
  muteOnEntry?: boolean;
}
