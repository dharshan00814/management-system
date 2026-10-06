import { NavLink, useLocation } from 'react-router-dom';
import { LayoutDashboard, CheckSquare, MessageCircle, FolderKanban, Video } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore, useSidebarStore } from '@/stores';

export function MobileBottomNav() {
  const { effectiveRole } = useAuthStore();
  const { isMobileOpen } = useSidebarStore();
  const location = useLocation();

  // Hide the floating bottom nav when the mobile sidebar drawer is open
  if (isMobileOpen) {
    return null;
  }

  const prefix = effectiveRole === 'member' ? '/member' : effectiveRole === 'manager' ? '/manager' : '/admin';

  const leftItems = [
    { label: 'Home', icon: LayoutDashboard, path: `${prefix}/dashboard` },
    { label: 'Projects', icon: FolderKanban, path: `${prefix}/projects` },
  ];

  const centerItem = {
    label: 'Meeting',
    icon: Video,
    path: `${prefix}/meetings`,
  };

  const rightItems = [
    { label: 'Tasks', icon: CheckSquare, path: `${prefix}/tasks` },
    { label: 'Messages', icon: MessageCircle, path: `${prefix}/messages` },
  ];

  const isCenterActive =
    location.pathname === centerItem.path ||
    location.pathname.startsWith(centerItem.path + '/') ||
    location.pathname.startsWith('/meeting/') ||
    location.pathname.startsWith('/meetings');

  return (
    <nav
      className={cn(
        "fixed bottom-2.5 left-2.5 right-2.5 sm:left-4 sm:right-4 z-50 flex md:hidden items-center justify-between",
        "max-w-md mx-auto px-2 py-1",
        "rounded-[30px]",
        // Liquid Morphism: Translucent frosted glass + specular top sheen
        "backdrop-blur-2xl bg-[#141620]/88 dark:bg-[#141620]/92",
        "border border-white/12 dark:border-white/10",
        // Claymorphism: 3D soft volumetric pillowy shadows + dual-depth insets
        "shadow-[0_20px_40px_-6px_rgba(0,0,0,0.75),0_8px_18px_-4px_rgba(0,0,0,0.5),inset_1.5px_1.5px_3px_rgba(255,255,255,0.12),inset_-3px_-3px_8px_rgba(0,0,0,0.7)]"
      )}
      style={{ paddingBottom: 'max(4px, env(safe-area-inset-bottom, 0px))' }}
      aria-label="Mobile Navigation"
    >
      {/* Top Specular Liquid Light Reflection Line */}
      <div className="absolute top-0 inset-x-8 h-[1px] bg-gradient-to-r from-transparent via-white/30 to-transparent pointer-events-none" />

      {/* Subtle Concave Notch Cradle for Center Button */}
      <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 w-20 h-7 bg-[#141620]/80 rounded-b-2xl blur-[1.5px] -z-10 pointer-events-none" />

      {/* Left Navigation Items */}
      <div className="flex items-center flex-1 justify-around">
        {leftItems.map((item) => {
          const isActive = location.pathname === item.path || location.pathname.startsWith(item.path + '/');
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={cn(
                "flex flex-col items-center justify-center flex-1 py-1.5 px-1 rounded-2xl transition-all duration-200",
                "active:scale-90",
                isActive
                  ? "text-[#7B8DF8] bg-white/[0.07] shadow-[inset_1px_1px_2px_rgba(255,255,255,0.18),inset_-1px_-1px_2px_rgba(0,0,0,0.5)]"
                  : "text-[var(--color-muted-foreground)] hover:text-white"
              )}
            >
              <item.icon className={cn(
                "w-5 h-5 transition-transform duration-200",
                isActive && "scale-110 drop-shadow-[0_2px_8px_rgba(123,141,248,0.6)]"
              )} />
              <span className={cn(
                "text-[10px] font-medium tracking-tight mt-0.5",
                isActive && "font-semibold"
              )}>
                {item.label}
              </span>
              {isActive && (
                <span className="w-1 h-1 rounded-full bg-[#7B8DF8] mt-0.5 shadow-[0_0_6px_#7B8DF8]" />
              )}
            </NavLink>
          );
        })}
      </div>

      {/* Elevated Center Meeting Button ("METING SYMBOL AROUND CIRCLE") */}
      <div className="relative -top-5 px-1.5 flex flex-col items-center justify-center shrink-0">
        <NavLink
          to={centerItem.path}
          className="group relative flex items-center justify-center focus:outline-none"
          aria-label="Meetings"
        >
          {/* Ambient Glow Aura */}
          <div
            className={cn(
              "absolute -inset-1 rounded-full blur-md opacity-70 transition-all duration-300",
              isCenterActive
                ? "bg-gradient-to-r from-blue-600 via-indigo-500 to-cyan-400 opacity-90 scale-105 animate-pulse"
                : "bg-indigo-600/40 group-hover:opacity-100 group-hover:scale-105"
            )}
          />

          {/* Outer Liquid Glass Border Ring */}
          <div className={cn(
            "relative p-[3px] rounded-full transition-all duration-300",
            "bg-gradient-to-b from-white/45 via-indigo-400/35 to-indigo-950/70",
            "shadow-[0_6px_16px_rgba(0,0,0,0.6)]",
            isCenterActive && "ring-2 ring-indigo-400 ring-offset-2 ring-offset-[#0d0f15]"
          )}>
            {/* 3D Claymorphic Center Button */}
            <div
              className={cn(
                "w-13 h-13 sm:w-14 sm:h-14 rounded-full flex items-center justify-center relative overflow-hidden transition-all duration-200",
                "bg-gradient-to-tr from-[#1b32c7] via-[#2041F0] to-[#5171ff]",
                "active:scale-95 group-hover:scale-105",
                // Dual-depth claymorphic shadows: Outer drop + Top inner specular highlight + Bottom inner compression
                "shadow-[0_12px_26px_-4px_rgba(32,65,240,0.7),0_4px_12px_rgba(0,0,0,0.5),inset_0_2.5px_4px_rgba(255,255,255,0.6),inset_0_-3px_5px_rgba(0,0,0,0.45)]"
              )}
            >
              {/* Specular Liquid Arc Highlight */}
              <div className="absolute top-1 left-2.5 right-2.5 h-3 rounded-full bg-gradient-to-b from-white/50 to-transparent blur-[0.5px] pointer-events-none" />

              {/* Video Meeting Symbol */}
              <Video className={cn(
                "w-6 h-6 text-white transition-transform duration-200",
                "drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]",
                isCenterActive ? "scale-110" : "group-hover:scale-110"
              )} />
            </div>
          </div>
        </NavLink>
        <span className={cn(
          "text-[10px] font-semibold tracking-tight transition-colors mt-0.5",
          isCenterActive
            ? "text-[#5171ff] dark:text-[#7B8DF8]"
            : "text-[var(--color-muted-foreground)] group-hover:text-white"
        )}>
          Meeting
        </span>
      </div>

      {/* Right Navigation Items */}
      <div className="flex items-center flex-1 justify-around">
        {rightItems.map((item) => {
          const isActive = location.pathname === item.path || location.pathname.startsWith(item.path + '/');
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={cn(
                "flex flex-col items-center justify-center flex-1 py-1.5 px-1 rounded-2xl transition-all duration-200",
                "active:scale-90",
                isActive
                  ? "text-[#7B8DF8] bg-white/[0.07] shadow-[inset_1px_1px_2px_rgba(255,255,255,0.18),inset_-1px_-1px_2px_rgba(0,0,0,0.5)]"
                  : "text-[var(--color-muted-foreground)] hover:text-white"
              )}
            >
              <item.icon className={cn(
                "w-5 h-5 transition-transform duration-200",
                isActive && "scale-110 drop-shadow-[0_2px_8px_rgba(123,141,248,0.6)]"
              )} />
              <span className={cn(
                "text-[10px] font-medium tracking-tight mt-0.5",
                isActive && "font-semibold"
              )}>
                {item.label}
              </span>
              {isActive && (
                <span className="w-1 h-1 rounded-full bg-[#7B8DF8] mt-0.5 shadow-[0_0_6px_#7B8DF8]" />
              )}
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
