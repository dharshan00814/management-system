// ============================================================
// Hyna Studio Management - Video Grid Component
// Responsive Grid with Dominant Screen Share / Pin View
// ============================================================

import React from 'react';
import { ParticipantTile } from './ParticipantTile';
import type { ParticipantState } from '@/types/meeting';

export interface VideoGridProps {
  localParticipant: ParticipantState;
  localStream: MediaStream | null;
  participants: Map<string, ParticipantState>;
  remoteStreams: Map<string, MediaStream>;
  pinnedParticipantId: string | null;
  onTogglePin: (memberId: string) => void;
}

export function VideoGrid({
  localParticipant,
  localStream,
  participants,
  remoteStreams,
  pinnedParticipantId,
  onTogglePin,
}: VideoGridProps) {
  // Combine local participant and remote participants into a unified array
  const allParticipants: { participant: ParticipantState; stream: MediaStream | null; isLocal: boolean }[] = [
    { participant: localParticipant, stream: localStream, isLocal: true },
  ];

  participants.forEach((p, peerId) => {
    allParticipants.push({
      participant: p,
      stream: remoteStreams.get(peerId) || remoteStreams.get(p.memberId) || null,
      isLocal: false,
    });
  });

  const totalCount = allParticipants.length;

  // Determine if a participant is pinned or screen sharing
  const pinnedItem = pinnedParticipantId
    ? allParticipants.find(item => item.participant.memberId === pinnedParticipantId)
    : allParticipants.find(item => item.participant.isScreenSharing);

  // If there is a pinned or screen sharing participant, show dominant layout
  if (pinnedItem) {
    const otherParticipants = allParticipants.filter(
      item => item.participant.memberId !== pinnedItem.participant.memberId
    );

    return (
      <div className="w-full h-full flex flex-col lg:flex-row gap-4 p-3 md:p-4 overflow-hidden">
        {/* Dominant Screen */}
        <div className="flex-1 h-full min-h-[300px]">
          <ParticipantTile
            participant={pinnedItem.participant}
            stream={pinnedItem.stream}
            isLocal={pinnedItem.isLocal}
            isPinned={true}
            onTogglePin={onTogglePin}
          />
        </div>

        {/* Filmstrip of other participants */}
        {otherParticipants.length > 0 && (
          <div className="flex lg:flex-col gap-3 overflow-x-auto lg:overflow-y-auto w-full lg:w-72 lg:max-h-full shrink-0 py-1">
            {otherParticipants.map((item, index) => (
              <div key={`${item.participant.memberId}-${index}`} className="w-48 lg:w-full aspect-video shrink-0">
                <ParticipantTile
                  participant={item.participant}
                  stream={item.stream}
                  isLocal={item.isLocal}
                  isPinned={false}
                  onTogglePin={onTogglePin}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Dynamic grid configuration based on participant count
  let gridLayoutClass = 'grid-cols-1';
  if (totalCount === 2) {
    gridLayoutClass = 'grid-cols-1 md:grid-cols-2';
  } else if (totalCount >= 3 && totalCount <= 4) {
    gridLayoutClass = 'grid-cols-1 sm:grid-cols-2';
  } else if (totalCount >= 5 && totalCount <= 6) {
    gridLayoutClass = 'grid-cols-2 lg:grid-cols-3';
  } else if (totalCount >= 7 && totalCount <= 9) {
    gridLayoutClass = 'grid-cols-2 md:grid-cols-3';
  } else if (totalCount > 9) {
    gridLayoutClass = 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4';
  }

  return (
    <div className="w-full h-full p-3 md:p-6 flex items-center justify-center overflow-y-auto">
      <div className={`grid ${gridLayoutClass} gap-3 md:gap-4 w-full h-full max-w-7xl max-h-[85vh]`}>
        {allParticipants.map((item, index) => (
          <div key={`${item.participant.memberId}-${index}`} className="w-full h-full min-h-[160px]">
            <ParticipantTile
              participant={item.participant}
              stream={item.stream}
              isLocal={item.isLocal}
              isPinned={false}
              onTogglePin={onTogglePin}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
