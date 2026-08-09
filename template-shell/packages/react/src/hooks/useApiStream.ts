/**
 * useApiStream - Declarative SSE streaming hook
 *
 * Accepts a StreamDescriptor from @gears-frontx/api and returns the latest
 * event, accumulated events, connection status, and a manual disconnect
 * function.
 *
 * @example
 * ```tsx
 * const { data, events, status, error } = useApiStream(
 *   service.messageStream,
 *   { mode: 'latest' }   // default — data holds last event
 * );
 *
 * // Accumulate all events
 * const { events, status } = useApiStream(service.messageStream, { mode: 'accumulate' });
 * ```
 */

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import type { StreamDescriptor, StreamStatus } from '@gears-frontx/framework';
import { useLatest } from './useLatest';

/** Configuration options for useApiStream. */
export interface ApiStreamOptions {
  /**
   * `'latest'` (default) — `data` holds the most recent event.
   * `'accumulate'` — `events` holds all received events in order.
   */
  mode?: 'latest' | 'accumulate';
  /** When false the connection is deferred (no connect on mount). Default true. */
  enabled?: boolean;
}

/** Return type of useApiStream. */
export interface ApiStreamResult<TEvent> {
  /** Latest event payload, set in both modes — `undefined` until the first event and after each connect attempt resets it. */
  data: TEvent | undefined;
  /** All received events when `mode: 'accumulate'`; empty array in `'latest'` mode. */
  events: TEvent[];
  /** Connection lifecycle status. */
  status: StreamStatus;
  /** Last connect error — set when a connect attempt rejects, cleared when the next attempt starts. */
  error: Error | null;
  /** Manually close the connection. */
  disconnect: () => void;
}

/**
 * Manages the status lifecycle for a single SSE stream connection.
 *
 * **Status values**
 * - `'idle'` — no connection is being attempted. This is the initial status
 *   before the first connect effect runs, and it is ordinarily the status
 *   while `enabled` is `false`. Consumers must not assume `'idle'` means "never
 *   connected" — a stream that is disabled after having connected returns to
 *   `'idle'` too, and `data`/`events` from the earlier connection are not
 *   cleared by that transition alone (they are cleared by mode/key changes,
 *   see below).
 * - `'connecting'` — `descriptor.connect()` has been called and its promise
 *   has not yet settled.
 * - `'connected'` — set both when `connect()` resolves (unless a disconnect
 *   was requested while it was pending) and, independently, whenever the
 *   `onEvent` callback delivers a new event. Because every event re-asserts
 *   `'connected'`, this status also serves as "still receiving events."
 * - `'disconnected'` — reached via any of: the descriptor's `onComplete`
 *   callback firing (the stream ended normally), `connect()` rejecting while
 *   a disconnect was requested concurrently, or the manual `disconnect()`
 *   function being called. `disconnect()` has no `enabled` guard: called
 *   while the stream is disabled it still sets `'disconnected'`, which
 *   persists until the next connect-effect run.
 * - `'error'` — `connect()` rejected and no disconnect was requested while it
 *   was pending. `error` holds the rejection, coerced to an `Error` if it
 *   wasn't one already.
 *
 * **Transitions**
 * - Mount / `enabled` becomes `true` / `descriptor.key` or `mode` changes:
 *   `data`, `events`, and `error` are reset, then status goes to
 *   `'connecting'` and `connect()` is called.
 * - `enabled` becomes `false` (or starts `false`): status is forced to
 *   `'idle'` and `connect()` is never called; no other field is reset by
 *   this transition alone.
 * - Unmount, `descriptor.key` change, `mode` change, or `enabled` flipping to
 *   `false` while connected or connecting: the previous connection is torn
 *   down via `descriptor.disconnect()` once its `connect()` promise settles
 *   (or immediately skipped if it rejected). All four share the same cleanup
 *   path: the effect's cleanup runs on every dependency change and on unmount.
 * - Calling `disconnect()`: if a connection id is already resolved, it is
 *   disconnected immediately and status becomes `'disconnected'`. If
 *   `connect()` is still pending, the request is recorded and honored when
 *   the promise settles — the newly resolved connection is torn down instead
 *   of being adopted, and status is `'disconnected'`. One caveat:
 *   `disconnect()` does not cancel the event callback, so a buffered or
 *   in-flight event landing after the call re-asserts `'connected'` — and in
 *   the pending-connect case the settle handler tears the connection down
 *   without touching status, so that stray `'connected'` persists.
 * - Stream completion while `connect()` is still pending: the current
 *   implementation lets `onComplete` set `'disconnected'`, then the settle
 *   handler adopts the connection id and re-asserts `'connected'` anyway.
 *   This is known current behavior, not a durable guarantee: a pending
 *   upstream derived-status rewrite is expected to remove this transition.
 *
 * `enabled` (default `true`) is the only way to defer connecting past mount;
 * flipping it back to `true` re-runs the same connect sequence as a fresh
 * mount would.
 */
