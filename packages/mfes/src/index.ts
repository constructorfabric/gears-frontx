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
