/**
 * @gears-frontx/screensets
 *
 * Pure TypeScript contracts and registry for HAI3 screenset management.
 * This package has ZERO dependencies - SDK Layer (L1).
 *
 * Screensets are HAI3's first-class citizen - self-contained vertical slices
 * that can be composed into applications or injected into external platforms.
 *
 * NOTE: Translations are NOT part of this package. Use @gears-frontx/i18n for translations.
 * Screensets register translations directly with i18nRegistry via framework.
 *
 * @example
 * ```typescript
 * import { LayoutDomain } from '@gears-frontx/screensets';
 *
 * // LayoutDomain is used by framework layout slices
 * const visibleDomains = [
 *   LayoutDomain.Header,
 *   LayoutDomain.Menu,
 *   LayoutDomain.Screen
 * ];
 * ```
 */
// @cpt-dod:cpt-hai3-dod-screenset-registry-layer-constraints:p1

// ============================================================================
// Layout Domain Enum
// ============================================================================

export { LayoutDomain } from './types';

// ============================================================================
// MFE (Microfrontend) Support
// ============================================================================

// Type System Plugin
export type {
  JSONSchema,
  ValidationError,
  ValidationResult,
  TypeSystemPlugin,
} from './mfe';

// MFE TypeScript Interfaces
export type {
  MfeEntry,
  MfeEntryMF,
  ExtensionDomain,
  Extension,
  ScreenExtension,
  ExtensionPresentation,
  SharedProperty,
  Action,
  ActionsChain,
  LifecycleStage,
  LifecycleHook,
  // Action payloads
  LoadExtPayload,
  MountExtPayload,
  UnmountExtPayload,
  // Handler types
  ParentMfeBridge,
  ChildMfeBridge,
  MfeEntryLifecycle,
} from './mfe';

// MFE Handler Abstract Classes (concrete implementations are internal)
export { MfeHandler, MfeBridgeFactory } from './mfe';

// HAI3 Action Constants
export {
  FRONTX_SCREEN_EXTENSION_TYPE,
  FRONTX_MFE_ENTRY_MF,
  FRONTX_ACTION_LOAD_EXT,
  FRONTX_ACTION_MOUNT_EXT,
  FRONTX_ACTION_UNMOUNT_EXT,
} from './mfe';

// HAI3 Shared Property Constants
export {
  FRONTX_SHARED_PROPERTY_THEME,
  FRONTX_SHARED_PROPERTY_LANGUAGE,
} from './mfe';

// MFE Runtime (ScreensetsRegistry - the MFE-enabled registry)
export { ScreensetsRegistry, ScreensetsRegistryFactory, screensetsRegistryFactory, ContainerProvider } from './mfe';
export type { ScreensetsRegistryConfig } from './mfe';

// Shadow DOM Utilities
export { createShadowRoot, injectCssVariables } from './mfe';

// GTS Utilities
export { extractGtsPackage } from './mfe';

// NOTE: GTS Plugin is NOT re-exported here to avoid pulling in @globaltypesystem/gts-ts
// for consumers who don't need it. Import directly from '@gears-frontx/screensets/plugins/gts'
