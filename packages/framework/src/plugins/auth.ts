// @cpt-FEATURE:cpt-frontx-feature-auth-plugin:p1
// @cpt-begin:cpt-frontx-dod-auth-plugin:p1:inst-module
// @cpt-begin:cpt-frontx-state-auth-plugin-refresh:p1:inst-module
import type {
  AuthCallbackInput,
  AuthCheckResult,
  AuthContext,
  AccessConstraint,
  AccessDecision,
  AccessEvaluation,
  AccessQuery,
  AccessReason,
  AccessRecord,
  AuthCapabilitiesResolved,
  AuthIdentity,
  AuthLoginInput,
  AuthPermissions,
  AuthProvider,
  AuthSession,
  AuthTransportRequest,
  AuthStateListener,
  AuthUnsubscribe,
  AuthTransition,
} from '@cyberfabric/auth';
import {
  RestPlugin,
  RestProtocol,
  type ApiPluginErrorContext,
  type RestRequestContext,
  type RestResponseContext,
} from '@cyberfabric/api';
import type { HAI3Plugin } from '../types';

export type AuthRuntime = {
  provider: AuthProvider;
  /** Resolved capability flags built by method-presence probe at provider-attach time. */
  capabilities: AuthCapabilitiesResolved;
  getSession: (ctx?: AuthContext) => Promise<AuthSession | null>;
  checkAuth: (ctx?: AuthContext) => Promise<AuthCheckResult>;
  logout: (ctx?: AuthContext) => Promise<AuthTransition>;
  login?: (input: AuthLoginInput, ctx?: AuthContext) => Promise<AuthTransition>;
  handleCallback?: (input: AuthCallbackInput, ctx?: AuthContext) => Promise<AuthTransition>;
  refresh?: (ctx?: AuthContext) => Promise<AuthSession | null>;
  getIdentity?: (ctx?: AuthContext) => Promise<AuthIdentity | null>;
  getPermissions?: (ctx?: AuthContext) => Promise<AuthPermissions>;
  /** Fail-closed: always resolves to 'allow' | 'deny'. Never throws. */
  canAccess: <TRecord extends AccessRecord = AccessRecord>(
    query: AccessQuery<TRecord>,
    ctx?: AuthContext,
  ) => Promise<AccessDecision>;
  /** Fail-closed: always resolves to ReadonlyArray<AccessDecision>. Never throws. Order preserved. */
  canAccessMany: (
    queries: ReadonlyArray<AccessQuery>,
    ctx?: AuthContext,
  ) => Promise<ReadonlyArray<AccessDecision>>;
  /** Fail-closed: always resolves to AccessEvaluation with deny+reason on any error path. Never throws. */
  evaluateAccess: <TRecord extends AccessRecord = AccessRecord>(
    query: AccessQuery<TRecord>,
    ctx?: AuthContext,
  ) => Promise<AccessEvaluation>;
  /** Fail-closed: always resolves to ReadonlyArray<AccessEvaluation>. Never throws. Order preserved. */
  evaluateMany: (
    queries: ReadonlyArray<AccessQuery>,
    ctx?: AuthContext,
  ) => Promise<ReadonlyArray<AccessEvaluation>>;
  subscribe?: (listener: AuthStateListener) => AuthUnsubscribe;
};

export type AuthTransportBinding = {
  destroy: () => void;
};

export type AuthTransportBinder = (args: {
  provider: AuthProvider;
  csrfHeaderName?: string;
  allowedCookieOrigins?: string[];
  addRestPlugin: (plugin: RestPlugin) => void;
  removeRestPlugin: (pluginClass: new (...args: never[]) => RestPlugin) => void;
}) => AuthTransportBinding;

export type Hai3ApiAuthTransportConfig = {
  allowedCookieOrigins?: string[];
  csrfHeaderName?: string;
};

export type AuthPluginConfig = {
  provider: AuthProvider;
  /**
   * Optional transport binder.
   * If omitted, the default `hai3ApiTransport()` binding is used.
   */
  transport?: AuthTransportBinder;
  /**
   * Configuration for the default @cyberfabric/api binding.
   * Ignored when `transport` is provided.
   */
  hai3Api?: Hai3ApiAuthTransportConfig;
};

