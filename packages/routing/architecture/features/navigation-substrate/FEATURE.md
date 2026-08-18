# Feature: Navigation Substrate


<!-- toc -->

- [1. Feature Context](#1-feature-context)
  - [1.1 Overview](#11-overview)
  - [1.2 Purpose](#12-purpose)
  - [1.3 Actors](#13-actors)
  - [1.4 References](#14-references)
- [2. Actor Flows (CDSL)](#2-actor-flows-cdsl)
  - [Imperative Navigation Outside The UI Tree](#imperative-navigation-outside-the-ui-tree)
- [3. Processes / Business Logic (CDSL)](#3-processes--business-logic-cdsl)
  - [Realm-Global Singleton Resolution](#realm-global-singleton-resolution)
  - [Fan-Out Subscription Dispatch](#fan-out-subscription-dispatch)
  - [Route-Owner Resolution By Longest Matching Declared Prefix](#route-owner-resolution-by-longest-matching-declared-prefix)
- [4. States (CDSL)](#4-states-cdsl)
  - [No Feature-Owned State Machine](#no-feature-owned-state-machine)
- [5. Definitions of Done](#5-definitions-of-done)
  - [Single Realm-Shared History With Fan-Out Subscription And Prefix-Resolution Primitive](#single-realm-shared-history-with-fan-out-subscription-and-prefix-resolution-primitive)
  - [Imperative Navigation Surface Outside The UI Tree](#imperative-navigation-surface-outside-the-ui-tree)
- [6. Acceptance Criteria](#6-acceptance-criteria)

<!-- /toc -->

- [ ] `p1` - **ID**: `cpt-frontx-featstatus-routing-navigation-substrate`
## 1. Feature Context

- [ ] `p2` - `cpt-frontx-feature-routing-navigation-substrate`

### 1.1 Overview

*Navigation substrate* in this document names this agnostic core component alone, not the whole published package: `@gears-frontx/routing` is this core plus the Engine Provider and Screen Binding components specified in the sibling FEATUREs (root DESIGN and ADR 0002 use the same term at package granularity — a broader use than this FEATURE's own; see the package's own [DESIGN §1.1](../../DESIGN.md#11-architectural-vision)).

The Navigation Substrate is exactly one navigation-history instance per realm, reachable by the host and by every independently bundled microfrontend, with one real subscription against the browser's own navigation history fanned out to every listener — a fan-out its own `push`/`replace`/`go` calls trigger directly as a second dispatch path, since neither call raises the `popstate` event the browser subscription listens for. It exposes that history's `push`, `replace`, `go`, `location`, and `subscribe` — its own `NavigationHistory` contract — for use outside any mounted UI-framework component tree, and it carries the primitive that names which declared route owner a pathname belongs to — the longest matching declared prefix. It carries no dependency on a concrete router engine or UI framework; `NavigationHistory` is deliberately narrower than the `RouterHistory` contract a concrete engine expects; the Engine Provider is the component that adapts one into the other.

### 1.2 Purpose

Independently bundled units cannot share a compile-time singleton — each is its own module graph, built and shipped on its own schedule. A composed application built from such units still needs exactly one navigation history: programmatic navigation performed through `pushState` produces no `popstate` event, so it is invisible to any second copy of a history-managing module that did not perform the call itself. Left alone, two independently bundled copies of this package would each construct their own history instance, and a `push`/`replace`/`go` issued through one would leave the other holding a stale `location` — the two copies, and the routers built on top of them, would drift out of agreement with each other and with the address bar. The Navigation Substrate exists to make that divergence structurally impossible: every unit in the realm reaches the same instance, by construction, rather than by convention — which is also why the substrate's own `push`/`replace`/`go` must dispatch its fan-out directly rather than leaning on the `popstate` event alone: that event is exactly the signal a same-instance call never raises.

**Requirements**: `cpt-frontx-routing-fr-single-navigation-substrate`, `cpt-frontx-routing-fr-imperative-navigation`, `cpt-frontx-routing-fr-url-screen-binding`, `cpt-frontx-routing-nfr-agnostic-core`

**Principles**: `cpt-frontx-routing-principle-single-history-authority`

### 1.3 Actors

| Actor | Role in Feature |
|-------|-----------------|
| `cpt-frontx-routing-actor-application-developer` | Reaches the realm-shared history to navigate imperatively from code outside any UI-framework component tree — a mounting resolver, a host action handler, or a bootstrapping routine. |

### 1.4 References

- **PRD**: [PRD.md](../../PRD.md)
- **Design**: [DESIGN.md](../../DESIGN.md)
- **Component**: `cpt-frontx-component-routing-navigation-substrate`
- **Constraints**: `cpt-frontx-constraint-routing-no-engine-leak`, `cpt-frontx-constraint-routing-no-intra-ecosystem-dependency`
- **Dependencies**: None — this feature is the ecosystem-facing foundation of the package; `cpt-frontx-feature-routing-url-screen-binding` and `cpt-frontx-feature-routing-engine-provider` both depend on it.

## 2. Actor Flows (CDSL)

User-facing interactions that start with an actor and describe the end-to-end flow of a use case. The Navigation Substrate is reached directly whenever a caller needs to read or change the URL without a mounted router in the call path.

### Imperative Navigation Outside The UI Tree

- [ ] `p1` - **ID**: `cpt-frontx-flow-routing-navigation-substrate-imperative-navigation`

**Actor**: `cpt-frontx-routing-actor-application-developer`

**Success Scenarios**:
- The caller obtains the one realm-shared navigation-history instance and issues `push`, `replace`, or `go` against it; every other unit in the realm subscribed to the instance observes the resulting `location` change through the fan-out.
- The caller reads `location` directly, without subscribing, to inspect the current URL synchronously.

**Error Scenarios**:
- A caller that constructs its own history instance instead of resolving the realm-shared one observes no change when another unit navigates, and produces no change any other unit observes when it navigates itself — the divergence this feature exists to prevent.

**Steps**:
1. [ ] - `p1` - Caller resolves the single navigation-history instance for the current realm (`cpt-frontx-algo-routing-navigation-substrate-singleton-resolution`) - `inst-resolve-instance`
2. [ ] - `p1` - **IF** the caller needs to react to future navigation rather than act once - `inst-branch-subscribe`
   1. [ ] - `p1` - Caller registers a listener via `subscribe`, joining the instance's fan-out (`cpt-frontx-algo-routing-navigation-substrate-fanout-dispatch`) - `inst-subscribe`
   2. [ ] - `p1` - Caller retains the returned unsubscribe function for later teardown - `inst-retain-unsubscribe`
3. [ ] - `p1` - **ELSE** caller acts immediately - `inst-branch-immediate`
   1. [ ] - `p1` - Caller reads `location` for the current URL, or calls `push`/`replace`/`go` to change it - `inst-immediate-call`
4. [ ] - `p1` - **IF** the caller needs to know which declared unit currently owns the resulting pathname - `inst-branch-owner`
   1. [ ] - `p1` - Caller invokes the longest-matching-prefix resolution primitive against the host-injected route-owner provider (`cpt-frontx-algo-routing-navigation-substrate-prefix-resolution`) - `inst-resolve-owner`
5. [ ] - `p1` - **RETURN** control to the caller; any subscribed listener across the realm is notified through the same fan-out the caller's own call reached - `inst-return`

## 3. Processes / Business Logic (CDSL)

Internal system functions that do not interact with actors directly. All three are the building blocks the Screen Binding resolver (`cpt-frontx-feature-routing-url-screen-binding`) and the Engine Provider (`cpt-frontx-feature-routing-engine-provider`) are built on.

### Realm-Global Singleton Resolution

- [ ] `p2` - **ID**: `cpt-frontx-algo-routing-navigation-substrate-singleton-resolution`

**Input**: The calling realm's global object; a well-known key the package reserves on it, carrying the `NavigationHistory` contract's own version (e.g. `__frontx_routing_navigation_history_v1__`).

**Output**: The single navigation-history instance for that realm and that contract version — freshly constructed on the first call for that version, reused on every later call from any independently bundled copy of this package built against the same contract version.

**Steps**:
1. [ ] - `p1` - Inspect the realm global for an existing instance stored under this package's version-carrying well-known key - `inst-peek-global`
2. [ ] - `p1` - **IF** no instance is present under that key - `inst-if-absent`
   1. [ ] - `p1` - Construct the navigation-history instance over the browser's own navigation-history API - `inst-construct-instance`
   2. [ ] - `p1` - Store the instance on the realm global under the version-carrying well-known key, so the next caller — from this bundle or any other built against the same contract version — finds it already there - `inst-store-global`
3. [ ] - `p1` - **ELSE** the instance already present is the one every earlier caller of this contract version in this realm is already holding - `inst-else-present`
4. [ ] - `p1` - **RETURN** the realm-global instance - `inst-return-instance`

**Rationale**: A realm-global key, not a module-scoped variable, is what makes the instance reachable across independently bundled copies of this package — each copy is its own module graph and cannot see another copy's module-scoped state, but every copy runs in the same realm and can see the same global. The key carries the `NavigationHistory` contract's own version rather than naming the package alone, so a copy built against an incompatible future or past contract version resolves under its own key and constructs its own instance instead of silently capturing and reusing one whose shape it cannot actually satisfy — trading a same-version sharing guarantee for a loud version mismatch instead of a quiet, wrong one.

### Fan-Out Subscription Dispatch

- [ ] `p2` - **ID**: `cpt-frontx-algo-routing-navigation-substrate-fanout-dispatch`

**Input**: A subscriber callback passed to `subscribe`; the singleton instance's own registry of subscribers; its one underlying subscription against the browser's navigation-history API; and the instance's own `push`, `replace`, and `go` calls.

**Output**: The subscriber registered or removed; on a browser navigation-history change *or* on a `push`/`replace`/`go` call made through this instance, every subscriber registered at the start of that dispatch round invoked once.

**Steps**:
1. [ ] - `p1` - **IF** this is the first subscriber the singleton instance has ever had - `inst-if-first-subscriber`
   1. [ ] - `p1` - Register exactly one subscription against the browser's own navigation-history API - `inst-register-underlying`
2. [ ] - `p1` - Add the caller's callback to the instance's internal subscriber registry and return an unsubscribe function closed over that registry entry - `inst-add-subscriber`
3. [ ] - `p1` - **WHEN** the one underlying browser navigation-history subscription fires — this covers a navigation this instance did not itself perform: a back/forward step, or any call made directly against the browser's own history API from outside this instance - `inst-when-underlying-fires`
   1. [ ] - `p1` - Dispatch a round (`inst-dispatch-round`) - `inst-underlying-dispatch-round`
4. [ ] - `p1` - **WHEN** this instance's own `push`, `replace`, or `go` is called - `inst-when-own-navigation-call`
   1. [ ] - `p1` - Dispatch a round (`inst-dispatch-round`) directly from the call itself, without waiting for or depending on a `popstate` event — a call made through `pushState`/`replaceState` never raises one, so step 3's browser subscription alone would never observe a navigation this instance performed itself - `inst-own-call-dispatch-round`
5. [ ] - `p1` - **Dispatch a round** (`inst-dispatch-round`, invoked by both step 3 and step 4) - `inst-dispatch-round`
   1. [ ] - `p1` - Take a snapshot of the callbacks currently in the subscriber registry - `inst-snapshot-subscribers`
   2. [ ] - `p1` - **FOR EACH** callback in that snapshot, in registration order - `inst-foreach-subscriber`
      1. [ ] - `p1` - **TRY** invoke the callback with this instance's own notification payload for the triggering navigation - `inst-invoke-subscriber`
      2. [ ] - `p1` - **CATCH** an error thrown by the callback - `inst-catch-subscriber-error`
         1. [ ] - `p1` - Isolate the failing callback's error so it does not stop delivery to the remaining callbacks in the snapshot - `inst-isolate-error`
   3. [ ] - `p1` - **IF** a callback unsubscribes during this round - `inst-if-unsubscribe-mid-round`
      1. [ ] - `p1` - Remove it from the live subscriber registry; the round in progress still finishes against the snapshot taken in step 5.1, so removing it mid-round does not corrupt this round's iteration - `inst-unsubscribe-mid-round-safe`
   4. [ ] - `p1` - **IF** a callback triggers a new navigation during this round (reentrant navigation) - `inst-if-reentrant-navigation`
      1. [ ] - `p1` - That navigation's own dispatch is deferred to a new, later round rather than folded into the round already in progress - `inst-reentrant-new-round`
6. [ ] - `p1` - **WHEN** the caller invokes the returned unsubscribe function - `inst-when-unsubscribe`
   1. [ ] - `p1` - Remove the callback from the subscriber registry - `inst-remove-subscriber`

**Rationale**: Exactly one subscription reaches the browser's navigation-history API regardless of how many listeners the realm accumulates; every listener's fan-out traces back to that same single subscription, which is what keeps every independently bundled unit observing the same sequence of navigation events. Dispatch has two triggers rather than one because the browser's own `popstate` event never fires for a `pushState`/`replaceState` call made through this same instance — without step 4's direct dispatch, this instance's own `push` and `replace` would be invisible to every subscriber, including the very Screen Binding resolver that depends on observing them. The snapshot-and-defer rules in step 5 are what make a listener free to unsubscribe or navigate from inside its own callback without corrupting the round it is currently part of.

### Route-Owner Resolution By Longest Matching Declared Prefix

- [ ] `p2` - **ID**: `cpt-frontx-algo-routing-navigation-substrate-prefix-resolution`

**Input**: A pathname; the set of declared identifier-to-prefix pairs exposed by the host-injected route-owner provider.

**Output**: The identifier of the route owner whose declared prefix is the longest match for the pathname, or a "no owner" result when no declared prefix matches.

**Steps**:
1. [ ] - `p1` - Read the current set of declared identifier-to-prefix pairs from the host-injected route-owner provider - `inst-read-declared-prefixes`
2. [ ] - `p1` - **FOR EACH** declared prefix that is a prefix of the pathname - `inst-foreach-candidate`
   1. [ ] - `p1` - Add it to the set of matching candidates - `inst-collect-candidate`
3. [ ] - `p1` - **IF** the set of matching candidates is non-empty - `inst-if-candidates`
   1. [ ] - `p1` - Select the candidate whose declared prefix is longest - `inst-select-longest`
   2. [ ] - `p1` - **RETURN** that candidate's identifier as the route owner - `inst-return-owner`
4. [ ] - `p1` - **ELSE** - `inst-else-no-candidates`
   1. [ ] - `p1` - **RETURN** the "no owner" result - `inst-return-no-owner`

**Boundary note**: This is the matching primitive alone — naming an owner or naming "no owner." It performs no mounting, no unmounting, and no URL reflection. The orchestration that acts on this primitive's result — triggering a mount when the resolved owner is not yet mounted, reflecting a non-URL-driven mount back into the URL by `replace`, and unmounting an owner the URL has left — belongs to the Screen Binding resolver and is specified in `cpt-frontx-feature-routing-url-screen-binding`, which invokes this algorithm as the first step of its own URL-to-mount reconciliation.

## 4. States (CDSL)

### No Feature-Owned State Machine

Not applicable. The Navigation Substrate itself is stateless beyond the realm-global singleton and its subscriber registry (§3) — neither is a state machine with named states and guarded transitions. The one genuine state machine this package's behavior calls for — the binding of a screen-domain slot to a route owner, moving through resolution, mounting, and rebinding — belongs to the Screen Binding resolver and is specified in `cpt-frontx-feature-routing-url-screen-binding` §4. Introducing a state machine here would duplicate that one without adding a distinct concern, so none is defined for this feature.

## 5. Definitions of Done

### Single Realm-Shared History With Fan-Out Subscription And Prefix-Resolution Primitive

- [ ] `p1` - **ID**: `cpt-frontx-dod-routing-navigation-substrate-shared-history`

The system **MUST** expose exactly one navigation-history instance per realm and per `NavigationHistory` contract version, resolved through a version-carrying realm-global key so that every independently bundled copy of this package built against the same contract version converges on the same instance, **MUST** dispatch its fan-out both on the one underlying browser navigation-history subscription and directly from its own `push`/`replace`/`go` calls — since the latter never raise the `popstate` event the former listens for — to every listener registered at the start of that dispatch round, without letting one listener's error, or a listener that unsubscribes or navigates mid-round, corrupt delivery to the rest, and **MUST** expose the longest-matching-declared-prefix resolution primitive against the host-injected route-owner provider, returning a "no owner" result when nothing matches.

**Implements**:
- `cpt-frontx-flow-routing-navigation-substrate-imperative-navigation`
- `cpt-frontx-algo-routing-navigation-substrate-singleton-resolution`
- `cpt-frontx-algo-routing-navigation-substrate-fanout-dispatch`
- `cpt-frontx-algo-routing-navigation-substrate-prefix-resolution`

**Addresses**:
- `cpt-frontx-routing-fr-single-navigation-substrate`
- `cpt-frontx-routing-fr-url-screen-binding` (the prefix-resolution primitive this DoD exposes is what that requirement's owner-naming step invokes)
- `cpt-frontx-routing-nfr-agnostic-core`
- `cpt-frontx-routing-principle-single-history-authority`

**Constraints**: `cpt-frontx-constraint-routing-no-engine-leak`, `cpt-frontx-constraint-routing-no-intra-ecosystem-dependency`

**Touches**:
- Component: `cpt-frontx-component-routing-navigation-substrate`

### Imperative Navigation Surface Outside The UI Tree

- [ ] `p1` - **ID**: `cpt-frontx-dod-routing-navigation-substrate-imperative-navigation`

The system **MUST** expose `push`, `replace`, `go`, `location`, and `subscribe` against the realm-shared navigation-history instance for use by a caller with no mounted router in its call path.

**Implements**:
- `cpt-frontx-flow-routing-navigation-substrate-imperative-navigation`

**Addresses**:
- `cpt-frontx-routing-fr-imperative-navigation`

**Touches**:
- Component: `cpt-frontx-component-routing-navigation-substrate`

## 6. Acceptance Criteria

- [ ] A single navigation-history instance answers `push`/`replace`/`go`/`location`/`subscribe` for the host and for every independently bundled microfrontend registered in the same realm, resolved by a version-carrying realm-global key rather than a module-scoped singleton; a copy built against an incompatible contract version resolves its own instance under its own key instead of reusing this one.
- [ ] Exactly one subscription is registered against the browser's own navigation-history API regardless of how many listeners subscribe through this instance; every listener is invoked on every navigation-history change.
- [ ] A `push`, `replace`, or `go` call made through this instance dispatches the same fan-out directly, without depending on a `popstate` event, since a same-instance call never raises one.
- [ ] A listener that throws during dispatch does not prevent delivery to the remaining listeners in the same fan-out round.
- [ ] A listener that unsubscribes during a dispatch round does not corrupt that round's iteration; a listener that triggers a new navigation during a round has that navigation dispatched as a new, later round.
- [ ] `push`, `replace`, `go`, `location`, and `subscribe` are usable from a caller with no mounted router in its call path.
- [ ] Given a pathname and a set of declared identifier-to-prefix pairs, the resolution primitive returns the identifier whose declared prefix is the longest match, and a "no owner" result when no declared prefix matches.
- [ ] The Navigation Substrate's own module carries no import of a router engine or a UI-framework rendering primitive.
