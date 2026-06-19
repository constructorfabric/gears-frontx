/**
 * Unit tests for mockEffects
 *
 * Tests the mock mode effects for managing mock plugin lifecycle.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { eventBus, createStore, registerSlice } from '@gears-frontx/state';
import { apiRegistry, BaseApiService, RestProtocol, RestMockPlugin, isMockPlugin } from '@gears-frontx/api';
import { mockSlice } from '../slices/mockSlice';
import { initMockEffects, toggleMockMode, MockEvents } from '../effects/mockEffects';

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
  let cleanup: (() => void) | null = null;

  beforeEach(() => {
    // Reset API registry
    apiRegistry.reset();

    // Create fresh store with mock slice
    createStore({});
    registerSlice(mockSlice);
  });

  afterEach(() => {
    if (cleanup) {
      cleanup();
      cleanup = null;
    }
    apiRegistry.reset();
  });

  describe('initMockEffects', () => {
    it('should return cleanup function', () => {
      cleanup = initMockEffects();
      expect(typeof cleanup).toBe('function');
    });

    it('should subscribe to mock toggle events', () => {
      const eventSpy = vi.spyOn(eventBus, 'on');
      cleanup = initMockEffects();

      expect(eventSpy).toHaveBeenCalledWith(MockEvents.Toggle, expect.any(Function));
      eventSpy.mockRestore();
    });
  });

  describe('toggleMockMode', () => {
    it('should emit mock toggle event', () => {
      const emitSpy = vi.spyOn(eventBus, 'emit');
      toggleMockMode(true);

      expect(emitSpy).toHaveBeenCalledWith(MockEvents.Toggle, { enabled: true });
      emitSpy.mockRestore();
    });

    it('should emit with enabled false', () => {
      const emitSpy = vi.spyOn(eventBus, 'emit');
      toggleMockMode(false);

      expect(emitSpy).toHaveBeenCalledWith(MockEvents.Toggle, { enabled: false });
      emitSpy.mockRestore();
    });
  });

  describe('plugin synchronization', () => {
    it('should add mock plugins when enabled', () => {
      // Register test service
      apiRegistry.register(TestMockService);
      const service = apiRegistry.getService(TestMockService);

      // Initialize effects
      cleanup = initMockEffects();

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
      cleanup = initMockEffects();

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
      cleanup = initMockEffects();

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
      cleanup = initMockEffects();

      // Toggle mock mode ON
      toggleMockMode(true);

      // Both services should have mock plugins added
      expect(s1.restProtocol.plugins.getAll()).toContain(s1.mockPlugin);
      expect(s2.restProtocol.plugins.getAll()).toContain(s2.mockPlugin);
    });
  });

  describe('MockEvents', () => {
    it('should have correct event name', () => {
      expect(MockEvents.Toggle).toBe('mock/toggle');
    });
  });
});
