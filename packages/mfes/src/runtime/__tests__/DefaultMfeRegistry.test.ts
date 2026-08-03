import { describe, it, expect } from 'vitest';
// @internal — colocated test, direct relative import is permitted.
import { DefaultMfeRegistry } from '../DefaultMfeRegistry';
import { MfeRegistry } from '../../registry/MfeRegistry';
import type { MfeRegistryConfig } from '../config';
import type { TypeSystemPlugin } from '../../type-substrate';
import type { ExtensionDomain } from '../../types';
import type { DomainContext } from '../DomainContext';
import { ExtensionDomainImplementation } from '../ExtensionDomainImplementation';
import { ExtensionDomainImplementationFactory } from '../ExtensionDomainImplementationFactory';
import {
  ConcurrentMountStrategy,
  OptionalMountStrategy,
  ExclusiveMountStrategy,
} from '../mount-strategies';
import type { ContainerHooks, ActionPayload, MountStrategy } from '../mount-strategy';
import { ActionHandler } from '../../mediator/types';
import { ExtensionMounter } from '../ExtensionMounter';

// Mock-plugin-local stand-ins for the framework's well-known lifecycle action
// IDs. Deliberately NOT imported from any real type-system plugin (mfes must
// not hold a concrete type-format literal, and this mock exercises its own
// made-up notation) — the mock's `resolveLoadExtActionId()` etc. return these.
const FRONTX_ACTION_LOAD_EXT = 'mock.action.v1~load_ext.v1~';
const FRONTX_ACTION_MOUNT_EXT = 'mock.action.v1~mount_ext.v1~';
const FRONTX_ACTION_UNMOUNT_EXT = 'mock.action.v1~unmount_ext.v1~';
// Stand-ins for the four well-known lifecycle stages the runtime fires
// (init/activated/deactivated/destroyed). Same rationale: deliberately NOT
// the real GTS strings — the mock exercises its own notation, and the mock's
// `resolveLifecycleStageInitId()` etc. return these (issue #505).
const FRONTX_LIFECYCLE_STAGE_INIT = 'mock.stage.v1~init.v1';
const FRONTX_LIFECYCLE_STAGE_ACTIVATED = 'mock.stage.v1~activated.v1';
const FRONTX_LIFECYCLE_STAGE_DEACTIVATED = 'mock.stage.v1~deactivated.v1';
const FRONTX_LIFECYCLE_STAGE_DESTROYED = 'mock.stage.v1~destroyed.v1';

// ─── Minimal TypeSystemPlugin mock matching current interface ─────────────────
//
// MFES-5 (opaque schema surface): mfes must not import a concrete schema
// shape (e.g. JSONSchema) — only the plugin knows its own shape. This mock
// declares its own local, minimal shape rather than importing GTS's.

interface MockSchema {
  $id?: string;
}

function createMockPlugin(): TypeSystemPlugin<MockSchema> {
  const schemas = new Map<string, MockSchema>();

  return {
    name: 'MockPlugin',
    version: '1.0.0',
    registerSchema(schema: MockSchema): void {
      if (schema.$id) schemas.set(schema.$id, schema);
    },
    getSchema(typeId: string): MockSchema | undefined {
      return schemas.get(typeId);
    },
    register(_entity: unknown): void {
      // Accept everything — mock does no real validation.
    },
    isTypeOf(typeId: string, baseTypeId: string): boolean {
      return typeId === baseTypeId || typeId.startsWith(baseTypeId);
    },
    validateInstance(_instanceId: string) {
      return { valid: true, errors: [] };
    },
    resolveLoadExtActionId(): string {
      return FRONTX_ACTION_LOAD_EXT;
    },
    resolveMountExtActionId(): string {
      return FRONTX_ACTION_MOUNT_EXT;
    },
    resolveUnmountExtActionId(): string {
      return FRONTX_ACTION_UNMOUNT_EXT;
    },
    resolveLifecycleStageInitId(): string {
      return FRONTX_LIFECYCLE_STAGE_INIT;
    },
    resolveLifecycleStageActivatedId(): string {
      return FRONTX_LIFECYCLE_STAGE_ACTIVATED;
    },
    resolveLifecycleStageDeactivatedId(): string {
      return FRONTX_LIFECYCLE_STAGE_DEACTIVATED;
    },
    resolveLifecycleStageDestroyedId(): string {
      return FRONTX_LIFECYCLE_STAGE_DESTROYED;
    },
  };
}

