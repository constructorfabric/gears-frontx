/**
 * Plugin exports
 */

export { screensets } from './screensets';
export { themes } from './themes';
export { layout } from './layout';
export { i18n } from './i18n';
export { effects } from './effects';
export { mock, type MockPluginConfig } from './mock';
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
  selectExtensionError,
  // Types
  type MfeState,
  type ExtensionRegistrationState,
  type RegisterExtensionPayload,
  type UnregisterExtensionPayload,
  type MicrofrontendsConfig,
  // HAI3 layout domain constants
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
