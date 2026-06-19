/**
 * @gears-frontx/framework - Type Definitions
 *
 * Core types for HAI3 framework with plugin architecture.
 * Integrates all SDK packages into a cohesive framework.
 */
// @cpt-dod:cpt-hai3-dod-framework-composition-builder:p1
// @cpt-dod:cpt-hai3-dod-framework-composition-app-config:p1
// @cpt-dod:cpt-hai3-dod-framework-composition-mfe-plugin:p1

// ============================================================================
// Type Imports from SDK Packages
// ============================================================================

// From @gears-frontx/state
import type {
  HAI3Store as StoreType,
  EffectInitializer,
} from '@gears-frontx/state';

import type { Reducer } from '@reduxjs/toolkit';

// From @gears-frontx/api
import type { ApiRegistry } from '@gears-frontx/api';

// From @gears-frontx/i18n
import type { I18nRegistry } from '@gears-frontx/i18n';

// Re-export HAI3Store from @gears-frontx/store for framework consumers
export type HAI3Store = StoreType;

// ============================================================================
// HAI3 Configuration
// ============================================================================

/**
 * Router mode type
 */
export type RouterMode = 'browser' | 'hash' | 'memory';

/**
 * HAI3 Application Configuration
 * Configuration options for creating a HAI3 application.
 */
export interface HAI3Config {
  /** Application name */
  name?: string;
  /** Enable development mode */
  devMode?: boolean;
  /** Enable strict mode (throws on errors) */
  strictMode?: boolean;
  /**
   * Auto-route to the first registered route on mount.
   * When false, stays on "/" until explicit navigation occurs.
   * @default true
   * @deprecated Legacy option, will be removed in a future version.
   */
  autoNavigate?: boolean;
  /**
   * Base path for navigation. Example: '/console' makes routes /console/*.
   * @default '/'
   */
  base?: string;
  /**
   * Router mode - browser (default), hash, or memory.
   * - browser: Uses HTML5 history API (clean URLs)
   * - hash: Uses URL hash (#/path)
   * - memory: In-memory routing without URL sync
   * @default 'browser'
   */
  routerMode?: RouterMode;
}

// ============================================================================
// Internal Slice Types
// ============================================================================

/**
 * Registerable Slice Interface
 * Minimal interface for slices that can be registered with the framework.
 * Used for heterogeneous slice collections where different state types are mixed.
 *
 * This is an internal framework type - plugins provide slices matching this structure.
 * The Reducer type uses RTK's default, avoiding explicit `any` in HAI3 code.
 */
export interface RegisterableSlice {
  /** Slice name - becomes the state key */
  readonly name: string;
  /** Slice reducer function */
  readonly reducer: Reducer;
  /** Slice action creators (optional for registration) */
  readonly actions?: Record<string, unknown>;
}

// ============================================================================
// Plugin System Types
// ============================================================================

/**
 * HAI3 Actions Interface
 * Central registry of all actions available in the application.
 *
 * Built-in actions are defined here. Consumers can extend this interface
 * via module augmentation to add custom actions:
 *
 * @example
 * ```typescript
 * declare module '@gears-frontx/framework' {
 *   interface HAI3Actions {
 *     myCustomAction: (payload: MyPayload) => void;
 *   }
 * }
 * ```
 *
 * Design: Interface (not type) enables TypeScript declaration merging.
 */
export interface HAI3Actions {
  // ==========================================================================
  // Theme actions (from themes plugin)
  // ==========================================================================
  changeTheme: (payload: ChangeThemePayload) => void;

  // ==========================================================================
  // I18n actions (from i18n plugin)
  // ==========================================================================
  setLanguage: (payload: SetLanguagePayload) => void;

  // ==========================================================================
  // Layout actions (from layout plugin)
  // ==========================================================================
  showPopup: (payload: ShowPopupPayload) => void;
  hidePopup: () => void;
  showOverlay: (payload: { id: string }) => void;
  hideOverlay: () => void;
  toggleMenuCollapsed: (payload: { collapsed: boolean }) => void;
  toggleSidebarCollapsed: (payload: { collapsed: boolean }) => void;
  setHeaderVisible: (payload: boolean) => void;
  setFooterVisible: (payload: boolean) => void;
  setMenuCollapsed: (payload: boolean) => void;
  setSidebarCollapsed: (payload: boolean) => void;

  // ==========================================================================
  // Screenset actions (from screensets plugin)
  // ==========================================================================
  setActiveScreen: (payload: string) => void;
  setScreenLoading: (payload: boolean) => void;

  // ==========================================================================
  // Mock actions (from mock plugin)
  // ==========================================================================
  toggleMockMode: (enabled: boolean) => void;