// ---------------------------------------------------------------------------
// Capability probe
// ---------------------------------------------------------------------------

function buildCapabilities(provider: AuthProvider): AuthCapabilitiesResolved {
  return {
    hasGetIdentity: typeof provider.getIdentity === 'function',
    hasGetPermissions: typeof provider.getPermissions === 'function',
    hasCanAccess: typeof provider.canAccess === 'function',
    hasCanAccessMany: typeof provider.canAccessMany === 'function',
    hasEvaluateAccess: typeof provider.evaluateAccess === 'function',
    hasEvaluateMany: typeof provider.evaluateMany === 'function',
    hasRefresh: typeof provider.refresh === 'function',
    hasSubscribe: typeof provider.subscribe === 'function',
  };
}

// ---------------------------------------------------------------------------
// Fail-closed access wrappers
// ---------------------------------------------------------------------------

function classifyAbortReason(signal: AbortSignal): AccessReason {
  const reason = signal.reason;
  if (reason instanceof Error && reason.name === 'TimeoutError') return 'timeout';
  return 'aborted';
}

function isAccessDecision(value: unknown): value is AccessDecision {
  return value === 'allow' || value === 'deny';
}

function normalizeDecision(value: unknown): AccessDecision {
  return value === 'allow' ? 'allow' : 'deny';
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isAccessReason(value: unknown): value is AccessReason {
  return typeof value === 'string';
}

function isAccessJsonValue(value: unknown, seen: WeakSet<object> = new WeakSet()): boolean {
  if (
    value === null
    || typeof value === 'string'
    || typeof value === 'number'
    || typeof value === 'boolean'
  ) {
    return true;
  }

  if (Array.isArray(value)) {
    if (seen.has(value)) return false;
    seen.add(value);
    return value.every((entry) => isAccessJsonValue(entry, seen));
  }

  if (isPlainObject(value)) {
    if (seen.has(value)) return false;
    seen.add(value);
    return Object.values(value).every((entry) => isAccessJsonValue(entry, seen));
  }

  return false;
}

function isAccessConstraint(value: unknown): value is AccessConstraint {
  return isPlainObject(value)
    && Object.values(value).every((entry) => isAccessJsonValue(entry));
}

function isAccessConstraints(value: unknown): value is ReadonlyArray<AccessConstraint> {
  return Array.isArray(value) && value.every((entry) => isAccessConstraint(entry));
}

function isAccessMeta(value: unknown): value is NonNullable<AccessEvaluation['meta']> {
  return isPlainObject(value)
    && Object.values(value).every((entry) => isAccessJsonValue(entry));
}

function normalizeEvaluation(value: unknown): AccessEvaluation {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { decision: 'deny', reason: 'provider_error' };
  }

  const maybeEvaluation = value as {
    decision?: unknown;
    constraints?: unknown;
    reason?: unknown;
    meta?: unknown;
  };
  if (!isAccessDecision(maybeEvaluation.decision)) {
    return { decision: 'deny', reason: 'provider_error' };
  }

  if (maybeEvaluation.constraints !== undefined && !isAccessConstraints(maybeEvaluation.constraints)) {
    return { decision: 'deny', reason: 'provider_error' };
  }

  if (maybeEvaluation.reason !== undefined && !isAccessReason(maybeEvaluation.reason)) {
    return { decision: 'deny', reason: 'provider_error' };
  }

  if (maybeEvaluation.meta !== undefined && !isAccessMeta(maybeEvaluation.meta)) {
    return { decision: 'deny', reason: 'provider_error' };
  }

  const normalized: AccessEvaluation = { decision: maybeEvaluation.decision };
  if (maybeEvaluation.constraints !== undefined) {
    normalized.constraints = maybeEvaluation.constraints;
  }
  if (maybeEvaluation.reason !== undefined) {
    normalized.reason = maybeEvaluation.reason;
  }
  if (maybeEvaluation.meta !== undefined) {
    normalized.meta = maybeEvaluation.meta;
  }
  return normalized;
}

async function safeCanAccess(
  provider: AuthProvider,
  caps: AuthCapabilitiesResolved,
  query: AccessQuery,
  ctx?: AuthContext,
): Promise<AccessDecision> {
  if (!query.action || !query.resource) return 'deny';
  if (!caps.hasCanAccess) return 'deny';

  let session: AuthSession | null;
  try {
    session = await provider.getSession(ctx);
  } catch {
    return 'deny';
  }
  if (session === null) return 'deny';

  try {
    return normalizeDecision(await provider.canAccess!(query, ctx));
  } catch {
    return 'deny';
  }
}

