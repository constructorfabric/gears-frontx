# Playbook: External AI Agent For AuthProvider

Date: 2026-03-27

## Role split

This document assumes two roles:

- Architect/Reviewer: defines scope, gives implementation tasks, reviews results, requests corrections
- External AI Agent: executes scoped implementation work and reports exact outputs

The architect/reviewer owns:

- contract decisions
- task decomposition
- review criteria
- acceptance decisions
- manual validation plan

The external agent owns:

- code changes inside approved scope
- tests
- build/type/lint fixes
- implementation notes for review

## Working rules for the external agent

The agent must not invent architecture. It must implement against this playbook and the architecture exploration.

Before touching code, the agent must:

1. Read:
- `AGENTS.md`
- `.ai/GUIDELINES.md`
- `.ai/targets/API.md`
- `.ai/targets/FRAMEWORK.md`
- `architecture/explorations/2026-03-27-authprovider-architecture-research.md`

2. Report back:
- target package(s)
- exact files it plans to edit
- assumptions
- blockers

3. Wait for approval if the write scope expands beyond the agreed task.

## Deliverables per implementation cycle

For each cycle, the external agent must return:

1. Scope completed
2. Files changed
3. Public API added or changed
4. Tests added or updated
5. Commands run
6. Remaining risks
7. Questions for reviewer

## Execution protocol

Each implementation cycle must use this sequence:

1. Reviewer issues a scoped task with:
- allowed write scope
- forbidden scope
- acceptance criteria
- mandatory verification commands

2. External agent responds with:
- planned files
- assumptions
- blockers

3. Reviewer approves or narrows scope.

4. External agent implements only within the approved scope and returns:
- files changed
- API changes
- tests
- commands run
- unresolved risks

5. Reviewer performs code review before the next cycle starts.

The agent must not batch multiple phases into one cycle without explicit approval.

## Cycle template for the reviewer

Use this structure when assigning work:

```text
Target agent:
[PLANNER OR IMPLEMENTER]

Recommended model:
[MODEL / MODE]

Cycle name:
[NAME]

Goal:
[GOAL]

Allowed write scope:
- [FILE OR DIRECTORY]

Forbidden scope:
- [FILE OR DIRECTORY]

Requirements:
- [REQUIREMENT]

Acceptance criteria:
- [CRITERION]

Mandatory commands:
- [COMMAND]

Return format:
1. planned files
2. assumptions
3. blockers
4. changed files
5. API changes
6. tests
7. commands run
8. remaining risks
9. questions
```

## First implementation phases

### Phase 1 - Contract scaffolding

Goal:

- define core auth types
- define provider contract
- define transport adapter contract
- do not implement business logic yet

Expected output:

- type definitions only
- minimal no-op or placeholder factories where needed
- compile-safe exports

Notes:

- FORBIDDEN in Phase 1: React bindings, routes, UI helpers.
- FORBIDDEN in Phase 1: TanStack Query integration.
- Rationale: keep `@gears-frontx/auth` core framework-agnostic and transport-agnostic; React and Query belong in separate layers/packages.

### Phase 2 - Framework integration surface

Goal:

- make plugin-contributed runtime extensible without special-casing AuthProvider
- or, if reviewer approves a temporary workaround, document the workaround explicitly

Expected output:

- framework changes only
- no auth business logic yet

### Phase 3 - Gears FrontX API transport adapter

Goal:

- bind auth session to REST/SSE plugins
- support bearer token mode
- support cookie-session mode within current framework limits
- support auth failure handling and refresh hooks

Expected output:

- adapter implementation
- tests for REST header injection, SSE behavior, retry/refresh flow

Additional requirement for cookie-session turnkey:

- If REST requires credentials, the adapter must be able to enable `withCredentials` per request globally without per-service protocol construction changes.
- This likely requires a minimal `@gears-frontx/api` change (types + RestProtocol request config).

### Phase 4 - Auth runtime plugin

Goal:

- create `auth()` plugin
- wire provider + transport
- expose runtime API
- add minimal state/actions only if justified

Expected output:

- plugin factory
- lifecycle wiring
- cleanup

### Phase 5 - Query integration

Goal:

- optional integration for apps using `queryCache()` and descriptor-based API usage
- cache invalidation on auth boundary changes
- cancellation-aware bootstrap where justified

