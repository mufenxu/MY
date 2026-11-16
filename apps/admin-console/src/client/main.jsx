import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { initTheme } from '@my-platform/pearl-tokens/theme.js';
import './styles.css';
import { installConsoleExperienceMonitoring } from './experience.js';

initTheme();
installConsoleExperienceMonitoring();

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
