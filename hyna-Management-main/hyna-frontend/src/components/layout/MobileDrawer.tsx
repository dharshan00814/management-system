import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, FolderKanban, CheckSquare, Users, CalendarClock,
  Video, BarChart3, MessageCircle, FolderOpen, Settings,
  CalendarOff, Megaphone, X, Activity, ShieldCheck, Radio, Laptop,
  CreditCard, LogOut, User as UserIcon
} from 'lucide-react';
import { cn } from '@/lib/utils';
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
  const items: NavItem[] = [];

  // 5. Privacy & Tracking (Security): STRICTLY for CEO, CTO, COO
  if (isExec) {
    items.push({ label: 'Privacy & Tracking', icon: ShieldCheck, path: '/privacy/tracking', roles: ['admin', 'manager', 'member'] });
  }

  items.push(
    { label: 'Settings', icon: Settings, path: '/settings', roles: ['admin', 'manager', 'member'] },
  );

  return items;
};

export function MobileDrawer() {
  const { isMobileOpen, setMobileOpen } = useSidebarStore();
  const { currentUser, effectiveRole, logout } = useAuthStore();
  const location = useLocation();
  const navigate = useNavigate();

  const isExec = isExecutiveLeadership(currentUser);
  const prefix = effectiveRole === 'member' ? '/member' : effectiveRole === 'manager' ? '/manager' : '/admin';
  const navItems = getNavItems(prefix, effectiveRole, isExec).filter(item => item.roles.includes(effectiveRole));
  const bottomItems = getBottomNavItems(isExec).filter(item => item.roles.includes(effectiveRole));

  const handleLogout = async () => {
    setMobileOpen(false);
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div
      className={cn(
        "fixed inset-y-0 left-0 w-[74vw] max-w-[320px] z-10 flex flex-col justify-between select-none md:hidden",
        "px-5 py-6 sm:px-6 transition-all duration-300",
        isMobileOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
      )}
      style={{
        paddingTop: 'max(1.5rem, env(safe-area-inset-top, 1.5rem))',
        paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom, 1.5rem))'
      }}
    >
      {/* Top Header: User Profile Avatar & Close 'X' Button */}
      <div className="flex items-center justify-between pb-4 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          {currentUser ? (
            <Avatar name={currentUser.name} src={currentUser.avatar} size="md" className="border-2 border-white/20 shadow-md" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-white/15 flex items-center justify-center text-white border border-white/20">
              <UserIcon className="w-5 h-5" />
            </div>
          )}
          {currentUser && (
            <div className="min-w-0 flex-1">
              <p className="text-white font-semibold text-sm truncate leading-tight">{currentUser.name}</p>
              <p className="text-emerald-300/80 text-xs truncate mt-0.5 font-medium">
                {currentUser.designation || effectiveRole}
              </p>
            </div>
          )}
        </div>

        {/* Circular Translucent 'X' Close Button */}
        <button
          onClick={() => setMobileOpen(false)}
          className="w-9 h-9 rounded-full bg-white/12 hover:bg-white/25 active:scale-95 text-white flex items-center justify-center backdrop-blur-md border border-white/15 transition-all shadow-sm shrink-0 ml-2"
          aria-label="Close menu"
        >
          <X className="w-5 h-5 text-white" />
        </button>
      </div>

      {/* Middle Navigation Items List */}
      <nav className="flex-1 overflow-y-auto py-4 space-y-1 pr-1 -mr-1">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path || location.pathname.startsWith(item.path + '/');
          return (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={() => setMobileOpen(false)}
              className={cn(
                "flex items-center gap-3.5 px-3 py-2.5 rounded-xl text-[15px] font-medium transition-all duration-200",
                isActive
                  ? "bg-white/20 text-white font-semibold shadow-[inset_1px_1px_2px_rgba(255,255,255,0.25)] backdrop-blur-md"
                  : "text-white/80 hover:text-white hover:bg-white/10"
              )}
            >
              <item.icon className="w-5 h-5 shrink-0 text-white/90" />
              <span className="truncate">{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      {/* Bottom Section: Settings & Logout */}
      <div className="pt-3 border-t border-white/10 space-y-1 shrink-0">
        {bottomItems.map((item) => {
          const itemPath = item.path === '/settings' ? `${prefix}/settings` : item.path;
          const isActive = location.pathname === itemPath;
          return (
            <NavLink
              key={item.label}
              to={itemPath}
              onClick={() => setMobileOpen(false)}
              className={cn(
                "flex items-center gap-3.5 px-3 py-2 rounded-xl text-[14px] font-medium transition-all duration-200",
                isActive
                  ? "bg-white/20 text-white font-semibold shadow-[inset_1px_1px_2px_rgba(255,255,255,0.25)] backdrop-blur-md"
                  : "text-white/75 hover:text-white hover:bg-white/10"
              )}
            >
              <item.icon className="w-[18px] h-[18px] shrink-0 text-white/80" />
              <span className="truncate">{item.label}</span>
            </NavLink>
          );
        })}

        {/* Logout Item */}
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3.5 px-3 py-2 rounded-xl text-[14px] font-medium text-white/80 hover:text-red-300 hover:bg-red-500/15 transition-all duration-200 text-left cursor-pointer"
        >
          <LogOut className="w-[18px] h-[18px] shrink-0 text-white/80" />
          <span>Logout</span>
        </button>
      </div>
    </div>
  );
}
