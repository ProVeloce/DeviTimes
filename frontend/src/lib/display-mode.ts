import { useEffect, useState } from 'react';

export type ApplicationDisplayMode =
  | 'desktop-web'
  | 'mobile-browser'
  | 'installed-mobile'
  | 'installed-desktop';

function isInstalledApp(): boolean {
  const iosNavigator = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia('(display-mode: standalone)').matches || iosNavigator.standalone === true;
}

function isMobileViewport(): boolean {
  const narrowViewport = window.matchMedia('(max-width: 767px)').matches;
  const shortScreenEdge = Math.min(window.screen.width, window.screen.height) <= 600;
  return narrowViewport || (window.matchMedia('(pointer: coarse)').matches && shortScreenEdge);
}

export function getApplicationDisplayMode(): ApplicationDisplayMode {
  const installed = isInstalledApp();
  const mobile = isMobileViewport();

  if (installed) return mobile ? 'installed-mobile' : 'installed-desktop';
  return mobile ? 'mobile-browser' : 'desktop-web';
}

export function useApplicationDisplayMode(): ApplicationDisplayMode {
  const [mode, setMode] = useState(getApplicationDisplayMode);

  useEffect(() => {
    const updateMode = () => setMode(getApplicationDisplayMode());
    const mediaQueries = [
      window.matchMedia('(display-mode: standalone)'),
      window.matchMedia('(max-width: 767px)'),
      window.matchMedia('(pointer: coarse)'),
    ];

    window.addEventListener('resize', updateMode);
    window.addEventListener('orientationchange', updateMode);
    mediaQueries.forEach((query) => query.addEventListener('change', updateMode));

    return () => {
      window.removeEventListener('resize', updateMode);
      window.removeEventListener('orientationchange', updateMode);
      mediaQueries.forEach((query) => query.removeEventListener('change', updateMode));
    };
  }, []);

  return mode;
}
