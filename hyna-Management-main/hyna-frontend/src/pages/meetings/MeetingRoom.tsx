// ============================================================
// Hyna Studio Management - Production WebRTC Group Meeting Room
// Pure WebRTC + Supabase Realtime Signaling + Automatic Attendance
// ============================================================

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader2, ShieldAlert, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores';
import { fetchMeetingByIdOrRoomId } from '@/services/meetingService';
import { useMediaDevices } from '@/hooks/useMediaDevices';
import { useWebRTCMeeting } from '@/hooks/useWebRTCMeeting';
import { useMeetingAttendance } from '@/hooks/useMeetingAttendance';
import { useMeetingChat } from '@/hooks/useMeetingChat';
import { PreJoinScreen } from '@/components/meetings/PreJoinScreen';
import { VideoGrid } from '@/components/meetings/VideoGrid';
import { MeetingControls } from '@/components/meetings/MeetingControls';
import { ParticipantPanel } from '@/components/meetings/ParticipantPanel';
import { MeetingChat } from '@/components/meetings/MeetingChat';
import { DeviceSettingsModal } from '@/components/meetings/DeviceSettingsModal';
import { MeetingSummary } from '@/components/meetings/MeetingSummary';
import { Button } from '@/components/ui';
import type { Meeting } from '@/types/meeting';
import type { User } from '@/types';

