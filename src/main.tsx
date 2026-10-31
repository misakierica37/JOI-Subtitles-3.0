import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker
    .getRegistrations()
    .then((registrations) => {
      for (const reg of registrations) {
        reg.unregister().catch(() => {});
      }
    })
    .catch(() => {});
  if ('caches' in window) {
    caches
      .keys()
      .then((keys) => {
        for (const k of keys) {
          caches.delete(k).catch(() => {});
        }
      })
      .catch(() => {});
  }
}

createRoot(document.getElementById('root')!).render(<App />);


