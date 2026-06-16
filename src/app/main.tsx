/// <reference types="vite/client" />
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HAI3Provider, apiRegistry, createHAI3App, MfeHandlerMF, gtsPlugin, HAI3_MFE_ENTRY_MF, themeSchema, languageSchema, extensionScreenSchema } from '@gears-frontx/react';
import { Toaster } from '@/app/components/ui/sonner';
import { AccountsApiService } from '@/app/api';
import './globals.css'; // Global styles with CSS variables
import '@/app/events/bootstrapEvents'; // Register app-level events (type augmentation)
import { registerBootstrapEffects } from '@/app/effects/bootstrapEffects'; // Register app-level effects
import App from './App';

// Import all themes
import { DEFAULT_THEME_ID, defaultTheme } from '@/app/themes/default';
import { darkTheme } from '@/app/themes/dark';
import { lightTheme } from '@/app/themes/light';
import { draculaTheme } from '@/app/themes/dracula';
import { draculaLargeTheme } from '@/app/themes/dracula-large';

// Register application-specific GTS schemas before constructing the FrontX app.
// These derived schemas encode application-level constraints (valid theme names,
// supported languages, screen extension shape) and are not part of the core
// type system in @gears-frontx/screensets.
gtsPlugin.registerSchema(themeSchema);
gtsPlugin.registerSchema(languageSchema);
gtsPlugin.registerSchema(extensionScreenSchema);

// Register accounts service (application-level service for user info)
apiRegistry.register(AccountsApiService);

// Initialize API services
apiRegistry.initialize({});

// Create FrontX app instance
// Register MfeHandlerMF to enable Module Federation MFE loading
const app = createHAI3App({
  microfrontends: {
    typeSystem: gtsPlugin,
    mfeHandlers: [new MfeHandlerMF(HAI3_MFE_ENTRY_MF)],
  },
});

// Register app-level effects (pass store dispatch)
registerBootstrapEffects(app.store.dispatch);

// Register all themes (default theme has default:true, activates automatically)
app.themeRegistry.register(defaultTheme);
app.themeRegistry.register(lightTheme);
app.themeRegistry.register(darkTheme);
app.themeRegistry.register(draculaTheme);
app.themeRegistry.register(draculaLargeTheme);

// Apply default theme explicitly
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
 * 5. MFE system loads and mounts extensions via MfeScreenContainer
 *
 * Note: Mock API is controlled via the FrontX Studio panel.
 * The mock plugin (included in full preset) handles mock plugin lifecycle automatically.
 */
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HAI3Provider app={app}>
      <App />
      <Toaster />
    </HAI3Provider>
  </StrictMode>
);
