/**
 * Unit tests for mockEffects
 *
 * Tests the mock mode effects for managing mock plugin lifecycle.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { eventBus, createStore, registerSlice, resetStore } from '@gears-frontx/state';
import {
  ApiProtocol,
  apiRegistry,
  BaseApiService,
  isMockPlugin,
  RestMockPlugin,
  RestProtocol,
} from '@gears-frontx/api';
import { mockSlice } from '../src/slices/mockSlice';
import { initMockEffects, toggleMockMode, MockEvents } from '../src/effects/mockEffects';

// Test service that registers mock plugins
class TestMockService extends BaseApiService {
  public readonly restProtocol: RestProtocol;
  public readonly mockPlugin: RestMockPlugin;

  constructor() {
    const rest = new RestProtocol();
    super({ baseURL: '/api/test' }, rest);
    this.restProtocol = rest;

    // Register mock plugin (framework controls activation)
    this.mockPlugin = new RestMockPlugin({
      mockMap: { 'GET /api/test': () => ({ data: 'mock' }) },
    });
    this.registerPlugin(rest, this.mockPlugin);
  }
}

describe('mockEffects', () => {
  const cleanups: Array<() => void> = [];

  function trackCleanup(fn: () => void): () => void {
    cleanups.push(fn);
    return fn;
  }

  beforeEach(() => {
    // Clear module-level dynamic reducer registration so registerSlice wires the new store
    resetStore();

    // Reset API registry
    apiRegistry.reset();

    // Create fresh store with mock slice
    createStore({});
    registerSlice(mockSlice);
  });

  afterEach(() => {
    // Run all cleanups unconditionally. Previously this was guarded by an
    // `if (cleanup)` which meant a test that threw before assigning `cleanup`
    // would leak its bus subscription into the next test.
    while (cleanups.length > 0) {
      const fn = cleanups.pop();
      try {
        fn?.();
      } catch {
        // Swallow — we still want the remaining cleanups to run, and the
        // underlying failure is already represented by the original test error.
      }
    }
    eventBus.clearAll();
    apiRegistry.reset();
    resetStore();
    vi.restoreAllMocks();
  });

  describe('initMockEffects', () => {
    it('should return cleanup function', () => {
      const cleanup = trackCleanup(initMockEffects());
      expect(typeof cleanup).toBe('function');
    });

    it('should subscribe to mock toggle events', () => {
      const eventSpy = vi.spyOn(eventBus, 'on');
      trackCleanup(initMockEffects());

      expect(eventSpy).toHaveBeenCalledWith(MockEvents.Toggle, expect.any(Function));
    });

    it('attaches a second listener when called twice (duplicate init)', () => {
      // The effect does not guard against duplicate initialization. Cover the
      // behavior explicitly so a consumer that accidentally double-initialises
      // is not surprised by it.
      apiRegistry.register(TestMockService);
      const service = apiRegistry.getService(TestMockService);
      const addSpy = vi.spyOn(service.restProtocol.plugins, 'add');

      trackCleanup(initMockEffects());
      trackCleanup(initMockEffects());

      toggleMockMode(true);

      // Plugin was added once (second add is skipped by the existing-plugin guard),
      // but both listeners observed the event and attempted to sync.
      expect(service.restProtocol.plugins.getAll()).toContain(service.mockPlugin);
      expect(addSpy).toHaveBeenCalledTimes(1);
    });

    it('stops syncing plugins after cleanup is invoked', () => {
      apiRegistry.register(TestMockService);
      const service = apiRegistry.getService(TestMockService);

      const cleanup = initMockEffects();
      cleanup();

      toggleMockMode(true);

      // No listener left — plugin must not have been added.
      expect(service.restProtocol.plugins.getAll()).not.toContain(service.mockPlugin);
    });

    it('tolerates services that have no protocol plugin management', () => {
      // Register a service whose protocol is a valid ApiProtocol but does not
      // expose the optional `plugins` management API. syncMockPlugins must
      // skip this protocol silently instead of throwing.
      class NoPluginProtocol extends ApiProtocol {
        initialize = vi.fn();
        cleanup = vi.fn();
        getPluginsInOrder = vi.fn().mockReturnValue([]);
      }
      class ServiceWithoutPluginMgmt extends BaseApiService {
        constructor() {
          super({ baseURL: '/api/no-plugin-mgmt' }, new NoPluginProtocol());
        }
      }

      apiRegistry.register(ServiceWithoutPluginMgmt);
      trackCleanup(initMockEffects());

      expect(() => {
        toggleMockMode(true);
      }).not.toThrow();
      expect(() => {
        toggleMockMode(false);
      }).not.toThrow();
    });
  });

  describe('toggleMockMode', () => {
    it('should emit mock toggle event', () => {
      const emitSpy = vi.spyOn(eventBus, 'emit');
      toggleMockMode(true);

      expect(emitSpy).toHaveBeenCalledWith(MockEvents.Toggle, { enabled: true });
    });

    it('should emit with enabled false', () => {
      const emitSpy = vi.spyOn(eventBus, 'emit');
      toggleMockMode(false);

      expect(emitSpy).toHaveBeenCalledWith(MockEvents.Toggle, { enabled: false });
    });
  });

  describe('plugin synchronization', () => {
    it('should add mock plugins when enabled', () => {
      // Register test service
      apiRegistry.register(TestMockService);
      const service = apiRegistry.getService(TestMockService);

      // Initialize effects
      trackCleanup(initMockEffects());

      // Toggle mock mode ON
      toggleMockMode(true);

      // Verify plugin was added to protocol
      const protocolPlugins = service.restProtocol.plugins.getAll();
      expect(protocolPlugins).toContain(service.mockPlugin);
    });

    it('should remove mock plugins when disabled', () => {
      // Register test service
      apiRegistry.register(TestMockService);
      const service = apiRegistry.getService(TestMockService);

      // Initialize effects
      trackCleanup(initMockEffects());

      // Toggle mock mode ON then OFF
      toggleMockMode(true);
      toggleMockMode(false);

      // Verify plugin was removed from protocol
      const protocolPlugins = service.restProtocol.plugins.getAll();
      expect(protocolPlugins).not.toContain(service.mockPlugin);
    });

    it('should only affect mock plugins', () => {
      // Create service with both mock and non-mock plugins
      class MixedPluginService extends BaseApiService {
        public readonly restProtocol: RestProtocol;

        constructor() {
          const rest = new RestProtocol();
          super({ baseURL: '/api/mixed' }, rest);
          this.restProtocol = rest;

          // Register mock plugin
          this.registerPlugin(rest, new RestMockPlugin({ mockMap: {} }));
        }
      }

      apiRegistry.register(MixedPluginService);
      const service = apiRegistry.getService(MixedPluginService);

      // Initialize effects
      trackCleanup(initMockEffects());

      // Toggle mock mode ON
      toggleMockMode(true);

      // Verify only mock plugins were added
      const plugins = service.restProtocol.plugins.getAll();
      const mockPlugins = plugins.filter((p) => isMockPlugin(p));
      expect(mockPlugins.length).toBe(1);
    });

    it('should handle multiple services', () => {
      // Register multiple test services
      class Service1 extends BaseApiService {
        public readonly restProtocol: RestProtocol;
        public readonly mockPlugin: RestMockPlugin;

        constructor() {
          const rest = new RestProtocol();
          super({ baseURL: '/api/s1' }, rest);
          this.restProtocol = rest;
          this.mockPlugin = new RestMockPlugin({ mockMap: {} });
          this.registerPlugin(rest, this.mockPlugin);
        }
      }

      class Service2 extends BaseApiService {
        public readonly restProtocol: RestProtocol;
        public readonly mockPlugin: RestMockPlugin;

        constructor() {
          const rest = new RestProtocol();
          super({ baseURL: '/api/s2' }, rest);
          this.restProtocol = rest;
          this.mockPlugin = new RestMockPlugin({ mockMap: {} });
          this.registerPlugin(rest, this.mockPlugin);
        }
      }

      apiRegistry.register(Service1);
      apiRegistry.register(Service2);
      const s1 = apiRegistry.getService(Service1);
      const s2 = apiRegistry.getService(Service2);

      // Initialize effects
      trackCleanup(initMockEffects());

      // Toggle mock mode ON
      toggleMockMode(true);

      // Both services should have mock plugins added
      expect(s1.restProtocol.plugins.getAll()).toContain(s1.mockPlugin);
      expect(s2.restProtocol.plugins.getAll()).toContain(s2.mockPlugin);
    });

    it('does not re-add the same mock plugin on repeated enable toggles', () => {
      apiRegistry.register(TestMockService);
      const service = apiRegistry.getService(TestMockService);
      const addSpy = vi.spyOn(service.restProtocol.plugins, 'add');

      trackCleanup(initMockEffects());

      toggleMockMode(true);
      toggleMockMode(true);
      toggleMockMode(true);

      expect(addSpy).toHaveBeenCalledTimes(1);
      expect(service.restProtocol.plugins.getAll()).toContain(service.mockPlugin);
    });
  });

  describe('MockEvents', () => {
    it('should have correct event name', () => {
      expect(MockEvents.Toggle).toBe('mock/toggle');
    });
  });
});
