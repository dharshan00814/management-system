import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Users, Clock, Timer, Laptop, ShieldCheck, Filter, Download,
  RefreshCw, Layers, CheckCircle2, ChevronRight, UserCheck,
  Calendar, Coffee, BarChart3, PieChart as PieIcon, TrendingUp, Search, AlertCircle, Radio
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, AreaChart, Area, Legend
} from 'recharts';
import { StatCard, Avatar, Badge, Button, LoadingState, EmptyState } from '@/components/ui';
import { useAuthStore } from '@/stores';
import {
  getOrganizationActivity,
  getActivitySummary,
  formatDurationDetailed,
  getApplicationColor,
  subscribeToActivitySessions,
} from '@/services/activityService';
import { getUsers, getProjects } from '@/services/api';
import type { ActivitySession, ActivityFilter } from '@/types/activity';
import type { User, Project } from '@/types';
import { cn, formatDate, formatTime } from '@/lib/utils';
import { toast } from 'sonner';

export function AdminActivityPage() {
  const { currentUser } = useAuthStore();
  const [sessions, setSessions] = useState<ActivitySession[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Filters
  const [dateFilter, setDateFilter] = useState<'today' | '7days' | '30days' | 'all'>('7days');
  const [userFilter, setUserFilter] = useState<string>('all');
  const [appFilter, setAppFilter] = useState<string>('all');
  const [projectSearch, setProjectSearch] = useState<string>('');

  const loadData = async (showToast = false) => {
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
        userId: userFilter !== 'all' ? userFilter : undefined,
        application: appFilter !== 'all' ? appFilter : undefined,
        projectName: projectSearch.trim() || undefined,
      };

      const [activityData, allUsers, allProjects] = await Promise.all([
        getOrganizationActivity(filters),
        getUsers(),
        getProjects(),
      ]);

      setSessions(activityData);
      setUsers(allUsers);
      setProjects(allProjects);

      if (showToast) toast.success('Organization activity refreshed');
    } catch (err) {
      console.warn('Failed to load organization activity:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
    const unsubscribe = subscribeToActivitySessions(() => {
      loadData(false);
    });
    return () => unsubscribe();
  }, [dateFilter, userFilter, appFilter, projectSearch]);

  const summary = useMemo(() => getActivitySummary(sessions), [sessions]);

  // Export to CSV
  const handleExportCSV = () => {
    if (sessions.length === 0) {
      toast.error('No activity sessions to export');
      return;
    }

    const headers = ['Session ID', 'User Name', 'User Email', 'Application', 'Project', 'Start Time', 'End Time', 'Active Seconds', 'Idle Seconds'];
    const rows = sessions.map((s) => [
      s.id,
      `"${s.user?.name || 'Team Member'}"`,
      `"${s.user?.email || ''}"`,
      `"${s.application}"`,
      `"${s.projectName || 'Default Workspace'}"`,
      s.startedAt,
      s.endedAt,
      s.activeSeconds,
      s.idleSeconds,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `hyna_activity_report_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Activity report exported to CSV');
  };

  if (isLoading) {
    return <LoadingState message="Loading organization activity analytics..." />;
  }

  return (
    <div className="page-container">
      {/* Header */}
      <div className="page-header flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="page-title">Activity Analytics</h1>
            <Badge variant="bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
              Executive View
            </Badge>
          </div>
          <p className="page-description">
            Organization-wide developer productivity and tool metrics across Visual Studio Code, Cursor, and Antigravity.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Link to="/admin/developer-activity">
            <Button size="sm" className="gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs">
              <Radio className="w-3.5 h-3.5 animate-pulse text-emerald-200" />
              Live Developer Board
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
            onClick={handleExportCSV}
            className="gap-1.5 text-xs"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </Button>
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

      {/* Filter Toolbar */}
      <div className="card p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {/* Timeframe */}
          <div>
            <label className="text-[11px] font-semibold text-[var(--color-muted-foreground)] uppercase tracking-wider block mb-1.5">
              Timeframe
            </label>
            <div className="grid grid-cols-4 gap-1">
              {(['today', '7days', '30days', 'all'] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setDateFilter(r)}
                  className={cn(
                    'py-1.5 text-xs rounded-lg font-medium transition-colors text-center',
                    dateFilter === r
                      ? 'bg-[var(--color-primary)] text-white shadow-xs'
                      : 'bg-[var(--color-muted)] text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]'
                  )}
                >
                  {r === 'today' ? 'Today' : r === '7days' ? '7D' : r === '30days' ? '30D' : 'All'}
                </button>
              ))}
            </div>
          </div>

          {/* User selector */}
          <div>
            <label className="text-[11px] font-semibold text-[var(--color-muted-foreground)] uppercase tracking-wider block mb-1.5">
              Team Member
            </label>
            <select
              value={userFilter}
              onChange={(e) => setUserFilter(e.target.value)}
              className="w-full text-xs px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] text-[var(--color-foreground)]"
            >
              <option value="all">All Members ({users.length})</option>
              {users.map((u, idx) => (
                <option key={`${u.id}-${idx}`} value={u.id}>
                  {u.name} · {u.department || 'Engineering'}
                </option>
              ))}
            </select>
          </div>

          {/* Application selector */}
          <div>
            <label className="text-[11px] font-semibold text-[var(--color-muted-foreground)] uppercase tracking-wider block mb-1.5">
              Development Tool
            </label>
            <select
              value={appFilter}
              onChange={(e) => setAppFilter(e.target.value)}
              className="w-full text-xs px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] text-[var(--color-foreground)]"
            >
              <option value="all">All Applications</option>
              <option value="Visual Studio Code">Visual Studio Code</option>
              <option value="Cursor">Cursor</option>
              <option value="Antigravity">Antigravity</option>
            </select>
          </div>

          {/* Project search */}
          <div>
            <label className="text-[11px] font-semibold text-[var(--color-muted-foreground)] uppercase tracking-wider block mb-1.5">
              Project / Workspace
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="Filter by workspace..."
                value={projectSearch}
                onChange={(e) => setProjectSearch(e.target.value)}
                className="w-full text-xs pl-8 pr-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] text-[var(--color-foreground)]"
              />
              <Search className="w-3.5 h-3.5 text-[var(--color-muted-foreground)] absolute left-2.5 top-2.5" />
            </div>
          </div>
        </div>
      </div>

      {/* Overview Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Total Active Time"
          value={formatDurationDetailed(summary.totalActiveSeconds)}
          icon={Clock}
          iconColor="text-emerald-500"
        />
        <StatCard
          label="Total Idle Time"
          value={formatDurationDetailed(summary.totalIdleSeconds)}
          icon={Coffee}
          iconColor="text-amber-500"
        />
        <StatCard
          label="Active Sessions"
          value={summary.sessionCount}
          icon={Layers}
          iconColor="text-indigo-500"
        />
        <StatCard
          label="Top Application"
          value={summary.appBreakdown[0] ? `${summary.appBreakdown[0].application} (${summary.appBreakdown[0].percentage}%)` : 'None'}
          icon={Laptop}
          iconColor="text-cyan-500"
        />
      </div>

      {/* Charts Row 1: Daily Active Hours & Weekly Trend */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Daily Active Hours */}
        <div className="card p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold">Daily Active Hours Trend</h2>
              <p className="text-xs text-[var(--color-muted-foreground)]">Aggregated active coding time vs idle time</p>
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
                No activity recorded in the selected period.
              </div>
            )}
          </div>
        </div>

        {/* Active vs Idle Distribution */}
        <div className="card p-5">
          <h2 className="text-base font-semibold mb-1">Active vs Idle Ratio</h2>
          <p className="text-xs text-[var(--color-muted-foreground)] mb-4">Ratio of active coding to away time</p>

          <div className="h-44">
            {summary.totalDurationSeconds > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={summary.activeVsIdle}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={70}
                    paddingAngle={3}
                  >
                    {summary.activeVsIdle.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: any) => [`${value} min`, 'Duration']}
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
                No activity data.
              </div>
            )}
          </div>

          <div className="space-y-2 mt-2">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                <span className="font-medium">Active Working</span>
              </span>
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                {summary.totalDurationSeconds > 0 ? Math.round((summary.totalActiveSeconds / summary.totalDurationSeconds) * 100) : 0}%
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                <span className="font-medium">Idle / Away</span>
              </span>
              <span className="font-semibold text-amber-600 dark:text-amber-400">
                {summary.totalDurationSeconds > 0 ? Math.round((summary.totalIdleSeconds / summary.totalDurationSeconds) * 100) : 0}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Application Usage Breakdown Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        {['Visual Studio Code', 'Cursor', 'Antigravity'].map((appName) => {
          const appStat = summary.appBreakdown.find((a) => a.application.toLowerCase().includes(appName.toLowerCase()));
          const color = getApplicationColor(appName);
          return (
            <div key={appName} className="card p-5 border-l-4" style={{ borderLeftColor: color }}>
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-sm">{appName}</h3>
                <span className="text-xs font-mono font-medium px-2 py-0.5 rounded bg-[var(--color-muted)]">
                  {appStat?.percentage || 0}%
                </span>
              </div>
              <div className="text-2xl font-bold tracking-tight">
                {formatDurationDetailed(appStat?.activeSeconds || 0)}
              </div>
              <p className="text-xs text-[var(--color-muted-foreground)] mt-1">
                {appStat?.sessionCount || 0} recorded sessions
              </p>
            </div>
          );
        })}
      </div>

      {/* Detailed Activity Table */}
      <div className="card overflow-hidden">
        <div className="p-5 border-b border-[var(--color-border)] flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">Detailed Activity Sessions</h2>
            <p className="text-xs text-[var(--color-muted-foreground)]">
              Real-time audit log of authenticated developer activity
            </p>
          </div>
          <span className="text-xs text-[var(--color-muted-foreground)] font-mono">
            {sessions.length} sessions
          </span>
        </div>

        {sessions.length === 0 ? (
          <div className="p-8 text-center">
            <EmptyState
              title="No Activity Sessions Found"
              description="No development sessions match your current filter parameters."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-[var(--color-muted)] text-[var(--color-muted-foreground)] text-xs uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3">User</th>
                  <th className="px-5 py-3">Application</th>
                  <th className="px-5 py-3">Project / Workspace</th>
                  <th className="px-5 py-3">Start Time</th>
                  <th className="px-5 py-3">End Time</th>
                  <th className="px-5 py-3">Active Time</th>
                  <th className="px-5 py-3">Idle Time</th>
                  <th className="px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {sessions.map((session, idx) => {
                  const color = getApplicationColor(session.application);
                  const userName = session.user?.name || 'Team Member';
                  const userRole = session.user?.role || 'member';
                  return (
                    <tr key={`${session.id}-${idx}`} className="hover:bg-[var(--color-muted)]/40 transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <Avatar name={userName} size="sm" />
                          <div>
                            <span className="font-medium text-[var(--color-foreground)] block">
                              {userName}
                            </span>
                            <span className="text-xs text-[var(--color-muted-foreground)]">
                              {session.user?.designation || userRole}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: color }}
                          />
                          <span className="font-medium text-xs text-[var(--color-foreground)]">
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
                          : <span className="inline-flex items-center gap-1 text-emerald-500 font-medium"><Radio className="w-3 h-3 animate-pulse" />In Progress</span>
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
                      <td className="px-5 py-3.5">
                        <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="w-3 h-3" /> Synced
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
