/**
 * Microfrontends Plugin
 *
 * Enables MFE capabilities in FrontX applications.
 * This plugin accepts NO configuration parameters.
 * All MFE registration happens dynamically at runtime.
 *
 * @packageDocumentation
 */

// @cpt-algo:cpt-frontx-algo-framework-composition-mount-set-diff-dispatch:p1
// @cpt-flow:cpt-frontx-flow-framework-composition-mfe-lifecycle:p1
// @cpt-flow:cpt-frontx-flow-framework-composition-shared-property-broadcast:p1
// @cpt-algo:cpt-frontx-algo-framework-composition-gts-validation:p1
// @cpt-state:cpt-frontx-state-framework-composition-mfe-mount:p1
// @cpt-dod:cpt-frontx-dod-framework-composition-mfe-plugin:p1
// @cpt-dod:cpt-frontx-dod-framework-composition-shared-property:p1

import {
  mfeRegistryFactory,
  type ActionsChain,
  type MfeHandler,
  type TypeSystemPlugin,
  FRONTX_ACTION_MOUNT_EXT,
  FRONTX_ACTION_UNMOUNT_EXT,
} from '@gears-frontx/screensets';
import { getStore } from '@gears-frontx/state';
import type { FrontXPlugin } from '../../types';
import { mfeSlice, addExtensionMounted, removeExtensionMounted } from './slice';
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
   * handlers manually via mfeRegistry API.
   */
  mfeHandlers?: MfeHandler[];
}

function collectLifecycleDomains(chain: ActionsChain): string[] {
  const domains = new Set<string>();

  const visit = (link: ActionsChain): void => {
    const actionType = link.action?.type;
    const domainId = link.action?.target;
    if (
      (actionType === FRONTX_ACTION_MOUNT_EXT || actionType === FRONTX_ACTION_UNMOUNT_EXT) &&
      domainId
    ) {
      domains.add(domainId);
    }

    if (link.next) {
      visit(link.next);
    }

    if (link.fallback) {
      visit(link.fallback);
    }
  };

  visit(chain);
  return [...domains];
}

/**
 * Microfrontends plugin factory.
 *
 * Enables MFE capabilities in FrontX applications. Optionally accepts MFE handlers
 * for registration at plugin initialization.
 *
 * **Key Principles:**
 * - Optional mfeHandlers config for handler registration
 * - NO static domain registration - domains are registered at runtime
 * - Builds mfeRegistry with provided TypeSystemPlugin at plugin initialization
 * - Same TypeSystemPlugin instance is propagated throughout
 * - Integrates MFE lifecycle with Flux data flow (actions, effects, slice)
 *
 * @param config - Optional configuration with mfeHandlers array
 *
 * @example
 * ```typescript
 * import { createFrontX, microfrontends } from '@gears-frontx/framework';
 * import { MfeHandlerMF, FrontX_MFE_ENTRY_MF } from '@gears-frontx/screensets/mfe/handler';
 * import { gtsPlugin } from '@gears-frontx/screensets/plugins/gts';
 *
 * const app = createFrontX()
 *   .use(microfrontends({
 *     typeSystem: gtsPlugin,
 *     mfeHandlers: [new MfeHandlerMF(FrontX_MFE_ENTRY_MF)],
 *   }))
 *   .build();
 *
 * // Register domains dynamically at runtime:
 * app.mfeRegistry.registerDomain(sidebarDomain, containerProvider);
 *
 * // Use MFE actions:
 * app.actions.loadExtension('my.extension.v1');
 * app.actions.mountExtension('my.extension.v1');
 * ```
 */