async function safeEvaluateAccess(
  provider: AuthProvider,
  caps: AuthCapabilitiesResolved,
  query: AccessQuery,
  ctx?: AuthContext,
): Promise<AccessEvaluation> {
  if (!query.action || !query.resource) {
    return { decision: 'deny', reason: 'malformed' };
  }
  if (!caps.hasEvaluateAccess) {
    return { decision: 'deny', reason: 'unsupported' };
  }

  let session: AuthSession | null;
  try {
    session = await provider.getSession(ctx);
  } catch {
    return { decision: 'deny', reason: 'unauthenticated' };
  }
  if (session === null) {
    return { decision: 'deny', reason: 'unauthenticated' };
  }

  try {
    return normalizeEvaluation(await provider.evaluateAccess!(query, ctx));
  } catch {
    const signal = ctx?.signal;
    if (signal?.aborted) {
      return { decision: 'deny', reason: classifyAbortReason(signal) };
    }
    return { decision: 'deny', reason: 'provider_error' };
  }
}

async function safeCanAccessMany(
  provider: AuthProvider,
  caps: AuthCapabilitiesResolved,
  queries: ReadonlyArray<AccessQuery>,
  ctx?: AuthContext,
): Promise<ReadonlyArray<AccessDecision>> {
  if (queries.length === 0) return [];

  if (caps.hasCanAccessMany) {
    let session: AuthSession | null;
    try {
      session = await provider.getSession(ctx);
    } catch {
      return queries.map(() => 'deny' as const);
    }
    if (session === null) return queries.map(() => 'deny' as const);

    try {
      const decisions = await provider.canAccessMany!(queries, ctx);
      if (!Array.isArray(decisions) || decisions.length !== queries.length) {
        return queries.map(() => 'deny' as const);
      }
      return decisions.map((decision) => normalizeDecision(decision));
    } catch {
      return queries.map(() => 'deny' as const);
    }
  }

  const results: AccessDecision[] = [];
  for (const query of queries) {
    results.push(await safeCanAccess(provider, caps, query, ctx));
  }
  return results;
}

async function safeEvaluateMany(
  provider: AuthProvider,
  caps: AuthCapabilitiesResolved,
  queries: ReadonlyArray<AccessQuery>,
  ctx?: AuthContext,
): Promise<ReadonlyArray<AccessEvaluation>> {
  if (queries.length === 0) return [];

  if (caps.hasEvaluateMany) {
    let session: AuthSession | null;
    try {
      session = await provider.getSession(ctx);
    } catch {
      return queries.map(() => ({ decision: 'deny' as const, reason: 'unauthenticated' as const }));
    }
    if (session === null) {
      return queries.map(() => ({ decision: 'deny' as const, reason: 'unauthenticated' as const }));
    }

    try {
      const evaluations = await provider.evaluateMany!(queries, ctx);
      if (!Array.isArray(evaluations) || evaluations.length !== queries.length) {
        return queries.map(() => ({ decision: 'deny' as const, reason: 'provider_error' as const }));
      }
      return evaluations.map((evaluation) => normalizeEvaluation(evaluation));
    } catch {
      const signal = ctx?.signal;
      if (signal?.aborted) {
        const reason = classifyAbortReason(signal);
        return queries.map(() => ({ decision: 'deny' as const, reason }));
      }
      return queries.map(() => ({ decision: 'deny' as const, reason: 'provider_error' as const }));
    }
  }

  const results: AccessEvaluation[] = [];
  for (const query of queries) {
    results.push(await safeEvaluateAccess(provider, caps, query, ctx));
  }
  return results;
}

// ---------------------------------------------------------------------------
// REST transport helpers
// ---------------------------------------------------------------------------

function isSupportedAuthTransportMethod(
  method: RestRequestContext['method']
): method is AuthTransportRequest['method'] {
  // @cpt-begin:cpt-frontx-algo-auth-plugin-transport-request:p1:inst-method-guard
  return method === 'GET'
    || method === 'POST'
    || method === 'PUT'
    || method === 'DELETE'
    || method === 'PATCH'
    || method === 'HEAD'
    || method === 'OPTIONS';
  // @cpt-end:cpt-frontx-algo-auth-plugin-transport-request:p1:inst-method-guard
}

