/**
 * The root barrel is exactly the surface DESIGN §3.3 lists
 * (`cpt-frontx-mfes-interface-package-entry`,
 * `cpt-frontx-adr-mfe-runtime-public-surface`): what consumers outside the
 * package use, the error classes thrown to callers, and the abstract router
 * contract with the history intent. Everything else is internal.
 */
import { describe, expect, expectTypeOf, it } from 'vitest';
import * as root from '../index';
import type {
  Action,
  ActionPayload,
  ActionsChain,
  ContainerHooks,
  DomainContext,
  Extension,
  ExtensionDomain,
  HistoryIntent,
  LifecycleHook,
  LifecycleStage,
  LoadExtPayload,
  MfManifest,
  MfeEntry,
  MfeEntryLifecycle,
  MfeEntryMF,
  MfeMountContext,
  MfeRegistry,
  MfeRegistryConfig,
  MountExtPayload,
  SharedProperty,
  TypeSystemPlugin,
  UnmountExtPayload,
  ValidationResult,
} from '../index';
import { exportedNames } from './helpers/exported-names';

const RUNTIME_EXPORTS = [
  'ActionHandler',
  'BridgeDisposedError',
  'BridgeInactiveError',
  'ChildMfeBridge',
  'ConcurrentMountStrategy',
  'DomainUnregisteringError',
  'DomainValidationError',
  'EntryTypeNotHandledError',
  'ExclusiveMountStrategy',
  'ExtensionDomainImplementation',
  'ExtensionDomainImplementationFactory',
  'ExtensionMounter',
  'ExtensionTypeError',
  'MfeBridgeFactory',
  'MfeError',
  'MfeHandler',
  'MfeHandlerMF',
  'MfeLoadError',
  'MfeRegistry',
  'MfeRegistryFactory',
  'MountStrategy',
  'NoActionsChainHandlerError',
  'OptionalMountStrategy',
  'ParentMfeBridge',
  'RouterPort',
  'UnsupportedLifecycleStageError',
  'createMfeRegistryFactory',
  'createShadowRoot',
  'injectCssVariables',
];

const TYPE_ONLY_EXPORTS = [
  'Action',
  'ActionPayload',
  'ActionsChain',
  'ContainerHooks',
  'DomainContext',
  'Extension',
  'ExtensionDomain',
  'HistoryIntent',
  'LifecycleHook',
  'LifecycleStage',
  'LoadExtPayload',
  'MfManifest',
  'MfeEntry',
  'MfeEntryLifecycle',
  'MfeEntryMF',
  'MfeMountContext',
  'MfeRegistryConfig',
  'MountExtPayload',
  'SharedProperty',
  'TypeSystemPlugin',
  'UnmountExtPayload',
  'ValidationResult',
];

describe('root barrel — exact public surface', () => {
  it('exports exactly the runtime values DESIGN §3.3 lists', () => {
    expect(Object.keys(root).sort()).toEqual([...RUNTIME_EXPORTS].sort());
  });

  it('exports exactly the runtime values and types DESIGN §3.3 lists', () => {
    expect(exportedNames('index.ts')).toEqual(
      [...RUNTIME_EXPORTS, ...TYPE_ONLY_EXPORTS].sort(),
    );
  });

  it('exports the declared types', () => {
    expectTypeOf<MfManifest>().toBeObject();
    expectTypeOf<Action>().toBeObject();
    expectTypeOf<ActionPayload>().toBeObject();
    expectTypeOf<ActionsChain>().toBeObject();
    expectTypeOf<ContainerHooks>().toBeObject();
    expectTypeOf<DomainContext>().toBeObject();
    expectTypeOf<Extension>().toBeObject();
    expectTypeOf<ExtensionDomain>().toBeObject();
    expectTypeOf<LifecycleHook>().toBeObject();
    expectTypeOf<LoadExtPayload>().toBeObject();
    expectTypeOf<MfeEntry>().toBeObject();
    expectTypeOf<MfeEntryLifecycle>().toBeObject();
    expectTypeOf<MfeEntryMF>().toBeObject();
    expectTypeOf<MfeMountContext>().toBeObject();
    expectTypeOf<MfeRegistryConfig>().toBeObject();
    expectTypeOf<MountExtPayload>().toBeObject();
    expectTypeOf<SharedProperty>().toBeObject();
    expectTypeOf<TypeSystemPlugin>().toBeObject();
    expectTypeOf<UnmountExtPayload>().toBeObject();
    expectTypeOf<ValidationResult>().toBeObject();
    expectTypeOf<HistoryIntent>().not.toBeAny();
    expectTypeOf<LifecycleStage>().not.toBeAny();
  });
});

describe('MfeRegistry — no package grouping', () => {
  it('carries no package read members', () => {
    expectTypeOf<MfeRegistry>().not.toHaveProperty('getRegisteredPackages');
    expectTypeOf<MfeRegistry>().not.toHaveProperty('getExtensionsForPackage');
    expect(Object.getOwnPropertyNames(root.MfeRegistry.prototype)).not.toContain(
      'getRegisteredPackages',
    );
    expect(Object.getOwnPropertyNames(root.MfeRegistry.prototype)).not.toContain(
      'getExtensionsForPackage',
    );
  });
});