  // ==========================================================================
  // MFE actions (from microfrontends plugin)
  // ==========================================================================
  loadExtension: (extensionId: string) => void;
  mountExtension: (extensionId: string) => void;
  unmountExtension: (extensionId: string) => void;
  registerExtension: (extension: import('@gears-frontx/screensets').Extension) => void;
  unregisterExtension: (extensionId: string) => void;
}

/**
 * Plugin Provides Interface
 * What a plugin contributes to the application.
 */
export interface PluginProvides {
  /** Registry contributions */
  registries?: Record<string, unknown>;
  /** Redux slices to register */
  slices?: RegisterableSlice[];
  /** Effect initializers to register */
  effects?: EffectInitializer[];
  /** Actions provided by the plugin (subset of HAI3Actions) */
  actions?: Partial<HAI3Actions>;
}

/**
 * Plugin Lifecycle Interface
 * Lifecycle hooks for plugin initialization.
 */
export interface PluginLifecycle {
  /**
   * Called when plugin is registered (before app starts).
   *
   * @param app - The app builder instance
   * @param config - Plugin configuration
   */
  onRegister?(app: HAI3AppBuilder, config: unknown): void;

  /**
   * Called after all plugins registered, before app starts.
   *
   * @param app - The built app instance
   */
  onInit?(app: HAI3App): void | Promise<void>;

  /**
   * Called when app is destroyed.
   *
   * @param app - The app instance
   */
  onDestroy?(app: HAI3App): void;
}

/**
 * HAI3 Plugin Interface
 * All plugins implement this contract.
 * Follows Liskov Substitution Principle - any plugin can be used interchangeably.
 *
 * @template TConfig - Plugin configuration type
 *
 * @example
 * ```typescript
 * const microfrontendsPlugin: HAI3Plugin = {
 *   name: 'microfrontends',
 *   dependencies: [],
 *   provides: {
 *     slices: [mfeSlice],
 *     actions: {
 *       mountExtension: (extensionId: string) => { ... },
 *     },
 *   },
 *   onInit(app) {
 *     // Initialize MFE registry
 *     app.screensetsRegistry = screensetsRegistryFactory.create(...);
 *   },
 * };
 * ```
 */
export interface HAI3Plugin<TConfig = unknown> extends PluginLifecycle {
  /** Unique plugin identifier */
  name: string;

  /** Other plugins this plugin requires */
  dependencies?: string[];

  /** What this plugin provides to the app */
  provides?: PluginProvides;

  /** Plugin configuration type marker (used for type inference) */
  _configType?: TConfig;
}

/**
 * Plugin Factory Function
 * Factory function that creates a plugin with optional configuration.
 *
 * @template TConfig - Plugin configuration type
 */
export type PluginFactory<TConfig = unknown> = (config?: TConfig) => HAI3Plugin<TConfig>;

// ============================================================================
// App Builder Interface
// ============================================================================

/**
 * HAI3 App Builder Interface
 * Fluent builder for composing HAI3 applications with plugins.
 *
 * @example
 * ```typescript
 * const app = createHAI3()
 *   .use(screensets())
 *   .use(themes())
 *   .use(layout())
 *   .build();
 * ```
 */
export interface HAI3AppBuilder {
  /**
   * Add a plugin to the application.
   *
   * @param plugin - Plugin instance or factory
   * @returns Builder for chaining
   */
  use(plugin: HAI3Plugin | PluginFactory): HAI3AppBuilder;

  /**
   * Add multiple plugins at once.
   *
   * @param plugins - Array of plugins or factories
   * @returns Builder for chaining
   */
  useAll(plugins: Array<HAI3Plugin | PluginFactory>): HAI3AppBuilder;

  /**
   * Build the application.
   * Resolves dependencies, initializes plugins, and returns the app.
   *
   * @returns The built HAI3 application
   */
  build(): HAI3App;
}

// ============================================================================
// Built App Interface
// ============================================================================

/**
 * Theme Configuration
 * Configuration for a theme.
 */
export interface ThemeConfig {
  /** Theme ID */
  id: string;
  /** Theme name */
  name: string;
  /** CSS custom properties */
  variables: Record<string, string>;
  /** Whether this is the default theme */
  default?: boolean;
}

/**
 * Theme Registry Interface
 * Registry for managing themes.
 */
export interface ThemeRegistry {
  /**
   * Register a theme.
   *
   * @param config - Theme configuration with CSS variable map
   */
  register(config: ThemeConfig): void;

