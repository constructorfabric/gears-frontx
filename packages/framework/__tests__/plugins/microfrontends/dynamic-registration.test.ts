/**
 * Tests for dynamic registration - Phase 20
 *
 * Tests dynamic registration actions, effects, slice state, and selectors.
 *
 * @packageDocumentation
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHAI3 } from '../../../src/createHAI3';
import { effects } from '../../../src/plugins/effects';
import {
  microfrontends,
  registerExtension,
  unregisterExtension,
  MfeEvents,
  type RegisterExtensionPayload,
  type UnregisterExtensionPayload,
  selectExtensionState,
  selectRegisteredExtensions,
} from '../../../src/plugins/microfrontends';
import { eventBus, resetStore } from '@cyberfabric/state';
import { gtsPlugin } from '@cyberfabric/screensets/plugins/gts';
import type { MfeRegistry } from '@cyberfabric/screensets';
import type { Extension, ExtensionDomain } from '@cyberfabric/framework';
import { TestContainerProvider } from '../../../src/testing/TestContainerProvider';
import type { HAI3App } from '../../../src/types';

function getMfeRegistry(app: HAI3App): MfeRegistry {
  if (!app.mfeRegistry) {
    throw new Error('Expected microfrontends plugin to provide mfeRegistry');
  }

  return app.mfeRegistry;
}

async function waitForExtensionState(
  app: HAI3App,
  extensionId: string,
  expectedState: ReturnType<typeof selectExtensionState>,
): Promise<void> {
  await vi.waitFor(() => {
    expect(selectExtensionState(app.store.getState(), extensionId)).toBe(expectedState);
  });
}

async function waitForRegisteredExtensions(
  app: HAI3App,
  predicate: (registered: string[]) => void,
): Promise<void> {
  await vi.waitFor(() => {
    predicate(selectRegisteredExtensions(app.store.getState()));
  });
}

describe('dynamic registration - Phase 20', () => {
  let apps: HAI3App[] = [];

  afterEach(() => {
    // Cleanup all apps created in tests
    apps.forEach((app) => {
      app.destroy();
    });
    apps = [];
    // Reset global store to prevent state pollution between tests
    resetStore();
  });

  /**
   * Matches the domain-level default timeout for lifecycle action chains.
   * Kept at the same 5s the production base domains default to so the fake
   * domain feels realistic rather than an accidental magic number.
   */
  const DEFAULT_DOMAIN_ACTION_TIMEOUT_MS = 5_000;

  const mockDomain: ExtensionDomain = {
    id: 'gts.hai3.mfes.ext.domain.v1~test.app.test.domain.v1',
    sharedProperties: [],
    actions: [
      'gts.hai3.mfes.comm.action.v1~hai3.mfes.ext.load_ext.v1~',
      'gts.hai3.mfes.comm.action.v1~hai3.mfes.ext.mount_ext.v1~',
    ],
    extensionsActions: [],
    defaultActionTimeout: DEFAULT_DOMAIN_ACTION_TIMEOUT_MS,
    lifecycleStages: [],
    extensionsLifecycleStages: [],
  };

  const mockExtension: Extension = {
    id: 'gts.hai3.mfes.ext.extension.v1~test.app.test.extension.v1',
    domain: 'gts.hai3.mfes.ext.domain.v1~test.app.test.domain.v1',
    entry: 'gts.hai3.mfes.mfe.entry.v1~test.app.test.entry.v1',
  };

  describe('20.5.1 - registerExtension action emits event', () => {
    let receivedPayloads: RegisterExtensionPayload[];
    let eventHandler: (payload: RegisterExtensionPayload) => void;

    beforeEach(() => {
      receivedPayloads = [];
      eventHandler = (payload) => {
        receivedPayloads.push(payload);
      };
    });

    afterEach(() => {
      vi.clearAllMocks();
    });

    it('should emit registerExtensionRequested event', () => {
      const unsub = eventBus.on(MfeEvents.RegisterExtensionRequested, eventHandler);

      registerExtension(mockExtension);

      expect(receivedPayloads).toEqual([{
        extension: mockExtension,
      }]);

      unsub.unsubscribe();
    });
  });

  describe('20.5.2 - registerExtension effect calls runtime', () => {
    it('should dispatch setExtensionRegistering and setExtensionRegistered on success', async () => {
      const app = createHAI3().use(effects()).use(microfrontends({ typeSystem: gtsPlugin })).build();
      const mfeRegistry = getMfeRegistry(app);
      apps.push(app);

      // Mock runtime method
      const registerExtensionSpy = vi.fn().mockResolvedValue(undefined);
      mfeRegistry.registerExtension = registerExtensionSpy;

      // First register the domain
      const testContainerProvider = new TestContainerProvider();
      mfeRegistry.registerDomain(mockDomain, testContainerProvider.prepareForDomain(mockDomain));

      // Trigger action
      registerExtension(mockExtension);

      await waitForExtensionState(app, mockExtension.id, 'registered');

      // Verify runtime method was called
      expect(registerExtensionSpy).toHaveBeenCalledWith(mockExtension);

      // Verify state transition
      const state = app.store.getState();
      expect(selectExtensionState(state, mockExtension.id)).toBe('registered');
    });

    it('should dispatch setExtensionError on failure', async () => {
      const app = createHAI3().use(effects()).use(microfrontends({ typeSystem: gtsPlugin })).build();
      const mfeRegistry = getMfeRegistry(app);
      apps.push(app);

      // Mock runtime method to fail
      const registerExtensionSpy = vi.fn().mockRejectedValue(new Error('Registration failed'));
      mfeRegistry.registerExtension = registerExtensionSpy;

      // Trigger action
      registerExtension(mockExtension);

      await waitForExtensionState(app, mockExtension.id, 'error');

      // Verify state shows error
      const state = app.store.getState();
      expect(selectExtensionState(state, mockExtension.id)).toBe('error');
    });
  });

  describe('20.5.3 - unregisterExtension action and effect', () => {
    let receivedPayloads: UnregisterExtensionPayload[];
    let eventHandler: (payload: UnregisterExtensionPayload) => void;

    beforeEach(() => {
      receivedPayloads = [];
      eventHandler = (payload) => {
        receivedPayloads.push(payload);
      };
    });

    afterEach(() => {
      vi.clearAllMocks();
    });

    it('should emit unregisterExtensionRequested event', () => {
      const unsub = eventBus.on(MfeEvents.UnregisterExtensionRequested, eventHandler);

      unregisterExtension(mockExtension.id);

      expect(receivedPayloads).toEqual([{
        extensionId: mockExtension.id,
      }]);

      unsub.unsubscribe();
    });

    it('should call runtime.unregisterExtension', async () => {
      const app = createHAI3().use(effects()).use(microfrontends({ typeSystem: gtsPlugin })).build();
      const mfeRegistry = getMfeRegistry(app);
      apps.push(app);

      // Mock runtime method
      const unregisterExtensionSpy = vi.fn().mockResolvedValue(undefined);
      mfeRegistry.unregisterExtension = unregisterExtensionSpy;

      // Trigger action
      unregisterExtension(mockExtension.id);

      await waitForExtensionState(app, mockExtension.id, 'unregistered');

      // Verify runtime method was called
      expect(unregisterExtensionSpy).toHaveBeenCalledWith(mockExtension.id);

      // Verify state transition
      const state = app.store.getState();
      expect(selectExtensionState(state, mockExtension.id)).toBe('unregistered');
    });
  });

  describe('20.5.6 - slice state transitions', () => {
    it('should transition through registration states', async () => {
      const app = createHAI3().use(effects()).use(microfrontends({ typeSystem: gtsPlugin })).build();
      const mfeRegistry = getMfeRegistry(app);
      apps.push(app);

      // Mock runtime completes on a microtask so `registering` is observable before `registered`
      mfeRegistry.registerExtension = vi.fn().mockImplementation(async () => {
        await Promise.resolve();
      });

      // Register domain first
      const testContainerProvider = new TestContainerProvider();
      mfeRegistry.registerDomain(mockDomain, testContainerProvider.prepareForDomain(mockDomain));

      // Initial state
      let state = app.store.getState();
      expect(selectExtensionState(state, mockExtension.id)).toBe('unregistered');

      // Trigger registration
      registerExtension(mockExtension);

      await waitForExtensionState(app, mockExtension.id, 'registering');

      // Wait for completion (registered state)
      await waitForExtensionState(app, mockExtension.id, 'registered');
      state = app.store.getState();
      expect(selectExtensionState(state, mockExtension.id)).toBe('registered');
    });
  });

  describe('20.5.7 - selectExtensionState selector', () => {
    it('should return unregistered for unknown extension', () => {
      const app = createHAI3().use(effects()).use(microfrontends({ typeSystem: gtsPlugin })).build();
      apps.push(app);
      const state = app.store.getState();

      expect(selectExtensionState(state, 'unknown.extension')).toBe('unregistered');
    });

    it('should return correct state for known extension', async () => {
      const app = createHAI3().use(effects()).use(microfrontends({ typeSystem: gtsPlugin })).build();
      const mfeRegistry = getMfeRegistry(app);
      apps.push(app);

      mfeRegistry.registerExtension = vi.fn().mockResolvedValue(undefined);
      const testContainerProvider = new TestContainerProvider();
      mfeRegistry.registerDomain(mockDomain, testContainerProvider.prepareForDomain(mockDomain));

      registerExtension(mockExtension);
      await waitForExtensionState(app, mockExtension.id, 'registered');

      const state = app.store.getState();
      expect(selectExtensionState(state, mockExtension.id)).toBe('registered');
    });
  });

  describe('20.5.8 - selectRegisteredExtensions selector', () => {
    it('should return empty array when no extensions registered', () => {
      const app = createHAI3().use(effects()).use(microfrontends({ typeSystem: gtsPlugin })).build();
      apps.push(app);
      const state = app.store.getState();

      expect(selectRegisteredExtensions(state)).toEqual([]);
    });

    it('should return array of registered extension IDs', async () => {
      const app = createHAI3().use(effects()).use(microfrontends({ typeSystem: gtsPlugin })).build();
      const mfeRegistry = getMfeRegistry(app);
      apps.push(app);

      mfeRegistry.registerExtension = vi.fn().mockResolvedValue(undefined);
      const testContainerProvider = new TestContainerProvider();
      mfeRegistry.registerDomain(mockDomain, testContainerProvider.prepareForDomain(mockDomain));

      const ext1 = { ...mockExtension, id: 'gts.hai3.mfes.ext.extension.v1~test.app.test.ext1.v1' };
      const ext2 = { ...mockExtension, id: 'gts.hai3.mfes.ext.extension.v1~test.app.test.ext2.v1' };

      registerExtension(ext1);
      registerExtension(ext2);
      await waitForRegisteredExtensions(app, (registered) => {
        expect(registered).toContain(ext1.id);
        expect(registered).toContain(ext2.id);
        expect(registered.length).toBe(2);
      });

      const state = app.store.getState();
      const registered = selectRegisteredExtensions(state);

      expect(registered).toContain(ext1.id);
      expect(registered).toContain(ext2.id);
      expect(registered.length).toBe(2);
    });

    it('should not include unregistered or error state extensions', async () => {
      const app = createHAI3().use(effects()).use(microfrontends({ typeSystem: gtsPlugin })).build();
      const mfeRegistry = getMfeRegistry(app);
      apps.push(app);

      const testContainerProvider = new TestContainerProvider();
      mfeRegistry.registerDomain(mockDomain, testContainerProvider.prepareForDomain(mockDomain));

      // Mock one success and one failure
      const ext1 = { ...mockExtension, id: 'gts.hai3.mfes.ext.extension.v1~test.app.test.ext1.v1' };
      const ext2 = { ...mockExtension, id: 'gts.hai3.mfes.ext.extension.v1~test.app.test.ext2.v1' };

      let callCount = 0;
      mfeRegistry.registerExtension = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 2) {
          throw new Error('Registration failed');
        }
      });

      registerExtension(ext1);
      registerExtension(ext2);
      await vi.waitFor(() => {
        expect(selectExtensionState(app.store.getState(), ext1.id)).toBe('registered');
        expect(selectExtensionState(app.store.getState(), ext2.id)).toBe('error');
      });

      const state = app.store.getState();
      const registered = selectRegisteredExtensions(state);

      expect(registered).toContain(ext1.id);
      expect(registered).not.toContain(ext2.id);
      expect(registered.length).toBe(1);
    });
  });
});
