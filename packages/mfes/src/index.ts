// Manifest types (Phase 5)
export type {
  MfManifest,
  MfManifestAssets,
  MfManifestShared,
  MfManifestMetaData,
  MfManifestRemoteEntry,
  MfManifestBuildInfo,
} from './manifest/mf-manifest';

// Lazy-import ABI runtime registry (Phase 5)
export { LazyLoaderRegistry } from './lazy-loader/lazy-loader-registry';
export type { LazyResolver } from './lazy-loader/lazy-loader-registry';

// Type substrate port (Phase 2)
export type {
  ValidationErrorItem,
  ValidationResult,
  TypeSystemPlugin,
} from './type-substrate';

// Domain types (Phase 3)
export type {
  Action,
  ActionsChain,
  LifecycleStage,
  LifecycleHook,
  ExtensionDomain,
  Extension,
  ScreenExtension,
  ExtensionPresentation,
  MfeEntry,
  SharedProperty,
  LoadExtPayload,
  MountExtPayload,
  UnmountExtPayload,
} from './types';

// Mediator types (Phase 3)
export { ActionHandler, ActionsChainsMediator } from './mediator/types';
export type { ChainResult, ChainExecutionOptions } from './mediator/types';

// Handler type contracts (Phase 3)
export { ParentMfeBridge, ChildMfeBridge, MfeBridgeFactory, MfeHandler } from './handler/types';
export type { MfeEntryLifecycle, MfeMountContext } from './handler/types';

// Registry contracts (Phase 3)
export { MfeRegistry } from './registry/MfeRegistry';
export { MfeRegistryFactory } from './registry/MfeRegistryFactory';
export type { MfeRegistryConfig } from './runtime/config';

// Runtime abstractions (Phase 3)
export { MountStrategy } from './runtime/mount-strategy';
export type { ActionPayload, ContainerHooks } from './runtime/mount-strategy';
export { ConcurrentMountStrategy, OptionalMountStrategy, ExclusiveMountStrategy } from './runtime/mount-strategies';
export { ExtensionDomainImplementation } from './runtime/ExtensionDomainImplementation';
export { ExtensionDomainImplementationFactory } from './runtime/ExtensionDomainImplementationFactory';
export { ExtensionMounter } from './runtime/ExtensionMounter';
export { DomainLifecycleTrigger } from './runtime/DomainLifecycleTrigger';
export type { DomainContext } from './runtime/DomainContext';
export { InvalidatableDomainContext } from './runtime/DomainContext';

// Coordination types (Phase 3)
export { RuntimeCoordinator } from './runtime/coordination/types';
export type { RuntimeConnection } from './runtime/coordination/types';

// Mediator concrete implementation (Phase 6)
export { DefaultActionsChainsMediator, NoHandlerForActionTargetError } from './mediator/actions-chains-mediator';

// Bridge concrete implementations (Phase 6)
export { ChildMfeBridgeImpl, ParentMfeBridgeImpl, ChildDomainForwardingHandler } from './bridge';

// Bridge error classes (Phase 6)
export { NoActionsChainHandlerError, BridgeDisposedError } from './bridge/errors';

// Infrastructure action constants (Phase 7)
export {
  FRONTX_ACTION_LOAD_EXT,
  FRONTX_ACTION_MOUNT_EXT,
  FRONTX_ACTION_UNMOUNT_EXT,
} from './constants';

// Error classes (Phase 7)
export {
  MfeError,
  DomainValidationError,
  MfeLoadError,
  ExtensionTypeError,
  ChainExecutionError,
  MfeTypeConformanceError,
  UnsupportedDomainActionError,
  UnsupportedLifecycleStageError,
  EntryTypeNotHandledError,
  type ContractError,
} from './errors';

// Shadow DOM utilities (Phase 7)
export { createShadowRoot, injectCssVariables, injectStylesheet } from './shadow';
export type { ShadowRootOptions } from './shadow';

// Contract matching validation (Phase 7)
export {
  validateContract,
  formatContractErrors,
  INFRASTRUCTURE_LIFECYCLE_ACTIONS,
  type ContractValidationResult,
  type ContractErrorType,
} from './validation/contract';

// Lifecycle validation (Phase 7)
export {
  validateDomainLifecycleHooks,
  validateExtensionLifecycleHooks,
  type LifecycleValidationResult,
} from './validation/lifecycle';

// Extension type validation (Phase 7)
export { validateExtensionType } from './validation/extension-type';

// Extension manager (Phase 7)
export { ExtensionManager } from './runtime/extension-manager';
export type {
  ExtensionDomainState,
  ExtensionState,
  LifecycleTriggerCallback,
  DomainLifecycleTriggerCallback,
} from './runtime/extension-manager';

// Mount manager (Phase 7)
export { MountManager } from './runtime/mount-manager';
export type { ActionChainExecutor, LifecycleTrigger } from './runtime/mount-manager';

// Runtime bridge factory (Phase 7)
export { RuntimeBridgeFactory } from './runtime/runtime-bridge-factory';

// Governance concrete classes (Phase 7)
export { DefaultExtensionManager } from './runtime/default-extension-manager';
export { DefaultMountManager, type HandlerResolver } from './runtime/default-mount-manager';
