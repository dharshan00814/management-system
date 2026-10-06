// ============================================================
// Hyna Studio Management - In-Meeting Participants Panel
// Active Peer List, Role Indicators, Media Status & Host Controls
// ============================================================

import React, { useState } from 'react';
import { 
  X, Search, Mic, MicOff, Video, VideoOff, Crown, 
  UserMinus, VolumeX, Shield, ToggleLeft, ToggleRight, AlertCircle 
} from 'lucide-react';
import { Avatar, Button } from '@/components/ui';
import type { ParticipantState } from '@/types/meeting';

export interface ParticipantPanelProps {
  localParticipant: ParticipantState;
  participants: Map<string, ParticipantState>;
  isHost?: boolean;
  allowScreenShare?: boolean;
  onMuteParticipant?: (socketId: string, memberId: string) => void;
  onRemoveParticipant?: (socketId: string, memberId: string) => void;
  onMuteAll?: () => void;
  onToggleScreenSharePermission?: (allowed: boolean) => void;
  onClose: () => void;
}

export function ParticipantPanel({
  localParticipant,
  participants,
  isHost = false,
  allowScreenShare = true,
  onMuteParticipant,
  onRemoveParticipant,
  onMuteAll,
  onToggleScreenSharePermission,
  onClose,
}: ParticipantPanelProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [participantToRemove, setParticipantToRemove] = useState<{ socketId: string; memberId: string; name: string } | null>(null);

  const allList: { participant: ParticipantState; isLocal: boolean; key: string }[] = [
    { participant: localParticipant, isLocal: true, key: localParticipant.memberId },
  ];

  participants.forEach((p, key) => {
    allList.push({ participant: p, isLocal: false, key });
  });

  const filtered = allList.filter(item =>
    item.participant.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (item.participant.designation || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="w-80 h-full bg-[#141419] border-l border-white/10 flex flex-col z-20 shadow-2xl">
      {/* Panel Header */}
      <div className="p-4 border-b border-white/10 flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-sm text-white">Participants</h3>
          <p className="text-[11px] text-white/50">{allList.length} in this meeting</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Host Action Banner */}
      {isHost && (
        <div className="p-3 bg-white/5 border-b border-white/10 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-white/80 flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-indigo-400" /> Host Controls
            </span>
            {onMuteAll && participants.size > 0 && (
              <button
                type="button"
                onClick={onMuteAll}
                className="px-2 py-1 rounded-md text-[11px] font-medium bg-red-500/15 hover:bg-red-500/25 text-red-300 border border-red-500/30 transition-all flex items-center gap-1"
                title="Mute all other participants"
              >
                <VolumeX className="w-3 h-3" /> Mute All
              </button>
            )}
          </div>

          {/* Screen Share Permission Toggle */}
          {onToggleScreenSharePermission && (
            <div className="flex items-center justify-between pt-1">
              <span className="text-[11px] text-white/60">Allow screen sharing</span>
              <button
                type="button"
                onClick={() => onToggleScreenSharePermission(!allowScreenShare)}
                className="text-white hover:text-indigo-400 transition-colors"
                title={allowScreenShare ? 'Disable screen share for participants' : 'Enable screen share'}
              >
                {allowScreenShare ? (
                  <ToggleRight className="w-5 h-5 text-indigo-400" />
                ) : (
                  <ToggleLeft className="w-5 h-5 text-white/40" />
                )}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Search Input */}
      <div className="p-3 border-b border-white/10">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-white/40 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search participants..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-white/40 focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      {/* Participants List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {filtered.map(({ participant, isLocal, key }) => {
          const targetSocketId = participant.socketId || key;
          const targetMemberId = participant.memberId;

          return (
            <div
              key={`${targetMemberId}-${targetSocketId}`}
              className="flex items-center justify-between p-2.5 rounded-xl hover:bg-white/5 transition-colors group"
            >
              <div className="flex items-center gap-3 min-w-0 mr-2">
                <div className="relative">
                  <Avatar
                    name={participant.name}
                    src={participant.avatar}
                    className="w-8 h-8 text-xs font-semibold border border-white/10"
                  />
                  {participant.isSpeaking && (
                    <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border border-[#141419]" />
                  )}
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium text-white truncate">
                      {isLocal ? `${participant.name} (You)` : participant.name}
                    </span>
                    {participant.isHost && (
                      <span title="Meeting Host" className="inline-flex items-center">
                        <Crown className="w-3 h-3 text-amber-400 shrink-0" />
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-white/40 truncate block">
                    {participant.designation || participant.role}
                  </span>
                </div>
              </div>

              {/* Media status indicators + Host action buttons */}
              <div className="flex items-center gap-1.5 shrink-0">
                {/* Host mute button on remote participant */}
                {isHost && !isLocal && participant.micEnabled && onMuteParticipant && (
                  <button
                    type="button"
                    onClick={() => onMuteParticipant(targetSocketId, targetMemberId)}
                    className="p-1 rounded-md text-white/50 hover:text-red-400 hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100"
                    title={`Mute ${participant.name}`}
                  >
                    <MicOff className="w-3.5 h-3.5" />
                  </button>
                )}

                {/* Host remove button on remote participant */}
                {isHost && !isLocal && onRemoveParticipant && (
                  <button
                    type="button"
                    onClick={() => setParticipantToRemove({ socketId: targetSocketId, memberId: targetMemberId, name: participant.name })}
                    className="p-1 rounded-md text-white/50 hover:text-red-400 hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100"
                    title={`Remove ${participant.name} from meeting`}
                  >
                    <UserMinus className="w-3.5 h-3.5" />
                  </button>
                )}

                <span
                  className={`p-1 rounded-md ${
                    participant.micEnabled
                      ? 'text-white/70'
                      : 'text-red-400 bg-red-500/10'
                  }`}
                  title={participant.micEnabled ? 'Microphone active' : 'Microphone muted'}
                >
                  {participant.micEnabled ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}
                </span>

                <span
                  className={`p-1 rounded-md ${
                    participant.videoEnabled
                      ? 'text-white/70'
                      : 'text-white/30'
                  }`}
                  title={participant.videoEnabled ? 'Camera on' : 'Camera off'}
                >
                  {participant.videoEnabled ? <Video className="w-3.5 h-3.5" /> : <VideoOff className="w-3.5 h-3.5" />}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Confirmation Modal to Remove Participant */}
      {participantToRemove && (
        <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-30 animate-in fade-in">
          <div className="w-full max-w-xs bg-[#18181f] border border-white/15 rounded-2xl p-4 text-center space-y-3 shadow-2xl">
            <div className="w-10 h-10 rounded-full bg-red-500/15 text-red-400 mx-auto flex items-center justify-center">
              <AlertCircle className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-white">Remove Participant?</h4>
              <p className="text-xs text-white/60 mt-1">
                Remove <span className="font-semibold text-white">{participantToRemove.name}</span> from this meeting?
              </p>
            </div>
            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 text-xs"
                onClick={() => setParticipantToRemove(null)}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                className="flex-1 text-xs"
                onClick={() => {
                  if (onRemoveParticipant) {
                    onRemoveParticipant(participantToRemove.socketId, participantToRemove.memberId);
                  }
                  setParticipantToRemove(null);
                }}
              >
                Remove
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
