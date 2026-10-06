import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Clock, Video, Link2, ExternalLink, Copy, Edit2, Plus, Check, Trash2 } from 'lucide-react';
import { Button, Avatar, Badge, EmptyState, LoadingState, Modal, Input } from '@/components/ui';
import { cn, formatDate, formatTime } from '@/lib/utils';
import { useAuthStore } from '@/stores';
import { getMeeting, getUsers, getUserById, updateMeeting, deleteMeeting } from '@/services/api';
import { toast } from 'sonner';
import type { Meeting } from '@/types';

export function MeetingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentRole, effectiveRole } = useAuthStore();
  const prefix = effectiveRole === 'member' ? '/member' : effectiveRole === 'manager' ? '/manager' : '/admin';
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Link Editor state
  const [isEditingLink, setIsEditingLink] = useState(false);
  const [meetLinkInput, setMeetLinkInput] = useState('');
  const [isSavingLink, setIsSavingLink] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let isMounted = true;
    async function load() {
      if (!id) return;
      try {
        await getUsers();
        const m = await getMeeting(id);
        if (isMounted && m) setMeeting(m);
      } catch (err) {
        console.error(err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }
    load();
    return () => { isMounted = false; };
  }, [id]);

  if (isLoading) return <LoadingState />;

  if (!meeting) {
    return (
      <div className="page-container">
        <EmptyState title="Meeting not found" action={<Button onClick={() => navigate(`${prefix}/meetings`)}>Go Back</Button>} />
      </div>
    );
  }

  const host = getUserById(meeting.hostId);
  const rawLink = (meeting.meetingLink || '').trim();
  const isGoogleMeet = Boolean(rawLink && rawLink.includes('meet.google.com'));
  const hasExternalLink = Boolean(
    rawLink && (
      rawLink.startsWith('http://') || 
      rawLink.startsWith('https://') || 
      rawLink.includes('meet.google.com') || 
      rawLink.includes('zoom.us') || 
      rawLink.includes('teams.microsoft.com')
    )
  );

  const handleJoinMeeting = () => {
    if (!rawLink) {
      setMeetLinkInput('');
      setIsEditingLink(true);
      return;
    }

    if (hasExternalLink) {
      const targetUrl = rawLink.startsWith('http://') || rawLink.startsWith('https://') 
        ? rawLink 
        : `https://${rawLink}`;
      window.open(targetUrl, '_blank', 'noopener,noreferrer');
      return;
    }

    let roomId = meeting.meetingRoomId || meeting.id;
    if (rawLink.includes('/meeting/')) {
      const parts = rawLink.split('/meeting/');
      if (parts[1]) roomId = parts[1].split('?')[0];
    }
    navigate(`/meeting/${roomId}`);
  };

  const handleSaveMeetingLink = async () => {
    if (!id) return;
    setIsSavingLink(true);
    try {
      const cleanLink = meetLinkInput.trim();
      const updated = await updateMeeting(id, { meetingLink: cleanLink });
      setMeeting(prev => prev ? { ...prev, meetingLink: cleanLink } : updated);
      setIsEditingLink(false);
      toast.success(cleanLink ? 'Meeting link updated successfully!' : 'Meeting link removed');
    } catch (err: any) {
      console.error(err);
      toast.error('Failed to update meeting link');
    } finally {
      setIsSavingLink(false);
    }
  };

  const handleDeleteMeeting = async () => {
    if (!window.confirm('Are you sure you want to delete this meeting?')) return;
    try {
      if (id) await deleteMeeting(id);
      toast.success('Meeting deleted');
      navigate(`${prefix}/meetings`);
    } catch (e) {
      toast.error('Failed to delete meeting');
    }
  };

  return (
    <div className="page-container">
      <div className="flex items-center justify-between mb-6">
        <button onClick={() => navigate(`${prefix}/meetings`)} className="flex items-center gap-2 text-sm text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Meetings
        </button>
        {currentRole !== 'member' && (
          <Button variant="ghost" size="sm" onClick={handleDeleteMeeting} className="text-red-500 hover:text-red-600 hover:bg-red-500/10 text-xs gap-1.5">
            <Trash2 className="w-3.5 h-3.5" /> Delete Meeting
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in">
        <div className="lg:col-span-2 space-y-6">
          <div className="card p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h1 className="text-xl font-semibold">{meeting.title}</h1>
                <p className="text-sm text-[var(--color-muted-foreground)] mt-1 capitalize">{meeting.type} meeting</p>
              </div>
              <Badge className={cn(meeting.status === 'scheduled' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-[var(--color-muted)]')}>{meeting.status}</Badge>
            </div>
            <p className="text-sm text-[var(--color-muted-foreground)] mb-4">{meeting.description}</p>
            <div className="grid grid-cols-2 gap-4 text-sm mb-4">
              <div><span className="text-[var(--color-muted-foreground)]">Date</span><br /><span className="font-medium">{formatDate(meeting.date)}</span></div>
              <div><span className="text-[var(--color-muted-foreground)]">Time</span><br /><span className="font-medium">{formatTime(meeting.startTime)} - {formatTime(meeting.endTime)}</span></div>
              <div><span className="text-[var(--color-muted-foreground)]">Host</span><br /><div className="flex items-center gap-2 mt-1">{host && <Avatar name={host.name} size="xs" />}<span className="font-medium">{host?.name || 'Host'}</span></div></div>
              <div><span className="text-[var(--color-muted-foreground)]">Type</span><br /><span className="font-medium capitalize">{meeting.type}</span></div>
            </div>
            {/* Meeting Link Section */}
            <div className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-muted)]/30 space-y-3 mb-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Link2 className="w-4 h-4 text-indigo-500" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">
                    Meeting Link
                  </span>
                  {isGoogleMeet && (
                    <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-[10px] font-medium">
                      Google Meet
                    </Badge>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs gap-1 text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
                  onClick={() => {
                    setMeetLinkInput(meeting.meetingLink || '');
                    setIsEditingLink(true);
                  }}
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  {meeting.meetingLink ? 'Change Link' : 'Add Google Meet Link'}
                </Button>
              </div>

              {meeting.meetingLink ? (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 rounded-lg bg-[var(--color-card)] border border-[var(--color-border)]">
                  <a
                    href={meeting.meetingLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-mono text-indigo-600 dark:text-indigo-400 hover:underline truncate max-w-md flex items-center gap-1.5"
                  >
                    <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{meeting.meetingLink}</span>
                  </a>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1 shrink-0"
                    onClick={() => {
                      const raw = (meeting.meetingLink || '').trim();
                      const roomId = meeting.meetingRoomId || raw.split('/').pop() || meeting.id;
                      const fullUrl = raw.startsWith('http://') || raw.startsWith('https://')
                        ? raw
                        : `${window.location.origin}/meeting/${roomId}`;
                      navigator.clipboard.writeText(fullUrl);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                      toast.success('Meeting link copied to clipboard');
                    }}
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? 'Copied' : 'Copy'}
                  </Button>
                </div>
              ) : (
                <div className="text-xs text-[var(--color-muted-foreground)] flex items-center justify-between py-1">
                  <span>No meeting link added yet.</span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1"
                    onClick={() => {
                      setMeetLinkInput('');
                      setIsEditingLink(true);
                    }}
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Google Meet Link
                  </Button>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button 
                className={cn(
                  "w-full sm:w-auto font-medium",
                  isGoogleMeet ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "bg-indigo-600 hover:bg-indigo-700 text-white"
                )} 
                onClick={handleJoinMeeting}
              >
                <Video className="w-4 h-4 mr-2" />
                {isGoogleMeet ? 'Join Google Meet' : meeting.meetingLink ? 'Join Meeting' : '+ Add Google Meet Link'}
              </Button>
              {meeting.meetingLink && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setMeetLinkInput(meeting.meetingLink || '');
                    setIsEditingLink(true);
                  }}
                  className="text-xs h-9"
                >
                  <Edit2 className="w-3.5 h-3.5 mr-1.5" /> Edit Link
                </Button>
              )}
            </div>
          </div>

          <div className="card p-6">
            <h2 className="text-base font-semibold mb-4">Meeting Notes</h2>
            <EmptyState title="No notes yet" description="Meeting notes will appear here during or after the meeting." />
          </div>
        </div>

        <div className="space-y-6">
          <div className="card p-6">
            <h2 className="text-base font-semibold mb-4">Participants ({meeting.participantIds.length})</h2>
            <div className="space-y-2">
              {meeting.participantIds.map(pId => {
                const participant = getUserById(pId);
                if (!participant) return null;
                return (
                  <div key={pId} className="flex items-center gap-3 p-2 rounded-lg hover:bg-[var(--color-muted)] transition-colors">
                    <Avatar name={participant.name} size="sm" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{participant.name}</p>
                      <p className="text-xs text-[var(--color-muted-foreground)]">{pId === meeting.hostId ? 'Host' : participant.designation}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Edit / Add Google Meet Link Modal */}
      <Modal
        isOpen={isEditingLink}
        onClose={() => setIsEditingLink(false)}
        title="Meeting Link (Google Meet / Video Link)"
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setIsEditingLink(false)}>Cancel</Button>
            <Button onClick={handleSaveMeetingLink} disabled={isSavingLink}>
              {isSavingLink ? 'Saving...' : 'Save Link'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-xs text-[var(--color-muted-foreground)]">
            Paste your Google Meet, Zoom, or video call link below. When members click <strong>Join Meeting</strong>, they will be taken directly to this meeting.
          </p>

          <div>
            <label className="block text-xs font-medium text-[var(--color-muted-foreground)] mb-1.5">
              Google Meet URL
            </label>
            <Input
              placeholder="https://meet.google.com/abc-defg-hij"
              value={meetLinkInput}
              onChange={(e) => setMeetLinkInput(e.target.value)}
              autoFocus
            />
          </div>

          <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">Don't have a Google Meet link yet?</p>
              <p className="text-[11px] text-emerald-700/80 dark:text-emerald-400/80">Click here to generate a fresh Google Meet in 1 click.</p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="text-xs gap-1.5 border-emerald-500/30 text-emerald-700 dark:text-emerald-300 shrink-0"
              onClick={() => window.open('https://meet.google.com/new', '_blank')}
            >
              <ExternalLink className="w-3.5 h-3.5" /> Open Google Meet
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