function toAuthTransportRequest(request: RestRequestContext): AuthTransportRequest | null {
  if (!isSupportedAuthTransportMethod(request.method)) return null;

  // @cpt-begin:cpt-frontx-algo-auth-plugin-transport-request:p1:inst-body-serialize
  let body: string | undefined;
  if (typeof request.body === 'string') {
    body = request.body;
  } else if (request.body !== undefined) {
    try {
      body = JSON.stringify(request.body);
    } catch {
      body = undefined;
    }
  }
  // @cpt-end:cpt-frontx-algo-auth-plugin-transport-request:p1:inst-body-serialize

  // @cpt-begin:cpt-frontx-algo-auth-plugin-transport-request:p1:inst-request-shape
  return {
    url: request.url,
    method: request.method,
    headers: request.headers,
    body,
    signal: request.signal,
  };
  // @cpt-end:cpt-frontx-algo-auth-plugin-transport-request:p1:inst-request-shape
}

function isRelativeUrl(url: string): boolean {
  // @cpt-begin:cpt-frontx-algo-auth-plugin-credentials-scope:p1:inst-relative-url
  return url.startsWith('/') && !url.startsWith('//');
  // @cpt-end:cpt-frontx-algo-auth-plugin-credentials-scope:p1:inst-relative-url
}

function getOrigin(url: string): string | null {
  // @cpt-begin:cpt-frontx-algo-auth-plugin-credentials-scope:p1:inst-get-origin
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
  // @cpt-end:cpt-frontx-algo-auth-plugin-credentials-scope:p1:inst-get-origin
}

function getRuntimeOrigin(): string | null {
  // @cpt-begin:cpt-frontx-algo-auth-plugin-credentials-scope:p1:inst-runtime-origin
  const maybeLocation = (globalThis as { location?: { origin?: string } }).location;
  if (!maybeLocation?.origin || maybeLocation.origin === 'null') return null;
  return maybeLocation.origin;
  // @cpt-end:cpt-frontx-algo-auth-plugin-credentials-scope:p1:inst-runtime-origin
}

function shouldIncludeCredentials(url: string, allowedOrigins: readonly string[] | undefined): boolean {
  // @cpt-begin:cpt-frontx-algo-auth-plugin-credentials-scope:p1:inst-scope-check
  if (isRelativeUrl(url)) return true;

  const origin = getOrigin(url);
  if (!origin) return false;

  const runtimeOrigin = getRuntimeOrigin();
  if (runtimeOrigin && origin === runtimeOrigin) return true;

  if (!allowedOrigins || allowedOrigins.length === 0) return false;
  return allowedOrigins.includes(origin);
  // @cpt-end:cpt-frontx-algo-auth-plugin-credentials-scope:p1:inst-scope-check
}

class AuthRestPlugin extends RestPlugin {
  /** Shared in-flight refresh promise — deduplicates concurrent 401 refresh calls. */
  private refreshPromise: Promise<AuthSession | null> | null = null;

  constructor(private readonly config: AuthPluginConfig) {
    super();
  }

  async onRequest(ctx: RestRequestContext): Promise<RestRequestContext> {
    // @cpt-begin:cpt-frontx-flow-auth-plugin-session-attach:p1:inst-session-fetch
    const session = await this.config.provider.getSession({ signal: ctx.signal });
    if (!session) return ctx;
    // @cpt-end:cpt-frontx-flow-auth-plugin-session-attach:p1:inst-session-fetch

    // @cpt-begin:cpt-frontx-flow-auth-plugin-session-attach:p1:inst-cookie-credentials
    if (session.kind === 'cookie') {
      if (!shouldIncludeCredentials(ctx.url, this.config.hai3Api?.allowedCookieOrigins)) return ctx;

      const next: RestRequestContext = { ...ctx, withCredentials: true };
      const csrfHeaderName = this.config.hai3Api?.csrfHeaderName;
      if (csrfHeaderName && session.csrfToken) {
        return {
          ...next,
          headers: {
            ...next.headers,
            [csrfHeaderName]: session.csrfToken,
          },
        };
      }
      return next;
    }
    // @cpt-end:cpt-frontx-flow-auth-plugin-session-attach:p1:inst-cookie-credentials

    // @cpt-begin:cpt-frontx-flow-auth-plugin-session-attach:p1:inst-bearer-header
    if (session.kind === 'bearer' && session.token) {
      return {
        ...ctx,
        headers: {
          ...ctx.headers,
          Authorization: `Bearer ${session.token}`,
        },
      };
    }
    // @cpt-end:cpt-frontx-flow-auth-plugin-session-attach:p1:inst-bearer-header

    // @cpt-begin:cpt-frontx-flow-auth-plugin-session-attach:p1:inst-custom-passthrough
    // Custom sessions: no standard transport mechanism — use a custom transport binder for retry.
    return ctx;
    // @cpt-end:cpt-frontx-flow-auth-plugin-session-attach:p1:inst-custom-passthrough
  }

