import type { AxiosRequestConfig } from 'axios';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { BaseApiService } from '../BaseApiService';
import { RestEndpointProtocol } from '../protocols/RestEndpointProtocol';
import { RestProtocol } from '../protocols/RestProtocol';
import { getSharedFetchCache, resetSharedFetchCache } from '../sharedFetchCache';
import {
  type ApiProtocol,
  type ApiPluginErrorContext,
  RestPlugin,
  RestPluginWithConfig,
  type RestRequestContext,
  type RestResponseContext,
} from '../types';

/** Access protocol instance from a service (tests sit outside BaseApiService subclasses). */
function getServiceProtocol<T extends ApiProtocol>(service: BaseApiService, Protocol: new (...args: never[]) => T): T {
  return (service as unknown as { protocol(p: new (...args: never[]) => T): T }).protocol(Protocol);
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });

  return { promise, reject, resolve };
}

class AuthHeaderPlugin extends RestPluginWithConfig<{ token: string }> {
  async onRequest(context: RestRequestContext): Promise<RestRequestContext> {
    return {
      ...context,
      headers: {
        ...context.headers,
        Authorization: `Bearer ${this.config.token}`,
      },
    };
  }
}

class HeaderEchoPlugin extends RestPlugin {
  async onRequest(context: RestRequestContext): Promise<{ shortCircuit: RestResponseContext }> {
    return {
      shortCircuit: {
        status: 200,
        headers: {},
        data: {
          authorization: context.headers.Authorization ?? null,
          requestNonce: context.headers['X-Request-Nonce'] ?? null,
        },
      },
    };
  }
}

class BlockingResponsePlugin extends RestPlugin {
  entered = createDeferred<void>();

  constructor(private readonly release: Promise<void>) {
    super();
  }

  async onResponse(response: RestResponseContext): Promise<RestResponseContext> {
    this.entered.resolve();
    await this.release;
    return response;
  }
}

class BlockingRequestPlugin extends RestPlugin {
  entered = createDeferred<void>();

  constructor(private readonly release: Promise<void>) {
    super();
  }

  async onRequest(context: RestRequestContext): Promise<RestRequestContext> {
    this.entered.resolve();

    if (context.signal?.aborted) {
      throw context.signal.reason ?? new Error('aborted');
    }

    await Promise.race([
      this.release,
      new Promise<never>((_resolve, reject) => {
        context.signal?.addEventListener(
          'abort',
          () => reject(context.signal?.reason ?? new Error('aborted')),
          { once: true }
        );
      }),
    ]);

    return context;
  }
}

class ResponseTagPlugin extends RestPluginWithConfig<{ tag: string }> {
  async onResponse(response: RestResponseContext): Promise<RestResponseContext> {
    return {
      ...response,
      data: {
        ...(response.data as Record<string, unknown>),
        responseTag: this.config.tag,
      },
    };
  }
}

class RecoveryPlugin extends RestPlugin {
  constructor(private readonly recoveredData: Record<string, unknown>) {
    super();
  }

  async onError(_context: ApiPluginErrorContext): Promise<RestResponseContext> {
    return {
      status: 200,
      headers: {},
      data: this.recoveredData,
    };
  }
}

class RequestCountPlugin extends RestPlugin {
  calls = 0;

  async onRequest(context: RestRequestContext): Promise<RestRequestContext> {
    this.calls += 1;
    return context;
  }
}

class RequestNoncePlugin extends RestPlugin {
  calls = 0;

  async onRequest(context: RestRequestContext): Promise<RestRequestContext> {
    this.calls += 1;

    return {
      ...context,
      headers: {
        ...context.headers,
        'X-Request-Nonce': String(this.calls),
      },
    };
  }
}

class SharedHeaderApiService extends BaseApiService {
  constructor(token: string, requestPlugin?: RestPlugin) {
    const rest = new RestProtocol();
    const endpoints = new RestEndpointProtocol(rest);
    super({ baseURL: '/api/shared' }, rest, endpoints);

    rest.plugins.add(new AuthHeaderPlugin({ token }));
    if (requestPlugin) {
      rest.plugins.add(requestPlugin);
    }
    rest.plugins.add(new HeaderEchoPlugin());
  }

