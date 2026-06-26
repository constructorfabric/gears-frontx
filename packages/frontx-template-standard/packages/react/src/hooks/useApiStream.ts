/**
 * useApiStream - Declarative SSE streaming hook
 *
 * Accepts a StreamDescriptor from @gears-frontx/api and manages the EventSource
 * lifecycle: connects on mount, disconnects on unmount/descriptor change.
 * Returns the latest event, accumulated events, connection status, and
 * a manual disconnect function.
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

// @cpt-dod:cpt-frontx-dod-request-lifecycle-use-api-stream:p2
// @cpt-flow:cpt-frontx-flow-request-lifecycle-use-api-stream:p2
// @cpt-FEATURE:cpt-frontx-fr-sse-stream-descriptors:p3

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import type { StreamDescriptor, StreamStatus } from '@gears-frontx/framework';

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
  /** Latest event payload (always set in both modes). */
  data: TEvent | undefined;
  /** All received events when `mode: 'accumulate'`; empty array in `'latest'` mode. */
  events: TEvent[];
  /** Connection lifecycle status. */
  status: StreamStatus;
  /** Error if the connection failed. */
  error: Error | null;
  /** Manually close the connection. */
  disconnect: () => void;
}

// @cpt-begin:cpt-frontx-flow-request-lifecycle-use-api-stream:p2:inst-use-api-stream
export function useApiStream<TEvent>(
  descriptor: StreamDescriptor<TEvent>,
  options?: ApiStreamOptions,
): ApiStreamResult<TEvent> {
  const mode = options?.mode ?? 'latest';
  const enabled = options?.enabled ?? true;

  const [data, setData] = useState<TEvent | undefined>(undefined);
  const [events, setEvents] = useState<TEvent[]>([]);
  const [status, setStatus] = useState<StreamStatus>('idle');
  const [error, setError] = useState<Error | null>(null);

  // Tracks the in-flight connect() promise so cleanup can await it.
  const connectPromiseRef = useRef<Promise<string> | null>(null);
  // Tracks the resolved connectionId for the manual disconnect() callback.
  const connectionIdRef = useRef<string | null>(null);
  /** When true, connect's promise resolution must tear down the new id instead of adopting it. */
  const disconnectRequestedRef = useRef(false);
  // Latest descriptor for connect/disconnect without tying effect or callbacks to object identity.
  const descriptorRef = useRef(descriptor);
  descriptorRef.current = descriptor;

  // Stable identity derived from descriptor key — used as effect dependency.
  // JSON.stringify avoids join('/') collisions when a segment contains '/'.
  const descriptorKey = useMemo(() => JSON.stringify(descriptor.key), [descriptor.key]);

  useEffect(() => {
    setData(undefined);
    setEvents([]);
    setError(null);
  }, [descriptorKey, mode]);

  const disconnect = useCallback(() => {
    disconnectRequestedRef.current = true;
    if (connectionIdRef.current) {
      descriptorRef.current.disconnect(connectionIdRef.current);
      connectionIdRef.current = null;
      disconnectRequestedRef.current = false;
    }
    setStatus('disconnected');
  }, []);

  useEffect(() => {
    if (!enabled) {
      setStatus('idle');
      return;
    }

    let cancelled = false;

    disconnectRequestedRef.current = false;

    const d = descriptorRef.current;

    setData(undefined);
    setEvents([]);
    setStatus('connecting');
    setError(null);

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
  }, [descriptorKey, enabled, mode]);

  return { data, events, status, error, disconnect };
}
// @cpt-end:cpt-frontx-flow-request-lifecycle-use-api-stream:p2:inst-use-api-stream
