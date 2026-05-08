import { describe, it, expect, beforeEach } from 'vitest';
import { ConcurrentMountStrategy, OptionalMountStrategy, ExclusiveMountStrategy } from '../mount-strategies';
import { MountStrategy, type ActionPayload, type ContainerHooks } from '../mount-strategy';
import { ExtensionMounter } from '../ExtensionMounter';
import { ScreensetsRegistry } from '../ScreensetsRegistry';
import type { TypeSystemPlugin } from '../../plugins/types';
import type { ExtensionDomain, Extension, ActionsChain } from '../../types';
import type { ExtensionDomainImplementationFactory } from '../ExtensionDomainImplementationFactory';
import type { ParentMfeBridge } from '../../handler/types';

// ─── Fakes ───────────────────────────────────────────────────────────────────

function makePayload(subject: string): ActionPayload {
  return { subject };
}

class FakeMounter extends ExtensionMounter {
  readonly mountCalls: Array<{ extensionId: string; container: Element }> = [];
  readonly unmountCalls: string[] = [];

  attach(_root: Element): void {}
  detach(): void {}

  async mount(extensionId: string, container: Element): Promise<void> {
    this.mountCalls.push({ extensionId, container });
  }

  async unmount(extensionId: string): Promise<void> {
    this.unmountCalls.push(extensionId);
  }
}

class ThrowingFakeMounter extends ExtensionMounter {
  attach(_root: Element): void {}
  detach(): void {}
  async mount(_extensionId: string, _container: Element): Promise<void> {
    throw new Error('mount failed');
  }
  async unmount(_extensionId: string): Promise<void> {}
}

class FakeContainerHooks implements ContainerHooks {
  readonly created: string[] = [];
  readonly destroyed: string[] = [];

  create(extensionId: string): Element {
    this.created.push(extensionId);
    return document.createElement('div');
  }

  destroy(extensionId: string): void {
    this.destroyed.push(extensionId);
  }
}

// Minimal ScreensetsRegistry stub for strategy tests — only getMountedExtensions matters here.
class FakeRegistry extends ScreensetsRegistry {
  readonly typeSystem: TypeSystemPlugin = { name: 'fake', version: '0', register: () => {}, registerSchema: () => {}, getSchema: () => undefined, isTypeOf: () => false };
  private readonly mountedByDomain = new Map<string, string[]>();

  setMounted(domainId: string, ids: string[]): void {
    this.mountedByDomain.set(domainId, ids);
  }

  getMountedExtensions(domainId: string): readonly string[] {
    return this.mountedByDomain.get(domainId) ?? [];
  }

  registerDomain(_d: ExtensionDomain, _f: ExtensionDomainImplementationFactory): void {}
  async unregisterDomain(_id: string): Promise<void> {}
  async registerExtension(_e: Extension): Promise<void> {}
  async unregisterExtension(_id: string): Promise<void> {}
  updateSharedProperty(_p: string, _v: unknown): void {}
  getDomainProperty(_d: string, _p: string): unknown { return undefined; }
  async executeActionsChain(_c: ActionsChain): Promise<void> {}
  getExtension(_id: string): Extension | undefined { return undefined; }
  getDomain(_id: string): ExtensionDomain | undefined { return undefined; }
  getExtensionsForDomain(_id: string): Extension[] { return []; }
  getMounter(_id: string): ExtensionMounter { throw new Error('not implemented'); }
  getRegisteredPackages(): string[] { return []; }
  getExtensionsForPackage(_id: string): Extension[] { return []; }
  getParentBridge(_id: string): ParentMfeBridge | null { return null; }
  setTheme(_v: Record<string, string>): void {}
  dispose(): void {}
}

// ─── ConcurrentMountStrategy ─────────────────────────────────────────────────

