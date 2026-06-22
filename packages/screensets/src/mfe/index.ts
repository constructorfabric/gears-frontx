/**
 * MFE (Microfrontend) support exports
 *
 * @packageDocumentation
 */

// Type System Plugin
export type { JSONSchema, TypeSystemPlugin } from './plugins';

// NOTE: GTS Plugin is NOT re-exported here to avoid pulling in @globaltypesystem/gts-ts
// for consumers who don't need it. Import directly from '@gears-frontx/screensets/plugins/gts'

// FrontX Type Constants
export {
  FRONTX_SCREEN_EXTENSION_TYPE,
  FRONTX_MFE_ENTRY_MF,
} from './constants';

// FrontX Action Constants
export {
  FRONTX_ACTION_LOAD_EXT,
  FRONTX_ACTION_MOUNT_EXT,
  FRONTX_ACTION_UNMOUNT_EXT,
} from './constants';

// FrontX Shared Property Constants
export {
  FRONTX_SHARED_PROPERTY_THEME,
  FRONTX_SHARED_PROPERTY_LANGUAGE,
} from './constants';

// TypeScript Interfaces
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
  LoadExtPayload,
  MountExtPayload,
  UnmountExtPayload,
  // MF2 manifest types
  MfManifest,
  MfManifestMetaData,
  MfManifestRemoteEntry,
  MfManifestBuildInfo,
  MfManifestShared,
  MfManifestAssets,
} from './types';

// Runtime (includes factory and new abstractions)
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
} from './runtime';
export type {
  MfeRegistryConfig,
  ContainerHooks,
  ActionPayload,
  DomainContext,
} from './runtime';

// Handler Types and Abstract Classes (concrete implementations are internal)
export {
  ParentMfeBridge,
  ChildMfeBridge,
} from './handler/types';
export type {
  MfeMountContext,
  MfeEntryLifecycle,
} from './handler/types';
export { MfeHandler, MfeBridgeFactory } from './handler/types';

// Mediator types
export { ActionHandler } from './mediator';

// Shadow DOM Utilities
export {
  createShadowRoot,
  injectCssVariables,
} from './shadow';

// GTS Utilities
export { extractGtsPackage } from './gts';

// NOTE: Shared Properties Provider and Runtime Coordination
// are INTERNAL implementation details of MfeRegistry and are NOT publicly exported.
// These are encapsulated within the registry class per SOLID principles.
// If you need these for internal development or testing, import directly from the source files.
