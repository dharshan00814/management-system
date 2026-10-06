// ============================================================
// Hyna Management: PushNotificationPrompt Component
// Polite, non-intrusive notification permission opt-in card
// Triggered strictly upon explicit member action
// ============================================================

import React, { useState, useEffect } from 'react';
import { Bell, X, CheckCircle, ShieldCheck, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui';
import { useWebPush } from '@/hooks/useWebPush';
import { useAuthStore } from '@/stores';

const DISMISS_KEY = 'hyna_push_prompt_dismissed';

export function PushNotificationPrompt() {
  const { isAuthenticated, currentUser } = useAuthStore();
  const { isSupported, permission, isSubscribed, isLoading, enablePush } = useWebPush();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    // Only show if user is logged in, push is supported, permission is 'default' (not prompted or denied), and not yet subscribed
    if (!isAuthenticated || !currentUser || !isSupported) {
      setDismissed(true);
      return;
    }

    if (permission !== 'default' || isSubscribed) {
      setDismissed(true);
      return;
    }

    const wasDismissed = localStorage.getItem(DISMISS_KEY);
    if (!wasDismissed) {
      // Delay display slightly to avoid jarring initial render
      const timer = setTimeout(() => {
        setDismissed(false);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [isAuthenticated, currentUser, isSupported, permission, isSubscribed]);

  const handleDismiss = () => {
    setDismissed(true);
    // Dismiss for current session / 3 days
    localStorage.setItem(DISMISS_KEY, Date.now().toString());
  };

  const handleEnable = async () => {
    const success = await enablePush();
    if (success) {
      setDismissed(true);
    }
  };

  if (dismissed || !isSupported || permission !== 'default' || isSubscribed) {
    return null;
  }

  return (
    <div className="fixed bottom-20 md:bottom-6 right-4 sm:right-6 z-50 max-w-sm w-full animate-slide-up">
      <div className="card p-4 rounded-2xl bg-[var(--color-card)]/95 backdrop-blur-md border border-[var(--color-border)] shadow-xl relative overflow-hidden">
        {/* Subtle accent gradient bar */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />

        <div className="flex items-start gap-3 pt-1">
          <div className="w-9 h-9 rounded-xl bg-[var(--color-primary)]/10 text-[var(--color-primary)] flex items-center justify-center shrink-0 mt-0.5">
            <Bell className="w-5 h-5 animate-bounce" />
          </div>

          <div className="flex-1 min-w-0 pr-6">
            <h4 className="text-sm font-bold text-[var(--color-foreground)]">
              Stay in the loop with the app
            </h4>
            <p className="text-xs text-[var(--color-muted-foreground)] mt-1 leading-relaxed">
              Enable native push notifications to receive real-time task assignments, standup reminders, and important studio broadcasts.
            </p>

            <div className="flex items-center gap-2 mt-3">
              <Button
                type="button"
                size="sm"
                onClick={handleEnable}
                disabled={isLoading}
                className="h-8 text-xs gap-1.5 cursor-pointer shadow-sm"
              >
                {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                Enable Push Alerts
              </Button>

              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleDismiss}
                className="h-8 text-xs text-[var(--color-muted-foreground)] cursor-pointer"
              >
                Not Now
              </Button>
            </div>
          </div>

          <button
            type="button"
            onClick={handleDismiss}
            className="absolute top-3 right-3 p-1 rounded-lg text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-muted)] transition-colors cursor-pointer"
            aria-label="Dismiss notification prompt"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
