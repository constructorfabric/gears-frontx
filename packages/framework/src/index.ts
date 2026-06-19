/**
 * @gears-frontx/framework - HAI3 Framework Package
 *
 * This package provides:
 * - Plugin architecture for composable HAI3 applications
 * - Registries for screensets, themes, routes
 * - Presets for common configurations
 * - Re-exports from SDK packages for convenience
 *
 * Framework Layer: L2 (Depends on all SDK packages)
 */

// @cpt-dod:cpt-hai3-dod-framework-composition-reexports:p1

// ============================================================================
// Core Exports
// ============================================================================

export { createHAI3 } from './createHAI3';
export { createHAI3App, type HAI3AppConfig } from './createHAI3App';

// ============================================================================
// Plugin Exports
// ============================================================================

export {
  screensets,
  themes,
  layout,
  i18n,
  effects,
  mock,
  microfrontends,
  type MockPluginConfig,
} from './plugins';

// MFE Plugin Exports
export {
  loadExtension,
  mountExtension,
  unmountExtension,
  registerExtension,
  unregisterExtension,
  selectExtensionState,
  selectRegisteredExtensions,
  selectExtensionError,
  FRONTX_POPUP_DOMAIN,
  FRONTX_SIDEBAR_DOMAIN,
  FRONTX_SCREEN_DOMAIN,
  FRONTX_OVERLAY_DOMAIN,
  // Base ExtensionDomain constants
  screenDomain,
  sidebarDomain,
  popupDomain,
  overlayDomain,
} from './plugins';

// MFE Type Constants (re-exported from @gears-frontx/screensets for convenience)
export {
  FRONTX_SCREEN_EXTENSION_TYPE,
  FRONTX_MFE_ENTRY_MF,
} from '@gears-frontx/screensets';

// MFE Action Constants (re-exported from @gears-frontx/screensets for convenience)
export {
  FRONTX_ACTION_LOAD_EXT,
  FRONTX_ACTION_MOUNT_EXT,
  FRONTX_ACTION_UNMOUNT_EXT,
} from '@gears-frontx/screensets';

// MFE Shared Property Constants (re-exported from @gears-frontx/screensets for convenience)
export {
  FRONTX_SHARED_PROPERTY_THEME,
  FRONTX_SHARED_PROPERTY_LANGUAGE,
} from '@gears-frontx/screensets';

// MFE Types (re-exported from @gears-frontx/screensets for convenience)
export type {
  ChildMfeBridge,
  ParentMfeBridge,
  Extension,
  ScreenExtension,
  ExtensionPresentation,
  ExtensionDomain,
  ActionsChain,
  Action,
  SharedProperty,
  LifecycleStage,
  LifecycleHook,
  MfeEntryLifecycle,
  MfeEntry,
  MfeEntryMF,
  JSONSchema,
  ValidationError,
  ValidationResult,
  LoadExtPayload,
  MountExtPayload,
  UnmountExtPayload,
  ScreensetsRegistryConfig,
  TypeSystemPlugin,
} from '@gears-frontx/screensets';

// MFE Abstract Classes (re-exported from @gears-frontx/screensets for convenience)
export {
  MfeHandler,
  MfeBridgeFactory,
  ScreensetsRegistry,
  ScreensetsRegistryFactory,
  screensetsRegistryFactory,
  ContainerProvider,
} from '@gears-frontx/screensets';

// MFE Concrete Implementations (re-exported from @gears-frontx/screensets subpath exports)
export { MfeHandlerMF } from '@gears-frontx/screensets/mfe/handler';
export { gtsPlugin } from '@gears-frontx/screensets/plugins/gts';

// GTS Derived Schemas (application-layer registration)
export { themeSchema, languageSchema, extensionScreenSchema } from './gts';

// MFE Utilities (re-exported from @gears-frontx/screensets for convenience)
export {
  createShadowRoot,
  injectCssVariables,
  extractGtsPackage,
} from '@gears-frontx/screensets';

