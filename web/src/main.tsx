import React from 'react';
import { createRoot } from 'react-dom/client';
import '@astryxdesign/core/reset.css';
import '@astryxdesign/core/astryx.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import './index.css';
import App from './App';
import { registerServiceWorker } from './lib/offline';

registerServiceWorker();

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
