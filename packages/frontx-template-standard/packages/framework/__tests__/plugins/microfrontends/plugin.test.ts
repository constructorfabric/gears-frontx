/**
 * Tests for microfrontends plugin - Phase 13
 *
 * Tests Flux integration: actions, effects, slice, components, navigation.
 * Phase 7.9 tests (plugin propagation, JSON loading) are in microfrontends.test.ts.
 *
 * @packageDocumentation
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { createFrontX } from '../../../src/createFrontX';
import { effects } from '../../../src/plugins/effects';
import {
  microfrontends,
  loadExtension,
  unmountExtension,
  MfeEvents,
  selectExtensionState,
  selectExtensionError,
  selectMountedExtensions,
} from '../../../src/plugins/microfrontends';
import { eventBus, resetStore } from '@gears-frontx/state';
import {
  FRONTX_ACTION_MOUNT_EXT,
  mfeRegistryFactory,
  type Extension,
  type MfeRegistry,
} from '@gears-frontx/screensets';
import { gtsPlugin } from '@gears-frontx/screensets/plugins/gts';
import type { FrontXApp } from '../../../src/types';

/**
 * The Phase 13 mount-sync suites only exercise a handful of MfeRegistry
 * methods. We stub exactly those surfaces to keep the test scaffolding honest
 * instead of blanket-casting to MfeRegistry.
 */
type MountSyncRegistry = Pick<
  MfeRegistry,
  | 'typeSystem'
  | 'executeActionsChain'
  | 'getMountedExtensions'
  | 'registerExtension'
  | 'unregisterExtension'
>;

function asMfeRegistry(stub: MountSyncRegistry): MfeRegistry {
  // This is the only cast we allow: the factory.build() signature returns
  // MfeRegistry and the production code paths we exercise rely only on
  // the MountSyncRegistry subset.
  return stub as unknown as MfeRegistry;
}

