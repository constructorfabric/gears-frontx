# Feature: Engine Provider


<!-- toc -->

- [1. Feature Context](#1-feature-context)
  - [1.1 Overview](#11-overview)
  - [1.2 Purpose](#12-purpose)
  - [1.3 Actors](#13-actors)
  - [1.4 References](#14-references)
  - [1.5 Port Shapes](#15-port-shapes)
- [2. Actor Flows (CDSL)](#2-actor-flows-cdsl)
  - [Swap The Router Engine Used By One Microfrontend](#swap-the-router-engine-used-by-one-microfrontend)
- [3. Processes / Business Logic (CDSL)](#3-processes--business-logic-cdsl)
  - [History Adaptation To The RouterHistory Contract](#history-adaptation-to-the-routerhistory-contract)
  - [Router Creation And Mount Under basepath](#router-creation-and-mount-under-basepath)
  - [Location-Preserving Navigation Helper](#location-preserving-navigation-helper)
  - [Teardown On Unmount](#teardown-on-unmount)
  - [Standalone Deployment Of A Single Microfrontend](#standalone-deployment-of-a-single-microfrontend)
- [4. States (CDSL)](#4-states-cdsl)
  - [No Feature-Owned State Machine](#no-feature-owned-state-machine)
- [5. Definitions of Done](#5-definitions-of-done)
  - [History Adaptation And Router Construction Under basepath](#history-adaptation-and-router-construction-under-basepath)
  - [Location-Preserving Redirect And Standalone Deployment](#location-preserving-redirect-and-standalone-deployment)
  - [Teardown Unsubscription On Unmount](#teardown-unsubscription-on-unmount)
- [6. Acceptance Criteria](#6-acceptance-criteria)

<!-- /toc -->

- [ ] `p1` - **ID**: `cpt-frontx-featstatus-routing-engine-provider`
## 1. Feature Context

- [ ] `p2` - `cpt-frontx-feature-routing-engine-provider`

### 1.1 Overview

The Engine Provider is the sole component permitted to import a concrete router engine. It adapts the navigation substrate's own `NavigationHistory` contract into the `RouterHistory` contract a concrete engine expects — filling in the members `NavigationHistory` does not provide and translating `NavigationHistory`'s own notification into the `SubscriberArgs` shape (`location`, `action`) the engine's `subscribe` callback expects — constructs that engine's router with `createRouter({ routeTree, history, basepath })`, and mounts it into the microfrontend's own component tree via `RouterProvider`. The default provider this package ships binds this adapter to TanStack Router, using its React binding (`@tanstack/react-router`) and `@tanstack/history`; a microfrontend may replace its own provider with a different one satisfying the same engine-provider port.

### 1.2 Purpose

A router engine renders routes and matches search parameters, and concrete engines evolve on their own release cadence, independent of the navigation substrate and of every other microfrontend in the realm. Confining engine choice to a swappable, per-microfrontend adapter is what keeps that evolution — or an outright engine replacement — from reaching the substrate, the host, or a sibling microfrontend. This feature exists to be that adapter: it is the only place a concrete engine's package is imported, and the only place `NavigationHistory` is translated into what `createRouter` expects as `RouterHistory`.

**Requirements**: `cpt-frontx-routing-fr-engine-provider-port`, `cpt-frontx-routing-fr-scoped-navigation-zone`, `cpt-frontx-routing-fr-standalone-deployment`, `cpt-frontx-routing-fr-location-preserving-helpers`, `cpt-frontx-routing-nfr-agnostic-core`

**Principles**: `cpt-frontx-routing-principle-engine-behind-port`

### 1.3 Actors

| Actor | Role in Feature |
|-------|-----------------|
| `cpt-frontx-routing-actor-microfrontend-developer` | Builds a microfrontend's own router scoped to its declared `basepath`, may replace the engine provider inside that microfrontend's own build without touching anything outside it, and uses the location-preserving navigation helper for a redirect that must carry search and hash forward. |
| `cpt-frontx-routing-actor-router-engine` | The pluggable, replaceable engine an engine provider binds the shared history to; TanStack Router is the default, constructed via `createRouter({ routeTree, history, basepath })`. |

### 1.4 References

- **PRD**: [PRD.md](../../PRD.md)
- **Design**: [DESIGN.md](../../DESIGN.md)
- **Use case**: `cpt-frontx-routing-usecase-swap-router-engine`
- **Component**: `cpt-frontx-component-routing-engine-provider`
- **Constraints**: `cpt-frontx-constraint-routing-no-engine-leak`
- **Dependencies**: `cpt-frontx-feature-routing-navigation-substrate` — the provider implements the engine port the substrate defines, the same shape as the runtime's type-substrate port and its default GTS provider.

**Territory boundary**: Replacing the engine provider used by one microfrontend is scoped to that microfrontend's own route tree and its own search-parameter handling. It reaches no further: the navigation substrate, the `basepath` contract, the route ownership signal (`cpt-frontx-feature-routing-route-ownership-signal`), the host's code, and every sibling microfrontend are unaffected and may remain on a different engine provider of their own.

### 1.5 Port Shapes

Field-level shape of the engine-provider port a replacement provider must satisfy, per `cpt-frontx-adr-contract-schema-ownership` (owned contract role in DESIGN, decision rationale in the ADR, field-level schema here in the owning FEATURE).

A replacement provider **MUST** accept:
- The navigation substrate's `NavigationHistory` instance (`location`, `subscribe`, `push`, `replace`, `go`) as its history input — the same instance every other unit in the realm reads and writes, not a copy or a wrapper that diverges from it.
- The `basepath` assigned to the microfrontend it is mounted for (absent or deployment-supplied in the standalone case, per `cpt-frontx-algo-routing-engine-provider-standalone-deployment`).
- The microfrontend's own route tree, as an opaque value it does not require the navigation substrate to understand.

A replacement provider is responsible for producing its own engine's history-contract object from `NavigationHistory` — deriving whatever members its own engine's contract requires beyond `location`/`subscribe`/`push`/`replace`/`go`, and translating `NavigationHistory`'s notification into whatever shape its own engine's `subscribe` callback expects. This package makes no claim about a different engine's exact history-contract shape; the default provider's own translation into `RouterHistory`/`SubscriberArgs` (§3, History Adaptation) is a worked example, not a mandate on a replacement provider's own target contract.

**Diagnostic of mismatch**: A replacement provider that cannot accept `NavigationHistory` as-is — for example, one whose own engine's history contract requires a constructor argument this port does not supply — fails at construction rather than at first navigation: it cannot receive the shared history, so the microfrontend's routing does not initialize (`cpt-frontx-routing-usecase-swap-router-engine`, Alternative Flow). This failure is local to the microfrontend that adopted the mismatched provider; it does not reach the substrate, the host, or a sibling microfrontend.

## 2. Actor Flows (CDSL)

### Swap The Router Engine Used By One Microfrontend

- [ ] `p1` - **ID**: `cpt-frontx-flow-routing-engine-provider-swap-engine`

**Actor**: `cpt-frontx-routing-actor-microfrontend-developer`

**Use cases**: `cpt-frontx-routing-usecase-swap-router-engine`

**Success Scenarios**:
- A microfrontend mounted under a declared `basepath`, currently using the default TanStack Router engine provider, has its engine provider replaced with a different one satisfying the same engine-provider port (§1.5); the microfrontend's own route tree and search-parameter handling move to the new engine, and nothing outside the microfrontend's own territory changes.

**Error Scenarios**:
- The replacement provider does not satisfy the engine-provider port (§1.5): it cannot accept the shared `NavigationHistory` instance and adapt it into whatever history contract its own engine requires, and the microfrontend's routing does not initialize.

**Steps**:
1. [ ] - `p1` - The Microfrontend Developer replaces the engine provider inside that microfrontend's own build with a different one satisfying the same engine-provider port - `inst-replace-provider`
2. [ ] - `p1` - The replacement provider is handed the same navigation substrate's shared `NavigationHistory` instance and the same `basepath` the previous provider used - `inst-hand-same-history-basepath`
3. [ ] - `p1` - The replacement provider adapts that shared `NavigationHistory` into whatever history contract its own engine expects (the default provider's own worked example is `cpt-frontx-algo-routing-engine-provider-history-adaptation`, translating into `RouterHistory`/`SubscriberArgs`) - `inst-adapt-history`
4. [ ] - `p1` - **IF** the replacement provider does not satisfy the engine-provider port - `inst-if-contract-unsatisfied`
   1. [ ] - `p1` - **RETURN** failure — the microfrontend's routing does not initialize - `inst-return-init-failure`
5. [ ] - `p1` - **ELSE** the replacement provider constructs its engine's router and mounts it under the assigned `basepath` (`cpt-frontx-algo-routing-engine-provider-router-creation`) - `inst-construct-and-mount`
6. [ ] - `p1` - The microfrontend's own route tree and search-parameter handling move to the new engine; nothing outside the microfrontend's own territory changes - `inst-territory-confined`

**Postconditions**:
- The navigation substrate, the host, and every sibling microfrontend observe no change.

## 3. Processes / Business Logic (CDSL)

### History Adaptation To The RouterHistory Contract

- [ ] `p2` - **ID**: `cpt-frontx-algo-routing-engine-provider-history-adaptation`

**Input**: The navigation substrate's shared `NavigationHistory` instance, exposing `location`, `subscribe`, `push`, `replace`, `go`.

**Output**: An object satisfying the `RouterHistory` contract of `@tanstack/history`, usable as `createRouter`'s `history` input.

**Steps**:
1. [ ] - `p1` - Expose `NavigationHistory`'s `location`, `push`, `replace`, and `go` directly as the corresponding members of the `RouterHistory` object - `inst-expose-direct-members`
2. [ ] - `p1` - Derive the `RouterHistory` members `NavigationHistory` does not provide: `back` and `forward` from `go(-1)` and `go(1)`; construct `canGoBack`, `createHref`, `block`, `flush`, `destroy`, `notify`, `length`, and `subscribers` against `NavigationHistory`'s own state and calls - `inst-derive-missing-members`
3. [ ] - `p1` - Expose `RouterHistory`'s `subscribe(cb)` by registering an internal callback against `NavigationHistory`'s own `subscribe`, and from inside that internal callback, construct the `SubscriberArgs` shape (`location`, `action`) `RouterHistory`'s `cb` expects before invoking `cb` with it: `SubscriberArgs.location` is carried through from `NavigationHistory`'s own notification's Location field, and `SubscriberArgs.action` is derived directly from that same notification's navigation-kind field (`cpt-frontx-feature-routing-navigation-substrate` §1.5, Contract Shapes — `push`, `replace`, or a history move) — `action` is never invented or independently inferred by this adapter; `NavigationHistory`'s own notification is not itself a `SubscriberArgs` value, and this translation is this algorithm's responsibility, not `NavigationHistory`'s - `inst-adapt-subscribe`
4. [ ] - `p1` - **RETURN** the adapted `RouterHistory` object - `inst-return-adapted-history`

### Router Creation And Mount Under basepath

- [ ] `p2` - **ID**: `cpt-frontx-algo-routing-engine-provider-router-creation`

**Input**: The adapted `RouterHistory` object; the microfrontend's own route tree; the `basepath` assigned to this microfrontend, when the microfrontend is mounted under a host.

**Output**: A router instance built via `createRouter({ routeTree, history, basepath })`, mounted into the microfrontend's own component tree via `RouterProvider`.

**Steps**:
1. [ ] - `p1` - Call `createRouter({ routeTree, history, basepath })` with the microfrontend's own route tree and the adapted history - `inst-call-create-router`
2. [ ] - `p1` - **IF** a `basepath` was assigned (the microfrontend is mounted under a host) - `inst-if-basepath-assigned`
   1. [ ] - `p1` - The constructed router matches only the remainder of the URL beneath that `basepath` - `inst-scope-to-basepath`
3. [ ] - `p1` - **ELSE** the `basepath` came from the deployment rather than from a host assignment, or is absent because the microfrontend is served at a root (`cpt-frontx-algo-routing-engine-provider-standalone-deployment`) - `inst-else-deployment-basepath`
4. [ ] - `p1` - Mount the constructed router into the microfrontend's own component tree via `RouterProvider` - `inst-mount-router-provider`
5. [ ] - `p1` - **RETURN** the mounted router - `inst-return-mounted-router`

### Location-Preserving Navigation Helper

- [ ] `p2` - **ID**: `cpt-frontx-algo-routing-engine-provider-index-redirect`

**Input**: A target path a consumer is redirecting or navigating to; the current location's search and hash.

**Output**: A `redirect` (or other navigation call) to the target path carrying the current location's search and hash forward, reusable by any consumer redirect — an index-route redirect is one call site, not the only one.

**Steps**:
1. [ ] - `p1` - Accept the target path from the caller — a route's own redirect target, an index route's resolved destination, or any other consumer-supplied path - `inst-accept-target-path`
2. [ ] - `p1` - Read the current location's search and hash - `inst-read-current-search-hash`
3. [ ] - `p1` - Carry that search and hash forward onto the target path, rather than requiring the caller to assemble the carry-forward itself - `inst-carry-search-hash`
4. [ ] - `p1` - **RETURN** the `redirect` (or navigation call) to the target path with search and hash intact - `inst-return-redirect`

**Rationale**: A redirect built from the target path alone silently drops the current location's search and hash — a mistake that looks correct until a query parameter or hash fragment disappears in front of a user. Generalizing this helper to any consumer redirect, rather than leaving it as private knowledge inside one application's own index-route handling, is what makes the correct behavior the path of least resistance for every redirect this package's consumers write (`cpt-frontx-routing-fr-location-preserving-helpers`).

### Teardown On Unmount

- [ ] `p2` - **ID**: `cpt-frontx-algo-routing-engine-provider-teardown`

**Input**: A constructed router whose microfrontend is being unmounted; the internal callback (§3, History Adaptation) that router's adapted `RouterHistory` registered against the shared `NavigationHistory`'s `subscribe`.

**Output**: The internal callback unsubscribed from the shared `NavigationHistory`, so the unmounted router's own `RouterHistory` stops receiving the fan-out.

**Steps**:
1. [ ] - `p1` - **WHEN** the microfrontend that owns this constructed router is unmounted (the host's own mount mechanism unmounting it, informed by `cpt-frontx-feature-routing-route-ownership-signal`'s observable ownership-change transition, or the host's own teardown for any other reason) - `inst-when-unmount`
   1. [ ] - `p1` - Invoke the unsubscribe function returned when this adapter registered its internal callback against the shared `NavigationHistory`'s `subscribe` - `inst-invoke-unsubscribe`
2. [ ] - `p1` - **RETURN** - `inst-return-teardown`

**Rationale**: If this step is skipped, the torn-down router's own `RouterHistory` callback keeps receiving the shared history's fan-out for a component tree that no longer exists — a leaked subscription that grows with every mount/unmount cycle a long-lived host session runs through. This is the Engine Provider's own responsibility because it is the component that registered the internal callback in the first place (§3, History Adaptation); the navigation substrate has no notion of "this listener's microfrontend was unmounted" to act on even if it wanted to.

### Standalone Deployment Of A Single Microfrontend

- [ ] `p2` - **ID**: `cpt-frontx-algo-routing-engine-provider-standalone-deployment`

**Input**: The microfrontend's own route tree and adapted history; a `basepath` taken from the deployment's own configuration rather than from a host assignment — absent when the microfrontend is served at a root, the publication sub-path otherwise; whether the consumer has created a route-ownership-signal observer (`cpt-frontx-feature-routing-route-ownership-signal`) for this deployment — a plain argument-driven choice the consumer makes, not a port-injection state.

**Output**: A router constructed and mounted through the same path the composed case uses, independent of whether the consumer has created a route-ownership-signal observer for this deployment.

**Steps**:
1. [ ] - `p1` - Take the `basepath` from the deployment's configuration rather than from a host assignment — absent when served at a root, the publication sub-path otherwise - `inst-basepath-from-deployment`
2. [ ] - `p1` - **IF** the consumer has not created a route-ownership-signal observer for this deployment - `inst-if-no-signal`
   1. [ ] - `p1` - No owner resolution, no mount, and no URL back-projection runs — the deliberate standalone-deployment case - `inst-no-signal-inert`
3. [ ] - `p1` - **ELSE** the consumer has created the observer, supplying its own owner-prefix pairs source - `inst-else-signal-created`
   1. [ ] - `p1` - The observer resolves and reports ownership transitions exactly as in the composed case (`cpt-frontx-feature-routing-route-ownership-signal` §3), and the consumer's own mount mechanism acts on them - `inst-signal-active`
4. [ ] - `p1` - Construct the router through the same `createRouter({ routeTree, history, basepath })` call the composed case uses, passing the deployment-supplied `basepath` or omitting it when serving at a root - `inst-construct-with-deployment-basepath`
5. [ ] - `p1` - Mount the router via `RouterProvider` through the same construction path as the composed case - `inst-mount-standalone-router`
6. [ ] - `p1` - **IF** a navigation targets a path the microfrontend's own route tree does not declare, and no route-ownership-signal observer is driving mounting for this deployment - `inst-if-undeclared-path`
   1. [ ] - `p1` - Resolution reaches the engine's own `notFound` route inside this microfrontend's own route tree — a different mechanism from the composed mode's host-level fallback (no route-ownership-signal observer is participating at all in standalone mode), even though the user-visible result is the same not-found screen either way - `inst-standalone-fallback`
7. [ ] - `p1` - **RETURN** the mounted router — differing from the composed case only in where the `basepath` came from and in whether a route-ownership-signal observer exists at all - `inst-return-standalone-router`

Two conditions of this mode fall on the deployment rather than on this feature: the server answering every path beneath the `basepath` with the entry document, without which a deep link fails before any of this package's code runs; and the build's asset base URL, configured independently of the router's `basepath` since neither derives from the other.

## 4. States (CDSL)

### No Feature-Owned State Machine

Not applicable. The Engine Provider adapts a history and constructs a router; it holds no binding or occupancy lifecycle of its own to model as named states with guarded transitions — no feature in this package defines one, since mounting and occupancy belong entirely to whichever mount mechanism the consumer already runs (`cpt-frontx-feature-routing-route-ownership-signal` §4). A constructed router's internal request/route-matching state is the concrete engine's own concern, opaque to this adapter, and not something this package specifies, so no state machine is defined for this feature.

## 5. Definitions of Done

### History Adaptation And Router Construction Under basepath

- [ ] `p1` - **ID**: `cpt-frontx-dod-routing-engine-provider-adaptation-and-creation`

The system **MUST** adapt the navigation substrate's shared `NavigationHistory` into a `RouterHistory` object — exposing `location`, `push`, `replace`, `go` directly, deriving the members `NavigationHistory` does not provide, and constructing `SubscriberArgs` (`location`, `action`) for `RouterHistory`'s `subscribe` callback from `NavigationHistory`'s own notification — and **MUST** construct the engine's router via `createRouter({ routeTree, history, basepath })`, scoped to the assigned `basepath` when one is supplied, and mount it into the microfrontend's own component tree via `RouterProvider`. Every component of this package other than the Engine Provider **MUST NOT** import a concrete router engine; the Engine Provider is the sole, deliberate exception to that prohibition.

**Implements**:
- `cpt-frontx-flow-routing-engine-provider-swap-engine`
- `cpt-frontx-algo-routing-engine-provider-history-adaptation`
- `cpt-frontx-algo-routing-engine-provider-router-creation`

**Addresses**:
- `cpt-frontx-routing-fr-engine-provider-port`
- `cpt-frontx-routing-fr-scoped-navigation-zone`
- `cpt-frontx-routing-nfr-agnostic-core`
- `cpt-frontx-routing-principle-engine-behind-port`

**Constraints**: `cpt-frontx-constraint-routing-no-engine-leak`

**Touches**:
- Component: `cpt-frontx-component-routing-engine-provider`

### Location-Preserving Redirect And Standalone Deployment

- [ ] `p1` - **ID**: `cpt-frontx-dod-routing-engine-provider-redirect-and-standalone`

The system **MUST** provide a reusable navigation helper that carries the current location's search and hash forward onto any consumer-supplied redirect target, rather than dropping them as a naive redirect would — usable from an index-route redirect or any other consumer redirect alike — and **MUST** run the same router construction when the microfrontend is deployed on its own — taking the `basepath` from the deployment's configuration instead of a host assignment, omitting it when served at a root, and resolving an undeclared path to the engine's own `notFound` rather than a host-level fallback when no route-ownership-signal observer is driving mounting for this deployment.

**Implements**:
- `cpt-frontx-algo-routing-engine-provider-index-redirect`
- `cpt-frontx-algo-routing-engine-provider-standalone-deployment`

**Addresses**:
- `cpt-frontx-routing-fr-location-preserving-helpers`
- `cpt-frontx-routing-fr-standalone-deployment`

**Touches**:
- Component: `cpt-frontx-component-routing-engine-provider`

### Teardown Unsubscription On Unmount

- [ ] `p1` - **ID**: `cpt-frontx-dod-routing-engine-provider-teardown`

The system **MUST** unsubscribe a constructed router's adapted `RouterHistory` from the shared `NavigationHistory` when the microfrontend that owns that router is unmounted, so a torn-down router's callback stops receiving the fan-out.

**Implements**:
- `cpt-frontx-algo-routing-engine-provider-teardown`

**Addresses**:
- `cpt-frontx-routing-fr-engine-provider-port`

**Touches**:
- Component: `cpt-frontx-component-routing-engine-provider`

## 6. Acceptance Criteria

- [ ] The default engine provider adapts the navigation substrate's shared `NavigationHistory` into a `RouterHistory` object: `location`, `push`, `replace`, `go` exposed directly; `back`, `forward`, `canGoBack`, `createHref`, `block`, `flush`, `destroy`, `notify`, `length`, `subscribers` derived; and `SubscriberArgs` (`location`, `action`) constructed for `RouterHistory`'s `subscribe` callback from `NavigationHistory`'s own notification — `action` derived from that notification's navigation-kind field, never invented by this adapter — rather than assuming `NavigationHistory` already supplies the `SubscriberArgs` shape.
- [ ] `createRouter({ routeTree, history, basepath })` is called with the adapted history and the microfrontend's own route tree; the resulting router is mounted via `RouterProvider`.
- [ ] When a `basepath` is assigned, the constructed router matches only the remainder of the URL beneath it.
- [ ] Replacing the engine provider used by one microfrontend changes no file outside that microfrontend's own route tree and search-parameter handling.
- [ ] A replacement provider that cannot accept the shared `NavigationHistory` and adapt it into its own engine's history contract fails to receive the shared history, and the microfrontend's routing does not initialize.
- [ ] Every component of this package other than the Engine Provider does not import a concrete router engine or its packages directly; the Engine Provider is the sole exception.
- [ ] The location-preserving navigation helper preserves the current location's search and hash for any consumer redirect, including but not limited to a redirect issued from an index route.
- [ ] A microfrontend deployed on its own runs the same router construction, taking its `basepath` from the deployment's configuration or omitting it at a root, resolving an undeclared path to the engine's own `notFound` rather than a host-level fallback, with no route-ownership-signal observer created for this deployment.
- [ ] When a microfrontend is unmounted, its constructed router's adapted `RouterHistory` is unsubscribed from the shared `NavigationHistory`, so it stops receiving further fan-out.
