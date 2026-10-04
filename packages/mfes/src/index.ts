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
export { LazyLoaderRegistry } from './lazy-loader/LazyLoaderRegistry';
export type { LazyResolver } from './lazy-loader/LazyLoaderRegistry';

// Type substrate port (Phase 2)
export type {
  ValidationErrorItem,
  ValidationResult,
  TypeSystemPlugin,
} from './type-substrate';
export { isInfrastructureLifecycleAction } from './type-substrate';

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
  HistoryIntent,
} from './types';

// Mediator types (Phase 3)
export { ActionHandler } from './mediator/ActionHandler';
export { ActionsChainsMediator } from './mediator/ActionsChainsMediator';

// Handler type contracts (Phase 3)
export { ParentMfeBridge } from './handler/ParentMfeBridge';
export { ChildMfeBridge } from './handler/ChildMfeBridge';
export { MfeBridgeFactory } from './handler/MfeBridgeFactory';
export { MfeHandler } from './handler/MfeHandler';
export type { MfeEntryLifecycle, MfeMountContext } from './handler/MfeHandler';

// Registry contracts (Phase 3)
export { MfeRegistry } from './registry/MfeRegistry';
export { MfeRegistryFactory } from './registry/MfeRegistryFactory';
export type { MfeRegistryConfig } from './runtime/config';

// Router port (Phase 6) — the concrete router stays outside this package
export type {
  RouterPort,
  OccupantValue,
  OccupantValueAssignment,
  SettledActionReport,
} from './router/RouterPort';

// Runtime abstractions (Phase 3)
export { MountStrategy } from './runtime/MountStrategy';
export type { ActionPayload, ContainerHooks } from './runtime/MountStrategy';
export { ConcurrentMountStrategy } from './runtime/ConcurrentMountStrategy';
export { OptionalMountStrategy } from './runtime/OptionalMountStrategy';
export { ExclusiveMountStrategy } from './runtime/ExclusiveMountStrategy';
export { ExtensionDomainImplementation } from './runtime/ExtensionDomainImplementation';
export { ExtensionDomainImplementationFactory } from './runtime/ExtensionDomainImplementationFactory';
export { ExtensionMounter } from './runtime/ExtensionMounter';
export { DomainLifecycleTrigger } from './runtime/DomainLifecycleTrigger';
export type { DomainContext } from './runtime/DomainContext';
export { InvalidatableDomainContext } from './runtime/InvalidatableDomainContext';

// Coordination types (Phase 3)
export { RuntimeCoordinator } from './runtime/coordination/RuntimeCoordinator';
export type { RuntimeConnection } from './runtime/coordination/RuntimeCoordinator';

// Mediator error surface (Phase 6) — the concrete mediator stays internal (ADR-0003)
export { NoHandlerForActionTargetError } from './mediator/NoHandlerForActionTargetError';

// Bridge error classes (Phase 6)
export { NoActionsChainHandlerError, BridgeDisposedError, BridgeInactiveError } from './bridge/errors';

// Error classes
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
  DomainUnregisteringError,
  type ContractError,
} from './errors';

// Shadow DOM utilities
export { createShadowRoot, injectCssVariables, injectStylesheet } from './shadow';
export type { ShadowRootOptions } from './shadow';

// Contract matching validation
export {
  validateContract,
  formatContractErrors,
  type ContractValidationResult,
  type ContractErrorType,
} from './validation/contract';

// Lifecycle validation
export {
  validateDomainLifecycleHooks,
  validateExtensionLifecycleHooks,
  type LifecycleValidationResult,
} from './validation/lifecycle';

// Extension type validation
export { validateExtensionType } from './validation/extension-type';

// Extension manager
export { ExtensionManager } from './runtime/ExtensionManager';
export type {
  ExtensionDomainState,
  ExtensionState,
  LifecycleTriggerCallback,
  DomainLifecycleTriggerCallback,
} from './runtime/ExtensionManager';

// Mount manager
export { MountManager } from './runtime/MountManager';
export type { ActionsChainDispatcher, LifecycleTrigger } from './runtime/MountManager';

// Runtime bridge factory
export { RuntimeBridgeFactory } from './runtime/RuntimeBridgeFactory';

// MFE Isolation — handler, trust kernel, types (Phase 8)
// MfeHandlerMF is sanctioned surface — do not remove in a barrel cleanup.
// Rationale/table: packages/mfes/architecture/DESIGN.md, public-surface table.
export { MfeHandlerMF } from './handler/mfe-handler-mf/MfeHandlerMF';
export { LruCache } from './handler/mfe-handler-mf/LruCache';
export { RetryHandler } from './handler/mfe-handler-mf/RetryHandler';
export type { MfeEntryMF } from './types/mfe-entry-mf';
export {
  sourceImports,
  rewriteBareSpecifier,
  importBlobModule,
} from './handler/mfe-handler-mf/mf-dynamic-module-ops';

// Only the creation function crosses the barrel: the concrete registry and
// factory stay internal so no consumer can build a rival registry past the
// composition root (ADR-0003, enforced by scripts/mfes-import-boundary-check.mjs)
export { createMfeRegistryFactory } from './runtime/DefaultMfeRegistryFactory';

// Lifecycle manager — abstract contract; the default implementation stays internal (ADR-0003)
export { LifecycleManager } from './runtime/LifecycleManager';
export type { ActionChainExecutor as LifecycleActionChainExecutor } from './runtime/LifecycleManager';

// Operation serializer — concurrency control for registry operations
export { OperationSerializer } from './runtime/OperationSerializer';

// Extension lifecycle action handler — load_ext handler wiring
export { LoadExtHandler } from './runtime/LoadExtHandler';
export type { LifecycleActionPayload } from './runtime/LoadExtHandler';

// Runtime coordination — default WeakMap-based implementation
export { WeakMapRuntimeCoordinator } from './runtime/coordination/WeakMapRuntimeCoordinator';

// MFE state container — abstract contract; the default implementation stays internal (ADR-0003)
export { MfeStateContainer } from './state';
export type { MfeStateContainerConfig } from './state';

// GTS package extraction utility
export { extractGtsPackage } from './gts/extract-package';
