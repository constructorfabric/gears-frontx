/// <reference types="vite/client" />
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HAI3Provider } from '@gears-frontx/react';
import './globals.css';
import App from './App';
import { app } from './initApp';

import { hai3Themes, DEFAULT_THEME_ID } from '@/app/themes';

// Register all themes from the custom UI kit bridge
for (const theme of hai3Themes) {
  app.themeRegistry.register(theme);
}

// Apply default theme
app.themeRegistry.apply(DEFAULT_THEME_ID);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HAI3Provider app={app}>
      <App />
    </HAI3Provider>
  </StrictMode>
);
