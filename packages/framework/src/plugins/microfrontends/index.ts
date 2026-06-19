/**
 * Microfrontends Plugin
 *
 * Enables MFE capabilities in HAI3 applications.
 * This plugin accepts NO configuration parameters.
 * All MFE registration happens dynamically at runtime.
 *
 * @packageDocumentation
 */

// @cpt-flow:cpt-hai3-flow-framework-composition-mfe-lifecycle:p1
// @cpt-flow:cpt-hai3-flow-framework-composition-shared-property-broadcast:p1
// @cpt-algo:cpt-hai3-algo-framework-composition-gts-validation:p1
// @cpt-state:cpt-hai3-state-framework-composition-mfe-mount:p1
// @cpt-dod:cpt-hai3-dod-framework-composition-mfe-plugin:p1
// @cpt-dod:cpt-hai3-dod-framework-composition-shared-property:p1

import {
  screensetsRegistryFactory,
  type MfeHandler,
  type TypeSystemPlugin,
  FRONTX_ACTION_MOUNT_EXT,
  FRONTX_ACTION_UNMOUNT_EXT,
} from '@gears-frontx/screensets';
import { getStore } from '@gears-frontx/state';
import type { HAI3Plugin } from '../../types';
import { mfeSlice, setExtensionMounted, setExtensionUnmounted } from './slice';
import { initMfeEffects } from './effects';
import {
  loadExtension,
  mountExtension,
  unmountExtension,
  registerExtension,
  unregisterExtension,
  setMfeRegistry,
} from './actions';

/**
 * Configuration for the microfrontends plugin.
 */
export interface MicrofrontendsConfig {
  /**
   * Type system plugin for entity validation.
   * The registry uses this for domain, extension, and handler type validation.
   */
  typeSystem: TypeSystemPlugin;

  /**
   * Optional MFE handlers to register with the screensets registry.
   * Handlers enable loading of specific MFE entry types (e.g., MfeEntryMF).
   *
   * If not provided, no handlers are registered. Applications must register
   * handlers manually via screensetsRegistry API.
   */
  mfeHandlers?: MfeHandler[];
}

/**
 * Microfrontends plugin factory.
 *
 * Enables MFE capabilities in HAI3 applications. Optionally accepts MFE handlers
 * for registration at plugin initialization.
 *
 * **Key Principles:**
 * - Optional mfeHandlers config for handler registration
 * - NO static domain registration - domains are registered at runtime
 * - Builds screensetsRegistry with provided TypeSystemPlugin at plugin initialization
 * - Same TypeSystemPlugin instance is propagated throughout
 * - Integrates MFE lifecycle with Flux data flow (actions, effects, slice)
 *
 * @param config - Optional configuration with mfeHandlers array
 *
 * @example
 * ```typescript
 * import { createHAI3, microfrontends } from '@gears-frontx/framework';
 * import { MfeHandlerMF, FRONTX_MFE_ENTRY_MF } from '@gears-frontx/screensets/mfe/handler';
 * import { gtsPlugin } from '@gears-frontx/screensets/plugins/gts';
 *
 * const app = createHAI3()
 *   .use(microfrontends({
 *     typeSystem: gtsPlugin,
 *     mfeHandlers: [new MfeHandlerMF(FRONTX_MFE_ENTRY_MF)],
 *   }))
 *   .build();
 *
 * // Register domains dynamically at runtime:
 * app.screensetsRegistry.registerDomain(sidebarDomain, containerProvider);
 *
 * // Use MFE actions:
 * app.actions.loadExtension('my.extension.v1');
 * app.actions.mountExtension('my.extension.v1');
 * ```
 */