// ─── Fresh registry factory — avoids the singleton cache ─────────────────────

function freshRegistry(): DefaultMfeRegistry {
  const config: MfeRegistryConfig = { typeSystem: createMockPlugin() };
  return new DefaultMfeRegistry(config);
}

// ─── Test domain constants ────────────────────────────────────────────────────

const DOMAIN_ID = 'test.domain.concurrent.v1';
const DOMAIN_EXCL_ID = 'test.domain.exclusive.v1';

function makeConcurrentDomain(id: string = DOMAIN_ID): ExtensionDomain {
  return {
    id,
    actions: [FRONTX_ACTION_LOAD_EXT, FRONTX_ACTION_MOUNT_EXT, FRONTX_ACTION_UNMOUNT_EXT],
    extensionsActions: [],
    sharedProperties: [],
    defaultActionTimeout: 5000,
    lifecycleStages: [],
    extensionsLifecycleStages: [],
    extensionsTypeId: '',
  } as unknown as ExtensionDomain;
}

function makeExclusiveDomain(id: string = DOMAIN_EXCL_ID): ExtensionDomain {
  return {
    id,
    // ExclusiveMountStrategy REQUIRES mount_ext, FORBIDS unmount_ext
    actions: [FRONTX_ACTION_LOAD_EXT, FRONTX_ACTION_MOUNT_EXT],
    extensionsActions: [],
    sharedProperties: [],
    defaultActionTimeout: 5000,
    lifecycleStages: [],
    extensionsLifecycleStages: [],
    extensionsTypeId: '',
  } as unknown as ExtensionDomain;
}

// ─── Container hooks ─────────────────────────────────────────────────────────

class TestHooks implements ContainerHooks {
  create(_extensionId: string): Element {
    return document.createElement('div');
  }
  destroy(_extensionId: string): void {}
}

// ─── Concurrent domain implementation ────────────────────────────────────────

class ConcurrentDomainImpl extends ExtensionDomainImplementation {
  readonly capturedStrategy: ConcurrentMountStrategy;
  // Holds a reference to the ctx accessor function — valid during build, throws after.
  private readonly ctxMounterAccessor: () => ExtensionMounter;

  constructor(ctx: DomainContext) {
    super();
    const hooks = new TestHooks();
    // Strategy captures ctx.mounter in its constructor private field — survives invalidation.
    this.capturedStrategy = new ConcurrentMountStrategy(ctx.mounter, hooks);
    ctx.registerHandler(
      FRONTX_ACTION_MOUNT_EXT,
      ActionHandler.fromFunction((_t, p) =>
        this.capturedStrategy.mount(p as ActionPayload)
      )
    );
    ctx.registerHandler(
      FRONTX_ACTION_UNMOUNT_EXT,
      ActionHandler.fromFunction((_t, p) =>
        this.capturedStrategy.unmount!(p as ActionPayload)
      )
    );
    // Capture ctx itself so we can test that post-registration access throws.
    this.ctxMounterAccessor = () => ctx.mounter;
  }

  /** Access ctx.mounter — throws after registration completes (context invalidated). */
  accessCtxMounter(): ExtensionMounter {
    return this.ctxMounterAccessor();
  }

  protected getMountStrategies(): MountStrategy[] {
    return [this.capturedStrategy];
  }
}

class ConcurrentDomainFactory extends ExtensionDomainImplementationFactory {
  lastImpl: ConcurrentDomainImpl | null = null;

  build(ctx: DomainContext): ConcurrentDomainImpl {
    const impl = new ConcurrentDomainImpl(ctx);
    this.lastImpl = impl;
    return impl;
  }
}

// ─── Exclusive domain implementation ─────────────────────────────────────────

class ExclusiveDomainImpl extends ExtensionDomainImplementation {
  private readonly strategy: ExclusiveMountStrategy;

  constructor(ctx: DomainContext, registry: MfeRegistry) {
    super();
    const hooks = new TestHooks();
    this.strategy = new ExclusiveMountStrategy(ctx.mounter, hooks, registry, DOMAIN_EXCL_ID);
    ctx.registerHandler(
      FRONTX_ACTION_MOUNT_EXT,
      ActionHandler.fromFunction((_t, p) => this.strategy.mount(p as ActionPayload))
    );
    // Intentionally NO unmount handler — ExclusiveMountStrategy forbids unmount_ext.
  }

