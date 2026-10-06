// ============================================================
// Hyna Studio Management - WebRTC Group Meeting Core Hook
// Hybrid Architecture: Socket.IO Low-Latency Signaling (Primary)
// with Supabase Realtime Signaling Fallback + Automatic Mesh Management
// ============================================================

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { WebRTCManager } from '@/services/webrtc/WebRTCManager';
import { SocketIOSignalingService } from '@/services/signaling/SocketIOSignalingService';
import { SupabaseSignalingService } from '@/services/signaling/SupabaseSignalingService';
import { updateMeetingStatus } from '@/services/meetingService';
import { toast } from 'sonner';
import type { 
  Meeting, 
  ParticipantState, 
  SignalingMessage 
} from '@/types/meeting';
import type { User } from '@/types';

export interface UseWebRTCMeetingProps {
  meeting: Meeting | null;
  currentUser: User | null;
  isHost: boolean;
  initialMicEnabled?: boolean;
  initialVideoEnabled?: boolean;
  selectedCameraId?: string;
  selectedMicrophoneId?: string;
  onMeetingEndedByHost?: () => void;
  onRemovedByHost?: (reason?: string) => void;
}

export function useWebRTCMeeting({
  meeting,
  currentUser,
  isHost,
  initialMicEnabled = true,
  initialVideoEnabled = true,
  selectedCameraId,
  selectedMicrophoneId,
  onMeetingEndedByHost,
  onRemovedByHost,
}: UseWebRTCMeetingProps) {
  // Local media state
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [micEnabled, setMicEnabled] = useState<boolean>(initialMicEnabled);
  const [videoEnabled, setVideoEnabled] = useState<boolean>(
    meeting?.meetingType === 'audio' ? false : initialVideoEnabled
  );
  const [isScreenSharing, setIsScreenSharing] = useState<boolean>(false);
  const [isLocalSpeaking, setIsLocalSpeaking] = useState<boolean>(false);
  const [allowScreenShare, setAllowScreenShare] = useState<boolean>(true);

  // Connection and remote participants state
  const [participants, setParticipants] = useState<Map<string, ParticipantState>>(new Map());
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());

  // overallConnectionState MUST only reflect actual WebRTC peer connection state.
  // Do NOT set this based on Socket.IO socket connection events.
  // Mapping:
  //   WebRTC 'connected'     → 'connected'
  //   WebRTC 'connecting'    → 'connecting'
  //   WebRTC 'disconnected'  → 'reconnecting'
  //   WebRTC 'failed'        → 'reconnecting' (ICE restart in progress)
  //   WebRTC 'closed'        → 'disconnected'
  //   No peers yet           → 'connecting' (signaling established)
  const [overallConnectionState, setOverallConnectionState] = useState<'connecting' | 'connected' | 'reconnecting' | 'disconnected'>('connecting');

  const [pinnedParticipantId, setPinnedParticipantId] = useState<string | null>(null);

  // References
  const webrtcManagerRef = useRef<WebRTCManager | null>(null);
  const socketIOSignalingRef = useRef<SocketIOSignalingService | null>(null);
  const supabaseSignalingRef = useRef<SupabaseSignalingService | null>(null);
  const signalingModeRef = useRef<'socketio' | 'supabase'>('socketio');
  const screenStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const announceTimerRef = useRef<any>(null);

  // Track which peers we've connected to, to know when FIRST connection happens
  const connectedPeersRef = useRef<Set<string>>(new Set());

  // Truly unique Peer ID per browser tab (Prevents same-account/guest collisions across tabs)
  const localPeerIdRef = useRef<string>(
    `peer_${currentUser?.id || 'usr'}_${Math.random().toString(36).slice(2, 9)}_${Date.now().toString(36)}`
  );
  const localPeerId = localPeerIdRef.current;

  const localUserId = currentUser?.id || localPeerId;
  const localUserName = currentUser?.name || 'Guest Member';
  const localUserAvatar = currentUser?.avatar || '';
  const localUserRole = currentUser?.designation || currentUser?.role || 'Member';

  // 1. Initialize Web Audio Analyser for Speaking Detection
  const setupSpeechDetection = useCallback((stream: MediaStream) => {
    try {
      const audioTrack = stream.getAudioTracks()[0];
      if (!audioTrack) return;

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;

      const audioCtx = new AudioCtx();
      audioContextRef.current = audioCtx;

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;

      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const checkAudioLevel = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);

        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const average = sum / dataArray.length;
        const speaking = average > 18;

        setIsLocalSpeaking(prev => {
          if (prev !== speaking) {
            // Broadcast speaking change via active signaling
            if (signalingModeRef.current === 'socketio' && socketIOSignalingRef.current?.isConnected()) {
              socketIOSignalingRef.current.sendSpeakingChange(speaking);
            }
          }
          return speaking;
        });

        animFrameRef.current = requestAnimationFrame(checkAudioLevel);
      };

      checkAudioLevel();
    } catch (e) {
      console.warn('[H-MEET] Audio analyser setup failed:', e);
    }
  }, []);

  // Helper: Guarantees a remote participant is registered in UI state
  const ensureParticipant = useCallback((peerId: string, meta?: Partial<ParticipantState>) => {
    setParticipants(prev => {
      const existing = prev.get(peerId);
      const next = new Map(prev);
      next.set(peerId, {
        memberId: meta?.memberId || existing?.memberId || peerId,
        socketId: meta?.socketId || existing?.socketId || peerId,
        name: meta?.name || existing?.name || 'Team Member',
        avatar: meta?.avatar || existing?.avatar || '',
        role: meta?.role || existing?.role || 'member',
        designation: meta?.designation || existing?.designation || 'Software Engineer',
        micEnabled: meta?.micEnabled ?? existing?.micEnabled ?? true,
        videoEnabled: meta?.videoEnabled ?? existing?.videoEnabled ?? true,
        isScreenSharing: meta?.isScreenSharing ?? existing?.isScreenSharing ?? false,
        isSpeaking: meta?.isSpeaking ?? existing?.isSpeaking ?? false,
        isHost: meta?.isHost ?? existing?.isHost ?? false,
        joinedAt: existing?.joinedAt || new Date().toISOString(),
        connectionState: meta?.connectionState || existing?.connectionState || 'connecting',
      });
      return next;
    });
  }, []);

  // 2. Fallback Supabase Signaling Message Handler
  const handleIncomingSupabaseSignal = useCallback(async (msg: SignalingMessage) => {
    const manager = webrtcManagerRef.current;
    if (!manager) return;

    const senderId = msg.senderId;
    if (!senderId || senderId === localPeerId) return;

    ensureParticipant(senderId, {
      name: msg.senderName,
      avatar: msg.senderAvatar,
      role: msg.senderRole,
      designation: msg.senderRole,
    });

    switch (msg.type) {
      case 'JOIN': {
        try {
          await supabaseSignalingRef.current?.sendSignal({
            type: 'JOIN_ACK',
            senderId: localPeerId,
            targetId: senderId,
            senderName: localUserName,
          });

          const offer = await manager.createOffer(senderId);
          await supabaseSignalingRef.current?.sendSignal({
            type: 'OFFER',
            senderId: localPeerId,
            targetId: senderId,
            senderName: localUserName,
            offer,
          });
        } catch (err) {
          console.error(`[H-MEET] Failed to send offer to ${senderId}:`, err);
        }
        break;
      }

      case 'JOIN_ACK':
      case 'ANNOUNCE': {
        if (!manager.hasPeerConnection(senderId) || manager.getConnectionState(senderId) === 'failed') {
          try {
            const offer = await manager.createOffer(senderId);
            await supabaseSignalingRef.current?.sendSignal({
              type: 'OFFER',
              senderId: localPeerId,
              targetId: senderId,
              senderName: localUserName,
              offer,
            });
          } catch (err) {
            console.warn(`[H-MEET] Offer error on ACK/ANNOUNCE for ${senderId}:`, err);
          }
        }
        break;
      }

      case 'OFFER': {
        if (!msg.offer) return;
        try {
          const answer = await manager.handleOffer(senderId, msg.offer);
          if (answer && answer.type === 'answer') {
            await supabaseSignalingRef.current?.sendSignal({
              type: 'ANSWER',
              senderId: localPeerId,
              targetId: senderId,
              senderName: localUserName,
              answer,
            });
          }
        } catch (err) {
          console.error(`[H-MEET] Failed to handle offer from ${senderId}:`, err);
        }
        break;
      }

      case 'ANSWER': {
        if (!msg.answer) return;
        try {
          await manager.handleAnswer(senderId, msg.answer);
        } catch (err) {
          console.error(`[H-MEET] Failed to handle answer from ${senderId}:`, err);
        }
        break;
      }

      case 'ICE_CANDIDATE': {
        if (!msg.candidate) return;
        try {
          await manager.addIceCandidate(senderId, msg.candidate);
        } catch (err) {
          console.error(`[H-MEET] Failed to add ICE candidate from ${senderId}:`, err);
        }
        break;
      }

      case 'MUTE_CHANGED': {
        setParticipants(prev => {
          const next = new Map(prev);
          const p = next.get(senderId);
          if (p) {
            next.set(senderId, { ...p, micEnabled: Boolean(msg.micEnabled) });
          }
          return next;
        });
        break;
      }

      case 'CAMERA_CHANGED': {
        setParticipants(prev => {
          const next = new Map(prev);
          const p = next.get(senderId);
          if (p) {
            next.set(senderId, { ...p, videoEnabled: Boolean(msg.videoEnabled) });
          }
          return next;
        });
        break;
      }

      case 'SCREEN_SHARE_STARTED': {
        setParticipants(prev => {
          const next = new Map(prev);
          const p = next.get(senderId);
          if (p) {
            next.set(senderId, { ...p, isScreenSharing: true });
          }
          return next;
        });
        break;
      }

      case 'SCREEN_SHARE_STOPPED': {
        setParticipants(prev => {
          const next = new Map(prev);
          const p = next.get(senderId);
          if (p) {
            next.set(senderId, { ...p, isScreenSharing: false });
          }
          return next;
        });
        break;
      }

      case 'LEAVE': {
        manager.cleanupPeer(senderId);
        setParticipants(prev => {
          const next = new Map(prev);
          next.delete(senderId);
          return next;
        });
        setRemoteStreams(prev => {
          const next = new Map(prev);
          next.delete(senderId);
          return next;
        });
        break;
      }

      default:
        break;
    }
  }, [localPeerId, localUserName, ensureParticipant]);

  // 3. Handle presence sync for Supabase Fallback
  const handlePresenceSync = useCallback((presences: Record<string, any[]>) => {
    const manager = webrtcManagerRef.current;

    setParticipants(prev => {
      const next = new Map(prev);

      Object.entries(presences).forEach(([key, presenceList]) => {
        if (key !== localPeerId && presenceList && presenceList.length > 0) {
          const latest = presenceList[presenceList.length - 1];
          const existing = next.get(key);

          next.set(key, {
            memberId: latest.memberId || key,
            socketId: key,
            name: latest.name || existing?.name || 'Team Member',
            avatar: latest.avatar || existing?.avatar || '',
            role: latest.role || existing?.role || 'member',
            designation: latest.designation || existing?.designation || 'Software Engineer',
            micEnabled: latest.micEnabled ?? existing?.micEnabled ?? true,
            videoEnabled: latest.videoEnabled ?? existing?.videoEnabled ?? true,
            isScreenSharing: latest.isScreenSharing ?? existing?.isScreenSharing ?? false,
            isSpeaking: existing?.isSpeaking ?? false,
            isHost: latest.isHost ?? existing?.isHost ?? false,
            joinedAt: existing?.joinedAt || new Date().toISOString(),
            connectionState: existing?.connectionState || 'connecting',
          });

          if (manager && (!manager.hasPeerConnection(key) || manager.getConnectionState(key) === 'failed')) {
            manager.createOffer(key).then(offer => {
              supabaseSignalingRef.current?.sendSignal({
                type: 'OFFER',
                senderId: localPeerId,
                targetId: key,
                senderName: localUserName,
                offer,
              });
            }).catch(e => console.warn('[H-MEET] Presence offer initiation error:', e));
          }
        }
      });

      return next;
    });
  }, [localPeerId, localUserName]);

  // 4. Initialize Media Stream and WebRTC Manager
  const startMeetingSession = useCallback(async (initialVideo?: boolean, initialAudio?: boolean, preExistingStream?: MediaStream | null) => {
    if (!meeting) return;

    const isAudioOnly = meeting.meetingType === 'audio';

    const activeVideo = typeof initialVideo === 'boolean'
      ? (!isAudioOnly && initialVideo)
      : (!isAudioOnly && videoEnabled);
    const activeAudio = typeof initialAudio === 'boolean'
      ? initialAudio
      : micEnabled;

    setVideoEnabled(activeVideo);
    setMicEnabled(activeAudio);

    try {
      let stream = preExistingStream;
      if (stream) {
        // Clone the stream so we own the tracks
        stream = new MediaStream(stream.getTracks());
      } else {
        const constraints: MediaStreamConstraints = {
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            ...(selectedMicrophoneId ? { deviceId: { exact: selectedMicrophoneId } } : {}),
          },
          video: (!isAudioOnly && activeVideo)
            ? {
                width: { ideal: 1280, max: 1920 },
                height: { ideal: 720, max: 1080 },
                frameRate: { ideal: 30, max: 30 },
                ...(selectedCameraId ? { deviceId: { exact: selectedCameraId } } : {}),
              }
            : false,
        };

        stream = await navigator.mediaDevices.getUserMedia(constraints);
      }

      console.log(`[H-MEET] Local stream acquired. Audio tracks: ${stream.getAudioTracks().length}, Video tracks: ${stream.getVideoTracks().length}`);
      stream.getAudioTracks().forEach(t => console.log(`[H-MEET] Local audio track: id=${t.id}, enabled=${t.enabled}, readyState=${t.readyState}`));
      stream.getVideoTracks().forEach(t => console.log(`[H-MEET] Local video track: id=${t.id}, enabled=${t.enabled}, readyState=${t.readyState}`));

      setLocalStream(stream);

      // Apply initial track enabled state
      stream.getAudioTracks().forEach(t => {
        t.enabled = activeAudio;
      });
      stream.getVideoTracks().forEach(t => {
        t.enabled = activeVideo;
      });

      setupSpeechDetection(stream);

      // Initialize WebRTC Manager
      if (webrtcManagerRef.current) {
        webrtcManagerRef.current.cleanupAll();
        webrtcManagerRef.current = null;
      }

      connectedPeersRef.current.clear();

      const manager = new WebRTCManager(localPeerId, {
        onRemoteStream: (peerId, remoteStream) => {
          console.log(`[H-MEET] Remote stream received from ${peerId}. Tracks: audio=${remoteStream.getAudioTracks().length}, video=${remoteStream.getVideoTracks().length}`);
          remoteStream.getAudioTracks().forEach(t => console.log(`[H-MEET] Remote audio track from ${peerId}: id=${t.id}, enabled=${t.enabled}, muted=${t.muted}, readyState=${t.readyState}`));
          setRemoteStreams(prev => new Map(prev).set(peerId, remoteStream));
          ensureParticipant(peerId);
        },
        onRemoteStreamUpdate: (peerId, remoteStream) => {
          setRemoteStreams(prev => new Map(prev).set(peerId, remoteStream));
          ensureParticipant(peerId);
        },
        onRemoteStreamRemoved: (peerId) => {
          setRemoteStreams(prev => {
            const next = new Map(prev);
            next.delete(peerId);
            return next;
          });
        },
        onPeerConnectionStateChange: (peerId, state) => {
          console.log(`[H-MEET] WebRTC state for ${peerId}: ${state}`);

          setParticipants(prev => {
            const next = new Map(prev);
            const p = next.get(peerId);
            if (p) {
              next.set(peerId, { ...p, connectionState: state });
            }
            return next;
          });

          if (state === 'connected') {
            connectedPeersRef.current.add(peerId);
            setOverallConnectionState('connected');
            console.log(`[H-MEET] WebRTC connected with peer ${peerId}`);
          } else if (state === 'disconnected' || state === 'failed') {
            // Only show 'reconnecting' if this peer WAS connected (unexpected drop).
            // If they were still negotiating (never reached 'connected'), don't alarm the user.
            if (connectedPeersRef.current.has(peerId)) {
              setOverallConnectionState('reconnecting');
            }
          } else if (state === 'closed') {
            connectedPeersRef.current.delete(peerId);
            // Peer left cleanly — stay 'connected' to the meeting (signaling still up).
            // Only go to 'reconnecting' if we still expected this peer to be connected.
            // (reconnecting is already set above on 'disconnected'/'failed', so no change needed)
          }
        },
        onIceConnectionStateChange: (peerId, iceState) => {
          console.log(`[H-MEET] ICE state for ${peerId}: ${iceState}`);
        },
        onIceCandidate: (targetPeerId, candidate) => {
          if (signalingModeRef.current === 'socketio' && socketIOSignalingRef.current?.isConnected()) {
            socketIOSignalingRef.current.sendIceCandidate(targetPeerId, candidate.toJSON());
          } else {
            supabaseSignalingRef.current?.sendSignal({
              type: 'ICE_CANDIDATE',
              senderId: localPeerId,
              targetId: targetPeerId,
              senderName: localUserName,
              candidate: candidate.toJSON(),
            });
          }
        },
        // Called when ICE restart produces a new offer that must be sent via signaling
        onNeedRenegotiation: (targetPeerId, offer) => {
          console.log(`[H-MEET] Sending ICE restart offer to ${targetPeerId} via signaling`);
          if (signalingModeRef.current === 'socketio' && socketIOSignalingRef.current?.isConnected()) {
            socketIOSignalingRef.current.sendOffer(targetPeerId, offer);
          } else {
            supabaseSignalingRef.current?.sendSignal({
              type: 'OFFER',
              senderId: localPeerId,
              targetId: targetPeerId,
              senderName: localUserName,
              offer,
            });
          }
        },
        onError: (error, ctx) => {
          console.error(`[H-MEET] WebRTC Error in ${ctx}:`, error);
        },
      });

      manager.setLocalStream(stream);
      webrtcManagerRef.current = manager;

      const currentRoomKey = meeting.meetingRoomId || meeting.id;

      // 5. Try connecting to primary Socket.IO signaling server
      let socketIoConnected = false;
      try {
        const socketService = new SocketIOSignalingService({
          onRoomJoined: async (data) => {
            console.log('[H-MEET] Socket.IO room joined. Existing participants:', data.participants?.length || 0);
            // Set connected as soon as we're in the room — you are connected to the meeting.
            // WebRTC peer connections happen on top of this; 'reconnecting' only shows when
            // a previously-established WebRTC peer drops unexpectedly.
            setOverallConnectionState('connected');
            if (data.allowScreenShare !== undefined) {
              setAllowScreenShare(data.allowScreenShare);
            }

            // Initiate peer connections with all existing participants in the room
            if (data.participants && Array.isArray(data.participants)) {
              for (const p of data.participants) {
                const pSocketId = p.socketId;
                if (!pSocketId) continue;

                console.log(`[H-MEET] Sending offer to existing participant: ${p.name} (${pSocketId})`);

                ensureParticipant(pSocketId, {
                  memberId: p.userId || pSocketId,
                  socketId: pSocketId,
                  name: p.name || 'Member',
                  avatar: p.avatar,
                  role: p.role,
                  designation: p.designation,
                  micEnabled: p.micEnabled,
                  videoEnabled: p.videoEnabled,
                  isScreenSharing: p.isScreenSharing,
                  isHost: p.isHost,
                });

                try {
                  const offer = await manager.createOffer(pSocketId);
                  socketService.sendOffer(pSocketId, offer);
                } catch (e) {
                  console.warn(`[H-MEET] Failed to send offer to existing peer ${pSocketId}:`, e);
                }
              }
            }
          },

          onParticipantJoined: async (p) => {
            const pSocketId = p.socketId;
            if (!pSocketId) return;

            console.log(`[H-MEET] New participant joined: ${p.name} (${pSocketId}). Creating offer...`);

            ensureParticipant(pSocketId, {
              memberId: p.userId || pSocketId,
              socketId: pSocketId,
              name: p.name || 'Member',
              avatar: p.avatar,
              role: p.role,
              designation: p.designation,
              micEnabled: p.micEnabled,
              videoEnabled: p.videoEnabled,
              isScreenSharing: p.isScreenSharing,
              isHost: p.isHost,
            });

            // BUG FIX: When a new participant joins, we MUST create an offer to them.
            // Without this, no WebRTC connection is ever established with new joiners.
            try {
              const offer = await manager.createOffer(pSocketId);
              socketService.sendOffer(pSocketId, offer);
              console.log(`[H-MEET] Offer sent to new participant ${pSocketId}`);
            } catch (e) {
              console.warn(`[H-MEET] Failed to send offer to new participant ${pSocketId}:`, e);
            }
          },

          onParticipantLeft: (data) => {
            const pSocketId = data.socketId;
            if (pSocketId) {
              console.log(`[H-MEET] Participant left: ${data.name} (${pSocketId})`);
              manager.cleanupPeer(pSocketId);
              connectedPeersRef.current.delete(pSocketId);
              setParticipants(prev => {
                const next = new Map(prev);
                next.delete(pSocketId);
                return next;
              });
              setRemoteStreams(prev => {
                const next = new Map(prev);
                next.delete(pSocketId);
                return next;
              });
              // If no more connected peers, revert to connecting state
              if (connectedPeersRef.current.size === 0) {
                setOverallConnectionState('connecting');
              }
            }
          },

          onOffer: async (callerSocketId, sdp) => {
            try {
              console.log(`[H-MEET] Processing incoming offer from ${callerSocketId}`);
              const answer = await manager.handleOffer(callerSocketId, sdp);
              if (answer && answer.type === 'answer') {
                socketService.sendAnswer(callerSocketId, answer);
                console.log(`[H-MEET] Answer sent to ${callerSocketId}`);
              }
            } catch (err) {
              console.error(`[H-MEET] Handle offer from ${callerSocketId} error:`, err);
            }
          },

          onAnswer: async (responderSocketId, sdp) => {
            try {
              await manager.handleAnswer(responderSocketId, sdp);
            } catch (err) {
              console.error(`[H-MEET] Handle answer from ${responderSocketId} error:`, err);
            }
          },

          onIceCandidate: async (senderSocketId, candidate) => {
            try {
              await manager.addIceCandidate(senderSocketId, candidate);
            } catch (err) {
              console.error(`[H-MEET] Add ICE candidate from ${senderSocketId} error:`, err);
            }
          },

          onParticipantMediaChanged: (data) => {
            setParticipants(prev => {
              const next = new Map(prev);
              const p = next.get(data.socketId);
              if (p) {
                next.set(data.socketId, {
                  ...p,
                  micEnabled: data.micEnabled !== undefined ? data.micEnabled : p.micEnabled,
                  videoEnabled: data.videoEnabled !== undefined ? data.videoEnabled : p.videoEnabled,
                  isScreenSharing: data.isScreenSharing !== undefined ? data.isScreenSharing : p.isScreenSharing,
                });
              }
              return next;
            });
          },

          onParticipantSpeakingChanged: (data) => {
            setParticipants(prev => {
              const next = new Map(prev);
              const p = next.get(data.socketId);
              if (p) {
                next.set(data.socketId, { ...p, isSpeaking: Boolean(data.isSpeaking) });
              }
              return next;
            });
          },

          onReceiveMessage: () => {
            // Handled in chat listener
          },

          onForcedMute: (data) => {
            // Server-enforced host mute
            setMicEnabled(false);
            if (webrtcManagerRef.current) {
              webrtcManagerRef.current.setAudioEnabled(false);
            }
            if (localStream) {
              localStream.getAudioTracks().forEach(t => { t.enabled = false; });
            }
            toast.warning(`You were muted by the meeting host (${data?.by || 'Host'}).`);
          },

          onRemovedByHost: (data) => {
            // Server-enforced removal by host
            toast.error(data?.reason || 'You were removed from the meeting by the host.');
            leaveMeeting();
            if (onRemovedByHost) {
              onRemovedByHost(data?.reason);
            }
          },

          onMeetingEnded: (data) => {
            toast.info(data?.message || 'The meeting has been ended by the host.');
            leaveMeeting();
            if (onMeetingEndedByHost) {
              onMeetingEndedByHost();
            }
          },

          onScreenSharePermissionChanged: (data) => {
            setAllowScreenShare(data.allowScreenShare);
            if (!data.allowScreenShare && !isHost && isScreenSharing) {
              toggleScreenShare();
              toast.warning('Screen sharing has been disabled by the meeting host.');
            } else {
              toast.info(`Screen sharing ${data.allowScreenShare ? 'enabled' : 'restricted'} by host.`);
            }
          },

          onError: (err) => {
            console.warn('[H-MEET] Signaling error:', err);
          },

          // This callback is for Socket.IO socket-level state only.
          // Do NOT use this to drive the UI meeting connection label.
          // The UI connection label must only reflect WebRTC peer connection state.
          onSignalingConnectionStateChange: (state) => {
            console.log(`[H-MEET] Signaling socket state changed to: ${state} (NOT driving UI connection label)`);
            // Intentionally not calling setOverallConnectionState here.
            // The meeting connection indicator must only reflect WebRTC media state.
          },
        });

        socketIOSignalingRef.current = socketService;

        await socketService.connect({
          roomId: currentRoomKey,
          user: {
            userId: localUserId,
            name: localUserName,
            avatar: localUserAvatar,
            role: localUserRole,
            designation: currentUser?.designation,
          },
          micEnabled: activeAudio,
          videoEnabled: activeVideo,
        });

        signalingModeRef.current = 'socketio';
        socketIoConnected = true;
        // Note: do NOT set overallConnectionState = 'connected' here.
        // It will be set to 'connected' by WebRTC's onPeerConnectionStateChange when a peer connects.
        // If there are no peers yet (first in room), we stay in 'connecting'.
        console.log('[H-MEET] Signaling server connected via Socket.IO');
      } catch (socketErr) {
        console.warn('[H-MEET] Socket.IO signaling failed, activating Supabase fallback:', socketErr);
      }

      // 6. Supabase Realtime Fallback if Socket.IO unavailable
      if (!socketIoConnected) {
        signalingModeRef.current = 'supabase';
        const signaling = new SupabaseSignalingService(
          currentRoomKey,
          localPeerId,
          {
            id: localUserId,
            name: localUserName,
            avatar: localUserAvatar,
            role: localUserRole,
            designation: currentUser?.designation,
          },
          {
            onSignal: async (msg: SignalingMessage) => {
              await handleIncomingSupabaseSignal(msg);
            },
            onPresenceSync: (presences) => {
              handlePresenceSync(presences);
            },
            onPresenceJoin: (key, newPresences) => {
              if (key !== localPeerId) {
                const latest = newPresences?.[0] || {};
                ensureParticipant(key, {
                  memberId: latest.memberId || key,
                  socketId: key,
                  name: latest.name || 'Team Member',
                  avatar: latest.avatar || '',
                  role: latest.role || 'member',
                  designation: latest.designation || 'Software Engineer',
                  micEnabled: latest.micEnabled ?? true,
                  videoEnabled: latest.videoEnabled ?? true,
                  isScreenSharing: latest.isScreenSharing ?? false,
                  isHost: latest.isHost ?? false,
                  connectionState: 'connecting',
                });

                const mgr = webrtcManagerRef.current;
                if (mgr && (!mgr.hasPeerConnection(key) || mgr.getConnectionState(key) === 'failed')) {
                  mgr.createOffer(key).then(offer => {
                    supabaseSignalingRef.current?.sendSignal({
                      type: 'OFFER',
                      senderId: localPeerId,
                      targetId: key,
                      senderName: localUserName,
                      offer,
                    });
                  }).catch(e => console.warn(`[H-MEET] onPresenceJoin offer creation failed:`, e));
                }
              }
            },
            onPresenceLeave: (key) => {
              if (key !== localPeerId) {
                webrtcManagerRef.current?.cleanupPeer(key);
                connectedPeersRef.current.delete(key);
                setParticipants(prev => {
                  const next = new Map(prev);
                  next.delete(key);
                  return next;
                });
                setRemoteStreams(prev => {
                  const next = new Map(prev);
                  next.delete(key);
                  return next;
                });
              }
            },
            onMeetingEnded: () => {
              if (onMeetingEndedByHost) {
                onMeetingEndedByHost();
              }
            },
          }
        );

        supabaseSignalingRef.current = signaling;

        await signaling.connect({
          memberId: localUserId,
          name: localUserName,
          avatar: localUserAvatar,
          role: localUserRole,
          designation: currentUser?.designation,
          micEnabled: activeAudio,
          videoEnabled: activeVideo,
          isScreenSharing: false,
          isHost,
          joinedAt: new Date().toISOString(),
          connectionState: 'connected',
        });

        // Supabase signaling connected — we're in the meeting
        setOverallConnectionState('connected');

        // Periodic announcement heartbeat for discovery
        if (announceTimerRef.current) clearInterval(announceTimerRef.current);
        announceTimerRef.current = setInterval(() => {
          supabaseSignalingRef.current?.sendSignal({
            type: 'ANNOUNCE',
            senderId: localPeerId,
            senderName: localUserName,
          }).catch(() => {});
        }, 3500);
      }

      // Update meeting status in DB to 'live' if scheduled
      if (meeting.status === 'scheduled') {
        updateMeetingStatus(meeting.id, 'live').catch(() => {});
      }
    } catch (err: any) {
      console.error('[H-MEET] Failed to start meeting session:', err);
      setOverallConnectionState('disconnected');
    }
  }, [
    meeting,
    localPeerId,
    localUserId,
    localUserName,
    localUserAvatar,
    localUserRole,
    currentUser?.designation,
    micEnabled,
    videoEnabled,
    isHost,
    selectedCameraId,
    selectedMicrophoneId,
    setupSpeechDetection,
    ensureParticipant,
    handleIncomingSupabaseSignal,
    handlePresenceSync,
    onMeetingEndedByHost,
    onRemovedByHost,
  ]);

  // 5. Toggle microphone — MUST control the actual MediaStreamTrack.enabled
  const toggleMute = useCallback(() => {
    const nextState = !micEnabled;
    setMicEnabled(nextState);

    // Control the actual hardware microphone track
    if (localStream) {
      localStream.getAudioTracks().forEach(t => {
        t.enabled = nextState;
        console.log(`[H-MEET] Local audio track ${t.id} enabled=${nextState} (mute toggle)`);
      });
    }

    // Also call the WebRTCManager to ensure it controls the track (belt and suspenders)
    if (webrtcManagerRef.current) {
      webrtcManagerRef.current.setAudioEnabled(nextState);
    }

    // Broadcast mic status change to other participants (for their UI)
    if (signalingModeRef.current === 'socketio' && socketIOSignalingRef.current?.isConnected()) {
      socketIOSignalingRef.current.sendMediaToggle({ micEnabled: nextState });
    } else {
      supabaseSignalingRef.current?.sendSignal({
        type: 'MUTE_CHANGED',
        senderId: localPeerId,
        senderName: localUserName,
        micEnabled: nextState,
      });
      supabaseSignalingRef.current?.updatePresence({ micEnabled: nextState });
    }
  }, [micEnabled, localStream, localPeerId, localUserName]);

  // 6. Toggle camera — MUST control the actual MediaStreamTrack.enabled
  const toggleCamera = useCallback(async () => {
    if (meeting?.meetingType === 'audio') {
      toast.info('This is an audio-only meeting.');
      return;
    }

    const nextState = !videoEnabled;
    setVideoEnabled(nextState);

    // Control the actual camera video track
    if (localStream) {
      localStream.getVideoTracks().forEach(t => {
        t.enabled = nextState;
        console.log(`[H-MEET] Local video track ${t.id} enabled=${nextState} (camera toggle)`);
      });
    }

    if (webrtcManagerRef.current) {
      webrtcManagerRef.current.setVideoEnabled(nextState);
    }

    // Broadcast camera status change to other participants (for their UI)
    if (signalingModeRef.current === 'socketio' && socketIOSignalingRef.current?.isConnected()) {
      socketIOSignalingRef.current.sendMediaToggle({ videoEnabled: nextState });
    } else {
      supabaseSignalingRef.current?.sendSignal({
        type: 'CAMERA_CHANGED',
        senderId: localPeerId,
        senderName: localUserName,
        videoEnabled: nextState,
      });
      supabaseSignalingRef.current?.updatePresence({ videoEnabled: nextState });
    }
  }, [videoEnabled, localStream, meeting?.meetingType, localPeerId, localUserName]);

  // 7. Toggle Screen Share
  const toggleScreenShare = useCallback(async () => {
    const manager = webrtcManagerRef.current;
    if (!manager) return;

    if (isScreenSharing) {
      // Stop screen share
      await manager.stopScreenShare();
      setIsScreenSharing(false);

      if (signalingModeRef.current === 'socketio' && socketIOSignalingRef.current?.isConnected()) {
        socketIOSignalingRef.current.sendMediaToggle({ isScreenSharing: false });
      } else {
        supabaseSignalingRef.current?.sendSignal({
          type: 'SCREEN_SHARE_STOPPED',
          senderId: localPeerId,
          senderName: localUserName,
        });
        supabaseSignalingRef.current?.updatePresence({ isScreenSharing: false });
      }
    } else {
      // Check permissions
      if (!isHost && !allowScreenShare) {
        toast.error('Screen sharing has been disabled by the meeting host.');
        return;
      }

      try {
        const displayStream = await navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: { ideal: 30 } },
          audio: true,
        });

        screenStreamRef.current = displayStream;

        displayStream.getVideoTracks()[0].onended = () => {
          toggleScreenShare();
        };

        await manager.startScreenShare(displayStream);
        setIsScreenSharing(true);

        if (signalingModeRef.current === 'socketio' && socketIOSignalingRef.current?.isConnected()) {
          socketIOSignalingRef.current.sendMediaToggle({ isScreenSharing: true });
        } else {
          supabaseSignalingRef.current?.sendSignal({
            type: 'SCREEN_SHARE_STARTED',
            senderId: localPeerId,
            senderName: localUserName,
          });
          supabaseSignalingRef.current?.updatePresence({ isScreenSharing: true });
        }
      } catch (err: any) {
        if (err.name !== 'NotAllowedError') {
          console.error('[H-MEET] Screen share failed:', err);
          toast.error('Failed to start screen share.');
        }
      }
    }
  }, [isScreenSharing, isHost, allowScreenShare, localPeerId, localUserName]);

  // 8. Leave Meeting
  const leaveMeeting = useCallback(async () => {
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      setLocalStream(null);
    }

    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(track => track.stop());
      screenStreamRef.current = null;
    }

    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
    }

    if (announceTimerRef.current) {
      clearInterval(announceTimerRef.current);
      announceTimerRef.current = null;
    }

    connectedPeersRef.current.clear();
    webrtcManagerRef.current?.cleanupAll();
    socketIOSignalingRef.current?.disconnect();
    await supabaseSignalingRef.current?.disconnect();

    setParticipants(new Map());
    setRemoteStreams(new Map());
    setOverallConnectionState('disconnected');
  }, [localStream]);

  // 9. Host Control: Mute Remote Participant
  const muteParticipant = useCallback((targetSocketId: string, targetUserId: string) => {
    if (!isHost) {
      toast.error('Only the meeting host can mute participants.');
      return;
    }

    if (signalingModeRef.current === 'socketio' && socketIOSignalingRef.current?.isConnected()) {
      socketIOSignalingRef.current.muteParticipant(targetSocketId, targetUserId);
    } else {
      supabaseSignalingRef.current?.sendSignal({
        type: 'MUTE_CHANGED',
        senderId: localPeerId,
        targetId: targetUserId || targetSocketId,
        senderName: localUserName,
        micEnabled: false,
      });
    }

    // Optimistically reflect muted state in UI
    setParticipants(prev => {
      const next = new Map(prev);
      const p = next.get(targetSocketId) || next.get(targetUserId);
      if (p) {
        next.set(targetSocketId, { ...p, micEnabled: false });
      }
      return next;
    });

    toast.success('Participant muted');
  }, [isHost, localPeerId, localUserName]);

  // 10. Host Control: Mute All Participants
  const muteAllParticipants = useCallback(() => {
    if (!isHost) {
      toast.error('Only the meeting host can mute all participants.');
      return;
    }

    if (signalingModeRef.current === 'socketio' && socketIOSignalingRef.current?.isConnected()) {
      socketIOSignalingRef.current.muteAllParticipants();
    }

    setParticipants(prev => {
      const next = new Map(prev);
      for (const [key, p] of next.entries()) {
        if (!p.isHost) {
          next.set(key, { ...p, micEnabled: false });
        }
      }
      return next;
    });

    toast.success('All participants muted');
  }, [isHost]);

  // 11. Host Control: Remove Participant
  const removeParticipant = useCallback((targetSocketId: string, targetUserId: string) => {
    if (!isHost) {
      toast.error('Only the meeting host can remove participants.');
      return;
    }

    if (signalingModeRef.current === 'socketio' && socketIOSignalingRef.current?.isConnected()) {
      socketIOSignalingRef.current.removeParticipant(targetSocketId, targetUserId);
    } else {
      supabaseSignalingRef.current?.sendSignal({
        type: 'LEAVE',
        senderId: localPeerId,
        targetId: targetUserId || targetSocketId,
        senderName: localUserName,
      });
    }

    // Cleanup local connection to removed peer
    webrtcManagerRef.current?.cleanupPeer(targetSocketId);
    connectedPeersRef.current.delete(targetSocketId);
    setParticipants(prev => {
      const next = new Map(prev);
      next.delete(targetSocketId);
      return next;
    });
    setRemoteStreams(prev => {
      const next = new Map(prev);
      next.delete(targetSocketId);
      return next;
    });

    toast.success('Participant removed from the meeting');
  }, [isHost, localPeerId, localUserName]);

  // 12. Host Control: Toggle Screen Sharing Permission
  const toggleScreenSharePermission = useCallback((allowed: boolean) => {
    if (!isHost) {
      toast.error('Only the meeting host can manage screen sharing permissions.');
      return;
    }

    setAllowScreenShare(allowed);
    if (signalingModeRef.current === 'socketio' && socketIOSignalingRef.current?.isConnected()) {
      socketIOSignalingRef.current.toggleScreenSharePermission(allowed);
    }

    toast.success(`Screen sharing ${allowed ? 'enabled' : 'disabled'} for participants`);
  }, [isHost]);

  // 13. Host Control: End Meeting for Everyone
  const endMeetingForEveryone = useCallback(async () => {
    if (!isHost || !meeting) return;

    try {
      if (signalingModeRef.current === 'socketio' && socketIOSignalingRef.current?.isConnected()) {
        socketIOSignalingRef.current.endMeeting();
      } else {
        await supabaseSignalingRef.current?.broadcastMeetingEnded();
      }

      await updateMeetingStatus(meeting.id, 'completed');
      await leaveMeeting();
    } catch (err) {
      console.error('[H-MEET] Error ending meeting:', err);
    }
  }, [isHost, meeting, leaveMeeting]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      leaveMeeting();
    };
  }, []);

  // Compute current local participant state
  const localParticipantState: ParticipantState = useMemo(() => ({
    memberId: localUserId,
    socketId: socketIOSignalingRef.current?.getSocketId() || localPeerId,
    name: localUserName,
    avatar: localUserAvatar,
    role: currentUser?.role || 'member',
    designation: currentUser?.designation || 'Software Engineer',
    micEnabled,
    videoEnabled,
    isScreenSharing,
    isSpeaking: isLocalSpeaking,
    isHost,
    joinedAt: new Date().toISOString(),
    connectionState: overallConnectionState === 'connected' ? 'connected' : 'connecting',
  }), [
    localUserId,
    localPeerId,
    localUserName,
    localUserAvatar,
    currentUser?.role,
    currentUser?.designation,
    micEnabled,
    videoEnabled,
    isScreenSharing,
    isLocalSpeaking,
    isHost,
    overallConnectionState,
  ]);

  return {
    localStream,
    localParticipantState,
    participants,
    remoteStreams,
    micEnabled,
    videoEnabled,
    isScreenSharing,
    isLocalSpeaking,
    allowScreenShare,
    overallConnectionState,
    pinnedParticipantId,
    startMeetingSession,
    toggleMute,
    toggleCamera,
    toggleScreenShare,
    setPinnedParticipantId,
    leaveMeeting,
    muteParticipant,
    muteAllParticipants,
    removeParticipant,
    toggleScreenSharePermission,
    endMeetingForEveryone,
  };
}
