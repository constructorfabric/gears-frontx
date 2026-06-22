/// <reference types="vite/client" />
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { FrontXProvider } from '@gears-frontx/react';
import './globals.css';
import App from './App';
import { app } from './initApp';

import { frontxThemes, DEFAULT_THEME_ID } from '@/app/themes';

// Register all themes from the custom UI kit bridge
for (const theme of frontxThemes) {
  app.themeRegistry.register(theme);
}

// Apply default theme
app.themeRegistry.apply(DEFAULT_THEME_ID);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <FrontXProvider app={app}>
      <App />
    </FrontXProvider>
  </StrictMode>
);