// @cpt-begin:cpt-hai3-flow-framework-composition-mfe-lifecycle:p1:inst-1
// @cpt-begin:cpt-hai3-state-framework-composition-mfe-mount:p1:inst-1
// @cpt-begin:cpt-hai3-dod-framework-composition-mfe-plugin:p1:inst-1
export function microfrontends(config: MicrofrontendsConfig): HAI3Plugin {
  // Build the ScreensetsRegistry instance with provided TypeSystemPlugin and optional handlers
  // This registry handles all MFE lifecycle: domains, extensions, actions, etc.
  // TypeSystemPlugin binding happens here at application wiring level.
  const screensetsRegistry = screensetsRegistryFactory.build({
    typeSystem: config.typeSystem,
    mfeHandlers: config.mfeHandlers,
  });

  // Wrap executeActionsChain to intercept mount/unmount completions for store dispatch
  const originalExecuteActionsChain = screensetsRegistry.executeActionsChain.bind(screensetsRegistry);
  screensetsRegistry.executeActionsChain = async (chain) => {
    await originalExecuteActionsChain(chain);
    // After successful execution, dispatch store updates for mount/unmount
    const actionType = chain.action?.type;
    if (actionType === FRONTX_ACTION_MOUNT_EXT) {
      const store = getStore();
      const domainId = chain.action!.target;
      const extensionId = chain.action!.payload?.extensionId as string;
      if (domainId && extensionId) {
        store.dispatch(setExtensionMounted({ domainId, extensionId }));
      }
    } else if (actionType === FRONTX_ACTION_UNMOUNT_EXT) {
      const store = getStore();
      const domainId = chain.action!.target;
      if (domainId) {
        store.dispatch(setExtensionUnmounted({ domainId }));
      }
    }
  };

  // Store cleanup functions in closure (encapsulated per plugin instance)
  let effectsCleanup: (() => void) | null = null;

  return {
    name: 'microfrontends',
    dependencies: ['screensets'], // Requires screensets to be initialized

    provides: {
      registries: {
        // Expose the MFE-enabled ScreensetsRegistry
        // This registry has registerDomain(), registerExtension(), etc.
        screensetsRegistry,
      },
      slices: [mfeSlice],
      // NOTE: Effects are NOT initialized via provides.effects.
      // They are initialized in onInit to capture cleanup references.
      // The framework calls provides.effects at build step 5, then onInit at step 7.
      // We only initialize effects in onInit to avoid duplicate event listeners.
      actions: {
        loadExtension,
        mountExtension,
        unmountExtension,
        registerExtension,
        unregisterExtension,
      },
    },

    onInit(): void {
      // Wire the registry reference into actions module
      setMfeRegistry(screensetsRegistry);

      // Initialize effects and store cleanup references
      effectsCleanup = initMfeEffects(screensetsRegistry);

      // Plugin is now initialized
      // TypeSystemPlugin: bound to screensetsRegistry
      // MFE handlers: registered via config.mfeHandlers
      // Base domains: NOT pre-registered - registered dynamically at runtime
      // MFE actions: loadExtension, mountExtension, unmountExtension available

      // Plugin is now ready
      // Base domains are NOT registered here - they are registered dynamically
      // at runtime via app.screensetsRegistry.registerDomain() or actions
    },

    onDestroy(): void {
      // Cleanup event subscriptions
      if (effectsCleanup) {
        effectsCleanup();
        effectsCleanup = null;
      }
    },
  };
}
// @cpt-end:cpt-hai3-flow-framework-composition-mfe-lifecycle:p1:inst-1
// @cpt-end:cpt-hai3-state-framework-composition-mfe-mount:p1:inst-1
// @cpt-end:cpt-hai3-dod-framework-composition-mfe-plugin:p1:inst-1

// Re-export MFE actions for direct usage
export {
  loadExtension,
  mountExtension,
  unmountExtension,
  registerExtension,
  unregisterExtension,
  type RegisterExtensionPayload,
  type UnregisterExtensionPayload,
} from './actions';

// Re-export MFE slice and selectors
export {
  mfeSlice,
  mfeActions,
  selectExtensionState,
  selectRegisteredExtensions,
  selectExtensionError,
  selectMountedExtension,
  setExtensionMounted,
  setExtensionUnmounted,
  type MfeState,
  type ExtensionRegistrationState,
} from './slice';

// Re-export HAI3 layout domain constants and MfeEvents
export {
  FRONTX_POPUP_DOMAIN,
  FRONTX_SIDEBAR_DOMAIN,
  FRONTX_SCREEN_DOMAIN,
  FRONTX_OVERLAY_DOMAIN,
  MfeEvents,
} from './constants';

// Re-export base ExtensionDomain constants
export {
  screenDomain,
  sidebarDomain,
  popupDomain,
  overlayDomain,
} from './base-domains';