  protected getMountStrategies(): MountStrategy[] {
    return [this.strategy];
  }
}

class ExclusiveDomainFactory extends ExtensionDomainImplementationFactory {
  constructor(private readonly reg: MfeRegistry) { super(); }

  build(ctx: DomainContext): ExclusiveDomainImpl {
    return new ExclusiveDomainImpl(ctx, this.reg);
  }
}

// ─── Derived (hierarchy-aware) mount_ext action id ────────────────────────────
//
// The mock TypeSystemPlugin's isTypeOf treats any typeId that starts with a
// baseTypeId as satisfying it. This id is a derivative of FRONTX_ACTION_MOUNT_EXT
// (it is-a mount_ext) but is NOT string-equal to it — analogous to a CTI-based
// domain declaration being semantically equivalent to the GTS constant.
const DERIVED_MOUNT_EXT = `${FRONTX_ACTION_MOUNT_EXT}derived-variant.v1~`;
// Analogous derived (is-a) variant of unmount_ext — NOT string-equal to the
// GTS constant but satisfies the mock plugin's `startsWith`-based isTypeOf.
const DERIVED_UNMOUNT_EXT = `${FRONTX_ACTION_UNMOUNT_EXT}derived-variant.v1~`;

const DOMAIN_EXCL_DERIVED_ID = 'test.domain.exclusive.derived.v1';

function makeExclusiveDerivedDomain(id: string = DOMAIN_EXCL_DERIVED_ID): ExtensionDomain {
  return {
    id,
    // Declares a derived (is-a) mount_ext action, not the exact GTS constant.
    actions: [FRONTX_ACTION_LOAD_EXT, DERIVED_MOUNT_EXT],
    extensionsActions: [],
    sharedProperties: [],
    defaultActionTimeout: 5000,
    lifecycleStages: [],
    extensionsLifecycleStages: [],
    extensionsTypeId: '',
  } as unknown as ExtensionDomain;
}

class ExclusiveDomainImplDerived extends ExtensionDomainImplementation {
  private readonly strategy: ExclusiveMountStrategy;

  constructor(ctx: DomainContext, registry: MfeRegistry) {
    super();
    const hooks = new TestHooks();
    this.strategy = new ExclusiveMountStrategy(ctx.mounter, hooks, registry, DOMAIN_EXCL_DERIVED_ID);
    ctx.registerHandler(
      DERIVED_MOUNT_EXT,
      ActionHandler.fromFunction((_t, p) => this.strategy.mount(p as ActionPayload))
    );
    // Intentionally NO unmount handler — ExclusiveMountStrategy forbids unmount_ext.
  }

  protected getMountStrategies(): MountStrategy[] {
    return [this.strategy];
  }
}

class ExclusiveDomainFactoryDerived extends ExtensionDomainImplementationFactory {
  constructor(private readonly reg: MfeRegistry) { super(); }

  build(ctx: DomainContext): ExclusiveDomainImplDerived {
    return new ExclusiveDomainImplDerived(ctx, this.reg);
  }
}

// ─── Domain declaring a derived unmount_ext (for the ExclusiveMountStrategy FORBID test) ──

const DOMAIN_EXCL_DERIVED_FORBID_ID = 'test.domain.exclusive.derived-forbid.v1';

function makeExclusiveDerivedForbidDomain(id: string = DOMAIN_EXCL_DERIVED_FORBID_ID): ExtensionDomain {
  return {
    id,
    // Declares a derived (is-a) unmount_ext action — still violates the FORBID rule,
    // even though it is not string-equal to the GTS constant.
    actions: [FRONTX_ACTION_LOAD_EXT, FRONTX_ACTION_MOUNT_EXT, DERIVED_UNMOUNT_EXT],
    extensionsActions: [],
    sharedProperties: [],
    defaultActionTimeout: 5000,
    lifecycleStages: [],
    extensionsLifecycleStages: [],
    extensionsTypeId: '',
  } as unknown as ExtensionDomain;
}

// ─── Concurrent/Optional domains declaring only derived mount_ext/unmount_ext ──

const DOMAIN_CONCURRENT_DERIVED_ID = 'test.domain.concurrent.derived.v1';
const DOMAIN_OPTIONAL_DERIVED_ID = 'test.domain.optional.derived.v1';

