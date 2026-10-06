import { useEffect } from 'react';

interface SplashScreenProps {
  onComplete?: () => void;
}

const splashCss = `
.hyna-splash-overlay {
  position: fixed;
  inset: 0;
  z-index: 999999;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #0a0e07;
  background-image: 
    radial-gradient(circle at 50% 50%, #26351b 0%, #172111 38%, #0e140a 70%, #060904 100%);
  user-select: none;
  pointer-events: auto;
  overflow: hidden;
  will-change: opacity;
  animation: hynaOverlayFadeOut 3s cubic-bezier(0.4, 0, 0.2, 1) forwards;
}

@keyframes hynaOverlayFadeOut {
  0%, 76% {
    opacity: 1;
    pointer-events: auto;
  }
  100% {
    opacity: 0;
    pointer-events: none;
    visibility: hidden;
  }
}

.hyna-splash-center {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  will-change: transform, opacity;
}

/* Ambient backlight glow synchronized across the 3-second sequence */
.hyna-splash-glow {
  position: absolute;
  width: 270px;
  height: 270px;
  border-radius: 50%;
  background: radial-gradient(
    circle,
    rgba(187, 244, 81, 0.32) 0%,
    rgba(32, 65, 240, 0.16) 45%,
    transparent 70%
  );
  filter: blur(45px);
  pointer-events: none;
  will-change: transform, opacity;
  animation: hynaGlowZoomInOut 3s cubic-bezier(0.33, 1, 0.68, 1) forwards;
}

@keyframes hynaGlowZoomInOut {
  0% {
    opacity: 0;
    transform: scale(0.85);
  }
  16% {
    opacity: 0.65;
    transform: scale(1.15);
  }
  46% {
    /* 1. Zoom out state: settles back */
    opacity: 0.42;
    transform: scale(0.88);
  }
  56% {
    opacity: 0.48;
    transform: scale(0.90);
  }
  80% {
    /* 2. Zoom in forward with radiant expansion */
    opacity: 0.95;
    transform: scale(1.32);
  }
  100% {
    /* 3. Smooth dissolve into the login page */
    opacity: 0;
    transform: scale(1.45);
  }
}

/* Logo animation: Zoom Out -> Zoom In smoothly -> Smoothly turn into Login Page (3.0s total) */
.hyna-splash-logo {
  position: relative;
  width: 108px;
  height: 108px;
  max-width: 108px;
  max-height: 108px;
  object-fit: contain;
  filter: drop-shadow(0 6px 22px rgba(0, 0, 0, 0.65));
  will-change: transform, opacity;
  animation: hynaLogoZoomOutZoomIn 3s cubic-bezier(0.33, 1, 0.68, 1) forwards;
}

@keyframes hynaLogoZoomOutZoomIn {
  0% {
    opacity: 0;
    transform: scale(1.30);
    filter: drop-shadow(0 4px 14px rgba(0, 0, 0, 0.5));
  }
  14% {
    opacity: 1;
  }
  46% {
    /* 1. Zoom Out smoothly (pulling back with camera depth) */
    opacity: 1;
    transform: scale(0.88);
    filter: drop-shadow(0 6px 18px rgba(0, 0, 0, 0.65));
  }
  56% {
    /* Smooth inflection point */
    opacity: 1;
    transform: scale(0.90);
  }
  80% {
    /* 2. Zoom In smoothly forward towards viewer */
    opacity: 1;
    transform: scale(1.18);
    filter: drop-shadow(0 12px 32px rgba(187, 244, 81, 0.45));
  }
  100% {
    /* 3. Smoothly turn/dissolve into the login page */
    opacity: 0;
    transform: scale(1.26);
    filter: drop-shadow(0 14px 38px rgba(187, 244, 81, 0.6));
  }
}

@media (min-width: 640px) {
  .hyna-splash-logo {
    width: 122px;
    height: 122px;
    max-width: 122px;
    max-height: 122px;
  }
  .hyna-splash-glow {
    width: 310px;
    height: 310px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .hyna-splash-overlay {
    animation: hynaReducedFade 0.6s ease forwards !important;
  }
  .hyna-splash-logo,
  .hyna-splash-glow {
    animation: none !important;
    transform: none !important;
  }
  @keyframes hynaReducedFade {
    0%, 50% { opacity: 1; }
    100% { opacity: 0; visibility: hidden; }
  }
}
`;

export function SplashScreen({ onComplete }: SplashScreenProps) {
  useEffect(() => {
    // Check if user prefers reduced motion
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const splashDuration = prefersReducedMotion ? 600 : 3000;

    const timer = setTimeout(() => {
      onComplete?.();
    }, splashDuration);

    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <div
      className="hyna-splash-overlay"
      role="status"
      aria-label="Loading Hyna Studio Workspace"
      aria-live="polite"
    >
      <style>{splashCss}</style>

      <div className="hyna-splash-center">
        {/* Synchronized radiant backlight glow */}
        <div className="hyna-splash-glow" />

        {/* Official Hyna Studio logo with 3-second Zoom Out -> Zoom In -> Reveal sequence */}
        <img
          src="/logo.png"
          alt="Hyna Studio Logo"
          className="hyna-splash-logo"
          fetchPriority="high"
          loading="eager"
        />
      </div>
    </div>
  );
}

export default SplashScreen;
