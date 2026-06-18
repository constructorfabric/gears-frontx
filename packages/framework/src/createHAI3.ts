/**
 * createHAI3 - App Builder Factory
 *
 * Creates a HAI3 app builder for custom plugin composition.
 * This is the core of the plugin architecture.
 *
 * Framework Layer: L2 (Depends on SDK packages)
 */

// @cpt-flow:cpt-hai3-flow-framework-composition-app-bootstrap:p1
// @cpt-flow:cpt-hai3-flow-framework-composition-plugin-dependency:p1
// @cpt-algo:cpt-hai3-algo-framework-composition-dep-resolution:p1
// @cpt-algo:cpt-hai3-algo-framework-composition-provides-aggregation:p1
// @cpt-state:cpt-hai3-state-framework-composition-builder:p1
// @cpt-flow:cpt-hai3-flow-framework-composition-teardown:p2
// @cpt-dod:cpt-hai3-dod-framework-composition-builder:p1

import { getStore, registerSlice } from '@gears-frontx/state';
import type { EffectInitializer } from '@gears-frontx/state';
import type {
  HAI3Config,
  HAI3Plugin,
  HAI3AppBuilder,
  HAI3App,
  HAI3Actions,
  HAI3Store,
  PluginFactory,
  RegisterableSlice,
  ThemeRegistry,
} from './types';
import { apiRegistry } from '@gears-frontx/api';

// ============================================================================
// Plugin Resolution
// ============================================================================

// @cpt-begin:cpt-hai3-flow-framework-composition-plugin-dependency:p1:inst-1
/**
 * Check if value is a plugin factory function
 */
function isPluginFactory(
  value: HAI3Plugin | PluginFactory
): value is PluginFactory {
  return typeof value === 'function';
}

/**
 * Resolve plugin - if it's a factory, call it; otherwise return as-is
 */
function resolvePlugin(plugin: HAI3Plugin | PluginFactory): HAI3Plugin {
  return isPluginFactory(plugin) ? plugin() : plugin;
}
// @cpt-end:cpt-hai3-flow-framework-composition-plugin-dependency:p1:inst-1

// ============================================================================
// App Builder Implementation
// ============================================================================

/**
 * HAI3 App Builder Implementation
 */
class HAI3AppBuilderImpl implements HAI3AppBuilder {
  private plugins: HAI3Plugin[] = [];
  private config: HAI3Config;

  constructor(config: HAI3Config = {}) {
    this.config = {
      name: 'HAI3 App',
      devMode: false,
      strictMode: false,
      ...config,
    };
  }

  /**
   * Add a plugin to the application.
   * Also accepts an array of plugins (for preset support).
   */
  // @cpt-begin:cpt-hai3-flow-framework-composition-app-bootstrap:p1:inst-1
  // @cpt-begin:cpt-hai3-state-framework-composition-builder:p1:inst-1
  use(plugin: HAI3Plugin | PluginFactory | HAI3Plugin[]): HAI3AppBuilder {
    // Handle arrays (presets return arrays)
    if (Array.isArray(plugin)) {
      plugin.forEach((p) => this.use(p));
      return this;
    }

    const resolved = resolvePlugin(plugin);

    // Check if plugin already registered
    if (this.plugins.some((p) => p.name === resolved.name)) {
      if (this.config.devMode) {
        console.warn(
          `Plugin "${resolved.name}" is already registered. Skipping duplicate.`
        );
      }
      return this;
    }

    this.plugins.push(resolved);
    return this;
  }
  // @cpt-end:cpt-hai3-flow-framework-composition-app-bootstrap:p1:inst-1
  // @cpt-end:cpt-hai3-state-framework-composition-builder:p1:inst-1

  /**
   * Add multiple plugins at once.
   */
  useAll(plugins: Array<HAI3Plugin | PluginFactory>): HAI3AppBuilder {
    plugins.forEach((plugin) => this.use(plugin));
    return this;
  }

  /**
   * Build the application.
   */
  // @cpt-begin:cpt-hai3-flow-framework-composition-app-bootstrap:p1:inst-2
  // @cpt-begin:cpt-hai3-state-framework-composition-builder:p1:inst-2
  build(): HAI3App {
    // 1. Resolve dependencies and order plugins
    const orderedPlugins = this.resolveDependencies();

    // 2. Call onRegister for each plugin
    orderedPlugins.forEach((plugin) => {
      if (plugin.onRegister) {
        plugin.onRegister(this, plugin._configType);
      }
    });

    // 3. Aggregate all provides
    const aggregated = this.aggregateProvides(orderedPlugins);

    // 4. Create store with aggregated slices
    const store = this.createStoreWithSlices(aggregated.slices);

    // 5. Initialize effects
    aggregated.effects.forEach((initEffect) => {
      initEffect(store.dispatch);
    });

    // 6. Build the app object
    // Cast actions to HAI3Actions - all plugins have contributed their actions
    // via module augmentation, so the runtime object matches the declared type
    const app: HAI3App = {
      config: this.config,
      store: store as HAI3Store,
      themeRegistry: aggregated.registries.themeRegistry as ThemeRegistry,
      apiRegistry: apiRegistry,
      i18nRegistry: aggregated.registries.i18nRegistry as HAI3App['i18nRegistry'],
      screensetsRegistry: aggregated.registries.screensetsRegistry as HAI3App['screensetsRegistry'],
      actions: aggregated.actions as HAI3Actions,
      destroy: () => this.destroyApp(orderedPlugins, app),
    };

    // 7. Call onInit for each plugin
    orderedPlugins.forEach((plugin) => {
      if (plugin.onInit) {
        plugin.onInit(app);
      }
    });

    return app;
  }
  // @cpt-end:cpt-hai3-flow-framework-composition-app-bootstrap:p1:inst-2
  // @cpt-end:cpt-hai3-state-framework-composition-builder:p1:inst-2

