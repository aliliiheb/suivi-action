import React from 'react';
import { createRoot } from 'react-dom/client';
import { PlansApp } from './PlansApp';
import './plans.css';
document.documentElement.lang = 'fr';
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PlansApp />
  </React.StrictMode>,
);
