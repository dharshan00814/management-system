import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { MobileBottomNav } from './MobileBottomNav';
import { MobileDrawer } from './MobileDrawer';
import { CommandPalette } from './CommandPalette';
import { PushNotificationPrompt } from '@/components/common/PushNotificationPrompt';
import { useSidebarStore } from '@/stores';
import { useRealtime } from '@/hooks/useRealtime';
import { cn } from '@/lib/utils';

export function AppLayout() {
  const { isCollapsed, isMobileOpen, setMobileOpen } = useSidebarStore();
  useRealtime();

  return (
    <div className="relative flex h-screen w-screen overflow-hidden bg-gradient-to-br from-[#0c3826] via-[#092218] to-[#04120c] md:bg-none md:bg-[var(--color-background)]">
      {/* Ambient background glow for mobile drawer */}
      <div className="absolute top-0 left-0 w-80 h-80 bg-emerald-500/15 rounded-full blur-3xl pointer-events-none md:hidden" />
      <div className="absolute bottom-0 left-16 w-72 h-72 bg-teal-500/10 rounded-full blur-3xl pointer-events-none md:hidden" />

      {/* Mobile 3D Reveal Drawer (hidden on desktop) */}
      <MobileDrawer />

      {/* Secondary stacked 3D perspective card peeking out behind the main card */}
      <div
        className={cn(
          "absolute inset-y-8 sm:inset-y-10 w-10 rounded-[30px] bg-white/12 dark:bg-white/10 backdrop-blur-md transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] pointer-events-none md:hidden z-10",
          isMobileOpen
            ? "left-[calc(74vw-12px)] sm:left-[268px] scale-[0.78] opacity-60 shadow-[-10px_0_30px_rgba(0,0,0,0.5)]"
            : "left-0 scale-95 opacity-0"
        )}
      />

      {/* Sidebar - desktop */}
      <Sidebar />

      {/* Main content area with 3D Zoom & Slide Card effect on mobile */}
      <div
        className={cn(
          "relative z-20 flex-1 flex flex-col min-w-0 h-full bg-[var(--color-background)]",
          // Desktop sizing and positioning
          "md:static md:transform-none md:scale-100 md:rounded-none md:shadow-none md:border-0",
          isCollapsed ? "md:ml-[68px]" : "md:ml-[260px]",
          // Mobile 3D Zoom Card Animation
          "transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] origin-left",
          isMobileOpen && [
            "transform translate-x-[74vw] sm:translate-x-[280px] scale-[0.82]",
            "rounded-[32px] sm:rounded-[36px] overflow-hidden",
            "shadow-[-24px_0_60px_rgba(0,0,0,0.85),0_20px_50px_rgba(0,0,0,0.6)]",
            "border border-white/20 dark:border-white/10",
            "select-none cursor-pointer"
          ]
        )}
      >
        {/* Transparent tap shield over scaled card to close drawer on tap */}
        {isMobileOpen && (
          <div
            className="absolute inset-0 z-50 md:hidden cursor-pointer rounded-[32px] sm:rounded-[36px]"
            onClick={() => setMobileOpen(false)}
            onTouchEnd={(e) => {
              e.preventDefault();
              setMobileOpen(false);
            }}
            aria-label="Tap to close navigation"
          />
        )}

        <Header />
        <main className="flex-1 overflow-y-auto main-content pb-24 md:pb-0">
          <Outlet />
        </main>
      </div>

      {/* Mobile bottom nav */}
      <MobileBottomNav />

      {/* Command palette (Ctrl+K) */}
      <CommandPalette />

      {/* Non-intrusive Web Push prompt */}
      <PushNotificationPrompt />
    </div>
  );
}

