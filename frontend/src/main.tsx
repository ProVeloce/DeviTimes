import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { assetUrl } from './lib/asset-url';

if (!import.meta.env.DEV && 'serviceWorker' in navigator && ['http:', 'https:'].includes(window.location.protocol)) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker
      .register(assetUrl('sw.js'), {
        scope: import.meta.env.BASE_URL,
        updateViaCache: 'none',
      })
      .catch((error: unknown) => {
        console.error('[offline] service worker registration failed', error);
      });
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
