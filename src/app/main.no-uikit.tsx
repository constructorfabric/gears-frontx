/// <reference types="vite/client" />
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { FrontXProvider, apiRegistry, createFrontXApp } from '@gears-frontx/react';
import { AccountsApiService } from '@/app/api';
import '@/app/events/bootstrapEvents'; // Register app-level events (type augmentation)
import { registerBootstrapEffects } from '@/app/effects/bootstrapEffects'; // Register app-level effects
import App from './App';

// Register accounts service (application-level service for user info)
apiRegistry.register(AccountsApiService);

// Initialize API services
apiRegistry.initialize({});

// Create FrontX app instance (no theme support when using --uikit none)
// No UI component library included
const app = createFrontXApp();

// Register app-level effects (pass store dispatch)
registerBootstrapEffects(app.store.dispatch);

/**
 * Render application
 * Bootstrap happens automatically when Layout mounts
 *
 * Flow:
 * 1. App renders → Layout mounts → bootstrap dispatched
 * 2. Components show skeleton loaders (translationsReady = false)
 * 3. User fetched → language set → translations loaded
 * 4. Components re-render with actual text (translationsReady = true)
 * 5. FrontXProvider includes AppRouter for URL-based navigation
 *
 * Note: Mock API is controlled via the FrontX Studio panel.
 * The mock plugin (included in full preset) handles mock plugin lifecycle automatically.
 *
 * This template is for projects created with --uikit none.
 * No UI component library is included (no Toaster, no themes, no styles).
 * User provides their own UI components and theme system.
 */
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <FrontXProvider app={app}>
      <App />
    </FrontXProvider>
  </StrictMode>
);