  readonly getCurrentUser = this.protocol(RestEndpointProtocol).query<{
    authorization: string | null;
    requestNonce: string | null;
    responseTag?: string;
  }>('/user/current');
}

class CredentialModeApiService extends BaseApiService {
  readonly requestSpy: ReturnType<typeof vi.fn<(config: AxiosRequestConfig) => Promise<unknown>>>;

  constructor(withCredentials: boolean, credentialMode: string) {
    const rest = new RestProtocol({ withCredentials });
    const endpoints = new RestEndpointProtocol(rest);
    super({ baseURL: '/api/shared' }, rest, endpoints);

    this.requestSpy = vi.fn(async (_config: AxiosRequestConfig) => ({
      status: 200,
      headers: {},
      data: { credentialMode },
    }));

    rest.setRequestDispatcherForTest(this.requestSpy);
  }

  readonly getCurrentUser = this.protocol(RestEndpointProtocol).query<{
    credentialMode: string;
  }>('/user/current');
}

class RecoveringSharedHeaderApiService extends BaseApiService {
  readonly requestSpy: ReturnType<typeof vi.fn<(config: AxiosRequestConfig) => Promise<unknown>>>;

  constructor(token: string, recoveredData: Record<string, unknown>) {
    const rest = new RestProtocol();
    const endpoints = new RestEndpointProtocol(rest);
    super({ baseURL: '/api/shared' }, rest, endpoints);

    rest.plugins.add(new AuthHeaderPlugin({ token }));
    rest.plugins.add(new RecoveryPlugin(recoveredData));

    this.requestSpy = vi.fn(async (_config: AxiosRequestConfig) => {
      throw new Error('network-down');
    });
    rest.setRequestDispatcherForTest(this.requestSpy);
  }

  readonly getCurrentUser = this.protocol(RestEndpointProtocol).query<{
    authorization: string | null;
    requestNonce: string | null;
    responseTag?: string;
    recovered?: boolean;
  }>('/user/current');
}

beforeEach(() => {
  resetSharedFetchCache();
});

afterEach(() => {
  resetSharedFetchCache();
});

