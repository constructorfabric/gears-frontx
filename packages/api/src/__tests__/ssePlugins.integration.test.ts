/**
 * Task 71: Integration Test - Protocol-Specific SSE Plugin Chain
 *
 * Tests for SSE protocol plugin chain execution.
 * Validates API Communication feature acceptance criteria for SSE plugins.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SseProtocol } from '../protocols/SseProtocol';
import { SseMockPlugin, MockEventSource } from '@gears-frontx/frontx-template-standard';
import type { SsePluginHooks, SseConnectContext } from '../types';
import { createProtocolPluginTests } from './protocolPluginTestFactory';

// ---------------------------------------------------------------------------
// Shared structural tests (global management, instance management, ordering)
// ---------------------------------------------------------------------------

createProtocolPluginTests({
  protocolName: 'SseProtocol',
  ProtocolClass: SseProtocol,
  makePlugin(): SsePluginHooks {
    return {
      onConnect: async (ctx) => ctx,
      destroy: () => {},
    };
  },
  makePluginWithDestroy(onDestroy: () => void): SsePluginHooks {
    class DestroyableSsePlugin implements SsePluginHooks {
      onConnect = async (ctx: SseConnectContext) => ctx;
      destroy() { onDestroy(); }
    }
    return new DestroyableSsePlugin();
  },
});

// ---------------------------------------------------------------------------
// SSE-specific tests
// ---------------------------------------------------------------------------

describe('SseProtocol plugins', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('short-circuit with SseMockPlugin', () => {
    it('should short-circuit with SseMockPlugin returning MockEventSource', async () => {
      const mockPlugin = new SseMockPlugin({
        mockStreams: {
          '/api/stream': [
            { data: '{"message": "hello"}' },
            { event: 'done', data: '' },
          ],
        },
        delay: 0,
      });

      const context: SseConnectContext = {
        url: '/api/stream',
        headers: {},
      };

      const result = await mockPlugin.onConnect(context);

      expect('shortCircuit' in result).toBe(true);
      if ('shortCircuit' in result) {
        expect(result.shortCircuit).toBeDefined();
        expect(typeof result.shortCircuit.close).toBe('function');
      }
    });

    it('should pass through non-matching connections', async () => {
      const mockPlugin = new SseMockPlugin({
        mockStreams: {
          '/api/stream': [{ data: 'test' }],
        },
        delay: 0,
      });

      const context: SseConnectContext = {
        url: '/api/other',
        headers: {},
      };

      const result = await mockPlugin.onConnect(context);

      expect('shortCircuit' in result).toBe(false);
      expect(result).toEqual(context);
    });
  });

  describe('MockEventSource', () => {
    it('should emit events from MockEventSource', async () => {
      const events = [
        { data: '{"chunk": 1}' },
        { data: '{"chunk": 2}' },
        { event: 'done', data: '' },
      ];

      const mockSource = new MockEventSource(events, 10);
      const receivedMessages: string[] = [];

      mockSource.onmessage = (event) => {
        receivedMessages.push(event.data);
      };

      await Promise.resolve();
      await vi.runAllTimersAsync();

      expect(receivedMessages.length).toBe(2);
      expect(receivedMessages[0]).toBe('{"chunk": 1}');
      expect(receivedMessages[1]).toBe('{"chunk": 2}');
    });

    it('should transition readyState correctly', async () => {
      const events = [{ data: 'test' }, { event: 'done', data: '' }];
      const mockSource = new MockEventSource(events, 10);

      // Initially CONNECTING
      expect(mockSource.readyState).toBe(0);

      await Promise.resolve();
      expect(mockSource.readyState).toBe(1);

      await vi.runAllTimersAsync();

      // After completion, should be CLOSED
      expect(mockSource.readyState).toBe(2);
    });

    it('should call onopen handler', async () => {
      const events = [{ data: 'test' }];
      const mockSource = new MockEventSource(events, 10);

      let openCalled = false;
      mockSource.onopen = () => { openCalled = true; };

      await Promise.resolve();

      expect(openCalled).toBe(true);
    });

    it('should support addEventListener for done event', async () => {
      const events = [
        { data: 'test' },
        { event: 'done', data: '' },
      ];
      const mockSource = new MockEventSource(events, 10);

      let doneCalled = false;
      mockSource.addEventListener('done', () => {
        doneCalled = true;
      });

      await Promise.resolve();
      await vi.runAllTimersAsync();

      expect(doneCalled).toBe(true);
    });

    it('should stop emitting events when closed', async () => {
      const events = [
        { data: '{"chunk": 1}' },
        { data: '{"chunk": 2}' },
        { data: '{"chunk": 3}' },
      ];

      const mockSource = new MockEventSource(events, 50);
      const receivedMessages: string[] = [];

      mockSource.onmessage = (event) => {
        receivedMessages.push(event.data);
      };

      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(50);
      mockSource.close();

      await vi.runAllTimersAsync();

      expect(receivedMessages).toEqual(['{"chunk": 1}']);
    });
  });

  describe('dynamic mock streams updates', () => {
    it('should allow updating mock streams dynamically', async () => {
      const mockPlugin = new SseMockPlugin({
        mockStreams: {
          '/api/v1': [{ data: 'v1' }],
        },
        delay: 0,
      });

      // Update mock streams
      mockPlugin.setMockStreams({
        '/api/v2': [{ data: 'v2' }],
      });

      const context: SseConnectContext = {
        url: '/api/v2',
        headers: {},
      };

      const result = await mockPlugin.onConnect(context);

      expect('shortCircuit' in result).toBe(true);
    });
  });
});
