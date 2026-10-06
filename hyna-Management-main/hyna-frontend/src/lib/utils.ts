import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, formatDistanceToNow, isToday, isTomorrow, isYesterday, parseISO } from 'date-fns';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(dateStr: string): string {
  const date = parseISO(dateStr);
  if (isToday(date)) return 'Today';
  if (isTomorrow(date)) return 'Tomorrow';
  if (isYesterday(date)) return 'Yesterday';
  return format(date, 'MMM d, yyyy');
}

export function formatTime(timeStr: string | null | undefined): string {
  if (!timeStr) return '—';
  // If it's an ISO datetime string (contains 'T' or 'Z'), extract the time part from it
  if (timeStr.includes('T') || timeStr.includes('Z')) {
    try {
      const date = new Date(timeStr);
      if (isNaN(date.getTime())) return '—';
      const hours = date.getHours();
      const minutes = date.getMinutes();
      const period = hours >= 12 ? 'PM' : 'AM';
      const h = hours % 12 || 12;
      return `${h}:${String(minutes).padStart(2, '0')} ${period}`;
    } catch {
      return '—';
    }
  }
  // Legacy: "HH:MM" or "HH:MM:SS" format
  const parts = timeStr.split(':').map(Number);
  if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return '—';
  const [hours, minutes] = parts;
  const period = hours >= 12 ? 'PM' : 'AM';
  const h = hours % 12 || 12;
  return `${h}:${String(minutes).padStart(2, '0')} ${period}`;
}

export function formatDateTime(dateStr: string): string {
  const date = parseISO(dateStr);
  return format(date, 'MMM d, yyyy • h:mm a');
}

export function formatRelativeTime(dateStr: string): string {
  return formatDistanceToNow(parseISO(dateStr), { addSuffix: true });
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    // Project statuses
    planning: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    active: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    'on-hold': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    completed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    // Task statuses
    backlog: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400',
    todo: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    'in-progress': 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
    'in-review': 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
    blocked: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    // Attendance
    present: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    late: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    absent: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    leave: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    // Leave
    pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    approved: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    rejected: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    // Meeting
    scheduled: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    'in-progress-meeting': 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    cancelled: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400',
  };
  return colors[status] || 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400';
}

export function getPriorityColor(priority: string): string {
  const colors: Record<string, string> = {
    low: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400',
    medium: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    high: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    urgent: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  };
  return colors[priority] || colors.medium;
}

export function getPriorityDot(priority: string): string {
  const colors: Record<string, string> = {
    low: 'bg-zinc-400',
    medium: 'bg-blue-500',
    high: 'bg-amber-500',
    urgent: 'bg-red-500',
  };
  return colors[priority] || colors.medium;
}

export const avatarColors = [
  'bg-indigo-500', 'bg-violet-500', 'bg-pink-500', 'bg-rose-500',
  'bg-red-500', 'bg-orange-500', 'bg-amber-500', 'bg-yellow-500',
  'bg-lime-500', 'bg-green-500', 'bg-emerald-500', 'bg-teal-500',
  'bg-cyan-500', 'bg-sky-500', 'bg-blue-500', 'bg-fuchsia-500',
];

export function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return avatarColors[Math.abs(hash) % avatarColors.length];
}
