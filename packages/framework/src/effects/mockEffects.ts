/**
 * Mock Effects
 *
 * Listens for mock mode toggle events and manages mock plugin lifecycle.
 * Event-driven architecture: UI emits events, effects handle plugin activation/deactivation.
 */

// @cpt-algo:cpt-hai3-algo-framework-composition-mock-toggle:p2

import { eventBus, getStore } from '@gears-frontx/state';
import { apiRegistry, isMockPlugin, type ApiProtocol, type ApiPluginBase } from '@gears-frontx/api';
import { setMockEnabled } from '../slices/mockSlice';

// ============================================================================
// Type Guards
// ============================================================================

/** Protocol with plugin management (RestProtocol, SseProtocol) */
interface ProtocolWithPlugins extends ApiProtocol {
  plugins: {
    add: (plugin: ApiPluginBase) => void;
    remove: (plugin: ApiPluginBase) => void;
    getAll: () => readonly ApiPluginBase[];
  };
}

/** Type guard to check if protocol has plugin management */
function hasPluginManagement(protocol: ApiProtocol): protocol is ProtocolWithPlugins {
  return 'plugins' in protocol && typeof (protocol as ProtocolWithPlugins).plugins === 'object';
}

// ============================================================================
// Event Types
// ============================================================================

/** Mock event names */
export const MockEvents = {
  Toggle: 'mock/toggle',
} as const;

/** Payload for mock toggle event */
export interface MockTogglePayload {
  enabled: boolean;
}

// ============================================================================
// Module Augmentation for Type-Safe Events
// ============================================================================

declare module '@gears-frontx/state' {
  interface EventPayloadMap {
    'mock/toggle': MockTogglePayload;
  }
}

// ============================================================================
// Mock Plugin Synchronization
// ============================================================================

/**
 * Activate or deactivate all mock plugins based on enabled state.
 * Uses isMockPlugin() type guard to identify mock plugins from generic storage.
 */
function syncMockPlugins(enabled: boolean): void {
  // Iterate all registered services
  for (const service of apiRegistry.getAll()) {
    // getPlugins() returns ALL plugins (generic)
    // We filter for mock plugins using the type guard
    const registeredPlugins = service.getPlugins();

    for (const [protocol, plugins] of registeredPlugins) {
      // Check if protocol has plugins management (RestProtocol, SseProtocol do)
      if (!hasPluginManagement(protocol)) continue;

      for (const plugin of plugins) {
        // Framework filters using type guard - BaseApiService doesn't know about mocks
        if (isMockPlugin(plugin)) {
          if (enabled) {
            // Add plugin to protocol if not already present
            const existingPlugins = protocol.plugins.getAll();
            if (!existingPlugins.includes(plugin)) {
              protocol.plugins.add(plugin);
            }
          } else {
            // Remove plugin from protocol
            protocol.plugins.remove(plugin);
          }
        }
      }
    }
  }
}

// ============================================================================
// Effect Registration
// ============================================================================

/**
 * Initialize mock mode effects
 * Call this once during app bootstrap to start listening for mock toggle events.
 */
// @cpt-begin:cpt-hai3-algo-framework-composition-mock-toggle:p2:inst-1
export function initMockEffects(): () => void {
  const store = getStore();

  // Listen to toggle events
  const unsubscribe = eventBus.on(MockEvents.Toggle, (payload) => {
    // Update Redux state
    store.dispatch(setMockEnabled(payload.enabled));

    // Sync plugins with new state
    syncMockPlugins(payload.enabled);
  });

  // Sync on initialization based on current state
  const currentState = store.getState();
  // Check if mock slice exists and is enabled
  if ('mock' in currentState && currentState.mock && typeof currentState.mock === 'object' && 'enabled' in currentState.mock) {
    syncMockPlugins((currentState.mock as { enabled: boolean }).enabled);
  }

  // Return cleanup function
  return () => {
    unsubscribe.unsubscribe();
  };
}
// @cpt-end:cpt-hai3-algo-framework-composition-mock-toggle:p2:inst-1

// ============================================================================
// Helper Actions (for consuming apps)
// ============================================================================

/**
 * Toggle mock mode on/off.
 * Emits event that mockEffects handles.
 *
 * @example
 * ```typescript
 * import { toggleMockMode } from '@gears-frontx/framework';
 * toggleMockMode(true);  // Enable mock mode
 * toggleMockMode(false); // Disable mock mode
 * ```
 */
// @cpt-begin:cpt-hai3-algo-framework-composition-mock-toggle:p2:inst-2
export function toggleMockMode(enabled: boolean): void {
  eventBus.emit(MockEvents.Toggle, { enabled });
}
// @cpt-end:cpt-hai3-algo-framework-composition-mock-toggle:p2:inst-2
