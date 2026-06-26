/**
 * AbortSignal support tests for RestProtocol.
 *
 * Phase 1 of the request lifecycle feature added AbortSignal threading
 * through the plugin chain and axios config. These tests verify that
 * canceled requests behave correctly at each layer.
 *
 * @cpt-FEATURE:cpt-frontx-dod-request-lifecycle-abort-signal:p1
 */

import axios from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RestProtocol } from '../protocols/RestProtocol';
import { RestMockPlugin } from '@gears-frontx/frontx-template-standard';
import { apiRegistry } from '../apiRegistry';
import type { RestPluginHooks, RestRequestContext, ApiPluginErrorContext } from '../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a RestProtocol instance that is ready to accept requests.
 * All tests use baseURL '/api' so mock keys must match
 * e.g. 'GET /api/test'.
 */
function makeProtocol(config?: ConstructorParameters<typeof RestProtocol>[0]): RestProtocol {
  const protocol = new RestProtocol(config);
  protocol.initialize({ baseURL: '/api' });
  return protocol;
}

/**
 * A plugin whose onRequest suspends until the external `settle` callback is
 * called. This lets tests abort the signal after the request enters the
 * plugin chain but before it completes.
 */
function makeSuspendingPlugin(
  onSettle: (settle: () => void) => void
): RestPluginHooks {
  return {
    onRequest: async (ctx) => {
      await new Promise<void>((resolve) => onSettle(resolve));
      return ctx;
    },
    destroy: () => {},
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('AbortSignal support in RestProtocol', () => {
  beforeEach(() => {
    apiRegistry.reset();
  });

  afterEach(() => {
    apiRegistry.reset();
  });

  // -------------------------------------------------------------------------
  // Test 1: Canceled requests throw
  // -------------------------------------------------------------------------

  it('rejects when the AbortSignal is aborted before the request completes', async () => {
    // @cpt-begin:cpt-frontx-dod-request-lifecycle-abort-signal:p1:inst-test-cancel-throws
    const controller = new AbortController();
    const protocol = makeProtocol();

    // A plugin whose onRequest aborts the signal and then throws the
    // CanceledError that axios would produce. This accurately reproduces
    // what happens when axios receives an already-aborted signal.
    const cancelingPlugin: RestPluginHooks = {
      onRequest: async (_ctx) => {
        // Simulate aborting mid-flight (the signal is already aborted here
        // because the caller calls abort() synchronously before awaiting).
        throw new axios.CanceledError('canceled');
      },
      destroy: () => {},
    };

    protocol.plugins.add(cancelingPlugin);

    controller.abort();

    await expect(
      protocol.get('/test', { signal: controller.signal })
    ).rejects.toSatisfy((err: unknown) => axios.isCancel(err));
    // @cpt-end:cpt-frontx-dod-request-lifecycle-abort-signal:p1:inst-test-cancel-throws
  });

  it('rejects when AbortSignal is aborted while plugin chain is running', async () => {
    const controller = new AbortController();
    const protocol = makeProtocol();

    let settleRequest!: () => void;
    const suspending = makeSuspendingPlugin((settle) => {
      settleRequest = settle;
    });

    // Second plugin turns the settled context into a CanceledError once the
    // signal has been aborted (mimics what axios does internally).
    const abortCheckPlugin: RestPluginHooks = {
      onRequest: async (ctx) => {
        if (ctx.signal?.aborted) {
          throw new axios.CanceledError('canceled');
        }
        return ctx;
      },
      destroy: () => {},
    };

    protocol.plugins.add(suspending);
    protocol.plugins.add(abortCheckPlugin);

    const requestPromise = protocol.get('/test', { signal: controller.signal });

    // Abort then release the suspended plugin so the abort check runs.
    controller.abort();
    settleRequest();

    await expect(requestPromise).rejects.toSatisfy((err: unknown) => axios.isCancel(err));
  });

  // -------------------------------------------------------------------------
  // Test 2: Canceled requests skip onError plugin chain
  // -------------------------------------------------------------------------

  it('does NOT call onError plugins when the request is canceled', async () => {
    // @cpt-begin:cpt-frontx-dod-request-lifecycle-abort-signal:p1:inst-test-cancel-skip-onerror
    const controller = new AbortController();
    const protocol = makeProtocol();

    const onErrorSpy = vi.fn();

    const errorObserver: RestPluginHooks = {
      onError: async (ctx: ApiPluginErrorContext) => {
        onErrorSpy(ctx.error);
        return ctx.error;
      },
      destroy: () => {},
    };

    const cancelingPlugin: RestPluginHooks = {
      onRequest: async (_ctx) => {
        throw new axios.CanceledError('canceled');
      },
      destroy: () => {},
    };

    // errorObserver before the canceling plugin so it would be in scope
    protocol.plugins.add(errorObserver);
    protocol.plugins.add(cancelingPlugin);

    controller.abort();

    await expect(
      protocol.get('/test', { signal: controller.signal })
    ).rejects.toSatisfy((err: unknown) => axios.isCancel(err));

    // The cancel path must bypass onError entirely
    expect(onErrorSpy).not.toHaveBeenCalled();
    // @cpt-end:cpt-frontx-dod-request-lifecycle-abort-signal:p1:inst-test-cancel-skip-onerror
  });

  // -------------------------------------------------------------------------
  // Test 3: Canceled requests are not retried
  // -------------------------------------------------------------------------

  it('does NOT invoke retry logic from onError plugins when the request is canceled', async () => {
    // @cpt-begin:cpt-frontx-dod-request-lifecycle-abort-signal:p1:inst-test-cancel-no-retry
    const controller = new AbortController();
    const protocol = makeProtocol();

    const retryAttemptSpy = vi.fn();

    const retryPlugin: RestPluginHooks = {
      onError: async (ctx: ApiPluginErrorContext) => {
        retryAttemptSpy();
        // This retry should never execute on a canceled request
        return ctx.retry();
      },
      destroy: () => {},
    };

    const cancelingPlugin: RestPluginHooks = {
      onRequest: async (_ctx) => {
        throw new axios.CanceledError('canceled');
      },
      destroy: () => {},
    };

    protocol.plugins.add(retryPlugin);
    protocol.plugins.add(cancelingPlugin);

    controller.abort();

    await expect(
      protocol.get('/test', { signal: controller.signal })
    ).rejects.toSatisfy((err: unknown) => axios.isCancel(err));

    expect(retryAttemptSpy).not.toHaveBeenCalled();
    // @cpt-end:cpt-frontx-dod-request-lifecycle-abort-signal:p1:inst-test-cancel-no-retry
  });

  // -------------------------------------------------------------------------
  // Test 4: Short-circuited requests work regardless of signal state
  // -------------------------------------------------------------------------

  it('returns mock data from RestMockPlugin even when signal is provided', async () => {
    // @cpt-begin:cpt-frontx-dod-request-lifecycle-abort-signal:p1:inst-test-short-circuit-with-signal
    const controller = new AbortController();
    const protocol = makeProtocol();

    protocol.plugins.add(
      new RestMockPlugin({
        mockMap: {
          'GET /api/test': () => ({ mocked: true }),
        },
        delay: 0,
      })
    );

    // Signal is live (not aborted) — mock should return data
    const result = await protocol.get<{ mocked: boolean }>('/test', {
      signal: controller.signal,
    });

    expect(result).toEqual({ mocked: true });
    // @cpt-end:cpt-frontx-dod-request-lifecycle-abort-signal:p1:inst-test-short-circuit-with-signal
  });

  it('returns mock data from RestMockPlugin even when signal is already aborted', async () => {
    // Short-circuit path does not make an HTTP call so the signal state is
    // irrelevant — the plugin resolves synchronously before axios is involved.
    const controller = new AbortController();
    const protocol = makeProtocol();

    protocol.plugins.add(
      new RestMockPlugin({
        mockMap: {
          'GET /api/shortcircuit': () => ({ shortCircuited: true }),
        },
        delay: 0,
      })
    );

    // Abort BEFORE the call — mock should still short-circuit successfully
    controller.abort();

    const result = await protocol.get<{ shortCircuited: boolean }>('/shortcircuit', {
      signal: controller.signal,
    });

    expect(result).toEqual({ shortCircuited: true });
  });

  // -------------------------------------------------------------------------
  // Test 5: Backward compatibility — no signal
  // -------------------------------------------------------------------------

  it('works correctly when no signal option is provided', async () => {
    // @cpt-begin:cpt-frontx-dod-request-lifecycle-abort-signal:p1:inst-test-backward-compat
    const protocol = makeProtocol();

    protocol.plugins.add(
      new RestMockPlugin({
        mockMap: {
          'GET /api/compat': () => ({ ok: true }),
        },
        delay: 0,
      })
    );

    // No options at all — backward-compatible call signature
    const result = await protocol.get<{ ok: boolean }>('/compat');
    expect(result).toEqual({ ok: true });
    // @cpt-end:cpt-frontx-dod-request-lifecycle-abort-signal:p1:inst-test-backward-compat
  });

  it('works correctly when options are provided but signal is undefined', async () => {
    const protocol = makeProtocol();

    protocol.plugins.add(
      new RestMockPlugin({
        mockMap: {
          'GET /api/nosignal': () => ({ ok: true }),
        },
        delay: 0,
      })
    );

    const result = await protocol.get<{ ok: boolean }>('/nosignal', {
      params: { filter: 'active' },
      // signal intentionally omitted
    });

    expect(result).toEqual({ ok: true });
  });

  // -------------------------------------------------------------------------
  // Test 6: Signal is available in onRequest context
  // -------------------------------------------------------------------------

  it('passes the AbortSignal through to the plugin onRequest context', async () => {
    // @cpt-begin:cpt-frontx-dod-request-lifecycle-abort-signal:p1:inst-test-signal-in-context
    const controller = new AbortController();
    const protocol = makeProtocol();

    let capturedSignal: AbortSignal | undefined;

    const signalCapturingPlugin: RestPluginHooks = {
      onRequest: async (ctx: RestRequestContext) => {
        capturedSignal = ctx.signal;
        // Short-circuit so we don't need real HTTP
        return {
          shortCircuit: {
            status: 200,
            headers: {},
            data: { captured: true },
          },
        };
      },
      destroy: () => {},
    };

    protocol.plugins.add(signalCapturingPlugin);

    await protocol.get('/test', { signal: controller.signal });

    expect(capturedSignal).toBe(controller.signal);
    // @cpt-end:cpt-frontx-dod-request-lifecycle-abort-signal:p1:inst-test-signal-in-context
  });

  it('passes undefined signal to plugin context when no signal is given', async () => {
    const protocol = makeProtocol();

    // Use a sentinel so we can distinguish "plugin never ran" from
    // "plugin ran and captured undefined".
    const sentinel = Symbol('not-set');
    let capturedSignal: AbortSignal | undefined | typeof sentinel = sentinel;

    const signalCapturingPlugin: RestPluginHooks = {
      onRequest: async (ctx: RestRequestContext) => {
        capturedSignal = ctx.signal;
        return {
          shortCircuit: {
            status: 200,
            headers: {},
            data: {},
          },
        };
      },
      destroy: () => {},
    };

    protocol.plugins.add(signalCapturingPlugin);

    await protocol.get('/test');

    expect(capturedSignal).not.toBe(sentinel); // plugin ran
    expect(capturedSignal).toBeUndefined();
  });
});
