import React from 'react';
import { createRoot } from 'react-dom/client';
import '@/shared/ui/global.css';
import '@/shared/ui/design.css';
import '@/shared/ui/universe.css';
import '@/shared/ui/sanctuary.css';
import '@/shared/ui/objectives.css';
import '@/shared/ui/life-studio.css';
import '@/shared/ui/atelier.css';
import '@/shared/i18n';
import { App } from '@/app/App';

const container = document.getElementById('root');
if (!container) throw new Error('Root element #root not found');

createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
import '@/shared/ui/insights.css';
