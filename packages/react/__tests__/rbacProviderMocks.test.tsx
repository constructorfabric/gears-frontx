/**
 * Provider-mock RBAC demos for useCanAccess and CanAccess.
 *
 * Covers:
 * - Keycloak-like claim model: allow and deny rendering paths
 * - Auth0-like claim model: pessimistic pending state, loading slot, and allow after resolution
 * - Fail-closed UI behavior when the provider rejects
 *
 * @vitest-environment jsdom
 */

import React from 'react';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { auth, createHAI3 } from '@cyberfabric/framework';
import type {
  AccessDecision,
  AccessQuery,
  AuthCheckResult,
  AuthIdentity,
  AuthPermissions,
  AuthProvider,
  AuthSession,
  AuthTransition,
  HAI3App,
} from '@cyberfabric/framework';
import { CanAccess } from '../src/components/CanAccess';
import { HAI3Provider } from '../src/HAI3Provider';
import { useCanAccess } from '../src/hooks/useCanAccess';

type DeferredGate = {
  promise: Promise<void>;
  resolve: () => void;
};

type KeycloakClaims = {
  sub: string;
  preferred_username: string;
  realm_access: {
    roles: ReadonlyArray<string>;
  };
  resource_access: Record<string, { roles: ReadonlyArray<string> }>;
};

type Auth0Claims = {
  sub: string;
  permissions: ReadonlyArray<string>;
  'https://frontx.example/roles'?: ReadonlyArray<string>;
};

const RESOURCE_INVOICE = 'invoice';
const ACTION_READ = 'read';
const ACTION_DELETE = 'delete';
const KEYCLOAK_CLIENT = 'frontx';
const KEYCLOAK_READ_ROLE = 'invoice:read';
const KEYCLOAK_DELETE_ROLE = 'invoice:delete';
const AUTH0_READ_PERMISSION = 'invoice:read';

const ownedApps: HAI3App[] = [];

afterEach(() => {
  ownedApps.forEach((app) => app.destroy());
  ownedApps.length = 0;
  vi.restoreAllMocks();
});

function createDeferredGate(): DeferredGate {
  let resolve!: () => void;
  const promise = new Promise<void>((innerResolve) => {
    resolve = () => innerResolve();
  });

  return { promise, resolve };
}

function buildApp(provider: AuthProvider): HAI3App {
  const app = createHAI3().use(auth({ provider })).build();
  ownedApps.push(app);
  return app;
}

function makeWrapper(app: HAI3App) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <HAI3Provider app={app}>{children}</HAI3Provider>;
  };
}

function makeSession(): AuthSession {
  return { kind: 'bearer', token: 'mock-token' };
}

function makeAuthCheckResult(): AuthCheckResult {
  return { authenticated: true, session: makeSession() };
}

function makeNoopTransition(): AuthTransition {
  return { type: 'none' };
}

function collectKeycloakRoles(claims: KeycloakClaims): ReadonlyArray<string> {
  const clientRoles = claims.resource_access[KEYCLOAK_CLIENT]?.roles ?? [];
  return [...claims.realm_access.roles, ...clientRoles];
}

function keycloakDecision(claims: KeycloakClaims, query: AccessQuery): AccessDecision {
  if (query.resource !== RESOURCE_INVOICE) return 'deny';

  const roles = new Set(collectKeycloakRoles(claims));
  if (query.action === ACTION_READ && roles.has(KEYCLOAK_READ_ROLE)) return 'allow';
  if (query.action === ACTION_DELETE && roles.has(KEYCLOAK_DELETE_ROLE)) return 'allow';
  return 'deny';
}

function makeKeycloakLikeProvider(claims: KeycloakClaims): AuthProvider {
  const permissions: AuthPermissions = { roles: [...collectKeycloakRoles(claims)] };

  return {
    getSession: vi.fn().mockResolvedValue(makeSession()),
    checkAuth: vi.fn().mockResolvedValue(makeAuthCheckResult()),
    logout: vi.fn().mockResolvedValue(makeNoopTransition()),
    getIdentity: vi.fn<() => Promise<AuthIdentity | null>>().mockResolvedValue({ sub: claims.sub }),
    getPermissions: vi.fn().mockResolvedValue(permissions),
    canAccess: vi.fn().mockImplementation(async (query: AccessQuery) => keycloakDecision(claims, query)),
  };
}

function auth0Decision(claims: Auth0Claims, query: AccessQuery): AccessDecision {
  if (query.resource !== RESOURCE_INVOICE) return 'deny';
  if (query.action !== ACTION_READ) return 'deny';
  return claims.permissions.includes(AUTH0_READ_PERMISSION) ? 'allow' : 'deny';
}

function makeAuth0LikeProvider(
  claims: Auth0Claims,
  gate?: DeferredGate,
  shouldReject = false,
): AuthProvider {
  const permissions: AuthPermissions = { permissions: [...claims.permissions] };

  return {
    getSession: vi.fn().mockResolvedValue(makeSession()),
    checkAuth: vi.fn().mockResolvedValue(makeAuthCheckResult()),
    logout: vi.fn().mockResolvedValue(makeNoopTransition()),
    getIdentity: vi.fn<() => Promise<AuthIdentity | null>>().mockResolvedValue({ sub: claims.sub }),
    getPermissions: vi.fn().mockResolvedValue(permissions),
    canAccess: vi.fn().mockImplementation(async (query: AccessQuery) => {
      if (gate) {
        await gate.promise;
      }
      if (shouldReject) {
        throw new Error('auth0 policy service failed');
      }
      return auth0Decision(claims, query);
    }),
  };
}

