/**
 * Integration tests for useApiStream — StreamDescriptor lifecycle hook.
 *
 * Covers:
 *   - useApiStream: StreamDescriptor lifecycle, cancellation, connect/reject paths
 *   - useApiStream: stable stream identity from descriptor.key (no reconnect on new object, same key)
 *
 * @packageDocumentation
 */

// @cpt-FEATURE:implement-endpoint-descriptors:p3
// @cpt-FEATURE:cpt-frontx-dod-request-lifecycle-use-api-stream:p2

import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import {
  eventBus,
  resetSharedFetchCache,
  resetSharedQueryClient,
  type StreamDescriptor,
} from '@gears-frontx/framework';
import { useApiStream } from '@gears-frontx/react';
import {
  ownedApps,
  buildTestQueryClient,
  makeQueryWrapper,
  makeStreamDescriptor,
} from './queryHooks.helpers';

afterEach(() => {
  ownedApps.forEach((app) => {
    app.destroy();
  });
  ownedApps.length = 0;
  eventBus.clearAll();
  resetSharedFetchCache();
  resetSharedQueryClient();
});

// ============================================================================
// useApiStream
// ============================================================================

describe('useApiStream', () => {
  it('sets connected, latest data, and leaves events empty in latest mode', async () => {
    const disconnect = vi.fn();
    let emit: (e: string) => void = () => {};
    const descriptor = makeStreamDescriptor<string>({
      key: ['@stream', 'latest'],
      disconnect,
      connect: (onEvent) => {
        emit = onEvent;
        return Promise.resolve('cid-1');
      },
    });

    const { result } = renderHook(() => useApiStream(descriptor));

    await waitFor(() => expect(result.current.status).toBe('connected'));
    act(() => {
      emit('hello');
    });
    await waitFor(() => expect(result.current.data).toBe('hello'));
    expect(result.current.events).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('accumulate mode appends each event and keeps data as the last payload', async () => {
    const disconnect = vi.fn();
    let emit: (e: number) => void = () => {};
    const descriptor = makeStreamDescriptor<number>({
      key: ['@stream', 'accumulate'],
      disconnect,
      connect: (onEvent) => {
        emit = onEvent;
        return Promise.resolve('cid-acc');
      },
    });

    const { result } = renderHook(() =>
      useApiStream(descriptor, { mode: 'accumulate' }),
    );

    await waitFor(() => expect(result.current.status).toBe('connected'));
    act(() => {
      emit(1);
      emit(2);
    });
    await waitFor(() => expect(result.current.events).toEqual([1, 2]));
    expect(result.current.data).toBe(2);
  });

  it('sets error status when connect rejects with Error', async () => {
    const boom = new Error('sse failed');
    const descriptor = makeStreamDescriptor<string>({
      key: ['@stream', 'reject-error'],
      connect: () => Promise.reject(boom),
    });

    const { result } = renderHook(() => useApiStream(descriptor));

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe(boom);
  });

  it('wraps non-Error connect rejection as Error', async () => {
    const nonErrorReason = Object('offline'); // not instanceof Error; avoids rejecting a string literal (eslint)
    const descriptor = makeStreamDescriptor<string>({
      key: ['@stream', 'reject-string'],
      connect: () => Promise.reject(nonErrorReason),
    });

    const { result } = renderHook(() => useApiStream(descriptor));

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toEqual(new Error('offline'));
  });

  it('with enabled false stays idle and never calls connect', () => {
    const connect = vi.fn(() => Promise.resolve('x'));
    const descriptor = makeStreamDescriptor<string>({
      key: ['@stream', 'disabled'],
      connect,
    });

    const { result } = renderHook(() =>
      useApiStream(descriptor, { enabled: false }),
    );

    expect(result.current.status).toBe('idle');
    expect(connect).not.toHaveBeenCalled();
  });

  it('clears data, events, and error when descriptor key changes while disabled', async () => {
    const connect = vi.fn(() => Promise.resolve('cid'));
    let emit: (e: string) => void = () => {};
    const descA = makeStreamDescriptor<string>({
      key: ['@stream', 'disabled-swap-a'],
      connect: (onEvent) => {
        emit = onEvent;
        return Promise.resolve('cid-a');
      },
    });
    const descB = makeStreamDescriptor<string>({
      key: ['@stream', 'disabled-swap-b'],
      connect,
    });

    const { result, rerender } = renderHook(
      (props: { d: StreamDescriptor<string>; enabled: boolean }) =>
        useApiStream(props.d, { enabled: props.enabled, mode: 'accumulate' }),
      { initialProps: { d: descA, enabled: true } },
    );

    await waitFor(() => expect(result.current.status).toBe('connected'));
    act(() => {
      emit('stale');
    });
    expect(result.current.data).toBe('stale');
    expect(result.current.events).toEqual(['stale']);

    rerender({ d: descA, enabled: false });
    expect(result.current.status).toBe('idle');

    rerender({ d: descB, enabled: false });
    expect(connect).not.toHaveBeenCalled();
    expect(result.current.data).toBeUndefined();
    expect(result.current.events).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('unmount disconnects using the resolved connection id', async () => {
    const disconnect = vi.fn();
    const descriptor = makeStreamDescriptor<string>({
      key: ['@stream', 'unmount-disconnect'],
      disconnect,
      connect: () => Promise.resolve('cid-unmount'),
    });

    const { result, unmount } = renderHook(() => useApiStream(descriptor));

    await waitFor(() => expect(result.current.status).toBe('connected'));
    expect(disconnect).not.toHaveBeenCalled();
    unmount();
    await waitFor(() => expect(disconnect).toHaveBeenCalledWith('cid-unmount'));
  });

  it('does not call disconnect on unmount when connect already rejected', async () => {
    const disconnect = vi.fn();
    const descriptor = makeStreamDescriptor<string>({
      key: ['@stream', 'reject-no-disconnect'],
      disconnect,
      connect: () => Promise.reject(new Error('nope')),
    });

    const { unmount } = renderHook(() => useApiStream(descriptor));
    await waitFor(() => expect(disconnect).not.toHaveBeenCalled());
    unmount();
    await act(async () => {
      await Promise.resolve();
    });
    expect(disconnect).not.toHaveBeenCalled();
  });

  it('disconnect() invokes descriptor.disconnect and sets status disconnected', async () => {
    const disconnect = vi.fn();
    const descriptor = makeStreamDescriptor<string>({
      key: ['@stream', 'manual-off'],
      disconnect,
      connect: () => Promise.resolve('manual-id'),
    });

    const { result } = renderHook(() => useApiStream(descriptor));

    await waitFor(() => expect(result.current.status).toBe('connected'));
    act(() => {
      result.current.disconnect();
    });
    expect(disconnect).toHaveBeenCalledWith('manual-id');
    expect(result.current.status).toBe('disconnected');
  });

  it('disconnect() while connecting tears down the connection id when connect resolves', async () => {
    const disconnect = vi.fn();
    let resolveConnect!: (id: string) => void;
    const pending = new Promise<string>((r) => {
      resolveConnect = r;
    });
    const descriptor = makeStreamDescriptor<string>({
      key: ['@stream', 'manual-off-while-connecting'],
      disconnect,
      connect: () => pending,
    });

    const { result } = renderHook(() => useApiStream(descriptor));

    await waitFor(() => expect(result.current.status).toBe('connecting'));
    act(() => {
      result.current.disconnect();
    });
    expect(result.current.status).toBe('disconnected');
    expect(disconnect).not.toHaveBeenCalled();

    await act(async () => {
      resolveConnect('pending-id');
      await pending;
    });

    expect(disconnect).toHaveBeenCalledWith('pending-id');
    expect(result.current.status).toBe('disconnected');
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.status).toBe('disconnected');
  });

  it('onComplete sets status to disconnected', async () => {
    const disconnect = vi.fn();
    let complete: () => void = () => {};
    const descriptor = makeStreamDescriptor<string>({
      key: ['@stream', 'on-complete'],
      disconnect,
      connect: (_onEvent, onComplete) => {
        complete = onComplete ?? (() => {});
        return Promise.resolve('id-done');
      },
    });

    const { result } = renderHook(() => useApiStream(descriptor));

    await waitFor(() => expect(result.current.status).toBe('connected'));
    act(() => {
      complete();
    });
    expect(result.current.status).toBe('disconnected');
  });

  it('ignores onEvent after unmount (cancelled guard)', async () => {
    const disconnect = vi.fn();
    let emit: (e: string) => void = () => {};
    const descriptor = makeStreamDescriptor<string>({
      key: ['@stream', 'cancel-on-event'],
      disconnect,
      connect: (onEvent) => {
        emit = onEvent;
        return Promise.resolve('eid');
      },
    });

    const { result, unmount } = renderHook(() => useApiStream(descriptor));

    await waitFor(() => expect(result.current.status).toBe('connected'));
    unmount();
    await waitFor(() => expect(disconnect).toHaveBeenCalledWith('eid'));
    act(() => {
      emit('too-late');
    });
  });

  it('after unmount, deferred connect resolve runs cleanup disconnect', async () => {
    const disconnect = vi.fn();
    let resolveConnect!: (id: string) => void;
    const pending = new Promise<string>((r) => {
      resolveConnect = r;
    });
    const descriptor = makeStreamDescriptor<number>({
      key: ['@stream', 'late-resolve'],
      disconnect,
      connect: () => pending,
    });

    const { unmount } = renderHook(() => useApiStream(descriptor));
    unmount();

    await act(async () => {
      resolveConnect('late');
      await pending;
    });

    expect(disconnect).toHaveBeenCalledWith('late');
  });

  it('after unmount, connect rejection is handled by cleanup without disconnect', async () => {
    const disconnect = vi.fn();
    let rejectConnect!: (e: Error) => void;
    const pending = new Promise<string>((_, rej) => {
      rejectConnect = rej;
    });
    const descriptor = makeStreamDescriptor<string>({
      key: ['@stream', 'late-reject'],
      disconnect,
      connect: () => pending,
    });

    const { unmount } = renderHook(() => useApiStream(descriptor));
    unmount();

    await expect(
      act(async () => {
        rejectConnect(new Error('late'));
        await expect(pending).rejects.toThrow('late');
      })
    ).resolves.toBeUndefined();

    expect(disconnect).not.toHaveBeenCalled();
  });

  it('changing descriptor key disconnects the previous connection id', async () => {
    const disconnectA = vi.fn();
    const disconnectB = vi.fn();
    const descA = makeStreamDescriptor<string>({
      key: ['@stream', 'key-a'],
      disconnect: disconnectA,
      connect: () => Promise.resolve('id-a'),
    });
    const descB = makeStreamDescriptor<string>({
      key: ['@stream', 'key-b'],
      disconnect: disconnectB,
      connect: () => Promise.resolve('id-b'),
    });

    const { result, rerender } = renderHook(
      (d: StreamDescriptor<string>) => useApiStream(d),
      { initialProps: descA },
    );

    await waitFor(() => expect(result.current.status).toBe('connected'));
    rerender(descB);
    await waitFor(() => expect(disconnectA).toHaveBeenCalledWith('id-a'));
    await waitFor(() => expect(result.current.status).toBe('connected'));
    expect(disconnectB).not.toHaveBeenCalled();
  });

  it('resets data and events when descriptor key changes', async () => {
    let emitA: (e: string) => void = () => {};
    const descA = makeStreamDescriptor<string>({
      key: ['@stream', 'reset-a'],
      connect: (onEvent) => {
        emitA = onEvent;
        return Promise.resolve('id-a');
      },
    });

    let emitB: (e: string) => void = () => {};
    const descB = makeStreamDescriptor<string>({
      key: ['@stream', 'reset-b'],
      connect: (onEvent) => {
        emitB = onEvent;
        return Promise.resolve('id-b');
      },
    });

    const { result, rerender } = renderHook(
      (d: StreamDescriptor<string>) => useApiStream(d, { mode: 'accumulate' }),
      { initialProps: descA },
    );

    await waitFor(() => expect(result.current.status).toBe('connected'));
    act(() => {
      emitA('a1');
      emitA('a2');
    });
    expect(result.current.data).toBe('a2');
    expect(result.current.events).toEqual(['a1', 'a2']);

    rerender(descB);

    await waitFor(() => expect(result.current.status).toBe('connected'));
    expect(result.current.data).toBeUndefined();
    expect(result.current.events).toEqual([]);

    act(() => emitB('b1'));
    expect(result.current.data).toBe('b1');
    expect(result.current.events).toEqual(['b1']);
  });

  // @cpt-begin:cpt-frontx-dod-request-lifecycle-use-api-stream:p2:inst-test-same-key-no-reconnect
  it('does not call connect again when a new descriptor object shares the same key', async () => {
    const client = buildTestQueryClient();
    const wrapper = makeQueryWrapper(client);

    const streamKey: readonly unknown[] = ['/api/test', 'SSE', '/stream'];
    const connectFirst = vi.fn(() => Promise.resolve('conn-first'));
    const disconnectFirst = vi.fn();

    const descriptorFirst: StreamDescriptor<string> = {
      key: streamKey,
      connect: connectFirst,
      disconnect: disconnectFirst,
    };

    const { rerender } = renderHook(
      (d: StreamDescriptor<string>) => useApiStream(d),
      { wrapper, initialProps: descriptorFirst },
    );

    await waitFor(() => expect(connectFirst).toHaveBeenCalledTimes(1));

    const connectSecond = vi.fn(() => Promise.resolve('conn-second'));
    const descriptorSecond: StreamDescriptor<string> = {
      key: streamKey,
      connect: connectSecond,
      disconnect: vi.fn(),
    };

    rerender(descriptorSecond);

    await waitFor(() => expect(connectSecond).not.toHaveBeenCalled());
    expect(connectFirst).toHaveBeenCalledTimes(1);
  });
  // @cpt-end:cpt-frontx-dod-request-lifecycle-use-api-stream:p2:inst-test-same-key-no-reconnect
});