function makeConcurrentDerivedDomain(id: string = DOMAIN_CONCURRENT_DERIVED_ID): ExtensionDomain {
  return {
    id,
    actions: [FRONTX_ACTION_LOAD_EXT, DERIVED_MOUNT_EXT, DERIVED_UNMOUNT_EXT],
    extensionsActions: [],
    sharedProperties: [],
    defaultActionTimeout: 5000,
    lifecycleStages: [],
    extensionsLifecycleStages: [],
    extensionsTypeId: '',
  } as unknown as ExtensionDomain;
}

function makeOptionalDerivedDomain(id: string = DOMAIN_OPTIONAL_DERIVED_ID): ExtensionDomain {
  return {
    id,
    actions: [FRONTX_ACTION_LOAD_EXT, DERIVED_MOUNT_EXT, DERIVED_UNMOUNT_EXT],
    extensionsActions: [],
    sharedProperties: [],
    defaultActionTimeout: 5000,
    lifecycleStages: [],
    extensionsLifecycleStages: [],
    extensionsTypeId: '',
  } as unknown as ExtensionDomain;
}

class ConcurrentDomainImplDerived extends ExtensionDomainImplementation {
  private readonly strategy: ConcurrentMountStrategy;

  constructor(ctx: DomainContext) {
    super();
    const hooks = new TestHooks();
    this.strategy = new ConcurrentMountStrategy(ctx.mounter, hooks);
    ctx.registerHandler(
      DERIVED_MOUNT_EXT,
      ActionHandler.fromFunction((_t, p) => this.strategy.mount(p as ActionPayload))
    );
    ctx.registerHandler(
      DERIVED_UNMOUNT_EXT,
      ActionHandler.fromFunction((_t, p) => this.strategy.unmount!(p as ActionPayload))
    );
  }

  protected getMountStrategies(): MountStrategy[] {
    return [this.strategy];
  }
}

class ConcurrentDomainFactoryDerived extends ExtensionDomainImplementationFactory {
  build(ctx: DomainContext): ConcurrentDomainImplDerived {
    return new ConcurrentDomainImplDerived(ctx);
  }
}

class OptionalDomainImplDerived extends ExtensionDomainImplementation {
  private readonly strategy: OptionalMountStrategy;

  constructor(ctx: DomainContext, registry: MfeRegistry) {
    super();
    const hooks = new TestHooks();
    this.strategy = new OptionalMountStrategy(ctx.mounter, hooks, registry, DOMAIN_OPTIONAL_DERIVED_ID);
    ctx.registerHandler(
      DERIVED_MOUNT_EXT,
      ActionHandler.fromFunction((_t, p) => this.strategy.mount(p as ActionPayload))
    );
    ctx.registerHandler(
      DERIVED_UNMOUNT_EXT,
      ActionHandler.fromFunction((_t, p) => this.strategy.unmount!(p as ActionPayload))
    );
  }

  protected getMountStrategies(): MountStrategy[] {
    return [this.strategy];
  }
}

class OptionalDomainFactoryDerived extends ExtensionDomainImplementationFactory {
  constructor(private readonly reg: MfeRegistry) { super(); }

  build(ctx: DomainContext): OptionalDomainImplDerived {
    return new OptionalDomainImplDerived(ctx, this.reg);
  }
}

// ─── Factory that partially registers then fails ──────────────────────────────

