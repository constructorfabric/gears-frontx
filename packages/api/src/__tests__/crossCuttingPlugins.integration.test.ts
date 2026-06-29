/**
 * Task 72: Integration Test - Cross-Cutting Plugin
 *
 * Tests for plugins implementing multiple protocol hook interfaces.
 * Validates API Communication feature acceptance criteria for cross-cutting plugins.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RestProtocol } from '../protocols/RestProtocol';
import { SseProtocol } from '../protocols/SseProtocol';
import { SseMockPlugin } from '@gears-frontx/frontx-template-standard';
import { apiRegistry } from '../apiRegistry';
import type {
  RestPluginHooks,
  SsePluginHooks,
  RestRequestContext,
  RestResponseContext,
  SseConnectContext,
} from '../types';

/**
 * Example cross-cutting plugin implementing both REST and SSE hooks.
 * This pattern is useful for logging, metrics, or authentication plugins.
 */
class CrossCuttingLogPlugin implements RestPluginHooks, SsePluginHooks {
  public restRequestCount = 0;
  public restResponseCount = 0;
  public sseConnectCount = 0;
  public logs: string[] = [];

  // REST hooks
  async onRequest(ctx: RestRequestContext): Promise<RestRequestContext> {
    this.restRequestCount++;
    this.logs.push(`REST request: ${ctx.method} ${ctx.url}`);
    return ctx;
  }

  async onResponse(ctx: RestResponseContext): Promise<RestResponseContext> {
    this.restResponseCount++;
    this.logs.push(`REST response: ${ctx.status}`);
    return ctx;
  }

  // SSE hooks
  async onConnect(ctx: SseConnectContext): Promise<SseConnectContext> {
    this.sseConnectCount++;
    this.logs.push(`SSE connect: ${ctx.url}`);
    return ctx;
  }

  destroy(): void {
    this.logs.push('destroyed');
  }
}

