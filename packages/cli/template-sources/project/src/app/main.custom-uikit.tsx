/// <reference types="vite/client" />
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HAI3Provider, apiRegistry, createHAI3App, MfeHandlerMF, gtsPlugin, FRONTX_MFE_ENTRY_MF } from '@gears-frontx/react';
import { AccountsApiService } from '@/app/api';
import './globals.css';
import '@/app/events/bootstrapEvents';
import { registerBootstrapEffects } from '@/app/effects/bootstrapEffects';
import App from './App';

import { frontxThemes, DEFAULT_THEME_ID } from '@/app/themes';

// Register accounts service (application-level service for user info)
apiRegistry.register(AccountsApiService);

// Initialize API services
apiRegistry.initialize({});

// Create HAI3 app instance
const app = createHAI3App({
  microfrontends: {
    typeSystem: gtsPlugin,
    mfeHandlers: [new MfeHandlerMF(FRONTX_MFE_ENTRY_MF)],
  },
});

// Register app-level effects (pass store dispatch)
registerBootstrapEffects(app.store.dispatch);

// Register all themes from the custom UI kit bridge
for (const theme of frontxThemes) {
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
