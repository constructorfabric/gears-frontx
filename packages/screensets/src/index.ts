/**
 * @cyberfabric/screensets
 *
 * Pure TypeScript contracts and registry for FrontX screenset management.
 * This package has ZERO dependencies - SDK Layer (L1).
 *
 * Screensets are FrontX's first-class citizen - self-contained vertical slices
 * that can be composed into applications or injected into external platforms.
 *
 * NOTE: Translations are NOT part of this package. Use @cyberfabric/i18n for translations.
 * Screensets register translations directly with i18nRegistry via framework.
 *
 * @example
 * ```typescript
 * import { LayoutDomain } from '@cyberfabric/screensets';
 *
 * // LayoutDomain is used by framework layout slices
 * const visibleDomains = [
 *   LayoutDomain.Header,
 *   LayoutDomain.Menu,
 *   LayoutDomain.Screen
 * ];
 * ```
 */
// @cpt-dod:cpt-frontx-dod-mfe-registry-layer-constraints:p1

// ============================================================================
// Layout Domain Enum
// ============================================================================

export { LayoutDomain } from './types';

// ============================================================================
// MFE (Microfrontend) Support
// ============================================================================

// Type System Plugin
export type { JSONSchema, TypeSystemPlugin } from './mfe';

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
  MfeMountContext,
  MfeEntryLifecycle,
  // MF2 manifest types
  MfManifest,
  MfManifestMetaData,
  MfManifestRemoteEntry,
  MfManifestBuildInfo,
  MfManifestShared,
  MfManifestAssets,
} from './mfe';

// MFE Handler Abstract Classes (concrete implementations are internal)
export { MfeHandler, MfeBridgeFactory } from './mfe';
export { ParentMfeBridge, ChildMfeBridge } from './mfe';

// Mediator types needed by MFE consumers to implement action handlers
export { ActionHandler } from './mfe';

// FrontX Action Constants
export {
  HAI3_SCREEN_EXTENSION_TYPE,
  HAI3_MFE_ENTRY_MF,
  HAI3_ACTION_LOAD_EXT,
  HAI3_ACTION_MOUNT_EXT,
  HAI3_ACTION_UNMOUNT_EXT,
} from './mfe';

// FrontX Shared Property Constants
export {
  HAI3_SHARED_PROPERTY_THEME,
  HAI3_SHARED_PROPERTY_LANGUAGE,
} from './mfe';

// MFE Runtime (MfeRegistry - the MFE-enabled registry)
export {
  MfeRegistry,
  MfeRegistryFactory,
  mfeRegistryFactory,
  // Mount strategy abstractions and shipped strategies
  MountStrategy,
  ConcurrentMountStrategy,
  OptionalMountStrategy,
  ExclusiveMountStrategy,
  // Domain implementation abstractions
  ExtensionDomainImplementation,
  ExtensionDomainImplementationFactory,
  ExtensionMounter,
  DomainLifecycleTrigger,
} from './mfe';
export type {
  MfeRegistryConfig,
  ContainerHooks,
  ActionPayload,
  DomainContext,
} from './mfe';

// Shadow DOM Utilities
export { createShadowRoot, injectCssVariables } from './mfe';

// GTS Utilities
export { extractGtsPackage } from './mfe';

// NOTE: GTS Plugin is NOT re-exported here to avoid pulling in @globaltypesystem/gts-ts
// for consumers who don't need it. Import directly from '@cyberfabric/screensets/plugins/gts'
