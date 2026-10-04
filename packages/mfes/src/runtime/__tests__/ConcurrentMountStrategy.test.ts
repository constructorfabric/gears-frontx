import { describe, it, expect, beforeEach } from 'vitest';
import { ConcurrentMountStrategy } from '../ConcurrentMountStrategy';
import { ExtensionMounter } from '../ExtensionMounter';
import { makePayload } from './helpers/make-payload';
import { FakeMounter } from './helpers/FakeMounter';
import { FakeContainerHooks } from './helpers/FakeContainerHooks';

class ThrowingFakeMounter extends ExtensionMounter {
  attach(_root: Element): void {}
  async detach(): Promise<void> {}
  async mount(_extensionId: string, _container: Element): Promise<void> {
    throw new Error('mount failed');
  }
  async unmount(_extensionId: string): Promise<void> {}
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
