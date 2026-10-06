// ============================================================
// Hyna Studio Management - Meeting Controls Toolbar
// Floating Glassmorphism Toolbar with Real-Time Media Toggles
// ============================================================

import React, { useState } from 'react';
import { 
  Mic, MicOff, Video, VideoOff, MonitorUp, 
  MessageSquare, Users, Settings, PhoneOff, AlertTriangle, Link2
} from 'lucide-react';
import { Modal, Button } from '@/components/ui';

export interface MeetingControlsProps {
  micEnabled: boolean;
  videoEnabled: boolean;
  isScreenSharing: boolean;
  isAudioOnly: boolean;
  isHost: boolean;
  unreadChatCount: number;
  participantCount: number;
  activePanel: 'chat' | 'participants' | null;
  onToggleMic: () => void;
  onToggleVideo: () => void;
  onToggleScreenShare: () => void;
  onTogglePanel: (panel: 'chat' | 'participants') => void;
  onOpenSettings: () => void;
  onCopyLink?: () => void;
  onLeaveMeeting: () => void;
  onEndMeetingForEveryone?: () => void;
}

export function MeetingControls({
  micEnabled,
  videoEnabled,
  isScreenSharing,
  isAudioOnly,
  isHost,
  unreadChatCount,
  participantCount,
  activePanel,
  onToggleMic,
  onToggleVideo,
  onToggleScreenShare,
  onTogglePanel,
  onOpenSettings,
  onCopyLink,
  onLeaveMeeting,
  onEndMeetingForEveryone,
}: MeetingControlsProps) {
  const [showEndMeetingConfirm, setShowEndMeetingConfirm] = useState<boolean>(false);

  return (
    <>
      <div className="relative z-20 flex items-center justify-center p-3 md:p-4 bg-gradient-to-t from-black/95 via-black/80 to-transparent">
        <div className="flex items-center gap-2 md:gap-3 bg-[#18181f]/90 backdrop-blur-xl px-4 py-2.5 rounded-2xl border border-white/10 shadow-2xl">
          {/* 1. Microphone Toggle */}
          <button
            type="button"
            onClick={onToggleMic}
            className={`p-3 rounded-xl transition-all flex items-center justify-center ${
              micEnabled
                ? 'bg-white/10 text-white hover:bg-white/20'
                : 'bg-red-500/90 text-white hover:bg-red-600 shadow-lg shadow-red-500/20'
            }`}
            title={micEnabled ? 'Mute Microphone (Ctrl+D)' : 'Unmute Microphone (Ctrl+D)'}
          >
            {micEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
          </button>

          {/* 2. Camera Toggle (Disabled if audio meeting) */}
          {!isAudioOnly && (
            <button
              type="button"
              onClick={onToggleVideo}
              className={`p-3 rounded-xl transition-all flex items-center justify-center ${
                videoEnabled
                  ? 'bg-white/10 text-white hover:bg-white/20'
                  : 'bg-red-500/90 text-white hover:bg-red-600 shadow-lg shadow-red-500/20'
              }`}
              title={videoEnabled ? 'Turn Off Camera (Ctrl+E)' : 'Turn On Camera (Ctrl+E)'}
            >
              {videoEnabled ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
            </button>
          )}

          {/* 3. Screen Sharing */}
          <button
            type="button"
            onClick={onToggleScreenShare}
            className={`p-3 rounded-xl transition-all flex items-center justify-center ${
              isScreenSharing
                ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg shadow-indigo-500/25'
                : 'bg-white/10 text-white hover:bg-white/20'
            }`}
            title={isScreenSharing ? 'Stop Screen Sharing' : 'Share Screen'}
          >
            <MonitorUp className="w-5 h-5" />
          </button>

          <div className="h-6 w-px bg-white/10 mx-1" />

          {/* 4. Chat Drawer Toggle */}
          <button
            type="button"
            onClick={() => onTogglePanel('chat')}
            className={`relative p-3 rounded-xl transition-all flex items-center justify-center ${
              activePanel === 'chat'
                ? 'bg-white text-black'
                : 'bg-white/10 text-white hover:bg-white/20'
            }`}
            title="Meeting Chat"
          >
            <MessageSquare className="w-5 h-5" />
            {unreadChatCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-indigo-500 text-[10px] font-bold text-white shadow-sm">
                {unreadChatCount}
              </span>
            )}
          </button>

          {/* 5. Participants Drawer Toggle */}
          <button
            type="button"
            onClick={() => onTogglePanel('participants')}
            className={`relative p-3 rounded-xl transition-all flex items-center justify-center ${
              activePanel === 'participants'
                ? 'bg-white text-black'
                : 'bg-white/10 text-white hover:bg-white/20'
            }`}
            title="Participants List"
          >
            <Users className="w-5 h-5" />
            <span className="absolute -top-1 -right-1 flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-white/20 text-[10px] font-bold text-white border border-white/20">
              {participantCount}
            </span>
          </button>

          {/* 6. Settings Modal Toggle */}
          <button
            type="button"
            onClick={onOpenSettings}
            className="p-3 rounded-xl bg-white/10 text-white hover:bg-white/20 transition-all flex items-center justify-center"
            title="Audio & Video Settings"
          >
            <Settings className="w-5 h-5" />
          </button>

          {/* 7. Copy Invite Link */}
          {onCopyLink && (
            <button
              type="button"
              onClick={onCopyLink}
              className="p-3 rounded-xl bg-white/10 text-white hover:bg-white/20 transition-all flex items-center justify-center"
              title="Copy Meeting Invite Link"
            >
              <Link2 className="w-5 h-5" />
            </button>
          )}

          <div className="h-6 w-px bg-white/10 mx-1" />

          {/* 7. Leave Meeting Button */}
          <button
            type="button"
            onClick={onLeaveMeeting}
            className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-medium text-xs transition-all flex items-center gap-1.5"
            title="Leave Meeting"
          >
            <PhoneOff className="w-4 h-4 text-red-400" />
            <span>Leave</span>
          </button>

          {/* 8. End Meeting for Everyone (Host Only) */}
          {isHost && onEndMeetingForEveryone && (
            <button
              type="button"
              onClick={() => setShowEndMeetingConfirm(true)}
              className="px-4 py-2.5 rounded-xl bg-red-600/90 hover:bg-red-700 text-white font-medium text-xs transition-all flex items-center gap-1.5 shadow-lg shadow-red-600/20"
              title="End Meeting for Everyone"
            >
              <span>End for All</span>
            </button>
          )}
        </div>
      </div>

      {/* Confirmation Modal to End Meeting for Everyone */}
      <Modal
        open={showEndMeetingConfirm}
        onClose={() => setShowEndMeetingConfirm(false)}
        title="End Meeting for Everyone?"
      >
        <div className="space-y-4 pt-1">
          <div className="flex items-start gap-3 p-3 bg-red-500/10 rounded-xl border border-red-500/20 text-red-200">
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <p className="text-xs leading-relaxed">
              This will complete the meeting session, close peer connections, finalize all attendance records, and redirect all participants to the meeting summary.
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowEndMeetingConfirm(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                setShowEndMeetingConfirm(false);
                onEndMeetingForEveryone?.();
              }}
            >
              Yes, End Meeting
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
