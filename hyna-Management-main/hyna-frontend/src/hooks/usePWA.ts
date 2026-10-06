import { useState, useEffect } from 'react';

// Global cache for deferredPrompt across renders
let cachedDeferredPrompt: any = null;

export function usePWA() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(cachedDeferredPrompt);
  const [isInstallable, setIsInstallable] = useState(Boolean(cachedDeferredPrompt));
  const [isInstalled, setIsInstalled] = useState(false);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    // Check if running in standalone mode (already installed)
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true ||
      document.referrer.includes('android-app://');

    setIsInstalled(isStandalone);

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      cachedDeferredPrompt = e;
      setDeferredPrompt(e);
      setIsInstallable(true);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setIsInstallable(false);
      setDeferredPrompt(null);
      cachedDeferredPrompt = null;
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const promptInstall = async () => {
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        const choiceResult = await deferredPrompt.userChoice;
        if (choiceResult?.outcome === 'accepted') {
          setIsInstalled(true);
          setIsInstallable(false);
          setDeferredPrompt(null);
          cachedDeferredPrompt = null;
          setShowModal(false);
        }
      } catch (err) {
        console.error('Install prompt error:', err);
        setShowModal(true);
      }
    } else {
      setShowModal(true);
    }
  };

  return {
    isInstallable,
    isInstalled,
    showModal,
    setShowModal,
    promptInstall,
  };
}
