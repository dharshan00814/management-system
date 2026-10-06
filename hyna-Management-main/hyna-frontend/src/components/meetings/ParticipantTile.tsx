// ============================================================
// Hyna Studio Management - Participant Tile Component
// Video Stream Rendering, Avatar Fallback, Speaking & Audio Badges
// ============================================================

import React, { useRef, useEffect, useState } from 'react';
import { Mic, MicOff, VideoOff, Pin, PinOff, MonitorUp } from 'lucide-react';
import { Avatar } from '@/components/ui';
import type { ParticipantState } from '@/types/meeting';

export interface ParticipantTileProps {
  participant: ParticipantState;
  stream: MediaStream | null;
  isLocal: boolean;
  isPinned?: boolean;
  onTogglePin?: (memberId: string) => void;
}

export function ParticipantTile({
  participant,
  stream,
  isLocal,
  isPinned = false,
  onTogglePin,
}: ParticipantTileProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [remoteSpeaking, setRemoteSpeaking] = useState<boolean>(false);
  // Track if we've already tried to play this stream, to handle autoplay unlock
  const hasAttemptedPlayRef = useRef<boolean>(false);

  const hasVideoStream = Boolean(
    stream && 
    stream.getVideoTracks().length > 0 && 
    stream.getVideoTracks().some(t => t.readyState === 'live') &&
    (participant.videoEnabled || participant.isScreenSharing)
  );

  // Attach stream to video element
  // The video element handles both local (muted) and remote video.
  // We use the same stable MediaStream reference from the parent — do NOT create new wrappers here.
  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;

    if (stream) {
      if (videoEl.srcObject !== stream) {
        videoEl.srcObject = stream;
        console.log(`[H-MEET] Video srcObject assigned for ${participant.name} (${isLocal ? 'local' : 'remote'})`);
      }
      videoEl.play().catch(e => {
        // Autoplay blocked for video is ok — browser will play on user interaction
        if (e.name !== 'AbortError') {
          console.warn(`[H-MEET] Video play error for ${participant.name}:`, e.name);
        }
      });
    } else {
      videoEl.srcObject = null;
    }
  }, [stream, participant.name, isLocal]);

  // Dedicated audio element for remote participants ONLY.
  // CRITICAL: We attach the full stream (not a re-wrapped copy) directly to srcObject.
  // The audio element handles audio playback independently of the video element visibility.
  // The video element is always muted — audio only flows through the dedicated <audio> element.
  useEffect(() => {
    const audioEl = audioRef.current;
    if (!audioEl || isLocal) return;

    if (stream) {
      // Attach the full remote stream directly. The browser will play all audio tracks.
      // Do NOT create new MediaStream([audioTracks]) — that severs the track from the connection.
      if (audioEl.srcObject !== stream) {
        audioEl.srcObject = stream;
        hasAttemptedPlayRef.current = false;
        console.log(`[H-MEET] Audio srcObject assigned for remote participant: ${participant.name}`);
        console.log(`[H-MEET] Audio tracks in stream: ${stream.getAudioTracks().length}`);
        stream.getAudioTracks().forEach(t => {
          console.log(`[H-MEET] Remote audio track: id=${t.id}, enabled=${t.enabled}, muted=${t.muted}, readyState=${t.readyState}`);
        });
      }

      if (!hasAttemptedPlayRef.current) {
        hasAttemptedPlayRef.current = true;
        const playPromise = audioEl.play();
        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              console.log(`[H-MEET] Remote audio playback started for ${participant.name}`);
            })
            .catch(e => {
              if (e.name === 'NotAllowedError') {
                // Autoplay was blocked — set up interaction unlock
                console.warn(`[H-MEET] Remote audio autoplay blocked for ${participant.name}. Waiting for user interaction.`);
                const unlockAudio = () => {
                  audioEl.play()
                    .then(() => console.log(`[H-MEET] Remote audio unlocked for ${participant.name}`))
                    .catch(() => {});
                  window.removeEventListener('click', unlockAudio);
                  window.removeEventListener('keydown', unlockAudio);
                  window.removeEventListener('touchstart', unlockAudio);
                };
                window.addEventListener('click', unlockAudio, { once: true });
                window.addEventListener('keydown', unlockAudio, { once: true });
                window.addEventListener('touchstart', unlockAudio, { once: true });
              } else if (e.name !== 'AbortError') {
                console.error(`[H-MEET] Remote audio playback failed for ${participant.name}:`, e);
              }
            });
        }
      }
    } else {
      audioEl.srcObject = null;
      hasAttemptedPlayRef.current = false;
    }
  }, [stream, isLocal, participant.name]);

  // Re-attempt play when new audio tracks arrive in the stream
  // (handles the case where ontrack fires after srcObject is set)
  useEffect(() => {
    const audioEl = audioRef.current;
    if (!audioEl || isLocal || !stream) return;

    const handleTrackAdded = () => {
      // If the audio element is paused and we have audio tracks, try to resume
      if (audioEl.paused && stream.getAudioTracks().length > 0) {
        audioEl.play().catch(() => {});
      }
    };

    stream.addEventListener('addtrack', handleTrackAdded);
    return () => {
      stream.removeEventListener('addtrack', handleTrackAdded);
    };
  }, [stream, isLocal]);

  // Real-time audio analyser on remote stream to detect speaking
  useEffect(() => {
    if (isLocal || !stream) {
      setRemoteSpeaking(false);
      return;
    }

    const audioTrack = stream.getAudioTracks()[0];
    if (!audioTrack || !participant.micEnabled || audioTrack.readyState !== 'live') {
      setRemoteSpeaking(false);
      return;
    }

    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      // Use the stream directly (not a copy) for the analyser source
      const source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);

      const data = new Uint8Array(analyser.frequencyBinCount);
      let animId: number;

      const checkVolume = () => {
        analyser.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i];
        setRemoteSpeaking((sum / data.length) > 16);
        animId = requestAnimationFrame(checkVolume);
      };
      checkVolume();

      return () => {
        cancelAnimationFrame(animId);
        ctx.close().catch(() => {});
      };
    } catch {
      // fallback
    }
  }, [stream, isLocal, participant.micEnabled]);

  const isActuallySpeaking = isLocal ? participant.isSpeaking : (participant.isSpeaking || remoteSpeaking);

  // Map WebRTC connection state to display label
  const connectionBadge = (() => {
    if (isLocal) return null;
    const state = participant.connectionState;
    if (state === 'connecting') {
      return (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/20 backdrop-blur-md text-amber-300 border border-amber-500/30">
          Connecting...
        </span>
      );
    }
    if (state === 'disconnected' || state === 'failed') {
      return (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-500/20 backdrop-blur-md text-red-300 border border-red-500/30">
          Reconnecting...
        </span>
      );
    }
    // 'connected' and 'closed' — no badge (connected is normal, show nothing)
    return null;
  })();

  return (
    <div
      className={`relative w-full h-full min-h-[180px] bg-[#121217] rounded-2xl overflow-hidden border transition-all duration-200 select-none shadow-lg group ${
        isActuallySpeaking
          ? 'border-emerald-500 ring-2 ring-emerald-500/40'
          : 'border-white/10 hover:border-white/20'
      }`}
    >
      {/* Dedicated Remote Audio Player
          - autoPlay: hint to browser to start playing as soon as srcObject is set
          - playsInline: prevents fullscreen on iOS
          - muted must NOT be set here — we need audio output
          - volume is at default 1.0
      */}
      {!isLocal && (
        <audio
          ref={audioRef}
          autoPlay
          playsInline
          // NOTE: Do NOT add muted={true} here — that would silence remote audio
        />
      )}

      {/* Video Stream Element
          Always muted to prevent audio feedback.
          Audio is handled by the dedicated <audio> element above for remote participants.
          For local preview, we don't need audio playback anyway.
      */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={true}
        className={`w-full h-full object-cover ${!hasVideoStream ? 'opacity-0 absolute inset-0 -z-10' : 'relative z-0'} ${isLocal && !participant.isScreenSharing ? 'scale-x-[-1]' : ''}`}
      />
      
      {!hasVideoStream && (
        /* Avatar Placeholder when camera is disabled or audio meeting */
        <div className="w-full h-full flex flex-col items-center justify-center p-4 bg-gradient-to-b from-[#181820] to-[#101014]">
          <div className="relative">
            <Avatar
              name={participant.name}
              src={participant.avatar}
              className={`w-20 h-20 text-2xl font-bold border-2 transition-all ${
                isActuallySpeaking
                  ? 'border-emerald-400 scale-105 shadow-xl shadow-emerald-500/20'
                  : 'border-white/10'
              }`}
            />
            {isActuallySpeaking && (
              <span className="absolute -bottom-1 -right-1 flex h-4 w-4">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-4 w-4 bg-emerald-500 border-2 border-[#121217]" />
              </span>
            )}
          </div>
          <span className="mt-3 text-sm font-medium text-white/90 truncate max-w-[80%]">
            {participant.name}
          </span>
          <span className="text-[11px] text-white/40 truncate max-w-[80%]">
            {participant.designation || participant.role}
          </span>
          {!participant.videoEnabled && (
            <span className="mt-2.5 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-white/5 border border-white/10 text-white/50 flex items-center gap-1.5 shadow-sm">
              <VideoOff className="w-3 h-3 text-red-400" />
              Camera is off
            </span>
          )}
        </div>
      )}

      {/* Top Left: Status Badges (Host / Screen Sharing / WebRTC connection state) */}
      <div className="absolute top-3 left-3 flex items-center gap-1.5 z-10">
        {participant.isHost && (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-white/10 backdrop-blur-md text-white border border-white/15">
            Host
          </span>
        )}

        {participant.isScreenSharing && (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-indigo-500/20 backdrop-blur-md text-indigo-300 border border-indigo-500/30 flex items-center gap-1">
            <MonitorUp className="w-3 h-3" />
            Screen
          </span>
        )}

        {connectionBadge}
      </div>

      {/* Top Right: Pin Toggle Action */}
      {onTogglePin && (
        <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity z-10">
          <button
            type="button"
            onClick={() => onTogglePin(participant.memberId)}
            className={`p-1.5 rounded-lg backdrop-blur-md transition-all ${
              isPinned ? 'bg-white text-black' : 'bg-black/60 text-white/80 hover:text-white'
            }`}
            title={isPinned ? 'Unpin' : 'Pin to dominant view'}
          >
            {isPinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
          </button>
        </div>
      )}

      {/* Bottom Bar: Participant Name & Media Icons */}
      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-3 pt-6 flex items-center justify-between z-10">
        <div className="flex items-center gap-1.5 truncate mr-2">
          <span className="text-xs font-medium text-white truncate drop-shadow-sm">
            {isLocal ? `${participant.name} (You)` : participant.name}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* Mic State Icon */}
          <div
            className={`p-1 rounded-full ${
              participant.micEnabled
                ? isActuallySpeaking 
                  ? 'bg-emerald-500/80 text-white' 
                  : 'bg-black/50 text-white/70'
                : 'bg-red-500/80 text-white'
            }`}
            title={participant.micEnabled ? 'Microphone On' : 'Microphone Muted'}
          >
            {participant.micEnabled ? <Mic className="w-3 h-3" /> : <MicOff className="w-3 h-3" />}
          </div>

          {/* Video State Icon */}
          {!participant.videoEnabled && (
            <div className="p-1 rounded-full bg-red-500/20 text-red-300 border border-red-500/30" title="Camera Off">
              <VideoOff className="w-3 h-3" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
