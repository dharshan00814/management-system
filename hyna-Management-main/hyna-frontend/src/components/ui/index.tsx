import { cn, getInitials, getAvatarColor } from '@/lib/utils';
import {
  TrendingUp, TrendingDown, Users, FolderKanban, CheckSquare, CalendarClock,
  Clock, Loader2, AlertCircle, Inbox, X, type LucideIcon,
} from 'lucide-react';

// ============================================================
// StatCard
// ============================================================
interface StatCardProps {
  label: string;
  value: string | number;
  change?: number;
  icon: LucideIcon;
  iconColor?: string;
  className?: string;
}

export function StatCard({ label, value, change, icon: Icon, iconColor = 'text-[var(--color-primary)]', className }: StatCardProps) {
  return (
    <div className={cn('card p-5 animate-slide-up transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-lg hover:shadow-blue-500/10', className)}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-[var(--color-muted-foreground)] font-medium">{label}</p>
          <p className="text-2xl sm:text-3xl font-semibold mt-1 tracking-tight">{value}</p>
        </div>
        <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center bg-[var(--color-muted)]', iconColor)}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
      {change !== undefined && (
        <div className="flex items-center gap-1 mt-3">
          {change >= 0 ? (
            <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
          ) : (
            <TrendingDown className="w-3.5 h-3.5 text-[#FF0000]" />
          )}
          <span className={cn('text-xs font-medium', change >= 0 ? 'text-emerald-500' : 'text-[#FF0000]')}>
            {change >= 0 ? '+' : ''}{change}%
          </span>
          <span className="text-xs text-[var(--color-muted-foreground)]">vs last month</span>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Avatar
// ============================================================
interface AvatarProps {
  name: string;
  src?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const avatarSizes = {
  xs: 'w-6 h-6 text-[10px]',
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-12 h-12 text-base',
  xl: 'w-16 h-16 text-lg',
};

export function Avatar({ name, src, size = 'sm', className }: AvatarProps) {
  if (src) {
    return <img src={src} alt={name} className={cn('rounded-full object-cover', avatarSizes[size], className)} />;
  }
  return (
    <div className={cn('rounded-full flex items-center justify-center text-white font-medium shrink-0', avatarSizes[size], getAvatarColor(name), className)}>
      {getInitials(name)}
    </div>
  );
}

// ============================================================
// AvatarGroup
// ============================================================
interface AvatarGroupProps {
  names: string[];
  max?: number;
  size?: 'xs' | 'sm';
}

export function AvatarGroup({ names, max = 4, size = 'xs' }: AvatarGroupProps) {
  const visible = names.slice(0, max);
  const remaining = names.length - max;

  return (
    <div className="flex -space-x-2">
      {visible.map((name, i) => (
        <Avatar key={i} name={name} size={size} className="ring-2 ring-[var(--color-card)]" />
      ))}
      {remaining > 0 && (
        <div className={cn(
          'rounded-full flex items-center justify-center bg-[var(--color-muted)] text-[var(--color-muted-foreground)] font-medium ring-2 ring-[var(--color-card)]',
          size === 'xs' ? 'w-6 h-6 text-[10px]' : 'w-8 h-8 text-xs',
        )}>
          +{remaining}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Badge
// ============================================================
interface BadgeProps {
  children: React.ReactNode;
  variant?: string;
  className?: string;
}

export function Badge({ children, variant, className }: BadgeProps) {
  return (
    <span className={cn('badge', variant, className)}>
      {children}
    </span>
  );
}

// ============================================================
// ProgressBar
// ============================================================
interface ProgressBarProps {
  value: number;
  className?: string;
  color?: string;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

export function ProgressBar({ value, className, color, size = 'sm', showLabel = false }: ProgressBarProps) {
  const clampedValue = Math.min(100, Math.max(0, value));
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className={cn('flex-1 rounded-full bg-[var(--color-muted)] overflow-hidden', size === 'sm' ? 'h-1.5' : size === 'lg' ? 'h-3.5' : 'h-2.5')}>
        <div
          className={cn('h-full rounded-full transition-all duration-500', color || 'bg-[var(--color-primary)]')}
          style={{ width: `${clampedValue}%` }}
        />
      </div>
      {showLabel && <span className="text-xs font-medium text-[var(--color-muted-foreground)] tabular-nums w-8 text-right">{clampedValue}%</span>}
    </div>
  );
}

// ============================================================
// EmptyState
// ============================================================
interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon: Icon = Inbox, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center animate-fade-in">
      <div className="w-12 h-12 rounded-full bg-[var(--color-muted)] flex items-center justify-center mb-4">
        <Icon className="w-6 h-6 text-[var(--color-muted-foreground)]" />
      </div>
      <h3 className="text-base font-semibold">{title}</h3>
      {description && <p className="text-sm text-[var(--color-muted-foreground)] mt-1 max-w-sm">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// ============================================================
// LoadingState
// ============================================================
interface LoadingStateProps {
  message?: string;
}

export function LoadingState({ message = 'Loading...' }: LoadingStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center animate-fade-in">
      <Loader2 className="w-8 h-8 text-[var(--color-primary)] animate-spin mb-3" />
      <p className="text-sm text-[var(--color-muted-foreground)]">{message}</p>
    </div>
  );
}

// ============================================================
// ErrorState
// ============================================================
interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
}

export function ErrorState({ message = 'Something went wrong', onRetry }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center animate-fade-in">
      <div className="w-12 h-12 rounded-full bg-red-50 dark:bg-red-950/30 flex items-center justify-center mb-4">
        <AlertCircle className="w-6 h-6 text-red-500" />
      </div>
      <h3 className="text-base font-semibold">Error</h3>
      <p className="text-sm text-[var(--color-muted-foreground)] mt-1">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-4 px-4 py-2 rounded-lg bg-[var(--color-primary)] text-white text-sm font-medium hover:opacity-90 transition-opacity"
        >
          Try Again
        </button>
      )}
    </div>
  );
}

// ============================================================
// Button
// ============================================================
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
}

export function Button({ variant = 'primary', size = 'md', isLoading, className, children, disabled, ...props }: ButtonProps) {
  const variants = {
    primary: 'bg-[var(--color-primary)] text-white hover:opacity-90 shadow-sm',
    secondary: 'bg-[var(--color-secondary)] text-[var(--color-secondary-foreground)] hover:bg-[var(--color-muted)]',
    outline: 'border border-[var(--color-border)] bg-transparent hover:bg-[var(--color-muted)]',
    ghost: 'bg-transparent hover:bg-[var(--color-muted)]',
    destructive: 'bg-red-500 text-white hover:bg-red-600',
  };

  const sizes = {
    sm: 'h-8 px-3 text-xs',
    md: 'h-9 px-4 text-sm',
    lg: 'h-11 px-6 text-sm',
  };

  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none',
        variants[variant],
        sizes[size],
        className,
      )}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
      {children}
    </button>
  );
}

// ============================================================
// Input
// ============================================================
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export function Input({ label, error, className, id, ...props }: InputProps) {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');
  return (
    <div className="space-y-1.5">
      {label && <label htmlFor={inputId} className="text-sm font-medium">{label}</label>}
      <input
        id={inputId}
        className={cn(
          'w-full h-9 px-3 rounded-lg border border-[var(--color-input)] bg-transparent text-sm',
          'placeholder:text-[var(--color-muted-foreground)]',
          'focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)] focus:ring-offset-1',
          'disabled:opacity-50',
          'dark:[color-scheme:dark]',
          '[&::-webkit-calendar-picker-indicator]:dark:invert',
          error && 'border-red-500 focus:ring-red-500',
          className,
        )}
        {...props}
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

// ============================================================
// Textarea
// ============================================================
interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export function Textarea({ label, error, className, id, ...props }: TextareaProps) {
  const textareaId = id || label?.toLowerCase().replace(/\s+/g, '-');
  return (
    <div className="space-y-1.5">
      {label && <label htmlFor={textareaId} className="text-sm font-medium">{label}</label>}
      <textarea
        id={textareaId}
        className={cn(
          'w-full px-3 py-2 rounded-lg border border-[var(--color-input)] bg-transparent text-sm',
          'placeholder:text-[var(--color-muted-foreground)]',
          'focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)] focus:ring-offset-1',
          'disabled:opacity-50 resize-none',
          error && 'border-red-500 focus:ring-red-500',
          className,
        )}
        {...props}
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

// ============================================================
// Select
// ============================================================
interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'onChange'> {
  label?: string;
  options: SelectOption[];
  error?: string;
  onChange?: (value: string) => void;
}

export function Select({ label, options, error, className, id, onChange, ...props }: SelectProps) {
  const selectId = id || label?.toLowerCase().replace(/\s+/g, '-');
  return (
    <div className="space-y-1.5">
      {label && <label htmlFor={selectId} className="text-sm font-medium">{label}</label>}
      <select
        id={selectId}
        className={cn(
          'w-full h-9 px-3 rounded-lg border border-[var(--color-input)] bg-[var(--color-background)] text-sm',
          'focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)] focus:ring-offset-1',
          'disabled:opacity-50',
          error && 'border-red-500 focus:ring-red-500',
          className,
        )}
        onChange={(e) => onChange?.(e.target.value)}
        {...props}
      >
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

// ============================================================
// Modal / Dialog
// ============================================================
interface ModalProps {
  isOpen?: boolean;
  open?: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  footer?: React.ReactNode;
}

export function Modal({ isOpen, open, onClose, title, children, size = 'md', footer }: ModalProps) {
  const visible = isOpen ?? open ?? false;
  if (!visible) return null;

  const sizes = {
    sm: 'max-w-sm',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" onClick={onClose}>
      <div className="fixed inset-0 bg-black/50 animate-fade-in" />
      <div
        className={cn('relative w-full card rounded-xl shadow-xl animate-scale-in overflow-hidden', sizes[size])}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)]">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[var(--color-muted)] transition-colors text-[var(--color-muted-foreground)]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="px-6 py-4 max-h-[calc(100vh-200px)] overflow-y-auto">
          {children}
        </div>
        {footer && (
          <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-[var(--color-border)]">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Tabs
// ============================================================
interface TabsProps {
  tabs: { value: string; label: string; count?: number }[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function Tabs({ tabs, value, onChange, className }: TabsProps) {
  return (
    <div className={cn('flex gap-1 p-1 rounded-lg bg-[var(--color-muted)]', className)}>
      {tabs.map(tab => (
        <button
          key={tab.value}
          onClick={() => onChange(tab.value)}
          className={cn(
            'px-3 py-1.5 rounded-md text-sm font-medium transition-all',
            value === tab.value
              ? 'bg-[var(--color-card)] text-[var(--color-foreground)] shadow-sm'
              : 'text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]',
          )}
        >
          {tab.label}
          {tab.count !== undefined && (
            <span className={cn(
              'ml-1.5 text-xs',
              value === tab.value ? 'text-[var(--color-muted-foreground)]' : 'text-[var(--color-muted-foreground)]',
            )}>
              {tab.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
