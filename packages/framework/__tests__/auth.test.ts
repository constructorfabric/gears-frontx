/**
 * Unit tests for auth plugin
 *
 * Covers:
 * 1. Bearer header attached when provider session is bearer token.
 * 2. Cookie-session credentials enabled only for relative URLs and allowlisted origins.
 * 3. Refresh+retry on 401: calls ctx.retry once with new Authorization.
 * 4. Custom transport binder is used and default binding is not.
 * 5. app.auth surface exists and delegates methods.
 * 6. CSRF header attached when csrfHeaderName + session.csrfToken are set.
 * 7. provider.onTransportError invoked on every transport error.
 * 8. Cookie session refresh path: retry without header override.
 * 9. Refresh dedup: concurrent 401s share a single in-flight refresh promise.
 * 10. provider.destroy() called on app.destroy().
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiRegistry, RestProtocol } from '@cyberfabric/api';
import { createStore } from '@cyberfabric/state';
import type { RestPlugin, RestPluginHooks, RestRequestContext } from '@cyberfabric/api';
import type { AccessEvaluation, AuthProvider, AuthSession } from '@cyberfabric/auth';
import { createHAI3 } from '../src/createHAI3';
import { auth, hai3ApiTransport } from '../src/plugins/auth';
import type { AuthTransportBinder } from '../src/plugins/auth';

/** Concrete auth transport plugins implement hooks; `RestPlugin` instance type omits optional hook keys. */
type AuthRestPlugin = RestPlugin & Pick<RestPluginHooks, 'onRequest' | 'onError'>;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeBearerProvider(
  token: string,
  refresh?: AuthProvider['refresh'],
): AuthProvider {
  return {
    getSession: vi.fn().mockResolvedValue({ kind: 'bearer', token } satisfies AuthSession),
    checkAuth: vi.fn().mockResolvedValue({ authenticated: true }),
    logout: vi.fn().mockResolvedValue({ type: 'none' }),
    ...(refresh ? { refresh } : {}),
  };
}

function makeCookieProvider(): AuthProvider {
  return {
    getSession: vi.fn().mockResolvedValue({ kind: 'cookie' } satisfies AuthSession),
    checkAuth: vi.fn().mockResolvedValue({ authenticated: true }),
    logout: vi.fn().mockResolvedValue({ type: 'none' }),
  };
}

function makeNullSessionProvider(): AuthProvider {
  return {
    getSession: vi.fn().mockResolvedValue(null),
    checkAuth: vi.fn().mockResolvedValue({ authenticated: false }),
    logout: vi.fn().mockResolvedValue({ type: 'none' }),
  };
}

/** Use hai3ApiTransport directly to capture the internal plugin instance. */
function capturePlugin(
  provider: AuthProvider,
  opts?: { allowedCookieOrigins?: string[]; csrfHeaderName?: string },
): AuthRestPlugin {
  const binder = hai3ApiTransport();
  let captured: AuthRestPlugin | null = null;

  binder({
    provider,
    allowedCookieOrigins: opts?.allowedCookieOrigins,
    csrfHeaderName: opts?.csrfHeaderName,
    addRestPlugin: (p: RestPlugin) => {
      captured = p as AuthRestPlugin;
    },
    removeRestPlugin: vi.fn(),
  });

  if (!captured) throw new Error('addRestPlugin was not called by binder');
  return captured;
}