// MFE Plugin Types
export type {
  MfeState,
  ExtensionRegistrationState,
  RegisterExtensionPayload,
  UnregisterExtensionPayload,
  MicrofrontendsConfig,
} from './plugins';

// ============================================================================
// Preset Exports
// ============================================================================

export { presets, full, minimal, headless, type FullPresetConfig } from './presets';

// ============================================================================
// Registry Exports
// ============================================================================

export {
  createThemeRegistry,
} from './registries';

// ============================================================================
// Type Exports
// ============================================================================

export type {
  HAI3Config,
  HAI3Plugin,
  HAI3AppBuilder,
  HAI3App,
  PluginFactory,
  PluginProvides,
  PluginLifecycle,
  ThemeRegistry,
  ThemeConfig,
  RouterMode,
  Preset,
  Presets,
  ScreensetsConfig,
  ThemesConfig,
  ShowPopupPayload,
  ChangeThemePayload,
  ThemePropagationFailedPayload,
  SetLanguagePayload,
  LanguagePropagationFailedPayload,
} from './types';

// ============================================================================
// Re-exports from SDK packages for convenience
// ============================================================================

// From @gears-frontx/state (unified Flux dataflow pattern)
export { eventBus, createStore, getStore, registerSlice, hasSlice, createSlice } from '@gears-frontx/state';
export type {
  EventBus,
  ReducerPayload,
  EventPayloadMap,
  EventHandler,
  Subscription,
  RootState,
  AppDispatch,
  SliceObject,
  EffectInitializer,
} from '@gears-frontx/state';

// Re-export HAI3Store from types (wrapped version)
export type { HAI3Store } from './types';

// From @gears-frontx/screensets (contracts only - SDK Layer L1)
export { LayoutDomain } from '@gears-frontx/screensets';

// Layout slices (owned by @gears-frontx/framework)
export {
  layoutReducer,
  layoutDomainReducers,
  LAYOUT_SLICE_NAME,
  // Tenant slice (app-level, not layout)
  TENANT_SLICE_NAME,
  tenantSlice,
  tenantActions,
  tenantReducer,
  setTenant,
  setTenantLoading,
  clearTenant,
  // Mock slice (app-level, not layout)
  mockSlice,
  mockActions,
  setMockEnabled,
  // Domain slices
  headerSlice,
  footerSlice,
  menuSlice,
  sidebarSlice,
  screenSlice,
  popupSlice,
  overlaySlice,
  // Domain actions
  headerActions,
  footerActions,
  menuActions,
  sidebarActions,
  screenActions,
  popupActions,
  overlayActions,
  // Individual reducer functions - header
  setUser,
  setHeaderLoading,
  clearUser,
  // Individual reducer functions - footer
  setFooterVisible,
  setFooterConfig,
  toggleMenu,
  setMenuCollapsed,
  setMenuItems,
  setMenuVisible,
  setMenuConfig,
  toggleSidebar,
  setSidebarCollapsed,
  setSidebarPosition,
  setSidebarTitle,
  setSidebarContent,
  setSidebarVisible,
  setSidebarWidth,
  setSidebarConfig,
  setActiveScreen,
  setScreenLoading,
  navigateTo,
  clearActiveScreen,
  openPopup,
  closePopup,
  closeTopPopup,
  closeAllPopups,
  showOverlay,
  hideOverlay,
  setOverlayVisible,
} from './slices';

// PopupSliceState type
export type { PopupSliceState } from './slices';

// Layout state types (defined locally to avoid circular deps with uicore/react)
export type {
  // App-level types
  Tenant,
  TenantState,
  // Layout domain types
  HeaderUser,
  HeaderState,
  HeaderConfig,
  FooterState,
  FooterConfig,
  MenuItem,
  MenuState,
  SidebarPosition,
  SidebarState,
  ScreenState,
  PopupState,
  PopupConfig,
  OverlayState,
  OverlayConfig,
  LayoutState,
  LayoutDomainState,
  RootStateWithLayout,
  LayoutDomainReducers,
} from './layoutTypes';

// Mock state type
export type { MockState } from './slices/mockSlice';

