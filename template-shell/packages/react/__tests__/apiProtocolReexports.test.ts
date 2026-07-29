import { describe, expect, it, vi } from 'vitest';
import {
  RestEndpointProtocol,
  RestProtocol,
  SseProtocol,
  SseStreamProtocol,
} from '../src';

describe('@gears-frontx/react API protocol re-exports', () => {
  it('re-exports descriptor protocol classes needed by MFE-local services', async () => {
    const rest = new RestProtocol();
    rest.initialize({ baseURL: '/api' });
    const getWithSharedCache = vi
      .spyOn(rest, 'getWithSharedCache')
      .mockResolvedValue({ id: 'current' });
    const patch = vi.spyOn(rest, 'patch').mockResolvedValue({ ok: true });
    const restEndpoints = new RestEndpointProtocol(rest);
    restEndpoints.initialize({ baseURL: '/api' });

    const sse = new SseProtocol();
    sse.initialize({ baseURL: '/events' });
    const connect = vi.spyOn(sse, 'connect').mockResolvedValue('stream-1');
    const sseStreams = new SseStreamProtocol(sse);
    sseStreams.initialize({ baseURL: '/events' });

    const queryWith = restEndpoints.queryWith<{ id: string }, { id: string }>(
      ({ id }: { id: string }) => `/users/${id}`
    );
    const query = restEndpoints.query<{ id: string }>('/users/current');
    const queryById = queryWith({ id: '42' });
    const mutation = restEndpoints.mutation<{ ok: boolean }, { id: string }>(
      'PATCH',
      '/users/current'
    );
    const stream = sseStreams.stream<{ message: string }>('/notifications');

    expect(typeof restEndpoints.query).toBe('function');
    expect(typeof restEndpoints.queryWith).toBe('function');
    expect(typeof restEndpoints.mutation).toBe('function');
    expect(typeof sseStreams.stream).toBe('function');
    expect(Array.isArray(query.key)).toBe(true);
    expect(Array.isArray(queryById.key)).toBe(true);
    expect(Array.isArray(mutation.key)).toBe(true);
    expect(Array.isArray(stream.key)).toBe(true);

    const [queryResult, queryWithResult, mutationResult, connectionId] = await Promise.all([
      query.fetch(),
      queryById.fetch(),
      mutation.fetch({ id: '42' }),
      stream.connect(() => undefined),
    ]);

    expect(queryResult).toEqual({ id: 'current' });
    expect(queryWithResult).toEqual({ id: 'current' });
    expect(mutationResult).toEqual({ ok: true });
    expect(connectionId).toBe('stream-1');
    expect(getWithSharedCache).toHaveBeenNthCalledWith(1, '/users/current', {
      descriptorKey: query.key,
      signal: undefined,
      staleTime: undefined,
    });
    expect(getWithSharedCache).toHaveBeenNthCalledWith(2, '/users/42', {
      descriptorKey: queryById.key,
      signal: undefined,
      staleTime: undefined,
    });
    expect(patch).toHaveBeenCalledWith('/users/current', { id: '42' }, {
      signal: undefined,
    });
    expect(connect).toHaveBeenCalledWith(
      '/notifications',
      expect.any(Function),
      undefined
    );
  });
});
