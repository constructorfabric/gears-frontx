# @gears-frontx/auth Guidelines (Canonical)

## AI WORKFLOW (REQUIRED)
1) Summarize 3-6 rules from this file before making changes.
2) STOP if you add framework, React, or HTTP transport dependencies.

## SCOPE
- Package: `packages/auth/`
- Layer: L1 SDK (zero @hai3 dependencies)
- Purpose: headless authentication contract (types only)

## CRITICAL RULES
- REQUIRED: Only TypeScript interfaces and type aliases. No runtime code.
- REQUIRED: No React, no @gears-frontx/framework, no @gears-frontx/api imports.
- REQUIRED: AuthProvider contract is the single extension point.
- REQUIRED: Session mechanism via `AuthSession.kind` discriminant (bearer | cookie | custom).
- REQUIRED: All provider methods accept optional `AuthContext` with AbortSignal.

## AUTH PROVIDER CONTRACT

### Required methods
- `getSession(ctx?)` -> AuthSession | null
- `checkAuth(ctx?)` -> AuthCheckResult
- `logout(ctx?)` -> AuthTransition

### Optional lifecycle
- `login?(input, ctx?)` -> AuthTransition
- `handleCallback?(input, ctx?)` -> AuthTransition (OAuth/SAML redirects)
- `refresh?(ctx?)` -> AuthSession | null
- `destroy?()` -> void | Promise<void>

### Optional identity & permissions
- `getIdentity?(ctx?)` -> AuthIdentity | null
- `getPermissions?(ctx?)` -> AuthPermissions
- `canAccess?(query, ctx?)` -> AccessDecision ('allow' | 'deny')

### Optional events
- `onTransportError?(event)` -> void (informational, called by transport binding)
- `subscribe?(listener)` -> AuthUnsubscribe

## SESSION KINDS
- `bearer`: transport attaches `Authorization: Bearer <token>` header.
- `cookie`: transport sets `withCredentials: true` + optional CSRF header.
- `custom`: provider-defined, transport ignores.

## ACCESS CONTROL
- Primary API: `canAccess(query)` with action + resource + optional record.
- NOT roles-first: roles are metadata inside AuthPermissions, not the primary check.

## STOP CONDITIONS
- Adding runtime code (classes, functions, side effects).
- Adding @gears-frontx/* or third-party dependencies.
- Adding React components or hooks.
- Adding HTTP/transport logic (belongs in @gears-frontx/framework auth plugin).
- Modifying AuthProvider required methods (breaking change).

## PRE-DIFF CHECKLIST
- [ ] Only type exports (no runtime code).
- [ ] Zero dependencies in package.json.
- [ ] AuthProvider backward-compatible (new methods optional).
- [ ] All methods accept AuthContext for cancellation.
