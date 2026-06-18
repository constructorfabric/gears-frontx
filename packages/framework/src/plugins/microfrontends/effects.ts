/**
 * MFE Effects
 *
 * Listens for MFE registration events and coordinates with runtime.
 * Handles registerExtension and unregisterExtension events.
 *
 * Registration effects update slice state and delegate to the ScreensetsRegistry
 * for runtime registration operations.
 */

// @cpt-flow:cpt-hai3-flow-framework-composition-mfe-registration:p1
// @cpt-state:cpt-hai3-state-framework-composition-mfe-registration:p1
// @cpt-flow:cpt-hai3-flow-framework-composition-teardown:p2
// @cpt-dod:cpt-hai3-dod-framework-composition-mfe-plugin:p1

import { eventBus, getStore } from '@gears-frontx/state';
import { MfeEvents } from './constants';
import {
  setExtensionRegistering,
  setExtensionRegistered,
  setExtensionUnregistered,
  setExtensionError,
} from './slice';
import type { ScreensetsRegistry } from '@gears-frontx/screensets';

// ============================================================================
// Effect Initialization
// ============================================================================

/**
 * Initialize MFE effects.
 * Call this once during app bootstrap to start listening for MFE events.
 *
 * @param screensetsRegistry - MFE-enabled registry from microfrontends plugin
 * @returns Cleanup function to unsubscribe all effects
 */
// @cpt-begin:cpt-hai3-flow-framework-composition-mfe-registration:p1:inst-1
// @cpt-begin:cpt-hai3-state-framework-composition-mfe-registration:p1:inst-1
// @cpt-begin:cpt-hai3-flow-framework-composition-teardown:p2:inst-2
export function initMfeEffects(screensetsRegistry: ScreensetsRegistry): () => void {
  const store = getStore();
  const unsubscribers: Array<{ unsubscribe: () => void }> = [];

  // ============================================================================
  // Register Extension Effect
  // ============================================================================

  const unsubRegisterExtension = eventBus.on(MfeEvents.RegisterExtensionRequested, async (payload) => {
    const { extension } = payload;

    try {
      // Update state: registering
      store.dispatch(setExtensionRegistering({ extensionId: extension.id }));

      // Call runtime to register extension
      await screensetsRegistry.registerExtension(extension);

      // Update state: registered
      store.dispatch(setExtensionRegistered({ extensionId: extension.id }));
    } catch (error) {
      // Update state: error
      const errorMessage = error instanceof Error ? error.message : 'Unknown registration error';
      store.dispatch(setExtensionError({ extensionId: extension.id, error: errorMessage }));
    }
  });
  unsubscribers.push(unsubRegisterExtension);

  // ============================================================================
  // Unregister Extension Effect
  // ============================================================================

  const unsubUnregisterExtension = eventBus.on(MfeEvents.UnregisterExtensionRequested, async (payload) => {
    const { extensionId } = payload;

    try {
      // Call runtime to unregister extension
      await screensetsRegistry.unregisterExtension(extensionId);

      // Update state: unregistered
      store.dispatch(setExtensionUnregistered({ extensionId }));
    } catch (error) {
      // Update state: error
      const errorMessage = error instanceof Error ? error.message : 'Unknown unregistration error';
      store.dispatch(setExtensionError({ extensionId, error: errorMessage }));
    }
  });
  unsubscribers.push(unsubUnregisterExtension);

  // ============================================================================
  // Return Cleanup Function
  // ============================================================================

  return () => {
    unsubscribers.forEach((unsub) => unsub.unsubscribe());
  };
}
// @cpt-end:cpt-hai3-flow-framework-composition-mfe-registration:p1:inst-1
// @cpt-end:cpt-hai3-state-framework-composition-mfe-registration:p1:inst-1
// @cpt-end:cpt-hai3-flow-framework-composition-teardown:p2:inst-2