  async onError(ctx: ApiPluginErrorContext): Promise<Error | RestResponseContext> {
    // @cpt-begin:cpt-frontx-algo-auth-plugin-refresh-dedup:p1:inst-error-notify
    // Notify provider of every transport error (informational; called before retry decisions).
    const requestForHook = toAuthTransportRequest(ctx.request);
    if (requestForHook) {
      this.config.provider.onTransportError?.({
        request: requestForHook,
        error: ctx.error,
        status: ctx.response?.status,
      });
    }
    // @cpt-end:cpt-frontx-algo-auth-plugin-refresh-dedup:p1:inst-error-notify

    if (ctx.response?.status !== 401) return ctx.error;
    if (ctx.retryCount !== 0) return ctx.error;
    if (!this.config.provider.refresh) return ctx.error;

    // @cpt-begin:cpt-frontx-algo-auth-plugin-refresh-dedup:p1:inst-refresh-dedup
    // Dedup concurrent 401 refresh calls into a single in-flight promise.
    // NOTE: shared refresh must NOT be bound to any single request's AbortSignal —
    // otherwise aborting the first caller would cancel refresh for all concurrent
    // waiters on the same promise. Cancellation of the refresh call itself is the
    // provider's responsibility (timeout / internal lifecycle).
    if (!this.refreshPromise) {
      this.refreshPromise = this.config.provider
        .refresh()
        .finally(() => {
          this.refreshPromise = null;
        });
    }
    // @cpt-end:cpt-frontx-algo-auth-plugin-refresh-dedup:p1:inst-refresh-dedup

    // @cpt-begin:cpt-frontx-algo-auth-plugin-refresh-dedup:p1:inst-refresh-await
    let refreshed: AuthSession | null;
    try {
      refreshed = await this.refreshPromise;
    } catch {
      return ctx.error;
    }
    if (!refreshed) return ctx.error;
    // @cpt-end:cpt-frontx-algo-auth-plugin-refresh-dedup:p1:inst-refresh-await

    // @cpt-begin:cpt-frontx-flow-auth-plugin-refresh-retry:p1:inst-retry-bearer
    if (refreshed.kind === 'bearer') {
      if (!refreshed.token) return ctx.error;
      return ctx.retry({
        headers: { Authorization: `Bearer ${refreshed.token}` },
      });
    }
    // @cpt-end:cpt-frontx-flow-auth-plugin-refresh-retry:p1:inst-retry-bearer

    // @cpt-begin:cpt-frontx-flow-auth-plugin-refresh-retry:p1:inst-retry-cookie
    if (refreshed.kind === 'cookie') {
      // Cookie credentials are sent automatically via withCredentials.
      // No Authorization header override needed after refresh.
      return ctx.retry();
    }
    // @cpt-end:cpt-frontx-flow-auth-plugin-refresh-retry:p1:inst-retry-cookie

    // Custom sessions: no standard retry mechanism — use a custom transport binder.
    return ctx.error;
  }
}