describe('ConcurrentMountStrategy', () => {
  let mounter: FakeMounter;
  let hooks: FakeContainerHooks;
  let strategy: ConcurrentMountStrategy;

  beforeEach(() => {
    mounter = new FakeMounter();
    hooks = new FakeContainerHooks();
    strategy = new ConcurrentMountStrategy(mounter, hooks);
  });

  it('mount calls mounter.mount for each distinct extension', async () => {
    await strategy.mount(makePayload('ext-a'));
    await strategy.mount(makePayload('ext-b'));

    expect(mounter.mountCalls.map(c => c.extensionId)).toEqual(['ext-a', 'ext-b']);
    expect(hooks.created).toEqual(['ext-a', 'ext-b']);
  });

  it('unmount calls mounter.unmount then hooks.destroy for the named extension', async () => {
    // Mount both first (so containers exist conceptually)
    await strategy.mount(makePayload('ext-a'));
    await strategy.mount(makePayload('ext-b'));

    await strategy.unmount!(makePayload('ext-a'));

    expect(mounter.unmountCalls).toEqual(['ext-a']);
    expect(hooks.destroyed).toEqual(['ext-a']);
    // ext-b is untouched
    expect(mounter.mountCalls.some(c => c.extensionId === 'ext-b')).toBe(true);
  });

  it('mount rethrows after hooks.destroy when mounter.mount throws (cleanup orphan)', async () => {
    const throwingMounter = new ThrowingFakeMounter();
    const orphanHooks = new FakeContainerHooks();
    const s = new ConcurrentMountStrategy(throwingMounter, orphanHooks);

    await expect(s.mount(makePayload('ext-a'))).rejects.toThrow('mount failed');
    // Container was created then destroyed because mounter threw
    expect(orphanHooks.created).toContain('ext-a');
    expect(orphanHooks.destroyed).toContain('ext-a');
  });
});

// ─── OptionalMountStrategy ───────────────────────────────────────────────────

describe('OptionalMountStrategy', () => {
  const DOMAIN = 'test-domain';
  let mounter: FakeMounter;
  let hooks: FakeContainerHooks;
  let registry: FakeRegistry;
  let strategy: OptionalMountStrategy;

  beforeEach(() => {
    mounter = new FakeMounter();
    hooks = new FakeContainerHooks();
    registry = new FakeRegistry();
    strategy = new OptionalMountStrategy(mounter, hooks, registry, DOMAIN);
  });

  it('mount is idempotent when subject is already mounted', async () => {
    registry.setMounted(DOMAIN, ['ext-a']);

    await strategy.mount(makePayload('ext-a'));

    expect(mounter.mountCalls).toHaveLength(0);
    expect(hooks.created).toHaveLength(0);
  });

  it('mount displaces prior single extension before mounting new one', async () => {
    registry.setMounted(DOMAIN, ['ext-a']);

    await strategy.mount(makePayload('ext-b'));

    // Prior extension unmounted and destroyed
    expect(mounter.unmountCalls).toContain('ext-a');
    expect(hooks.destroyed).toContain('ext-a');
    // New extension mounted
    expect(mounter.mountCalls.map(c => c.extensionId)).toContain('ext-b');
  });

  it('unmount is idempotent when subject is not in mount-set', async () => {
    registry.setMounted(DOMAIN, ['ext-a']);

    await strategy.unmount!(makePayload('ext-b'));

    expect(mounter.unmountCalls).toHaveLength(0);
    expect(hooks.destroyed).toHaveLength(0);
  });

  it('unmount removes the named extension when it is in mount-set', async () => {
    registry.setMounted(DOMAIN, ['ext-a']);

    await strategy.unmount!(makePayload('ext-a'));

    expect(mounter.unmountCalls).toContain('ext-a');
    expect(hooks.destroyed).toContain('ext-a');
  });
});

// ─── ExclusiveMountStrategy ──────────────────────────────────────────────────

describe('ExclusiveMountStrategy', () => {
  const DOMAIN = 'excl-domain';
  let mounter: FakeMounter;
  let hooks: FakeContainerHooks;
  let registry: FakeRegistry;
  let strategy: ExclusiveMountStrategy;

  beforeEach(() => {
    mounter = new FakeMounter();
    hooks = new FakeContainerHooks();
    registry = new FakeRegistry();
    strategy = new ExclusiveMountStrategy(mounter, hooks, registry, DOMAIN);
  });

  it('mount is idempotent when single mount-set entry equals subject', async () => {
    registry.setMounted(DOMAIN, ['ext-a']);

    await strategy.mount(makePayload('ext-a'));

    expect(mounter.mountCalls).toHaveLength(0);
    expect(mounter.unmountCalls).toHaveLength(0);
  });

  it('mount evicts siblings and mounts the new extension', async () => {
    registry.setMounted(DOMAIN, ['ext-a', 'ext-b']);

    await strategy.mount(makePayload('ext-c'));

    // Both prior extensions evicted
    expect(mounter.unmountCalls).toContain('ext-a');
    expect(mounter.unmountCalls).toContain('ext-b');
    expect(hooks.destroyed).toContain('ext-a');
    expect(hooks.destroyed).toContain('ext-b');
    // New extension mounted
    expect(mounter.mountCalls.map(c => c.extensionId)).toContain('ext-c');
  });

  it('has no unmount method (structural opt-in proof)', () => {
    // ExclusiveMountStrategy intentionally does NOT implement unmount.
    expect((strategy as MountStrategy).unmount).toBeUndefined();
    expect('unmount' in strategy).toBe(false);
  });
});
