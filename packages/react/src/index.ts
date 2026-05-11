/**
 * @cyberfabric/react - React Bindings
 *
 * This package provides:
 * - HAI3Provider context provider
 * - Type-safe hooks for state and actions
 * - MFE context, hooks, and components
 *
 * Layer: L3 (Depends on @cyberfabric/framework)
 */

// ============================================================================
// Provider
// ============================================================================

export { HAI3Provider } from './HAI3Provider';
export { HAI3Context, useHAI3 } from './HAI3Context';
export { invalidateQueryCacheForApp } from './queryClient';

// ============================================================================
// Hooks
// ============================================================================

export {
  useAppDispatch,
  useAppSelector,
  useTranslation,
  useScreenTranslations,
  useFormatters,
  useTheme,
  useApiQuery,
  useApiSuspenseQuery,
  useApiInfiniteQuery,
  useApiSuspenseInfiniteQuery,
  useApiMutation,
  useApiStream,
  useQueryCache,
} from './hooks';

export type { ApiQueryOverrides } from './hooks/useApiQuery';
export type {
  ApiInfiniteQueryOptions,
  ApiInfiniteQueryPageContext,
} from './hooks/useApiInfiniteQuery';
export type { UseApiMutationOptions } from './hooks/useApiMutation';
export type { ApiStreamOptions, ApiStreamResult } from './hooks/useApiStream';
export type {
  QueryCache,
  QueryCacheInvalidateFilters,
  QueryCacheState,
  MutationCallbackContext,
} from './hooks/QueryCache';

// ============================================================================
// MFE Context and Hooks
// ============================================================================

export {
  MfeContext,
  useMfeContext,
  MfeProvider,
  useMfeBridge,
  ThemeAwareReactLifecycle,
  useSharedProperty,
  useHostAction,
  useDomainExtensions,
  useMountedExtensions,
  useRegisteredPackages,
  ExtensionDomainSlot,
} from './mfe';

export type {
  MfeContextValue,
  MfeProviderProps,
  ExtensionDomainSlotProps,
} from './mfe';

// ============================================================================
// Type Exports
// ============================================================================

export type {
  HAI3ProviderProps,
  UseHAI3Return,
  UseAppSelector,
  UseAppDispatchReturn,
  UseTranslationReturn,
  UseScreenTranslationsReturn,
  UseFormattersReturn,
  UseThemeReturn,
  ApiQueryResult,
  ApiSuspenseQueryResult,
  ApiInfiniteQueryResult,
  ApiSuspenseInfiniteQueryResult,
  ApiMutationResult,
} from './types';

// ============================================================================
// Re-exports from @cyberfabric/framework for convenience
// ============================================================================

// These re-exports allow users to import everything from @cyberfabric/react
// without needing to import from @cyberfabric/framework directly

export {
  // Core
  createHAI3,
  createHAI3App,
  presets,

  // Backward compatibility constants
  ACCOUNTS_DOMAIN,

  // I18nRegistry class (capital I for backward compat)
  I18nRegistry,

  // Plugins
  themes,
  layout,
  i18n,
  effects,
  queryCache,
  queryCacheShared,
  subscribeQueryCacheRuntimeChanged,

  // Registries
  createThemeRegistry,

  // Flux (Event bus + Store)
  // NOTE: eventBus is re-exported separately below with augmented EventPayloadMap type

  // Store
  createStore,
  getStore,
  registerSlice,
  hasSlice,
  createSlice,

  // Layout domain exports
  LayoutDomain,
  layoutReducer,
  layoutDomainReducers,
  LAYOUT_SLICE_NAME,
  headerSlice,
  footerSlice,
  menuSlice,
  sidebarSlice,
  popupSlice,
  overlaySlice,
  headerActions,
  footerActions,
  menuActions,
  sidebarActions,
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
  openPopup,
  closePopup,
  closeTopPopup,
  closeAllPopups,
  showOverlay,
  hideOverlay,
  setOverlayVisible,

  // Tenant (app-level, not layout)
  TENANT_SLICE_NAME,
  tenantSlice,
  tenantActions,
  tenantReducer,
  setTenant,
  setTenantLoading,
  clearTenant,
  // Tenant effects and events
  initTenantEffects,
  changeTenant,
  clearTenantAction,
  setTenantLoadingState,
  TenantEvents,

  // Mock (app-level, not layout)
  mockSlice,
  mockActions,
  setMockEnabled,
  // Mock effects and events
  initMockEffects,
  toggleMockMode,
  MockEvents,

  // Auth
  auth,
  hai3ApiTransport,

  // API
  apiRegistry,
  BaseApiService,
  RestProtocol,
  RestEndpointProtocol,
  SseProtocol,
  SseStreamProtocol,
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

  // I18n
  i18nRegistry,
  I18nRegistryImpl,
  createI18nRegistry,
  SUPPORTED_LANGUAGES,
  getLanguageMetadata,
} from '@cyberfabric/framework';

