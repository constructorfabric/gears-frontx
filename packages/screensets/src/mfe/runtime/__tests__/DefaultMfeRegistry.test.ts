import { describe, it, expect } from 'vitest';
// @internal — colocated test, direct relative import is permitted.
import { DefaultMfeRegistry } from '../DefaultMfeRegistry';
import { MfeRegistry } from '../MfeRegistry';
import type { MfeRegistryConfig } from '../config';
import type { TypeSystemPlugin, JSONSchema } from '../../plugins/types';
import type { ExtensionDomain } from '../../types';
import type { DomainContext } from '../DomainContext';
import { ExtensionDomainImplementation } from '../ExtensionDomainImplementation';
import { ExtensionDomainImplementationFactory } from '../ExtensionDomainImplementationFactory';
import {
  ConcurrentMountStrategy,
  ExclusiveMountStrategy,
} from '../mount-strategies';
import type { ContainerHooks, ActionPayload, MountStrategy } from '../mount-strategy';
import { ActionHandler } from '../../mediator/types';
import {
  FRONTX_ACTION_LOAD_EXT,
  FRONTX_ACTION_MOUNT_EXT,
  FRONTX_ACTION_UNMOUNT_EXT,
} from '../../constants/index';
import { ExtensionMounter } from '../ExtensionMounter';

// ─── Minimal TypeSystemPlugin mock matching current interface ─────────────────

function createMockPlugin(): TypeSystemPlugin {
  const schemas = new Map<string, JSONSchema>();

  return {
    name: 'MockPlugin',
    version: '1.0.0',
    registerSchema(schema: JSONSchema): void {
      if (schema.$id) schemas.set(schema.$id, schema);
    },
    getSchema(typeId: string): JSONSchema | undefined {
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
