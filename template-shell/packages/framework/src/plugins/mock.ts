// @cpt-algo:cpt-frontx-algo-framework-composition-mock-toggle:p2

/**
 * Mock Plugin - Centralized mock mode control
 *
 * Framework Layer: L2
 *
 * Automatically registers mockSlice and initializes mock effects.
 * Apps don't need to manually call registerSlice(mockSlice) or initMockEffects().
 */

import type { FrontXPlugin } from '../types';
import { mockSlice } from '../slices/mockSlice';
import { initMockEffects, toggleMockMode } from '../effects/mockEffects';

/**
 * Detect if running in development environment.
 * Uses runtime heuristics since framework is pre-built.
 */
function isDevEnvironment(): boolean {
  if (typeof window === 'undefined') return false;

  const { hostname } = window.location;
  // localhost, 127.0.0.1, or any .local domain
  return hostname === 'localhost'
    || hostname === '127.0.0.1'
    || hostname.endsWith('.local');
}

/**
 * Mock plugin configuration
 */
export interface MockPluginConfig {
  /**
   * Enable mock mode by default.
   * When true, mock plugins are activated immediately on app init.
   * @default true (enabled in dev mode by default)
   */
  enabledByDefault?: boolean;
}

/**
 * Mock plugin factory.
 *
 * Provides centralized mock mode control for API services.
 * Automatically registers the mock slice and initializes mock effects.
 * In dev mode, mock mode is enabled by default.
 *
 * @param config - Optional plugin configuration
 * @returns Mock plugin
 *
 * @example
 * ```typescript
 * const app = createFrontX()
 *   .use(effects())
 *   .use(mock())  // Automatic mock mode support (enabled in dev)
 *   .build();
 *
 * // Toggle mock mode via actions
 * app.actions.toggleMockMode(true);
 * ```
 */
// @cpt-begin:cpt-frontx-algo-framework-composition-mock-toggle:p2:inst-1
export function mock(config?: MockPluginConfig): FrontXPlugin {
  let cleanup: (() => void) | null = null;

  return {
    name: 'mock',
    dependencies: ['effects'],

    provides: {
      slices: [mockSlice],
      actions: {
        toggleMockMode,
      },
    },

    onInit() {
      // Initialize mock effects after store is ready
      cleanup = initMockEffects();

      // Determine if mock mode should be enabled by default
      // Auto-detect dev environment (localhost) unless explicitly configured
      const isDev = isDevEnvironment();
      const enabledByDefault = config?.enabledByDefault ?? isDev;

      if (enabledByDefault) {
        // Enable mock mode immediately after initialization
        toggleMockMode(true);
      }
    },

    onDestroy() {
      // Cleanup event subscriptions
      if (cleanup) {
        cleanup();
        cleanup = null;
      }
    },
  };
}
// @cpt-end:cpt-frontx-algo-framework-composition-mock-toggle:p2:inst-1
