import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Radio, Users, Clock, Laptop, Filter, RefreshCw, Search,
  CheckCircle2, AlertCircle, Coffee, PowerOff, FileCode, GitBranch,
  Layers, ChevronRight, Eye, Calendar, Sparkles, ShieldCheck, Terminal, X, Play, Activity, Folder, ClipboardList, FileEdit
} from 'lucide-react';
import { StatCard, Avatar, Badge, Button, LoadingState, EmptyState } from '@/components/ui';
import { useAuthStore } from '@/stores';
import {
  getLiveDeveloperCards,
  getDeveloperActivityTimeline,
  subscribeToLiveDeveloperActivity,
  getToolBrandColor,
  getToolDisplayName,
  formatTimeAgo,
} from '@/services/developerActivityService';
import { formatDurationDetailed } from '@/services/activityService';
import type { LiveDeveloperCardData, LiveDeveloperMetrics, DeveloperActivityEvent } from '@/types/developerActivity';
import { cn, formatDate, formatTime } from '@/lib/utils';
import { toast } from 'sonner';

export function LiveDeveloperActivityPage() {
  const { currentUser, effectiveRole } = useAuthStore();
  const [cards, setCards] = useState<LiveDeveloperCardData[]>([]);
  const [metrics, setMetrics] = useState<LiveDeveloperMetrics>({
    activeCount: 0,
    idleCount: 0,
    offlineCount: 0,
    totalTeamCount: 0,
    toolBreakdown: { vscode: 0, cursor: 0, antigravity: 0 },
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastSyncedTime, setLastSyncedTime] = useState<string>('Just now');

  // Filters
  const [searchMember, setSearchMember] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'idle' | 'offline'>('all');
  const [toolFilter, setToolFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

  // Selected member for Activity Timeline Modal
  const [timelineUser, setTimelineUser] = useState<LiveDeveloperCardData | null>(null);
  const [timelineEvents, setTimelineEvents] = useState<DeveloperActivityEvent[]>([]);
  const [loadingTimeline, setLoadingTimeline] = useState(false);

  const loadData = async (showToast = false) => {
    try {
      if (showToast) setIsRefreshing(true);
      const res = await getLiveDeveloperCards();
      setCards(res.cards);
      setMetrics(res.metrics);
      setLastSyncedTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      if (showToast) toast.success('Live developer status updated');
    } catch (err) {
      console.warn('Failed to load live developer activity:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();

    // Subscribe to Supabase Realtime broadcast for live auto-updating
    const unsubscribe = subscribeToLiveDeveloperActivity(() => {
      loadData(false);
    });

    // Auto polling fallback every 15 seconds
    const interval = setInterval(() => {
      loadData(false);
    }, 15000);

    // Live continuous usage prediction ticker: ticks every second for all active developers
    const liveTicker = setInterval(() => {
      setCards((prevCards) =>
        prevCards.map((c) => {
          const sessionStartTime = c.currentSession?.startedAt || c.currentSession?.started_at;
          if (c.status === 'active' && sessionStartTime) {
            const startMs = new Date(sessionStartTime).getTime();
            const liveSeconds = Math.max(0, Math.round((Date.now() - startMs) / 1000));
            return {
              ...c,
              activeDurationSeconds: liveSeconds,
            };
          }
          return c;
        })
      );
    }, 1000);

    return () => {
      unsubscribe();
      clearInterval(interval);
      clearInterval(liveTicker);
    };
  }, []);

  const handleOpenTimeline = async (card: LiveDeveloperCardData) => {
    setTimelineUser(card);
    setLoadingTimeline(true);
    try {
      const events = await getDeveloperActivityTimeline(card.user.id, 25);
      setTimelineEvents(events);
    } catch (err) {
      console.warn('Failed to load user timeline:', err);
    } finally {
      setLoadingTimeline(false);
    }
  };

  // Filter cards
  const filteredCards = useMemo(() => {
    return cards.filter((c) => {
      if (searchMember.trim()) {
        const query = searchMember.toLowerCase();
        const matchesName = c.user.name.toLowerCase().includes(query);
        const matchesEmail = c.user.email?.toLowerCase().includes(query);
        const matchesWorkspace = c.workspaceName?.toLowerCase().includes(query);
        if (!matchesName && !matchesEmail && !matchesWorkspace) return false;
      }

      if (statusFilter !== 'all' && c.status !== statusFilter) {
        return false;
      }

      if (toolFilter !== 'all' && c.tool !== toolFilter) {
        return false;
      }

      return true;
    });
  }, [cards, searchMember, statusFilter, toolFilter]);

  if (isLoading) {
    return <LoadingState message="Connecting to Live Developer Activity Stream..." />;
  }

  return (
    <div className="page-container">
      {/* Top Header */}
      <div className="page-header flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="page-title">Live Developer Activity</h1>
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
            </span>
            <Badge variant="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-xs">
              Live Realtime Stream
            </Badge>
          </div>
          <p className="page-description">
            Live working telemetry across Visual Studio Code, Cursor, and Antigravity. Last synced at {lastSyncedTime}.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link to="/settings/integrations">
            <Button variant="outline" size="sm" className="gap-1.5 text-xs">
              <Laptop className="w-3.5 h-3.5 text-[var(--color-primary)]" />
              IDE Integrations
            </Button>
          </Link>
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadData(true)}
            disabled={isRefreshing}
            className="gap-1.5 text-xs"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', isRefreshing && 'animate-spin')} />
            Refresh
          </Button>
        </div>
      </div>

      {/* High-Level Status Counters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Active Developers"
          value={metrics.activeCount}
          icon={Radio}
          iconColor="text-emerald-500"
        />
        <StatCard
          label="Idle / Away"
          value={metrics.idleCount}
          icon={Coffee}
          iconColor="text-amber-500"
        />
        <StatCard
          label="Offline"
          value={metrics.offlineCount}
          icon={PowerOff}
          iconColor="text-zinc-400"
        />
        <StatCard
          label="Top Active Tool"
          value={
            metrics.toolBreakdown.cursor >= metrics.toolBreakdown.vscode
              ? `Cursor (${metrics.toolBreakdown.cursor})`
              : `VS Code (${metrics.toolBreakdown.vscode})`
          }
          icon={Laptop}
          iconColor="text-cyan-500"
        />
      </div>

      {/* Filter and Toolbar */}
      <div className="card p-4 mb-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 flex-1">
            {/* Search */}
            <div className="relative">
              <input
                type="text"
                placeholder="Search member or workspace..."
                value={searchMember}
                onChange={(e) => setSearchMember(e.target.value)}
                className="w-full text-xs pl-8 pr-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] text-[var(--color-foreground)]"
              />
              <Search className="w-3.5 h-3.5 text-[var(--color-muted-foreground)] absolute left-2.5 top-2.5" />
            </div>

            {/* Status Selector */}
            <div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="w-full text-xs px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] text-[var(--color-foreground)]"
              >
                <option value="all">All States ({cards.length})</option>
                <option value="active">Active Only ({metrics.activeCount})</option>
                <option value="idle">Idle Only ({metrics.idleCount})</option>
                <option value="offline">Offline ({metrics.offlineCount})</option>
              </select>
            </div>

            {/* Tool Selector */}
            <div>
              <select
                value={toolFilter}
                onChange={(e) => setToolFilter(e.target.value)}
                className="w-full text-xs px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] text-[var(--color-foreground)]"
              >
                <option value="all">All Tools</option>
                <option value="cursor">Cursor ({metrics.toolBreakdown.cursor})</option>
                <option value="vscode">VS Code ({metrics.toolBreakdown.vscode})</option>
                <option value="antigravity">Antigravity ({metrics.toolBreakdown.antigravity})</option>
              </select>
            </div>
          </div>

          {/* View Mode Toggle */}
          <div className="flex items-center gap-1 border border-[var(--color-border)] p-1 rounded-lg shrink-0">
            <button
              onClick={() => setViewMode('grid')}
              className={cn(
                'px-2.5 py-1 text-xs rounded font-medium transition-colors',
                viewMode === 'grid'
                  ? 'bg-[var(--color-primary)] text-white'
                  : 'text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]'
              )}
            >
              Cards
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={cn(
                'px-2.5 py-1 text-xs rounded font-medium transition-colors',
                viewMode === 'table'
                  ? 'bg-[var(--color-primary)] text-white'
                  : 'text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]'
              )}
            >
              Table
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      {filteredCards.length === 0 ? (
        <div className="card p-12 text-center">
          <EmptyState
            title="No Matching Developers"
            description="No team members match your current live filter criteria."
          />
        </div>
      ) : viewMode === 'grid' ? (
        /* Member Activity Cards Grid matching Section 8 */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {filteredCards.map((card, idx) => {
            const isOnline = card.status !== 'offline';
            const brandColor = card.tool ? getToolBrandColor(card.tool) : 'var(--color-border)';

            return (
              <div
                key={`${card.user.id}-${idx}`}
                className={cn(
                  'card p-5 relative border-l-4 transition-all hover:shadow-lg',
                  card.status === 'active' && 'border-l-emerald-500',
                  card.status === 'idle' && 'border-l-amber-500',
                  card.status === 'offline' && 'border-l-zinc-300 dark:border-l-zinc-700 opacity-80'
                )}
              >
                {/* Top Row: User Avatar & Live Status */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <Avatar name={card.user.name} size="md" />
                      <span
                        className={cn(
                          'absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-[var(--color-card)]',
                          card.status === 'active' && 'bg-emerald-500 animate-pulse',
                          card.status === 'idle' && 'bg-amber-500',
                          card.status === 'offline' && 'bg-zinc-400'
                        )}
                      />
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm text-[var(--color-foreground)]">{card.user.name}</h3>
                      <p className="text-xs text-[var(--color-muted-foreground)]">{card.user.designation || card.user.role}</p>
                    </div>
                  </div>

                  <div className="text-right">
                    <span
                      className={cn(
                        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wider',
                        card.status === 'active' && 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
                        card.status === 'idle' && 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
                        card.status === 'offline' && 'bg-zinc-500/10 text-zinc-500'
                      )}
                    >
                      {card.status === 'active' && <span className="flex items-center justify-center gap-1.5"><Radio className="w-3 h-3" /> Active</span>}
                      {card.status === 'idle' && <span className="flex items-center justify-center gap-1.5"><Coffee className="w-3 h-3" /> Idle</span>}
                      {card.status === 'offline' && <span className="flex items-center justify-center gap-1.5"><PowerOff className="w-3 h-3" /> Offline</span>}
                    </span>
                    <span className="block text-[10px] text-[var(--color-muted-foreground)] mt-0.5">
                      {card.lastActivityAgo}
                    </span>
                  </div>
                </div>

                {/* Details Section */}
                <div className="space-y-3 py-2 text-xs border-y border-[var(--color-border)]">
                  {/* Tool */}
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--color-muted-foreground)]">Tool:</span>
                    <span className="font-medium flex items-center gap-1.5">
                      {card.tool ? (
                        <>
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: brandColor }}
                          />
                          {getToolDisplayName(card.tool)}
                        </>
                      ) : (
                        <span className="italic text-[var(--color-muted-foreground)]">None</span>
                      )}
                    </span>
                  </div>

                  {/* Project */}
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--color-muted-foreground)]">Project:</span>
                    <span className="font-medium truncate max-w-[180px]">
                      {card.projectName || <span className="italic text-[var(--color-muted-foreground)]">None</span>}
                    </span>
                  </div>

                  {/* Task */}
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--color-muted-foreground)]">Task:</span>
                    <span className="font-medium truncate max-w-[180px] text-[var(--color-primary)]">
                      {card.taskTitle || <span className="italic text-[var(--color-muted-foreground)]">No task selected</span>}
                    </span>
                  </div>

                  {/* Workspace */}
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--color-muted-foreground)]">Workspace:</span>
                    <span className="font-mono text-[11px] truncate max-w-[180px]">
                      {card.workspaceName || <span className="italic text-[var(--color-muted-foreground)]">-</span>}
                    </span>
                  </div>

                  {/* Current File */}
                  {card.currentFile && (
                    <div className="flex items-center justify-between">
                      <span className="text-[var(--color-muted-foreground)]">Current file:</span>
                      <span className="font-mono text-[11px] truncate max-w-[180px] bg-[var(--color-muted)] px-1.5 py-0.5 rounded text-[var(--color-foreground)]">
                        {card.currentFile}
                      </span>
                    </div>
                  )}

                  {/* Git Branch */}
                  {card.gitBranch && (
                    <div className="flex items-center justify-between">
                      <span className="text-[var(--color-muted-foreground)]">Branch:</span>
                      <span className="inline-flex items-center gap-1 font-mono text-[11px] text-indigo-500">
                        <GitBranch className="w-3 h-3" />
                        {card.gitBranch}
                      </span>
                    </div>
                  )}

                  {/* Active Duration */}
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[var(--color-muted-foreground)]">Active for:</span>
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                      {formatDurationDetailed(card.activeDurationSeconds)}
                    </span>
                  </div>
                </div>

                {/* Footer Action */}
                <div className="pt-3 flex items-center justify-between">
                  <span className="text-[11px] text-[var(--color-muted-foreground)]">
                    {card.status === 'active' ? 'Heartbeat verified' : 'Session inactive'}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs gap-1 hover:text-[var(--color-primary)]"
                    onClick={() => handleOpenTimeline(card)}
                  >
                    <Eye className="w-3.5 h-3.5" />
                    Timeline
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Table View */
        <div className="card overflow-hidden mb-8">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-[var(--color-muted)] text-[var(--color-muted-foreground)] text-xs uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3">Member</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Tool</th>
                  <th className="px-5 py-3">Project & Task</th>
                  <th className="px-5 py-3">Workspace</th>
                  <th className="px-5 py-3">Current File</th>
                  <th className="px-5 py-3">Active Duration</th>
                  <th className="px-5 py-3">Last Seen</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {filteredCards.map((card, idx) => (
                  <tr key={`${card.user.id}-${idx}`} className="hover:bg-[var(--color-muted)]/40 transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={card.user.name} size="sm" />
                        <div>
                          <span className="font-medium text-xs text-[var(--color-foreground)] block">
                            {card.user.name}
                          </span>
                          <span className="text-[11px] text-[var(--color-muted-foreground)]">
                            {card.user.designation || card.user.role}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <span
                        className={cn(
                          'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold',
                          card.status === 'active' && 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
                          card.status === 'idle' && 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
                          card.status === 'offline' && 'bg-zinc-500/10 text-zinc-500'
                        )}
                      >
                        <span
                          className={cn(
                            'w-2 h-2 rounded-full',
                            card.status === 'active' && 'bg-emerald-500 animate-pulse',
                            card.status === 'idle' && 'bg-amber-500',
                            card.status === 'offline' && 'bg-zinc-400'
                          )}
                        />
                        {card.status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-xs font-medium">
                      {card.tool ? getToolDisplayName(card.tool) : '-'}
                    </td>
                    <td className="px-5 py-3.5 text-xs">
                      <span className="font-medium block truncate max-w-[150px]">{card.projectName || '-'}</span>
                      <span className="text-[11px] text-[var(--color-primary)] truncate max-w-[150px] block">
                        {card.taskTitle || 'No task'}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 font-mono text-[11px] text-[var(--color-muted-foreground)]">
                      {card.workspaceName || '-'}
                    </td>
                    <td className="px-5 py-3.5 font-mono text-[11px]">
                      {card.currentFile ? (
                        <span className="bg-[var(--color-muted)] px-1.5 py-0.5 rounded">{card.currentFile}</span>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="px-5 py-3.5 font-semibold text-xs text-emerald-600 dark:text-emerald-400">
                      {formatDurationDetailed(card.activeDurationSeconds)}
                    </td>
                    <td className="px-5 py-3.5 text-xs text-[var(--color-muted-foreground)]">
                      {card.lastActivityAgo}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => handleOpenTimeline(card)}>
                        Timeline
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Activity Timeline Modal */}
      {timelineUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-[var(--color-card)] rounded-2xl border border-[var(--color-border)] shadow-2xl max-w-xl w-full p-6 space-y-4 animate-scale-up max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--color-border)] shrink-0">
              <div className="flex items-center gap-3">
                <Avatar name={timelineUser.user.name} size="sm" />
                <div>
                  <h3 className="font-semibold text-base">{timelineUser.user.name} — Activity Log</h3>
                  <p className="text-xs text-[var(--color-muted-foreground)]">
                    Audit log of verified IDE telemetry events
                  </p>
                </div>
              </div>
              <button
                onClick={() => setTimelineUser(null)}
                className="text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto pr-1 space-y-3">
              {loadingTimeline ? (
                <div className="py-12 text-center text-xs text-[var(--color-muted-foreground)]">
                  Loading activity timeline...
                </div>
              ) : timelineEvents.length === 0 ? (
                <div className="py-12 text-center text-xs text-[var(--color-muted-foreground)]">
                  No activity events recorded yet for this session.
                </div>
              ) : (
                <div className="relative pl-6 space-y-4 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-[var(--color-border)]">
                  {timelineEvents.map((evt, idx) => {
                    const timeStr = formatTime(evt.timestamp);
                    const isStart = evt.eventType === 'session_started';
                    const isIdle = evt.eventType === 'idle';
                    const isGit = evt.eventType === 'file_activity' || Boolean(evt.gitBranch);

                    return (
                      <div key={`${evt.id || idx}`} className="relative text-xs">
                        <span
                          className={cn(
                            'absolute -left-6 top-1 w-2.5 h-2.5 rounded-full border-2 border-[var(--color-card)]',
                            isStart && 'bg-emerald-500',
                            isIdle && 'bg-amber-500',
                            !isStart && !isIdle && 'bg-[var(--color-primary)]'
                          )}
                        />
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-[var(--color-foreground)]">
                            {evt.eventType === 'session_started' && <span className="flex items-center gap-1.5"><Play className="w-3.5 h-3.5 text-emerald-500" /> Session started</span>}
                            {evt.eventType === 'session_heartbeat' && <span className="flex items-center gap-1.5"><Activity className="w-3.5 h-3.5 text-[var(--color-primary)]" /> Heartbeat</span>}
                            {evt.eventType === 'file_activity' && <span className="flex items-center gap-1.5"><FileEdit className="w-3.5 h-3.5 text-amber-500" /> File activity</span>}
                            {evt.eventType === 'workspace_changed' && <span className="flex items-center gap-1.5"><Folder className="w-3.5 h-3.5 text-blue-500" /> Workspace changed</span>}
                            {evt.eventType === 'task_started' && <span className="flex items-center gap-1.5"><ClipboardList className="w-3.5 h-3.5 text-violet-500" /> Task started</span>}
                            {evt.eventType === 'idle' && <span className="flex items-center gap-1.5"><Coffee className="w-3.5 h-3.5 text-amber-500" /> Idle status entered</span>}
                            {evt.eventType === 'active' && <span className="flex items-center gap-1.5"><Radio className="w-3.5 h-3.5 text-emerald-500" /> Active status resumed</span>}
                            {evt.eventType === 'session_ended' && <span className="flex items-center gap-1.5"><PowerOff className="w-3.5 h-3.5 text-zinc-400" /> Session ended</span>}
                          </span>
                          <span className="text-[11px] text-[var(--color-muted-foreground)] font-mono">
                            {timeStr}
                          </span>
                        </div>

                        <div className="mt-1 text-[var(--color-muted-foreground)] space-y-0.5">
                          <p>
                            Tool: <strong>{getToolDisplayName(evt.tool)}</strong>
                            {evt.workspaceName && ` · Workspace: ${evt.workspaceName}`}
                          </p>
                          {evt.filePath && (
                            <p className="font-mono text-[11px] bg-[var(--color-muted)] p-1 rounded inline-block">
                              {evt.filePath}
                            </p>
                          )}
                          {evt.gitBranch && (
                            <p className="text-indigo-500 font-mono text-[11px]">
                              Branch: {evt.gitBranch}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-[var(--color-border)] flex justify-end shrink-0">
              <Button variant="outline" size="sm" onClick={() => setTimelineUser(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
