import { useState } from 'react';
import {
  Download,
  Smartphone,
  Monitor,
  Share,
  PlusSquare,
  CheckCircle2,
  ExternalLink,
  Laptop,
  Check,
} from 'lucide-react';
import { Modal, Button, Badge } from '@/components/ui';
import { cn } from '@/lib/utils';

interface InstallAppModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInstallPrompt?: () => void;
  isInstallable?: boolean;
  isInstalled?: boolean;
}

export function InstallAppModal({
  isOpen,
  onClose,
  onInstallPrompt,
  isInstallable,
  isInstalled,
}: InstallAppModalProps) {
  const [activeTab, setActiveTab] = useState<'desktop' | 'mobile' | 'tracker'>('desktop');

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Download & Install App"
      size="lg"
      footer={
        <div className="flex items-center justify-between w-full">
          <span className="text-xs text-[var(--color-muted-foreground)]">
            Installable Progressive Web App (PWA) + Desktop Tracker
          </span>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
            {isInstallable && !isInstalled && onInstallPrompt && (
              <Button onClick={onInstallPrompt} className="gap-2">
                <Download className="w-4 h-4" /> Install Now
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Banner */}
        <div className="p-4 rounded-xl bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-pink-500/10 border border-indigo-500/20 flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl overflow-hidden flex items-center justify-center shrink-0 shadow-md">
            <img src="/logo.png" alt="App Logo" className="w-10 h-10 object-contain" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-[var(--color-foreground)]">
                Install as a Native App
              </h3>
              {isInstalled ? (
                <Badge className="bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 text-[10px]">
                  <Check className="w-3 h-3 mr-1 inline" /> Installed
                </Badge>
              ) : (
                <Badge className="bg-indigo-500/10 text-indigo-600 border border-indigo-500/20 text-[10px]">
                  Instant Setup
                </Badge>
              )}
            </div>
            <p className="text-xs text-[var(--color-muted-foreground)] mt-1 leading-relaxed">
              Run the app in its own standalone window without browser tabs. Enjoy fast offline
              caching, desktop notifications, dock/taskbar pinning, and quick access.
            </p>

            {isInstallable && !isInstalled && onInstallPrompt && (
              <div className="mt-3">
                <Button size="sm" onClick={onInstallPrompt} className="gap-1.5 shadow-sm">
                  <Download className="w-3.5 h-3.5" /> Install 1-Click to Desktop / Phone
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Platform Selector */}
        <div className="flex border-b border-[var(--color-border)] gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('desktop')}
            className={cn(
              'flex items-center gap-2 px-3 py-2 text-sm font-medium border-b-2 transition-all -mb-px',
              activeTab === 'desktop'
                ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                : 'border-transparent text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]'
            )}
          >
            <Monitor className="w-4 h-4" /> Desktop (Chrome / Edge / Mac)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('mobile')}
            className={cn(
              'flex items-center gap-2 px-3 py-2 text-sm font-medium border-b-2 transition-all -mb-px',
              activeTab === 'mobile'
                ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                : 'border-transparent text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]'
            )}
          >
            <Smartphone className="w-4 h-4" /> Mobile (Android & iPhone)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('tracker')}
            className={cn(
              'flex items-center gap-2 px-3 py-2 text-sm font-medium border-b-2 transition-all -mb-px',
              activeTab === 'tracker'
                ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                : 'border-transparent text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]'
            )}
          >
            <Laptop className="w-4 h-4" /> Desktop Activity Tracker
          </button>
        </div>

        {/* Tab 1: Desktop */}
        {activeTab === 'desktop' && (
          <div className="space-y-4">
            <h4 className="text-sm font-semibold text-[var(--color-foreground)]">
              Installing on Google Chrome, Microsoft Edge, or Brave:
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] space-y-2">
                <span className="w-6 h-6 rounded-full bg-[var(--color-muted)] flex items-center justify-center text-xs font-bold text-[var(--color-primary)]">
                  1
                </span>
                <p className="text-xs font-semibold">Check Address Bar</p>
                <p className="text-xs text-[var(--color-muted-foreground)] leading-relaxed">
                  Look at the right side of your browser URL bar for the <strong>Install</strong> icon (computer with down arrow).
                </p>
              </div>

              <div className="p-3.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] space-y-2">
                <span className="w-6 h-6 rounded-full bg-[var(--color-muted)] flex items-center justify-center text-xs font-bold text-[var(--color-primary)]">
                  2
                </span>
                <p className="text-xs font-semibold">Or Browser Menu</p>
                <p className="text-xs text-[var(--color-muted-foreground)] leading-relaxed">
                  Click the <strong>⋮ (three dots)</strong> menu in the top-right &gt; <strong>Save and share</strong> &gt; <strong>Install App</strong>.
                </p>
              </div>

              <div className="p-3.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] space-y-2">
                <span className="w-6 h-6 rounded-full bg-[var(--color-muted)] flex items-center justify-center text-xs font-bold text-[var(--color-primary)]">
                  3
                </span>
                <p className="text-xs font-semibold">Pin to Taskbar</p>
                <p className="text-xs text-[var(--color-muted-foreground)] leading-relaxed">
                  Click <strong>Install</strong>. The app launches immediately and can be pinned to your Windows Taskbar or macOS Dock.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Mobile */}
        {activeTab === 'mobile' && (
          <div className="space-y-4">
            <div className="space-y-3">
              <div className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">Android (Chrome / Samsung Internet)</Badge>
                </div>
                <ol className="list-decimal list-inside text-xs text-[var(--color-muted-foreground)] space-y-1.5 pl-1 pt-1">
                  <li>Open the Management App in <strong>Chrome</strong> on your phone.</li>
                  <li>Tap the <strong>⋮ (three dots)</strong> menu in the top-right corner.</li>
                  <li>Select <strong>&quot;Install app&quot;</strong> or <strong>&quot;Add to Home screen&quot;</strong>.</li>
                  <li>The app will be installed directly to your phone&apos;s home screen and app drawer.</li>
                </ol>
              </div>

              <div className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">iPhone / iPad (Safari)</Badge>
                </div>
                <ol className="list-decimal list-inside text-xs text-[var(--color-muted-foreground)] space-y-1.5 pl-1 pt-1">
                  <li>Open this website in <strong>Safari</strong> on your iPhone or iPad.</li>
                  <li>Tap the <strong>Share</strong> button <Share className="w-3.5 h-3.5 inline mx-1 text-sky-500" /> at the bottom of the screen.</li>
                  <li>Scroll down and tap <strong>&quot;Add to Home Screen&quot;</strong> <PlusSquare className="w-3.5 h-3.5 inline mx-1" />.</li>
                  <li>Tap <strong>Add</strong> in the top-right corner. Hyna Studio is now on your home screen!</li>
                </ol>
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Desktop Tracker App */}
        {activeTab === 'tracker' && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-[var(--color-primary)] flex items-center justify-center">
                    <Laptop className="w-4 h-4" />
                  </div>
                  <div>
                    <h5 className="text-xs font-semibold">Hyna Desktop Activity Tracker</h5>
                    <p className="text-[11px] text-[var(--color-muted-foreground)]">
                      Local background tracker for VS Code, Cursor &amp; Antigravity
                    </p>
                  </div>
                </div>
                <Badge variant="outline" className="text-[10px]">Desktop Tool</Badge>
              </div>

              <p className="text-xs text-[var(--color-muted-foreground)] leading-relaxed">
                The desktop tracker runs silently in your system tray to automatically monitor your coding
                sessions, active files, and git branches, reporting directly to your dashboard.
              </p>

              <div className="p-3 rounded-lg bg-[var(--color-muted)] text-xs font-mono text-[var(--color-foreground)] select-all">
                cd hyna-desktop-tracker &amp;&amp; npm start
              </div>
            </div>
          </div>
        )}

        {/* Feature summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-[var(--color-border)] text-center">
          <div className="p-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 mx-auto mb-1" />
            <span className="text-[11px] font-medium text-[var(--color-muted-foreground)]">Offline Support</span>
          </div>
          <div className="p-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 mx-auto mb-1" />
            <span className="text-[11px] font-medium text-[var(--color-muted-foreground)]">No URL Bar</span>
          </div>
          <div className="p-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 mx-auto mb-1" />
            <span className="text-[11px] font-medium text-[var(--color-muted-foreground)]">Dock &amp; Taskbar</span>
          </div>
          <div className="p-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 mx-auto mb-1" />
            <span className="text-[11px] font-medium text-[var(--color-muted-foreground)]">Push Alerts</span>
          </div>
        </div>
      </div>
    </Modal>
  );
}
