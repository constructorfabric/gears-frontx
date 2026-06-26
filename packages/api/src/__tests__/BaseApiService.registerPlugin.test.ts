/**
 * Unit tests for BaseApiService.registerPlugin and getPlugins
 *
 * Tests the generic plugin registration API used by framework for mock mode control.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BaseApiService } from '../BaseApiService';
import { RestProtocol } from '../protocols/RestProtocol';
import { SseProtocol } from '../protocols/SseProtocol';
import { RestMockPlugin, SseMockPlugin } from '@gears-frontx/frontx-template-standard';
import { ApiPluginBase, ApiProtocol } from '../types';

// Test service implementation
class TestApiService extends BaseApiService {
  public readonly restProtocol: RestProtocol;
  public readonly sseProtocol: SseProtocol;

  constructor() {
    const rest = new RestProtocol();
    const sse = new SseProtocol();
    super({ baseURL: '/api/test' }, rest, sse);
    this.restProtocol = rest;
    this.sseProtocol = sse;
  }

  // Expose registerPlugin for testing
  public testRegisterPlugin(protocol: ApiProtocol, plugin: ApiPluginBase): void {
    this.registerPlugin(protocol, plugin);
  }
}

describe('BaseApiService.registerPlugin', () => {
  let service: TestApiService;

  beforeEach(() => {
    service = new TestApiService();
  });

  afterEach(() => {
    service.cleanup();
  });

  describe('registerPlugin', () => {
    it('should register a plugin for a protocol', () => {
      const mockPlugin = new RestMockPlugin({ mockMap: {} });
      service.testRegisterPlugin(service.restProtocol, mockPlugin);

      const plugins = service.getPlugins();
      expect(plugins.has(service.restProtocol)).toBe(true);
      expect(plugins.get(service.restProtocol)?.has(mockPlugin)).toBe(true);
    });

    it('should register multiple plugins for the same protocol', () => {
      const mockPlugin1 = new RestMockPlugin({ mockMap: { 'GET /a': () => ({}) } });
      const mockPlugin2 = new RestMockPlugin({ mockMap: { 'GET /b': () => ({}) } });

      service.testRegisterPlugin(service.restProtocol, mockPlugin1);
      service.testRegisterPlugin(service.restProtocol, mockPlugin2);

      const plugins = service.getPlugins();
      const restPlugins = plugins.get(service.restProtocol);
      expect(restPlugins?.size).toBe(2);
      expect(restPlugins?.has(mockPlugin1)).toBe(true);
      expect(restPlugins?.has(mockPlugin2)).toBe(true);
    });

    it('should register plugins for different protocols', () => {
      const restMock = new RestMockPlugin({ mockMap: {} });
      const sseMock = new SseMockPlugin({ mockStreams: {} });

      service.testRegisterPlugin(service.restProtocol, restMock);
      service.testRegisterPlugin(service.sseProtocol, sseMock);

      const plugins = service.getPlugins();
      expect(plugins.has(service.restProtocol)).toBe(true);
      expect(plugins.has(service.sseProtocol)).toBe(true);
      expect(plugins.get(service.restProtocol)?.has(restMock)).toBe(true);
      expect(plugins.get(service.sseProtocol)?.has(sseMock)).toBe(true);
    });

    it('should throw error for unregistered protocol class', () => {
      class UnregisteredProtocol extends ApiProtocol {
        initialize(): void {}
        getPluginsInOrder(): readonly [] {
          return [];
        }
        cleanup(): void {}
      }

      const unregisteredProtocol = new UnregisteredProtocol();
      const mockPlugin = new RestMockPlugin({ mockMap: {} });

      expect(() => {
        service.testRegisterPlugin(unregisteredProtocol, mockPlugin);
      }).toThrow('Protocol "UnregisteredProtocol" not registered on this service');
    });

    it('should not add duplicate plugins', () => {
      const mockPlugin = new RestMockPlugin({ mockMap: {} });

      service.testRegisterPlugin(service.restProtocol, mockPlugin);
      service.testRegisterPlugin(service.restProtocol, mockPlugin);

      const plugins = service.getPlugins();
      const restPlugins = plugins.get(service.restProtocol);
      // Set deduplicates automatically
      expect(restPlugins?.size).toBe(1);
    });
  });

  describe('getPlugins', () => {
    it('should return empty map when no plugins registered', () => {
      const plugins = service.getPlugins();
      expect(plugins.size).toBe(0);
    });

    it('should return ReadonlyMap', () => {
      const mockPlugin = new RestMockPlugin({ mockMap: {} });
      service.testRegisterPlugin(service.restProtocol, mockPlugin);

      const plugins = service.getPlugins();

      // TypeScript ensures this is readonly, but we verify the returned value
      expect(plugins).toBeInstanceOf(Map);
      expect(typeof plugins.get).toBe('function');
      expect(typeof plugins.has).toBe('function');
      expect(typeof plugins.size).toBe('number');
    });

    it('should return ReadonlySet for each protocol', () => {
      const mockPlugin = new RestMockPlugin({ mockMap: {} });
      service.testRegisterPlugin(service.restProtocol, mockPlugin);

      const plugins = service.getPlugins();
      const restPlugins = plugins.get(service.restProtocol);

      expect(restPlugins).toBeInstanceOf(Set);
    });
  });

  describe('integration with framework pattern', () => {
    it('should work with isMockPlugin for filtering', async () => {
      const { isMockPlugin } = await import('../types');

      const mockPlugin = new RestMockPlugin({ mockMap: {} });
      service.testRegisterPlugin(service.restProtocol, mockPlugin);

      const plugins = service.getPlugins();
      for (const [, pluginSet] of plugins) {
        for (const plugin of pluginSet) {
          expect(isMockPlugin(plugin)).toBe(true);
        }
      }
    });
  });
});
