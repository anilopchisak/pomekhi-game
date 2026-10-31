import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { FoundationPage } from '../pages/foundation/index.js';
import './global.css';

const root = document.getElementById('root');
if (!root) throw new Error('Application root is missing.');
createRoot(root).render(<StrictMode><FoundationPage /></StrictMode>);