// Re-export i18n types from @cyberfabric/framework (correct layer access)
export { Language, TextDirection, LanguageDisplayMode } from '@cyberfabric/framework';

// Re-export types from @cyberfabric/framework
export type {
  // Config
  HAI3Config,
  HAI3Plugin,
  HAI3AppBuilder,
  HAI3App,
  // Endpoint descriptors — L3 components import from @cyberfabric/react
  EndpointOptions,
  EndpointDescriptor,
  ParameterizedEndpointDescriptor,
  MutationDescriptor,
  // Stream descriptors
  StreamDescriptor,
  StreamStatus,
  PluginFactory,
  PluginProvides,
  PluginLifecycle,
  ThemeRegistry,
  ThemeConfig,
  Preset,
  Presets,
  ShowPopupPayload,
  ChangeThemePayload,
  SetLanguagePayload,
  AuthPluginConfig,
  AuthRuntime,

  // Auth contract types
  AuthProvider,
  AuthSession,
  AuthContext,
  AuthCheckResult,
  AuthLoginInput,
  AuthCallbackInput,
  AuthTransition,
  AuthPermissions,
  AccessQuery,
  AccessDecision,
  AuthCapabilities,
  AuthState,
  AuthStateEvent,
  AuthStateListener,
  AuthUnsubscribe,

  // Flux (Events + Store)
  EventHandler,
  Subscription,

  // Store
  RootState,
  AppDispatch,
  SliceObject,
  HAI3Store,
  ReducerPayload,

  // Layout
  LayoutDomainState,
  HeaderUser,
  HeaderConfig,
  HeaderState,
  FooterConfig,
  FooterState,
  MenuItem,
  MenuState,
  SidebarPosition,
  SidebarState,
  PopupConfig,
  PopupState,
  PopupSliceState,
  OverlayConfig,
  OverlayState,
  LayoutState,
  RootStateWithLayout,
  LayoutDomainReducers,

  // Tenant types
  Tenant,
  TenantState,
  TenantChangedPayload,
  TenantClearedPayload,

  // Mock types
  MockState,
  MockTogglePayload,

  // API
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

  // I18n
  I18nConfig,
  TranslationLoader,
  TranslationMap,
  TranslationDictionary,
  LanguageMetadata,
  I18nRegistryType,
} from '@cyberfabric/framework';

// ============================================================================
// MFE Re-exports from @cyberfabric/framework (Layering Compliance)
// ============================================================================

// MFE Plugin factories
export {
  microfrontends,
  mock,
} from '@cyberfabric/framework';

// MFE Action functions
export {
  loadExtension,
  mountExtension,
  unmountExtension,
  registerExtension,
  unregisterExtension,
} from '@cyberfabric/framework';

// MFE Selectors
export {
  selectExtensionState,
  selectRegisteredExtensions,
  selectExtensionError,
  selectMountedExtensions,
} from '@cyberfabric/framework';

// MFE Domain constants
export {
  HAI3_POPUP_DOMAIN,
  HAI3_SIDEBAR_DOMAIN,
  HAI3_SCREEN_DOMAIN,
  HAI3_OVERLAY_DOMAIN,
  // Base ExtensionDomain constants
  screenDomain,
  sidebarDomain,
  popupDomain,
  overlayDomain,
} from '@cyberfabric/framework';

// MFE Type constants
export {
  HAI3_SCREEN_EXTENSION_TYPE,
  HAI3_MFE_ENTRY_MF,
} from '@cyberfabric/framework';

