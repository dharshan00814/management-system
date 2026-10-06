import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Clock, Timer, Coffee, Laptop, ShieldCheck, RefreshCw,
  Layers, CheckCircle2, ChevronRight, GitBranch, ExternalLink,
  Calendar, FileCode, Radio, Play, Activity, Folder, ClipboardList, FileEdit, PowerOff
} from 'lucide-react';
import { StatCard, Badge, Button, LoadingState, EmptyState } from '@/components/ui';
import { useAuthStore } from '@/stores';
import {
  getMyDeveloperTodaySummary,
  getMyDeveloperIntegrations,
  getDeveloperActivityTimeline,
  getToolBrandColor,
  getToolDisplayName,
  formatTimeAgo,
} from '@/services/developerActivityService';
import { formatDurationDetailed } from '@/services/activityService';
import type { DeveloperTool, DeveloperIntegration, DeveloperActivityEvent } from '@/types/developerActivity';
import { cn, formatDate, formatTime } from '@/lib/utils';
import { toast } from 'sonner';

export function MyDeveloperActivityPage() {
  const { currentUser } = useAuthStore();
  const [summary, setSummary] = useState<{
    activeSeconds: number;
    idleSeconds: number;
    sessionCount: number;
    toolBreakdown: { tool: DeveloperTool; seconds: number; percentage: number }[];
    projectBreakdown: { projectName: string; seconds: number }[];
  }>({
    activeSeconds: 0,
    idleSeconds: 0,
    sessionCount: 0,
    toolBreakdown: [],
    projectBreakdown: [],
  });

  const [integrations, setIntegrations] = useState<DeveloperIntegration[]>([]);
  const [timelineEvents, setTimelineEvents] = useState<DeveloperActivityEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadData = async (showToast = false) => {
    try {
      if (showToast) setIsRefreshing(true);
      else setIsLoading(true);

      const [sum, ints, events] = await Promise.all([
        getMyDeveloperTodaySummary(),
        getMyDeveloperIntegrations(),
        getDeveloperActivityTimeline(currentUser?.id, 30),
      ]);

      setSummary(sum);
      setIntegrations(ints);
      setTimelineEvents(events);
      if (showToast) toast.success('Your developer activity refreshed');
    } catch (err) {
      console.warn('Failed to load my developer activity:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const todayStr = new Date().toISOString().split('T')[0];

  const toolsList: { id: DeveloperTool; name: string }[] = [
    { id: 'cursor', name: 'Cursor' },
    { id: 'vscode', name: 'Visual Studio Code' },
    { id: 'antigravity', name: 'Antigravity' },
  ];

  if (isLoading) {
    return <LoadingState message="Loading your live developer activity..." />;
  }

  return (
    <div className="page-container max-w-6xl mx-auto">
      {/* Header */}
      <div className="page-header flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="page-title">My Developer Activity</h1>
            <Badge variant="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <ShieldCheck className="w-3.5 h-3.5 mr-1" />
              Privacy Verified
            </Badge>
          </div>
          <p className="page-description">
            Transparent view of your active working telemetry, tool distribution, and shared metadata.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link to="/settings/integrations">
            <Button variant="outline" size="sm" className="gap-1.5 text-xs">
              <Laptop className="w-4 h-4 text-[var(--color-primary)]" />
              Manage IDEs
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

      {/* Today's Highlight Summary Banner */}
      <div className="card p-6 mb-8 border-l-4 border-l-[var(--color-primary)] bg-gradient-to-r from-[var(--color-primary)]/5 via-transparent to-transparent">
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-primary)]">
            Today's Session ({formatDate(todayStr)})
          </span>
          <span className="text-xs text-[var(--color-muted-foreground)]">
            {summary.sessionCount} recorded sessions
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div className="space-y-1">
            <span className="text-xs text-[var(--color-muted-foreground)] block">Active Time</span>
            <div className="text-3xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
              <Timer className="w-6 h-6" />
              {formatDurationDetailed(summary.activeSeconds)}
            </div>
          </div>

          <div className="space-y-1">
            <span className="text-xs text-[var(--color-muted-foreground)] block">Idle Time</span>
            <div className="text-3xl font-bold tracking-tight text-amber-500 flex items-center gap-2">
              <Coffee className="w-6 h-6" />
              {formatDurationDetailed(summary.idleSeconds)}
            </div>
          </div>

          <div className="space-y-1">
            <span className="text-xs text-[var(--color-muted-foreground)] block">Total Tracked Work</span>
            <div className="text-3xl font-bold tracking-tight text-[var(--color-foreground)] flex items-center gap-2">
              <Clock className="w-6 h-6" />
              {formatDurationDetailed(summary.activeSeconds + summary.idleSeconds)}
            </div>
          </div>
        </div>
      </div>

      {/* Row 2: Tools Breakdown & Connected Tools */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Tools Breakdown */}
        <div className="card p-6 lg:col-span-2 space-y-5">
          <div>
            <h2 className="text-base font-semibold mb-1">Development Tools Usage</h2>
            <p className="text-xs text-[var(--color-muted-foreground)]">
              Active development time broken down across your connected IDEs
            </p>
          </div>

          <div className="space-y-4">
            {summary.toolBreakdown.map((t) => {
              const brandColor = getToolBrandColor(t.tool);
              return (
                <div key={t.tool} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: brandColor }} />
                      {getToolDisplayName(t.tool)}
                    </span>
                    <span className="text-[var(--color-muted-foreground)]">
                      <strong className="text-[var(--color-foreground)]">{formatDurationDetailed(t.seconds)}</strong> ({t.percentage}%)
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-[var(--color-muted)] overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.min(100, t.percentage)}%`,
                        backgroundColor: brandColor,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Project Breakdown */}
          <div className="pt-4 border-t border-[var(--color-border)]">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)] mb-3">
              Projects Worked On Today
            </h3>
            {summary.projectBreakdown.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {summary.projectBreakdown.map((p, idx) => (
                  <div key={`${p.projectName}-${idx}`} className="p-3 rounded-lg bg-[var(--color-muted)] flex items-center justify-between text-xs">
                    <span className="font-medium truncate max-w-[180px]">{p.projectName}</span>
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                      {formatDurationDetailed(p.seconds)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-[var(--color-muted-foreground)] italic">
                No project workspaces mapped yet. Associate projects in your IDE connector to track time per project.
              </p>
            )}
          </div>
        </div>

        {/* Connected Tools Status Card */}
        <div className="card p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold">Connected Tools</h2>
              <Link to="/settings/integrations" className="text-xs text-[var(--color-primary)] hover:underline flex items-center gap-1">
                Configure <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
            <p className="text-xs text-[var(--color-muted-foreground)] mb-6">
              Status of your desktop IDEs paired with the platform.
            </p>

            <div className="space-y-3">
              {toolsList.map((t) => {
                const conn = integrations.find((i) => i.tool === t.id && i.status === 'connected');
                return (
                  <div
                    key={t.id}
                    className="p-3 rounded-xl border border-[var(--color-border)] flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-2.5">
                      <Laptop className="w-4 h-4 text-[var(--color-muted-foreground)]" />
                      <div>
                        <span className="font-semibold block">{t.name}</span>
                        {conn && (
                          <span className="text-[10px] text-[var(--color-muted-foreground)]">
                            {conn.deviceName}
                          </span>
                        )}
                      </div>
                    </div>

                    <div>
                      {conn ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                          Connected
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-zinc-400">
                          <span className="w-1.5 h-1.5 rounded-full bg-zinc-300 dark:bg-zinc-600" />
                          Disconnected
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="pt-6 border-t border-[var(--color-border)] mt-6">
            <Link to="/settings/integrations">
              <Button variant="outline" size="sm" className="w-full text-xs gap-1.5">
                <Radio className="w-3.5 h-3.5" />
                Connect New Environment
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Row 3: Activity Timeline matching Section 18 */}
      <div className="card p-6 mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold">Today's Activity Timeline</h2>
            <p className="text-xs text-[var(--color-muted-foreground)]">
              Chronological log of verified developer activity events recorded today
            </p>
          </div>
          <span className="text-xs text-[var(--color-muted-foreground)] font-mono">
            {timelineEvents.length} events
          </span>
        </div>

        {timelineEvents.length === 0 ? (
          <div className="p-8 text-center">
            <EmptyState
              title="No Activity Events Recorded Yet"
              description="Open Visual Studio Code, Cursor, or Antigravity to begin transmitting live development activity."
              action={
                <Link to="/settings/integrations">
                  <Button size="sm">Connect Your IDE</Button>
                </Link>
              }
            />
          </div>
        ) : (
          <div className="relative pl-6 space-y-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-[var(--color-border)]">
            {timelineEvents.map((evt, idx) => {
              const timeStr = formatTime(evt.timestamp);
              const isStart = evt.eventType === 'session_started';
              const isIdle = evt.eventType === 'idle';

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
                    <span className="font-semibold text-sm text-[var(--color-foreground)] flex items-center gap-2">
                      {evt.eventType === 'session_started' && <span className="flex items-center gap-1.5"><Play className="w-3.5 h-3.5 text-emerald-500" /> Session started</span>}
                      {evt.eventType === 'session_heartbeat' && <span className="flex items-center gap-1.5"><Activity className="w-3.5 h-3.5 text-[var(--color-primary)]" /> Heartbeat</span>}
                      {evt.eventType === 'file_activity' && <span className="flex items-center gap-1.5"><FileEdit className="w-3.5 h-3.5 text-amber-500" /> File activity</span>}
                      {evt.eventType === 'workspace_changed' && <span className="flex items-center gap-1.5"><Folder className="w-3.5 h-3.5 text-blue-500" /> Workspace opened</span>}
                      {evt.eventType === 'task_started' && <span className="flex items-center gap-1.5"><ClipboardList className="w-3.5 h-3.5 text-violet-500" /> Task started</span>}
                      {evt.eventType === 'task_changed' && <span className="flex items-center gap-1.5"><ClipboardList className="w-3.5 h-3.5 text-violet-500" /> Task updated</span>}
                      {evt.eventType === 'idle' && <span className="flex items-center gap-1.5"><Coffee className="w-3.5 h-3.5 text-amber-500" /> Idle</span>}
                      {evt.eventType === 'active' && <span className="flex items-center gap-1.5"><Radio className="w-3.5 h-3.5 text-emerald-500" /> Active</span>}
                      {evt.eventType === 'session_ended' && <span className="flex items-center gap-1.5"><PowerOff className="w-3.5 h-3.5 text-zinc-400" /> Session ended</span>}
                      <span className="text-[11px] font-normal text-[var(--color-muted-foreground)]">
                        via {getToolDisplayName(evt.tool)}
                      </span>
                    </span>
                    <span className="text-[11px] text-[var(--color-muted-foreground)] font-mono">
                      {timeStr}
                    </span>
                  </div>

                  <div className="mt-1 text-[var(--color-muted-foreground)] space-y-1">
                    {evt.workspaceName && (
                      <p>Workspace: <strong className="text-[var(--color-foreground)]">{evt.workspaceName}</strong></p>
                    )}
                    {evt.filePath && (
                      <p className="font-mono text-[11px] bg-[var(--color-muted)] px-2 py-0.5 rounded inline-block text-[var(--color-foreground)]">
                        {evt.filePath}
                      </p>
                    )}
                    {evt.gitBranch && (
                      <p className="inline-flex items-center gap-1 text-indigo-500 font-mono text-[11px] ml-2">
                        <GitBranch className="w-3 h-3" />
                        {evt.gitBranch}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Privacy Guarantee Transparency Card */}
      <div className="p-5 rounded-2xl bg-[var(--color-muted)] border border-[var(--color-border)] flex items-start gap-4">
        <ShieldCheck className="w-6 h-6 text-emerald-500 shrink-0 mt-0.5" />
        <div className="text-xs text-[var(--color-muted-foreground)] space-y-1">
          <span className="font-semibold text-[var(--color-foreground)] block text-sm">
            What your manager and executive team can see
          </span>
          <p>
            Managers and executives can see whether you are actively coding or away (active/idle), which tool you are using (VS Code, Cursor, Antigravity), the workspace/task you are working on, and safe relative file paths.
          </p>
          <p>
            They <strong>cannot</strong> see your code changes, keystrokes, personal desktop screen, terminal logs, or AI conversation queries.
          </p>
        </div>
      </div>
    </div>
  );
}