describe('RestEndpointProtocol shared fetch identity', () => {
  it('runs the onRequest plugin chain once for concurrent shared-cache fetches', async () => {
    getSharedFetchCache();
    const requestCountPlugin = new RequestCountPlugin();
    const service = new SharedHeaderApiService('tenant-a', requestCountPlugin);

    await expect(
      Promise.all([
        service.getCurrentUser.fetch({ staleTime: 1_000 }),
        service.getCurrentUser.fetch({ staleTime: 1_000 }),
      ])
    ).resolves.toEqual([
      { authorization: 'Bearer tenant-a', requestNonce: null },
      { authorization: 'Bearer tenant-a', requestNonce: null },
    ]);
    expect(requestCountPlugin.calls).toBe(1);
  });

  it('revalidates warm sequential shared-cache reads through the onRequest plugin chain', async () => {
    getSharedFetchCache();
    const requestCountPlugin = new RequestCountPlugin();
    const service = new SharedHeaderApiService('tenant-a', requestCountPlugin);

    await expect(service.getCurrentUser.fetch({ staleTime: 1_000 })).resolves.toEqual({
      authorization: 'Bearer tenant-a',
      requestNonce: null,
    });
    await expect(service.getCurrentUser.fetch({ staleTime: 1_000 })).resolves.toEqual({
      authorization: 'Bearer tenant-a',
      requestNonce: null,
    });
    expect(requestCountPlugin.calls).toBe(2);
  });

  it('deduplicates request preparation before unstable request metadata diverges', async () => {
    getSharedFetchCache();
    const noncePlugin = new RequestNoncePlugin();
    const service = new SharedHeaderApiService('tenant-a', noncePlugin);

    await expect(
      Promise.all([
        service.getCurrentUser.fetch({ staleTime: 1_000 }),
        service.getCurrentUser.fetch({ staleTime: 1_000 }),
      ])
    ).resolves.toEqual([
      { authorization: 'Bearer tenant-a', requestNonce: '1' },
      { authorization: 'Bearer tenant-a', requestNonce: '1' },
    ]);
    expect(noncePlugin.calls).toBe(1);
  });

  it('aborts a preparation-phase shared fetch when invalidated by descriptor key', async () => {
    const cache = getSharedFetchCache();
    const releaseRequest = createDeferred<void>();
    const blockingRequestPlugin = new BlockingRequestPlugin(releaseRequest.promise);
    const service = new SharedHeaderApiService('tenant-a', blockingRequestPlugin);

    const pendingFetch = service.getCurrentUser.fetch({ staleTime: 1_000 });
    await blockingRequestPlugin.entered.promise;

    cache.invalidate(service.getCurrentUser.key);

    await expect(pendingFetch).rejects.toMatchObject({ name: 'AbortError' });

    releaseRequest.resolve();

    await expect(service.getCurrentUser.fetch({ staleTime: 1_000 })).resolves.toEqual({
      authorization: 'Bearer tenant-a',
      requestNonce: null,
    });
  });

  it('starts a new fetch when a query is requested again right after its only fetch was cancelled', async () => {
    getSharedFetchCache();
    const releaseRequest = createDeferred<void>();
    const blockingRequestPlugin = new BlockingRequestPlugin(releaseRequest.promise);
    const service = new SharedHeaderApiService('tenant-a', blockingRequestPlugin);

    // A component that ties the fetch to its mount unmounts and mounts again at once,
    // as React StrictMode does in development.
    const firstMount = new AbortController();
    const cancelledFetch = service.getCurrentUser.fetch({
      signal: firstMount.signal,
      staleTime: 1_000,
    });
    await blockingRequestPlugin.entered.promise;

    firstMount.abort();
    const secondFetch = service.getCurrentUser.fetch({
      signal: new AbortController().signal,
      staleTime: 1_000,
    });
    releaseRequest.resolve();

    await expect(cancelledFetch).rejects.toMatchObject({ name: 'AbortError' });
    await expect(secondFetch).resolves.toEqual({
      authorization: 'Bearer tenant-a',
      requestNonce: null,
    });
  });

  it('reuses an in-flight shared fetch after preparation already completed while revalidating request identity', async () => {
    getSharedFetchCache();
    const noncePlugin = new RequestNoncePlugin();
    const releaseResponse = createDeferred<void>();
    const blockingResponsePlugin = new BlockingResponsePlugin(releaseResponse.promise);
    const service = new SharedHeaderApiService('tenant-a', noncePlugin);
    getServiceProtocol(service, RestProtocol).plugins.add(blockingResponsePlugin);

    const firstFetch = service.getCurrentUser.fetch({ staleTime: 1_000 });
    await blockingResponsePlugin.entered.promise;

    const secondFetch = service.getCurrentUser.fetch({ staleTime: 1_000 });
    releaseResponse.resolve();

    await expect(Promise.all([firstFetch, secondFetch])).resolves.toEqual([
      { authorization: 'Bearer tenant-a', requestNonce: '1' },
      { authorization: 'Bearer tenant-a', requestNonce: '2' },
    ]);
    expect(noncePlugin.calls).toBe(2);
  });

  it('does not reuse a warm sequential fetch after unstable request metadata diverges', async () => {
    getSharedFetchCache();
    const noncePlugin = new RequestNoncePlugin();
    const service = new SharedHeaderApiService('tenant-a', noncePlugin);

    await expect(service.getCurrentUser.fetch({ staleTime: 1_000 })).resolves.toEqual({
      authorization: 'Bearer tenant-a',
      requestNonce: '1',
    });
    await expect(service.getCurrentUser.fetch({ staleTime: 1_000 })).resolves.toEqual({
      authorization: 'Bearer tenant-a',
      requestNonce: '2',
    });
    expect(noncePlugin.calls).toBe(2);
  });

  it('does not reuse a shared fetch when plugin-transformed headers differ', async () => {
    getSharedFetchCache();
    const firstService = new SharedHeaderApiService('tenant-a');
    const secondService = new SharedHeaderApiService('tenant-b');

    expect(firstService.getCurrentUser.key).toEqual(secondService.getCurrentUser.key);

    const [firstResult, secondResult] = await Promise.all([
      firstService.getCurrentUser.fetch({ staleTime: 1_000 }),
      secondService.getCurrentUser.fetch({ staleTime: 1_000 }),
    ]);

    expect(firstResult).toEqual({ authorization: 'Bearer tenant-a', requestNonce: null });
    expect(secondResult).toEqual({ authorization: 'Bearer tenant-b', requestNonce: null });
  });

  it('applies each protocol instance response pipeline after shared raw fetch reuse', async () => {
    getSharedFetchCache();
    const firstService = new SharedHeaderApiService('tenant-a');
    const secondService = new SharedHeaderApiService('tenant-a');
    getServiceProtocol(firstService, RestProtocol).plugins.add(new ResponseTagPlugin({ tag: 'first' }));
    getServiceProtocol(secondService, RestProtocol).plugins.add(new ResponseTagPlugin({ tag: 'second' }));

    await expect(firstService.getCurrentUser.fetch({ staleTime: 1_000 })).resolves.toEqual({
      authorization: 'Bearer tenant-a',
      requestNonce: null,
      responseTag: 'first',
    });
    await expect(secondService.getCurrentUser.fetch({ staleTime: 1_000 })).resolves.toEqual({
      authorization: 'Bearer tenant-a',
      requestNonce: null,
      responseTag: 'second',
    });
  });

  it('applies each protocol instance response pipeline after shared error recovery reuse', async () => {
    getSharedFetchCache();
    const recoveredEnvelope = {
      authorization: 'Bearer tenant-a',
      requestNonce: null,
      recovered: true,
    };
    const firstService = new RecoveringSharedHeaderApiService('tenant-a', recoveredEnvelope);
    const secondService = new RecoveringSharedHeaderApiService('tenant-a', recoveredEnvelope);
    getServiceProtocol(firstService, RestProtocol).plugins.add(new ResponseTagPlugin({ tag: 'first' }));
    getServiceProtocol(secondService, RestProtocol).plugins.add(new ResponseTagPlugin({ tag: 'second' }));

    await expect(firstService.getCurrentUser.fetch({ staleTime: 1_000 })).resolves.toEqual({
      authorization: 'Bearer tenant-a',
      requestNonce: null,
      recovered: true,
      responseTag: 'first',
    });
    await expect(secondService.getCurrentUser.fetch({ staleTime: 1_000 })).resolves.toEqual({
      authorization: 'Bearer tenant-a',
      requestNonce: null,
      recovered: true,
      responseTag: 'second',
    });

    expect(firstService.requestSpy).toHaveBeenCalledTimes(1);
    expect(secondService.requestSpy).toHaveBeenCalledTimes(0);
  });

  it('does not share cached GET responses across withCredentials boundaries', async () => {
    getSharedFetchCache();
    const cookieService = new CredentialModeApiService(true, 'cookies');
    const statelessService = new CredentialModeApiService(false, 'stateless');

    await expect(cookieService.getCurrentUser.fetch({ staleTime: 1_000 })).resolves.toEqual({
      credentialMode: 'cookies',
    });
    await expect(statelessService.getCurrentUser.fetch({ staleTime: 1_000 })).resolves.toEqual({
      credentialMode: 'stateless',
    });

    expect(cookieService.requestSpy).toHaveBeenCalledTimes(1);
    expect(statelessService.requestSpy).toHaveBeenCalledTimes(1);
  });
});