  /** Get theme by ID */
  get(id: string): ThemeConfig | undefined;
  /** Get all themes */
  getAll(): ThemeConfig[];
  /** Apply a theme */
  apply(id: string): void;
  /** Get current theme */
  getCurrent(): ThemeConfig | undefined;

  /**
   * Subscribe to theme changes.
   * @param callback - Called when theme changes
   * @returns Unsubscribe function
   */
  subscribe(callback: () => void): () => void;

  /**
   * Get current version number.
   * Used by React for re-rendering on theme changes.
   */
  getVersion(): number;
}

/**
 * MFE-enabled ScreensetsRegistry (optional)
 * When the microfrontends plugin is used, this registry is available.
 * It provides MFE capabilities: registerDomain(), registerExtension(), etc.
 */
export type MfeScreensetsRegistry = import('@gears-frontx/screensets').ScreensetsRegistry;

/**
 * HAI3 App Interface
 * The built application with all features available.
 *
 * @example
 * ```typescript
 * const app = createHAI3App();
 *
 * // Access store
 * const state = app.store.getState();
 *
 * // Access actions
 * app.actions.mountExtension(extensionId);
 *
 * // Access MFE registry (if microfrontends plugin is used)
 * if (app.screensetsRegistry) {
 *   app.screensetsRegistry.registerDomain(myDomain, containerProvider);
 * }
 * ```
 */
export interface HAI3App {
  /** Application configuration */
  config: HAI3Config;

  /** Redux store */
  store: HAI3Store;

  /** Theme registry */
  themeRegistry: ThemeRegistry;

  /** API registry */
  apiRegistry: ApiRegistry;

  /** I18n registry */
  i18nRegistry: I18nRegistry;

  /** MFE-enabled ScreensetsRegistry (optional, provided by microfrontends plugin) */
  screensetsRegistry?: MfeScreensetsRegistry;

  /** All registered actions (type-safe via HAI3Actions interface) */
  actions: HAI3Actions;

  /** Destroy the application and cleanup resources */
  destroy(): void;
}

// ============================================================================
// Create HAI3 App Function Signature
// ============================================================================

/**
 * Create HAI3 App Function Signature
 * Creates a fully configured HAI3 application using the full preset.
 *
 * @param config - Optional configuration
 * @returns The built HAI3 application
 *
 * @example
 * ```typescript
 * // Default - uses full() preset
 * const app = createHAI3App();
 *
 * // With configuration
 * const app = createHAI3App({ devMode: true });
 * ```
 */
export type CreateHAI3App = (config?: HAI3Config) => HAI3App;

/**
 * Create HAI3 Function Signature
 * Creates a HAI3 app builder for custom plugin composition.
 *
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
export type CreateHAI3 = () => HAI3AppBuilder;

// ============================================================================
// Preset Types
// ============================================================================

/**
 * Preset Type
 * A preset is a function that returns an array of plugins.
 *
 * @example
 * ```typescript
 * const minimal: Preset = () => [
 *   screensets({ autoDiscover: true }),
 *   themes(),
 * ];
 * ```
 */
export type Preset = () => HAI3Plugin[];

/**
 * Presets Collection
 * Available presets for different use cases.
 */
export interface Presets {
  /** All plugins - default for hai3 create */
  full: Preset;
  /** Screensets + themes only */
  minimal: Preset;
  /** Screensets only - for external platform integration */
  headless: Preset;
}

// ============================================================================
// Plugin Configurations
// ============================================================================

/**
 * Screensets Plugin Configuration
 * Configuration options for the screensets plugin.
 */
export interface ScreensetsConfig {
  /** Auto-discover screensets via glob */
  autoDiscover?: boolean;
  /** Glob pattern for screenset discovery */
  globPattern?: string;
}

/**
 * Themes Plugin Configuration
 * Configuration options for the themes plugin.
 */
export type ThemesConfig = Record<string, never>;

// ============================================================================
// Action Payloads
// ============================================================================

/**
 * Show Popup Payload
 */
export interface ShowPopupPayload {
  id: string;
  title?: string;
  content?: () => Promise<{ default: React.ComponentType }>;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
}

/**
 * Change Theme Payload
 */
export interface ChangeThemePayload {
  themeId: string;
}

/**
 * Theme Propagation Failed Payload
 * Emitted when parent theme applies but MFE propagation fails.
 */
export interface ThemePropagationFailedPayload {
  themeId: string;
  error: unknown;
}

/**
 * Set Language Payload
 */
export interface SetLanguagePayload {
  language: string;
}

/**
 * Language Propagation Failed Payload
 * Emitted when parent language applies but MFE propagation fails.
 */
export interface LanguagePropagationFailedPayload {
  language: string;
  error: unknown;
}
