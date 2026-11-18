// Public surface of `@gears-frontx/mfes` — exactly the symbols DESIGN §3.3
// lists: what consumers outside the package use (a package that re-exports a
// symbol on its own public surface is a consumer of it), the error classes
// thrown to callers, and the abstract router contract with the history
// intent. Everything else is internal (ADR-0003).

// Type substrate port
export type { ValidationResult, TypeSystemPlugin } from './type-substrate';

// Domain types
export type {
  Action,
  ActionsChain,
  LifecycleStage,
  LifecycleHook,
  ExtensionDomain,
  Extension,
  MfeEntry,
  SharedProperty,
  LoadExtPayload,
  MountExtPayload,
  UnmountExtPayload,
  HistoryIntent,
} from './types';

// Manifest contract the loading path reads
export type { MfManifest } from './manifest/mf-manifest';

// Handler contract
export { ActionHandler } from './mediator/ActionHandler';
export { ParentMfeBridge } from './handler/ParentMfeBridge';
export { ChildMfeBridge } from './handler/ChildMfeBridge';
export { MfeBridgeFactory } from './handler/MfeBridgeFactory';
export { MfeHandler } from './handler/MfeHandler';
export type { MfeEntryLifecycle, MfeMountContext } from './handler/MfeHandler';

// Registry contracts and the creation function — the concrete registry and
// factory stay internal so no consumer can build a rival registry past the
// composition root (enforced by scripts/mfes-import-boundary-check.mjs)
export { MfeRegistry } from './registry/MfeRegistry';
export { MfeRegistryFactory } from './registry/MfeRegistryFactory';
export type { MfeRegistryConfig } from './runtime/config';
export { createMfeRegistryFactory } from './runtime/DefaultMfeRegistryFactory';

// The abstract router — the FrontX router in `@gears-frontx/routing` conforms to it structurally
export { RouterPort } from './router/RouterPort';

// Runtime abstractions
export { MountStrategy } from './runtime/MountStrategy';
export type { ActionPayload, ContainerHooks } from './runtime/MountStrategy';
export { ConcurrentMountStrategy } from './runtime/ConcurrentMountStrategy';
export { OptionalMountStrategy } from './runtime/OptionalMountStrategy';
export { ExclusiveMountStrategy } from './runtime/ExclusiveMountStrategy';
export { ExtensionDomainImplementation } from './runtime/ExtensionDomainImplementation';
export { ExtensionDomainImplementationFactory } from './runtime/ExtensionDomainImplementationFactory';
export { ExtensionMounter } from './runtime/ExtensionMounter';
export type { DomainContext } from './runtime/DomainContext';

// Default module-federation handler and the entry type it handles.
// MfeHandlerMF is sanctioned surface — do not remove in a barrel cleanup.
// Rationale/table: packages/mfes/architecture/DESIGN.md, public-surface table.
export { MfeHandlerMF } from './handler/mfe-handler-mf/MfeHandlerMF';
export type { MfeEntryMF } from './types/mfe-entry-mf';

// Error classes thrown to callers
export {
  MfeError,
  DomainValidationError,
  MfeLoadError,
  ExtensionTypeError,
  UnsupportedLifecycleStageError,
  EntryTypeNotHandledError,
  DomainUnregisteringError,
} from './errors';
export { NoActionsChainHandlerError, BridgeDisposedError, BridgeInactiveError } from './bridge/errors';

// Shadow DOM utilities
export { createShadowRoot, injectCssVariables } from './shadow';
