/**
 * Tests for RBAC guard API: useCanAccess hook and CanAccess component.
 *
 * Covers:
 *   - allow: true when canAccess resolves 'allow'
 *   - allow: false (deny) when canAccess resolves 'deny'
 *   - isResolving: true while pending, false after resolution
 *   - default deny while resolving (pessimistic strategy)
 *   - deny + isResolving: false when app.auth is absent
 *   - deny + isResolving: false on provider error (canAccess throws)
 *   - query change re-pessimizes (Allowed -> Pending -> Allowed/Denied)
 *   - abort signal sent on unmount
 *   - CanAccess renders allowed / denied / loading slots correctly
 *
 * @packageDocumentation
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import { createHAI3, auth } from '@cyberfabric/framework';
import type {
  AuthProvider,
  AuthContext,
  AccessQuery,
  AccessDecision,
  AuthCheckResult,
  AuthSession,
  AuthTransition,
} from '@cyberfabric/framework';
import { HAI3Provider } from '../src/HAI3Provider';
import { useCanAccess } from '../src/hooks/useCanAccess';
import { CanAccess } from '../src/components/CanAccess';

// ============================================================================
// Helpers
// ============================================================================

const ownedApps: import('@cyberfabric/framework').HAI3App[] = [];

afterEach(() => {
  ownedApps.forEach((a) => a.destroy());
  ownedApps.length = 0;
});

const MOCK_SESSION: AuthSession = { kind: 'bearer', token: 'tok' };

/** Build a minimal AuthProvider stub. Only getSession + canAccess are tested. */
function makeProvider(
  canAccessFn: (query: AccessQuery, ctx?: AuthContext) => Promise<AccessDecision>,
): AuthProvider {
  return {
    getSession: vi.fn().mockResolvedValue(MOCK_SESSION),
    checkAuth: vi.fn<() => Promise<AuthCheckResult>>().mockResolvedValue({ authenticated: true }),
    logout: vi.fn<() => Promise<AuthTransition>>().mockResolvedValue({ type: 'none' }),
    canAccess: vi.fn().mockImplementation(canAccessFn),
  };
}

function makeProviderWithoutCanAccess(): AuthProvider {
  return {
    getSession: vi.fn().mockResolvedValue(MOCK_SESSION),
    checkAuth: vi.fn<() => Promise<AuthCheckResult>>().mockResolvedValue({ authenticated: true }),
    logout: vi.fn<() => Promise<AuthTransition>>().mockResolvedValue({ type: 'none' }),
  };
}

function buildApp(provider: AuthProvider): import('@cyberfabric/framework').HAI3App {
  const app = createHAI3().use(auth({ provider })).build();
  ownedApps.push(app);
  return app;
}

function buildAppNoAuth(): import('@cyberfabric/framework').HAI3App {
  const app = createHAI3().build();
  ownedApps.push(app);
  return app;
}

function makeWrapper(app: import('@cyberfabric/framework').HAI3App) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <HAI3Provider app={app}>{children}</HAI3Provider>;
  };
}

const QUERY_READ: AccessQuery = { action: 'read', resource: 'invoice' };
const QUERY_WRITE: AccessQuery = { action: 'write', resource: 'invoice' };
const QUERY_WITH_RECORD: AccessQuery = {
  action: 'read',
  resource: 'invoice',
  record: { id: '42', status: 'active' },
};

// ============================================================================
// useCanAccess
// ============================================================================

