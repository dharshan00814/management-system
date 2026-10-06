// ============================================================
// Hyna Studio Management - Media Devices Hook
// Device Enumeration, Permission Handling, and Stream Acquisition
// ============================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import type { MediaDeviceOption } from '@/types/meeting';

export interface UseMediaDevicesResult {
  cameras: MediaDeviceOption[];
  microphones: MediaDeviceOption[];
  speakers: MediaDeviceOption[];
  selectedCameraId: string;
  selectedMicrophoneId: string;
  selectedSpeakerId: string;
  localStream: MediaStream | null;
  permissionError: string | null;
  hasPermissions: boolean;
  isLoadingDevices: boolean;
  isAudioOnly: boolean;
  requestMedia: (enableVideo: boolean, enableAudio: boolean) => Promise<MediaStream | null>;
  switchCamera: (deviceId: string) => Promise<void>;
  switchMicrophone: (deviceId: string) => Promise<void>;
  switchSpeaker: (deviceId: string, audioElement?: HTMLMediaElement | null) => Promise<void>;
  stopLocalStream: () => void;
  clearError: () => void;
}

export function useMediaDevices(initialAudioOnly = false): UseMediaDevicesResult {
  const [cameras, setCameras] = useState<MediaDeviceOption[]>([]);
  const [microphones, setMicrophones] = useState<MediaDeviceOption[]>([]);
  const [speakers, setSpeakers] = useState<MediaDeviceOption[]>([]);

  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [selectedMicrophoneId, setSelectedMicrophoneId] = useState<string>('');
  const [selectedSpeakerId, setSelectedSpeakerId] = useState<string>('');

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [hasPermissions, setHasPermissions] = useState<boolean>(false);
  const [isLoadingDevices, setIsLoadingDevices] = useState<boolean>(true);

  const streamRef = useRef<MediaStream | null>(null);

  // Enumerate all available audio & video devices
  const enumerateDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      setPermissionError('Your browser does not support media device enumeration.');
      setIsLoadingDevices(false);
      return;
    }

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cams: MediaDeviceOption[] = [];
      const mics: MediaDeviceOption[] = [];
      const spks: MediaDeviceOption[] = [];

      let camIndex = 1;
      let micIndex = 1;
      let spkIndex = 1;

      devices.forEach(d => {
        if (d.kind === 'videoinput') {
          cams.push({
            deviceId: d.deviceId,
            label: d.label || `Camera ${camIndex++}`,
            groupId: d.groupId,
          });
        } else if (d.kind === 'audioinput') {
          mics.push({
            deviceId: d.deviceId,
            label: d.label || `Microphone ${micIndex++}`,
            groupId: d.groupId,
          });
        } else if (d.kind === 'audiooutput') {
          spks.push({
            deviceId: d.deviceId,
            label: d.label || `Speaker ${spkIndex++}`,
            groupId: d.groupId,
          });
        }
      });

      setCameras(cams);
      setMicrophones(mics);
      setSpeakers(spks);

      if (!selectedCameraId && cams.length > 0) setSelectedCameraId(cams[0].deviceId);
      if (!selectedMicrophoneId && mics.length > 0) setSelectedMicrophoneId(mics[0].deviceId);
      if (!selectedSpeakerId && spks.length > 0) setSelectedSpeakerId(spks[0].deviceId);
    } catch (err) {
      console.warn('[useMediaDevices] Failed to enumerate devices:', err);
    } finally {
      setIsLoadingDevices(false);
    }
  }, [selectedCameraId, selectedMicrophoneId, selectedSpeakerId]);

  // Request getUserMedia stream with graceful fallback
  const requestMedia = useCallback(
    async (enableVideo: boolean, enableAudio: boolean): Promise<MediaStream | null> => {
      setPermissionError(null);

      if (!navigator.mediaDevices?.getUserMedia) {
        setPermissionError('Your browser does not support WebRTC media recording.');
        return null;
      }

      // If user requested neither video nor audio
      if (!enableVideo && !enableAudio) {
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(t => t.stop());
          streamRef.current = null;
          setLocalStream(null);
        }
        return null;
      }

      const audioConstraints: MediaTrackConstraints | boolean = enableAudio
        ? {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            ...(selectedMicrophoneId ? { deviceId: { exact: selectedMicrophoneId } } : {}),
          }
        : false;

      const videoConstraints: MediaTrackConstraints | boolean = enableVideo && !initialAudioOnly
        ? {
            width: { ideal: 1280, max: 1920 },
            height: { ideal: 720, max: 1080 },
            frameRate: { ideal: 30, max: 30 },
            ...(selectedCameraId ? { deviceId: { exact: selectedCameraId } } : {}),
          }
        : false;

      try {
        // Stop existing tracks before requesting fresh stream
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(t => t.stop());
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: audioConstraints,
          video: videoConstraints,
        });

        streamRef.current = stream;
        setLocalStream(stream);
        setHasPermissions(true);
        setPermissionError(null);

        // Re-enumerate to get human-readable device names now that permission is granted
        await enumerateDevices();
        return stream;
      } catch (err: any) {
        console.error('[useMediaDevices] getUserMedia error:', err);
        let errorMsg = 'Failed to access camera or microphone.';

        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          errorMsg = enableVideo && !initialAudioOnly
            ? 'Camera and/or Microphone permission was blocked. Please click the camera/lock icon in your browser address bar to allow access and try again.'
            : 'Microphone permission was blocked. Please click the lock icon in your browser address bar to allow microphone access.';
        } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
          errorMsg = 'No camera or microphone device was found on your system. Please plug in a device and refresh.';
        } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
          errorMsg = 'Your camera or microphone is already in use by another application. Please close other video apps and retry.';
        } else if (err.name === 'OverconstrainedError') {
          // Fallback: retry with unconstrained media
          try {
            const fallbackStream = await navigator.mediaDevices.getUserMedia({
              audio: enableAudio,
              video: enableVideo && !initialAudioOnly,
            });
            streamRef.current = fallbackStream;
            setLocalStream(fallbackStream);
            setHasPermissions(true);
            setPermissionError(null);
            return fallbackStream;
          } catch (fallbackErr: any) {
            errorMsg = fallbackErr.message || errorMsg;
          }
        }

        setPermissionError(errorMsg);
        return null;
      }
    },
    [enumerateDevices, initialAudioOnly, selectedCameraId, selectedMicrophoneId]
  );

  // Switch camera dynamically
  const switchCamera = useCallback(
    async (deviceId: string) => {
      setSelectedCameraId(deviceId);
      if (!localStream) return;

      const currentVideoTrack = localStream.getVideoTracks()[0];
      if (!currentVideoTrack) return;

      try {
        const newStream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: deviceId } },
        });
        const newVideoTrack = newStream.getVideoTracks()[0];

        localStream.removeTrack(currentVideoTrack);
        currentVideoTrack.stop();

        localStream.addTrack(newVideoTrack);
        setLocalStream(new MediaStream(localStream.getTracks()));
      } catch (err) {
        console.error('[useMediaDevices] switchCamera failed:', err);
      }
    },
    [localStream]
  );

  // Switch microphone dynamically
  const switchMicrophone = useCallback(
    async (deviceId: string) => {
      setSelectedMicrophoneId(deviceId);
      if (!localStream) return;

      const currentAudioTrack = localStream.getAudioTracks()[0];
      if (!currentAudioTrack) return;

      try {
        const newStream = await navigator.mediaDevices.getUserMedia({
          audio: { deviceId: { exact: deviceId } },
        });
        const newAudioTrack = newStream.getAudioTracks()[0];

        localStream.removeTrack(currentAudioTrack);
        currentAudioTrack.stop();

        localStream.addTrack(newAudioTrack);
        setLocalStream(new MediaStream(localStream.getTracks()));
      } catch (err) {
        console.error('[useMediaDevices] switchMicrophone failed:', err);
      }
    },
    [localStream]
  );

  // Switch speaker output (where setSinkId is supported)
  const switchSpeaker = useCallback(
    async (deviceId: string, audioElement?: HTMLMediaElement | null) => {
      setSelectedSpeakerId(deviceId);
      if (audioElement && 'setSinkId' in audioElement) {
        try {
          await (audioElement as any).setSinkId(deviceId);
        } catch (err) {
          console.warn('[useMediaDevices] setSinkId error:', err);
        }
      }
    },
    []
  );

  const stopLocalStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
      setLocalStream(null);
    }
  }, []);

  const clearError = useCallback(() => {
    setPermissionError(null);
  }, []);

  // Listen to hardware device connect/disconnect events
  useEffect(() => {
    enumerateDevices();

    const handleDeviceChange = () => {
      enumerateDevices();
    };

    navigator.mediaDevices?.addEventListener('devicechange', handleDeviceChange);
    return () => {
      navigator.mediaDevices?.removeEventListener('devicechange', handleDeviceChange);
      stopLocalStream();
    };
  }, [enumerateDevices, stopLocalStream]);

  return {
    cameras,
    microphones,
    speakers,
    selectedCameraId,
    selectedMicrophoneId,
    selectedSpeakerId,
    localStream,
    permissionError,
    hasPermissions,
    isLoadingDevices,
    isAudioOnly: initialAudioOnly,
    requestMedia,
    switchCamera,
    switchMicrophone,
    switchSpeaker,
    stopLocalStream,
    clearError,
  };
}