// @cpt-begin:cpt-frontx-flow-auth-plugin-refresh-retry:p1:inst-plugin-factory
export function hai3ApiTransport(): AuthTransportBinder {
  return (args) => {
    const restPlugin = new AuthRestPlugin({
      provider: args.provider,
      hai3Api: {
        allowedCookieOrigins: args.allowedCookieOrigins,
        csrfHeaderName: args.csrfHeaderName,
      },
    });
    args.addRestPlugin(restPlugin);
    return {
      destroy: () => {
        args.removeRestPlugin(AuthRestPlugin);
      },
    };
  };
}
// @cpt-end:cpt-frontx-flow-auth-plugin-refresh-retry:p1:inst-plugin-factory

/**
 * Auth plugin.
 *
 * Wires a headless AuthProvider into @cyberfabric/api protocol plugins and exposes `app.auth`.
 *
 * **Scope:** REST transport only. SSE (Server-Sent Events) auth is out-of-scope for the
 * default `hai3ApiTransport()` binding. SSE connections requiring auth should use a custom
 * transport binder via the `transport` option.
 */
export function auth(config: AuthPluginConfig): HAI3Plugin {
  const transport = config.transport ?? hai3ApiTransport();
  let binding: AuthTransportBinding | null = null;
  const caps = buildCapabilities(config.provider);

  return {
    name: 'auth',
    // @cpt-begin:cpt-frontx-flow-auth-plugin-transport-binding:p1:inst-provides
    provides: {
      app: {
        auth: {
          provider: config.provider,
          capabilities: caps,
          getSession: (ctx?: AuthContext) => config.provider.getSession(ctx),
          checkAuth: (ctx?: AuthContext) => config.provider.checkAuth(ctx),
          logout: (ctx?: AuthContext) => config.provider.logout(ctx),
          login: config.provider.login?.bind(config.provider),
          handleCallback: config.provider.handleCallback?.bind(config.provider),
          refresh: config.provider.refresh?.bind(config.provider),
          getIdentity: config.provider.getIdentity?.bind(config.provider),
          getPermissions: config.provider.getPermissions?.bind(config.provider),
          canAccess: <TRecord extends AccessRecord = AccessRecord>(
            query: AccessQuery<TRecord>,
            ctx?: AuthContext,
          ) => safeCanAccess(config.provider, caps, query as AccessQuery, ctx),
          canAccessMany: (queries, ctx) =>
            safeCanAccessMany(config.provider, caps, queries, ctx),
          evaluateAccess: <TRecord extends AccessRecord = AccessRecord>(
            query: AccessQuery<TRecord>,
            ctx?: AuthContext,
          ) => safeEvaluateAccess(config.provider, caps, query as AccessQuery, ctx),
          evaluateMany: (queries, ctx) =>
            safeEvaluateMany(config.provider, caps, queries, ctx),
          subscribe: config.provider.subscribe?.bind(config.provider),
        } satisfies AuthRuntime,
      },
    },
    // @cpt-end:cpt-frontx-flow-auth-plugin-transport-binding:p1:inst-provides
    // @cpt-begin:cpt-frontx-flow-auth-plugin-transport-binding:p1:inst-on-init
    onInit(app) {
      binding = transport({
        provider: config.provider,
        allowedCookieOrigins: config.hai3Api?.allowedCookieOrigins,
        csrfHeaderName: config.hai3Api?.csrfHeaderName,
        addRestPlugin: (plugin) => app.apiRegistry.plugins.add(RestProtocol, plugin),
        removeRestPlugin: (pluginClass) => app.apiRegistry.plugins.remove(RestProtocol, pluginClass),
      });
    },
    // @cpt-end:cpt-frontx-flow-auth-plugin-transport-binding:p1:inst-on-init
    // @cpt-begin:cpt-frontx-flow-auth-plugin-transport-binding:p1:inst-on-destroy
    onDestroy(_app) {
      binding?.destroy();
      binding = null;
      const providerDestroyResult = config.provider.destroy?.();
      if (providerDestroyResult && typeof providerDestroyResult === 'object' && 'catch' in providerDestroyResult) {
        void providerDestroyResult.catch(() => undefined);
      }
    },
    // @cpt-end:cpt-frontx-flow-auth-plugin-transport-binding:p1:inst-on-destroy
  };
}

// @cpt-end:cpt-frontx-state-auth-plugin-refresh:p1:inst-module
// @cpt-end:cpt-frontx-dod-auth-plugin:p1:inst-module

declare module '../types' {
  interface HAI3AppRuntimeExtensions {
    auth?: AuthRuntime;
  }
}
