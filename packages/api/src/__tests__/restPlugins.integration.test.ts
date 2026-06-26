/**
 * Task 70: Integration Test - Protocol-Specific REST Plugin Chain
 *
 * Tests for REST protocol plugin chain execution.
 * Validates API Communication feature acceptance criteria for REST plugins.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RestProtocol } from '../protocols/RestProtocol';
import { RestMockPlugin } from '@gears-frontx/frontx-template-standard';
import { apiRegistry } from '../apiRegistry';
import type { ApiPluginErrorContext, RestPluginHooks, RestRequestContext } from '../types';
import { createProtocolPluginTests } from './protocolPluginTestFactory';

// ---------------------------------------------------------------------------
// Shared structural tests (global management, instance management, ordering)
// ---------------------------------------------------------------------------

createProtocolPluginTests({
  protocolName: 'RestProtocol',
  ProtocolClass: RestProtocol,
  makePlugin(): RestPluginHooks {
    return {
      onRequest: async (ctx) => ctx,
      destroy: () => {},
    };
  },
  makePluginWithDestroy(onDestroy: () => void): RestPluginHooks {
    class DestroyableRestPlugin implements RestPluginHooks {
      onRequest = async (ctx: RestRequestContext) => ctx;
      destroy() { onDestroy(); }
    }
    return new DestroyableRestPlugin();
  },
});

// ---------------------------------------------------------------------------
// REST-specific tests
// ---------------------------------------------------------------------------

describe('RestProtocol plugins', () => {
  beforeEach(() => {
    apiRegistry.reset();
  });

  afterEach(() => {
    apiRegistry.reset();
  });

  describe('short-circuit with RestMockPlugin', () => {
    it('should short-circuit with RestMockPlugin', async () => {
      const mockPlugin = new RestMockPlugin({
        mockMap: {
          'GET /api/test': () => ({ success: true, data: 'mocked' }),
        },
        delay: 0,
      });

      // Test onRequest directly
      const context: RestRequestContext = {
        method: 'GET',
        url: '/api/test',
        headers: {},
      };

      const result = await mockPlugin.onRequest(context);

      expect('shortCircuit' in result).toBe(true);
      if ('shortCircuit' in result) {
        expect(result.shortCircuit.status).toBe(200);
        expect(result.shortCircuit.data).toEqual({ success: true, data: 'mocked' });
      }
    });

    it('should pass through non-matching requests', async () => {
      const mockPlugin = new RestMockPlugin({
        mockMap: {
          'GET /api/test': () => ({ success: true }),
        },
        delay: 0,
      });

      const context: RestRequestContext = {
        method: 'GET',
        url: '/api/other',
        headers: {},
      };

      const result = await mockPlugin.onRequest(context);

      expect('shortCircuit' in result).toBe(false);
      expect(result).toEqual(context);
    });

    it('should match URL patterns with :params', async () => {
      const mockPlugin = new RestMockPlugin({
        mockMap: {
          'GET /api/users/:id': () => ({ id: '123', name: 'Test User' }),
        },
        delay: 0,
      });

      const context: RestRequestContext = {
        method: 'GET',
        url: '/api/users/123',
        headers: {},
      };

      const result = await mockPlugin.onRequest(context);

      expect('shortCircuit' in result).toBe(true);
    });
  });

  describe('onResponse hooks', () => {
    it('should execute onResponse hooks in reverse order (LIFO)', async () => {
      const executionOrder: string[] = [];
      const restProtocol = new RestProtocol();
      restProtocol.initialize({ baseURL: '/api' });
      restProtocol.setRequestDispatcherForTest(async () => ({
        status: 200,
        headers: {},
        data: { order: [] as string[] },
      }));

      const plugin1: RestPluginHooks & { destroy: () => void } = {
        onResponse: async (ctx) => {
          executionOrder.push('plugin1');
          return {
            ...ctx,
            data: {
              order: [...((ctx.data as { order: string[] }).order), 'plugin1'],
            },
          };
        },
        destroy: () => {},
      };

      const plugin2: RestPluginHooks & { destroy: () => void } = {
        onResponse: async (ctx) => {
          executionOrder.push('plugin2');
          return {
            ...ctx,
            data: {
              order: [...((ctx.data as { order: string[] }).order), 'plugin2'],
            },
          };
        },
        destroy: () => {},
      };

      apiRegistry.plugins.add(RestProtocol, plugin1);
      apiRegistry.plugins.add(RestProtocol, plugin2);

      const result = await restProtocol.get<{ order: string[] }>('/test');

      expect(result.order).toEqual(['plugin2', 'plugin1']);
      expect(executionOrder).toEqual(['plugin2', 'plugin1']);
    });
  });

  describe('dynamic mock map updates', () => {
    it('should allow updating mock map dynamically', async () => {
      const mockPlugin = new RestMockPlugin({
        mockMap: {
          'GET /api/v1': () => ({ version: 1 }),
        },
        delay: 0,
      });

      // Update mock map
      mockPlugin.setMockMap({
        'GET /api/v2': () => ({ version: 2 }),
      });

      const context: RestRequestContext = {
        method: 'GET',
        url: '/api/v2',
        headers: {},
      };

      const result = await mockPlugin.onRequest(context);

      expect('shortCircuit' in result).toBe(true);
      if ('shortCircuit' in result) {
        expect(result.shortCircuit.data).toEqual({ version: 2 });
      }
    });
  });

  describe('retry support', () => {
    it('should call retry function with error context and retryCount', async () => {
      const restProtocol = new RestProtocol();
      restProtocol.initialize({ baseURL: '/api' });

      const captured = { context: null as ApiPluginErrorContext | null };

      const retryPlugin: RestPluginHooks = {
        onError: async (context: ApiPluginErrorContext) => {
          captured.context = context;
          return context.error;
        },
        destroy: () => {},
      };

      restProtocol.plugins.add(retryPlugin);

      // Mock axios to throw error
      const mockPlugin = new RestMockPlugin({
        mockMap: {
          'GET /api/test': () => {
            throw new Error('Test error');
          },
        },
        delay: 0,
      });

      restProtocol.plugins.add(mockPlugin);

      try {
        await restProtocol.get('/test');
      } catch (_err) {
        // Expected to throw
      }

      expect(captured.context).not.toBeNull();
      const ctx = captured.context!;
      expect(ctx.error).toBeInstanceOf(Error);
      expect(ctx.error.message).toBe('Test error');
      expect(ctx.request).toBeDefined();
      expect(ctx.request.method).toBe('GET');
      expect(ctx.retryCount).toBe(0);
      expect(typeof ctx.retry).toBe('function');
    });

    it('should retry with modified headers', async () => {
      const restProtocol = new RestProtocol();
      restProtocol.initialize({ baseURL: '/api' });

      let attemptCount = 0;
      let lastHeaders: Record<string, string> = {};

      const headerCheckPlugin: RestPluginHooks = {
        onRequest: async (ctx) => {
          lastHeaders = ctx.headers;
          attemptCount++;
          if (ctx.headers.Authorization === 'Bearer new-token') {
            return {
              shortCircuit: {
                status: 200,
                headers: {},
                data: { success: true, attemptCount },
              },
            };
          }
          throw new Error('Unauthorized');
        },
        destroy: () => {},
      };

      const authPlugin: RestPluginHooks = {
        onError: async (context) => {
          if (context.retryCount === 0 && context.error.message === 'Unauthorized') {
            // Retry with new token
            return context.retry({
              headers: { ...context.request.headers, Authorization: 'Bearer new-token' },
            });
          }
          return context.error;
        },
        destroy: () => {},
      };

      restProtocol.plugins.add(headerCheckPlugin);
      restProtocol.plugins.add(authPlugin);

      const result = await restProtocol.get('/auth/protected');

      expect(result).toEqual({ success: true, attemptCount: 2 });
      expect(attemptCount).toBe(2);
      expect(lastHeaders.Authorization).toBe('Bearer new-token');
    });

    it('should retry error propagates through chain with incremented retryCount', async () => {
      const restProtocol = new RestProtocol();
      restProtocol.initialize({ baseURL: '/api' });

      const retryCounts: number[] = [];

      const mockPlugin = new RestMockPlugin({
        mockMap: {
          'GET /api/retry-test': () => {
            throw new Error('Always fails');
          },
        },
        delay: 0,
      });

      const retryPlugin: RestPluginHooks = {
        onError: async (context) => {
          retryCounts.push(context.retryCount);
          if (context.retryCount < 2) {
            // Retry up to 2 times
            return context.retry();
          }
          return context.error;
        },
        destroy: () => {},
      };

      restProtocol.plugins.add(mockPlugin);
      restProtocol.plugins.add(retryPlugin);

      try {
        await restProtocol.get('/retry-test');
      } catch (_err) {
        // Expected to throw after retries
      }

      expect(retryCounts).toEqual([0, 1, 2]);
    });

    it('should throw error when maxRetryDepth is exceeded', async () => {
      const restProtocol = new RestProtocol({ maxRetryDepth: 3 });
      restProtocol.initialize({ baseURL: '/api' });

      const mockPlugin = new RestMockPlugin({
        mockMap: {
          'GET /api/infinite-retry': () => {
            throw new Error('Always fails');
          },
        },
        delay: 0,
      });

      const infiniteRetryPlugin: RestPluginHooks = {
        onError: async (context) => {
          // Always retry (bad plugin!)
          return context.retry();
        },
        destroy: () => {},
      };

      restProtocol.plugins.add(mockPlugin);
      restProtocol.plugins.add(infiniteRetryPlugin);

      await expect(restProtocol.get('/infinite-retry')).rejects.toThrow('Max retry depth (3) exceeded');
    });

    it('should support token refresh pattern with retry', async () => {
      const restProtocol = new RestProtocol();
      restProtocol.initialize({ baseURL: '/api' });

      let currentToken = 'old-token';
      let requestCount = 0;

      const mockPlugin = new RestMockPlugin({
        mockMap: {
          'POST /api/auth/refresh': () => {
            return { token: 'fresh-token' };
          },
        },
        delay: 0,
      });

      const authCheckPlugin: RestPluginHooks = {
        onRequest: async (ctx) => {
          if (ctx.url.includes('/user')) {
            requestCount++;
            if (ctx.headers.Authorization === 'Bearer fresh-token') {
              return {
                shortCircuit: {
                  status: 200,
                  headers: {},
                  data: { id: 1, name: 'User' },
                },
              };
            }
            throw new Error('401 Unauthorized');
          }
          return ctx;
        },
        destroy: () => {},
      };

      const tokenRefreshPlugin: RestPluginHooks = {
        onRequest: async (ctx) => {
          return {
            ...ctx,
            headers: { ...ctx.headers, Authorization: `Bearer ${currentToken}` },
          };
        },
        onError: async (context) => {
          if (context.error.message.includes('401') && context.retryCount === 0) {
            // Refresh token
            const refreshResponse = await restProtocol.post<{ token: string }>('/auth/refresh');
            currentToken = refreshResponse.token;

            // Retry with new token
            return context.retry({
              headers: { ...context.request.headers, Authorization: `Bearer ${currentToken}` },
            });
          }
          return context.error;
        },
        destroy: () => {},
      };

      restProtocol.plugins.add(mockPlugin);
      restProtocol.plugins.add(authCheckPlugin);
      restProtocol.plugins.add(tokenRefreshPlugin);

      const result = await restProtocol.get<{ id: number; name: string }>('/user');

      expect(result).toEqual({ id: 1, name: 'User' });
      expect(requestCount).toBe(2); // First request fails, second succeeds
      expect(currentToken).toBe('fresh-token');
    });
  });
});
