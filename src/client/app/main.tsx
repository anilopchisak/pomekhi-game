import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HostPage } from '../pages/host/index.js';
import { PlayerPage } from '../pages/player/index.js';
import './global.css';

const root = document.getElementById('root');
if (!root) throw new Error('Application root is missing.');
const screen = new URLSearchParams(window.location.search).get('screen');
const isHost = screen === 'host' || screen === 'display' || screen === 'editor';
createRoot(root).render(<StrictMode>{isHost ? <HostPage display={screen === 'display'} editor={screen === 'editor'} /> : <PlayerPage />}</StrictMode>);

if (import.meta.env.PROD && window.isSecureContext && 'serviceWorker' in navigator) {
  void navigator.serviceWorker.register('/sw.js').catch(() => { /* The page remains usable; offline reload is unavailable. */ });
}
