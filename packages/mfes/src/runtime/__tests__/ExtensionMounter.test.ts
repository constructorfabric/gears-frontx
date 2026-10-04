import { describe, it, expect, vi } from 'vitest';
import { DefaultExtensionMounter } from '../DefaultExtensionMounter';
import { ExtensionMounter } from '../ExtensionMounter';
import { MountManager } from '../MountManager';
import { ExtensionReleaserProvider } from '../ExtensionReleaserProvider';
import * as barrel from '../../index';
import type { ParentMfeBridge } from '../../handler/ParentMfeBridge';

// ─── Fakes ───────────────────────────────────────────────────────────────────

class FakeMountManager extends MountManager {
  readonly mountCalls: Array<{ extensionId: string; container: Element }> = [];
  readonly unmountCalls: string[] = [];

  async loadExtension(_extensionId: string): Promise<void> {}
  async preloadExtension(_extensionId: string): Promise<void> {}

  async mountExtension(extensionId: string, container: Element): Promise<ParentMfeBridge> {
    this.mountCalls.push({ extensionId, container });
    return { instanceId: extensionId, dispose: () => {} };
  }

  async unmountExtension(extensionId: string): Promise<void> {
    this.unmountCalls.push(extensionId);
  }

  releaseExtension(_extensionId: string): void {}

  setTheme(_cssVars: Record<string, string>): void {}
}

// ─── Helper factory ───────────────────────────────────────────────────────────

