import React from 'react';
import { createRoot } from 'react-dom/client';
import '@/styles/index.css';
import { SidePanel } from './SidePanel';

const root = createRoot(document.getElementById('root')!);
root.render(
  <React.StrictMode>
    <SidePanel />
  </React.StrictMode>
);
