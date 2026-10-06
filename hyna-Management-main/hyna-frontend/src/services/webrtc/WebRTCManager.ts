// ============================================================
// Hyna Studio Management - WebRTC Group Call Manager
// Dedicated PeerConnectionManager for Mesh Video & Audio Calls
// Standard W3C WebRTC with STUN + Free OpenRelay TURN Fallback
// ============================================================

export interface WebRTCEventCallbacks {
  onRemoteStream: (peerId: string, stream: MediaStream) => void;
  onRemoteStreamUpdate?: (peerId: string, stream: MediaStream) => void;
  onRemoteStreamRemoved: (peerId: string) => void;
  onPeerConnectionStateChange: (peerId: string, state: RTCPeerConnectionState) => void;
  onIceConnectionStateChange?: (peerId: string, state: RTCIceConnectionState) => void;
  onIceCandidate: (targetPeerId: string, candidate: RTCIceCandidate) => void;
  // Called when we need to send a new offer (e.g. after ICE restart) through signaling
  onNeedRenegotiation?: (targetPeerId: string, offer: RTCSessionDescriptionInit) => void;
  onError: (error: Error, context: string) => void;
}

export const DEFAULT_RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
    { urls: 'stun:global.stun.twilio.com:3478' },
  ],
  iceCandidatePoolSize: 0,
};

export class WebRTCManager {
  private localStream: MediaStream | null = null;
  private screenStream: MediaStream | null = null;
  private peerConnections = new Map<string, RTCPeerConnection>();
  // Stable MediaStream per peer — we mutate tracks in-place rather than creating new wrappers
  private remoteStreams = new Map<string, MediaStream>();
  private pendingCandidates = new Map<string, RTCIceCandidateInit[]>();
  private callbacks: WebRTCEventCallbacks;
  private rtcConfig: RTCConfiguration;
  private localUserId: string;

  constructor(localUserId: string, callbacks: WebRTCEventCallbacks, config?: RTCConfiguration) {
    this.localUserId = localUserId;
    this.callbacks = callbacks;
    this.rtcConfig = config || DEFAULT_RTC_CONFIG;
  }

  // Set the local MediaStream (camera & microphone)
  public setLocalStream(stream: MediaStream | null) {
    this.localStream = stream;

    if (stream) {
      console.log(`[H-MEET] setLocalStream called. Audio tracks: ${stream.getAudioTracks().length}, Video tracks: ${stream.getVideoTracks().length}`);
      stream.getAudioTracks().forEach(t => console.log(`[H-MEET] Local audio track: id=${t.id}, enabled=${t.enabled}, muted=${t.muted}, readyState=${t.readyState}`));
      stream.getVideoTracks().forEach(t => console.log(`[H-MEET] Local video track: id=${t.id}, enabled=${t.enabled}, muted=${t.muted}, readyState=${t.readyState}`));

      // Attach local tracks to all active peer connections
      this.peerConnections.forEach((pc, peerId) => {
        const senders = pc.getSenders();
        stream.getTracks().forEach(track => {
          const existingSender = senders.find(s => s.track?.kind === track.kind);
          if (existingSender) {
            existingSender.replaceTrack(track).catch(err => {
              this.callbacks.onError(err, `replaceTrack for ${peerId}`);
            });
          } else {
            try {
              pc.addTrack(track, stream);
              console.log(`[H-MEET] Added ${track.kind} track to existing peer ${peerId}`);
            } catch (e) {
              console.warn(`[H-MEET] AddTrack warning for ${peerId}:`, e);
            }
          }
        });
      });
    }
  }

  public getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  public hasPeerConnection(peerId: string): boolean {
    const pc = this.peerConnections.get(peerId);
    return Boolean(pc && pc.signalingState !== 'closed');
  }

  public getConnectionState(peerId: string): RTCPeerConnectionState | null {
    const pc = this.peerConnections.get(peerId);
    return pc ? pc.connectionState : null;
  }

