import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Users, Clock, Timer, Laptop, ShieldCheck, Filter,
  RefreshCw, Layers, CheckCircle2, ChevronRight, UserCheck,
  Calendar, Coffee, BarChart3, Radio
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell
} from 'recharts';
import { StatCard, Avatar, Badge, Button, LoadingState, EmptyState } from '@/components/ui';
import { useAuthStore } from '@/stores';
import {
  getTeamActivity,
  getActivitySummary,
  formatDurationDetailed,
  getApplicationColor,
  subscribeToActivitySessions,
} from '@/services/activityService';
import { getUsers } from '@/services/api';
import type { ActivitySession, ActivityFilter } from '@/types/activity';
import type { User } from '@/types';
import { cn, formatDate, formatTime } from '@/lib/utils';
import { toast } from 'sonner';

export function ManagerActivityPage() {
  const { currentUser } = useAuthStore();
  const [sessions, setSessions] = useState<ActivitySession[]>([]);
  const [teamMembers, setTeamMembers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [dateFilter, setDateFilter] = useState<'today' | '7days' | '30days' | 'all'>('7days');
  const [memberFilter, setMemberFilter] = useState<string>('all');
  const [appFilter, setAppFilter] = useState<string>('all');

  const loadTeamActivity = async (showToast = false) => {
    if (!currentUser?.id) return;
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
        userId: memberFilter !== 'all' ? memberFilter : undefined,
        application: appFilter !== 'all' ? appFilter : undefined,
      };

      const [data, allUsers] = await Promise.all([
        getTeamActivity(currentUser.id, filters),
        getUsers(),
      ]);

      setSessions(data);

      // Extract unique users appearing in team activity or cached
      const sessionUserIds = new Set(data.map((s) => s.userId));
      const relevantMembers = allUsers.filter((u) => sessionUserIds.has(u.id));
      setTeamMembers(relevantMembers);

      if (showToast) toast.success('Team activity refreshed');
    } catch (err) {
      console.warn('Failed to load team activity:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadTeamActivity();
    const unsubscribe = subscribeToActivitySessions(() => {
      loadTeamActivity(false);
    });
    return () => unsubscribe();
  }, [currentUser?.id, dateFilter, memberFilter, appFilter]);

  const summary = useMemo(() => getActivitySummary(sessions), [sessions]);

  // Aggregate stats per team member
  const memberStats = useMemo(() => {
    const map = new Map<string, { user?: User; activeSeconds: number; idleSeconds: number; sessionCount: number; latestApp: string }>();

    sessions.forEach((s) => {
      const existing = map.get(s.userId) || {
        user: s.user,
        activeSeconds: 0,
        idleSeconds: 0,
        sessionCount: 0,
        latestApp: s.application,
      };
      existing.activeSeconds += s.activeSeconds;
      existing.idleSeconds += s.idleSeconds;
      existing.sessionCount += 1;
      if (!existing.user && s.user) existing.user = s.user;
      map.set(s.userId, existing);
    });

    return Array.from(map.entries()).map(([userId, data]) => ({
      userId,
      user: data.user,
      activeSeconds: data.activeSeconds,
      idleSeconds: data.idleSeconds,
      sessionCount: data.sessionCount,
      latestApp: data.latestApp,
    })).sort((a, b) => b.activeSeconds - a.activeSeconds);
  }, [sessions]);

  if (isLoading) {
    return <LoadingState message="Loading team development activity..." />;
  }

  return (
    <div className="page-container">
      {/* Header */}
      <div className="page-header flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="page-title">Team Development Activity</h1>
            <Badge variant="bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
              Managerial Scope
            </Badge>
          </div>
          <p className="page-description">
            Monitor verified IDE productivity for members across projects you actively manage.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Link to="/manager/developer-activity">
            <Button size="sm" className="gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs">
              <Radio className="w-3.5 h-3.5 animate-pulse text-emerald-200" />
              Live Team Work
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
            onClick={() => loadTeamActivity(true)}
            disabled={isRefreshing}
            className="gap-1.5 text-xs"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', isRefreshing && 'animate-spin')} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6 p-4 rounded-xl card">
        <div className="flex flex-wrap items-center gap-3">
          {/* Date range filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-[var(--color-muted-foreground)]">Timeframe:</span>
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
                {r === 'today' ? 'Today' : r === '7days' ? 'Last 7 Days' : r === '30days' ? 'Last 30 Days' : 'All'}
              </button>
            ))}
          </div>

          {/* Member Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-[var(--color-muted-foreground)]">Member:</span>
            <select
              value={memberFilter}
              onChange={(e) => setMemberFilter(e.target.value)}
              className="text-xs px-2.5 py-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] text-[var(--color-foreground)]"
            >
              <option value="all">All Managed Members ({teamMembers.length})</option>
              {teamMembers.map((m, idx) => (
                <option key={`${m.id}-${idx}`} value={m.id}>
                  {m.name} ({m.designation || 'Member'})
                </option>
              ))}
            </select>
          </div>

          {/* Application Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-[var(--color-muted-foreground)]">App:</span>
            <select
              value={appFilter}
              onChange={(e) => setAppFilter(e.target.value)}
              className="text-xs px-2.5 py-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] text-[var(--color-foreground)]"
            >
              <option value="all">All Tools</option>
              <option value="Visual Studio Code">Visual Studio Code</option>
              <option value="Cursor">Cursor</option>
              <option value="Antigravity">Antigravity</option>
            </select>
          </div>
        </div>
      </div>

      {/* Overview Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Team Active Time"
          value={formatDurationDetailed(summary.totalActiveSeconds)}
          icon={Clock}
          iconColor="text-emerald-500"
        />
        <StatCard
          label="Team Idle Time"
          value={formatDurationDetailed(summary.totalIdleSeconds)}
          icon={Coffee}
          iconColor="text-amber-500"
        />
        <StatCard
          label="Active Contributors"
          value={memberStats.length}
          icon={UserCheck}
          iconColor="text-indigo-500"
        />
        <StatCard
          label="Total Team Sessions"
          value={summary.sessionCount}
          icon={Layers}
          iconColor="text-cyan-500"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Daily Team Hours */}
        <div className="card p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold">Team Active Development Hours</h2>
              <p className="text-xs text-[var(--color-muted-foreground)]">Combined team focus hours over time</p>
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
            {summary.dailyTrend.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={summary.dailyTrend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
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
                No activity data for this team in the selected range.
              </div>
            )}
          </div>
        </div>

        {/* Application Breakdown */}
        <div className="card p-5">
          <h2 className="text-base font-semibold mb-1">Team IDE Breakdown</h2>
          <p className="text-xs text-[var(--color-muted-foreground)] mb-4">Adoption across tools</p>

          <div className="h-44">
            {summary.appBreakdown.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={summary.appBreakdown}
                    dataKey="activeSeconds"
                    nameKey="application"
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={70}
                    paddingAngle={3}
                  >
                    {summary.appBreakdown.map((entry, index) => (
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
                No team tool usage recorded.
              </div>
            )}
          </div>

          <div className="space-y-2 mt-2">
            {summary.appBreakdown.map((app) => (
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

      {/* Team Member Performance Breakdown */}
      <div className="card mb-8 overflow-hidden">
        <div className="p-5 border-b border-[var(--color-border)]">
          <h2 className="text-base font-semibold">Team Member Activity Summary</h2>
          <p className="text-xs text-[var(--color-muted-foreground)]">
            Individual active and idle durations for members in your managed projects
          </p>
        </div>

        {memberStats.length === 0 ? (
          <div className="p-8 text-center text-xs text-[var(--color-muted-foreground)]">
            No team members have recorded development sessions in this period.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-[var(--color-muted)] text-[var(--color-muted-foreground)] text-xs uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3">Team Member</th>
                  <th className="px-5 py-3">Department</th>
                  <th className="px-5 py-3">Active Time</th>
                  <th className="px-5 py-3">Idle Time</th>
                  <th className="px-5 py-3">Sessions</th>
                  <th className="px-5 py-3">Primary IDE</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {memberStats.map((item, idx) => {
                  const name = item.user?.name || 'Team Member';
                  const designation = item.user?.designation || 'Developer';
                  const department = item.user?.department || 'Engineering';
                  return (
                    <tr key={`${item.userId}-${idx}`} className="hover:bg-[var(--color-muted)]/40 transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <Avatar name={name} size="sm" />
                          <div>
                            <span className="font-medium text-[var(--color-foreground)] block">
                              {name}
                            </span>
                            <span className="text-xs text-[var(--color-muted-foreground)]">
                              {designation}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-xs text-[var(--color-muted-foreground)]">
                        {department}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                          {formatDurationDetailed(item.activeSeconds)}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-xs text-[var(--color-muted-foreground)]">
                        {formatDurationDetailed(item.idleSeconds)}
                      </td>
                      <td className="px-5 py-3.5 text-xs text-[var(--color-foreground)] font-mono">
                        {item.sessionCount}
                      </td>
                      <td className="px-5 py-3.5">
                        <Badge variant="bg-[var(--color-muted)] text-[var(--color-foreground)] border border-[var(--color-border)]">
                          {item.latestApp}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detailed Team Sessions Log */}
      <div className="card overflow-hidden">
        <div className="p-5 border-b border-[var(--color-border)] flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">Team Activity Log</h2>
            <p className="text-xs text-[var(--color-muted-foreground)]">
              Detailed chronological records from verified development tools
            </p>
          </div>
          <span className="text-xs text-[var(--color-muted-foreground)]">
            Showing {sessions.length} sessions
          </span>
        </div>

        {sessions.length === 0 ? (
          <div className="p-8 text-center">
            <EmptyState
              title="No Team Sessions"
              description="No development activity sessions found for the current selection."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-[var(--color-muted)] text-[var(--color-muted-foreground)] text-xs uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3">Member</th>
                  <th className="px-5 py-3">Application</th>
                  <th className="px-5 py-3">Project / Workspace</th>
                  <th className="px-5 py-3">Start Time</th>
                  <th className="px-5 py-3">End Time</th>
                  <th className="px-5 py-3">Active Time</th>
                  <th className="px-5 py-3">Idle Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {sessions.map((session, idx) => {
                  const color = getApplicationColor(session.application);
                  const userName = session.user?.name || 'Team Member';
                  return (
                    <tr key={`${session.id}-${idx}`} className="hover:bg-[var(--color-muted)]/40 transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <Avatar name={userName} size="xs" />
                          <span className="font-medium text-xs text-[var(--color-foreground)]">
                            {userName}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: color }}
                          />
                          <span className="text-xs font-medium text-[var(--color-foreground)]">
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
                          <span className="italic text-[var(--color-muted-foreground)]">General Workspace</span>
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
                        <span className="font-semibold text-xs text-emerald-600 dark:text-emerald-400">
                          {formatDurationDetailed(session.activeSeconds)}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-xs text-[var(--color-muted-foreground)]">
                        {formatDurationDetailed(session.idleSeconds)}
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
