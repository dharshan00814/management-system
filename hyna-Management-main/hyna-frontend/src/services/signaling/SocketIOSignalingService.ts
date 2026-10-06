// ============================================================
// Hyna Studio Management - Socket.IO WebRTC Signaling Service
// Low-latency WebSocket signaling, host enforcement, room presence
// ============================================================

import { io, Socket } from 'socket.io-client';

export interface SignalingUser {
  userId: string;
  name: string;
  avatar?: string;
  role?: string;
  designation?: string;
}

export interface SocketIOSignalingCallbacks {
  onRoomJoined: (data: {
    roomId: string;
    isHost: boolean;
    hostId: string;
    status: string;
    allowScreenShare: boolean;
    participants: any[];
    yourParticipantInfo: any;
  }) => void;
  onParticipantJoined: (participant: any) => void;
  onParticipantLeft: (data: { socketId: string; userId: string; name: string }) => void;
  onOffer: (callerSocketId: string, sdp: RTCSessionDescriptionInit) => void;
  onAnswer: (responderSocketId: string, sdp: RTCSessionDescriptionInit) => void;
  onIceCandidate: (senderSocketId: string, candidate: RTCIceCandidateInit) => void;
  onParticipantMediaChanged: (data: {
    socketId: string;
    userId: string;
    micEnabled: boolean;
    videoEnabled: boolean;
    isScreenSharing: boolean;
  }) => void;
  onParticipantSpeakingChanged: (data: { socketId: string; userId: string; isSpeaking: boolean }) => void;
  onReceiveMessage: (msg: any) => void;
  onForcedMute: (data: { by: string }) => void;
  onRemovedByHost: (data: { reason: string }) => void;
  onMeetingEnded: (data: { by: string; message: string }) => void;
  onScreenSharePermissionChanged: (data: { allowScreenShare: boolean; by?: string }) => void;
  onError: (err: any) => void;
  // NOTE: This callback ONLY reflects signaling/socket connectivity, NOT WebRTC media state.
  // The hook must NOT use this to drive the overall "Connected/Reconnecting" UI label.
  onSignalingConnectionStateChange: (state: 'connecting' | 'connected' | 'reconnecting' | 'disconnected') => void;
}

export class SocketIOSignalingService {
  private socket: Socket | null = null;
  private serverUrl: string;
  private callbacks: SocketIOSignalingCallbacks;
  private currentRoomId: string = '';
  private currentUser: SignalingUser | null = null;

  constructor(callbacks: SocketIOSignalingCallbacks, serverUrlOverride?: string) {
    this.callbacks = callbacks;
    const envUrl = import.meta.env.VITE_WEBRTC_SERVER_URL;
    if (serverUrlOverride) {
      this.serverUrl = serverUrlOverride;
    } else if (envUrl && typeof envUrl === 'string' && envUrl.trim()) {
      this.serverUrl = envUrl.trim();
    } else if (typeof window !== 'undefined') {
      this.serverUrl = `${window.location.protocol}//${window.location.hostname}:5050`;
    } else {
      this.serverUrl = 'http://localhost:5050';
    }
  }