describe('useCanAccess', () => {
  it('returns isResolving: true and allow: false while the decision is pending', () => {
    const provider = makeProvider(() => new Promise(() => undefined));
    const wrapper = makeWrapper(buildApp(provider));

    const { result } = renderHook(() => useCanAccess(QUERY_READ), { wrapper });

    expect(result.current.allow).toBe(false);
    expect(result.current.isResolving).toBe(true);
  });

  it('resolves to allow: true when canAccess returns allow', async () => {
    const provider = makeProvider(() => Promise.resolve('allow'));
    const wrapper = makeWrapper(buildApp(provider));

    const { result } = renderHook(() => useCanAccess(QUERY_READ), { wrapper });

    await waitFor(() => expect(result.current.isResolving).toBe(false));
    expect(result.current.allow).toBe(true);
  });

  it('resolves to allow: false when canAccess returns deny', async () => {
    const provider = makeProvider(() => Promise.resolve('deny'));
    const wrapper = makeWrapper(buildApp(provider));

    const { result } = renderHook(() => useCanAccess(QUERY_READ), { wrapper });

    await waitFor(() => expect(result.current.isResolving).toBe(false));
    expect(result.current.allow).toBe(false);
  });

  it('resolves to allow: false, isResolving: false when auth plugin is not registered', async () => {
    const wrapper = makeWrapper(buildAppNoAuth());

    const { result } = renderHook(() => useCanAccess(QUERY_READ), { wrapper });

    await waitFor(() => expect(result.current.isResolving).toBe(false));
    expect(result.current.allow).toBe(false);
  });

  it('resolves to deny when canAccess throws (error path)', async () => {
    const provider = makeProvider(() => Promise.reject(new Error('provider error')));
    // canAccess in AuthRuntime is fail-closed, so it resolves to 'deny' on throw.
    // But even if the runtime leaked an error, useCanAccess catches it.
    const wrapper = makeWrapper(buildApp(provider));

    const { result } = renderHook(() => useCanAccess(QUERY_READ), { wrapper });

    await waitFor(() => expect(result.current.isResolving).toBe(false));
    expect(result.current.allow).toBe(false);
  });

  it('resolves to deny when provider has no canAccess method', async () => {
    const wrapper = makeWrapper(buildApp(makeProviderWithoutCanAccess()));

    const { result } = renderHook(() => useCanAccess(QUERY_READ), { wrapper });

    await waitFor(() => expect(result.current.isResolving).toBe(false));
    expect(result.current.allow).toBe(false);
  });

  it('re-pessimizes to allow: false, isResolving: true when query changes after allow', async () => {
    let resolveFirst!: (d: AccessDecision) => void;
    const firstCall = new Promise<AccessDecision>((r) => { resolveFirst = r; });
    let callCount = 0;

    const provider = makeProvider(() => {
      callCount += 1;
      if (callCount === 1) return firstCall;
      return new Promise(() => undefined); // second call never resolves
    });

    const wrapper = makeWrapper(buildApp(provider));

    const { result, rerender } = renderHook(
      (q: AccessQuery) => useCanAccess(q),
      { wrapper, initialProps: QUERY_READ },
    );

    // Resolve first call with allow.
    await act(async () => { resolveFirst('allow'); });
    await waitFor(() => expect(result.current.allow).toBe(true));
    expect(result.current.isResolving).toBe(false);

    // Change query — hook must immediately re-pessimize.
    rerender(QUERY_WRITE);

    expect(result.current.allow).toBe(false);
    expect(result.current.isResolving).toBe(true);
  });

  it('re-pessimizes when query changes after deny', async () => {
    let callCount = 0;
    const provider = makeProvider(() => {
      callCount += 1;
      if (callCount === 1) return Promise.resolve('deny');
      return new Promise(() => undefined);
    });

    const wrapper = makeWrapper(buildApp(provider));

    const { result, rerender } = renderHook(
      (q: AccessQuery) => useCanAccess(q),
      { wrapper, initialProps: QUERY_READ },
    );

    await waitFor(() => expect(result.current.isResolving).toBe(false));
    expect(result.current.allow).toBe(false);

    rerender(QUERY_WRITE);

    expect(result.current.allow).toBe(false);
    expect(result.current.isResolving).toBe(true);
  });

  it('does not re-run when a new query object with the same content is passed', async () => {
    const canAccess = vi.fn().mockResolvedValue('allow' as AccessDecision);
    const provider: AuthProvider = {
      getSession: vi.fn().mockResolvedValue(MOCK_SESSION),
      checkAuth: vi.fn<() => Promise<AuthCheckResult>>().mockResolvedValue({ authenticated: true }),
      logout: vi.fn<() => Promise<AuthTransition>>().mockResolvedValue({ type: 'none' }),
      canAccess,
    };

    const wrapper = makeWrapper(buildApp(provider));

    const queryA: AccessQuery = {
      action: 'read',
      resource: 'invoice',
      record: { status: 'active', id: '42' },
    };
    const queryB: AccessQuery = {
      action: 'read',
      resource: 'invoice',
      record: { id: '42', status: 'active' },
    };

    const { result, rerender } = renderHook(
      (q: AccessQuery) => useCanAccess(q),
      { wrapper, initialProps: queryA },
    );

    await waitFor(() => expect(result.current.allow).toBe(true));
    const firstCallCount = canAccess.mock.calls.length;

    // Same logical content, different key order — key stays stable.
    rerender(queryB);

    expect(canAccess.mock.calls.length).toBe(firstCallCount);
  });

  it('treats typed record values as distinct query keys (1 !== "1")', async () => {
    const canAccess = vi.fn().mockResolvedValue('allow' as AccessDecision);
    const provider: AuthProvider = {
      getSession: vi.fn().mockResolvedValue(MOCK_SESSION),
      checkAuth: vi.fn<() => Promise<AuthCheckResult>>().mockResolvedValue({ authenticated: true }),
      logout: vi.fn<() => Promise<AuthTransition>>().mockResolvedValue({ type: 'none' }),
      canAccess,
    };

    const wrapper = makeWrapper(buildApp(provider));
    const numberQuery: AccessQuery<{ id: number }> = {
      action: 'read',
      resource: 'invoice',
      record: { id: 1 },
    };
    const stringQuery: AccessQuery<{ id: string }> = {
      action: 'read',
      resource: 'invoice',
      record: { id: '1' },
    };

    const { result, rerender } = renderHook(
      (q: AccessQuery) => useCanAccess(q),
      { wrapper, initialProps: numberQuery as AccessQuery },
    );

    await waitFor(() => expect(result.current.isResolving).toBe(false));
    expect(result.current.allow).toBe(true);

    rerender(stringQuery as AccessQuery);
    expect(result.current.isResolving).toBe(true);

    await waitFor(() => expect(result.current.isResolving).toBe(false));
    expect(canAccess).toHaveBeenCalledTimes(2);
  });

  it('passes record fields into the query and uses them for change detection', async () => {
    let resolveRecord1!: (d: AccessDecision) => void;
    const call1 = new Promise<AccessDecision>((r) => { resolveRecord1 = r; });
    let callCount = 0;

    const provider = makeProvider(() => {
      callCount += 1;
      if (callCount === 1) return call1;
      return new Promise(() => undefined);
    });

    const wrapper = makeWrapper(buildApp(provider));

    const queryA: AccessQuery = { action: 'read', resource: 'invoice', record: { id: '1' } };
    const queryB: AccessQuery = { action: 'read', resource: 'invoice', record: { id: '2' } };

    const { result, rerender } = renderHook(
      (q: AccessQuery) => useCanAccess(q),
      { wrapper, initialProps: queryA },
    );

    await act(async () => { resolveRecord1('allow'); });
    await waitFor(() => expect(result.current.allow).toBe(true));

    // Different record.id — must re-pessimize.
    rerender(queryB);

    expect(result.current.allow).toBe(false);
    expect(result.current.isResolving).toBe(true);
  });

  it('aborts the in-flight request on unmount', async () => {
    const signals: AbortSignal[] = [];
    const provider = makeProvider((_q, ctx) => {
      if (ctx?.signal) signals.push(ctx.signal);
      return new Promise(() => undefined);
    });

    const wrapper = makeWrapper(buildApp(provider));

    const { unmount } = renderHook(() => useCanAccess(QUERY_READ), { wrapper });

    await waitFor(() => expect(signals.length).toBeGreaterThan(0));
    expect(signals[0].aborted).toBe(false);

    unmount();

    expect(signals[0].aborted).toBe(true);
  });
});

