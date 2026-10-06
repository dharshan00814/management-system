import React, { useState, useEffect } from 'react';
import {
  Megaphone,
  Plus,
  Search,
  Filter,
  AlertCircle,
  Bell,
  Calendar,
  User as UserIcon,
  Tag,
  CheckCircle2,
  Clock,
  Trash2,
  ShieldAlert,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button, Badge, Modal, EmptyState, Avatar, Input, Select, Textarea } from '@/components/ui';
import { cn, formatDate, formatRelativeTime } from '@/lib/utils';
import { useAuthStore } from '@/stores';
import {
  getAnnouncements,
  createAnnouncement,
  deleteAnnouncement,
  getUsers,
  getUserById,
  createNotification,
} from '@/services/api';
import { notifyStudioAnnouncement } from '@/services/notificationWorkflow';
import type { Announcement, AnnouncementPriority } from '@/types';

export function AnnouncementsPage() {
  const { currentRole, currentUser } = useAuthStore();
  const isAdmin = currentRole !== 'member';

  // CEO strictly identified: Only CEO has the privilege to delete announcements
  const isCEO = Boolean(
    currentUser?.designation?.toUpperCase() === 'CEO' || currentUser?.role === 'admin'
  );

  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [search, setSearch] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Delete Announcement Modal State (CEO Only)
  const [announcementToDelete, setAnnouncementToDelete] = useState<Announcement | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // New announcement form state
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newPriority, setNewPriority] = useState<AnnouncementPriority>('normal');
  const [newAudience, setNewAudience] = useState<'all' | 'admin' | 'manager' | 'member'>('all');

  useEffect(() => {
    let isMounted = true;
    async function load() {
      try {
        await getUsers();
        const anns = await getAnnouncements();
        if (isMounted) setAnnouncements(anns);
      } catch (err) {
        console.error(err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }
    load();
    return () => {
      isMounted = false;
    };
  }, []);

  const filteredAnnouncements = announcements.filter((item) => {
    // Audience filter
    if (item.audience !== 'all' && item.audience !== currentRole && currentRole === 'member') {
      return false;
    }
    // Priority filter
    if (priorityFilter !== 'all' && item.priority !== priorityFilter) {
      return false;
    }
    // Search query
    if (search) {
      const q = search.toLowerCase();
      return (
        item.title.toLowerCase().includes(q) ||
        item.content.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newContent.trim()) {
      toast.error('Please enter a title and content.');
      return;
    }

    try {
      const created = await createAnnouncement({
        title: newTitle.trim(),
        content: newContent.trim(),
        priority: newPriority,
        createdBy: currentUser?.id || 'u1',
        audience: newAudience,
      });

      const allUsers = await getUsers();
      const targetUsers = allUsers.filter(
        (u) =>
          u.status === 'active' &&
          (newAudience === 'all' || u.role === newAudience)
      );

      // Dispatch Web Push notification broadcast to all subscribers
      notifyStudioAnnouncement({
        title: created.title,
        message: created.content.slice(0, 120),
        authorName: currentUser?.name,
      }).catch(console.error);

      setAnnouncements((prev) => [created, ...prev]);
      toast.success('Announcement broadcasted successfully!');
      setIsCreateOpen(false);
      setNewTitle('');
      setNewContent('');
      setNewPriority('normal');
      setNewAudience('all');
    } catch (err) {
      toast.error('Failed to create announcement');
    }
  };

  // CEO Delete Handler
  const handleConfirmDelete = async () => {
    if (!announcementToDelete) return;
    setIsDeleting(true);

    try {
      await deleteAnnouncement(announcementToDelete.id);
      setAnnouncements((prev) => prev.filter((a) => a.id !== announcementToDelete.id));
      toast.success(`Announcement "${announcementToDelete.title}" deleted successfully.`);
      setAnnouncementToDelete(null);
    } catch (err: any) {
      toast.error('Failed to delete announcement: ' + (err?.message || 'Unknown error'));
    } finally {
      setIsDeleting(false);
    }
  };

  const getPriorityBadge = (priority: AnnouncementPriority) => {
    switch (priority) {
      case 'urgent':
        return <Badge variant="destructive" className="capitalize">Urgent</Badge>;
      case 'high':
        return <Badge variant="warning" className="capitalize">High Priority</Badge>;
      case 'normal':
        return <Badge variant="secondary" className="capitalize">Normal</Badge>;
      case 'low':
        return <Badge variant="outline" className="capitalize">Notice</Badge>;
    }
  };

  const urgentList = filteredAnnouncements.filter(
    (a) => a.priority === 'urgent' || a.priority === 'high'
  );

  return (
    <div className="page-container space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-2xl font-bold tracking-tight">Announcements</h1>
            {isCEO && (
              <Badge variant="outline" className="border-amber-500/40 text-amber-500 text-[10px] uppercase font-mono">
                CEO &bull; Delete Enabled
              </Badge>
            )}
          </div>
          <p className="text-sm text-[var(--color-muted-foreground)] mt-0.5">
            Official studio notices, technical updates, and organization broadcasts.
          </p>
        </div>
        {isAdmin && (
          <Button
            onClick={() => setIsCreateOpen(true)}
            className="gap-2 cursor-pointer bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
          >
            <Plus className="w-4 h-4" />
            New Announcement
          </Button>
        )}
      </div>

      {/* Featured / Urgent banner if any */}
      {urgentList.length > 0 && (
        <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-red-500/10 border border-amber-500/20">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400 shrink-0">
                <Megaphone className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="text-xs font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                    Important Notice
                  </span>
                  {getPriorityBadge(urgentList[0].priority)}
                </div>
                <h3 className="font-semibold text-base text-[var(--color-foreground)]">
                  {urgentList[0].title}
                </h3>
                <p className="text-sm text-[var(--color-muted-foreground)] mt-1 line-clamp-2">
                  {urgentList[0].content}
                </p>
              </div>
            </div>

            {/* CEO Delete Button on Featured Banner */}
            {isCEO && (
              <button
                type="button"
                onClick={() => setAnnouncementToDelete(urgentList[0])}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-red-600 dark:text-red-400 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 transition-colors cursor-pointer self-start sm:self-center shrink-0"
                title="Delete Announcement (CEO Exclusive)"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Filters & Search */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted-foreground)]" />
          <input
            type="text"
            placeholder="Search announcements..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)]"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="w-4 h-4 text-[var(--color-muted-foreground)]" />
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)]"
          >
            <option value="all">All Priorities</option>
            <option value="urgent">Urgent</option>
            <option value="high">High</option>
            <option value="normal">Normal</option>
            <option value="low">Notice</option>
          </select>
        </div>
      </div>

      {/* Announcement List */}
      {filteredAnnouncements.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title="No announcements found"
          description="There are currently no announcements matching your filters."
        />
      ) : (
        <div className="space-y-4">
          {filteredAnnouncements.map((item) => {
            const author = getUserById(item.createdBy);
            return (
              <div
                key={item.id}
                className="card p-5 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] hover:border-zinc-300 dark:hover:border-zinc-700 transition"
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <h2 className="text-base font-semibold text-[var(--color-foreground)]">
                      {item.title}
                    </h2>
                    {getPriorityBadge(item.priority)}
                    <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--color-muted)] text-[var(--color-muted-foreground)] capitalize">
                      Audience: {item.audience}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="flex items-center gap-1.5 text-xs text-[var(--color-muted-foreground)]">
                      <Clock className="w-3.5 h-3.5" />
                      <span>{formatRelativeTime(item.createdAt)}</span>
                    </div>

                    {/* CEO Exclusive Delete Option */}
                    {isCEO && (
                      <button
                        type="button"
                        onClick={() => setAnnouncementToDelete(item)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-red-600 dark:text-red-400 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 transition-colors cursor-pointer"
                        title="Delete Announcement (CEO Exclusive)"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete</span>
                      </button>
                    )}
                  </div>
                </div>

                <p className="text-sm text-[var(--color-muted-foreground)] leading-relaxed whitespace-pre-line mb-4">
                  {item.content}
                </p>

                <div className="flex items-center justify-between pt-3 border-t border-[var(--color-border)] text-xs text-[var(--color-muted-foreground)]">
                  <div className="flex items-center gap-2">
                    {author ? (
                      <>
                        <Avatar name={author.name} size="xs" />
                        <span className="font-medium text-[var(--color-foreground)]">{author.name}</span>
                        <span>•</span>
                        <span>{author.designation}</span>
                      </>
                    ) : (
                      <span>Organization Admin</span>
                    )}
                  </div>
                  <span>{formatDate(item.createdAt)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Announcement Modal */}
      <Modal
        isOpen={isCreateOpen}
        title="Create New Announcement"
        onClose={() => setIsCreateOpen(false)}
        size="md"
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <Input
            label="Title *"
            placeholder="e.g. Q4 Sprint Goals & Tech Stack Upgrade"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            required
          />

          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Priority"
              value={newPriority}
              onChange={(val) => setNewPriority(val as AnnouncementPriority)}
              options={[
                { value: 'normal', label: 'Normal' },
                { value: 'high', label: 'High' },
                { value: 'urgent', label: 'Urgent' },
                { value: 'low', label: 'Notice' },
              ]}
            />
            <Select
              label="Target Audience"
              value={newAudience}
              onChange={(val) => setNewAudience(val as any)}
              options={[
                { value: 'all', label: 'Everyone' },
                { value: 'member', label: 'Members Only' },
                { value: 'manager', label: 'Managers' },
                { value: 'admin', label: 'Admins' },
              ]}
            />
          </div>

          <Textarea
            label="Announcement Message *"
            placeholder="Type your announcement content here..."
            rows={4}
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            required
          />

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white">
              Broadcast Announcement
            </Button>
          </div>
        </form>
      </Modal>

      {/* CONFIRM DELETE MODAL (CEO EXCLUSIVE) */}
      {announcementToDelete && (
        <Modal
          isOpen={!!announcementToDelete}
          onClose={() => setAnnouncementToDelete(null)}
          title="Delete Announcement"
          size="sm"
        >
          <div className="space-y-4 pt-1">
            <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 flex items-start gap-3 text-red-600 dark:text-red-400">
              <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5" />
              <div className="text-xs space-y-1">
                <p className="font-semibold text-sm">Permanent Deletion</p>
                <p className="opacity-90 leading-relaxed">
                  Are you sure you want to delete the announcement:{' '}
                  <strong>"{announcementToDelete.title}"</strong>?
                </p>
                <p className="text-[11px] opacity-75">
                  This action will permanently remove this broadcast from all team members' feeds and cannot be undone.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setAnnouncementToDelete(null)}
                disabled={isDeleting}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleConfirmDelete}
                isLoading={isDeleting}
                className="bg-red-600 hover:bg-red-700 text-white shadow-xs"
              >
                <Trash2 className="w-4 h-4 mr-1.5" />
                Delete Announcement
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default AnnouncementsPage;