  public async connect({
    roomId,
    user,
    micEnabled = true,
    videoEnabled = true,
  }: {
    roomId: string;
    user: SignalingUser;
    micEnabled?: boolean;
    videoEnabled?: boolean;
  }): Promise<void> {
    this.currentRoomId = roomId;
    this.currentUser = user;

    if (this.socket) {
      this.disconnect();
    }

    this.callbacks.onSignalingConnectionStateChange('connecting');

    return new Promise((resolve, reject) => {
      let isSettled = false;

      // Only reject if we truly cannot establish the initial connection within timeout.
      // connect_error alone does NOT reject — Socket.IO retries automatically.
      // We only reject on timeout.
      const connectionTimeout = setTimeout(() => {
        if (!isSettled) {
          isSettled = true;
          console.warn(`[H-MEET] Signaling server connection timed out after 10s: ${this.serverUrl}`);
          this.callbacks.onSignalingConnectionStateChange('disconnected');
          reject(new Error(`Connection to signaling server at ${this.serverUrl} timed out.`));
        }
      }, 10000);

      try {
        const socket = io(this.serverUrl, {
          path: '/socket.io/',
          transports: ['websocket', 'polling'],
          reconnection: true,
          reconnectionAttempts: 10,
          reconnectionDelay: 1000,
          reconnectionDelayMax: 5000,
          timeout: 10000,
        });

        this.socket = socket;

        socket.on('connect', () => {
          console.log('[H-MEET] Signaling server connected. Socket ID:', socket.id);
          this.callbacks.onSignalingConnectionStateChange('connected');

          // Join the room upon every (re)connect
          socket.emit('join-room', {
            roomId,
            user,
            micEnabled,
            videoEnabled,
          });
        });

        socket.on('room-joined', (data) => {
          console.log('[H-MEET] room-joined received:', data);
          if (!isSettled) {
            isSettled = true;
            clearTimeout(connectionTimeout);
            resolve();
          }
          this.callbacks.onRoomJoined(data);
        });

        socket.on('participant_joined', (participant) => {
          console.log('[H-MEET] participant_joined:', participant?.name, participant?.socketId);
          this.callbacks.onParticipantJoined(participant);
        });

        socket.on('participant_left', (data) => {
          console.log('[H-MEET] participant_left:', data?.name, data?.socketId);
          this.callbacks.onParticipantLeft(data);
        });

        socket.on('offer', ({ callerSocketId, sdp }) => {
          console.log('[H-MEET] Offer received from signaling, caller:', callerSocketId);
          this.callbacks.onOffer(callerSocketId, sdp);
        });

        socket.on('answer', ({ responderSocketId, sdp }) => {
          console.log('[H-MEET] Answer received from signaling, responder:', responderSocketId);
          this.callbacks.onAnswer(responderSocketId, sdp);
        });

        socket.on('ice-candidate', ({ senderSocketId, candidate }) => {
          this.callbacks.onIceCandidate(senderSocketId, candidate);
        });

        socket.on('participant-media-changed', (data) => {
          this.callbacks.onParticipantMediaChanged(data);
        });

        socket.on('participant-speaking-changed', (data) => {
          this.callbacks.onParticipantSpeakingChanged(data);
        });

        socket.on('receive-message', (msg) => {
          this.callbacks.onReceiveMessage(msg);
        });

        socket.on('forced-mute', (data) => {
          this.callbacks.onForcedMute(data);
        });

        socket.on('removed-by-host', (data) => {
          this.callbacks.onRemovedByHost(data);
        });

        socket.on('meeting-ended', (data) => {
          this.callbacks.onMeetingEnded(data);
        });

        socket.on('screenshare-permission-changed', (data) => {
          this.callbacks.onScreenSharePermissionChanged(data);
        });

        socket.on('connect_error', (err) => {
          // Do NOT reject here — Socket.IO will retry automatically.
          // Do NOT change overallConnectionState here — that must only be driven by WebRTC state.
          console.warn('[H-MEET] Signaling connect_error (will retry):', err.message);
          this.callbacks.onSignalingConnectionStateChange('reconnecting');
          // If we've never successfully joined a room yet, this counts as a fatal initial failure
          // only after the outer timeout fires.
        });

        socket.on('disconnect', (reason) => {
          console.log('[H-MEET] Signaling disconnected:', reason);
          // Do NOT propagate 'disconnected' to the overall meeting connection state —
          // that state must only reflect WebRTC peer connection state.
          this.callbacks.onSignalingConnectionStateChange('disconnected');
        });

        socket.on('reconnect', (attempt) => {
          console.log('[H-MEET] Signaling reconnected on attempt', attempt);
          // Re-join the room so we appear to others again
          socket.emit('join-room', {
            roomId,
            user,
            micEnabled,
            videoEnabled,
          });
        });

        socket.on('error', (err) => {
          console.error('[H-MEET] Signaling server error:', err);
          this.callbacks.onError(err);
        });

      } catch (err) {
        if (!isSettled) {
          isSettled = true;
          clearTimeout(connectionTimeout);
          reject(err);
        }
      }
    });
  }

  public sendOffer(targetSocketId: string, sdp: RTCSessionDescriptionInit): void {
    if (this.socket?.connected) {
      console.log('[H-MEET] Sending offer to', targetSocketId);
      this.socket.emit('offer', { target: targetSocketId, sdp });
    } else {
      console.warn('[H-MEET] Cannot send offer — socket not connected');
    }
  }

  public sendAnswer(targetSocketId: string, sdp: RTCSessionDescriptionInit): void {
    if (this.socket?.connected) {
      console.log('[H-MEET] Sending answer to', targetSocketId);
      this.socket.emit('answer', { target: targetSocketId, sdp });
    } else {
      console.warn('[H-MEET] Cannot send answer — socket not connected');
    }
  }

  public sendIceCandidate(targetSocketId: string, candidate: RTCIceCandidateInit): void {
    if (this.socket?.connected) {
      this.socket.emit('ice-candidate', { target: targetSocketId, candidate });
    }
  }

  public sendMediaToggle({
    micEnabled,
    videoEnabled,
    isScreenSharing,
  }: {
    micEnabled?: boolean;
    videoEnabled?: boolean;
    isScreenSharing?: boolean;
  }): void {
    if (this.socket?.connected) {
      this.socket.emit('media-toggle', { micEnabled, videoEnabled, isScreenSharing });
    }
  }

  public sendSpeakingChange(isSpeaking: boolean): void {
    if (this.socket?.connected) {
      this.socket.emit('speaking-change', { isSpeaking });
    }
  }

  public sendMessage(messagePayload: {
    meetingId: string;
    senderId: string;
    senderName: string;
    senderAvatar?: string;
    senderRole?: string;
    message: string;
  }): void {
    if (this.socket?.connected) {
      this.socket.emit('send-message', messagePayload);
    }
  }

  // Host Controls
  public muteParticipant(targetSocketId: string, targetUserId: string): void {
    if (this.socket?.connected) {
      this.socket.emit('host-mute-participant', { targetSocketId, targetUserId });
    }
  }

  public muteAllParticipants(): void {
    if (this.socket?.connected) {
      this.socket.emit('host-mute-all');
    }
  }

  public removeParticipant(targetSocketId: string, targetUserId: string): void {
    if (this.socket?.connected) {
      this.socket.emit('host-remove-participant', { targetSocketId, targetUserId });
    }
  }

  public toggleScreenSharePermission(allowed: boolean): void {
    if (this.socket?.connected) {
      this.socket.emit('host-toggle-screenshare-permission', { allowed });
    }
  }

  public endMeeting(): void {
    if (this.socket?.connected) {
      this.socket.emit('host-end-meeting');
    }
  }

  public isConnected(): boolean {
    return Boolean(this.socket?.connected);
  }

  public getSocketId(): string | null {
    return this.socket?.id || null;
  }

  public disconnect(): void {
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
    this.callbacks.onSignalingConnectionStateChange('disconnected');
  }
}