// MFE Action constants
export {
  HAI3_ACTION_LOAD_EXT,
  HAI3_ACTION_MOUNT_EXT,
  HAI3_ACTION_UNMOUNT_EXT,
} from '@cyberfabric/framework';

// MFE Shared Property constants
export {
  HAI3_SHARED_PROPERTY_THEME,
  HAI3_SHARED_PROPERTY_LANGUAGE,
} from '@cyberfabric/framework';

// MFE Types
export type {
  MfeMountContext,
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
  LoadExtPayload,
  MountExtPayload,
  UnmountExtPayload,
  MfeRegistryConfig,
  TypeSystemPlugin,
  // MF2 manifest types
  MfManifest,
  MfManifestMetaData,
  MfManifestRemoteEntry,
  MfManifestBuildInfo,
  MfManifestShared,
  MfManifestAssets,
} from '@cyberfabric/framework';

// MFE Abstract classes
export {
  ChildMfeBridge,
  ParentMfeBridge,
  MfeHandler,
  MfeBridgeFactory,
  MfeRegistry,
  MfeRegistryFactory,
  mfeRegistryFactory,
  ActionHandler,
  ExtensionDomainImplementation,
  ExtensionDomainImplementationFactory,
  ExtensionMounter,
  MountStrategy,
  ConcurrentMountStrategy,
  OptionalMountStrategy,
  ExclusiveMountStrategy,
} from '@cyberfabric/framework';

export type {
  ContainerHooks,
  DomainContext,
  ActionPayload,
} from '@cyberfabric/framework';

// MFE Concrete implementations
export { MfeHandlerMF, gtsPlugin } from '@cyberfabric/framework';

// GTS Derived Schemas (application-layer registration)
export { themeSchema, languageSchema, extensionScreenSchema } from '@cyberfabric/framework';

// MFE Utilities
export {
  createShadowRoot,
  injectCssVariables,
  extractGtsPackage,
} from '@cyberfabric/framework';

// MFE Plugin types
export type {
  MfeState,
  ExtensionRegistrationState,
  RegisterExtensionPayload,
  UnregisterExtensionPayload,
} from '@cyberfabric/framework';

// ============================================================================
// Module Augmentation Support - EventPayloadMap Re-declaration
// ============================================================================

/**
 * Re-declare EventPayloadMap to enable module augmentation on @cyberfabric/react
 *
 * This creates a new declaration site in @cyberfabric/react that TypeScript can augment.
 * App-layer code can now use `declare module '@cyberfabric/react'` instead of importing
 * from L1 packages directly, maintaining proper layer architecture.
 *
 * ARCHITECTURE: This pattern allows L3+ code to augment event types without
 * violating layer boundaries by importing from L1 (@cyberfabric/state).
 *
 * IMPORTANT: We must also re-export eventBus with the augmented type to ensure
 * type safety. The eventBus instance uses this augmented EventPayloadMap.
 *
 * @example
 * ```typescript
 * // In app-layer code (e.g., src/app/events/bootstrapEvents.ts)
 * import '@cyberfabric/react';
 *
 * declare module '@cyberfabric/react' {
 *   interface EventPayloadMap {
 *     'app/user/fetch': void;
 *     'app/user/loaded': { user: ApiUser };
 *   }
 * }
 * ```
 */
import type { EventPayloadMap as FrameworkEventPayloadMap, EventBus } from '@cyberfabric/framework';
import { eventBus as frameworkEventBus } from '@cyberfabric/framework';

// @cpt-dod:cpt-frontx-dod-react-bindings-event-payload-map:p2
// @cpt-begin:cpt-frontx-dod-react-bindings-event-payload-map:p2:inst-event-payload-map
export interface EventPayloadMap extends FrameworkEventPayloadMap { }

/**
 * Re-export eventBus with augmented EventPayloadMap type.
 * This ensures that code importing eventBus from @cyberfabric/react gets
 * type-safe access to both framework events and app-layer augmented events.
 */
export const eventBus: EventBus<EventPayloadMap> = frameworkEventBus as EventBus<EventPayloadMap>;
// @cpt-end:cpt-frontx-dod-react-bindings-event-payload-map:p2:inst-event-payload-map