export function MeetingRoom() {
  const { id: routeIdentifier } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentUser, effectiveRole } = useAuthStore();
  const rolePrefix = effectiveRole === 'admin' ? '/admin' : effectiveRole === 'manager' ? '/manager' : '/member';

  // Meeting Metadata
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [isLoadingMeeting, setIsLoadingMeeting] = useState<boolean>(true);
  const [accessDenied, setAccessDenied] = useState<boolean>(false);

  // Meeting Lifecycle Stage: 'prejoin' | 'in-meeting' | 'summary'
  const [meetingStage, setMeetingStage] = useState<'prejoin' | 'in-meeting' | 'summary'>('prejoin');

  // Side Drawer: 'chat' | 'participants' | null
  const [activeSidePanel, setActiveSidePanel] = useState<'chat' | 'participants' | null>(null);
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);

  // 1. Fetch meeting info
  useEffect(() => {
    let isMounted = true;
    async function load() {
      if (!routeIdentifier) return;
      setIsLoadingMeeting(true);
      try {
        const found = await fetchMeetingByIdOrRoomId(routeIdentifier);
        if (isMounted) {
          if (found) {
            setMeeting(found);
          } else {
            // Direct link joinable: fallback ad-hoc meeting object
            const adHocMeeting: Meeting = {
              id: routeIdentifier,
              title: 'Hyna Video Meeting',
              description: 'Direct Room Meeting',
              date: new Date().toISOString().split('T')[0],
              startTime: '00:00',
              endTime: '23:59',
              hostId: currentUser?.id || 'host',
              participantIds: [],
              type: 'team',
              meetingType: 'video',
              meetingRoomId: routeIdentifier,
              isRecurring: false,
              meetingLink: `/meeting/${routeIdentifier}`,
              status: 'live',
            };
            setMeeting(adHocMeeting);
          }
        }
      } catch (err) {
        console.error('[MeetingRoom] Error loading meeting:', err);
      } finally {
        if (isMounted) setIsLoadingMeeting(false);
      }
    }
    load();
    return () => { isMounted = false; };
  }, [routeIdentifier, currentUser?.id, effectiveRole]);

  const isAudioOnly = meeting?.meetingType === 'audio';

  // Pre-join camera and mic toggle state
  const [prejoinVideoEnabled, setPrejoinVideoEnabled] = useState<boolean>(!isAudioOnly);
  const [prejoinAudioEnabled, setPrejoinAudioEnabled] = useState<boolean>(true);

  // Sync state if meeting type changes
  useEffect(() => {
    if (isAudioOnly) {
      setPrejoinVideoEnabled(false);
    }
  }, [isAudioOnly]);

  // 2. Hardware Media Devices Hook
  const {
    cameras,
    microphones,
    speakers,
    selectedCameraId,
    selectedMicrophoneId,
    selectedSpeakerId,
    localStream,
    permissionError,
    requestMedia,
    switchCamera,
    switchMicrophone,
    switchSpeaker,
    stopLocalStream,
  } = useMediaDevices(isAudioOnly);

  // Pre-acquire camera/mic preview for PreJoinScreen
  useEffect(() => {
    if (meetingStage === 'prejoin' && !permissionError) {
      requestMedia(!isAudioOnly && prejoinVideoEnabled, prejoinAudioEnabled).catch(() => {});
    }
  }, [meetingStage, isAudioOnly, permissionError, requestMedia, prejoinVideoEnabled, prejoinAudioEnabled]);

  // Ensure camera hardware stops immediately if user navigates away or leaves page
  useEffect(() => {
    return () => {
      stopLocalStream();
    };
  }, [stopLocalStream]);

  // Guest user handling for direct link joiners
  const [guestName, setGuestName] = useState<string>(() => {
    return sessionStorage.getItem('hyna_meeting_guest_name') || '';
  });

  const handleGuestNameChange = (name: string) => {
    setGuestName(name);
    sessionStorage.setItem('hyna_meeting_guest_name', name);
  };

  const effectiveUser = useMemo(() => {
    if (currentUser) return currentUser;
    const name = guestName.trim() || 'Guest Member';
    return {
      id: `guest_${name.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
      name,
      email: 'guest@hyna.io',
      avatar: '',
      role: 'member' as const,
      designation: 'Guest Participant',
      department: 'Guest',
      phone: '',
      joinDate: new Date().toISOString(),
      status: 'active' as const,
    } as User;
  }, [currentUser, guestName]);

  const isHost = useMemo(() => {
    if (!meeting) return false;
    if (currentUser) {
      return (
        meeting.hostId === currentUser.id ||
        meeting.createdBy === currentUser.id ||
        effectiveRole === 'admin'
      );
    }
    return false;
  }, [meeting, currentUser, effectiveRole]);

  // 3. WebRTC Meeting Core Hook
  const {
    localStream: meetingLocalStream,
    localParticipantState,
    participants,
    remoteStreams,
    micEnabled,
    videoEnabled,
    isScreenSharing,
    overallConnectionState,
    pinnedParticipantId,
    startMeetingSession,
    toggleMute,
    toggleCamera,
    toggleScreenShare,
    setPinnedParticipantId,
    leaveMeeting,
    endMeetingForEveryone,
  } = useWebRTCMeeting({
    meeting,
    currentUser: effectiveUser,
    isHost,
    initialMicEnabled: prejoinAudioEnabled,
    initialVideoEnabled: !isAudioOnly && prejoinVideoEnabled,
    selectedCameraId,
    selectedMicrophoneId,
    onMeetingEndedByHost: () => {
      toast.info('The host has ended this meeting.');
      setMeetingStage('summary');
    },
  });

  // 4. Automatic Attendance Hook (Only activates in 'in-meeting' stage)
  const { finalizeAttendance } = useMeetingAttendance(
    meeting?.id,
    effectiveUser?.id,
    meetingStage === 'in-meeting' && overallConnectionState === 'connected'
  );

  // 5. In-Meeting Chat Hook
  const {
    messages: chatMessages,
    unreadCount: unreadChatCount,
    setChatOpen,
    sendMessage: sendChatMessage,
  } = useMeetingChat(meeting?.id, effectiveUser);

  // Handle panel toggling
  const handleTogglePanel = (panel: 'chat' | 'participants') => {
    setActiveSidePanel(prev => {
      const next = prev === panel ? null : panel;
      setChatOpen(next === 'chat');
      return next;
    });
  };

  // Join Action from Pre-Join Screen
  const handleJoin = async () => {
    try {
      setMeetingStage('in-meeting');
      await startMeetingSession(prejoinVideoEnabled, prejoinAudioEnabled, localStream);
      toast.success('Joined meeting session');
    } catch (err) {
      console.error('[MeetingRoom] handleJoin error:', err);
      toast.error('Failed to enter meeting room.');
    }
  };

  // Leave Meeting (User leaves on their own)
  const handleLeave = async () => {
    await finalizeAttendance();
    await leaveMeeting();
    stopLocalStream();
    setMeetingStage('summary');
  };

  // Host Ends Meeting for Everyone
  const handleEndForEveryone = async () => {
    await finalizeAttendance();
    await endMeetingForEveryone();
    stopLocalStream();
    setMeetingStage('summary');
  };

  // Loading State
  if (isLoadingMeeting) {
    return (
      <div className="min-h-screen w-full bg-[#0a0a0c] text-white flex flex-col items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-white animate-spin" />
          <p className="text-xs text-white/50">Connecting to Hyna Meeting...</p>
        </div>
      </div>
    );
  }

  // Access Denied State
  if (accessDenied) {
    return (
      <div className="min-h-screen w-full bg-[#0a0a0c] text-white flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full bg-[#131317] border border-white/10 rounded-2xl p-6 text-center space-y-4 shadow-2xl">
          <div className="w-12 h-12 rounded-full bg-red-500/10 text-red-400 mx-auto flex items-center justify-center">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Access Restricted</h2>
            <p className="text-xs text-white/60 mt-1">
              You are not an invited participant of this private meeting. Please contact the meeting organizer for an invitation.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`${rolePrefix}/meetings`)}
            className="w-full text-xs"
          >
            <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
            Back to Meetings
          </Button>
        </div>
      </div>
    );
  }

  // Meeting Not Found State
  if (!meeting) {
    return (
      <div className="min-h-screen w-full bg-[#0a0a0c] text-white flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full bg-[#131317] border border-white/10 rounded-2xl p-6 text-center space-y-4 shadow-2xl">
          <h2 className="text-lg font-bold text-white">Meeting Not Found</h2>
          <p className="text-xs text-white/60">
            The meeting room you are looking for does not exist or may have expired.
          </p>
          <Button
            variant="primary"
            size="sm"
            onClick={() => navigate(`${rolePrefix}/meetings`)}
            className="w-full text-xs bg-white text-black hover:bg-white/90"
          >
            Back to Meetings
          </Button>
        </div>
      </div>
    );
  }

  // STAGE 1: PRE-JOIN SCREEN
  if (meetingStage === 'prejoin') {
    return (
      <PreJoinScreen
        meeting={meeting}
        currentUser={currentUser}
        guestName={guestName}
        onGuestNameChange={handleGuestNameChange}
        cameras={cameras}
        microphones={microphones}
        speakers={speakers}
        selectedCameraId={selectedCameraId}
        selectedMicrophoneId={selectedMicrophoneId}
        selectedSpeakerId={selectedSpeakerId}
        localStream={localStream}
        permissionError={permissionError}
        isAudioOnly={isAudioOnly}
        videoEnabled={prejoinVideoEnabled}
        audioEnabled={prejoinAudioEnabled}
        onSelectCamera={switchCamera}
        onSelectMicrophone={switchMicrophone}
        onSelectSpeaker={switchSpeaker}
        onToggleVideo={() => {
          setPrejoinVideoEnabled(prev => {
            const next = !prev;
            if (next) {
              requestMedia(!isAudioOnly, prejoinAudioEnabled).catch(() => {});
            } else {
              // Physically turn off laptop camera hardware track in prejoin
              if (localStream) {
                localStream.getVideoTracks().forEach(t => t.stop());
              }
            }
            return next;
          });
        }}
        onToggleAudio={() => {
          setPrejoinAudioEnabled(prev => {
            const next = !prev;
            if (localStream) {
              localStream.getAudioTracks().forEach(t => {
                t.enabled = next;
              });
            }
            return next;
          });
        }}
        onJoinMeeting={handleJoin}
        onCancel={() => {
          stopLocalStream();
          navigate(`${rolePrefix}/meetings`);
        }}
      />
    );
  }

  // STAGE 3: POST-MEETING SUMMARY
  if (meetingStage === 'summary') {
    return (
      <MeetingSummary
        meeting={meeting}
        onBackToMeetings={() => navigate(`${rolePrefix}/meetings`)}
      />
    );
  }

  const handleCopyInviteLink = () => {
    const roomId = meeting?.meetingRoomId || routeIdentifier || '';
    const fullUrl = `${window.location.origin}/meeting/${roomId}`;
    navigator.clipboard.writeText(fullUrl);
    toast.success('Meeting invite link copied! Share this with your friend.');
  };

  // STAGE 2: IN-MEETING ROOM (FULL SCREEN)
  return (
    <div className="relative w-screen h-screen bg-[#08080a] text-white flex flex-col overflow-hidden select-none">
      {/* Top Meeting Header */}
      <header className="h-14 border-b border-white/10 px-4 flex items-center justify-between z-20 bg-[#0d0d11]/80 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-semibold text-xs md:text-sm tracking-wide truncate max-w-[200px] md:max-w-md">
              {meeting.title}
            </span>
          </div>

          <span className="hidden sm:inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium bg-white/10 text-white/70 border border-white/10 capitalize">
            {meeting.meetingType} Call
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* Connection State Badge — driven by actual WebRTC/signaling state only */}
          {overallConnectionState === 'connected' && (
            <span className="hidden sm:flex px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/15 text-emerald-300 border border-emerald-500/25 items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Live
            </span>
          )}

          {overallConnectionState === 'connecting' && (
            <span className="hidden sm:flex px-2.5 py-1 rounded-full text-xs font-medium bg-white/10 text-white/50 border border-white/10 items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-white/40 animate-pulse" />
              Connecting...
            </span>
          )}

          {overallConnectionState === 'reconnecting' && (
            <span className="flex px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/20 text-amber-300 border border-amber-500/30 items-center gap-1.5 animate-pulse">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              Reconnecting...
            </span>
          )}

          {overallConnectionState === 'disconnected' && (
            <span className="flex px-2.5 py-1 rounded-full text-xs font-medium bg-red-500/20 text-red-300 border border-red-500/30 items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
              Disconnected
            </span>
          )}

          <button
            type="button"
            onClick={handleCopyInviteLink}
            className="px-2.5 py-1 rounded-lg text-xs font-medium bg-white/10 hover:bg-white/20 text-white/90 border border-white/10 transition-all flex items-center gap-1.5"
            title="Copy Meeting Invite Link"
          >
            <span className="font-mono text-[11px] text-white/60">Room: {meeting.meetingRoomId}</span>
            <span className="text-[10px] text-indigo-400 font-semibold uppercase tracking-wider ml-1">Copy Link</span>
          </button>
        </div>
      </header>

      {/* Main Body: Video Grid + Optional Drawer */}
      <div className="flex-1 flex overflow-hidden relative">
        <div className="flex-1 h-full overflow-hidden">
          <VideoGrid
            localParticipant={localParticipantState}
            localStream={meetingLocalStream}
            participants={participants}
            remoteStreams={remoteStreams}
            pinnedParticipantId={pinnedParticipantId}
            onTogglePin={(memberId) => {
              setPinnedParticipantId(prev => prev === memberId ? null : memberId);
            }}
          />
        </div>

        {/* Side Panel: Chat */}
        {activeSidePanel === 'chat' && (
          <MeetingChat
            messages={chatMessages}
            currentUserId={currentUser?.id || ''}
            onSendMessage={sendChatMessage}
            onClose={() => handleTogglePanel('chat')}
          />
        )}

        {/* Side Panel: Participants */}
        {activeSidePanel === 'participants' && (
          <ParticipantPanel
            localParticipant={localParticipantState}
            participants={participants}
            onClose={() => handleTogglePanel('participants')}
          />
        )}
      </div>

      {/* Floating Bottom Toolbar */}
      <MeetingControls
        micEnabled={micEnabled}
        videoEnabled={videoEnabled}
        isScreenSharing={isScreenSharing}
        isAudioOnly={isAudioOnly}
        isHost={isHost}
        unreadChatCount={unreadChatCount}
        participantCount={participants.size + 1}
        activePanel={activeSidePanel}
        onToggleMic={toggleMute}
        onToggleVideo={toggleCamera}
        onToggleScreenShare={toggleScreenShare}
        onTogglePanel={handleTogglePanel}
        onOpenSettings={() => setShowSettingsModal(true)}
        onCopyLink={handleCopyInviteLink}
        onLeaveMeeting={handleLeave}
        onEndMeetingForEveryone={isHost ? handleEndForEveryone : undefined}
      />

      {/* Live Device Settings Modal */}
      <DeviceSettingsModal
        open={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        cameras={cameras}
        microphones={microphones}
        speakers={speakers}
        selectedCameraId={selectedCameraId}
        selectedMicrophoneId={selectedMicrophoneId}
        selectedSpeakerId={selectedSpeakerId}
        isAudioOnly={isAudioOnly}
        onSelectCamera={switchCamera}
        onSelectMicrophone={switchMicrophone}
        onSelectSpeaker={switchSpeaker}
      />
    </div>
  );
}
