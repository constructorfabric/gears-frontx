/**
 * Plugin exports
 */

export { themes } from './themes';
export { layout } from './layout';
export { i18n } from './i18n';
export { effects } from './effects';
export {
  auth,
  frontxApiTransport,
  type AuthPluginConfig,
  type AuthRuntime,
  type AuthTransportBinding,
  type AuthTransportBinder,
  type Hai3ApiAuthTransportConfig,
} from './auth';
export { mock, type MockPluginConfig } from './mock';
export {
  queryCache,
  queryCacheShared,
  subscribeQueryCacheRuntimeChanged,
  type QueryCacheConfig,
} from './queryCache';
export {
  microfrontends,
  // MFE actions
  loadExtension,
  mountExtension,
  unmountExtension,
  registerExtension,
  unregisterExtension,
  // MFE slice and selectors
  selectExtensionState,
  selectRegisteredExtensions,
  selectMountedExtensions,
  selectExtensionError,
  // Types
  type MfeState,
  type ExtensionRegistrationState,
  type RegisterExtensionPayload,
  type UnregisterExtensionPayload,
  type MicrofrontendsConfig,
  // FrontX layout domain constants
  FRONTX_POPUP_DOMAIN,
  FRONTX_SIDEBAR_DOMAIN,
  FRONTX_SCREEN_DOMAIN,
  FRONTX_OVERLAY_DOMAIN,
  // Base ExtensionDomain constants
  screenDomain,
  sidebarDomain,
  popupDomain,
  overlayDomain,
} from './microfrontends';