class FailingAfterHandlerFactory extends ExtensionDomainImplementationFactory {
  build(ctx: DomainContext): ExtensionDomainImplementation {
    ctx.registerHandler(
      FRONTX_ACTION_MOUNT_EXT,
      ActionHandler.fromFunction(async () => {})
    );
    throw new Error('factory.build intentional failure');
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('DefaultMfeRegistry', () => {
  describe('registerDomain', () => {
    it('succeeds for ConcurrentMountStrategy-backed factory with mount+unmount declared', () => {
      const reg = freshRegistry();
      expect(() => reg.registerDomain(makeConcurrentDomain(), new ConcurrentDomainFactory())).not.toThrow();
    });

    it('getMounter returns a non-null ExtensionMounter instance after successful registration', () => {
      const reg = freshRegistry();
      reg.registerDomain(makeConcurrentDomain(), new ConcurrentDomainFactory());
      const mounter = reg.getMounter(DOMAIN_ID);
      expect(mounter).toBeTruthy();
      expect(mounter).toBeInstanceOf(ExtensionMounter);
    });

    it('ExclusiveMountStrategy factory with unmount_ext declared throws (FORBID rule)', () => {
      const reg = freshRegistry();
      const illegalDomain: ExtensionDomain = {
        ...makeExclusiveDomain(),
        actions: [FRONTX_ACTION_LOAD_EXT, FRONTX_ACTION_MOUNT_EXT, FRONTX_ACTION_UNMOUNT_EXT],
      } as unknown as ExtensionDomain;
      expect(() => reg.registerDomain(illegalDomain, new ExclusiveDomainFactory(reg))).toThrow();
    });

    it('ExclusiveMountStrategy factory without mount_ext declared throws (REQUIRE rule)', () => {
      const reg = freshRegistry();
      const illegalDomain: ExtensionDomain = {
        ...makeExclusiveDomain(),
        actions: [FRONTX_ACTION_LOAD_EXT], // missing mount_ext
      } as unknown as ExtensionDomain;
      expect(() => reg.registerDomain(illegalDomain, new ExclusiveDomainFactory(reg))).toThrow();
    });

    it('ConcurrentMountStrategy factory without unmount_ext declared throws (REQUIRE rule)', () => {
      const reg = freshRegistry();
      const illegalDomain: ExtensionDomain = {
        ...makeConcurrentDomain(),
        actions: [FRONTX_ACTION_LOAD_EXT, FRONTX_ACTION_MOUNT_EXT], // missing unmount_ext
      } as unknown as ExtensionDomain;
      expect(() => reg.registerDomain(illegalDomain, new ConcurrentDomainFactory())).toThrow();
    });

    it('ExclusiveMountStrategy factory with a hierarchy-derived mount_ext (is-a, not exact-match) satisfies the REQUIRE rule', () => {
      const reg = freshRegistry();
      expect(() =>
        reg.registerDomain(makeExclusiveDerivedDomain(), new ExclusiveDomainFactoryDerived(reg))
      ).not.toThrow();
    });

    it('ExclusiveMountStrategy factory without any action satisfying mount_ext (exact or is-a) still throws (REQUIRE rule)', () => {
      const reg = freshRegistry();
      const illegalDomain: ExtensionDomain = {
        ...makeExclusiveDomain(),
        actions: [FRONTX_ACTION_LOAD_EXT, 'totally.unrelated.action.v1~'], // neither exact nor is-a match for mount_ext
      } as unknown as ExtensionDomain;
      expect(() => reg.registerDomain(illegalDomain, new ExclusiveDomainFactory(reg))).toThrow();
    });

    it('ExclusiveMountStrategy factory with a hierarchy-derived unmount_ext (is-a, not exact-match) declared throws (FORBID rule)', () => {
      const reg = freshRegistry();
      expect(() =>
        reg.registerDomain(makeExclusiveDerivedForbidDomain(), new ExclusiveDomainFactory(reg))
      ).toThrow();
    });

    it('ConcurrentMountStrategy factory with hierarchy-derived mount_ext AND unmount_ext (is-a, not exact-match) satisfies the REQUIRE rule', () => {
      const reg = freshRegistry();
      expect(() =>
        reg.registerDomain(makeConcurrentDerivedDomain(), new ConcurrentDomainFactoryDerived())
      ).not.toThrow();
    });

    it('OptionalMountStrategy factory with hierarchy-derived mount_ext AND unmount_ext (is-a, not exact-match) satisfies the REQUIRE rule', () => {
      const reg = freshRegistry();
      expect(() =>
        reg.registerDomain(makeOptionalDerivedDomain(), new OptionalDomainFactoryDerived(reg))
      ).not.toThrow();
    });
  });

  describe('hierarchy-aware dispatch (end-to-end, not just registerDomain admission)', () => {
    // Registration passing is necessary but not sufficient — a domain that
    // registers its handler under a hierarchy-derived action id must still be
    // reachable when an action is actually DISPATCHED under the framework's
    // base id (or vice versa). This exercises the full
    // registerDomain -> executeActionsChain -> mediator.resolveHandler path.
    // Uses a plain flag-setting handler (not the real ExclusiveMountStrategy.mount,
    // which needs a DOM-attached mounter) — an ExclusiveMountStrategy instance is
    // still captured so cardinality classification (`instanceof` check) applies.
    it('a handler registered under a DERIVED mount_ext id actually fires when dispatched with the BASE literal', async () => {
      class FlagHandlerImpl extends ExtensionDomainImplementation {
        readonly strategy: ExclusiveMountStrategy;
        mountHandlerFired = false;

        constructor(ctx: DomainContext, registry: MfeRegistry) {
          super();
          this.strategy = new ExclusiveMountStrategy(ctx.mounter, new TestHooks(), registry, DOMAIN_EXCL_DERIVED_ID);
          ctx.registerHandler(
            DERIVED_MOUNT_EXT,
            ActionHandler.fromFunction(async () => {
              this.mountHandlerFired = true;
            })
          );
        }

        protected getMountStrategies(): MountStrategy[] {
          return [this.strategy];
        }
      }

      class FlagHandlerFactory extends ExtensionDomainImplementationFactory {
        lastImpl: FlagHandlerImpl | null = null;
        constructor(private readonly reg: MfeRegistry) { super(); }
        build(ctx: DomainContext): FlagHandlerImpl {
          const impl = new FlagHandlerImpl(ctx, this.reg);
          this.lastImpl = impl;
          return impl;
        }
      }

      const reg = freshRegistry();
      const factory = new FlagHandlerFactory(reg);
      reg.registerDomain(makeExclusiveDerivedDomain(), factory);

      await reg.executeActionsChain({
        action: {
          type: FRONTX_ACTION_MOUNT_EXT,
          target: DOMAIN_EXCL_DERIVED_ID,
          payload: { subject: 'ext-1' },
        },
      });

      expect(factory.lastImpl?.mountHandlerFired).toBe(true);
    });
  });

  describe('getMountedExtensions', () => {
    it('returns empty readonly array for an unknown domain — never undefined', () => {
      const reg = freshRegistry();
      const result = reg.getMountedExtensions('unknown-domain-id');
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(0);
    });
  });

  describe('getMounter', () => {
    it('throws with informative message for an unregistered domain', () => {
      const reg = freshRegistry();
      expect(() => reg.getMounter('not-registered')).toThrow(
        /not registered|no mounter/i
      );
    });
  });

  describe('DomainContext invalidation', () => {
    it('accessing ctx.mounter after registerDomain returns throws', () => {
      const reg = freshRegistry();
      const factory = new ConcurrentDomainFactory();
      reg.registerDomain(makeConcurrentDomain(), factory);
      const impl = factory.lastImpl!;
      // ctx is now invalidated — accessing ctx.mounter through the captured accessor throws.
      expect(() => impl.accessCtxMounter()).toThrow(/invalidated/i);
    });

    it('strategy-captured mounter reference (stored in strategy constructor) still works after invalidation', () => {
      const reg = freshRegistry();
      const factory = new ConcurrentDomainFactory();
      reg.registerDomain(makeConcurrentDomain(), factory);
      const impl = factory.lastImpl!;
      // Accessing the strategy's privately-held mounter via the strategy itself should not throw.
      // The strategy.mount call will succeed (mounter.mount may throw "no root attached"
      // but NOT the invalidation error — that proves the strategy's reference survived).
      const mountPromise = impl.capturedStrategy.mount({ subject: 'test-ext' });
      // We expect it to either succeed or throw a non-invalidation error.
      return mountPromise.catch((err: Error) => {
        expect(err.message).not.toMatch(/invalidated/i);
      });
    });
  });

  describe('Atomic rollback', () => {
    it('factory that throws causes getMounter to throw (domain not registered)', () => {
      const reg = freshRegistry();
      const domain = makeConcurrentDomain('rollback-domain');
      expect(() => reg.registerDomain(domain, new FailingAfterHandlerFactory())).toThrow(
        'factory.build intentional failure'
      );
      // Domain should not be registered after the failure
      expect(() => reg.getMounter('rollback-domain')).toThrow();
    });

    it('re-registering the same domain after a failed factory works without leftover conflicts', () => {
      const reg = freshRegistry();
      const domain = makeConcurrentDomain('rollback-domain-2');
      // First attempt fails
      expect(() => reg.registerDomain(domain, new FailingAfterHandlerFactory())).toThrow();
      // Second attempt with a working factory should succeed
      expect(() => reg.registerDomain(domain, new ConcurrentDomainFactory())).not.toThrow();
      expect(reg.getMounter('rollback-domain-2')).toBeTruthy();
    });
  });
});
