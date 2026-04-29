/**
 * Contract tests for RBAC provider behavior.
 *
 * Covers provider-specific mock mappings for:
 * - Keycloak-like claims: realm_access.roles + resource_access.<client>.roles
 * - Auth0-like claims: scope + optional permissions claim
 * - Runtime fail-closed behavior when provider methods throw or return malformed payloads
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHAI3 } from '../src/createHAI3';
import { auth } from '../src/plugins/auth';
import type {
  AccessDecision,
  AccessEvaluation,
  AccessQuery,
  AuthIdentity,
  AuthPermissions,
  AuthProvider,
  AuthSession,
} from '@cyberfabric/auth';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

type KeycloakClaims = {
  sub: string;
  preferred_username: string;
  realm_access: {
    roles: string[];
  };
  resource_access: Record<string, { roles: string[] }>;
};

type Auth0Claims = {
  sub: string;
  scope: string;
  permissions?: string[];
};

const ownedApps: Array<{ destroy: () => void }> = [];

function buildApp(provider: AuthProvider) {
  const app = createHAI3().use(auth({ provider })).build();
  ownedApps.push(app);
  return app;
}

function makeBearerSession(token: string): AuthSession {
  return { kind: 'bearer', token };
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function splitScope(scope: string): string[] {
  return scope.split(/\s+/).filter(Boolean);
}

function toPermissionKey(resource: string, action: string): string {
  return `${resource}:${action}`;
}

function keycloakPermissions(claims: KeycloakClaims): AuthPermissions {
  return {
    roles: unique(claims.realm_access.roles),
    permissions: unique(
      Object.entries(claims.resource_access).flatMap(([client, value]) =>
        value.roles.map((role) => `${client}:${role}`),
      ),
    ),
  };
}

function keycloakCanAccess(
  claims: KeycloakClaims,
  query: AccessQuery,
  throwOnMissingResourceAccess: boolean,
): AccessDecision {
  const resourceRoles = claims.resource_access[query.resource]?.roles;
  if (!resourceRoles) {
    if (throwOnMissingResourceAccess) {
      throw new Error(`missing resource_access.${query.resource}`);
    }
    return 'deny';
  }

  return resourceRoles.includes(query.action) ? 'allow' : 'deny';
}

function keycloakEvaluation(
  claims: KeycloakClaims,
  query: AccessQuery,
  throwOnMissingResourceAccess: boolean,
): AccessEvaluation {
  const decision = keycloakCanAccess(claims, query, throwOnMissingResourceAccess);
  if (decision === 'allow') {
    return {
      decision: 'allow',
      reason: 'allowed',
      meta: {
        source: `resource_access.${query.resource}`,
        subject: claims.sub,
      },
    };
  }

  return {
    decision: 'deny',
    reason: 'policy_not_found',
    meta: {
      source: `resource_access.${query.resource}`,
      subject: claims.sub,
    },
  };
}

function makeKeycloakProvider(
  claims: KeycloakClaims,
  opts?: { throwOnMissingResourceAccess?: boolean },
): AuthProvider {
  const session = makeBearerSession('kc-token');
  const throwOnMissingResourceAccess = opts?.throwOnMissingResourceAccess ?? false;

  return {
    getSession: vi.fn().mockResolvedValue(session),
    checkAuth: vi.fn().mockResolvedValue({ authenticated: true, session }),
    logout: vi.fn().mockResolvedValue({ type: 'none' }),
    getIdentity: vi.fn().mockResolvedValue({
      sub: claims.sub,
      claims,
    } as unknown as AuthIdentity),
    getPermissions: vi.fn().mockResolvedValue(keycloakPermissions(claims)),
    canAccess: vi.fn().mockImplementation((query: AccessQuery) =>
      Promise.resolve(keycloakCanAccess(claims, query, throwOnMissingResourceAccess)),
    ),
    evaluateAccess: vi.fn().mockImplementation((query: AccessQuery) =>
      Promise.resolve(keycloakEvaluation(claims, query, throwOnMissingResourceAccess)),
    ),
  };
}

function auth0Permissions(claims: Auth0Claims): AuthPermissions {
  return {
    roles: unique(splitScope(claims.scope)),
    permissions: unique(claims.permissions ?? []),
  };
}

function auth0CanAccess(claims: Auth0Claims, query: AccessQuery): AccessDecision {
  const permissionKey = toPermissionKey(query.resource, query.action);
  const scopeMatches = splitScope(claims.scope).includes(permissionKey);
  const permissionMatches = (claims.permissions ?? []).includes(permissionKey);
  return scopeMatches || permissionMatches ? 'allow' : 'deny';
}

function auth0Evaluation(
  claims: Auth0Claims,
  query: AccessQuery,
  malformed?: {
    malformedDecisionResource?: string;
    malformedConstraintsResource?: string;
    malformedReasonShapeResource?: string;
    malformedMetaShapeResource?: string;
    extensiblePayloadResource?: string;
  },
): AccessEvaluation {
  if (malformed?.malformedDecisionResource && query.resource === malformed.malformedDecisionResource) {
    return { decision: 'maybe' } as unknown as AccessEvaluation;
  }
  if (malformed?.malformedConstraintsResource && query.resource === malformed.malformedConstraintsResource) {
    return {
      decision: 'allow',
      constraints: { field: 'tenantId', op: 'eq', value: 'acme' },
    } as unknown as AccessEvaluation;
  }
  if (malformed?.malformedReasonShapeResource && query.resource === malformed.malformedReasonShapeResource) {
    return {
      decision: 'allow',
      reason: { code: 'not_a_reason' },
    } as unknown as AccessEvaluation;
  }
  if (malformed?.malformedMetaShapeResource && query.resource === malformed.malformedMetaShapeResource) {
    return {
      decision: 'allow',
      meta: ['scope'],
    } as unknown as AccessEvaluation;
  }
  if (malformed?.extensiblePayloadResource && query.resource === malformed.extensiblePayloadResource) {
    return {
      decision: 'deny',
      reason: 'tenant_scope_conflict',
      constraints: [
        {
          predicate: {
            field: 'tenant.id',
            op: 'custom_eq',
            value: 'acme',
          },
        },
      ],
      meta: {
        source: 'scope',
        nested: { policyId: 'p-1' },
      },
    } as AccessEvaluation;
  }

  const permissionKey = toPermissionKey(query.resource, query.action);
  const scopeMatches = splitScope(claims.scope).includes(permissionKey);
  const permissionMatches = (claims.permissions ?? []).includes(permissionKey);
  const source = scopeMatches ? 'scope' : permissionMatches ? 'permissions' : 'none';

  if (scopeMatches || permissionMatches) {
    return {
      decision: 'allow',
      reason: 'allowed',
      meta: {
        source,
        subject: claims.sub,
      },
    };
  }

  return {
    decision: 'deny',
    reason: 'policy_not_found',
    meta: {
      source,
      subject: claims.sub,
    },
  };
}

function makeAuth0Provider(
  claims: Auth0Claims,
  opts?: {
    malformedDecisionResource?: string;
    malformedConstraintsResource?: string;
    malformedReasonShapeResource?: string;
    malformedMetaShapeResource?: string;
    extensiblePayloadResource?: string;
  },
): AuthProvider {
  const session = makeBearerSession('auth0-token');

  return {
    getSession: vi.fn().mockResolvedValue(session),
    checkAuth: vi.fn().mockResolvedValue({ authenticated: true, session }),
    logout: vi.fn().mockResolvedValue({ type: 'none' }),
    getIdentity: vi.fn().mockResolvedValue({
      sub: claims.sub,
      claims,
    } as unknown as AuthIdentity),
    getPermissions: vi.fn().mockResolvedValue(auth0Permissions(claims)),
    canAccess: vi.fn().mockImplementation((query: AccessQuery) =>
      Promise.resolve(auth0CanAccess(claims, query)),
    ),
    canAccessMany: vi.fn().mockImplementation((queries: ReadonlyArray<AccessQuery>) =>
      Promise.resolve(queries.map((query) => auth0CanAccess(claims, query))),
    ),
    evaluateAccess: vi.fn().mockImplementation((query: AccessQuery) =>
      Promise.resolve(auth0Evaluation(claims, query, opts)),
    ),
    evaluateMany: vi.fn().mockImplementation((queries: ReadonlyArray<AccessQuery>) =>
      Promise.resolve(queries.map((query) => auth0Evaluation(claims, query, opts))),
    ),
  };
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

afterEach(() => {
  while (ownedApps.length > 0) {
    ownedApps.pop()?.destroy();
  }
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('RBAC provider contracts', () => {
  describe('Keycloak-like provider', () => {
    it('maps realm_access and resource_access into identity and permission hints', async () => {
      const claims: KeycloakClaims = {
        sub: 'kc-user-1',
        preferred_username: 'karen',
        realm_access: {
          roles: ['realm-auditor'],
        },
        resource_access: {
          invoice: { roles: ['read', 'write'] },
          audit: { roles: ['read'] },
        },
      };
      const provider = makeKeycloakProvider(claims);
      const app = buildApp(provider);

      const identity = await app.auth!.getIdentity!();
      const permissions = await app.auth!.getPermissions!();

      expect(identity).toEqual({
        sub: 'kc-user-1',
        claims,
      });
      expect(permissions).toEqual({
        roles: ['realm-auditor'],
        permissions: ['invoice:read', 'invoice:write', 'audit:read'],
      });
    });

    it('allows and denies typical access queries through the runtime contract', async () => {
      const claims: KeycloakClaims = {
        sub: 'kc-user-2',
        preferred_username: 'kelly',
        realm_access: {
          roles: ['realm-auditor'],
        },
        resource_access: {
          invoice: { roles: ['read', 'write'] },
          audit: { roles: ['read'] },
        },
      };
      const provider = makeKeycloakProvider(claims);
      const app = buildApp(provider);

      const allowQuery: AccessQuery = { action: 'read', resource: 'invoice' };
      const denyQuery: AccessQuery = { action: 'delete', resource: 'invoice' };
      const auditQuery: AccessQuery = { action: 'read', resource: 'audit' };

      await expect(app.auth!.canAccess(allowQuery)).resolves.toBe('allow');
      await expect(app.auth!.canAccess(denyQuery)).resolves.toBe('deny');
      await expect(app.auth!.evaluateAccess(allowQuery)).resolves.toMatchObject({
        decision: 'allow',
        reason: 'allowed',
        meta: {
          source: 'resource_access.invoice',
          subject: 'kc-user-2',
        },
      });
      await expect(app.auth!.evaluateAccess(denyQuery)).resolves.toMatchObject({
        decision: 'deny',
        reason: 'policy_not_found',
        meta: {
          source: 'resource_access.invoice',
          subject: 'kc-user-2',
        },
      });
      await expect(app.auth!.evaluateAccess(auditQuery)).resolves.toMatchObject({
        decision: 'allow',
        reason: 'allowed',
        meta: {
          source: 'resource_access.audit',
          subject: 'kc-user-2',
        },
      });
    });

    it('fails closed when the provider throws on malformed resource access', async () => {
      const claims: KeycloakClaims = {
        sub: 'kc-user-3',
        preferred_username: 'kelvin',
        realm_access: {
          roles: ['realm-auditor'],
        },
        resource_access: {
          audit: { roles: ['read'] },
        },
      };
      const provider = makeKeycloakProvider(claims, {
        throwOnMissingResourceAccess: true,
      });
      const app = buildApp(provider);

      await expect(
        app.auth!.canAccess({ action: 'read', resource: 'invoice' }),
      ).resolves.toBe('deny');
    });
  });

  describe('Auth0-like provider', () => {
    it('maps scope and permissions claims into identity and permission hints', async () => {
      const claims: Auth0Claims = {
        sub: 'auth0-user-1',
        scope: 'invoice:read invoice:export',
        permissions: ['audit:read'],
      };
      const provider = makeAuth0Provider(claims);
      const app = buildApp(provider);

      const identity = await app.auth!.getIdentity!();
      const permissions = await app.auth!.getPermissions!();

      expect(identity).toEqual({
        sub: 'auth0-user-1',
        claims,
      });
      expect(permissions).toEqual({
        roles: ['invoice:read', 'invoice:export'],
        permissions: ['audit:read'],
      });
    });

    it('supports canAccess, canAccessMany, evaluateAccess, and evaluateMany on typical queries', async () => {
      const claims: Auth0Claims = {
        sub: 'auth0-user-2',
        scope: 'invoice:read invoice:export',
        permissions: ['audit:read'],
      };
      const provider = makeAuth0Provider(claims);
      const app = buildApp(provider);

      const queries: AccessQuery[] = [
        { action: 'read', resource: 'invoice' },
        { action: 'delete', resource: 'invoice' },
        { action: 'read', resource: 'audit' },
      ];

      await expect(app.auth!.canAccess(queries[0])).resolves.toBe('allow');
      await expect(app.auth!.canAccess(queries[1])).resolves.toBe('deny');
      await expect(app.auth!.canAccessMany(queries)).resolves.toEqual(['allow', 'deny', 'allow']);

      await expect(app.auth!.evaluateAccess(queries[0])).resolves.toMatchObject({
        decision: 'allow',
        reason: 'allowed',
        meta: {
          source: 'scope',
          subject: 'auth0-user-2',
        },
      });
      await expect(app.auth!.evaluateAccess(queries[1])).resolves.toMatchObject({
        decision: 'deny',
        reason: 'policy_not_found',
        meta: {
          source: 'none',
          subject: 'auth0-user-2',
        },
      });
      await expect(app.auth!.evaluateMany(queries)).resolves.toEqual([
        {
          decision: 'allow',
          reason: 'allowed',
          meta: {
            source: 'scope',
            subject: 'auth0-user-2',
          },
        },
        {
          decision: 'deny',
          reason: 'policy_not_found',
          meta: {
            source: 'none',
            subject: 'auth0-user-2',
          },
        },
        {
          decision: 'allow',
          reason: 'allowed',
          meta: {
            source: 'permissions',
            subject: 'auth0-user-2',
          },
        },
      ]);
    });

    it('fails closed when evaluateAccess returns a malformed payload', async () => {
      const claims: Auth0Claims = {
        sub: 'auth0-user-3',
        scope: 'invoice:read',
        permissions: ['audit:read'],
      };
      const provider = makeAuth0Provider(claims, {
        malformedDecisionResource: 'broken',
      });
      const app = buildApp(provider);

      await expect(
        app.auth!.evaluateAccess({ action: 'read', resource: 'broken' }),
      ).resolves.toMatchObject({
        decision: 'deny',
        reason: 'provider_error',
      });
    });

    it('fails closed when evaluateAccess returns malformed constraints/reason/meta shape', async () => {
      const claims: Auth0Claims = {
        sub: 'auth0-user-4',
        scope: 'invoice:read',
        permissions: ['audit:read'],
      };
      const provider = makeAuth0Provider(claims, {
        malformedConstraintsResource: 'broken-constraints',
        malformedReasonShapeResource: 'broken-reason',
        malformedMetaShapeResource: 'broken-meta',
      });
      const app = buildApp(provider);

      await expect(
        app.auth!.evaluateAccess({ action: 'read', resource: 'broken-constraints' }),
      ).resolves.toEqual({
        decision: 'deny',
        reason: 'provider_error',
      });
      await expect(
        app.auth!.evaluateAccess({ action: 'read', resource: 'broken-reason' }),
      ).resolves.toEqual({
        decision: 'deny',
        reason: 'provider_error',
      });
      await expect(
        app.auth!.evaluateAccess({ action: 'read', resource: 'broken-meta' }),
      ).resolves.toEqual({
        decision: 'deny',
        reason: 'provider_error',
      });
    });

    it('passes through provider-defined reason and nested constraints/meta payloads', async () => {
      const claims: Auth0Claims = {
        sub: 'auth0-user-5',
        scope: 'invoice:read',
        permissions: ['audit:read'],
      };
      const provider = makeAuth0Provider(claims, {
        extensiblePayloadResource: 'extensible',
      });
      const app = buildApp(provider);

      await expect(
        app.auth!.evaluateAccess({ action: 'read', resource: 'extensible' }),
      ).resolves.toEqual({
        decision: 'deny',
        reason: 'tenant_scope_conflict',
        constraints: [
          {
            predicate: {
              field: 'tenant.id',
              op: 'custom_eq',
              value: 'acme',
            },
          },
        ],
        meta: {
          source: 'scope',
          nested: { policyId: 'p-1' },
        },
      });
    });
  });
});
