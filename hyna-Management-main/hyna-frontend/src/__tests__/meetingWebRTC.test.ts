// ============================================================
// Hyna Studio Management - WebRTC Group Meetings Test Suite
// Unit & Integration Tests for Meeting Room, Signaling, & Attendance
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateMeetingRoomId, mapDbMeeting } from '@/services/meetingService';
import { WebRTCManager, DEFAULT_RTC_CONFIG } from '@/services/webrtc/WebRTCManager';
import type { SignalingMessage } from '@/types/meeting';

describe('WebRTC Meeting System', () => {
  describe('Meeting Room & Entity Mappings', () => {
    it('generates secure formatted meeting room IDs', () => {
      const roomId1 = generateMeetingRoomId();
      const roomId2 = generateMeetingRoomId();

      expect(roomId1).toMatch(/^room-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/);
      expect(roomId2).toMatch(/^room-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/);
      expect(roomId1).not.toBe(roomId2);
    });

    it('correctly maps raw database row to Meeting model', () => {
      const dbRow = {
        id: 'mt_test_123',
        title: 'Sprint Planning',
        description: 'Review architecture and tasks',
        date: '2026-10-01',
        start_time: '10:00',
        end_time: '11:00',
        host_id: 'user_host_1',
        created_by: 'user_host_1',
        participant_ids: ['user_host_1', 'user_member_2'],
        type: 'planning',
        meeting_type: 'video',
        meeting_room_id: 'room-abcd-efgh-ijkl',
        meeting_link: '/meeting/room-abcd-efgh-ijkl',
        notes: 'Bring notes',
        status: 'scheduled',
      };

      const mapped = mapDbMeeting(dbRow);

      expect(mapped.id).toBe('mt_test_123');
      expect(mapped.title).toBe('Sprint Planning');
      expect(mapped.meetingRoomId).toBe('room-abcd-efgh-ijkl');
      expect(mapped.meetingType).toBe('video');
      expect(mapped.meetingLink).toBe('/meeting/room-abcd-efgh-ijkl');
      expect(mapped.status).toBe('scheduled');
      expect(mapped.participantIds).toContain('user_member_2');
    });

    it('defaults meetingType to video and auto-derives internal link if missing', () => {
      const dbRow = {
        id: 'mt_fallback',
        title: 'Ad-hoc Sync',
        host_id: 'user_1',
      };

      const mapped = mapDbMeeting(dbRow);

      expect(mapped.meetingType).toBe('video');
      expect(mapped.meetingRoomId).toBe('mt_fallback');
      expect(mapped.meetingLink).toBe('/meeting/mt_fallback');
    });
  });

  describe('WebRTC Manager Configuration & Media Controls', () => {
    it('uses configured public STUN servers for peer negotiation', () => {
      expect(DEFAULT_RTC_CONFIG.iceServers).toBeDefined();
      expect(DEFAULT_RTC_CONFIG.iceServers!.length).toBeGreaterThan(0);
      const urls = DEFAULT_RTC_CONFIG.iceServers!.flatMap(s => typeof s.urls === 'string' ? [s.urls] : s.urls);
      expect(urls.some(u => u.includes('stun.l.google.com'))).toBe(true);
    });

    it('initializes WebRTCManager and manages local tracks gracefully', () => {
      const callbacks = {
        onRemoteStream: vi.fn(),
        onRemoteStreamRemoved: vi.fn(),
        onPeerConnectionStateChange: vi.fn(),
        onIceCandidate: vi.fn(),
        onError: vi.fn(),
      };

      const manager = new WebRTCManager('user_alice', callbacks);

      // Verify no throw when stream is null
      expect(() => manager.setAudioEnabled(false)).not.toThrow();
      expect(() => manager.setVideoEnabled(false)).not.toThrow();

      // Cleanup
      expect(() => manager.cleanupAll()).not.toThrow();
    });
  });

  describe('Signaling Protocol Schemas', () => {
    it('validates JOIN and OFFER signaling payloads', () => {
      const joinMsg: SignalingMessage = {
        type: 'JOIN',
        senderId: 'user_alice',
        senderName: 'Alice',
        senderRole: 'Lead Engineer',
        micEnabled: true,
        videoEnabled: true,
        timestamp: Date.now(),
      };

      expect(joinMsg.type).toBe('JOIN');
      expect(joinMsg.senderId).toBe('user_alice');
      expect(joinMsg.micEnabled).toBe(true);

      const offerMsg: SignalingMessage = {
        type: 'OFFER',
        senderId: 'user_alice',
        targetId: 'user_bob',
        senderName: 'Alice',
        offer: { type: 'offer', sdp: 'v=0\r\no=...' },
      };

      expect(offerMsg.type).toBe('OFFER');
      expect(offerMsg.targetId).toBe('user_bob');
      expect(offerMsg.offer?.type).toBe('offer');
    });

    it('validates media control signaling (MUTE and CAMERA toggles)', () => {
      const muteMsg: SignalingMessage = {
        type: 'MUTE_CHANGED',
        senderId: 'user_alice',
        senderName: 'Alice',
        micEnabled: false,
      };

      expect(muteMsg.type).toBe('MUTE_CHANGED');
      expect(muteMsg.micEnabled).toBe(false);

      const screenMsg: SignalingMessage = {
        type: 'SCREEN_SHARE_STARTED',
        senderId: 'user_alice',
        senderName: 'Alice',
      };

      expect(screenMsg.type).toBe('SCREEN_SHARE_STARTED');
    });
  });
});