function makeReqCtx(url: string, headers: Record<string, string> = {}): RestRequestContext {
  return { method: 'GET', url, headers };
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('auth plugin', () => {
  beforeEach(() => {
    apiRegistry.reset();
    createStore({});
  });

  afterEach(() => {
    apiRegistry.reset();
  });

  // -------------------------------------------------------------------------
  // 1. Bearer header
  // -------------------------------------------------------------------------
  describe('bearer session', () => {
    it('attaches Authorization: Bearer header when provider returns bearer token', async () => {
      const plugin = capturePlugin(makeBearerProvider('tok-abc'));

      const result = (await plugin.onRequest?.(makeReqCtx('/api'))) as RestRequestContext;

      expect(result.headers['Authorization']).toBe('Bearer tok-abc');
    });

    it('passes through unmodified when session is null', async () => {
      const plugin = capturePlugin(makeNullSessionProvider());
      const ctx = makeReqCtx('/api');

      const result = (await plugin.onRequest?.(ctx)) as RestRequestContext;

      expect(result.headers['Authorization']).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // 2. Cookie-session credentials
  // -------------------------------------------------------------------------
  describe('cookie session credentials', () => {
    it('sets withCredentials=true for relative URLs', async () => {
      const plugin = capturePlugin(makeCookieProvider());

      const result = (await plugin.onRequest?.(makeReqCtx('/relative/path'))) as RestRequestContext;

      expect(result.withCredentials).toBe(true);
    });

    it('does NOT set withCredentials for absolute URLs not in allowlist', async () => {
      const plugin = capturePlugin(makeCookieProvider(), {
        allowedCookieOrigins: ['https://trusted.example.com'],
      });

      const result = (await plugin.onRequest?.(
        makeReqCtx('https://other.example.com/api'),
      )) as RestRequestContext;

      expect(result.withCredentials).toBeFalsy();
    });

    it('sets withCredentials=true for absolute URLs from allowlisted origins', async () => {
      const plugin = capturePlugin(makeCookieProvider(), {
        allowedCookieOrigins: ['https://trusted.example.com'],
      });

      const result = (await plugin.onRequest?.(
        makeReqCtx('https://trusted.example.com/api'),
      )) as RestRequestContext;

      expect(result.withCredentials).toBe(true);
    });

    // -----------------------------------------------------------------------
    // 6. CSRF header
    // -----------------------------------------------------------------------
    it('attaches csrfHeaderName header when csrfHeaderName is configured and session has csrfToken', async () => {
      const provider: AuthProvider = {
        getSession: vi.fn().mockResolvedValue({ kind: 'cookie', csrfToken: 'csrf-abc' } satisfies AuthSession),
        checkAuth: vi.fn().mockResolvedValue({ authenticated: true }),
        logout: vi.fn().mockResolvedValue({ type: 'none' }),
      };
      const plugin = capturePlugin(provider, { csrfHeaderName: 'X-CSRF-Token' });

      const result = (await plugin.onRequest?.(makeReqCtx('/api'))) as RestRequestContext;

      expect(result.withCredentials).toBe(true);
      expect(result.headers['X-CSRF-Token']).toBe('csrf-abc');
    });

    it('does not attach csrf header when csrfToken is absent', async () => {
      const plugin = capturePlugin(makeCookieProvider(), { csrfHeaderName: 'X-CSRF-Token' });

      const result = (await plugin.onRequest?.(makeReqCtx('/api'))) as RestRequestContext;

      expect(result.withCredentials).toBe(true);
      expect(result.headers['X-CSRF-Token']).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // 3. 401 refresh + retry
  // -------------------------------------------------------------------------
  describe('401 refresh and retry', () => {
    it('calls provider.refresh then ctx.retry with refreshed credentials on 401 (retryCount=0)', async () => {
      const refreshFn = vi.fn().mockResolvedValue({ kind: 'bearer', token: 'new-tok' } satisfies AuthSession);
      const plugin = capturePlugin(makeBearerProvider('old-tok', refreshFn));

      const errCtx = {
        error: new Error('HTTP 401'),
        request: makeReqCtx('/api'),
        response: { status: 401, headers: {}, data: null },
        retryCount: 0,
        retry: vi.fn().mockResolvedValue({ status: 200, headers: {}, data: {} }),
      };

      await plugin.onError?.(errCtx);

      expect(refreshFn).toHaveBeenCalledTimes(1);
      expect(errCtx.retry).toHaveBeenCalledWith({ headers: { Authorization: 'Bearer new-tok' } });
    });

    it('returns error without retry on 401 when retryCount > 0', async () => {
      const refreshFn = vi.fn().mockResolvedValue({ kind: 'bearer', token: 'new-tok' } satisfies AuthSession);
      const plugin = capturePlugin(makeBearerProvider('old-tok', refreshFn));

      const errCtx = {
        error: new Error('HTTP 401'),
        request: makeReqCtx('/api'),
        response: { status: 401, headers: {}, data: null },
        retryCount: 1,
        retry: vi.fn(),
      };

      const result = await plugin.onError?.(errCtx);

      expect(errCtx.retry).not.toHaveBeenCalled();
      expect(result).toBe(errCtx.error);
    });

    it('returns error without retry for non-401 status', async () => {
      const refreshFn = vi.fn().mockResolvedValue({ kind: 'bearer', token: 'new-tok' } satisfies AuthSession);
      const plugin = capturePlugin(makeBearerProvider('old-tok', refreshFn));

      const errCtx = {
        error: new Error('HTTP 500'),
        request: makeReqCtx('/api'),
        response: { status: 500, headers: {}, data: null },
        retryCount: 0,
        retry: vi.fn(),
      };

      const result = await plugin.onError?.(errCtx);

      expect(errCtx.retry).not.toHaveBeenCalled();
      expect(result).toBe(errCtx.error);
    });

    it('returns error when provider has no refresh method', async () => {
      const plugin = capturePlugin(makeBearerProvider('tok')); // no refresh

      const errCtx = {
        error: new Error('HTTP 401'),
        request: makeReqCtx('/api'),
        response: { status: 401, headers: {}, data: null },
        retryCount: 0,
        retry: vi.fn(),
      };

      const result = await plugin.onError?.(errCtx);

      expect(errCtx.retry).not.toHaveBeenCalled();
      expect(result).toBe(errCtx.error);
    });

    // -----------------------------------------------------------------------
    // 8. Cookie session refresh path
    // -----------------------------------------------------------------------
    it('calls provider.refresh and retries without header override on 401 with cookie session', async () => {
      const refreshFn = vi.fn().mockResolvedValue({ kind: 'cookie' } satisfies AuthSession);
      const provider: AuthProvider = {
        getSession: vi.fn().mockResolvedValue({ kind: 'cookie' } satisfies AuthSession),
        checkAuth: vi.fn().mockResolvedValue({ authenticated: true }),
        logout: vi.fn().mockResolvedValue({ type: 'none' }),
        refresh: refreshFn,
      };
      const plugin = capturePlugin(provider);

      const errCtx = {
        error: new Error('HTTP 401'),
        request: makeReqCtx('/api'),
        response: { status: 401, headers: {}, data: null },
        retryCount: 0,
        retry: vi.fn().mockResolvedValue({ status: 200, headers: {}, data: {} }),
      };

      await plugin.onError?.(errCtx);

      expect(refreshFn).toHaveBeenCalledTimes(1);
      expect(errCtx.retry).toHaveBeenCalledTimes(1);
      // Cookie retry must not inject any Authorization header
      expect(errCtx.retry).toHaveBeenCalledWith();
    });

    // -----------------------------------------------------------------------
    // 9. Refresh dedup
    // -----------------------------------------------------------------------
    it('deduplicates concurrent 401 refresh calls into a single in-flight promise', async () => {
      let resolveRefresh!: (value: AuthSession) => void;
      const pendingRefresh = new Promise<AuthSession>((resolve) => {
        resolveRefresh = resolve;
      });
      const refreshFn = vi.fn().mockReturnValue(pendingRefresh);
      const plugin = capturePlugin(makeBearerProvider('old-tok', refreshFn));

      const makeErrCtx = () => {
        return {
          error: new Error('HTTP 401'),
          request: makeReqCtx('/api'),
          response: { status: 401, headers: {}, data: null },
          retryCount: 0,
          retry: vi.fn().mockResolvedValue({ status: 200, headers: {}, data: {} }),
        };
      };

      const errCtx1 = makeErrCtx();
      const errCtx2 = makeErrCtx();

      // Start both concurrently before resolving refresh
      const p1 = plugin.onError?.(errCtx1);
      const p2 = plugin.onError?.(errCtx2);

      resolveRefresh({ kind: 'bearer', token: 'new-tok' });

      await Promise.all([p1, p2]);

      expect(refreshFn).toHaveBeenCalledTimes(1);
      expect(errCtx1.retry).toHaveBeenCalledWith({ headers: { Authorization: 'Bearer new-tok' } });
      expect(errCtx2.retry).toHaveBeenCalledWith({ headers: { Authorization: 'Bearer new-tok' } });
    });
  });

  // -------------------------------------------------------------------------
  // 4. Custom transport binder
  // -------------------------------------------------------------------------
  describe('custom transport binder', () => {
    it('invokes the custom binder on app init instead of default', () => {
      const customBinder: AuthTransportBinder = vi.fn().mockReturnValue({ destroy: vi.fn() });
      const provider = makeBearerProvider('tok');

      const app = createHAI3().use(auth({ provider, transport: customBinder })).build();

      expect(customBinder).toHaveBeenCalledTimes(1);
      expect(customBinder).toHaveBeenCalledWith(expect.objectContaining({ provider }));

      app.destroy();
    });

    it('does not add default AuthRestPlugin when custom binder does not call addRestPlugin', () => {
      // Custom binder that intentionally does not call addRestPlugin
      const customBinder: AuthTransportBinder = (_args: Parameters<AuthTransportBinder>[0]) => {
        return { destroy: vi.fn() };
      };
      const provider = makeBearerProvider('tok');

      const app = createHAI3().use(auth({ provider, transport: customBinder })).build();

      expect(apiRegistry.plugins.getAll(RestProtocol)).toHaveLength(0);

      app.destroy();
    });

    it('default binding registers one RestPlugin in apiRegistry when no custom binder given', () => {
      const provider = makeBearerProvider('tok');

      const app = createHAI3().use(auth({ provider })).build();

      expect(apiRegistry.plugins.getAll(RestProtocol)).toHaveLength(1);

      app.destroy();
    });
  });

  // -------------------------------------------------------------------------
  // 5. app.auth surface
  // -------------------------------------------------------------------------
  describe('app.auth surface', () => {
    it('is defined on the built app', () => {
      const provider = makeBearerProvider('tok');
      const app = createHAI3().use(auth({ provider })).build();

      expect(app.auth).toBeDefined();

      app.destroy();
    });

    it('exposes provider reference via app.auth.provider', () => {
      const provider = makeBearerProvider('tok');
      const app = createHAI3().use(auth({ provider })).build();

      expect(app.auth?.provider).toBe(provider);

      app.destroy();
    });

    it('app.auth.getSession delegates to provider.getSession', async () => {
      const provider = makeBearerProvider('tok');
      const app = createHAI3().use(auth({ provider })).build();
      const ctx = {};

      await app.auth?.getSession(ctx);

      expect(provider.getSession).toHaveBeenCalledWith(ctx);

      app.destroy();
    });

    it('app.auth.checkAuth delegates to provider.checkAuth', async () => {
      const provider = makeBearerProvider('tok');
      const app = createHAI3().use(auth({ provider })).build();

      await app.auth?.checkAuth();

      expect(provider.checkAuth).toHaveBeenCalled();

      app.destroy();
    });

    it('app.auth.logout delegates to provider.logout', async () => {
      const provider = makeBearerProvider('tok');
      const app = createHAI3().use(auth({ provider })).build();

      await app.auth?.logout();

      expect(provider.logout).toHaveBeenCalled();

      app.destroy();
    });

    it('passes through optional canAccess and subscribe when implemented', async () => {
      const unsubscribe = vi.fn();
      const provider: AuthProvider = {
        ...makeBearerProvider('tok'),
        canAccess: vi.fn().mockResolvedValue('allow'),
        subscribe: vi.fn().mockReturnValue(unsubscribe),
      };
      const app = createHAI3().use(auth({ provider })).build();

      const decision = await app.auth?.canAccess?.({ action: 'read', resource: 'x' });
      expect(decision).toBe('allow');
      expect(provider.canAccess).toHaveBeenCalledTimes(1);

      const unsub = app.auth?.subscribe?.(() => undefined);
      expect(unsub).toBe(unsubscribe);
      expect(provider.subscribe).toHaveBeenCalledTimes(1);

      app.destroy();
    });

    // -----------------------------------------------------------------------
    // 10. provider.destroy() on app.destroy()
    // -----------------------------------------------------------------------
    it('calls provider.destroy() when app.destroy() is called', () => {
      const destroyFn = vi.fn();
      const provider: AuthProvider = { ...makeBearerProvider('tok'), destroy: destroyFn };
      const app = createHAI3().use(auth({ provider })).build();

      app.destroy();

      expect(destroyFn).toHaveBeenCalledTimes(1);
    });

    it('does not throw when provider has no destroy method', () => {
      const provider = makeBearerProvider('tok'); // no destroy
      const app = createHAI3().use(auth({ provider })).build();

      expect(() => {
        app.destroy();
      }).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // 7. Transport error hooks
  // -------------------------------------------------------------------------
  describe('transport error hooks', () => {
    it('calls provider.onTransportError for every transport error', async () => {
      const onTransportError = vi.fn();
      const provider: AuthProvider = { ...makeBearerProvider('tok'), onTransportError };
      const plugin = capturePlugin(provider);

      const err = new Error('Network failure');
      const errCtx = {
        error: err,
        request: makeReqCtx('/api'),
        response: { status: 500, headers: {}, data: null },
        retryCount: 0,
        retry: vi.fn(),
      };

      await plugin.onError?.(errCtx);

      expect(onTransportError).toHaveBeenCalledTimes(1);
      expect(onTransportError).toHaveBeenCalledWith(
        expect.objectContaining({ error: err, status: 500 }),
      );
    });

    it('calls provider.onTransportError even for 401 errors that will be retried', async () => {
      const onTransportError = vi.fn();
      const refreshFn = vi.fn().mockResolvedValue({ kind: 'bearer', token: 'new-tok' } satisfies AuthSession);
      const provider: AuthProvider = {
        ...makeBearerProvider('old-tok', refreshFn),
        onTransportError,
      };
      const plugin = capturePlugin(provider);

      const errCtx = {
        error: new Error('HTTP 401'),
        request: makeReqCtx('/api'),
        response: { status: 401, headers: {}, data: null },
        retryCount: 0,
        retry: vi.fn().mockResolvedValue({ status: 200, headers: {}, data: {} }),
      };

      await plugin.onError?.(errCtx);

      expect(onTransportError).toHaveBeenCalledTimes(1);
      expect(errCtx.retry).toHaveBeenCalledTimes(1);
    });

    it('does not throw when provider has no onTransportError hook', async () => {
      const plugin = capturePlugin(makeBearerProvider('tok')); // no onTransportError

      const errCtx = {
        error: new Error('HTTP 500'),
        request: makeReqCtx('/api'),
        response: { status: 500, headers: {}, data: null },
        retryCount: 0,
        retry: vi.fn(),
      };

      const result = await plugin.onError?.(errCtx);
      expect(result).toBe(errCtx.error);
    });
  });

  // -------------------------------------------------------------------------
  // 11. Protocol-relative URL credential leak
  // -------------------------------------------------------------------------
  describe('protocol-relative URL', () => {
    it('does NOT set withCredentials for protocol-relative URLs', async () => {
      const plugin = capturePlugin(makeCookieProvider());

      const result = (await plugin.onRequest?.(makeReqCtx('//cdn.example.com/asset'))) as RestRequestContext;

      expect(result.withCredentials).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // 12. Opaque origin "null" (sandboxed iframe / file://)
  // -------------------------------------------------------------------------
  describe('opaque origin', () => {
    it('does NOT match opaque "null" origin against URL origins', async () => {
      const saved = (globalThis as Record<string, unknown>).location;
      (globalThis as Record<string, unknown>).location = { origin: 'null' };

      try {
        const plugin = capturePlugin(makeCookieProvider());

        // An absolute URL whose origin happens to be 'https://null' should NOT get credentials
        const result = (await plugin.onRequest?.(makeReqCtx('https://null/api'))) as RestRequestContext;

        expect(result.withCredentials).toBeUndefined();
      } finally {
        (globalThis as Record<string, unknown>).location = saved;
      }
    });
  });

  // -------------------------------------------------------------------------
  // 13. Custom session kind (pass-through)
  // -------------------------------------------------------------------------
  describe('custom session kind', () => {
    it('does not modify request for custom sessions', async () => {
      const provider: AuthProvider = {
        getSession: vi.fn().mockResolvedValue({ kind: 'custom' } satisfies AuthSession),
        checkAuth: vi.fn().mockResolvedValue({ authenticated: true }),
        logout: vi.fn().mockResolvedValue({ type: 'none' }),
      };
      const plugin = capturePlugin(provider);

      const original = makeReqCtx('/api');
      const result = (await plugin.onRequest?.(original)) as RestRequestContext;

      expect(result.headers['Authorization']).toBeUndefined();
      expect(result.withCredentials).toBeUndefined();
    });

    it('returns error without retry for refreshed custom sessions', async () => {
      const refreshFn = vi.fn().mockResolvedValue({ kind: 'custom' } satisfies AuthSession);
      const provider: AuthProvider = {
        getSession: vi.fn().mockResolvedValue({ kind: 'custom' } satisfies AuthSession),
        checkAuth: vi.fn().mockResolvedValue({ authenticated: true }),
        logout: vi.fn().mockResolvedValue({ type: 'none' }),
        refresh: refreshFn,
      };
      const plugin = capturePlugin(provider);

      const errCtx = {
        error: new Error('HTTP 401'),
        request: makeReqCtx('/api'),
        response: { status: 401, headers: {}, data: null },
        retryCount: 0,
        retry: vi.fn(),
      };

      const result = await plugin.onError?.(errCtx);

      expect(refreshFn).toHaveBeenCalledTimes(1);
      expect(errCtx.retry).not.toHaveBeenCalled();
      expect(result).toBe(errCtx.error);
    });
  });

  // -------------------------------------------------------------------------
  // 14a. Shared refresh must not bind to any single request's AbortSignal
  // -------------------------------------------------------------------------
  describe('shared refresh signal isolation', () => {
    it('does not pass first caller AbortSignal to provider.refresh (shared promise safety)', async () => {
      const refreshFn = vi
        .fn()
        .mockResolvedValue({ kind: 'bearer', token: 'new-tok' } satisfies AuthSession);
      const plugin = capturePlugin(makeBearerProvider('old-tok', refreshFn));

      const firstController = new AbortController();
      const errCtx = {
        error: new Error('HTTP 401'),
        request: { ...makeReqCtx('/api'), signal: firstController.signal },
        response: { status: 401, headers: {}, data: null },
        retryCount: 0,
        retry: vi.fn().mockResolvedValue({ status: 200, headers: {}, data: {} }),
      };

      await plugin.onError?.(errCtx);

      // Regression: shared refresh must not inherit the first caller's signal,
      // otherwise aborting one waiter cancels refresh for all.
      expect(refreshFn).toHaveBeenCalledWith();
      expect(refreshFn.mock.calls[0]?.[0]).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // 14. Refresh rejection safety (concurrent waiters)
  // -------------------------------------------------------------------------
  describe('refresh rejection safety', () => {
    it('returns error for all concurrent waiters when refresh rejects', async () => {
      const refreshFn = vi.fn().mockRejectedValue(new Error('refresh failed'));
      const plugin = capturePlugin(makeBearerProvider('tok', refreshFn));

      const makeErrCtx = () => ({
        error: new Error('HTTP 401'),
        request: makeReqCtx('/api'),
        response: { status: 401, headers: {}, data: null },
        retryCount: 0,
        retry: vi.fn(),
      });

      const ctx1 = makeErrCtx();
      const ctx2 = makeErrCtx();

      const [result1, result2] = await Promise.all([
        plugin.onError?.(ctx1),
        plugin.onError?.(ctx2),
      ]);

      expect(result1).toBe(ctx1.error);
      expect(result2).toBe(ctx2.error);
      expect(ctx1.retry).not.toHaveBeenCalled();
      expect(ctx2.retry).not.toHaveBeenCalled();
      // Single refresh call (deduped)
      expect(refreshFn).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // 15. Capability probe via app.auth runtime
  // -------------------------------------------------------------------------
  describe('auth capabilities', () => {
    it('sets all flags false for a minimal provider', () => {
      const app = createHAI3().use(auth({ provider: makeNullSessionProvider() })).build();

      expect(app.auth?.capabilities.hasCanAccess).toBe(false);
      expect(app.auth?.capabilities.hasCanAccessMany).toBe(false);
      expect(app.auth?.capabilities.hasEvaluateAccess).toBe(false);
      expect(app.auth?.capabilities.hasEvaluateMany).toBe(false);
      expect(app.auth?.capabilities.hasGetIdentity).toBe(false);
      expect(app.auth?.capabilities.hasGetPermissions).toBe(false);
      expect(app.auth?.capabilities.hasRefresh).toBe(false);
      expect(app.auth?.capabilities.hasSubscribe).toBe(false);

      app.destroy();
    });

    it('sets hasCanAccess=true when provider implements canAccess', () => {
      const provider: AuthProvider = {
        ...makeBearerProvider('tok'),
        canAccess: vi.fn().mockResolvedValue('allow'),
      };
      const app = createHAI3().use(auth({ provider })).build();

      expect(app.auth?.capabilities.hasCanAccess).toBe(true);
      app.destroy();
    });

    it('sets individual flags independently', () => {
      const provider: AuthProvider = {
        ...makeBearerProvider('tok'),
        refresh: vi.fn().mockResolvedValue(null),
        subscribe: vi.fn().mockReturnValue(vi.fn()),
        getPermissions: vi.fn().mockResolvedValue({ roles: [] }),
      };
      const app = createHAI3().use(auth({ provider })).build();

      expect(app.auth?.capabilities.hasRefresh).toBe(true);
      expect(app.auth?.capabilities.hasSubscribe).toBe(true);
      expect(app.auth?.capabilities.hasGetPermissions).toBe(true);
      expect(app.auth?.capabilities.hasCanAccess).toBe(false);
      expect(app.auth?.capabilities.hasGetIdentity).toBe(false);
      app.destroy();
    });

    it('app.auth.capabilities reflects probe result', () => {
      const provider: AuthProvider = {
        ...makeBearerProvider('tok'),
        canAccess: vi.fn().mockResolvedValue('allow'),
        evaluateAccess: vi.fn().mockResolvedValue({ decision: 'allow' }),
      };
      const app = createHAI3().use(auth({ provider })).build();

      expect(app.auth?.capabilities.hasCanAccess).toBe(true);
      expect(app.auth?.capabilities.hasEvaluateAccess).toBe(true);
      expect(app.auth?.capabilities.hasCanAccessMany).toBe(false);
      expect(app.auth?.capabilities.hasEvaluateMany).toBe(false);

      app.destroy();
    });
  });

  // -------------------------------------------------------------------------
  // 16. Fail-closed canAccess
  // -------------------------------------------------------------------------
  describe('fail-closed canAccess', () => {
    it('returns allow when provider resolves allow and session exists', async () => {
      const provider: AuthProvider = {
        ...makeBearerProvider('tok'),
        canAccess: vi.fn().mockResolvedValue('allow'),
      };
      const app = createHAI3().use(auth({ provider })).build();

      const decision = await app.auth!.canAccess({ action: 'read', resource: 'doc' });

      expect(decision).toBe('allow');
      app.destroy();
    });

    it('returns deny when provider has no canAccess', async () => {
      const provider = makeBearerProvider('tok'); // no canAccess
      const app = createHAI3().use(auth({ provider })).build();

      const decision = await app.auth!.canAccess({ action: 'read', resource: 'doc' });

      expect(decision).toBe('deny');
      app.destroy();
    });

    it('returns deny when session is null', async () => {
      const provider: AuthProvider = {
        ...makeNullSessionProvider(),
        canAccess: vi.fn().mockResolvedValue('allow'),
      };
      const app = createHAI3().use(auth({ provider })).build();

      const decision = await app.auth!.canAccess({ action: 'read', resource: 'doc' });

      expect(decision).toBe('deny');
      expect(provider.canAccess).not.toHaveBeenCalled();
      app.destroy();
    });

    it('returns deny when getSession throws', async () => {
      const provider: AuthProvider = {
        ...makeBearerProvider('tok'),
        getSession: vi.fn().mockRejectedValue(new Error('session error')),
        canAccess: vi.fn().mockResolvedValue('allow'),
      };
      const app = createHAI3().use(auth({ provider })).build();

      const decision = await app.auth!.canAccess({ action: 'read', resource: 'doc' });

      expect(decision).toBe('deny');
      expect(provider.canAccess).not.toHaveBeenCalled();
      app.destroy();
    });

    it('returns deny when provider.canAccess throws', async () => {
      const provider: AuthProvider = {
        ...makeBearerProvider('tok'),
        canAccess: vi.fn().mockRejectedValue(new Error('pdp error')),
      };
      const app = createHAI3().use(auth({ provider })).build();

      const decision = await app.auth!.canAccess({ action: 'read', resource: 'doc' });

      expect(decision).toBe('deny');
      app.destroy();
    });

    it('returns deny when provider.canAccess resolves malformed decision', async () => {
      const provider: AuthProvider = {
        ...makeBearerProvider('tok'),
        canAccess: vi.fn().mockResolvedValue('maybe' as unknown as 'allow' | 'deny'),
      };
      const app = createHAI3().use(auth({ provider })).build();

      const decision = await app.auth!.canAccess({ action: 'read', resource: 'doc' });

      expect(decision).toBe('deny');
      app.destroy();
    });

    it('returns deny for malformed query (missing action)', async () => {
      const provider: AuthProvider = {
        ...makeBearerProvider('tok'),
        canAccess: vi.fn().mockResolvedValue('allow'),
      };
      const app = createHAI3().use(auth({ provider })).build();

      const decision = await app.auth!.canAccess({ action: '', resource: 'doc' });

      expect(decision).toBe('deny');
      expect(provider.canAccess).not.toHaveBeenCalled();
      app.destroy();
    });

    it('returns deny for malformed query (missing resource)', async () => {
      const provider: AuthProvider = {
        ...makeBearerProvider('tok'),
        canAccess: vi.fn().mockResolvedValue('allow'),
      };
      const app = createHAI3().use(auth({ provider })).build();

      const decision = await app.auth!.canAccess({ action: 'read', resource: '' });

      expect(decision).toBe('deny');
      expect(provider.canAccess).not.toHaveBeenCalled();
      app.destroy();
    });

    it('does not throw when provider.canAccess rejects', async () => {
      const provider: AuthProvider = {
        ...makeBearerProvider('tok'),
        canAccess: vi.fn().mockRejectedValue(new Error('unexpected')),
      };
      const app = createHAI3().use(auth({ provider })).build();

      await expect(app.auth!.canAccess({ action: 'read', resource: 'doc' })).resolves.toBe('deny');
      app.destroy();
    });
  });

  // -------------------------------------------------------------------------
  // 17. Fail-closed evaluateAccess
  // -------------------------------------------------------------------------
  describe('fail-closed evaluateAccess', () => {
    it('returns allow evaluation when provider resolves allow and session exists', async () => {
      const provider: AuthProvider = {
        ...makeBearerProvider('tok'),
        evaluateAccess: vi.fn().mockResolvedValue({ decision: 'allow', reason: 'allowed' }),
      };
      const app = createHAI3().use(auth({ provider })).build();

      const result = await app.auth!.evaluateAccess({ action: 'read', resource: 'doc' });

      expect(result.decision).toBe('allow');
      app.destroy();
    });

    it('returns deny+unsupported when provider lacks evaluateAccess', async () => {
      const provider = makeBearerProvider('tok'); // no evaluateAccess
      const app = createHAI3().use(auth({ provider })).build();

      const result = await app.auth!.evaluateAccess({ action: 'read', resource: 'doc' });

      expect(result.decision).toBe('deny');
      expect(result.reason).toBe('unsupported');
      app.destroy();
    });

    it('returns deny+unauthenticated when session is null', async () => {
      const provider: AuthProvider = {
        ...makeNullSessionProvider(),
        evaluateAccess: vi.fn().mockResolvedValue({ decision: 'allow' }),
      };
      const app = createHAI3().use(auth({ provider })).build();

      const result = await app.auth!.evaluateAccess({ action: 'read', resource: 'doc' });

      expect(result.decision).toBe('deny');
      expect(result.reason).toBe('unauthenticated');
      expect(provider.evaluateAccess).not.toHaveBeenCalled();
      app.destroy();
    });

    it('returns deny+unauthenticated when getSession throws', async () => {
      const provider: AuthProvider = {
        ...makeBearerProvider('tok'),
        getSession: vi.fn().mockRejectedValue(new Error('session error')),
        evaluateAccess: vi.fn().mockResolvedValue({ decision: 'allow' }),
      };
      const app = createHAI3().use(auth({ provider })).build();

      const result = await app.auth!.evaluateAccess({ action: 'read', resource: 'doc' });

      expect(result.decision).toBe('deny');
      expect(result.reason).toBe('unauthenticated');
      app.destroy();
    });

    it('returns deny+provider_error when provider.evaluateAccess throws', async () => {
      const provider: AuthProvider = {
        ...makeBearerProvider('tok'),
        evaluateAccess: vi.fn().mockRejectedValue(new Error('pdp error')),
      };
      const app = createHAI3().use(auth({ provider })).build();

      const result = await app.auth!.evaluateAccess({ action: 'read', resource: 'doc' });

      expect(result.decision).toBe('deny');
      expect(result.reason).toBe('provider_error');
      app.destroy();
    });

    it('returns deny+provider_error when provider.evaluateAccess resolves malformed payload', async () => {
      const provider: AuthProvider = {
        ...makeBearerProvider('tok'),
        evaluateAccess: vi.fn().mockResolvedValue({} as unknown as { decision: 'allow' | 'deny' }),
      };
      const app = createHAI3().use(auth({ provider })).build();

      const result = await app.auth!.evaluateAccess({ action: 'read', resource: 'doc' });

      expect(result.decision).toBe('deny');
      expect(result.reason).toBe('provider_error');
      app.destroy();
    });

    it('returns deny+provider_error when provider.evaluateAccess resolves malformed constraints', async () => {
      const provider: AuthProvider = {
        ...makeBearerProvider('tok'),
        evaluateAccess: vi.fn().mockResolvedValue({
          decision: 'allow',
          constraints: { field: 'tenantId', op: 'eq', value: 'acme' },
        } as unknown as AccessEvaluation),
      };
      const app = createHAI3().use(auth({ provider })).build();

      const result = await app.auth!.evaluateAccess({ action: 'read', resource: 'doc' });

      expect(result).toEqual({ decision: 'deny', reason: 'provider_error' });
      app.destroy();
    });

    it('returns deny+provider_error when provider.evaluateAccess resolves malformed reason shape', async () => {
      const provider: AuthProvider = {
        ...makeBearerProvider('tok'),
        evaluateAccess: vi.fn().mockResolvedValue({
          decision: 'allow',
          reason: { code: 'wrong_reason' },
        } as unknown as AccessEvaluation),
      };
      const app = createHAI3().use(auth({ provider })).build();

      const result = await app.auth!.evaluateAccess({ action: 'read', resource: 'doc' });

      expect(result).toEqual({ decision: 'deny', reason: 'provider_error' });
      app.destroy();
    });

    it('returns deny+provider_error when provider.evaluateAccess resolves malformed meta shape', async () => {
      const provider: AuthProvider = {
        ...makeBearerProvider('tok'),
        evaluateAccess: vi.fn().mockResolvedValue({
          decision: 'allow',
          meta: ['policy-meta'],
        } as unknown as AccessEvaluation),
      };
      const app = createHAI3().use(auth({ provider })).build();

      const result = await app.auth!.evaluateAccess({ action: 'read', resource: 'doc' });

      expect(result).toEqual({ decision: 'deny', reason: 'provider_error' });
      app.destroy();
    });

    it('passes through provider-defined reason and nested constraints/meta payloads', async () => {
      const provider: AuthProvider = {
        ...makeBearerProvider('tok'),
        evaluateAccess: vi.fn().mockResolvedValue({
          decision: 'deny',
          reason: 'tenant_scope_conflict',
          constraints: [
            {
              predicate: {
                field: 'tenant.id',
                op: 'custom_eq',
                value: 'tenant-1',
              },
            },
          ],
          meta: {
            source: 'pdp',
            audit: {
              policyId: 'p-1',
            },
          },
        } as AccessEvaluation),
      };
      const app = createHAI3().use(auth({ provider })).build();

      await expect(
        app.auth!.evaluateAccess({ action: 'read', resource: 'doc' }),
      ).resolves.toEqual({
        decision: 'deny',
        reason: 'tenant_scope_conflict',
        constraints: [
          {
            predicate: {
              field: 'tenant.id',
              op: 'custom_eq',
              value: 'tenant-1',
            },
          },
        ],
        meta: {
          source: 'pdp',
          audit: {
            policyId: 'p-1',
          },
        },
      });
      app.destroy();
    });

    it('returns deny+malformed for missing action', async () => {
      const provider: AuthProvider = {
        ...makeBearerProvider('tok'),
        evaluateAccess: vi.fn().mockResolvedValue({ decision: 'allow' }),
      };
      const app = createHAI3().use(auth({ provider })).build();

      const result = await app.auth!.evaluateAccess({ action: '', resource: 'doc' });

      expect(result.decision).toBe('deny');
      expect(result.reason).toBe('malformed');
      expect(provider.evaluateAccess).not.toHaveBeenCalled();
      app.destroy();
    });

    it('returns deny+aborted when signal is aborted on provider throw', async () => {
      const controller = new AbortController();
      const provider: AuthProvider = {
        ...makeBearerProvider('tok'),
        evaluateAccess: vi.fn().mockImplementation(() => {
          controller.abort();
          return Promise.reject(new Error('aborted'));
        }),
      };
      const app = createHAI3().use(auth({ provider })).build();

      const result = await app.auth!.evaluateAccess(
        { action: 'read', resource: 'doc' },
        { signal: controller.signal },
      );

      expect(result.decision).toBe('deny');
      expect(result.reason).toBe('aborted');
      app.destroy();
    });

    it('returns deny+timeout when signal is aborted with TimeoutError', async () => {
      const controller = new AbortController();
      const timeoutErr = Object.assign(new Error('Timeout'), { name: 'TimeoutError' });
      const provider: AuthProvider = {
        ...makeBearerProvider('tok'),
        evaluateAccess: vi.fn().mockImplementation(() => {
          controller.abort(timeoutErr);
          return Promise.reject(timeoutErr);
        }),
      };
      const app = createHAI3().use(auth({ provider })).build();

      const result = await app.auth!.evaluateAccess(
        { action: 'read', resource: 'doc' },
        { signal: controller.signal },
      );

      expect(result.decision).toBe('deny');
      expect(result.reason).toBe('timeout');
      app.destroy();
    });

    it('does not throw from evaluateAccess in any error path', async () => {
      const provider: AuthProvider = {
        ...makeBearerProvider('tok'),
        evaluateAccess: vi.fn().mockRejectedValue(new Error('unexpected')),
      };
      const app = createHAI3().use(auth({ provider })).build();

      await expect(
        app.auth!.evaluateAccess({ action: 'read', resource: 'doc' }),
      ).resolves.toMatchObject({ decision: 'deny' });
      app.destroy();
    });
  });

  // -------------------------------------------------------------------------
  // 18. Fail-closed canAccessMany
  // -------------------------------------------------------------------------
  describe('fail-closed canAccessMany', () => {
    const queries = [
      { action: 'read', resource: 'doc' },
      { action: 'write', resource: 'doc' },
    ];

    it('returns empty array for empty input', async () => {
      const provider = makeBearerProvider('tok');
      const app = createHAI3().use(auth({ provider })).build();

      const results = await app.auth!.canAccessMany([]);

      expect(results).toHaveLength(0);
      app.destroy();
    });

    it('returns all deny when provider lacks canAccess and canAccessMany', async () => {
      const provider = makeBearerProvider('tok'); // no access methods
      const app = createHAI3().use(auth({ provider })).build();

      const results = await app.auth!.canAccessMany(queries);

      expect(results).toEqual(['deny', 'deny']);
      app.destroy();
    });

    it('preserves order: fallback delegates to safeCanAccess per query', async () => {
      const canAccessFn = vi.fn()
        .mockResolvedValueOnce('allow')
        .mockResolvedValueOnce('deny');
      const provider: AuthProvider = {
        ...makeBearerProvider('tok'),
        canAccess: canAccessFn,
      };
      const app = createHAI3().use(auth({ provider })).build();

      const results = await app.auth!.canAccessMany(queries);

      expect(results).toEqual(['allow', 'deny']);
      expect(canAccessFn).toHaveBeenCalledTimes(2);
      app.destroy();
    });

    it('delegates to provider.canAccessMany when available', async () => {
      const canAccessManyFn = vi.fn().mockResolvedValue(['allow', 'deny']);
      const provider: AuthProvider = {
        ...makeBearerProvider('tok'),
        canAccessMany: canAccessManyFn,
      };
      const app = createHAI3().use(auth({ provider })).build();

      const results = await app.auth!.canAccessMany(queries);

      expect(results).toEqual(['allow', 'deny']);
      expect(canAccessManyFn).toHaveBeenCalledTimes(1);
      app.destroy();
    });

    it('routes malformed entries through per-query safe path before provider.canAccessMany', async () => {
      // Even if a provider would otherwise grant 'allow', a missing action/resource
      // must fail closed without delegating that entry to the bulk method.
      const canAccessManyFn = vi.fn().mockResolvedValue(['allow', 'allow']);
      const canAccessFn = vi.fn().mockResolvedValue('allow');
      const provider: AuthProvider = {
        ...makeBearerProvider('tok'),
        canAccess: canAccessFn,
        canAccessMany: canAccessManyFn,
      };
      const app = createHAI3().use(auth({ provider })).build();

      const malformed = [{ action: '', resource: 'doc' }, { action: 'read', resource: 'doc' }];
      const results = await app.auth!.canAccessMany(malformed);

      expect(results).toEqual(['deny', 'allow']);
      expect(canAccessManyFn).not.toHaveBeenCalled();
      app.destroy();
    });

    it('returns all deny when provider.canAccessMany throws', async () => {
      const provider: AuthProvider = {
        ...makeBearerProvider('tok'),
        canAccessMany: vi.fn().mockRejectedValue(new Error('batch error')),
      };
      const app = createHAI3().use(auth({ provider })).build();

      const results = await app.auth!.canAccessMany(queries);

      expect(results).toEqual(['deny', 'deny']);
      app.destroy();
    });

    it('returns all deny when provider.canAccessMany returns wrong result length', async () => {
      const provider: AuthProvider = {
        ...makeBearerProvider('tok'),
        canAccessMany: vi.fn().mockResolvedValue(['allow']),
      };
      const app = createHAI3().use(auth({ provider })).build();

      const results = await app.auth!.canAccessMany(queries);

      expect(results).toEqual(['deny', 'deny']);
      app.destroy();
    });

    it('normalizes malformed decisions from provider.canAccessMany to deny', async () => {
      const provider: AuthProvider = {
        ...makeBearerProvider('tok'),
        canAccessMany: vi.fn().mockResolvedValue([
          'allow',
          'maybe' as unknown as 'allow' | 'deny',
        ]),
      };
      const app = createHAI3().use(auth({ provider })).build();

      const results = await app.auth!.canAccessMany(queries);

      expect(results).toEqual(['allow', 'deny']);
      app.destroy();
    });

    it('returns all deny when session is null and provider has canAccessMany', async () => {
      const provider: AuthProvider = {
        ...makeNullSessionProvider(),
        canAccessMany: vi.fn().mockResolvedValue(['allow', 'allow']),
      };
      const app = createHAI3().use(auth({ provider })).build();

      const results = await app.auth!.canAccessMany(queries);

      expect(results).toEqual(['deny', 'deny']);
      expect(provider.canAccessMany).not.toHaveBeenCalled();
      app.destroy();
    });
  });

  // -------------------------------------------------------------------------
  // 19. Fail-closed evaluateMany
  // -------------------------------------------------------------------------
  describe('fail-closed evaluateMany', () => {
    const queries = [
      { action: 'read', resource: 'doc' },
      { action: 'write', resource: 'doc' },
    ];

    it('returns empty array for empty input', async () => {
      const provider = makeBearerProvider('tok');
      const app = createHAI3().use(auth({ provider })).build();

      const results = await app.auth!.evaluateMany([]);

      expect(results).toHaveLength(0);
      app.destroy();
    });

    it('returns all deny+unsupported when provider lacks evaluateAccess and evaluateMany', async () => {
      const provider = makeBearerProvider('tok'); // no evaluate methods
      const app = createHAI3().use(auth({ provider })).build();

      const results = await app.auth!.evaluateMany(queries);

      expect(results).toHaveLength(2);
      expect(results[0]).toMatchObject({ decision: 'deny', reason: 'unsupported' });
      expect(results[1]).toMatchObject({ decision: 'deny', reason: 'unsupported' });
      app.destroy();
    });

    it('delegates to provider.evaluateMany when available', async () => {
      const evalManyFn = vi.fn().mockResolvedValue([
        { decision: 'allow', reason: 'allowed' },
        { decision: 'deny', reason: 'denied' },
      ]);
      const provider: AuthProvider = {
        ...makeBearerProvider('tok'),
        evaluateMany: evalManyFn,
      };
      const app = createHAI3().use(auth({ provider })).build();

      const results = await app.auth!.evaluateMany(queries);

      expect(results[0].decision).toBe('allow');
      expect(results[1].decision).toBe('deny');
      expect(evalManyFn).toHaveBeenCalledTimes(1);
      app.destroy();
    });

    it('routes malformed entries through per-query safe path before provider.evaluateMany', async () => {
      // Mirrors the canAccessMany guarantee: a missing action/resource forces
      // the whole batch through safeEvaluateAccess, never the bulk method.
      const evalManyFn = vi.fn().mockResolvedValue([
        { decision: 'allow', reason: 'allowed' },
        { decision: 'allow', reason: 'allowed' },
      ]);
      const evalAccessFn = vi.fn().mockResolvedValue({ decision: 'allow', reason: 'allowed' });
      const provider: AuthProvider = {
        ...makeBearerProvider('tok'),
        evaluateAccess: evalAccessFn,
        evaluateMany: evalManyFn,
      };
      const app = createHAI3().use(auth({ provider })).build();

      const malformed = [{ action: 'read', resource: '' }, { action: 'read', resource: 'doc' }];
      const results = await app.auth!.evaluateMany(malformed);

      expect(results[0]).toEqual({ decision: 'deny', reason: 'malformed' });
      expect(results[1].decision).toBe('allow');
      expect(evalManyFn).not.toHaveBeenCalled();
      app.destroy();
    });

    it('fallback: preserves order via safeEvaluateAccess', async () => {
      const evaluateAccessFn = vi.fn()
        .mockResolvedValueOnce({ decision: 'allow', reason: 'allowed' })
        .mockResolvedValueOnce({ decision: 'deny', reason: 'denied' });
      const provider: AuthProvider = {
        ...makeBearerProvider('tok'),
        evaluateAccess: evaluateAccessFn,
      };
      const app = createHAI3().use(auth({ provider })).build();

      const results = await app.auth!.evaluateMany(queries);

      expect(results[0].decision).toBe('allow');
      expect(results[1].decision).toBe('deny');
      expect(evaluateAccessFn).toHaveBeenCalledTimes(2);
      app.destroy();
    });

    it('returns all deny+unauthenticated when session is null and provider has evaluateMany', async () => {
      const provider: AuthProvider = {
        ...makeNullSessionProvider(),
        evaluateMany: vi.fn().mockResolvedValue([{ decision: 'allow' }, { decision: 'allow' }]),
      };
      const app = createHAI3().use(auth({ provider })).build();

      const results = await app.auth!.evaluateMany(queries);

      expect(results).toHaveLength(2);
      expect(results[0]).toMatchObject({ decision: 'deny', reason: 'unauthenticated' });
      expect(results[1]).toMatchObject({ decision: 'deny', reason: 'unauthenticated' });
      expect(provider.evaluateMany).not.toHaveBeenCalled();
      app.destroy();
    });

    it('returns all deny+provider_error when provider.evaluateMany throws', async () => {
      const provider: AuthProvider = {
        ...makeBearerProvider('tok'),
        evaluateMany: vi.fn().mockRejectedValue(new Error('batch error')),
      };
      const app = createHAI3().use(auth({ provider })).build();

      const results = await app.auth!.evaluateMany(queries);

      expect(results).toHaveLength(2);
      expect(results[0]).toMatchObject({ decision: 'deny', reason: 'provider_error' });
      expect(results[1]).toMatchObject({ decision: 'deny', reason: 'provider_error' });
      app.destroy();
    });

    it('returns all deny+provider_error when provider.evaluateMany returns wrong result length', async () => {
      const provider: AuthProvider = {
        ...makeBearerProvider('tok'),
        evaluateMany: vi.fn().mockResolvedValue([{ decision: 'allow' }]),
      };
      const app = createHAI3().use(auth({ provider })).build();

      const results = await app.auth!.evaluateMany(queries);

      expect(results).toHaveLength(2);
      expect(results[0]).toMatchObject({ decision: 'deny', reason: 'provider_error' });
      expect(results[1]).toMatchObject({ decision: 'deny', reason: 'provider_error' });
      app.destroy();
    });

    it('normalizes malformed entries from provider.evaluateMany to deny+provider_error', async () => {
      const provider: AuthProvider = {
        ...makeBearerProvider('tok'),
        evaluateMany: vi.fn().mockResolvedValue([
          { decision: 'allow', reason: 'allowed' },
          {} as unknown as { decision: 'allow' | 'deny' },
        ]),
      };
      const app = createHAI3().use(auth({ provider })).build();

      const results = await app.auth!.evaluateMany(queries);

      expect(results[0]).toMatchObject({ decision: 'allow', reason: 'allowed' });
      expect(results[1]).toMatchObject({ decision: 'deny', reason: 'provider_error' });
      app.destroy();
    });

    it('normalizes malformed constraints while preserving provider-defined reason/meta entries', async () => {
      const malformedQueries = [
        { action: 'read', resource: 'doc' },
        { action: 'update', resource: 'doc' },
        { action: 'delete', resource: 'doc' },
        { action: 'list', resource: 'doc' },
      ];

      const provider: AuthProvider = {
        ...makeBearerProvider('tok'),
        evaluateMany: vi.fn().mockResolvedValue([
          { decision: 'allow', reason: 'allowed' },
          { decision: 'allow', constraints: { field: 'tenantId', op: 'eq', value: 'acme' } },
          { decision: 'deny', reason: 'unknown_reason' },
          { decision: 'allow', meta: { source: 'scope', nested: { id: 'p-1' } } },
        ] as ReadonlyArray<AccessEvaluation>),
      };
      const app = createHAI3().use(auth({ provider })).build();

      const results = await app.auth!.evaluateMany(malformedQueries);

      expect(results).toEqual([
        { decision: 'allow', reason: 'allowed' },
        { decision: 'deny', reason: 'provider_error' },
        { decision: 'deny', reason: 'unknown_reason' },
        { decision: 'allow', meta: { source: 'scope', nested: { id: 'p-1' } } },
      ]);
      app.destroy();
    });
  });
});
