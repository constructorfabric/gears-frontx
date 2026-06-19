/**
 * MFE (Microfrontend) support exports
 *
 * @packageDocumentation
 */

// Type System Plugin
export type {
  JSONSchema,
  ValidationError,
  ValidationResult,
  TypeSystemPlugin,
} from './plugins';

// NOTE: GTS Plugin is NOT re-exported here to avoid pulling in @globaltypesystem/gts-ts
// for consumers who don't need it. Import directly from '@gears-frontx/screensets/plugins/gts'

// HAI3 Type Constants
export {
  FRONTX_SCREEN_EXTENSION_TYPE,
  FRONTX_MFE_ENTRY_MF,
} from './constants';

// HAI3 Action Constants
export {
  FRONTX_ACTION_LOAD_EXT,
  FRONTX_ACTION_MOUNT_EXT,
  FRONTX_ACTION_UNMOUNT_EXT,
} from './constants';

// HAI3 Shared Property Constants
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
} from './types';

// Runtime (includes factory)
export { ScreensetsRegistry, ScreensetsRegistryFactory, screensetsRegistryFactory, ContainerProvider } from './runtime';
export type { ScreensetsRegistryConfig } from './runtime';

// Handler Types and Abstract Classes (concrete implementations are internal)
export type {
  ParentMfeBridge,
  ChildMfeBridge,
  MfeEntryLifecycle,
} from './handler/types';
export { MfeHandler, MfeBridgeFactory } from './handler/types';

// Shadow DOM Utilities
export {
  createShadowRoot,
  injectCssVariables,
} from './shadow';

// GTS Utilities
export { extractGtsPackage } from './gts';

// NOTE: Shared Properties Provider and Runtime Coordination
// are INTERNAL implementation details of ScreensetsRegistry and are NOT publicly exported.
// These are encapsulated within the registry class per SOLID principles.
// If you need these for internal development or testing, import directly from the source files.
