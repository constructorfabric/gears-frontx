/// <reference types="vite/client" />
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { FrontXProvider } from '@gears-frontx/react';
import './globals.css';
import App from './App';
import { app } from './initApp';

// @ts-expect-error Themes barrel is produced at scaffold from monorepo src/app/themes; missing in template-sources-only tree.
import { frontxThemes, DEFAULT_THEME_ID } from '@/app/themes';

// Register all themes (provides CSS variables regardless of UI kit choice)
for (const theme of frontxThemes) {
  app.themeRegistry.register(theme);
}

// Apply default theme
app.themeRegistry.apply(DEFAULT_THEME_ID);

/**
 * Render application
 * Bootstrap happens automatically when Layout mounts
 *
 * Flow:
 * 1. App renders → Layout mounts → bootstrap dispatched
 * 2. Components show skeleton loaders (translationsReady = false)
 * 3. User fetched → language set → translations loaded
 * 4. Components re-render with actual text (translationsReady = true)
 *
 * This template is for projects created with --uikit none.
 * No UI component library is included (no Toaster, no styles).
 * User provides their own UI components.
 */
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <FrontXProvider app={app}>
      <App />
    </FrontXProvider>
  </StrictMode>
);