// @cpt-begin:cpt-frontx-flow-framework-composition-mfe-lifecycle:p1:inst-1
// @cpt-begin:cpt-frontx-state-framework-composition-mfe-mount:p1:inst-1
// @cpt-begin:cpt-frontx-dod-framework-composition-mfe-plugin:p1:inst-1
export function microfrontends(config: MicrofrontendsConfig): FrontXPlugin {
  // Build the MfeRegistry instance with provided TypeSystemPlugin and optional handlers
  // This registry handles all MFE lifecycle: domains, extensions, actions, etc.
  // TypeSystemPlugin binding happens here at application wiring level.
  const mfeRegistry = mfeRegistryFactory.build({
    typeSystem: config.typeSystem,
    mfeHandlers: config.mfeHandlers,
  });

  /**
   * Mount-set diff dispatch — `cpt-frontx-algo-framework-composition-mount-set-diff-dispatch`
   *
   * Algorithm:
   * 1. Snapshot `before` per lifecycle domain from `registry.getMountedExtensions(domainId)`.
   * 2. Await the chain in a try block; dispatch the diff in the finally block so both
   *    success and failure paths reconcile the slice with the registry.
   * 3. Snapshot `after` per lifecycle domain from `registry.getMountedExtensions(domainId)`.
   * 4. Compute `added = after \ before` and `removed = before \ after` (set differences).
   * 5. Dispatch one `addExtensionMounted` per element of `added` and one
   *    `removeExtensionMounted` per element of `removed`.
   *
   * Idempotent reducers make this safe under unserialized concurrent chains for
   * multi-mount domains: a duplicate `addExtensionMounted` is a no-op, and a
   * duplicate `removeExtensionMounted` is a no-op — the slice converges to
   * `registry.getMountedExtensions(domainId)` regardless of interleaving.
   */
  // @cpt-begin:cpt-frontx-algo-framework-composition-mount-set-diff-dispatch:p1:inst-1
  const originalExecuteActionsChain = mfeRegistry.executeActionsChain.bind(mfeRegistry);
  mfeRegistry.executeActionsChain = async (chain) => {
    const lifecycleDomains = collectLifecycleDomains(chain);

    // Step 1: snapshot pre-chain mount sets per domain
    const beforeByDomain = new Map(
      lifecycleDomains.map((domainId) => [domainId, new Set(mfeRegistry.getMountedExtensions(domainId))])
    );

    try {
      await originalExecuteActionsChain(chain);
    } finally {
      // Steps 3-5: run on both success and failure so the slice stays in sync
      // even when the chain records a failure internally.
      if (lifecycleDomains.length > 0) {
        const store = getStore();
        for (const domainId of lifecycleDomains) {
          const before = beforeByDomain.get(domainId)!;
          const after = new Set(mfeRegistry.getMountedExtensions(domainId));

          const added = [...after].filter((id) => !before.has(id));
          const removed = [...before].filter((id) => !after.has(id));

          for (const extensionId of added) {
            store.dispatch(addExtensionMounted({ domainId, extensionId }));
          }
          for (const extensionId of removed) {
            store.dispatch(removeExtensionMounted({ domainId, extensionId }));
          }
        }
      }
    }
  };
  // @cpt-end:cpt-frontx-algo-framework-composition-mount-set-diff-dispatch:p1:inst-1

  // Store cleanup functions in closure (encapsulated per plugin instance)
  let effectsCleanup: (() => void) | null = null;

  return {
    name: 'microfrontends',
    dependencies: [],

    provides: {
      registries: {
        // Expose the MFE-enabled MfeRegistry
        // This registry has registerDomain(), registerExtension(), etc.
        mfeRegistry,
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
      setMfeRegistry(mfeRegistry);

      // Initialize effects and store cleanup references
      effectsCleanup = initMfeEffects(mfeRegistry);

      // Plugin is now initialized
      // TypeSystemPlugin: bound to mfeRegistry
      // MFE handlers: registered via config.mfeHandlers
      // Base domains: NOT pre-registered - registered dynamically at runtime
      // MFE actions: loadExtension, mountExtension, unmountExtension available

      // Plugin is now ready
      // Base domains are NOT registered here - they are registered dynamically
      // at runtime via app.mfeRegistry.registerDomain() or actions
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
// @cpt-end:cpt-frontx-flow-framework-composition-mfe-lifecycle:p1:inst-1
// @cpt-end:cpt-frontx-state-framework-composition-mfe-mount:p1:inst-1
// @cpt-end:cpt-frontx-dod-framework-composition-mfe-plugin:p1:inst-1

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
  selectMountedExtensions,
  addExtensionMounted,
  removeExtensionMounted,
  type MfeState,
  type ExtensionRegistrationState,
} from './slice';

// Re-export FrontX layout domain constants and MfeEvents
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