// Tenant effects and events
export {
  initTenantEffects,
  TenantEvents,
} from './effects/tenantEffects';
export type { TenantChangedPayload, TenantClearedPayload } from './effects/tenantEffects';
export {
  changeTenant,
  clearTenantAction,
  setTenantLoadingState,
} from './effects/tenantActions';

// Mock effects and events
export {
  initMockEffects,
  toggleMockMode,
  MockEvents,
} from './effects/mockEffects';
export type { MockTogglePayload } from './effects/mockEffects';

// From @gears-frontx/api
export {
  apiRegistry,
  BaseApiService,
  RestProtocol,
  SseProtocol,
  // Protocol-specific mock plugins (replaces generic MockPlugin)
  RestMockPlugin,
  SseMockPlugin,
  MockEventSource,
  // Plugin base classes
  ApiPluginBase,
  ApiPlugin,
  ApiProtocol,
  RestPlugin,
  RestPluginWithConfig,
  SsePlugin,
  SsePluginWithConfig,
  // Type guards
  isShortCircuit,
  isRestShortCircuit,
  isSseShortCircuit,
  // Mock plugin identification
  MOCK_PLUGIN,
  isMockPlugin,
} from '@gears-frontx/api';
export type {
  MockMap,
  ApiServiceConfig,
  JsonValue,
  JsonObject,
  JsonPrimitive,
  JsonCompatible,
  SseProtocolConfig,
  RestProtocolConfig,
  // Plugin context types (class-based plugin system)
  ApiRequestContext,
  ApiResponseContext,
  ShortCircuitResponse,
  PluginClass,
  ProtocolClass,
  ProtocolPluginType,
  BasePluginHooks,
  // Protocol-specific types
  RestPluginHooks,
  SsePluginHooks,
  RestRequestContext,
  RestResponseContext,
  ApiPluginErrorContext,
  SseConnectContext,
  EventSourceLike,
  RestShortCircuitResponse,
  SseShortCircuitResponse,
  RestMockConfig,
  SseMockConfig,
  SseMockEvent,
} from '@gears-frontx/api';


// NOTE: AccountsApiService, ACCOUNTS_DOMAIN, and account types (ApiUser, UserRole, etc.)
// have been moved to CLI templates. They are now generated by `hai3 scaffold layout`
// and should be imported from user code (e.g., @/layout/api or @/api).

// From @gears-frontx/i18n
export { i18nRegistry, I18nRegistryImpl, createI18nRegistry, Language, SUPPORTED_LANGUAGES, getLanguageMetadata, TextDirection, LanguageDisplayMode } from '@gears-frontx/i18n';
export type { I18nConfig, TranslationLoader, TranslationMap, TranslationDictionary, LanguageMetadata, I18nRegistry as I18nRegistryType } from '@gears-frontx/i18n';

// Formatters (locale from i18nRegistry.getLanguage())
export {
  formatDate,
  formatTime,
  formatDateTime,
  formatRelative,
  formatNumber,
  formatPercent,
  formatCompact,
  formatCurrency,
  compareStrings,
  createCollator,
  type DateFormatStyle,
  type TimeFormatStyle,
  type DateInput,
} from '@gears-frontx/i18n';
export type { Formatters } from '@gears-frontx/i18n';

// Backward compatibility aliases
// I18nRegistry type (capital I) - alias for consistency with old @gears-frontx/uicore API
export { I18nRegistryImpl as I18nRegistry } from '@gears-frontx/i18n';

// Backward compatibility constants
export {
  ACCOUNTS_DOMAIN,
} from './compat';

// ============================================================================
// Migration Helpers (for @gears-frontx/uicore backward compatibility)
// ============================================================================

export {
  createLegacySelector,
  setDeprecationWarnings,
  isDeprecationWarningsEnabled,
  getLayoutDomainState,
  hasLegacyUicoreState,
  hasNewLayoutState,
  STATE_PATH_MAPPING,
} from './migration';

export type {
  LegacyUicoreState,
  LegacyRootState,
  Selector,
} from './migration';
