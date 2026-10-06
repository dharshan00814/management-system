import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, FolderKanban, CheckSquare, Users, CalendarClock,
  Video, BarChart3, MessageCircle, FolderOpen, Settings, ChevronLeft,
  CalendarOff, Megaphone, X, Hexagon, Activity, ShieldCheck, Radio, Laptop,
  CreditCard
} from 'lucide-react';
import { cn, getInitials, getAvatarColor } from '@/lib/utils';
import { useSidebarStore, useAuthStore, isExecutiveLeadership } from '@/stores';
import { Avatar } from '@/components/ui';
import type { UserRole } from '@/types';

interface NavItem {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  path: string;
  roles: UserRole[];
}

const getActivityLabel = (role: string) => {
  if (role === 'admin') return 'Activity Analytics';
  if (role === 'manager') return 'Team Activity';
  return 'My Activity';
};

const getLiveActivityLabel = (role: string) => {
  if (role === 'admin') return 'Live Developers';
  if (role === 'manager') return 'Live Team Work';
  return 'My Live Activity';
};

const getLiveActivityPath = (role: string) => {
  if (role === 'admin') return '/admin/developer-activity';
  if (role === 'manager') return '/manager/developer-activity';
  return '/my-activity';
};

const getNavItems = (prefix: string, role: string, isExec: boolean): NavItem[] => {
  const items: NavItem[] = [
    { label: 'Dashboard', icon: LayoutDashboard, path: `${prefix}/dashboard`, roles: ['admin', 'manager', 'member'] },
    { label: 'Projects', icon: FolderKanban, path: `${prefix}/projects`, roles: ['admin', 'manager', 'member'] },
    { label: 'Tasks', icon: CheckSquare, path: `${prefix}/tasks`, roles: ['admin', 'manager', 'member'] },
  ];

  // 1. Members: STRICTLY for CEO, CTO, COO
  if (isExec) {
    items.push({ label: 'Members', icon: Users, path: `${prefix}/members`, roles: ['admin', 'manager', 'member'] });
  }

  items.push({ label: 'Attendance', icon: CalendarClock, path: `${prefix}/attendance`, roles: ['admin', 'manager', 'member'] });

  // 2. Live Developers & 3. Activity Analytics: STRICTLY for CEO, CTO, COO
  if (isExec) {
    items.push({ label: getLiveActivityLabel(role), icon: Radio, path: getLiveActivityPath(role), roles: ['admin', 'manager', 'member'] });
    items.push({ label: getActivityLabel(role), icon: Activity, path: `${prefix}/activity`, roles: ['admin', 'manager', 'member'] });
  }

  items.push(
    { label: 'Meetings', icon: Video, path: `${prefix}/meetings`, roles: ['admin', 'manager', 'member'] },
    { label: 'Reports', icon: BarChart3, path: `${prefix}/reports`, roles: ['admin', 'manager', 'member'] }
  );

  items.push(
    { label: 'Leave', icon: CalendarOff, path: `${prefix}/leave`, roles: ['admin', 'manager', 'member'] },
    { label: 'Announcements', icon: Megaphone, path: `${prefix}/announcements`, roles: ['admin', 'manager'] },
  );

  return items;
};

const getBottomNavItems = (isExec: boolean): NavItem[] => {
  const items: NavItem[] = [
    { label: 'IDE Integrations', icon: Laptop, path: '/settings/integrations', roles: ['admin', 'manager', 'member'] },
  ];

  // 5. Privacy & Tracking (Security): STRICTLY for CEO, CTO, COO
  if (isExec) {
    items.push({ label: 'Privacy & Tracking', icon: ShieldCheck, path: '/privacy/tracking', roles: ['admin', 'manager', 'member'] });
  }

  items.push(
    { label: 'Settings', icon: Settings, path: '/settings', roles: ['admin', 'manager', 'member'] },
  );

  return items;
};

