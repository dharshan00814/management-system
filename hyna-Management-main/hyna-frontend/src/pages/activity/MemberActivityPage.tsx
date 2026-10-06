import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Clock, Timer, Laptop, ShieldCheck, Filter,
  ArrowUpRight, AlertCircle, RefreshCw, Sparkles, Coffee,
  Terminal, Code2, Layers, CheckCircle2, ChevronRight, Radio
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, AreaChart, Area
} from 'recharts';
import { StatCard, Badge, Button, LoadingState, EmptyState } from '@/components/ui';
import { useAuthStore } from '@/stores';
import {
  getMyActivity,
  getActivitySummary,
  formatDurationDetailed,
  formatDurationWithSeconds,
  getApplicationColor,
  subscribeToActivitySessions,
} from '@/services/activityService';
import type { ActivitySession, ActivityFilter } from '@/types/activity';
import { cn, formatDate, formatTime } from '@/lib/utils';
import { toast } from 'sonner';

export function MemberActivityPage() {
  const { currentUser } = useAuthStore();
  const [sessions, setSessions] = useState<ActivitySession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [dateFilter, setDateFilter] = useState<'today' | '7days' | '30days' | 'all'>('7days');
  const [appFilter, setAppFilter] = useState<string>('all');

  const loadActivity = async (showToast = false) => {
    try {
      if (showToast) setIsRefreshing(true);
      else setIsLoading(true);

      const today = new Date();
      let startDate: string | undefined;

      if (dateFilter === 'today') {
        startDate = today.toISOString().split('T')[0];
      } else if (dateFilter === '7days') {
        const d = new Date(today);
        d.setDate(d.getDate() - 7);
        startDate = d.toISOString().split('T')[0];
      } else if (dateFilter === '30days') {
        const d = new Date(today);
        d.setDate(d.getDate() - 30);
        startDate = d.toISOString().split('T')[0];
      }

      const filters: ActivityFilter = {
        startDate,
        application: appFilter !== 'all' ? appFilter : undefined,
      };

      const data = await getMyActivity(filters);
      setSessions(data);
      if (showToast) toast.success('Activity updated from database');
    } catch (err) {
      console.warn('Failed to load my activity:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadActivity();
    const unsubscribe = subscribeToActivitySessions(() => {
      loadActivity(false);
    });
    return () => unsubscribe();
  }, [dateFilter, appFilter]);

  // Today's specific sessions for today's summary card
  const todayStr = new Date().toISOString().split('T')[0];
  const todaySessions = useMemo(() => {
    return sessions.filter((s) => s.startedAt && s.startedAt.startsWith(todayStr));
  }, [sessions, todayStr]);

  const todaySummary = useMemo(() => getActivitySummary(todaySessions), [todaySessions]);
  const overallSummary = useMemo(() => getActivitySummary(sessions), [sessions]);

  if (isLoading) {
    return <LoadingState message="Loading your development activity..." />;
  }

  return (
    <div className="page-container">
      {/* Header */}
      <div className="page-header flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="page-title">My Development Activity</h1>
            <Badge variant="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <ShieldCheck className="w-3.5 h-3.5 mr-1" />
              Privacy Verified
            </Badge>
          </div>
          <p className="page-description">
            Transparent active working time tracked across Visual Studio Code, Cursor, and Antigravity.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Link to="/my-activity">
            <Button size="sm" className="gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs">
              <Radio className="w-3.5 h-3.5 animate-pulse text-emerald-200" />
              My Live Activity
            </Button>
          </Link>
          <Link to="/privacy/tracking">
            <Button variant="outline" size="sm" className="gap-1.5 text-xs">
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
              Privacy Policy
            </Button>
          </Link>
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadActivity(true)}
            disabled={isRefreshing}
            className="gap-1.5 text-xs"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', isRefreshing && 'animate-spin')} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Today's Highlight Banner */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-indigo-500/10 via-purple-500/5 to-transparent border border-indigo-500/20 mb-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-primary)]">
              Today's Overview ({formatDate(todayStr)})
            </span>
            <div className="flex items-baseline gap-4 mt-2">
              <div className="text-3xl sm:text-4xl font-bold tracking-tight text-[var(--color-foreground)]">
                {formatDurationDetailed(todaySummary.totalActiveSeconds)}
              </div>
              <div className="text-sm font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                <Timer className="w-4 h-4" /> Active Development
              </div>
            </div>
            <p className="text-xs text-[var(--color-muted-foreground)] mt-1">
              Idle time: {formatDurationDetailed(todaySummary.totalIdleSeconds)} across {todaySummary.sessionCount} sessions today.
            </p>
          </div>

          {/* Quick App Badges for Today */}
          <div className="flex flex-wrap items-center gap-2">
            {todaySummary.appBreakdown.length > 0 ? (
              todaySummary.appBreakdown.map((app, idx) => (
                <div
                  key={`${app.application}-${idx}`}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[var(--color-card)] border border-[var(--color-border)] shadow-xs"
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: app.color }}
                  />
                  <div className="text-xs">
                    <span className="font-semibold block">{app.application}</span>
                    <span className="text-[var(--color-muted-foreground)]">
                      {formatDurationDetailed(app.activeSeconds)} ({app.percentage}%)
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-xs text-[var(--color-muted-foreground)] italic">
                No IDE sessions recorded today yet. Launch Hyna Desktop Tracker while coding to record active development.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-[var(--color-muted-foreground)]">Range:</span>
          {(['today', '7days', '30days', 'all'] as const).map((r) => (
            <button
              key={r}
              onClick={() => setDateFilter(r)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                dateFilter === r
                  ? 'bg-[var(--color-primary)] text-white shadow-xs'
                  : 'bg-[var(--color-muted)] text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]'
              )}
            >
              {r === 'today' ? 'Today' : r === '7days' ? 'Last 7 Days' : r === '30days' ? 'Last 30 Days' : 'All Time'}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-[var(--color-muted-foreground)]">IDE:</span>
          <select
            value={appFilter}
            onChange={(e) => setAppFilter(e.target.value)}
            className="text-xs px-2.5 py-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] text-[var(--color-foreground)]"
          >
            <option value="all">All Applications</option>
            <option value="Visual Studio Code">Visual Studio Code</option>
            <option value="Cursor">Cursor</option>
            <option value="Antigravity">Antigravity</option>
          </select>
        </div>
      </div>

      {/* Overview Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Total Active Time"
          value={formatDurationDetailed(overallSummary.totalActiveSeconds)}
          icon={Clock}
          iconColor="text-emerald-500"
        />
        <StatCard
          label="Total Idle Time"
          value={formatDurationDetailed(overallSummary.totalIdleSeconds)}
          icon={Coffee}
          iconColor="text-amber-500"
        />
        <StatCard
          label="Activity Sessions"
          value={overallSummary.sessionCount}
          icon={Layers}
          iconColor="text-indigo-500"
        />
        <StatCard
          label="Primary IDE"
          value={overallSummary.appBreakdown[0]?.application || 'None'}
          icon={Laptop}
          iconColor="text-cyan-500"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Daily Trend Chart (2 columns) */}
        <div className="card p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold">Active Development Hours Trend</h2>
              <p className="text-xs text-[var(--color-muted-foreground)]">Daily active hours over time</p>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-[var(--color-primary)] inline-block" /> Active Hours
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-amber-500/50 inline-block" /> Idle Hours
              </span>
            </div>
          </div>

          <div className="h-64">
            {overallSummary.dailyTrend.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={overallSummary.dailyTrend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.15} />
                  <XAxis dataKey="displayDate" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--color-card)',
                      borderColor: 'var(--color-border)',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                    formatter={(val: any, name: any) => [`${val} hrs`, name === 'activeHours' ? 'Active Time' : 'Idle Time']}
                  />
                  <Bar dataKey="activeHours" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="idleHours" fill="#f59e0b" radius={[4, 4, 0, 0]} opacity={0.6} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-[var(--color-muted-foreground)]">
                No activity data for the selected range.
              </div>
            )}
          </div>
        </div>

        {/* Application Breakdown Pie Chart */}
        <div className="card p-5">
          <h2 className="text-base font-semibold mb-1">IDE Distribution</h2>
          <p className="text-xs text-[var(--color-muted-foreground)] mb-4">Active time share per tool</p>

          <div className="h-44">
            {overallSummary.appBreakdown.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={overallSummary.appBreakdown}
                    dataKey="activeSeconds"
                    nameKey="application"
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={70}
                    paddingAngle={3}
                  >
                    {overallSummary.appBreakdown.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: any) => [formatDurationDetailed(Number(value)), 'Active Time']}
                    contentStyle={{
                      backgroundColor: 'var(--color-card)',
                      borderColor: 'var(--color-border)',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-[var(--color-muted-foreground)]">
                No tool usage recorded.
              </div>
            )}
          </div>

          <div className="space-y-2 mt-2">
            {overallSummary.appBreakdown.map((app) => (
              <div key={app.application} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: app.color }} />
                  <span className="font-medium">{app.application}</span>
                </div>
                <span className="text-[var(--color-muted-foreground)]">
                  {formatDurationDetailed(app.activeSeconds)} ({app.percentage}%)
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Sessions Table */}
      <div className="card overflow-hidden">
        <div className="p-5 border-b border-[var(--color-border)] flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">Recent Activity Sessions</h2>
            <p className="text-xs text-[var(--color-muted-foreground)]">
              Chronological log of verified development sessions
            </p>
          </div>
          <span className="text-xs text-[var(--color-muted-foreground)]">
            Showing {sessions.length} sessions
          </span>
        </div>

        {sessions.length === 0 ? (
          <div className="p-8 text-center">
            <EmptyState
              title="No Development Sessions Yet"
              description="Connect your Hyna Desktop Tracker while coding in VS Code, Cursor, or Antigravity to track development activity."
              action={
                <Link to="/privacy/tracking">
                  <Button size="sm">View Privacy Policy</Button>
                </Link>
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-[var(--color-muted)] text-[var(--color-muted-foreground)] text-xs uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3">Application</th>
                  <th className="px-5 py-3">Project / Workspace</th>
                  <th className="px-5 py-3">Session Start</th>
                  <th className="px-5 py-3">Session End</th>
                  <th className="px-5 py-3">Active Time</th>
                  <th className="px-5 py-3">Idle Time</th>
                  <th className="px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {sessions.map((session, idx) => {
                  const color = getApplicationColor(session.application);
                  return (
                    <tr key={`${session.id}-${idx}`} className="hover:bg-[var(--color-muted)]/40 transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: color }}
                          />
                          <span className="font-medium text-[var(--color-foreground)]">
                            {session.application}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-xs text-[var(--color-muted-foreground)]">
                        {session.projectName ? (
                          <span className="px-2 py-0.5 rounded bg-[var(--color-muted)] font-mono text-[var(--color-foreground)]">
                            {session.projectName}
                          </span>
                        ) : (
                          <span className="italic text-[var(--color-muted-foreground)]">Default Workspace</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-xs text-[var(--color-muted-foreground)]">
                        {formatTime(session.startedAt)} · {session.startedAt ? formatDate(session.startedAt) : '—'}
                      </td>
                      <td className="px-5 py-3.5 text-xs text-[var(--color-muted-foreground)]">
                        {session.endedAt
                          ? `${formatTime(session.endedAt)} · ${formatDate(session.endedAt)}`
                          : <span className="text-emerald-500 font-medium">&#9679; In Progress</span>
                        }
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                          {formatDurationDetailed(session.activeSeconds)}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-xs text-[var(--color-muted-foreground)]">
                        {formatDurationDetailed(session.idleSeconds)}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="w-3 h-3" /> Recorded
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
