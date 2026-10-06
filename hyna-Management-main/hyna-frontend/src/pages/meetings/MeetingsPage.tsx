import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Plus, Clock, Video, Mic, Volume2, Users, Check, Copy, ExternalLink, Link2, Radio, Trash2 
} from 'lucide-react';
import { Button, Avatar, Badge, Modal, Input, Textarea, Select, EmptyState, LoadingState } from '@/components/ui';
import { cn, formatDate, formatTime } from '@/lib/utils';
import { useAuthStore } from '@/stores';
import { getMeetings, getUsers, getUserById, createNotification, deleteMeeting } from '@/services/api';
import { createNewMeeting } from '@/services/meetingService';
import { toast } from 'sonner';
import type { Meeting, MeetingType, MeetingMediaType, User } from '@/types';

const generateTimeOptions = () => {
  const options = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 30) {
      const hh = h.toString().padStart(2, '0');
      const mm = m.toString().padStart(2, '0');
      const value = `${hh}:${mm}`;
      const isPM = h >= 12;
      const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h;
      const label = `${displayH}:${mm} ${isPM ? 'PM' : 'AM'}`;
      options.push({ value, label });
    }
  }
  return options;
};

const TIME_OPTIONS = generateTimeOptions();

export function MeetingsPage() {
  const navigate = useNavigate();
  const { currentRole, currentUser, effectiveRole } = useAuthStore();
  const prefix = effectiveRole === 'member' ? '/member' : effectiveRole === 'manager' ? '/manager' : '/admin';
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [filter, setFilter] = useState<'upcoming' | 'live' | 'past' | 'all'>('upcoming');

  const [createdLink, setCreatedLink] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);
  const [showLinkOption, setShowLinkOption] = useState(false);

  const [newMeeting, setNewMeeting] = useState({
    title: '',
    description: '',
    date: new Date().toISOString().split('T')[0],
    type: 'team' as MeetingType,
    meetingType: 'video' as MeetingMediaType,
    startTime: '10:00',
    endTime: '11:00',
    participantIds: [] as string[],
    meetingLink: '',
  });

  const loadData = async () => {
    try {
      const usersList = await getUsers();
      setAllUsers(usersList);
      const ms = await getMeetings();
      setMeetings(ms);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleDeleteMeeting = async (e: React.MouseEvent, meetingId: string) => {
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to permanently delete this meeting?')) return;
    try {
      await deleteMeeting(meetingId);
      setMeetings(prev => prev.filter(m => m.id !== meetingId && m.meetingRoomId !== meetingId));
      toast.success('Meeting permanently deleted');
    } catch (err) {
      toast.error('Failed to delete meeting');
    }
  };

  const handleDeleteAllMeetings = async () => {
    if (meetings.length === 0) return;
    if (!window.confirm(`Are you sure you want to permanently delete all ${meetings.length} meetings? This cannot be undone.`)) return;
    try {
      for (const m of meetings) {
        await deleteMeeting(m.id);
      }
      setMeetings([]);
      toast.success('All meetings permanently deleted');
    } catch {
      toast.error('Failed to delete some meetings');
    }
  };

  const handleCopyMeetingLink = (e: React.MouseEvent, meeting: Meeting) => {
    e.stopPropagation();
    const rawLink = (meeting.meetingLink || '').trim();
    const roomId = meeting.meetingRoomId || rawLink.split('/').pop() || meeting.id;
    const fullUrl = rawLink.startsWith('http://') || rawLink.startsWith('https://')
      ? rawLink
      : `${window.location.origin}/meeting/${roomId}`;
    navigator.clipboard.writeText(fullUrl);
    toast.success('Meeting invite link copied!');
  };

  const handleCreateMeeting = async () => {
    if (!newMeeting.title.trim()) {
      toast.error('Please enter a meeting title');
      return;
    }
    try {
      const hostId = currentUser?.id || 'u1';
      const participants = Array.from(new Set([...newMeeting.participantIds, hostId]));

      const created = await createNewMeeting({
        title: newMeeting.title,
        description: newMeeting.description,
        date: newMeeting.date,
        startTime: newMeeting.startTime,
        endTime: newMeeting.endTime,
        type: newMeeting.type,
        meetingType: newMeeting.meetingType,
        participantIds: participants,
        hostId,
      });

      // If user specified an external meeting link (e.g. Google Meet)
      if (newMeeting.meetingLink?.trim()) {
        created.meetingLink = newMeeting.meetingLink.trim();
      }

      // Create notifications for invited members
      for (const pId of participants) {
        if (pId !== currentUser?.id) {
          await createNotification({
            userId: pId,
            title: `New ${created.meetingType === 'audio' ? 'Audio' : 'Video'} Meeting Invitation`,
            message: `You have been invited to "${created.title}" at ${created.startTime}`,
            actionUrl: `${prefix}/meetings`,
            type: 'meeting'
          }).catch(() => {});
        }
      }

      setMeetings(prev => [created, ...prev]);
      const shareUrl = created.meetingLink?.startsWith('http') 
        ? created.meetingLink 
        : `${window.location.origin}${created.meetingLink}`;

      setCreatedLink(shareUrl);
      setShowCreate(false);
      setShowSuccess(true);
      setShowLinkOption(false);
      setNewMeeting({
        title: '',
        description: '',
        date: new Date().toISOString().split('T')[0],
        type: 'team',
        meetingType: 'video',
        startTime: '10:00',
        endTime: '11:00',
        participantIds: [],
        meetingLink: '',
      });
      toast.success('Meeting created successfully!');
    } catch (err) {
      console.error('Failed to create meeting:', err);
      toast.error('Failed to create meeting');
    }
  };

  const todayStr = new Date().toISOString().split('T')[0];
  const userMeetings = currentRole === 'member'
    ? meetings.filter(m => 
        m.type === 'team' || 
        m.type === 'standup' ||
        m.hostId === currentUser?.id ||
        (currentUser?.employeeId && m.hostId === currentUser.employeeId) ||
        (m.participantIds || []).includes(currentUser?.id || '') ||
        (currentUser?.employeeId && (m.participantIds || []).includes(currentUser.employeeId))
      )
    : meetings;

  const liveCount = userMeetings.filter(m => m.status === 'live' || m.status === 'in-progress').length;
  const upcomingCount = userMeetings.filter(m => m.date >= todayStr && m.status !== 'completed' && m.status !== 'cancelled').length;
  const pastCount = userMeetings.filter(m => m.date < todayStr || m.status === 'completed').length;
  const allCount = userMeetings.length;

  const filtered = userMeetings.filter(m => {
    if (filter === 'live') return m.status === 'live' || m.status === 'in-progress';
    if (filter === 'upcoming') return m.date >= todayStr && m.status !== 'completed';
    if (filter === 'past') return m.date < todayStr || m.status === 'completed';
    return true;
  }).sort((a, b) => {
    // Put live meetings first
    if (a.status === 'live' && b.status !== 'live') return -1;
    if (b.status === 'live' && a.status !== 'live') return 1;
    return `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`);
  });

  if (isLoading) return <LoadingState />;

  return (
    <div className="page-container">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="page-title">Meetings</h1>
          <p className="page-description">
            {filtered.length} {filter} meeting{filtered.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 p-1 rounded-lg bg-[var(--color-muted)]">
            {[
              { id: 'upcoming', label: `Upcoming (${upcomingCount})` },
              ...(liveCount > 0 ? [{ id: 'live', label: `Live Now (${liveCount})` }] : []),
              { id: 'past', label: `Past (${pastCount})` },
              { id: 'all', label: `All (${allCount})` },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setFilter(tab.id as any)}
                className={cn(
                  'px-3 py-1.5 rounded-md text-xs font-medium capitalize transition-colors',
                  filter === tab.id 
                    ? 'bg-[var(--color-card)] text-[var(--color-foreground)] shadow-sm' 
                    : 'text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]'
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
          {currentRole !== 'member' && (
            <div className="flex items-center gap-2">
              {meetings.length > 0 && (
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={handleDeleteAllMeetings}
                  className="text-red-400 hover:text-red-500 hover:bg-red-500/10 border-red-500/30 text-xs"
                >
                  <Trash2 className="w-3.5 h-3.5 mr-1" /> Delete All
                </Button>
              )}
              <Button onClick={() => setShowCreate(true)}>
                <Plus className="w-4 h-4 mr-1" /> New Meeting
              </Button>
            </div>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="card p-12 text-center flex flex-col items-center justify-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
            <Video className="w-6 h-6" />
          </div>
          <h3 className="text-base font-semibold">No {filter} meetings</h3>
          <p className="text-xs text-[var(--color-muted-foreground)] max-w-sm">
            {filter === 'upcoming' && allCount > 0
              ? `No upcoming meetings scheduled. You have ${allCount} total meeting(s) in your history.`
              : 'No meetings found matching your current filter.'}
          </p>
          <div className="flex items-center gap-2 pt-2">
            {filter !== 'all' && allCount > 0 && (
              <Button variant="outline" size="sm" onClick={() => setFilter('all')}>
                View All ({allCount}) Meetings
              </Button>
            )}
            {currentRole !== 'member' && (
              <Button size="sm" onClick={() => setShowCreate(true)}>
                <Plus className="w-4 h-4 mr-1" /> Create Meeting
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((meeting, idx) => {
            const host = getUserById(meeting.hostId);
            const isToday = meeting.date === todayStr;
            const isLive = meeting.status === 'live' || meeting.status === 'in-progress';
            const isAudio = meeting.meetingType === 'audio';

            return (
              <div
                key={meeting.id}
                className={cn(
                  'card p-5 card-hover cursor-pointer animate-slide-up group border transition-all',
                  isLive && 'border-emerald-500/50 shadow-emerald-500/10 shadow-lg',
                  `stagger-${Math.min(idx + 1, 5)}`
                )}
                onClick={() => navigate(`${prefix}/meetings/${meeting.id}`)}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="mr-2">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                        {meeting.title}
                      </h3>
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-xs text-[var(--color-muted-foreground)] capitalize">
                        {meeting.type} meeting
                      </span>
                      <span className="text-[var(--color-muted-foreground)]">•</span>
                      <span className="text-[11px] text-indigo-600 dark:text-indigo-400 font-medium flex items-center gap-1">
                        {isAudio ? <Volume2 className="w-3 h-3" /> : <Video className="w-3 h-3" />}
                        {isAudio ? 'Audio Call' : 'Video Call'}
                      </span>
                    </div>
                  </div>

                  {isLive ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Live Now
                    </span>
                  ) : (
                    <Badge className={isToday ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400' : 'bg-[var(--color-muted)] text-[var(--color-foreground)]'}>
                      {isToday ? 'Today' : formatDate(meeting.date)}
                    </Badge>
                  )}
                </div>

                <div className="flex items-center gap-2 text-xs text-[var(--color-muted-foreground)] mb-3">
                  <Clock className="w-3.5 h-3.5 text-indigo-500" />
                  <span>{formatTime(meeting.startTime)} - {formatTime(meeting.endTime)}</span>
                </div>

                <div className="flex items-center gap-2 text-xs text-[var(--color-muted-foreground)] mb-3">
                  <Users className="w-3.5 h-3.5" />
                  <span>{meeting.participantIds.length} participants</span>
                  {meeting.isRecurring && <Badge className="bg-[var(--color-muted)] text-[var(--color-muted-foreground)]">Recurring</Badge>}
                </div>

                <div className="flex items-center justify-between mt-3 pt-3 border-t border-[var(--color-border)]">
                  <div className="flex items-center gap-2">
                    {host && <Avatar name={host.name} size="xs" />}
                    <span className="text-xs text-[var(--color-muted-foreground)]">{host?.name || 'Host'}</span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => handleCopyMeetingLink(e, meeting)}
                      className="text-xs h-7 px-2 text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
                      title="Copy meeting invite link"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </Button>

                    {currentRole !== 'member' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => handleDeleteMeeting(e, meeting.id)}
                        className="text-xs h-7 px-2 text-red-400 hover:text-red-500 hover:bg-red-500/10"
                        title="Permanently delete meeting"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}

                    <Button 
                      variant={isLive ? "primary" : "outline"}
                      size="sm" 
                      onClick={(e) => { 
                        e.stopPropagation(); 
                        const rawLink = (meeting.meetingLink || '').trim();
                        if (rawLink.startsWith('http://') || rawLink.startsWith('https://')) {
                          window.open(rawLink, '_blank', 'noopener,noreferrer');
                        } else {
                          const roomId = meeting.meetingRoomId || rawLink.split('/').pop() || meeting.id;
                          navigate(`/meeting/${roomId}`);
                        }
                      }}
                      className={cn(
                        "text-xs h-7",
                        isLive && "bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/20"
                      )}
                    >
                      {isAudio ? <Volume2 className="w-3.5 h-3.5 mr-1" /> : <Video className="w-3.5 h-3.5 mr-1" />}
                      {isLive ? 'Join Now' : 'Join'}
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* CREATE MEETING MODAL */}
      <Modal
        isOpen={showCreate}
        onClose={() => {
          setShowCreate(false);
          setShowLinkOption(false);
        }}
        title="Schedule New Meeting"
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => {
              setShowCreate(false);
              setShowLinkOption(false);
            }}>Cancel</Button>
            <Button onClick={handleCreateMeeting}>Create & Invite</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Meeting Title"
            placeholder="e.g., Sprint Architecture Review"
            value={newMeeting.title}
            onChange={(e) => setNewMeeting(m => ({ ...m, title: e.target.value }))}
            autoFocus
          />

          {/* MEETING TYPE SELECTOR: VIDEO VS AUDIO */}
          <div>
            <label className="text-xs font-semibold text-[var(--color-foreground)] block mb-1.5">
              Meeting Mode
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setNewMeeting(m => ({ ...m, meetingType: 'video' }))}
                className={cn(
                  "flex items-center gap-3 p-3 rounded-xl border text-left transition-all",
                  newMeeting.meetingType === 'video'
                    ? "border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/20 text-indigo-700 dark:text-indigo-300 ring-1 ring-indigo-600"
                    : "border-[var(--color-border)] hover:bg-[var(--color-muted)] text-[var(--color-foreground)]"
                )}
              >
                <div className={cn(
                  "p-2 rounded-lg",
                  newMeeting.meetingType === 'video' ? "bg-indigo-600 text-white" : "bg-black/5 dark:bg-white/5"
                )}>
                  <Video className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-xs font-bold">Group Video Meeting</p>
                  <p className="text-[11px] text-[var(--color-muted-foreground)]">Camera + mic + screen share</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setNewMeeting(m => ({ ...m, meetingType: 'audio' }))}
                className={cn(
                  "flex items-center gap-3 p-3 rounded-xl border text-left transition-all",
                  newMeeting.meetingType === 'audio'
                    ? "border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/20 text-indigo-700 dark:text-indigo-300 ring-1 ring-indigo-600"
                    : "border-[var(--color-border)] hover:bg-[var(--color-muted)] text-[var(--color-foreground)]"
                )}
              >
                <div className={cn(
                  "p-2 rounded-lg",
                  newMeeting.meetingType === 'audio' ? "bg-indigo-600 text-white" : "bg-black/5 dark:bg-white/5"
                )}>
                  <Volume2 className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-xs font-bold">Group Audio Meeting</p>
                  <p className="text-[11px] text-[var(--color-muted-foreground)]">Voice call with avatar cards</p>
                </div>
              </button>
            </div>
          </div>

          <Textarea
            label="Agenda / Notes"
            placeholder="Discuss sprint blockers, milestones, and deliverables..."
            rows={2}
            value={newMeeting.description}
            onChange={(e) => setNewMeeting(m => ({ ...m, description: e.target.value }))}
          />

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Date"
              type="date"
              value={newMeeting.date}
              onChange={(e) => setNewMeeting(m => ({ ...m, date: e.target.value }))}
            />
            <Select
              label="Meeting Category"
              value={newMeeting.type}
              onChange={(val) => setNewMeeting(m => ({ ...m, type: val as MeetingType }))}
              options={[
                { value: 'team', label: 'Team Meeting' },
                { value: 'standup', label: 'Daily Standup' },
                { value: 'review', label: 'Sprint Review' },
                { value: 'planning', label: 'Sprint Planning' },
                { value: 'one-on-one', label: '1-on-1 Catchup' },
              ]}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Start Time"
              value={newMeeting.startTime}
              options={TIME_OPTIONS}
              onChange={(val) => {
                const [hours, minutes] = val.split(':').map(Number);
                const date = new Date();
                date.setHours(hours, minutes + 30);
                const endH = date.getHours().toString().padStart(2, '0');
                const endM = date.getMinutes().toString().padStart(2, '0');
                const endVal = `${endH}:${endM}`;
                setNewMeeting(m => ({ ...m, startTime: val, endTime: endVal }));
              }}
            />
            <Select
              label="End Time"
              value={newMeeting.endTime}
              options={TIME_OPTIONS}
              onChange={(val) => setNewMeeting(m => ({ ...m, endTime: val }))}
            />
          </div>

          {/* Participant Selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[var(--color-foreground)] block">
              Select Participants ({newMeeting.participantIds.length} selected)
            </label>
            <div className="flex flex-wrap gap-2 p-3 border border-[var(--color-border)] rounded-xl bg-[var(--color-background)] max-h-40 overflow-y-auto">
              {allUsers.filter(u => u.id !== currentUser?.id).map((user) => {
                const isSelected = newMeeting.participantIds.includes(user.id);
                return (
                  <label key={user.id} className={cn(
                    "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs cursor-pointer border transition-colors select-none",
                    isSelected ? "bg-indigo-600 text-white border-indigo-600 font-medium" : "border-[var(--color-border)] hover:bg-[var(--color-muted)] text-[var(--color-foreground)]"
                  )}>
                    <input
                      type="checkbox"
                      className="hidden"
                      checked={isSelected}
                      onChange={() => {
                        setNewMeeting(m => ({
                          ...m,
                          participantIds: isSelected 
                            ? m.participantIds.filter(id => id !== user.id)
                            : [...m.participantIds, user.id]
                        }));
                      }}
                    />
                    <Avatar name={user.name} src={user.avatar} size="xs" />
                    <span>{user.name}</span>
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      </Modal>

      {/* SUCCESS MODAL WITH MEETING LINK */}
      <Modal
        isOpen={showSuccess}
        onClose={() => setShowSuccess(false)}
        title="Meeting Created Successfully"
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setShowSuccess(false)}>Done</Button>
            <Button onClick={() => {
              if (createdLink) {
                const roomId = createdLink.split('/').pop();
                navigate(`/meeting/${roomId}`);
              }
              setShowSuccess(false);
            }}>
              Join Meeting Room
            </Button>
          </>
        }
      >
        <div className="space-y-6 text-center">
          <div className="mx-auto w-16 h-16 bg-emerald-500/20 text-emerald-500 rounded-full flex items-center justify-center mb-4">
            <Video className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-medium">Your WebRTC meeting is ready</h3>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Participants have been notified. You can also copy and share the direct room link below.
          </p>
          <div className="flex items-center gap-2 mt-4 p-2 bg-[var(--color-muted)] rounded-lg border border-[var(--color-border)]">
            <input 
              type="text" 
              readOnly 
              value={createdLink} 
              className="flex-1 bg-transparent border-none focus:outline-none text-xs px-2 font-mono"
            />
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => {
                navigator.clipboard.writeText(createdLink);
                toast.success('Meeting link copied to clipboard');
              }}
            >
              <Copy className="w-4 h-4 mr-1" /> Copy
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
