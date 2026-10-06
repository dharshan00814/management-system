// ============================================================
// Hyna Studio Management - Supabase Realtime Signaling Service
// Pure WebRTC Signaling + Presence Tracking via Supabase Realtime
// Cloud-native: Works across devices, Wi-Fi networks, and deployments
// ============================================================

import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import type { SignalingMessage, ParticipantState } from '@/types/meeting';

export interface SignalingCallbacks {
  onSignal: (message: SignalingMessage) => void;
  onPresenceSync: (presences: Record<string, any[]>) => void;
  onPresenceJoin: (key: string, newPresences: any[]) => void;
  onPresenceLeave: (key: string, leftPresences: any[]) => void;
  onMeetingEnded: () => void;
}

export interface SignalingUserProfile {
  id: string; // The user's account ID (or guest ID)
  name: string;
  avatar: string;
  role?: string;
  designation?: string;
}

export class SupabaseSignalingService {
  private channel: RealtimeChannel | null = null;
  private roomKey: string;
  private localPeerId: string; // Unique peer/session ID per browser tab
  private localUser: SignalingUserProfile;
  private callbacks: SignalingCallbacks;
  private isSubscribed = false;

  constructor(
    roomKey: string,
    localPeerId: string,
    localUser: SignalingUserProfile,
    callbacks: SignalingCallbacks
  ) {
    this.roomKey = roomKey;
    this.localPeerId = localPeerId;
    this.localUser = localUser;
    this.callbacks = callbacks;
  }

  // Connect to the Supabase Realtime signaling channel
  public async connect(initialPresence: Partial<ParticipantState>): Promise<void> {
    if (!isSupabaseConfigured()) {
      console.warn('[SignalingService] Supabase is not configured.');
      return;
    }

    const channelName = `meeting-signaling:${this.roomKey}`;
    
    // Clean up existing channel if any
    if (this.channel) {
      await this.disconnect();
    }

    this.channel = supabase.channel(channelName, {
      config: {
        broadcast: { self: false },
        presence: { key: this.localPeerId },
      },
    });

    // 1. Listen for peer signaling broadcasts
    this.channel.on('broadcast', { event: 'signal' }, ({ payload }) => {
      const msg = payload as SignalingMessage;
      
      // Ignore self-broadcasts
      if (msg.senderId === this.localPeerId) {
        return;
      }

      // If message is targeted to a specific peer, only handle if we are the target
      if (msg.targetId && msg.targetId !== this.localPeerId) {
        return;
      }

      if (msg.type === 'MEETING_ENDED') {
        this.callbacks.onMeetingEnded();
        return;
      }

      this.callbacks.onSignal(msg);
    });

    // 2. Listen for presence events
    this.channel.on('presence', { event: 'sync' }, () => {
      if (!this.channel) return;
      const state = this.channel.presenceState();
      this.callbacks.onPresenceSync(state);
    });

    this.channel.on('presence', { event: 'join' }, ({ key, newPresences }) => {
      if (key !== this.localPeerId) {
        this.callbacks.onPresenceJoin(key, newPresences);
      }
    });

    this.channel.on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
      if (key !== this.localPeerId) {
        this.callbacks.onPresenceLeave(key, leftPresences);
      }
    });

    // 3. Subscribe and track initial presence state
    return new Promise<void>((resolve, reject) => {
      if (!this.channel) return resolve();

      this.channel.subscribe(async (status, err) => {
        if (status === 'SUBSCRIBED') {
          this.isSubscribed = true;

          // Track local user presence state in room
          await this.channel?.track({
            peerId: this.localPeerId,
            memberId: this.localUser.id,
            name: this.localUser.name,
            avatar: this.localUser.avatar,
            role: this.localUser.role,
            designation: this.localUser.designation,
            micEnabled: initialPresence.micEnabled ?? true,
            videoEnabled: initialPresence.videoEnabled ?? true,
            isScreenSharing: initialPresence.isScreenSharing ?? false,
            isSpeaking: false,
            isHost: initialPresence.isHost ?? false,
            joinedAt: initialPresence.joinedAt || new Date().toISOString(),
            status: 'connected',
          });

          // Broadcast JOIN signal so existing peers in the room initiate WebRTC offers
          await this.sendSignal({
            type: 'JOIN',
            senderId: this.localPeerId,
            senderName: this.localUser.name,
            senderAvatar: this.localUser.avatar,
            senderRole: this.localUser.designation || this.localUser.role,
            micEnabled: initialPresence.micEnabled ?? true,
            videoEnabled: initialPresence.videoEnabled ?? true,
            isScreenSharing: false,
            timestamp: Date.now(),
          });

          resolve();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error(`[SignalingService] Channel subscribe error (${status}):`, err);
          reject(err || new Error(`Supabase channel error: ${status}`));
        }
      });
    });
  }

  // Send a signaling message via Realtime broadcast
  public async sendSignal(message: SignalingMessage): Promise<void> {
    if (!this.channel || !this.isSubscribed) return;

    try {
      await this.channel.send({
        type: 'broadcast',
        event: 'signal',
        payload: {
          ...message,
          senderId: this.localPeerId,
          senderName: this.localUser.name,
          senderAvatar: this.localUser.avatar,
          senderRole: this.localUser.designation || this.localUser.role,
          timestamp: Date.now(),
        },
      });
    } catch (err) {
      console.error('[SignalingService] sendSignal error:', err);
    }
  }

  // Update presence attributes (e.g. mute, camera, screen share)
  public async updatePresence(updates: Partial<ParticipantState>): Promise<void> {
    if (!this.channel || !this.isSubscribed) return;

    try {
      await this.channel.track({
        peerId: this.localPeerId,
        memberId: this.localUser.id,
        name: this.localUser.name,
        avatar: this.localUser.avatar,
        role: this.localUser.role,
        designation: this.localUser.designation,
        ...updates,
      });
    } catch (err) {
      console.warn('[SignalingService] updatePresence warning:', err);
    }
  }

  // End meeting broadcast (for host)
  public async broadcastMeetingEnded(): Promise<void> {
    if (!this.channel || !this.isSubscribed) return;

    await this.sendSignal({
      type: 'MEETING_ENDED',
      senderId: this.localPeerId,
      senderName: this.localUser.name,
    });
  }

  // Leave room and cleanup
  public async disconnect(): Promise<void> {
    if (!this.channel) return;

    try {
      // Send LEAVE signal so peers can immediately cleanup RTCPeerConnections
      await this.sendSignal({
        type: 'LEAVE',
        senderId: this.localPeerId,
        senderName: this.localUser.name,
      });

      await this.channel.untrack();
      await supabase.removeChannel(this.channel);
    } catch (err) {
      console.warn('[SignalingService] Error during channel disconnect:', err);
    } finally {
      this.channel = null;
      this.isSubscribed = false;
    }
  }
}