export function Sidebar() {
  const { isCollapsed, isMobileOpen, toggle, setMobileOpen } = useSidebarStore();
  const { currentUser, effectiveRole, activeOrganization } = useAuthStore();
  const location = useLocation();

  const isExec = isExecutiveLeadership(currentUser);
  const prefix = effectiveRole === 'member' ? '/member' : effectiveRole === 'manager' ? '/manager' : '/admin';
  const navItems = getNavItems(prefix, effectiveRole, isExec).filter(item => item.roles.includes(effectiveRole));
  const bottomItems = getBottomNavItems(isExec).filter(item => item.roles.includes(effectiveRole));

  return (
    <>
      {/* Sidebar - Desktop only */}
      <aside
        className={cn(
          'fixed top-0 left-0 z-30 h-full flex flex-col border-r transition-all duration-200',
          'bg-[var(--color-sidebar-bg)] border-[var(--color-sidebar-border)]',
          // Desktop
          'hidden md:flex',
          isCollapsed ? 'w-[68px]' : 'w-[260px]',
        )}
      >
        {/* Logo area */}
        <div className={cn(
          'flex items-center h-16 border-b border-[var(--color-sidebar-border)] shrink-0',
          isCollapsed ? 'justify-center px-2' : 'px-5',
        )}>
          <div className="flex items-center gap-2.5 min-w-0">
            <img 
              src={activeOrganization && activeOrganization.toLowerCase() !== 'hyna studio' 
                ? `https://ui-avatars.com/api/?name=${encodeURIComponent(activeOrganization)}&background=14161c&color=bbf451&bold=true` 
                : "/logo.png"} 
              alt={`${activeOrganization} Logo`} 
              className={cn(
                "w-8 h-8 object-contain shrink-0",
                activeOrganization && activeOrganization.toLowerCase() !== 'hyna studio' && "rounded-lg"
              )} 
            />
            {!isCollapsed && (
              <div className="min-w-0">
                <h1 className="text-sm font-semibold truncate">{activeOrganization}</h1>
                <p className="text-[10px] text-[var(--color-muted-foreground)] leading-none">Management</p>
              </div>
            )}
          </div>
          {/* Collapse toggle - desktop */}
          <button
            onClick={toggle}
            className={cn(
              'hidden md:flex items-center justify-center w-6 h-6 rounded-md ml-auto',
              'text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]',
              'hover:bg-[var(--color-muted)] transition-colors',
              isCollapsed && 'ml-0',
            )}
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <ChevronLeft className={cn('w-4 h-4 transition-transform', isCollapsed && 'rotate-180')} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-0.5">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path || location.pathname.startsWith(item.path + '/');
            return (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={() => setMobileOpen(false)}
                title={isCollapsed ? item.label : undefined}
                className={cn(
                  'flex items-center gap-3 rounded-lg text-sm font-medium transition-colors',
                  isCollapsed ? 'justify-center w-11 h-11 mx-auto' : 'px-3 py-2.5',
                  isActive
                    ? 'bg-[var(--color-primary)] text-white shadow-sm'
                    : 'text-[var(--color-muted-foreground)] hover:text-blue-500 hover:bg-blue-500/10',
                )}
              >
                <item.icon className={cn('shrink-0', isCollapsed ? 'w-5 h-5' : 'w-[18px] h-[18px]')} />
                {!isCollapsed && <span className="truncate">{item.label}</span>}
              </NavLink>
            );
          })}
        </nav>

        {/* Bottom section */}
        <div className="border-t border-[var(--color-sidebar-border)] p-3 space-y-1 shrink-0 pb-16 md:pb-3">
          {bottomItems.map((item) => {
            const itemPath = `${prefix}${item.path}`;
            const isActive = location.pathname === itemPath;
            return (
              <NavLink
                key={item.label}
                to={itemPath}
                onClick={() => setMobileOpen(false)}
                title={isCollapsed ? item.label : undefined}
                className={cn(
                  'flex items-center gap-3 rounded-lg text-sm font-medium transition-colors',
                  isCollapsed ? 'justify-center w-11 h-11 mx-auto' : 'px-3 py-2.5',
                  isActive
                    ? 'bg-[var(--color-primary)] text-white shadow-sm'
                    : 'text-[var(--color-muted-foreground)] hover:text-blue-500 hover:bg-blue-500/10',
                )}
              >
                <item.icon className={cn('shrink-0', isCollapsed ? 'w-5 h-5' : 'w-[18px] h-[18px]')} />
                {!isCollapsed && <span>{item.label}</span>}
              </NavLink>
            );
          })}


          {/* User profile */}
          {currentUser && (
            <div className={cn(
              'flex items-center gap-3 rounded-lg p-2 mt-2',
              isCollapsed && 'justify-center p-0',
            )}>
              <Avatar name={currentUser.name} src={currentUser.avatar} size="sm" />
              {!isCollapsed && (
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{currentUser.name}</p>
                  <p className="text-xs text-[var(--color-muted-foreground)] truncate">
                    {currentUser.designation || effectiveRole}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </aside>

    </>
  );
}
