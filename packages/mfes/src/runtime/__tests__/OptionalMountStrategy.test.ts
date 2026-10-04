import { describe, it, expect, beforeEach } from 'vitest';
import { OptionalMountStrategy } from '../OptionalMountStrategy';
import { makePayload } from './helpers/make-payload';
import { FakeMounter } from './helpers/FakeMounter';
import { FakeContainerHooks } from './helpers/FakeContainerHooks';
import { FakeRegistry } from './helpers/FakeRegistry';
import { ExtensionReleaserProvider } from '../ExtensionReleaserProvider';

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

  it('returns without action on a direct mount of an already-mounted subject (already-mounted handling is normally done by the mount-ext prologue)', async () => {
    registry.setMounted(DOMAIN, ['ext-a']);

    // Through the mediator, the registry's mount-ext prologue
    // (`MountExtActionHandler`) short-circuits an already-mounted request
    // before this strategy body ever runs. A direct call bypasses that
    // prologue, so this defensive check returns successfully without
    // mounting 'ext-a' a second time, rather than throwing.
    await expect(strategy.mount(makePayload('ext-a'))).resolves.toBeUndefined();

    expect(mounter.mountCalls).toHaveLength(0);
    expect(hooks.created).toHaveLength(0);
  });

  it('mount displaces prior single extension before mounting new one', async () => {
    registry.setMounted(DOMAIN, ['ext-a']);
    // Stands in for the destroy 'ext-a' own earlier mount would have registered.
    ExtensionReleaserProvider.for(mounter).registerDestroy('ext-a', () => hooks.destroy('ext-a'));

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
    // Stands in for the destroy 'ext-a' own earlier mount would have registered.
    ExtensionReleaserProvider.for(mounter).registerDestroy('ext-a', () => hooks.destroy('ext-a'));

    await strategy.unmount!(makePayload('ext-a'));

    expect(mounter.unmountCalls).toContain('ext-a');
    expect(hooks.destroyed).toContain('ext-a');
  });
});
