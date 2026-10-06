import React from 'react';
import { ShieldCheck, ShieldAlert, Lock, EyeOff, Laptop, Clock, CheckCircle2, XCircle } from 'lucide-react';
import { Badge, Button } from '@/components/ui';

export function PrivacyTrackingPage() {
  return (
    <div className="page-container max-w-5xl">
      {/* Header */}
      <div className="page-header">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h1 className="page-title">Privacy & Activity Tracking Policy</h1>
            <p className="page-description">
              Transparent, privacy-first developer time measurement.
            </p>
          </div>
        </div>
      </div>

      {/* Core Privacy Guarantee Banner */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-emerald-500/10 via-teal-500/5 to-transparent border border-emerald-500/20 mb-8">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center shrink-0">
            <Lock className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-[var(--color-foreground)]">
              Zero Surveillance Guarantee
            </h2>
            <p className="text-sm text-[var(--color-muted-foreground)] leading-relaxed">
              Our desktop activity tracker measures only high-level developer flow time in approved IDEs (Visual Studio Code, Cursor, and Antigravity). We categorically reject invasive monitoring techniques. Your code, keystrokes, screenshots, and browsing remain 100% private to you.
            </p>
          </div>
        </div>
      </div>

      {/* Comparison Grid: What is Tracked vs What is NOT Tracked */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* Strictly NOT Tracked */}
        <div className="card p-6 border-red-500/20 bg-red-500/[0.02]">
          <div className="flex items-center gap-2.5 pb-4 border-b border-[var(--color-border)]">
            <div className="w-8 h-8 rounded-lg bg-red-500/10 text-red-500 flex items-center justify-center">
              <EyeOff className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-semibold text-red-500">What We NEVER Track</h3>
              <p className="text-xs text-[var(--color-muted-foreground)]">Strictly prohibited by design</p>
            </div>
          </div>

          <ul className="mt-4 space-y-3">
            {[
              { label: 'Keystrokes & Keylogging', desc: 'No keys, typing patterns, or inputs are recorded.' },
              { label: 'Passwords & Credentials', desc: 'Never accessed, read, or stored.' },
              { label: 'Source Code Contents', desc: 'File contents, git diffs, and code logic are never read.' },
              { label: 'Screenshots & Screen Recording', desc: 'No screen capture, camera access, or video capture.' },
              { label: 'Clipboard Contents', desc: 'Copied text and snippets are never inspected.' },
              { label: 'Personal Browsing History', desc: 'No browser tabs, web URLs, or history are monitored.' },
              { label: 'File Paths & Names', desc: 'Specific individual files opened inside your IDE are not logged.' },
              { label: 'Personal Sensitive Data', desc: 'Zero access to system directories, emails, or personal apps.' },
            ].map((item, idx) => (
              <li key={idx} className="flex items-start gap-2.5 text-sm">
                <XCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                <div>
                  <span className="font-medium text-[var(--color-foreground)]">{item.label}</span>
                  <p className="text-xs text-[var(--color-muted-foreground)]">{item.desc}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* What IS Collected */}
        <div className="card p-6 border-emerald-500/20 bg-emerald-500/[0.02]">
          <div className="flex items-center gap-2.5 pb-4 border-b border-[var(--color-border)]">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
              <Laptop className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-semibold text-emerald-600 dark:text-emerald-400">What We DO Collect</h3>
              <p className="text-xs text-[var(--color-muted-foreground)]">Only essential session summary metrics</p>
            </div>
          </div>

          <ul className="mt-4 space-y-3">
            {[
              { label: 'Authenticated User ID', desc: 'Directly linked to your verified Supabase user identity.' },
              { label: 'Supported Application Name', desc: 'Only Visual Studio Code, Cursor, or Antigravity.' },
              { label: 'Active / Idle State', desc: 'Determines if you are actively working or away from keyboard.' },
              { label: 'Session Start & End Time', desc: 'Timestamp when IDE work started and ended.' },
              { label: 'Active Duration', desc: 'Total seconds spent actively engaged in development.' },
              { label: 'Idle Duration', desc: 'Seconds of inactivity beyond the configurable idle threshold.' },
              { label: 'Optional Project / Workspace Name', desc: 'High-level repository or project folder name for attribution.' },
            ].map((item, idx) => (
              <li key={idx} className="flex items-start gap-2.5 text-sm">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <div>
                  <span className="font-medium text-[var(--color-foreground)]">{item.label}</span>
                  <p className="text-xs text-[var(--color-muted-foreground)]">{item.desc}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* How Idle Detection Works */}
      <div className="card p-6 mb-8">
        <h3 className="text-base font-semibold mb-2 flex items-center gap-2">
          <Clock className="w-4 h-4 text-[var(--color-primary)]" />
          How Active & Idle Time is Calculated
        </h3>
        <p className="text-sm text-[var(--color-muted-foreground)] mb-4 leading-relaxed">
          The desktop tracker does not poll or record every second to a remote database. Instead, it measures system idle time locally using OS-native system event counters (<code className="px-1.5 py-0.5 rounded bg-[var(--color-muted)] text-xs">powerMonitor.getSystemIdleTime()</code>).
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl bg-[var(--color-muted)]">
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">Step 1</span>
            <h4 className="font-medium text-sm mt-1">Application Focus</h4>
            <p className="text-xs text-[var(--color-muted-foreground)] mt-1">
              Tracks only when a supported development tool (VS Code, Cursor, Antigravity) is the active window.
            </p>
          </div>
          <div className="p-4 rounded-xl bg-[var(--color-muted)]">
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">Step 2</span>
            <h4 className="font-medium text-sm mt-1">Idle Threshold</h4>
            <p className="text-xs text-[var(--color-muted-foreground)] mt-1">
              Configurable threshold (default 5 minutes). Inactivity past this duration accumulates as idle time, pausing active count.
            </p>
          </div>
          <div className="p-4 rounded-xl bg-[var(--color-muted)]">
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">Step 3</span>
            <h4 className="font-medium text-sm mt-1">Aggregated Summary</h4>
            <p className="text-xs text-[var(--color-muted-foreground)] mt-1">
              Sends an aggregated session summary to Supabase. Temporary network loss is handled locally via offline storage.
            </p>
          </div>
        </div>
      </div>

      {/* RLS & Access Control Notice */}
      <div className="card p-6">
        <h3 className="text-base font-semibold mb-2">Role-Based Access Control & RLS</h3>
        <p className="text-sm text-[var(--color-muted-foreground)] leading-relaxed">
          Activity data is protected by PostgreSQL Row Level Security (RLS) policies at the database level:
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4 text-xs">
          <div className="p-3 rounded-lg border border-[var(--color-border)]">
            <strong className="block text-[var(--color-foreground)] mb-1">Members</strong>
            <span className="text-[var(--color-muted-foreground)]">
              Can view only their own personal activity. Cannot see or insert activity for others.
            </span>
          </div>
          <div className="p-3 rounded-lg border border-[var(--color-border)]">
            <strong className="block text-[var(--color-foreground)] mb-1">Managers</strong>
            <span className="text-[var(--color-muted-foreground)]">
              Can view activity only for members assigned to projects they actively manage.
            </span>
          </div>
          <div className="p-3 rounded-lg border border-[var(--color-border)]">
            <strong className="block text-[var(--color-foreground)] mb-1">Executives (CEO/CTO/COO)</strong>
            <span className="text-[var(--color-muted-foreground)]">
              Can view organization-wide aggregated analytics and productivity trends.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