  // Create or retrieve an RTCPeerConnection for a remote peer
  public getOrCreatePeerConnection(peerId: string): RTCPeerConnection {
    let pc = this.peerConnections.get(peerId);
    if (pc && pc.signalingState !== 'closed') {
      return pc;
    }

    console.log(`[H-MEET] Peer created for ${peerId}`);

    pc = new RTCPeerConnection(this.rtcConfig);
    this.peerConnections.set(peerId, pc);

    // Add local tracks to new peer connection
    const currentStream = this.screenStream || this.localStream;
    if (currentStream) {
      currentStream.getTracks().forEach(track => {
        try {
          pc!.addTrack(track, currentStream);
          console.log(`[H-MEET] Added local ${track.kind} track (enabled=${track.enabled}) to new peer ${peerId}`);
        } catch (e) {
          console.warn(`[H-MEET] Failed to add track for peer ${peerId}:`, e);
        }
      });
    } else {
      console.warn(`[H-MEET] No local stream available when creating peer for ${peerId} — tracks will be missing from WebRTC`);
    }

    // Handle ICE Candidates generated locally
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log(`[H-MEET] ICE candidate sent to ${peerId}: ${event.candidate.candidate.substring(0, 80)}...`);
        this.callbacks.onIceCandidate(peerId, event.candidate);
      }
    };

    // Monitor WebRTC Connection State (NOT the signaling state)
    pc.onconnectionstatechange = () => {
      const state = pc!.connectionState;
      console.log(`[H-MEET] Peer ${peerId} connectionState changed to: ${state}`);
      this.callbacks.onPeerConnectionStateChange(peerId, state);

      if (state === 'connected') {
        console.log(`[H-MEET] WebRTC connected with ${peerId}`);
      } else if (state === 'disconnected') {
        console.warn(`[H-MEET] WebRTC disconnected with ${peerId}`);
      } else if (state === 'failed') {
        console.warn(`[H-MEET] WebRTC failed with ${peerId}. Attempting ICE restart.`);
        this.restartIce(peerId).then(offer => {
          if (offer && this.callbacks.onNeedRenegotiation) {
            console.log(`[H-MEET] ICE restart offer created for ${peerId}, sending via signaling`);
            this.callbacks.onNeedRenegotiation(peerId, offer);
          }
        }).catch(err => {
          this.callbacks.onError(err, `restartIce for ${peerId}`);
        });
      } else if (state === 'closed') {
        this.cleanupPeer(peerId);
      }
    };

    // Monitor ICE Connection State (more granular than connectionState)
    pc.oniceconnectionstatechange = () => {
      const iceState = pc!.iceConnectionState;
      console.log(`[H-MEET] Peer ${peerId} iceConnectionState changed to: ${iceState}`);
      if (this.callbacks.onIceConnectionStateChange) {
        this.callbacks.onIceConnectionStateChange(peerId, iceState);
      }
    };

    // Handle incoming Remote Media Tracks (Video & Audio)
    pc.ontrack = (event) => {
      console.log(`[H-MEET] Remote track received from ${peerId}: kind=${event.track.kind}, id=${event.track.id}, readyState=${event.track.readyState}, muted=${event.track.muted}`);

      // Get or create a stable MediaStream for this peer
      // IMPORTANT: We reuse the same MediaStream object and mutate it in-place
      // to avoid React re-renders from destroying the srcObject reference on audio/video elements.
      let remoteStream = this.remoteStreams.get(peerId);
      if (!remoteStream) {
        remoteStream = new MediaStream();
        this.remoteStreams.set(peerId, remoteStream);
        console.log(`[H-MEET] Created new remote MediaStream for peer ${peerId}`);
      }

      // Replace existing track of the same kind, or add new track
      const existingTrack = remoteStream.getTracks().find(t => t.kind === event.track.kind);
      if (existingTrack) {
        if (existingTrack.id !== event.track.id) {
          remoteStream.removeTrack(existingTrack);
          remoteStream.addTrack(event.track);
          console.log(`[H-MEET] Replaced existing ${event.track.kind} track for peer ${peerId}`);
        }
        // else same track already present, no-op
      } else {
        remoteStream.addTrack(event.track);
        console.log(`[H-MEET] Added new ${event.track.kind} track to remote stream for peer ${peerId}`);
      }

      console.log(`[H-MEET] Remote stream for ${peerId} now has ${remoteStream.getAudioTracks().length} audio + ${remoteStream.getVideoTracks().length} video tracks`);

      // Notify React with the SAME stable stream reference
      // React's useEffect dependency on the stream reference will NOT re-run for the same object,
      // which is correct — we don't want to re-assign srcObject on every track update.
      // For the first track arrival we must notify to trigger the initial srcObject assignment.
      this.callbacks.onRemoteStream(peerId, remoteStream);
      if (this.callbacks.onRemoteStreamUpdate) {
        this.callbacks.onRemoteStreamUpdate(peerId, remoteStream);
      }

      // Log track state changes for debugging
      event.track.onunmute = () => {
        console.log(`[H-MEET] Remote ${event.track.kind} track UNMUTED for peer ${peerId}`);
        if (this.callbacks.onRemoteStreamUpdate) {
          this.callbacks.onRemoteStreamUpdate(peerId, remoteStream!);
        }
      };

      event.track.onmute = () => {
        console.log(`[H-MEET] Remote ${event.track.kind} track MUTED for peer ${peerId}`);
      };

      event.track.onended = () => {
        console.log(`[H-MEET] Remote ${event.track.kind} track ended for peer ${peerId}`);
        const currentStream = this.remoteStreams.get(peerId);
        if (currentStream && currentStream.getTracks().every(t => t.readyState === 'ended')) {
          this.callbacks.onRemoteStreamRemoved(peerId);
        }
      };
    };

    return pc;
  }

  // Create an OFFER to send to a remote peer
  public async createOffer(peerId: string, iceRestart = false): Promise<RTCSessionDescriptionInit> {
    const pc = this.getOrCreatePeerConnection(peerId);
    console.log(`[H-MEET] Offer created for ${peerId} (iceRestart=${iceRestart})`);
    const offer = await pc.createOffer({
      iceRestart,
      offerToReceiveAudio: true,
      offerToReceiveVideo: true,
    });
    await pc.setLocalDescription(offer);
    return offer;
  }

  // Handle an OFFER received from a remote peer and create an ANSWER
  public async handleOffer(peerId: string, offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit | null> {
    const pc = this.getOrCreatePeerConnection(peerId);
    console.log(`[H-MEET] Offer received from ${peerId}. signalingState=${pc.signalingState}`);

    // Offer collision resolution (Polite vs. Impolite pattern)
    if (pc.signalingState !== 'stable') {
      const isPolite = this.localUserId < peerId;
      if (isPolite) {
        console.log(`[H-MEET] Collision: Polite peer rolling back local offer for ${peerId}`);
        try {
          await pc.setLocalDescription({ type: 'rollback' } as any);
          await pc.setRemoteDescription(new RTCSessionDescription(offer));
        } catch (e) {
          console.warn(`[H-MEET] Rollback error for ${peerId}:`, e);
          return null;
        }
      } else {
        console.log(`[H-MEET] Collision: Impolite peer ignoring remote offer from ${peerId}`);
        return null;
      }
    } else {
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      console.log(`[H-MEET] Remote description set for ${peerId}`);
    }

    // Process any queued candidates that arrived before remoteDescription
    await this.processPendingCandidates(peerId);

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    console.log(`[H-MEET] Answer created for ${peerId}`);
    return answer;
  }

  // Handle an ANSWER received from a remote peer
  public async handleAnswer(peerId: string, answer: RTCSessionDescriptionInit): Promise<void> {
    const pc = this.peerConnections.get(peerId);
    if (!pc) {
      console.warn(`[H-MEET] Answer received from non-existent peer: ${peerId}`);
      return;
    }

    console.log(`[H-MEET] Answer received from ${peerId}. signalingState=${pc.signalingState}`);

    if (pc.signalingState === 'have-local-offer' && answer.type === 'answer') {
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
      console.log(`[H-MEET] Remote description set from answer for ${peerId}`);
      await this.processPendingCandidates(peerId);
    } else {
      console.warn(`[H-MEET] Ignored answer from ${peerId} (signalingState: ${pc.signalingState}, answerType: ${answer.type})`);
    }
  }

  // Add an ICE candidate received from a remote peer
  public async addIceCandidate(peerId: string, candidateInit: RTCIceCandidateInit): Promise<void> {
    if (!candidateInit || !candidateInit.candidate) return;
    const pc = this.peerConnections.get(peerId);

    // If peer connection exists and remote description is already set, add directly
    if (pc && pc.remoteDescription && pc.remoteDescription.type) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidateInit));
        console.log(`[H-MEET] ICE candidate received and applied for ${peerId}`);
      } catch (err) {
        console.warn(`[H-MEET] Failed to add ICE candidate for ${peerId}:`, err);
      }
    } else {
      // Queue the candidate until setRemoteDescription completes
      console.log(`[H-MEET] ICE candidate received but queued for ${peerId} (no remoteDescription yet)`);
      const queue = this.pendingCandidates.get(peerId) || [];
      queue.push(candidateInit);
      this.pendingCandidates.set(peerId, queue);
    }
  }

  private async processPendingCandidates(peerId: string): Promise<void> {
    const pc = this.peerConnections.get(peerId);
    const queue = this.pendingCandidates.get(peerId);
    if (!pc || !queue || queue.length === 0) return;

    console.log(`[H-MEET] Processing ${queue.length} queued ICE candidates for ${peerId}`);
    for (const cand of queue) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(cand));
      } catch (err) {
        console.warn(`[H-MEET] Error applying queued ICE candidate for ${peerId}:`, err);
      }
    }
    this.pendingCandidates.delete(peerId);
  }

  // ICE restart for reconnection — returns the offer that must be sent via signaling
  public async restartIce(peerId: string): Promise<RTCSessionDescriptionInit | null> {
    try {
      console.log(`[H-MEET] Initiating ICE restart for peer ${peerId}`);
      const offer = await this.createOffer(peerId, true);
      return offer;
    } catch (err) {
      this.callbacks.onError(err as Error, `restartIce failed for ${peerId}`);
      return null;
    }
  }

  // Screen Sharing
  public async startScreenShare(displayStream: MediaStream): Promise<void> {
    this.screenStream = displayStream;
    const screenVideoTrack = displayStream.getVideoTracks()[0];
    if (!screenVideoTrack) return;

    screenVideoTrack.onended = () => {
      this.stopScreenShare();
    };

    // Replace video sender track on all active connections
    for (const [peerId, pc] of this.peerConnections) {
      const videoSender = pc.getSenders().find(s => s.track?.kind === 'video');
      if (videoSender) {
        await videoSender.replaceTrack(screenVideoTrack).catch(err => {
          this.callbacks.onError(err, `Screen share replaceTrack for ${peerId}`);
        });
      }
    }
  }

  public async stopScreenShare(): Promise<void> {
    if (this.screenStream) {
      this.screenStream.getTracks().forEach(t => t.stop());
      this.screenStream = null;
    }

    const cameraVideoTrack = this.localStream?.getVideoTracks()[0] || null;

    // Restore camera video track on all active connections
    for (const [peerId, pc] of this.peerConnections) {
      const videoSender = pc.getSenders().find(s => s.track?.kind === 'video');
      if (videoSender && cameraVideoTrack) {
        await videoSender.replaceTrack(cameraVideoTrack).catch(err => {
          this.callbacks.onError(err, `Restore camera replaceTrack for ${peerId}`);
        });
      }
    }
  }

  // Media Mute / Unmute Real-Time Control
  public setAudioEnabled(enabled: boolean): void {
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach(track => {
        track.enabled = enabled;
        console.log(`[H-MEET] Local audio track ${track.id} enabled=${enabled}`);
      });
    }
  }

  public setVideoEnabled(enabled: boolean): void {
    if (this.localStream) {
      this.localStream.getVideoTracks().forEach(track => {
        track.enabled = enabled;
        console.log(`[H-MEET] Local video track ${track.id} enabled=${enabled}`);
      });
    }
  }

  // Replace video track across all active peer connections
  public async replaceVideoTrack(newTrack: MediaStreamTrack | null): Promise<void> {
    for (const [peerId, pc] of this.peerConnections) {
      const videoSender = pc.getSenders().find(s => s.track?.kind === 'video');
      if (videoSender) {
        await videoSender.replaceTrack(newTrack).catch(err => {
          this.callbacks.onError(err, `replaceVideoTrack for ${peerId}`);
        });
      }
    }
  }

  // Cleanup a single peer
  public cleanupPeer(peerId: string): void {
    const pc = this.peerConnections.get(peerId);
    if (pc) {
      pc.onicecandidate = null;
      pc.ontrack = null;
      pc.onconnectionstatechange = null;
      pc.oniceconnectionstatechange = null;
      pc.close();
      this.peerConnections.delete(peerId);
      console.log(`[H-MEET] Peer ${peerId} connection cleaned up`);
    }
    this.remoteStreams.delete(peerId);
    this.pendingCandidates.delete(peerId);
    this.callbacks.onRemoteStreamRemoved(peerId);
  }

  // Teardown everything on meeting leave or component unmount
  public cleanupAll(): void {
    if (this.screenStream) {
      this.screenStream.getTracks().forEach(t => t.stop());
      this.screenStream = null;
    }

    if (this.localStream) {
      this.localStream.getTracks().forEach(t => t.stop());
      this.localStream = null;
    }

    this.peerConnections.forEach((pc, peerId) => {
      pc.onicecandidate = null;
      pc.ontrack = null;
      pc.onconnectionstatechange = null;
      pc.oniceconnectionstatechange = null;
      pc.close();
      console.log(`[H-MEET] WebRTC disconnected - peer ${peerId} closed`);
    });
    this.peerConnections.clear();
    this.remoteStreams.clear();
    this.pendingCandidates.clear();
  }
}