  /**
   * Resolve plugin dependencies using topological sort.
   */
  // @cpt-begin:cpt-hai3-algo-framework-composition-dep-resolution:p1:inst-1
  // @cpt-begin:cpt-hai3-flow-framework-composition-plugin-dependency:p1:inst-2
  private resolveDependencies(): HAI3Plugin[] {
    const resolved: HAI3Plugin[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (plugin: HAI3Plugin) => {
      if (visited.has(plugin.name)) return;

      if (visiting.has(plugin.name)) {
        throw new Error(
          `Circular dependency detected: ${plugin.name} depends on itself or creates a cycle.`
        );
      }

      visiting.add(plugin.name);

      // Process dependencies first
      if (plugin.dependencies) {
        for (const depName of plugin.dependencies) {
          const dep = this.plugins.find((p) => p.name === depName);

          if (!dep) {
            if (this.config.strictMode) {
              throw new Error(
                `Plugin "${plugin.name}" requires "${depName}" but it is not registered.\n` +
                  `Add the missing plugin: .use(${depName}())`
              );
            } else {
              console.warn(
                `Plugin "${plugin.name}" requires "${depName}" but it is not registered. ` +
                  `Some features may not work correctly.`
              );
              continue;
            }
          }

          visit(dep);
        }
      }

      visiting.delete(plugin.name);
      visited.add(plugin.name);
      resolved.push(plugin);
    };

    this.plugins.forEach(visit);
    return resolved;
  }
  // @cpt-end:cpt-hai3-algo-framework-composition-dep-resolution:p1:inst-1
  // @cpt-end:cpt-hai3-flow-framework-composition-plugin-dependency:p1:inst-2

  /**
   * Aggregate all provides from plugins.
   */
  // @cpt-begin:cpt-hai3-algo-framework-composition-provides-aggregation:p1:inst-1
  private aggregateProvides(plugins: HAI3Plugin[]) {
    const registries: Record<string, unknown> = {};
    const slices: RegisterableSlice[] = [];
    const effects: EffectInitializer[] = [];
    // Actions are typed via module augmentation - each plugin declares its actions
    // in HAI3Actions interface. At runtime we merge them all together.
    const actions: Partial<HAI3Actions> = {};

    plugins.forEach((plugin) => {
      if (!plugin.provides) return;

      // Merge registries
      if (plugin.provides.registries) {
        Object.assign(registries, plugin.provides.registries);
      }

      // Collect slices
      if (plugin.provides.slices) {
        slices.push(...plugin.provides.slices);
      }

      // Collect effects
      if (plugin.provides.effects) {
        effects.push(...plugin.provides.effects);
      }

      // Merge actions (type-safe via HAI3Actions module augmentation)
      if (plugin.provides.actions) {
        Object.assign(actions, plugin.provides.actions);
      }
    });

    return { registries, slices, effects, actions };
  }
  // @cpt-end:cpt-hai3-algo-framework-composition-provides-aggregation:p1:inst-1

  /**
   * Create store with all aggregated slices.
   *
   * IMPORTANT: This method supports the screenset self-registration pattern.
   * Screensets call registerSlice() as module side effects when imported,
   * which may auto-create a store before createHAI3App() is called.
   *
   * This method:
   * 1. Uses the existing store if one was auto-created by screensets
   * 2. Registers framework slices to the existing store
   * 3. Returns the unified store for HAI3App
   */
  private createStoreWithSlices(slices: RegisterableSlice[]): HAI3Store {
    // Get existing store (may have been created by screenset registerSlice calls)
    // getStore() auto-creates if none exists
    const store = getStore();

    // Register framework slices using registerSlice (merges with dynamic slices)
    slices.forEach((slice) => {
      registerSlice(slice);
    });

    return store;
  }

  /**
   * Destroy the app and cleanup resources.
   */
  // @cpt-begin:cpt-hai3-flow-framework-composition-teardown:p2:inst-1
  private destroyApp(plugins: HAI3Plugin[], app: HAI3App): void {
    // Call onDestroy in reverse order
    [...plugins].reverse().forEach((plugin) => {
      if (plugin.onDestroy) {
        plugin.onDestroy(app);
      }
    });
  }
  // @cpt-end:cpt-hai3-flow-framework-composition-teardown:p2:inst-1
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a HAI3 app builder for custom plugin composition.
 *
 * @param config - Optional application configuration
 * @returns App builder for plugin composition
 *
 * @example
 * ```typescript
 * const app = createHAI3()
 *   .use(screensets())
 *   .use(themes())
 *   .build();
 * ```
 */
// @cpt-begin:cpt-hai3-dod-framework-composition-builder:p1:inst-1
export function createHAI3(config?: HAI3Config): HAI3AppBuilder {
  return new HAI3AppBuilderImpl(config);
}
// @cpt-end:cpt-hai3-dod-framework-composition-builder:p1:inst-1