function makeFixture(overrides?: { mountManager?: MountManager }) {
  const DOMAIN = 'test-domain';
  const mountManager = overrides?.mountManager ?? new FakeMountManager();
  const addMountedExtension = vi.fn<(domainId: string, extensionId: string) => void>();
  const removeMountedExtension = vi.fn<(domainId: string, extensionId: string) => void>();
  const mounted: string[] = [];
  const getMountedExtensions = (_domainId: string): readonly string[] => mounted;

  const mounter = new DefaultExtensionMounter(
    DOMAIN,
    mountManager,
    addMountedExtension,
    removeMountedExtension,
    getMountedExtensions,
  );

  const root = document.createElement('div');
  document.body.appendChild(root);

  return { DOMAIN, mounter, mountManager, addMountedExtension, removeMountedExtension, mounted, root };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('DefaultExtensionMounter', () => {
  describe('mount', () => {
    it('appends container under attached root and calls addMountedExtension callback', async () => {
      const { mounter, DOMAIN, root, addMountedExtension } = makeFixture();
      mounter.attach(root);

      const container = document.createElement('div');
      // Use a mount manager that uses the supplied container
      await mounter.mount('ext-1', container);

      expect(root.contains(container)).toBe(true);
      expect(addMountedExtension).toHaveBeenCalledWith(DOMAIN, 'ext-1');
    });

    it('throws when no root attached', async () => {
      const { mounter } = makeFixture();
      // Deliberately NOT calling attach

      await expect(mounter.mount('ext-1', document.createElement('div')))
        .rejects.toThrow(/no root attached/);
    });
  });

  describe('unmount', () => {
    it('removes container from root and calls removeMountedExtension', async () => {
      const { mounter, DOMAIN, root, removeMountedExtension } = makeFixture();
      mounter.attach(root);
      const container = document.createElement('div');
      await mounter.mount('ext-1', container);

      await mounter.unmount('ext-1');

      expect(root.contains(container)).toBe(false);
      expect(removeMountedExtension).toHaveBeenCalledWith(DOMAIN, 'ext-1');
    });

    it('idempotent: unmounting unknown id does not throw', async () => {
      const { mounter, root } = makeFixture();
      mounter.attach(root);

      await expect(mounter.unmount('non-existent')).resolves.not.toThrow();
    });
  });

  describe('detach', () => {
    it('mass-unmounts every currently-mounted extension', async () => {
      const mountManager = new FakeMountManager();
      const DOMAIN = 'det-domain';
      const mounted = ['ext-a', 'ext-b'];
      const getMountedExtensions = (_domainId: string): readonly string[] => [...mounted];
      const addMountedExtension = vi.fn();
      const removeMountedExtension = vi.fn();

      const mounter = new DefaultExtensionMounter(
        DOMAIN,
        mountManager,
        addMountedExtension,
        removeMountedExtension,
        getMountedExtensions,
      );
      const root = document.createElement('div');
      mounter.attach(root);

      await mounter.detach();

      // Both extensions were passed to mountManager.unmountExtension
      expect(mountManager.unmountCalls).toContain('ext-a');
      expect(mountManager.unmountCalls).toContain('ext-b');
    });

    it('can attach again with a fresh root after detach', async () => {
      const { mounter } = makeFixture();
      const root1 = document.createElement('div');
      mounter.attach(root1);
      await mounter.detach();

      const root2 = document.createElement('div');
      // Should not throw
      mounter.attach(root2);

      // mount after re-attach should succeed
      await expect(mounter.mount('ext-x', document.createElement('div'))).resolves.not.toThrow();
    });
  });

  describe('in-flight mount dedup keyed on (extensionId, container)', () => {
    /** Mount manager whose `mountExtension` doesn't resolve until `release()` is called. */
    class DeferredMountManager extends MountManager {
      mountCallCount = 0;
      private release: (() => void) | undefined;
      private readonly gate = new Promise<void>((resolve) => {
        this.release = resolve;
      });

      async loadExtension(_extensionId: string): Promise<void> {}
      async preloadExtension(_extensionId: string): Promise<void> {}

      async mountExtension(extensionId: string, _container: Element): Promise<ParentMfeBridge> {
        this.mountCallCount += 1;
        await this.gate;
        return { instanceId: extensionId, dispose: () => {} };
      }

      async unmountExtension(_extensionId: string): Promise<void> {}
      releaseExtension(_extensionId: string): void {}
      setTheme(_cssVars: Record<string, string>): void {}

      settle(): void {
        this.release?.();
      }
    }

    it('same container: two overlapping mount() calls share the one in-flight mount', async () => {
      const mountManager = new DeferredMountManager();
      const { mounter, root } = makeFixture({ mountManager });
      mounter.attach(root);

      const container = document.createElement('div');
      const first = mounter.mount('ext-1', container);
      const second = mounter.mount('ext-1', container);

      mountManager.settle();
      await expect(first).resolves.not.toThrow();
      await expect(second).resolves.not.toThrow();

      expect(mountManager.mountCallCount).toBe(1);
    });

    it('different containers: the second overlapping mount() call throws a hard invariant error', async () => {
      const mountManager = new DeferredMountManager();
      const { mounter, root } = makeFixture({ mountManager });
      mounter.attach(root);

      const containerA = document.createElement('div');
      const containerB = document.createElement('div');
      const first = mounter.mount('ext-1', containerA);

      await expect(mounter.mount('ext-1', containerB)).rejects.toThrow(/ext-1/);

      mountManager.settle();
      await expect(first).resolves.not.toThrow();
    });
  });

  describe('in-flight unmount coalescing', () => {
    /** Mount manager whose `unmountExtension` doesn't resolve until `release()` is called. */
    class DeferredUnmountMountManager extends MountManager {
      unmountCallCount = 0;
      private release: (() => void) | undefined;
      private readonly gate = new Promise<void>((resolve) => {
        this.release = resolve;
      });

      async loadExtension(_extensionId: string): Promise<void> {}
      async preloadExtension(_extensionId: string): Promise<void> {}

      async mountExtension(extensionId: string, _container: Element): Promise<ParentMfeBridge> {
        return { instanceId: extensionId, dispose: () => {} };
      }

      async unmountExtension(_extensionId: string): Promise<void> {
        this.unmountCallCount += 1;
        await this.gate;
      }

      releaseExtension(_extensionId: string): void {}
      setTheme(_cssVars: Record<string, string>): void {}

      settle(): void {
        this.release?.();
      }
    }

    it('overlapping unmount() calls for the same extension coalesce into one physical unmount, and both settle', async () => {
      const mountManager = new DeferredUnmountMountManager();
      const { mounter, root } = makeFixture({ mountManager });
      mounter.attach(root);
      await mounter.mount('ext-1', document.createElement('div'));

      const first = mounter.unmount('ext-1');
      const second = mounter.unmount('ext-1');

      // Neither call has settled yet, so the first's cleanup could not have
      // already deleted the tracked entry out from under the second.
      expect(mountManager.unmountCallCount).toBe(1);

      mountManager.settle();
      await expect(first).resolves.not.toThrow();
      await expect(second).resolves.not.toThrow();

      // Only ONE physical unmount ran for both overlapping calls.
      expect(mountManager.unmountCallCount).toBe(1);
    });

    it('a mount requested while an unmount for the same extension is in flight is reported via getUnmountInFlight until that unmount settles', async () => {
      const mountManager = new DeferredUnmountMountManager();
      const { mounter, root } = makeFixture({ mountManager });
      mounter.attach(root);
      await mounter.mount('ext-1', document.createElement('div'));

      const unmountPromise = mounter.unmount('ext-1');
      // A second, overlapping unmount for the same extension — proves the
      // in-flight entry an interleaved mount request would consult is not
      // torn down by one of the two overlapping calls settling early.
      const secondUnmountPromise = mounter.unmount('ext-1');

      expect(mounter.getUnmountInFlight('ext-1')).toBeDefined();

      mountManager.settle();
      await unmountPromise;
      await secondUnmountPromise;

      expect(mounter.getUnmountInFlight('ext-1')).toBeUndefined();
    });

    it('detach() routes every extension through the tracked unmount() path, so a concurrent unmount for the same extension coalesces with it', async () => {
      const mountManager = new DeferredUnmountMountManager();
      const DOMAIN = 'detach-race-domain';
      const mounted = ['ext-a'];
      const getMountedExtensions = (_domainId: string): readonly string[] => [...mounted];
      const addMountedExtension = vi.fn();
      const removeMountedExtension = vi.fn();

      const mounter = new DefaultExtensionMounter(
        DOMAIN,
        mountManager,
        addMountedExtension,
        removeMountedExtension,
        getMountedExtensions,
      );
      const root = document.createElement('div');
      mounter.attach(root);

      const detachPromise = mounter.detach();
      // detach() is in flight and has already started ext-a's unmount
      // through the tracked path — a second call for the same extension
      // must coalesce with it rather than issuing a second physical unmount.
      expect(mounter.getUnmountInFlight('ext-a')).toBeDefined();
      const raceUnmount = mounter.unmount('ext-a');

      mountManager.settle();
      await detachPromise;
      await raceUnmount;

      expect(mountManager.unmountCallCount).toBe(1);
    });

    it('inst-me-await-unmount-settle: getUnmountInFlight reports the unmount as tracked from the SAME synchronous turn unmount() was called in — even during the physical unmount call\'s own synchronous prefix, before its first await', async () => {
      /** Mount manager whose `unmountExtension` records what `getUnmountInFlight` reports BEFORE its own first `await`. */
      class SynchronousPrefixMountManager extends MountManager {
        unmountCallCount = 0;
        reentrantCheckDuringSyncPrefix: Promise<void> | undefined;
        private release: (() => void) | undefined;
        private readonly gate = new Promise<void>((resolve) => {
          this.release = resolve;
        });

        constructor(private readonly getMounterRef: () => DefaultExtensionMounter) {
          super();
        }

        async loadExtension(_extensionId: string): Promise<void> {}
        async preloadExtension(_extensionId: string): Promise<void> {}

        async mountExtension(extensionId: string, _container: Element): Promise<ParentMfeBridge> {
          return { instanceId: extensionId, dispose: () => {} };
        }

        async unmountExtension(extensionId: string): Promise<void> {
          this.unmountCallCount += 1;
          // Captured synchronously, in this call's own synchronous prefix —
          // the exact window a `deactivated` hook or the lifecycle's own
          // `unmount` could re-enter a mount check in, before this call has
          // reached its own first `await` below.
          this.reentrantCheckDuringSyncPrefix = this.getMounterRef().getUnmountInFlight(extensionId);
          await this.gate;
        }

        releaseExtension(_extensionId: string): void {}
        setTheme(_cssVars: Record<string, string>): void {}

        settle(): void {
          this.release?.();
        }
      }

      const mounterRefHolder: { current?: DefaultExtensionMounter } = {};
      const mountManager = new SynchronousPrefixMountManager(() => mounterRefHolder.current!);
      const { mounter, root } = makeFixture({ mountManager });
      mounterRefHolder.current = mounter;
      mounter.attach(root);
      await mounter.mount('ext-1', document.createElement('div'));

      const unmountPromise = mounter.unmount('ext-1');

      // The re-entrant check made from inside the physical unmount's own
      // synchronous prefix already observes this unmount as tracked.
      expect(mountManager.reentrantCheckDuringSyncPrefix).toBeDefined();

      mountManager.settle();
      await unmountPromise;

      // The re-entrant caller's captured promise is the SAME tracked
      // settlement as the outer unmount() call — it resolves alongside it.
      await expect(mountManager.reentrantCheckDuringSyncPrefix).resolves.toBeUndefined();
    });
  });

  describe('detach()', () => {
    it('removes every mounted extension from the mount set', async () => {
      const DOMAIN = 'detach-domain';
      const mountManager = new FakeMountManager();
      const mountedIds = ['ext-a', 'ext-b'];
      const getMountedExtensions = (_domainId: string): readonly string[] => [...mountedIds];
      const addMountedExtension = vi.fn();
      const removeMountedExtension = vi.fn();

      const mounter = new DefaultExtensionMounter(
        DOMAIN,
        mountManager,
        addMountedExtension,
        removeMountedExtension,
        getMountedExtensions
      );
      const root = document.createElement('div');
      mounter.attach(root);

      await mounter.detach();

      expect(removeMountedExtension).toHaveBeenCalledWith(DOMAIN, 'ext-a');
      expect(removeMountedExtension).toHaveBeenCalledWith(DOMAIN, 'ext-b');
    });
  });

  describe('slot-detach / mount-execution failure handling', () => {
    /**
     * Mount manager whose `mountExtension`/`unmountExtension` for a given
     * extension id can be gated on a controlled deferred, and whose
     * `unmountExtension` for a given id can be made to reject with a
     * configured error — all without sleeps, real timers, or
     * microtask-flush loops.
     */
    class GatedMountManager extends MountManager {
      readonly mountCalls: string[] = [];
      readonly unmountCalls: string[] = [];
      private readonly mountGates = new Map<string, { promise: Promise<void>; resolve: () => void }>();
      private readonly unmountGates = new Map<string, { promise: Promise<void>; resolve: () => void }>();
      private readonly unmountFailures = new Map<string, Error>();

      gateMount(extensionId: string): void {
        let resolve!: () => void;
        const promise = new Promise<void>((r) => {
          resolve = r;
        });
        this.mountGates.set(extensionId, { promise, resolve });
      }

      gateUnmount(extensionId: string): void {
        let resolve!: () => void;
        const promise = new Promise<void>((r) => {
          resolve = r;
        });
        this.unmountGates.set(extensionId, { promise, resolve });
      }

      resolveMount(extensionId: string): void {
        this.mountGates.get(extensionId)?.resolve();
      }

      resolveUnmount(extensionId: string): void {
        this.unmountGates.get(extensionId)?.resolve();
      }

      failUnmount(extensionId: string, error: Error): void {
        this.unmountFailures.set(extensionId, error);
      }

      async loadExtension(_extensionId: string): Promise<void> {}
      async preloadExtension(_extensionId: string): Promise<void> {}

      async mountExtension(extensionId: string, _container: Element): Promise<ParentMfeBridge> {
        this.mountCalls.push(extensionId);
        const gate = this.mountGates.get(extensionId);
        if (gate) {
          await gate.promise;
        }
        return { instanceId: extensionId, dispose: () => {} };
      }

      async unmountExtension(extensionId: string): Promise<void> {
        this.unmountCalls.push(extensionId);
        const gate = this.unmountGates.get(extensionId);
        if (gate) {
          await gate.promise;
        }
        const failure = this.unmountFailures.get(extensionId);
        if (failure) {
          throw failure;
        }
      }

      releaseExtension(_extensionId: string): void {}
      setTheme(_cssVars: Record<string, string>): void {}
    }

    it('inst-sd-clear-root-first: a mount whose lifecycle mount settles while detach is unmounting another occupant is not placed under the departing root', async () => {
      const DOMAIN = 'clear-root-first-domain';
      const mountManager = new GatedMountManager();
      const mounted: string[] = [];
      const addMountedExtension = vi.fn((_domainId: string, extensionId: string) => {
        mounted.push(extensionId);
      });
      const removeMountedExtension = vi.fn((_domainId: string, extensionId: string) => {
        const index = mounted.indexOf(extensionId);
        if (index >= 0) {
          mounted.splice(index, 1);
        }
      });
      const getMountedExtensions = (_domainId: string): readonly string[] => [...mounted];

      const mounter = new DefaultExtensionMounter(
        DOMAIN,
        mountManager,
        addMountedExtension,
        removeMountedExtension,
        getMountedExtensions
      );
      const root = document.createElement('div');
      mounter.attach(root);

      // ext-a mounts normally first, becoming detach's occupant.
      await mounter.mount('ext-a', document.createElement('div'));

      // ext-a's unmount is gated so detach() stays in flight while ext-b's
      // own lifecycle mount settles.
      mountManager.gateUnmount('ext-a');
      mountManager.gateMount('ext-b');

      const containerB = document.createElement('div');
      const mountBPromise = mounter.mount('ext-b', containerB);
      const detachPromise = mounter.detach();

      mountManager.resolveMount('ext-b');
      await expect(mountBPromise).rejects.toThrow(/detached/);

      expect(root.contains(containerB)).toBe(false);
      expect(mounted.includes('ext-b')).toBe(false);

      mountManager.resolveUnmount('ext-a');
      await detachPromise;
    });

    it('inst-me-mount-root-detached: a mount whose root is detached during its lifecycle mount fails with the detached-root error and compensates by unmounting the lifecycle', async () => {
      const mountManager = new GatedMountManager();
      const { mounter, root } = makeFixture({ mountManager });
      mounter.attach(root);

      mountManager.gateMount('ext-1');
      const container = document.createElement('div');
      const mountPromise = mounter.mount('ext-1', container);

      await mounter.detach();
      mountManager.resolveMount('ext-1');

      await expect(mountPromise).rejects.toThrow(/detached/);
      expect(mountManager.unmountCalls).toContain('ext-1');
    });

    it('inst-me-mount-root-detached: when the compensating unmount also fails, the thrown error is the detached-root error and its cause is the compensation error', async () => {
      const mountManager = new GatedMountManager();
      const { mounter, root } = makeFixture({ mountManager });
      mounter.attach(root);

      const compensationError = new Error('compensation unmount failed');
      mountManager.gateMount('ext-1');
      mountManager.failUnmount('ext-1', compensationError);
      const container = document.createElement('div');
      const mountPromise = mounter.mount('ext-1', container);

      await mounter.detach();
      mountManager.resolveMount('ext-1');

      let caught: unknown;
      try {
        await mountPromise;
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(Error);
      expect((caught as Error).message).toMatch(/detached/);
      expect((caught as Error).cause).toBe(compensationError);
    });

    it('inst-me-mount-rollback: a bookkeeping failure after a successful lifecycle mount is rolled back', async () => {
      const DOMAIN = 'rollback-domain';
      const mountManager = new GatedMountManager();
      const addMountedExtension = vi.fn(() => {
        throw new Error('record failed');
      });
      const removeMountedExtension = vi.fn();
      const getMountedExtensions = (_domainId: string): readonly string[] => [];

      const mounter = new DefaultExtensionMounter(
        DOMAIN,
        mountManager,
        addMountedExtension,
        removeMountedExtension,
        getMountedExtensions
      );
      const root = document.createElement('div');
      mounter.attach(root);

      const container = document.createElement('div');
      await expect(mounter.mount('ext-1', container)).rejects.toThrow('record failed');

      expect(root.contains(container)).toBe(false);
      expect(removeMountedExtension).toHaveBeenCalledWith(DOMAIN, 'ext-1');
      expect(mountManager.unmountCalls).toContain('ext-1');
    });

    it('inst-um-failure-container-removed: an unmount whose lifecycle unmount fails still removes the container and mount-set entry', async () => {
      const mountManager = new GatedMountManager();
      const { mounter, root, DOMAIN, removeMountedExtension } = makeFixture({ mountManager });
      mounter.attach(root);

      const container = document.createElement('div');
      await mounter.mount('ext-1', container);

      const lifecycleError = new Error('lifecycle unmount failed');
      mountManager.failUnmount('ext-1', lifecycleError);

      await expect(mounter.unmount('ext-1')).rejects.toThrow(lifecycleError);

      expect(root.contains(container)).toBe(false);
      expect(removeMountedExtension).toHaveBeenCalledWith(DOMAIN, 'ext-1');
    });

    it('inst-sd-continue-on-failure / inst-sd-aggregate-failure: detach continues past a failed occupant and aggregates every failure in mount-set order', async () => {
      const DOMAIN = 'aggregate-domain';
      const mountManager = new GatedMountManager();
      const mountedIds = ['ext-a', 'ext-b', 'ext-c'];
      const getMountedExtensions = (_domainId: string): readonly string[] => [...mountedIds];
      const addMountedExtension = vi.fn();
      const removeMountedExtension = vi.fn();

      const mounter = new DefaultExtensionMounter(
        DOMAIN,
        mountManager,
        addMountedExtension,
        removeMountedExtension,
        getMountedExtensions
      );
      const root = document.createElement('div');
      mounter.attach(root);

      const errorA = new Error('ext-a unmount failed');
      const errorC = new Error('ext-c unmount failed');
      mountManager.failUnmount('ext-a', errorA);
      mountManager.failUnmount('ext-c', errorC);

      let caught: unknown;
      try {
        await mounter.detach();
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(AggregateError);
      expect(Array.from((caught as AggregateError).errors)).toEqual([errorA, errorC]);
      expect(mountManager.unmountCalls).toEqual(['ext-a', 'ext-b', 'ext-c']);
    });

    it('inst-sd-single-failure: detach rejects with exactly the one failure when only one occupant fails to unmount', async () => {
      const DOMAIN = 'single-failure-domain';
      const mountManager = new GatedMountManager();
      const mountedIds = ['ext-a', 'ext-b', 'ext-c'];
      const getMountedExtensions = (_domainId: string): readonly string[] => [...mountedIds];
      const addMountedExtension = vi.fn();
      const removeMountedExtension = vi.fn();

      const mounter = new DefaultExtensionMounter(
        DOMAIN,
        mountManager,
        addMountedExtension,
        removeMountedExtension,
        getMountedExtensions
      );
      const root = document.createElement('div');
      mounter.attach(root);

      const errorB = new Error('ext-b unmount failed');
      mountManager.failUnmount('ext-b', errorB);

      let caught: unknown;
      try {
        await mounter.detach();
      } catch (error) {
        caught = error;
      }

      expect(caught).toBe(errorB);
      expect(mountManager.unmountCalls).toEqual(['ext-a', 'ext-b', 'ext-c']);
    });
  });

  describe('ExtensionReleaserProvider.for(mounter).release()', () => {
    it('a destroy callback that throws rejects release() with that error, cleans up, and a later release for the same id starts fresh and succeeds', async () => {
      const mountManager = new FakeMountManager();
      const { mounter, root } = makeFixture({ mountManager });
      mounter.attach(root);
      await mounter.mount('ext-1', document.createElement('div'));

      const throwingDestroy = (): void => {
        throw new Error('destroy boom');
      };
      ExtensionReleaserProvider.for(mounter).registerDestroy('ext-1', throwingDestroy);
      await expect(ExtensionReleaserProvider.for(mounter).release('ext-1')).rejects.toThrow('destroy boom');
      expect(mountManager.unmountCalls).toEqual(['ext-1']);

      const normalDestroy = vi.fn();
      ExtensionReleaserProvider.for(mounter).registerDestroy('ext-1', normalDestroy);
      await expect(ExtensionReleaserProvider.for(mounter).release('ext-1')).resolves.toBeUndefined();
      expect(normalDestroy).toHaveBeenCalledTimes(1);
      // A fresh physical unmount ran for the second call — it did not join
      // a stale entry left behind by the first, failed call.
      expect(mountManager.unmountCalls).toEqual(['ext-1', 'ext-1']);
    });

    it('a retry from inside release()\'s own rejection handler starts fresh work instead of joining the rejected entry', async () => {
      class FailOnceMountManager extends MountManager {
        unmountCalls = 0;

        async loadExtension(_extensionId: string): Promise<void> {}
        async preloadExtension(_extensionId: string): Promise<void> {}

        async mountExtension(extensionId: string, _container: Element): Promise<ParentMfeBridge> {
          return { instanceId: extensionId, dispose: () => {} };
        }

        async unmountExtension(_extensionId: string): Promise<void> {
          this.unmountCalls += 1;
          if (this.unmountCalls === 1) {
            throw new Error('boom');
          }
        }

        releaseExtension(_extensionId: string): void {}
        setTheme(_cssVars: Record<string, string>): void {}
      }

      const mountManager = new FailOnceMountManager();
      const { mounter, root } = makeFixture({ mountManager });
      mounter.attach(root);
      await mounter.mount('ext-1', document.createElement('div'));

      const retried = ExtensionReleaserProvider.for(mounter).release('ext-1').catch(() => ExtensionReleaserProvider.for(mounter).release('ext-1'));

      await expect(retried).resolves.toBeUndefined();
      expect(mountManager.unmountCalls).toBe(2);
    });

    it('a synchronous follow-up call from inside release()\'s own fulfillment handler starts fresh work', async () => {
      const mountManager = new FakeMountManager();
      const { mounter, root } = makeFixture({ mountManager });
      mounter.attach(root);
      await mounter.mount('ext-1', document.createElement('div'));

      const followUp = ExtensionReleaserProvider.for(mounter).release('ext-1').then(() => ExtensionReleaserProvider.for(mounter).release('ext-1'));

      await expect(followUp).resolves.toBeUndefined();
      // Both the outer release and the follow-up release ran their own
      // physical unmount — the follow-up did not join an already-settled
      // entry left in the map by the outer call.
      expect(mountManager.unmountCalls).toEqual(['ext-1', 'ext-1']);
    });

    it('a release joining in the microtask gap between reading the registered destroy and settling still has its destroy invoked exactly once', async () => {
      let resolveUnmount!: () => void;
      const unmountPromise = new Promise<void>((resolve) => {
        resolveUnmount = resolve;
      });

      class ControllableMounter extends ExtensionMounter {
        attach(_root: Element): void {}
        async detach(): Promise<void> {}
        async mount(_extensionId: string, _container: Element): Promise<void> {}
        unmount(_extensionId: string): Promise<void> {
          return unmountPromise;
        }
      }

      const mounter = new ControllableMounter();
      const destroy = vi.fn();
      ExtensionReleaserProvider.for(mounter).registerDestroy('ext-1', destroy);

      const first = ExtensionReleaserProvider.for(mounter).release('ext-1');
      let second!: Promise<void>;
      // A reaction registered directly on the SAME promise `unmount()`
      // returned, above — it joins the in-flight release from the exact
      // microtask gap between release()'s own read of the registered
      // destroy and its cleanup + settlement, so the destroy read by the
      // FIRST release still runs exactly once.
      unmountPromise.then(() => {
        second = ExtensionReleaserProvider.for(mounter).release('ext-1');
      });

      resolveUnmount();
      await first;
      await second;

      expect(destroy).toHaveBeenCalledTimes(1);
    });

    it('overlapping releases for two DIFFERENT mounters and the same extension id do not coalesce with each other', async () => {
      let resolveFirst!: () => void;
      let resolveSecond!: () => void;
      const firstUnmount = new Promise<void>((resolve) => {
        resolveFirst = resolve;
      });
      const secondUnmount = new Promise<void>((resolve) => {
        resolveSecond = resolve;
      });

      class ControllableMounter extends ExtensionMounter {
        constructor(private readonly gate: Promise<void>) {
          super();
        }
        attach(_root: Element): void {}
        async detach(): Promise<void> {}
        async mount(_extensionId: string, _container: Element): Promise<void> {}
        unmount(_extensionId: string): Promise<void> {
          return this.gate;
        }
      }

      const mounterA = new ControllableMounter(firstUnmount);
      const mounterB = new ControllableMounter(secondUnmount);

      const destroyA = vi.fn();
      const destroyB = vi.fn();
      ExtensionReleaserProvider.for(mounterA).registerDestroy('ext-1', destroyA);
      ExtensionReleaserProvider.for(mounterB).registerDestroy('ext-1', destroyB);

      const releaseA = ExtensionReleaserProvider.for(mounterA).release('ext-1');
      const releaseB = ExtensionReleaserProvider.for(mounterB).release('ext-1');

      resolveFirst();
      await releaseA;
      expect(destroyA).toHaveBeenCalledTimes(1);
      expect(destroyB).not.toHaveBeenCalled();

      resolveSecond();
      await releaseB;
      expect(destroyB).toHaveBeenCalledTimes(1);
    });
  });

  describe('abstract contract', () => {
    it('getMounted is not exposed on the ExtensionMounter abstract class', () => {
      const { mounter } = makeFixture();
      // The abstract base ExtensionMounter defines only attach, detach, mount, unmount.
      const base = mounter as ExtensionMounter;
      expect('getMounted' in base).toBe(false);
    });

    it('release is not exposed on the ExtensionMounter prototype', () => {
      expect('release' in ExtensionMounter.prototype).toBe(false);
    });
  });

  describe('public barrel', () => {
    it('does not export ExtensionReleaser or ExtensionReleaserProvider', () => {
      expect('ExtensionReleaser' in (barrel as Record<string, unknown>)).toBe(false);
      expect('ExtensionReleaserProvider' in (barrel as Record<string, unknown>)).toBe(false);
    });
  });
});