// ============================================================================
// CanAccess component
// ============================================================================

describe('CanAccess', () => {
  it('renders denied slot while the decision is resolving', () => {
    const provider = makeProvider(() => new Promise(() => undefined));
    const app = buildApp(provider);

    render(
      <HAI3Provider app={app}>
        <CanAccess
          query={QUERY_READ}
          allowed={<span data-testid="allowed">yes</span>}
          denied={<span data-testid="denied">no</span>}
        />
      </HAI3Provider>,
    );

    expect(screen.getByTestId('denied')).toBeTruthy();
    expect(screen.queryByTestId('allowed')).toBeNull();
  });

  it('renders loading slot while resolving when provided', () => {
    const provider = makeProvider(() => new Promise(() => undefined));
    const app = buildApp(provider);

    render(
      <HAI3Provider app={app}>
        <CanAccess
          query={QUERY_READ}
          allowed={<span data-testid="allowed">yes</span>}
          denied={<span data-testid="denied">no</span>}
          loading={<span data-testid="loading">…</span>}
        />
      </HAI3Provider>,
    );

    expect(screen.getByTestId('loading')).toBeTruthy();
    expect(screen.queryByTestId('denied')).toBeNull();
    expect(screen.queryByTestId('allowed')).toBeNull();
  });

  it('renders allowed slot after an allow decision', async () => {
    const provider = makeProvider(() => Promise.resolve('allow'));
    const app = buildApp(provider);

    render(
      <HAI3Provider app={app}>
        <CanAccess
          query={QUERY_READ}
          allowed={<span data-testid="allowed">yes</span>}
          denied={<span data-testid="denied">no</span>}
        />
      </HAI3Provider>,
    );

    await waitFor(() => expect(screen.queryByTestId('allowed')).toBeTruthy());
    expect(screen.queryByTestId('denied')).toBeNull();
  });

  it('renders denied slot after a deny decision', async () => {
    const provider = makeProvider(() => Promise.resolve('deny'));
    const app = buildApp(provider);

    render(
      <HAI3Provider app={app}>
        <CanAccess
          query={QUERY_READ}
          allowed={<span data-testid="allowed">yes</span>}
          denied={<span data-testid="denied">no</span>}
        />
      </HAI3Provider>,
    );

    await waitFor(() => {
      expect(screen.queryByTestId('allowed')).toBeNull();
      expect(screen.getByTestId('denied')).toBeTruthy();
    });
  });

  it('renders null when denied slot is omitted and access is denied', async () => {
    const provider = makeProvider(() => Promise.resolve('deny'));
    const app = buildApp(provider);

    const { container } = render(
      <HAI3Provider app={app}>
        <CanAccess
          query={QUERY_READ}
          allowed={<span data-testid="allowed">yes</span>}
        />
      </HAI3Provider>,
    );

    await waitFor(() => expect(screen.queryByTestId('allowed')).toBeNull());
    expect(container.firstChild).toBeNull();
  });

  it('works with a record-bearing query', async () => {
    const provider = makeProvider(() => Promise.resolve('allow'));
    const app = buildApp(provider);

    render(
      <HAI3Provider app={app}>
        <CanAccess
          query={QUERY_WITH_RECORD}
          allowed={<span data-testid="allowed">yes</span>}
          denied={<span data-testid="denied">no</span>}
        />
      </HAI3Provider>,
    );

    await waitFor(() => expect(screen.getByTestId('allowed')).toBeTruthy());
  });
});