describe('provider-mock RBAC demos', () => {
  it('useCanAccess resolves allow after an Auth0-like provider gate opens', async () => {
    const gate = createDeferredGate();
    const app = buildApp(
      makeAuth0LikeProvider(
        {
          sub: 'auth0|demo-user',
          permissions: [AUTH0_READ_PERMISSION],
        },
        gate,
      ),
    );
    const wrapper = makeWrapper(app);

    const { result } = renderHook(() => useCanAccess({ action: ACTION_READ, resource: RESOURCE_INVOICE }), {
      wrapper,
    });

    expect(result.current.allow).toBe(false);
    expect(result.current.isResolving).toBe(true);

    await act(async () => {
      gate.resolve();
    });

    await waitFor(() => expect(result.current.isResolving).toBe(false));
    expect(result.current.allow).toBe(true);
  });

  it('CanAccess renders the allowed slot for a Keycloak-like role match', async () => {
    const app = buildApp(
      makeKeycloakLikeProvider({
        sub: 'kc-user-1',
        preferred_username: 'kc-reader',
        realm_access: { roles: ['offline_access'] },
        resource_access: {
          [KEYCLOAK_CLIENT]: { roles: [KEYCLOAK_READ_ROLE] },
        },
      }),
    );

    render(
      <HAI3Provider app={app}>
        <CanAccess
          query={{ action: ACTION_READ, resource: RESOURCE_INVOICE }}
          allowed={<span data-testid="keycloak-allowed">allowed</span>}
          denied={<span data-testid="keycloak-denied">denied</span>}
        />
      </HAI3Provider>,
    );

    await waitFor(() => expect(screen.getByTestId('keycloak-allowed')).toBeTruthy());
    expect(screen.queryByTestId('keycloak-denied')).toBeNull();
  });

  it('CanAccess renders the denied slot for a Keycloak-like role miss', async () => {
    const app = buildApp(
      makeKeycloakLikeProvider({
        sub: 'kc-user-2',
        preferred_username: 'kc-guest',
        realm_access: { roles: ['offline_access'] },
        resource_access: {
          [KEYCLOAK_CLIENT]: { roles: ['invoice:view'] },
        },
      }),
    );

    render(
      <HAI3Provider app={app}>
        <CanAccess
          query={{ action: ACTION_DELETE, resource: RESOURCE_INVOICE }}
          allowed={<span data-testid="keycloak-allowed">allowed</span>}
          denied={<span data-testid="keycloak-denied">denied</span>}
        />
      </HAI3Provider>,
    );

    await waitFor(() => expect(screen.getByTestId('keycloak-denied')).toBeTruthy());
    expect(screen.queryByTestId('keycloak-allowed')).toBeNull();
  });

  it('CanAccess shows loading while an Auth0-like provider is pending, then allows after resolution', async () => {
    const gate = createDeferredGate();
    const app = buildApp(
      makeAuth0LikeProvider(
        {
          sub: 'auth0|demo-user',
          permissions: [AUTH0_READ_PERMISSION],
          'https://frontx.example/roles': ['invoice-reader'],
        },
        gate,
      ),
    );

    render(
      <HAI3Provider app={app}>
        <CanAccess
          query={{ action: ACTION_READ, resource: RESOURCE_INVOICE }}
          allowed={<span data-testid="auth0-allowed">allowed</span>}
          denied={<span data-testid="auth0-denied">denied</span>}
          loading={<span data-testid="auth0-loading">loading</span>}
        />
      </HAI3Provider>,
    );

    expect(screen.getByTestId('auth0-loading')).toBeTruthy();
    expect(screen.queryByTestId('auth0-allowed')).toBeNull();
    expect(screen.queryByTestId('auth0-denied')).toBeNull();

    await act(async () => {
      gate.resolve();
    });

    await waitFor(() => expect(screen.getByTestId('auth0-allowed')).toBeTruthy());
    expect(screen.queryByTestId('auth0-loading')).toBeNull();
  });

  it('CanAccess fails closed to the denied slot when the provider rejects', async () => {
    const app = buildApp(
      makeAuth0LikeProvider(
        {
          sub: 'auth0|error-user',
          permissions: [AUTH0_READ_PERMISSION],
        },
        undefined,
        true,
      ),
    );

    render(
      <HAI3Provider app={app}>
        <CanAccess
          query={{ action: ACTION_READ, resource: RESOURCE_INVOICE }}
          allowed={<span data-testid="error-allowed">allowed</span>}
          denied={<span data-testid="error-denied">denied</span>}
        />
      </HAI3Provider>,
    );

    await waitFor(() => expect(screen.getByTestId('error-denied')).toBeTruthy());
    expect(screen.queryByTestId('error-allowed')).toBeNull();
  });
});
