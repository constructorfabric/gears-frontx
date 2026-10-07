import { describe, it, expect, beforeEach } from 'vitest';
import { ExclusiveMountStrategy } from '../ExclusiveMountStrategy';
import type { MountStrategy } from '../MountStrategy';
import { makePayload } from './helpers/make-payload';
import { FakeMounter } from './helpers/FakeMounter';
import { FakeContainerHooks } from './helpers/FakeContainerHooks';
import { FakeRegistry } from './helpers/FakeRegistry';
import { ExtensionReleaserProvider } from '../ExtensionReleaserProvider';

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

  it('returns without action on a direct mount of the sole already-mounted subject (already-mounted handling is normally done by the mount-ext prologue)', async () => {
    registry.setMounted(DOMAIN, ['ext-a']);

    // Through the mediator, the registry's mount-ext prologue
    // (`MountExtActionHandler`) short-circuits an already-mounted request
    // before this strategy body ever runs. A direct call bypasses that
    // prologue, so this defensive check returns successfully without
    // mounting 'ext-a' a second time, rather than throwing.
    await expect(strategy.mount(makePayload('ext-a'))).resolves.toBeUndefined();

    expect(mounter.mountCalls).toHaveLength(0);
    expect(mounter.unmountCalls).toHaveLength(0);
  });

  it('mount evicts siblings and mounts the new extension', async () => {
    registry.setMounted(DOMAIN, ['ext-a', 'ext-b']);
    // Stands in for the destroy each sibling's own earlier mount would have registered.
    ExtensionReleaserProvider.for(mounter).registerDestroy('ext-a', () => hooks.destroy('ext-a'));
    ExtensionReleaserProvider.for(mounter).registerDestroy('ext-b', () => hooks.destroy('ext-b'));

    await strategy.mount(makePayload('ext-c'));

    // Both prior extensions evicted
    expect(mounter.unmountCalls).toContain('ext-a');
    expect(mounter.unmountCalls).toContain('ext-b');
    expect(hooks.destroyed).toContain('ext-a');
    expect(hooks.destroyed).toContain('ext-b');
    // New extension mounted
    expect(mounter.mountCalls.map(c => c.extensionId)).toContain('ext-c');
  });

  it('unmount rejects and changes nothing: the occupant stays mounted and nothing is released', async () => {
    registry.setMounted(DOMAIN, ['ext-a']);
    ExtensionReleaserProvider.for(mounter).registerDestroy('ext-a', () => hooks.destroy('ext-a'));

    await expect((strategy as MountStrategy).unmount!(makePayload('ext-a'))).rejects.toThrow();

    expect(registry.getMountedExtensions(DOMAIN)).toEqual(['ext-a']);
    expect(mounter.unmountCalls).toHaveLength(0);
    expect(mounter.mountCalls).toHaveLength(0);
    expect(hooks.destroyed).toHaveLength(0);
  });
});