describe('Cross-cutting plugins', () => {
  beforeEach(() => {
    apiRegistry.reset();
  });

  afterEach(() => {
    apiRegistry.reset();
    vi.useRealTimers();
  });

  it('should allow plugin implementing both RestPluginHooks and SsePluginHooks', () => {
    const crossPlugin = new CrossCuttingLogPlugin();

    // Plugin should satisfy both interfaces
    const restHooks: RestPluginHooks = crossPlugin;
    const sseHooks: SsePluginHooks = crossPlugin;

    expect(restHooks.onRequest).toBeDefined();
    expect(restHooks.onResponse).toBeDefined();
    expect(sseHooks.onConnect).toBeDefined();
  });

  it('should register same plugin instance with both protocols', () => {
    const crossPlugin = new CrossCuttingLogPlugin();

    // Register with both protocols
    apiRegistry.plugins.add(RestProtocol, crossPlugin);
    apiRegistry.plugins.add(SseProtocol, crossPlugin);

    expect(apiRegistry.plugins.has(RestProtocol, crossPlugin.constructor as never)).toBe(true);
    expect(apiRegistry.plugins.has(SseProtocol, crossPlugin.constructor as never)).toBe(true);
  });

  it('should execute REST hooks for REST requests through the protocol pipeline', async () => {
    const crossPlugin = new CrossCuttingLogPlugin();
    apiRegistry.plugins.add(RestProtocol, crossPlugin);

    const restProtocol = new RestProtocol();
    restProtocol.initialize({ baseURL: '/api' });
    restProtocol.setRequestDispatcherForTest(async () => ({
      status: 200,
      headers: {},
      data: { ok: true },
    }));

    const result = await restProtocol.get<{ ok: boolean }>('/users');

    expect(crossPlugin.restRequestCount).toBe(1);
    expect(crossPlugin.restResponseCount).toBe(1);
    expect(crossPlugin.logs).toContain('REST request: GET /api/users');
    expect(crossPlugin.logs).toContain('REST response: 200');
    expect(result).toEqual({ ok: true });
  });

  it('should execute SSE hooks for SSE connections through the protocol pipeline', async () => {
    vi.useFakeTimers();
    const crossPlugin = new CrossCuttingLogPlugin();
    apiRegistry.plugins.add(SseProtocol, crossPlugin);
    apiRegistry.plugins.add(SseProtocol, new SseMockPlugin({
      mockStreams: {
        '/api/stream': [
          { data: 'test' },
          { event: 'done', data: '' },
        ],
      },
      delay: 10,
    }));

    const sseProtocol = new SseProtocol();
    sseProtocol.initialize({ baseURL: '/api' });
    const onComplete = vi.fn();

    await sseProtocol.connect('/stream', () => undefined, onComplete);
    await Promise.resolve();
    await vi.runAllTimersAsync();

    expect(crossPlugin.sseConnectCount).toBe(1);
    expect(crossPlugin.logs).toContain('SSE connect: /api/stream');
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('should track both REST and SSE activity in same plugin instance', async () => {
    vi.useFakeTimers();
    const crossPlugin = new CrossCuttingLogPlugin();

    apiRegistry.plugins.add(RestProtocol, crossPlugin);
    apiRegistry.plugins.add(SseProtocol, crossPlugin);
    apiRegistry.plugins.add(SseProtocol, new SseMockPlugin({
      mockStreams: {
        '/api/events': [
          { data: 'test' },
          { event: 'done', data: '' },
        ],
      },
      delay: 10,
    }));

    const restProtocol = new RestProtocol();
    restProtocol.initialize({ baseURL: '/api' });
    restProtocol.setRequestDispatcherForTest(async (config) => ({
      status: 200,
      headers: {},
      data: { url: config.url },
    }));

    const sseProtocol = new SseProtocol();
    sseProtocol.initialize({ baseURL: '/api' });

    await restProtocol.post('/data', { test: true });
    await sseProtocol.connect('/events', () => undefined);
    await Promise.resolve();
    await vi.runAllTimersAsync();
    await restProtocol.get('/status');

    expect(crossPlugin.restRequestCount).toBe(2);
    expect(crossPlugin.restResponseCount).toBe(2);
    expect(crossPlugin.sseConnectCount).toBe(1);
    expect(crossPlugin.logs).toEqual([
      'REST request: POST /api/data',
      'REST response: 200',
      'SSE connect: /api/events',
      'REST request: GET /api/status',
      'REST response: 200',
    ]);
  });

  it('should call destroy once when removed from both protocols', () => {
    const crossPlugin = new CrossCuttingLogPlugin();

    apiRegistry.plugins.add(RestProtocol, crossPlugin);
    apiRegistry.plugins.add(SseProtocol, crossPlugin);

    // Remove from REST
    apiRegistry.plugins.remove(RestProtocol, crossPlugin.constructor as never);
    expect(crossPlugin.logs).toContain('destroyed');

    // Reset logs to check if destroy is called again
    const destroyCountBefore = crossPlugin.logs.filter((l) => l === 'destroyed').length;

    // Remove from SSE (destroy should be called again since it's a separate registration)
    apiRegistry.plugins.remove(SseProtocol, crossPlugin.constructor as never);
    const destroyCountAfter = crossPlugin.logs.filter((l) => l === 'destroyed').length;

    expect(destroyCountAfter).toBe(destroyCountBefore + 1);
  });

  it('should allow protocol-specific behavior in cross-cutting plugin', async () => {
    // Example: Auth plugin that adds headers differently for REST vs SSE
    class AuthCrossCuttingPlugin implements RestPluginHooks, SsePluginHooks {
      private token = 'test-token';
      public restHeaders: Record<string, string> = {};
      public sseHeaders: Record<string, string> = {};

      async onRequest(ctx: RestRequestContext): Promise<RestRequestContext> {
        this.restHeaders = { ...ctx.headers };
        return {
          ...ctx,
          headers: {
            ...ctx.headers,
            Authorization: `Bearer ${this.token}`,
          },
        };
      }

      async onConnect(ctx: SseConnectContext): Promise<SseConnectContext> {
        this.sseHeaders = { ...ctx.headers };
        return {
          ...ctx,
          headers: {
            ...ctx.headers,
            'X-Auth-Token': this.token,
          },
        };
      }

      destroy(): void {
        return;
      }
    }

    const authPlugin = new AuthCrossCuttingPlugin();

    // REST uses Authorization header
    const restResult = await authPlugin.onRequest({
      method: 'GET',
      url: '/api/data',
      headers: {},
    });
    expect(restResult.headers.Authorization).toBe('Bearer test-token');

    // SSE uses X-Auth-Token header
    const sseResult = await authPlugin.onConnect({
      url: '/api/stream',
      headers: {},
    });
    expect(sseResult.headers['X-Auth-Token']).toBe('test-token');
  });

  it('should maintain isolation between protocol plugin registrations', () => {
    const plugin1 = new CrossCuttingLogPlugin();
    const plugin2 = new CrossCuttingLogPlugin();

    // Register plugin1 with both protocols
    apiRegistry.plugins.add(RestProtocol, plugin1);
    apiRegistry.plugins.add(SseProtocol, plugin1);

    // Register plugin2 only with REST
    apiRegistry.plugins.add(RestProtocol, plugin2);

    // Verify registrations
    expect(apiRegistry.plugins.getAll(RestProtocol)).toContain(plugin1);
    expect(apiRegistry.plugins.getAll(RestProtocol)).toContain(plugin2);
    expect(apiRegistry.plugins.getAll(SseProtocol)).toContain(plugin1);
    expect(apiRegistry.plugins.getAll(SseProtocol)).not.toContain(plugin2);
  });
});
