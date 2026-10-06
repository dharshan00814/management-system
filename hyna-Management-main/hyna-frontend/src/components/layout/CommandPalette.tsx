import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, FolderKanban, CheckSquare, Users, Video, FileText, MessageCircle, Settings, BarChart3, Activity, ShieldCheck, Radio, Laptop } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore, isExecutiveLeadership } from '@/stores';
import { getProjects, getTasks, getUsers, getMeetings } from '@/services/api';
import type { Project, Task, User, Meeting } from '@/types';

interface SearchResult {
  id: string;
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  path: string;
  category: string;
}

export function CommandPalette() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { currentRole, effectiveRole, currentUser, activeOrganization } = useAuthStore();
  const prefix = effectiveRole === 'member' ? '/member' : effectiveRole === 'manager' ? '/manager' : '/admin';
  const isExec = isExecutiveLeadership(currentUser);

  useEffect(() => {
    if (isOpen) {
      getProjects().then(setProjects);
      getTasks().then(setTasks);
      if (isExec) {
        getUsers().then(setUsers);
      }
      getMeetings().then(setMeetings);
    }
  }, [isOpen, isExec]);

  useEffect(() => {
    const handler = () => setIsOpen(true);
    window.addEventListener('open-command-palette', handler);
    return () => window.removeEventListener('open-command-palette', handler);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const getResults = (): SearchResult[] => {
    if (!query.trim()) {
      const defaultPages: SearchResult[] = [
        { id: 'nav-dashboard', title: 'Dashboard', subtitle: 'Go to dashboard', icon: BarChart3, path: `${prefix}/dashboard`, category: 'Pages' },
        { id: 'nav-projects', title: 'Projects', subtitle: 'View all projects', icon: FolderKanban, path: `${prefix}/projects`, category: 'Pages' },
        { id: 'nav-tasks', title: 'Tasks', subtitle: 'Manage tasks', icon: CheckSquare, path: `${prefix}/tasks`, category: 'Pages' },
      ];

      // Live Developers & Activity Tracking: Only CEO, CTO, COO
      if (isExec) {
        defaultPages.push(
          { id: 'nav-live-devs', title: 'Live Developer Activity', subtitle: 'Live telemetry across VS Code, Cursor & Antigravity', icon: Radio, path: `${prefix}/developer-activity`, category: 'Pages' },
        );
      }

      defaultPages.push(
        { id: 'nav-integrations', title: 'IDE Integrations', subtitle: 'Pair VS Code, Cursor, or Antigravity', icon: Laptop, path: '/settings/integrations', category: 'Pages' },
      );

      if (isExec) {
        defaultPages.push(
          { id: 'nav-activity', title: 'Activity Tracking', subtitle: 'Development time in VS Code, Cursor & Antigravity', icon: Activity, path: `${prefix}/activity`, category: 'Pages' },
        );
      }

      defaultPages.push(
        { id: 'nav-meetings', title: 'Meetings', subtitle: 'View meetings', icon: Video, path: `${prefix}/meetings`, category: 'Pages' },
        { id: 'nav-messages', title: 'Messages', subtitle: 'Open messages', icon: MessageCircle, path: `${prefix}/messages`, category: 'Pages' },
      );

      // Files & Privacy Tracking: Only CEO, CTO, COO
      if (isExec) {
        defaultPages.push(
          { id: 'nav-files', title: 'Files', subtitle: 'Browse files', icon: FileText, path: `${prefix}/files`, category: 'Pages' },
          { id: 'nav-privacy', title: 'Privacy & Tracking Policy', subtitle: 'View data collection transparency', icon: ShieldCheck, path: '/privacy/tracking', category: 'Pages' },
        );
      }

      defaultPages.push(
        { id: 'nav-settings', title: 'Settings', subtitle: 'App settings', icon: Settings, path: `${prefix}/settings`, category: 'Pages' },
      );

      return defaultPages;
    }

    const q = query.toLowerCase();
    const results: SearchResult[] = [];

    projects
      .filter(p => p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q))
      .slice(0, 5)
      .forEach(p => results.push({
        id: `project-${p.id}`, title: p.name, subtitle: p.description.slice(0, 60), icon: FolderKanban, path: `${prefix}/projects/${p.id}`, category: 'Projects',
      }));

    tasks
      .filter(t => t.title.toLowerCase().includes(q))
      .slice(0, 5)
      .forEach(t => results.push({
        id: `task-${t.id}`, title: t.title, subtitle: `${t.status} · ${t.priority}`, icon: CheckSquare, path: `${prefix}/tasks`, category: 'Tasks',
      }));

    // Members searching: Restricted to CEO, CTO, COO
    if (isExec) {
      users
        .filter(u => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
        .slice(0, 5)
        .forEach(u => results.push({
          id: `user-${u.id}`, title: u.name, subtitle: u.designation, icon: Users, path: `${prefix}/members/${u.id}`, category: 'Members',
        }));
    }

    meetings
      .filter(m => m.title.toLowerCase().includes(q))
      .slice(0, 3)
      .forEach(m => results.push({
        id: `meeting-${m.id}`, title: m.title, subtitle: `${m.date} · ${m.startTime}`, icon: Video, path: `${prefix}/meetings/${m.id}`, category: 'Meetings',
      }));

    return results;
  };

  const results = getResults();

  const handleSelect = (result: SearchResult) => {
    navigate(result.path);
    setIsOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && results[selectedIndex]) {
      handleSelect(results[selectedIndex]);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  if (!isOpen) return null;

  let lastCategory = '';

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh]" onClick={() => setIsOpen(false)}>
      <div className="fixed inset-0 bg-black/50 animate-fade-in" />
      <div
        className="relative w-full max-w-lg mx-4 card rounded-xl shadow-2xl animate-scale-in overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 h-14 border-b border-[var(--color-border)]">
          <Search className="w-5 h-5 text-[var(--color-muted-foreground)] shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelectedIndex(0); }}
            onKeyDown={handleKeyDown}
            placeholder={`Search ${activeOrganization}...`}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--color-muted-foreground)]"
          />
          <kbd className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-[var(--color-muted)] text-[var(--color-muted-foreground)] border border-[var(--color-border)]">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto py-2">
          {results.length === 0 ? (
            <p className="text-sm text-[var(--color-muted-foreground)] text-center py-8">No results found</p>
          ) : (
            results.map((result, idx) => {
              const showCategory = result.category !== lastCategory;
              lastCategory = result.category;
              return (
                <div key={result.id}>
                  {showCategory && (
                    <p className="px-4 py-1.5 text-[11px] font-medium text-[var(--color-muted-foreground)] uppercase tracking-wider">
                      {result.category}
                    </p>
                  )}
                  <button
                    onClick={() => handleSelect(result)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    className={cn(
                      'flex items-center gap-3 w-full px-4 py-2.5 text-left transition-colors',
                      idx === selectedIndex ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]' : 'hover:bg-[var(--color-muted)]',
                    )}
                  >
                    <result.icon className="w-4 h-4 shrink-0 opacity-60" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{result.title}</p>
                      <p className="text-xs text-[var(--color-muted-foreground)] truncate">{result.subtitle}</p>
                    </div>
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-4 px-4 py-2 border-t border-[var(--color-border)] text-[11px] text-[var(--color-muted-foreground)]">
          <span>↑↓ Navigate</span>
          <span>↵ Select</span>
          <span>ESC Close</span>
        </div>
      </div>
    </div>
  );
}