export function useApiStream<TEvent>(
  descriptor: StreamDescriptor<TEvent>,
  options?: ApiStreamOptions,
): ApiStreamResult<TEvent> {
  const mode = options?.mode ?? 'latest';
  const enabled = options?.enabled ?? true;

  const [data, setData] = useState<TEvent | undefined>(undefined);
  const [events, setEvents] = useState<TEvent[]>([]);
  // A hook that mounts enabled opens its connection in the same commit, so the
  // first render already reports 'connecting'. 'idle' describes a stream nothing
  // is trying to open, which is only the `enabled: false` case.
  const [status, setStatus] = useState<StreamStatus>(() => (enabled ? 'connecting' : 'idle'));
  const [error, setError] = useState<Error | null>(null);

  // Tracks the in-flight connect() promise so cleanup can await it.
  const connectPromiseRef = useRef<Promise<string> | null>(null);
  // Tracks the resolved connectionId for the manual disconnect() callback.
  const connectionIdRef = useRef<string | null>(null);
  /** When true, connect's promise resolution must tear down the new id instead of adopting it. */
  const disconnectRequestedRef = useRef(false);
  // Latest descriptor for connect/disconnect without tying effect or callbacks to object identity.
  const descriptorRef = useLatest(descriptor);

  // Stable identity derived from descriptor key — used as effect dependency.
  // JSON.stringify avoids join('/') collisions when a segment contains '/'.
  const descriptorKey = useMemo(() => JSON.stringify(descriptor.key), [descriptor.key]);

  // Reset boundaries are derived during render rather than applied from an
  // effect: an effect reset lets a consumer observe one render of the previous
  // stream's payload under the new descriptor before it is cleared.
  //
  // The payload (data/events/error) belongs to a (descriptor, mode) pair; the
  // status belongs to a (descriptor, mode, enabled) connection attempt. Turning
  // `enabled` off therefore changes only the status: a consumer that pauses a
  // stream keeps showing the last payload it received.
  const [storedDescriptorKey, setStoredDescriptorKey] = useState(descriptorKey);
  const [storedMode, setStoredMode] = useState(mode);
  const [storedEnabled, setStoredEnabled] = useState(enabled);

  const streamChanged = storedDescriptorKey !== descriptorKey || storedMode !== mode;

  if (streamChanged || storedEnabled !== enabled) {
    setStoredDescriptorKey(descriptorKey);
    setStoredMode(mode);
    setStoredEnabled(enabled);

    if (streamChanged || enabled) {
      setData(undefined);
      setEvents([]);
      setError(null);
    }

    setStatus(enabled ? 'connecting' : 'idle');
  }

  const disconnect = useCallback(() => {
    disconnectRequestedRef.current = true;
    if (connectionIdRef.current) {
      descriptorRef.current.disconnect(connectionIdRef.current);
      connectionIdRef.current = null;
      disconnectRequestedRef.current = false;
    }
    setStatus('disconnected');
    // descriptorRef's identity never changes (useLatest returns a stable ref
    // object) — listing it here satisfies exhaustive-deps without altering
    // when this callback is recreated.
  }, [descriptorRef]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let cancelled = false;

    disconnectRequestedRef.current = false;

    const d = descriptorRef.current;

    const connectPromise = d.connect(
      (event) => {
        if (cancelled) return;
        setData(event);
        setStatus('connected');
        if (mode === 'accumulate') {
          setEvents((prev) => [...prev, event]);
        }
      },
      () => {
        if (cancelled) return;
        setStatus('disconnected');
        connectionIdRef.current = null;
      },
    );

    connectPromiseRef.current = connectPromise;

    connectPromise
      .then((id) => {
        if (cancelled) return;
        if (disconnectRequestedRef.current) {
          d.disconnect(id);
          disconnectRequestedRef.current = false;
          return;
        }
        connectionIdRef.current = id;
        setStatus('connected');
      })
      .catch((err) => {
        if (cancelled) return;
        if (disconnectRequestedRef.current) {
          disconnectRequestedRef.current = false;
          setStatus('disconnected');
          return;
        }
        setError(err instanceof Error ? err : new Error(String(err)));
        setStatus('error');
      });

    return () => {
      cancelled = true;
      connectPromise.then(
        (id) => d.disconnect(id),
        () => { /* connect failed — nothing to disconnect */ },
      );
      connectPromiseRef.current = null;
      connectionIdRef.current = null;
    };
    // descriptorRef's identity never changes (useLatest returns a stable ref
    // object) — listing it here satisfies exhaustive-deps without causing
    // this effect to re-run on every render.
  }, [descriptorKey, enabled, mode, descriptorRef]);

  return { data, events, status, error, disconnect };
}
