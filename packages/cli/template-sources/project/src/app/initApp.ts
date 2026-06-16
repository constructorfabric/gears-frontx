/**
 * Shared application initialization for all main.tsx template variants.
 *
 * Registers GTS schemas, API services, and creates the HAI3 app instance.
 * Each main variant imports this and only adds variant-specific rendering.
 */
// @ts-nocheck — Template source: `@/` imports resolve in generated apps, not in this package tree.
import {
  apiRegistry,
  createHAI3App,
  MfeHandlerMF,
  gtsPlugin,
  HAI3_MFE_ENTRY_MF,
  themeSchema,
  languageSchema,
  extensionScreenSchema,
} from '@gears-frontx/react';
import { AccountsApiService } from '@/app/api';
import '@/app/events/bootstrapEvents';
import { registerBootstrapEffects } from '@/app/effects/bootstrapEffects';

// Register framework-level derived GTS schemas before the MFE registry is built.
gtsPlugin.registerSchema(themeSchema);
gtsPlugin.registerSchema(languageSchema);
gtsPlugin.registerSchema(extensionScreenSchema);

// Register accounts service (application-level service for user info)
apiRegistry.register(AccountsApiService);

// Initialize API services
apiRegistry.initialize({});

// Create HAI3 app instance
// Register MfeHandlerMF to enable Module Federation MFE loading
const app = createHAI3App({
  microfrontends: {
    typeSystem: gtsPlugin,
    mfeHandlers: [new MfeHandlerMF(HAI3_MFE_ENTRY_MF)],
  },
});

// Register app-level effects (pass store dispatch)
registerBootstrapEffects(app.store.dispatch);

export { app };