Expected output:

- strictly optional integration
- no hard dependency on TanStack Query in core auth contract

### Phase 6 - Example providers

Goal:

- bearer token provider example
- cookie-session provider example
- OAuth/OIDC callback-oriented example

Expected output:

- examples or fixtures
- clear documentation of limitations

## Reviewer checklist

The reviewer must check:

1. No router/UI semantics leaked into core auth contract
2. No React dependency leaked below React layer
3. No token ownership moved into `@gears-frontx/api`
4. `canAccess` remains primary authz API
5. Query integration remains optional
6. Cookie-session limitations are explicit, not hidden
7. Tests cover REST, SSE, refresh, logout, and no-auth/public-service scenarios
8. Service-level exclusion remains usable for health/auth-refresh/public endpoints

## Manual validation plan after implementation

We will manually validate:

1. Bearer token flow
- login
- authenticated request
- token refresh on 401
- logout

2. Cookie-session flow
- login creating server session
- authenticated request with credentials
- logout invalidating server session

3. OAuth/OIDC callback flow
- callback handling
- post-callback authenticated request
- logout

4. Authorization flow
- allow path
- deny path
- no-auth/public path

5. Failure flow
- expired session
- failed refresh
- invalid callback
- canceled request

## Prompt template for the external agent

Use this prompt as the starting point:

```text
You are implementing AuthProvider for Gears FrontX.

Read first:
- AGENTS.md
- .ai/GUIDELINES.md
- .ai/targets/API.md
- .ai/targets/FRAMEWORK.md
- architecture/explorations/2026-03-27-authprovider-architecture-research.md
- architecture/explorations/2026-03-27-authprovider-agent-playbook.md

Constraints:
- Do not invent architecture beyond these documents.
- Do not expand scope without stating it first.
- Report exact files to edit before editing them.
- Keep TanStack Query integration optional.
- Keep AuthProvider core independent from React and independent from any single HTTP client.
- Use @gears-frontx/api transport hooks when available; otherwise work through the adapter contract.

Your current task is:
[PASTE SCOPED TASK HERE]

Return:
1. planned files
2. assumptions
3. code changes
4. tests
5. commands run
6. remaining risks
7. questions
```

## Questions to keep active

Questions for the user:

1. Do we want remote `canAccess` in v1, or only local claim/role evaluation?
2. Which external public test stands are acceptable for manual validation?

Questions for the external agent:

1. Did you need a framework extensibility change, or did you use a temporary workaround?
2. Which auth flows are fully covered by tests?
3. Which behaviors remain branch-dependent on `feat/request-cancellation`?

## Confirmed project decisions

1. A dedicated package name `@gears-frontx/auth` is acceptable.
2. Cookie-session must work in the first release without requiring the developer to manually set `withCredentials` on each REST service.
3. Reviewer prompts must always specify:
- target agent
- recommended model
- mode when relevant

## Recommended first execution cycle

Start with a narrow contract-first task before any framework or transport changes.

```text
Target agent:
Implementer

Recommended model:
Claude Sonnet in Plan Mode

Cycle name:
Auth Contract Scaffolding

Goal:
Create the headless AuthProvider contract and related types without implementing business logic.

Allowed write scope:
- packages/*/src/** where a new auth package or auth module is introduced
- package export files directly related to auth contract exposure
- tests that only validate type-level or factory-level scaffolding

Forbidden scope:
- packages/api/src/BaseApiService.ts
- packages/api/src/apiRegistry.ts
- packages/framework/src/createGears FrontX.ts
- packages/react/**

Requirements:
- Keep the contract framework-agnostic.
- Keep the contract transport-agnostic.
- Include `canAccess` as the primary optional authorization API.
- Include optional transport failure handling instead of react-admin style redirect semantics.
- Include context support for `AbortSignal`.
- Do not introduce React, router, or UI concerns.

Acceptance criteria:
- Core auth types compile.
- Export surface is coherent and minimal.
- No business logic is hardcoded into the contract layer.
- No dependency on TanStack Query exists in the core contract.

Mandatory commands:
- pnpm --filter <target-package> test
- pnpm --filter <target-package> typecheck

Return format:
1. planned files
2. assumptions
3. blockers
4. changed files
5. API changes
6. tests
7. commands run
8. remaining risks
9. questions
```
