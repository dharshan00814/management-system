// ============================================================
// Hyna Studio Management - In-Meeting Device Settings Modal
// Dynamic Switching of Camera, Microphone, and Speaker
// ============================================================

import React from 'react';
import { Modal, Button } from '@/components/ui';
import { Camera, Mic, Volume2 } from 'lucide-react';
import type { MediaDeviceOption } from '@/types/meeting';

export interface DeviceSettingsModalProps {
  open: boolean;
  onClose: () => void;
  cameras: MediaDeviceOption[];
  microphones: MediaDeviceOption[];
  speakers: MediaDeviceOption[];
  selectedCameraId: string;
  selectedMicrophoneId: string;
  selectedSpeakerId: string;
  isAudioOnly: boolean;
  onSelectCamera: (deviceId: string) => void;
  onSelectMicrophone: (deviceId: string) => void;
  onSelectSpeaker: (deviceId: string) => void;
}

export function DeviceSettingsModal({
  open,
  onClose,
  cameras,
  microphones,
  speakers,
  selectedCameraId,
  selectedMicrophoneId,
  selectedSpeakerId,
  isAudioOnly,
  onSelectCamera,
  onSelectMicrophone,
  onSelectSpeaker,
}: DeviceSettingsModalProps) {
  return (
    <Modal open={open} onClose={onClose} title="Audio & Video Settings">
      <div className="space-y-4 pt-1">
        {/* Camera Selector */}
        {!isAudioOnly && (
          <div>
            <label className="text-xs font-medium text-[var(--color-foreground)] flex items-center gap-1.5 mb-1.5">
              <Camera className="w-3.5 h-3.5 text-indigo-500" />
              Camera
            </label>
            <select
              value={selectedCameraId}
              onChange={(e) => onSelectCamera(e.target.value)}
              className="w-full text-xs bg-[var(--color-background)] border border-[var(--color-border)] rounded-xl p-2.5 text-[var(--color-foreground)] focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              {cameras.length === 0 ? (
                <option value="">No cameras detected</option>
              ) : (
                cameras.map(c => (
                  <option key={c.deviceId} value={c.deviceId}>
                    {c.label}
                  </option>
                ))
              )}
            </select>
          </div>
        )}

        {/* Microphone Selector */}
        <div>
          <label className="text-xs font-medium text-[var(--color-foreground)] flex items-center gap-1.5 mb-1.5">
            <Mic className="w-3.5 h-3.5 text-emerald-500" />
            Microphone
          </label>
          <select
            value={selectedMicrophoneId}
            onChange={(e) => onSelectMicrophone(e.target.value)}
            className="w-full text-xs bg-[var(--color-background)] border border-[var(--color-border)] rounded-xl p-2.5 text-[var(--color-foreground)] focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            {microphones.length === 0 ? (
              <option value="">No microphones detected</option>
            ) : (
              microphones.map(m => (
                <option key={m.deviceId} value={m.deviceId}>
                  {m.label}
                </option>
              ))
            )}
          </select>
        </div>

        {/* Speaker Selector */}
        {speakers.length > 0 && (
          <div>
            <label className="text-xs font-medium text-[var(--color-foreground)] flex items-center gap-1.5 mb-1.5">
              <Volume2 className="w-3.5 h-3.5 text-amber-500" />
              Audio Output (Speaker)
            </label>
            <select
              value={selectedSpeakerId}
              onChange={(e) => onSelectSpeaker(e.target.value)}
              className="w-full text-xs bg-[var(--color-background)] border border-[var(--color-border)] rounded-xl p-2.5 text-[var(--color-foreground)] focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              {speakers.map(s => (
                <option key={s.deviceId} value={s.deviceId}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="flex justify-end pt-3">
          <Button variant="primary" size="sm" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </Modal>
  );
}
