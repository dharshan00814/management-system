import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Laptop, ShieldCheck, CheckCircle2, Copy, Check, RefreshCw,
  PowerOff, ExternalLink, Terminal, Code2, Sparkles, AlertCircle, Info, Key, X
} from 'lucide-react';
import { Button, Badge, LoadingState } from '@/components/ui';
import { useAuthStore } from '@/stores';
import {
  getMyDeveloperIntegrations,
  generateIntegrationPairingCode,
  disconnectIntegration,
  getToolBrandColor,
  getToolDisplayName,
  formatTimeAgo,
  checkDeveloperTablesExist,
} from '@/services/developerActivityService';
import type { DeveloperTool, DeveloperIntegration } from '@/types/developerActivity';
import { toast } from 'sonner';

export function ConnectIntegrationsPage() {
  const { currentUser, effectiveRole } = useAuthStore();
  const [integrations, setIntegrations] = useState<DeveloperIntegration[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [tablesMissing, setTablesMissing] = useState(false);
  const [activeModalTool, setActiveModalTool] = useState<DeveloperTool | null>(null);
  const [deviceName, setDeviceName] = useState('My Workstation');
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [generatedApiKey, setGeneratedApiKey] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);

  const prefix = effectiveRole === 'member' ? '/member' : effectiveRole === 'manager' ? '/manager' : '/admin';

  const loadIntegrations = async () => {
    try {
      setIsLoading(true);
      const exists = await checkDeveloperTablesExist();
      setTablesMissing(!exists);
      if (exists) {
        const data = await getMyDeveloperIntegrations();
        setIntegrations(data);
      } else {
        setIntegrations([]);
      }
    } catch (err) {
      console.warn('Failed to load integrations:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadIntegrations();
  }, []);

  const handleOpenConnect = (tool: DeveloperTool) => {
    setActiveModalTool(tool);
    setGeneratedCode(null);
    setGeneratedApiKey(null);
    setCopiedCode(false);
    setCopiedKey(false);
  };

  const handleGenerateCode = async () => {
    if (!activeModalTool) return;
    try {
      setIsGenerating(true);
      const res = await generateIntegrationPairingCode(activeModalTool, deviceName);
      if (res.success && res.connectionCode) {
        setGeneratedCode(res.connectionCode);
        setGeneratedApiKey(res.apiKey || null);
        toast.success(`Connection code generated for ${getToolDisplayName(activeModalTool)}`);
        loadIntegrations();
      } else {
        toast.error(res.error || 'Failed to generate connection code');
      }
    } catch (err) {
      toast.error('Unexpected error generating code');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDisconnect = async (id: string, tool: string) => {
    const success = await disconnectIntegration(id);
    if (success) {
      toast.success(`${getToolDisplayName(tool)} disconnected`);
      loadIntegrations();
    } else {
      toast.error('Failed to disconnect integration');
    }
  };

  const copyToClipboard = (text: string, type: 'code' | 'key') => {
    navigator.clipboard.writeText(text);
    if (type === 'code') {
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
      toast.success('Connection code copied to clipboard');
    } else {
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
      toast.success('API Key copied to clipboard');
    }
  };

  const getToolIntegration = (tool: DeveloperTool) => {
    return integrations.find((i) => i.tool === tool && i.status === 'connected');
  };

  const supportedTools: {
    id: DeveloperTool;
    name: string;
    description: string;
    badge: string;
    icon: React.ReactNode;
  }[] = [
    {
      id: 'vscode',
      name: 'Visual Studio Code',
      description: 'Connect your standard VS Code desktop or web environment.',
      badge: 'Official Extension',
      icon: <Code2 className="w-6 h-6 text-blue-500" />,
    },
    {
      id: 'cursor',
      name: 'Cursor',
      description: 'Connect Cursor IDE with native cursor tool tagging and telemetry.',
      badge: 'Native Compatible',
      icon: <Terminal className="w-6 h-6 text-indigo-500" />,
    },
    {
      id: 'antigravity',
      name: 'Antigravity',
      description: 'Lightweight agent connector sending verified safe activity metadata.',
      badge: 'Local Connector',
      icon: <Sparkles className="w-6 h-6 text-purple-500" />,
    },
  ];

  if (isLoading) {
    return <LoadingState message="Loading developer tool integrations..." />;
  }

  return (
    <div className="page-container max-w-5xl mx-auto">
      {/* Header */}
      <div className="page-header flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="page-title">Developer Tool Integrations</h1>
            <Badge variant="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <ShieldCheck className="w-3.5 h-3.5 mr-1" />
              Privacy Conscious
            </Badge>
          </div>
          <p className="page-description">
            Connect your development environment to automatically measure active working time and project progress.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link to="/privacy/tracking">
            <Button variant="outline" size="sm" className="gap-1.5 text-xs">
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
              Privacy Policy
            </Button>
          </Link>
          <Button variant="outline" size="sm" onClick={loadIntegrations} className="gap-1.5 text-xs">
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Missing Tables Notice Banner */}
      {tablesMissing && (
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 mb-6 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div className="text-xs text-[var(--color-muted-foreground)]">
            <span className="font-semibold text-amber-600 dark:text-amber-400 block mb-1">
              Database Setup Required: Developer Activity Tables Pending in Supabase
            </span>
            The developer activity tables have not been created yet in your Supabase project database.
            Please copy and run{' '}
            <code className="px-1.5 py-0.5 rounded bg-[var(--color-muted)] font-mono text-[var(--color-foreground)]">
              supabase/run_this_in_supabase_sql_editor.sql
            </code>{' '}
            in your <strong>Supabase Dashboard &gt; SQL Editor</strong> to activate live tracking.
          </div>
        </div>
      )}

      {/* Privacy Notice Banner */}
      <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20 mb-8 flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
        <div className="text-xs text-[var(--color-muted-foreground)]">
          <span className="font-semibold text-[var(--color-foreground)] block mb-0.5">
            Strict Privacy Guarantee: Activity Tracking, Not Surveillance
          </span>
          Hyna IDE extensions collect only high-level status (active/idle, workspace name, current project task). We
          <strong className="text-emerald-600 dark:text-emerald-400 font-semibold"> never </strong> record screens, log keystrokes, read private file contents, collect AI chat prompts, or monitor personal browsing.
        </div>
      </div>

      {/* Tool Connection Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {supportedTools.map((tool) => {
          const activeConn = getToolIntegration(tool.id);
          const brandColor = getToolBrandColor(tool.id);

          return (
            <div
              key={tool.id}
              className="card p-6 flex flex-col justify-between border-t-4 transition-all hover:shadow-md"
              style={{ borderTopColor: brandColor }}
            >
              <div>
                <div className="flex items-start justify-between mb-3">
                  <span className="flex items-center justify-center p-2 rounded-lg bg-[var(--color-muted)]">{tool.icon}</span>
                  <span className="text-[11px] font-mono font-medium px-2 py-0.5 rounded bg-[var(--color-muted)] text-[var(--color-muted-foreground)]">
                    {tool.badge}
                  </span>
                </div>
                <h3 className="font-semibold text-base mb-1">{tool.name}</h3>
                <p className="text-xs text-[var(--color-muted-foreground)] mb-6 leading-relaxed">
                  {tool.description}
                </p>
              </div>

              {activeConn ? (
                <div className="pt-4 border-t border-[var(--color-border)] space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">Connected</span>
                  </div>
                  <div className="text-xs text-[var(--color-muted-foreground)] space-y-1">
                    <p className="truncate">
                      <span className="font-medium text-[var(--color-foreground)]">Device:</span>{' '}
                      {activeConn.deviceName}
                    </p>
                    <p>
                      <span className="font-medium text-[var(--color-foreground)]">Last active:</span>{' '}
                      {formatTimeAgo(activeConn.lastSeenAt)}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-xs text-red-500 hover:text-red-600 hover:bg-red-500/10 border-red-500/20"
                    onClick={() => handleDisconnect(activeConn.id, activeConn.tool)}
                  >
                    <PowerOff className="w-3.5 h-3.5 mr-1.5" />
                    Disconnect
                  </Button>
                </div>
              ) : (
                <div className="pt-4 border-t border-[var(--color-border)]">
                  <div className="flex items-center gap-2 mb-4">
                    <span className="w-2 h-2 rounded-full bg-zinc-400" />
                    <span className="text-xs text-[var(--color-muted-foreground)]">Disconnected</span>
                  </div>
                  <Button
                    className="w-full text-xs"
                    onClick={() => handleOpenConnect(tool.id)}
                  >
                    Connect {tool.name}
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Information Sharing Breakdown */}
      <div className="card p-6 mb-8">
        <h2 className="text-base font-semibold mb-2">What Information Is Shared?</h2>
        <p className="text-xs text-[var(--color-muted-foreground)] mb-6">
          Full transparency regarding metadata sent by your development tools to the platform.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20">
            <h3 className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" />
              Allowed Information Collected
            </h3>
            <ul className="text-xs text-[var(--color-muted-foreground)] space-y-2">
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                <span><strong>Development Tool:</strong> VS Code, Cursor, or Antigravity identifier.</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                <span><strong>Active / Idle State:</strong> Heartbeat signal indicating if workstation is active or idle.</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                <span><strong>Project & Task Mapping:</strong> The Hyna project/task you manually associate in the IDE.</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                <span><strong>Workspace & Relative Path:</strong> Safe relative path (e.g., <code>src/App.tsx</code>).</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                <span><strong>Git Branch:</strong> Active branch name (e.g. <code>feature/login</code>).</span>
              </li>
            </ul>
          </div>

          <div className="p-4 rounded-xl bg-red-500/5 border border-red-500/20">
            <h3 className="text-xs font-semibold text-red-600 dark:text-red-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4" />
              Strictly Forbidden & Never Tracked
            </h3>
            <ul className="text-xs text-[var(--color-muted-foreground)] space-y-2">
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                <span><strong>No Source Code Contents:</strong> Your files and code lines remain 100% on your machine.</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                <span><strong>No Keystroke Logging:</strong> Zero keystroke or character tracking.</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                <span><strong>No Screenshots or Screen Recording:</strong> No visual captures of your display.</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                <span><strong>No Clipboard or Terminal Logs:</strong> Shell history and clipboard are ignored.</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                <span><strong>No AI Conversation Monitoring:</strong> Chat queries with Cursor/AI agents are strictly private.</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Pairing Modal */}
      {activeModalTool && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-[var(--color-card)] rounded-2xl border border-[var(--color-border)] shadow-2xl max-w-md w-full p-6 space-y-5 animate-scale-up">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--color-border)]">
              <div className="flex items-center gap-2">
                <Laptop className="w-5 h-5 text-[var(--color-primary)]" />
                <h3 className="font-semibold text-base">Connect {getToolDisplayName(activeModalTool)}</h3>
              </div>
              <button
                onClick={() => setActiveModalTool(null)}
                className="text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-[var(--color-muted-foreground)]">
              Pair your {getToolDisplayName(activeModalTool)} editor with your Hyna account using a secure, scoped connection code.
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-semibold uppercase text-[var(--color-muted-foreground)] block mb-1">
                  Device / Workstation Name
                </label>
                <input
                  type="text"
                  value={deviceName}
                  onChange={(e) => setDeviceName(e.target.value)}
                  placeholder="e.g. MacBook Pro, Office Desktop"
                  className="w-full text-xs px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] text-[var(--color-foreground)]"
                />
              </div>

              {!generatedCode ? (
                <Button
                  onClick={handleGenerateCode}
                  disabled={isGenerating}
                  className="w-full text-xs gap-1.5"
                >
                  <Key className="w-4 h-4" />
                  {isGenerating ? 'Generating Pair Code...' : 'Generate Connection Code'}
                </Button>
              ) : (
                <div className="space-y-4 pt-2">
                  <div className="p-3 rounded-xl bg-[var(--color-muted)] border border-[var(--color-border)] text-center">
                    <span className="text-[11px] uppercase tracking-wider text-[var(--color-muted-foreground)] block mb-1">
                      Your One-Time Connection Code
                    </span>
                    <div className="flex items-center justify-center gap-2">
                      <span className="font-mono text-xl font-bold tracking-wider text-[var(--color-primary)]">
                        {generatedCode}
                      </span>
                      <button
                        onClick={() => copyToClipboard(generatedCode, 'code')}
                        className="p-1.5 rounded-md hover:bg-[var(--color-card)] transition-colors"
                        title="Copy code"
                      >
                        {copiedCode ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="text-xs text-[var(--color-muted-foreground)] space-y-2.5 bg-[var(--color-card)] p-3.5 rounded-lg border border-[var(--color-border)]">
                    <span className="font-semibold text-[var(--color-foreground)] block">
                      Connect via IDE Command Palette (Recommended):
                    </span>
                    <ol className="list-decimal pl-4 space-y-1.5">
                      <li>
                        In your IDE ({getToolDisplayName(activeModalTool)}), press <kbd className="px-1.5 py-0.5 rounded bg-[var(--color-muted)] font-mono text-[10px]">Ctrl+Shift+P</kbd> (or <kbd className="px-1.5 py-0.5 rounded bg-[var(--color-muted)] font-mono text-[10px]">Cmd+Shift+P</kbd>).
                      </li>
                      <li>
                        Type and select <strong>Hyna: Connect With Code</strong>.
                      </li>
                      <li>
                        Paste the code above and press <kbd className="px-1.5 py-0.5 rounded bg-[var(--color-muted)] font-mono text-[10px]">Enter</kbd>.
                      </li>
                      <li className="text-emerald-600 dark:text-emerald-400 font-medium">
                        <strong>Automatic Terminal &amp; Disconnect:</strong> The <em>Hyna Live Tracker</em> terminal will automatically open and run live tracking in your tool. When you close or exit the IDE, tracking will automatically stop and disconnect!
                      </li>
                    </ol>

                    <div className="mt-3 pt-2.5 border-t border-[var(--color-border)] text-[11px]">
                      <span className="font-semibold text-[var(--color-foreground)] block mb-1">
                        Alternative (Auto-Connecting Terminal Command):
                      </span>
                      <p className="text-[10px] text-[var(--color-muted-foreground)] mb-1.5">
                        You can also run this single command — it will automatically connect, start live tracking, and disconnect upon exit:
                      </p>
                      <code className="block p-2 rounded bg-[var(--color-muted)] font-mono text-[10px] break-all border border-[var(--color-border)]">
                        node hyna-antigravity-connector/dist/index.js connect --code {generatedCode}
                      </code>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-[var(--color-border)] flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setActiveModalTool(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