describe('microfrontends plugin - Phase 13', () => {
  let apps: FrontXApp[] = [];

  afterEach(() => {
    apps.forEach((app) => {
      app.destroy();
    });
    apps = [];
    vi.restoreAllMocks();
    eventBus.clearAll();
    resetStore();
  });
  describe('13.8.1 - plugin registration', () => {
    it('should register plugin with Flux wiring', () => {
      const plugin = microfrontends({ typeSystem: gtsPlugin });

      expect(plugin.name).toBe('microfrontends');
      expect(plugin.provides).toBeDefined();
      expect(plugin.provides?.registries).toBeDefined();
      expect(plugin.provides?.slices).toBeDefined();
      expect(plugin.provides?.slices?.length).toBeGreaterThan(0);
      // NOTE: Effects are NOT in provides.effects - they are initialized in onInit
      // to avoid duplicate event listeners (framework calls provides.effects at step 5,
      // then onInit at step 7). We need cleanup references, so only init in onInit.
      expect(plugin.provides?.actions).toBeDefined();
    });

    it('should provide MFE actions', () => {
      const plugin = microfrontends({ typeSystem: gtsPlugin });

      expect(plugin.provides?.actions).toHaveProperty('loadExtension');
      expect(plugin.provides?.actions).toHaveProperty('mountExtension');
      expect(plugin.provides?.actions).toHaveProperty('unmountExtension');
      expect(plugin.provides?.actions).not.toHaveProperty('handleMfeHostAction');
    });

    it('should make MFE actions available on app.actions', () => {
      const app = createFrontX()
        .use(effects())
        .use(microfrontends({ typeSystem: gtsPlugin }))
        .build();
      apps.push(app);

      expect(typeof app.actions.loadExtension).toBe('function');
      expect(typeof app.actions.mountExtension).toBe('function');
      expect(typeof app.actions.unmountExtension).toBe('function');
      expect(app.actions).not.toHaveProperty('handleMfeHostAction');
    });
  });

  describe('13.8.2 - MFE lifecycle actions call executeActionsChain', () => {
    it('should call executeActionsChain for loadExtension', async () => {
      const app = createFrontX()
        .use(effects())
        .use(microfrontends({ typeSystem: gtsPlugin }))
        .build();
      apps.push(app);

      const testDomainId = 'gts.frontx.mfes.ext.domain.v1~test.app.test.domain.v1';
      const testExtensionId = 'gts.frontx.mfes.ext.extension.v1~test.app.test.ext.v1';
      const testExtension: Extension = {
        id: testExtensionId,
        domain: testDomainId,
        entry: 'gts.frontx.mfes.mfe.entry.v1~test.app.test.entry.v1',
      };

      const registry = app.mfeRegistry;
      if (!registry) throw new Error('expected mfeRegistry');
      vi.spyOn(registry, 'getExtension').mockReturnValue(testExtension);
      const spy = vi.spyOn(registry, 'executeActionsChain').mockResolvedValue(undefined);

      // loadExtension fires executeActionsChain fire-and-forget. Use vi.waitFor
      // so we deterministically observe the call even if the action scheduling
      // changes to a microtask boundary.
      loadExtension(testExtensionId);

      await vi.waitFor(() => {
        expect(spy).toHaveBeenCalledWith({
          action: {
            type: 'gts.frontx.mfes.comm.action.v1~frontx.mfes.ext.load_ext.v1~',
            target: testDomainId,
            payload: { subject: testExtensionId },
          },
        });
      });
    });

    it('should throw when unmountExtension resolves a domain that is not registered on the registry', () => {
      const app = createFrontX()
        .use(effects())
        .use(microfrontends({ typeSystem: gtsPlugin }))
        .build();
      apps.push(app);

      const testDomainId = 'gts.frontx.mfes.ext.domain.v1~test.app.test.domain.v1';
      const testExtensionId = 'gts.frontx.mfes.ext.extension.v1~test.app.test.ext.v1';
      const testExtension: Extension = {
        id: testExtensionId,
        domain: testDomainId,
        entry: 'gts.frontx.mfes.mfe.entry.v1~test.app.test.entry.v1',
      };

      const registry = app.mfeRegistry;
      if (!registry) throw new Error('expected mfeRegistry');
      vi.spyOn(registry, 'getExtension').mockReturnValue(testExtension);
      vi.spyOn(registry, 'getDomain').mockReturnValue(undefined);
      const chainSpy = vi.spyOn(registry, 'executeActionsChain').mockResolvedValue(undefined);

      expect(() => {
        unmountExtension(testExtensionId);
      }).toThrow(
        /domain 'gts\.frontx\.mfes\.ext\.domain\.v1~test\.app\.test\.domain\.v1' is not registered.*extension 'gts\.frontx\.mfes\.ext\.extension\.v1~test\.app\.test\.ext\.v1'/
      );
      expect(chainSpy).not.toHaveBeenCalled();
    });

    it('should verify registration events still work', () => {
      const eventSpy = vi.fn();
      const unsub = eventBus.on(MfeEvents.RegisterExtensionRequested, eventSpy);

      const testExtension: Extension = {
        id: 'gts.frontx.mfes.ext.extension.v1~test.ext.v1',
        domain: 'gts.frontx.mfes.ext.domain.v1~test.domain.v1',
        entry: 'gts.frontx.mfes.mfe.entry.v1~test.entry.v1',
      };

      // Use event bus directly (not the action, which is async)
      eventBus.emit(MfeEvents.RegisterExtensionRequested, { extension: testExtension });

      expect(eventSpy).toHaveBeenCalledWith({ extension: testExtension });

      unsub.unsubscribe();
    });
  });

  describe('13.8.3 - MFE slice (registration only)', () => {
    it('should initialize MFE slice in store', () => {
      const app = createFrontX()
        .use(effects())
        .use(microfrontends({ typeSystem: gtsPlugin }))
        .build();
      apps.push(app);

      const state = app.store.getState();
      expect(state).toHaveProperty('mfe');
      expect(state.mfe).toHaveProperty('registrationStates');
      expect(state.mfe).toHaveProperty('errors');
    });

    it('should track registration state via selectors', () => {
      const app = createFrontX()
        .use(effects())
        .use(microfrontends({ typeSystem: gtsPlugin }))
        .build();
      apps.push(app);

      const state = app.store.getState();

      // Initial state should be 'unregistered' for extensions not registered yet
      const uniqueExtId = 'test.unique.extension.v1';
      const registrationState = selectExtensionState(state, uniqueExtId);
      expect(registrationState).toBe('unregistered');

      const error = selectExtensionError(state, uniqueExtId);
      expect(error).toBeUndefined();
    });
  });

  describe('13.8.4 - mount state sync follows registry state', () => {
    it('does not mark the requested extension mounted when the chain resolves without mounting it', async () => {
      const fakeRegistry: MountSyncRegistry = {
        typeSystem: gtsPlugin,
        executeActionsChain: vi.fn().mockResolvedValue(undefined),
        getMountedExtensions: vi.fn().mockReturnValue([] as readonly string[]),
        registerExtension: vi.fn().mockResolvedValue(undefined),
        unregisterExtension: vi.fn().mockResolvedValue(undefined),
      };

      vi.spyOn(mfeRegistryFactory, 'build').mockReturnValue(asMfeRegistry(fakeRegistry));

      const app = createFrontX()
        .use(effects())
        .use(microfrontends({ typeSystem: gtsPlugin }))
        .build();
      apps.push(app);

      const domainId = 'gts.frontx.mfes.ext.domain.v1~test.app.test.domain.v1';
      const requestedExtensionId = 'gts.frontx.mfes.ext.extension.v1~test.app.requested.ext.v1';

      await app.mfeRegistry?.executeActionsChain({
        action: {
          type: FRONTX_ACTION_MOUNT_EXT,
          target: domainId,
          payload: { subject: requestedExtensionId },
        },
      });

      expect(selectMountedExtensions(app.store.getState(), domainId)).toEqual([]);
    });

    it('mirrors the registry mounted extension when a fallback path leaves a different extension mounted', async () => {
      const mountedByDomain = new Map<string, readonly string[]>();
      const fakeRegistry: MountSyncRegistry = {
        typeSystem: gtsPlugin,
        executeActionsChain: vi.fn().mockImplementation(async (chain: { action: { target: string } }) => {
          mountedByDomain.set(chain.action.target, ['gts.frontx.mfes.ext.extension.v1~test.app.fallback.ext.v1']);
        }),
        getMountedExtensions: vi.fn((domainId: string) => mountedByDomain.get(domainId) ?? []),
        registerExtension: vi.fn().mockResolvedValue(undefined),
        unregisterExtension: vi.fn().mockResolvedValue(undefined),
      };

      vi.spyOn(mfeRegistryFactory, 'build').mockReturnValue(asMfeRegistry(fakeRegistry));

      const app = createFrontX()
        .use(effects())
        .use(microfrontends({ typeSystem: gtsPlugin }))
        .build();
      apps.push(app);

      const domainId = 'gts.frontx.mfes.ext.domain.v1~test.app.test.domain.v1';
      const requestedExtensionId = 'gts.frontx.mfes.ext.extension.v1~test.app.requested.ext.v1';
      const fallbackExtensionId = 'gts.frontx.mfes.ext.extension.v1~test.app.fallback.ext.v1';

      await app.mfeRegistry?.executeActionsChain({
        action: {
          type: FRONTX_ACTION_MOUNT_EXT,
          target: domainId,
          payload: { subject: requestedExtensionId },
        },
      });

      expect(selectMountedExtensions(app.store.getState(), domainId)).toEqual([fallbackExtensionId]);
    });

    it('syncs every domain touched by a chained mount/unmount sequence', async () => {
      const mountedByDomain = new Map<string, readonly string[]>();
      const fakeRegistry: MountSyncRegistry = {
        typeSystem: gtsPlugin,
        executeActionsChain: vi.fn().mockImplementation(async (chain: {
          action: { target: string };
          next?: { action: { target: string } };
        }) => {
          mountedByDomain.set(chain.action.target, ['gts.frontx.mfes.ext.extension.v1~test.app.root.ext.v1']);
          if (chain.next) {
            mountedByDomain.set(chain.next.action.target, ['gts.frontx.mfes.ext.extension.v1~test.app.next.ext.v1']);
          }
        }),
        getMountedExtensions: vi.fn((domainId: string) => mountedByDomain.get(domainId) ?? []),
        registerExtension: vi.fn().mockResolvedValue(undefined),
        unregisterExtension: vi.fn().mockResolvedValue(undefined),
      };

      vi.spyOn(mfeRegistryFactory, 'build').mockReturnValue(asMfeRegistry(fakeRegistry));

      const app = createFrontX()
        .use(effects())
        .use(microfrontends({ typeSystem: gtsPlugin }))
        .build();
      apps.push(app);

      const rootDomainId = 'gts.frontx.mfes.ext.domain.v1~test.app.root.domain.v1';
      const nextDomainId = 'gts.frontx.mfes.ext.domain.v1~test.app.next.domain.v1';
      const rootExtensionId = 'gts.frontx.mfes.ext.extension.v1~test.app.requested.root.v1';
      const nextExtensionId = 'gts.frontx.mfes.ext.extension.v1~test.app.requested.next.v1';

      await app.mfeRegistry?.executeActionsChain({
        action: {
          type: FRONTX_ACTION_MOUNT_EXT,
          target: rootDomainId,
          payload: { subject: rootExtensionId },
        },
        next: {
          action: {
            type: FRONTX_ACTION_MOUNT_EXT,
            target: nextDomainId,
            payload: { subject: nextExtensionId },
          },
        },
      });

      expect(selectMountedExtensions(app.store.getState(), rootDomainId)).toEqual(['gts.frontx.mfes.ext.extension.v1~test.app.root.ext.v1']);
      expect(selectMountedExtensions(app.store.getState(), nextDomainId)).toEqual(['gts.frontx.mfes.ext.extension.v1~test.app.next.ext.v1']);
    });

    it('does not dispatch mount sync for fallback-only domains that were never executed', async () => {
      const mountedByDomain = new Map<string, readonly string[]>();
      const fakeRegistry: MountSyncRegistry = {
        typeSystem: gtsPlugin,
        executeActionsChain: vi.fn().mockImplementation(async (chain: { action: { target: string } }) => {
          mountedByDomain.set(chain.action.target, ['gts.frontx.mfes.ext.extension.v1~test.app.root.ext.v1']);
        }),
        getMountedExtensions: vi.fn((domainId: string) => mountedByDomain.get(domainId) ?? []),
        registerExtension: vi.fn().mockResolvedValue(undefined),
        unregisterExtension: vi.fn().mockResolvedValue(undefined),
      };

      vi.spyOn(mfeRegistryFactory, 'build').mockReturnValue(asMfeRegistry(fakeRegistry));

      const app = createFrontX()
        .use(effects())
        .use(microfrontends({ typeSystem: gtsPlugin }))
        .build();
      apps.push(app);

      const rootDomainId = 'gts.frontx.mfes.ext.domain.v1~test.app.root.domain.v1';
      const fallbackDomainId = 'gts.frontx.mfes.ext.domain.v1~test.app.fallback.domain.v1';
      const rootExtensionId = 'gts.frontx.mfes.ext.extension.v1~test.app.requested.root.v1';
      let notificationCount = 0;
      const unsubscribe = app.store.subscribe(() => {
        notificationCount += 1;
      });

      await app.mfeRegistry?.executeActionsChain({
        action: {
          type: FRONTX_ACTION_MOUNT_EXT,
          target: rootDomainId,
          payload: { subject: rootExtensionId },
        },
        fallback: {
          action: {
            type: FRONTX_ACTION_MOUNT_EXT,
            target: fallbackDomainId,
            payload: { subject: 'gts.frontx.mfes.ext.extension.v1~test.app.requested.fallback.v1' },
          },
        },
      });
      unsubscribe();

      expect(selectMountedExtensions(app.store.getState(), rootDomainId)).toEqual(['gts.frontx.mfes.ext.extension.v1~test.app.root.ext.v1']);
      expect(selectMountedExtensions(app.store.getState(), fallbackDomainId)).toEqual([]);
      expect(notificationCount).toBe(1);
    });
  });

  describe('13.8.8 - plugin lifecycle wiring', () => {
    it('initializes MFE effects on init so bus events invoke the registry', async () => {
      const app = createFrontX()
        .use(effects())
        .use(microfrontends({ typeSystem: gtsPlugin }))
        .build();
      apps.push(app);

      const registry = app.mfeRegistry;
      if (!registry) throw new Error('expected mfeRegistry');
      const registerSpy = vi
        .spyOn(registry, 'registerExtension')
        .mockResolvedValue(undefined);

      const extension: Extension = {
        id: 'gts.frontx.mfes.ext.extension.v1~test.app.init.ext.v1',
        domain: 'gts.frontx.mfes.ext.domain.v1~test.app.init.domain.v1',
        entry: 'gts.frontx.mfes.mfe.entry.v1~test.app.init.entry.v1',
      };
      eventBus.emit(MfeEvents.RegisterExtensionRequested, { extension });

      await vi.waitFor(() => {
        expect(registerSpy).toHaveBeenCalledWith(extension);
      });
    });

    it('tears down MFE effects on destroy so the bus no longer drives the registry', async () => {
      // Fresh app so we control its destroy ordering independently of afterEach.
      const app = createFrontX()
        .use(effects())
        .use(microfrontends({ typeSystem: gtsPlugin }))
        .build();

      const registry = app.mfeRegistry;
      if (!registry) throw new Error('expected mfeRegistry');
      const registerSpy = vi
        .spyOn(registry, 'registerExtension')
        .mockResolvedValue(undefined);

      app.destroy();

      eventBus.emit(MfeEvents.RegisterExtensionRequested, {
        extension: {
          id: 'gts.frontx.mfes.ext.extension.v1~test.app.post-destroy.ext.v1',
          domain: 'gts.frontx.mfes.ext.domain.v1~test.app.post-destroy.domain.v1',
          entry: 'gts.frontx.mfes.mfe.entry.v1~test.app.post-destroy.entry.v1',
        },
      });

      // Give any potential lingering microtask a chance to run.
      await Promise.resolve();
      await Promise.resolve();

      expect(registerSpy).not.toHaveBeenCalled();
    });
  });
});
