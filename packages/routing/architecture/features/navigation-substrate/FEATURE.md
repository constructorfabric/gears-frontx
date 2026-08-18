# Feature: Navigation Substrate


<!-- toc -->

- [1. Feature Context](#1-feature-context)
  - [1.1 Overview](#11-overview)
  - [1.2 Purpose](#12-purpose)
  - [1.3 Actors](#13-actors)
  - [1.4 References](#14-references)
  - [1.5 Contract Shapes](#15-contract-shapes)
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

*Navigation substrate* in this document names this agnostic core component alone, not the whole published package: `@gears-frontx/routing` is this core plus the Engine Provider and Route Ownership Signal components specified in the sibling FEATUREs (root DESIGN and ADR 0002 use the same term at package granularity — a broader use than this FEATURE's own; see the package's own [DESIGN §1.1](../../DESIGN.md#11-architectural-vision)).

The Navigation Substrate is exactly one navigation-history instance per realm, reachable by the host and by every independently bundled microfrontend, with one real subscription against the browser's own navigation history fanned out to every listener — a fan-out its own `push`/`replace` calls trigger directly as a second dispatch path, since neither call raises the `popstate` event the browser subscription listens for. A `go` call is not part of that direct-dispatch path: moving through history raises `popstate` too, but only asynchronously, so `go` is observed through the same underlying browser subscription as a back/forward step rather than dispatched at its own call site. It exposes that history's `push`, `replace`, `go`, `location`, and `subscribe` — its own `NavigationHistory` contract — for use outside any mounted UI-framework component tree, and it carries the primitive that names which declared route owner a pathname belongs to — the longest matching declared prefix, respecting path-segment boundaries. It carries no dependency on a concrete router engine or UI framework; `NavigationHistory` is deliberately narrower than the `RouterHistory` contract a concrete engine expects; the Engine Provider is the component that adapts one into the other.

### 1.2 Purpose

Independently bundled units cannot share a compile-time singleton — each is its own module graph, built and shipped on its own schedule. A composed application built from such units still needs exactly one navigation history: programmatic navigation performed through `pushState` produces no `popstate` event, so it is invisible to any second copy of a history-managing module that did not perform the call itself. Left alone, two independently bundled copies of this package would each construct their own history instance, and a `push`/`replace`/`go` issued through one would leave the other holding a stale `location` — the two copies, and the routers built on top of them, would drift out of agreement with each other and with the address bar. The Navigation Substrate exists to make that divergence structurally impossible: every unit in the realm reaches the same instance, by construction, rather than by convention — which is also why the substrate's own `push`/`replace` must dispatch its fan-out directly rather than leaning on the `popstate` event alone: that event is exactly the signal a same-instance `push`/`replace` call never raises (a same-instance `go` call does eventually raise it, asynchronously, which is why `go` is observed through the subscription instead of dispatched directly).

**Requirements**: `cpt-frontx-routing-fr-single-navigation-substrate`, `cpt-frontx-routing-fr-imperative-navigation`, `cpt-frontx-routing-nfr-agnostic-core`

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
- **Dependencies**: None — this feature is the ecosystem-facing foundation of the package; `cpt-frontx-feature-routing-route-ownership-signal` and `cpt-frontx-feature-routing-engine-provider` both depend on it.

### 1.5 Contract Shapes

Field-level shape of `NavigationHistory`'s own `location` value and of the notification its `subscribe` callback receives, per `cpt-frontx-adr-contract-schema-ownership` (owned contract role in DESIGN, decision rationale in the ADR, field-level schema here in the owning FEATURE — this feature owns the `NavigationHistory` contract, `cpt-frontx-component-routing-navigation-substrate`).

**Location shape** — the shape `NavigationHistory`'s own `location` member exposes, and the shape carried inside every subscriber notification below:
- **Path** — the pathname component of the current URL; the value the longest-matching-prefix primitive (`cpt-frontx-algo-routing-navigation-substrate-prefix-resolution`) matches against.
- **Search** — the current URL's query string.
- **Hash** — the current URL's fragment.

**Subscriber notification shape** — the value passed to each callback a `subscribe` caller registers, once per dispatched round (`cpt-frontx-algo-routing-navigation-substrate-fanout-dispatch`):
- **Location** — the current Location shape (above), current as of the moment this round dispatches.
- **Navigation kind** — which of three kinds of navigation triggered this round: an added history entry (`push`), a replaced history entry (`replace`), or a move through existing history entries (`go`, and equivalently a back/forward step or a third-party call against the browser's own history API). This is `NavigationHistory`'s own classification, carried in every notification regardless of which of the two dispatch paths (§3, Fan-Out Subscription Dispatch) produced it.

This shape is `NavigationHistory`'s own notification, internal to this contract until an adapter translates it into a different contract's shape — the Engine Provider is that adapter for its own engine's `RouterHistory`/`SubscriberArgs` contract (`cpt-frontx-feature-routing-engine-provider` §3, History Adaptation): it derives `SubscriberArgs.action` from this shape's navigation-kind field and `SubscriberArgs.location` from this shape's Location field, rather than inventing either. A caller who subscribes directly against `NavigationHistory`, without an adapter in between, receives this shape as-is.

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

Internal system functions that do not interact with actors directly. All three are the building blocks the Route Ownership Signal (`cpt-frontx-feature-routing-route-ownership-signal`) and the Engine Provider (`cpt-frontx-feature-routing-engine-provider`) are built on.

### Realm-Global Singleton Resolution

- [ ] `p2` - **ID**: `cpt-frontx-algo-routing-navigation-substrate-singleton-resolution`

**Input**: The calling realm's global object; a well-known key the package reserves on it, carrying the `NavigationHistory` contract's own version (e.g. `__frontx_routing_navigation_history_v1__`).

**Output**: The single navigation-history instance for that realm and that contract version — freshly constructed on the first call for that version, reused on every later call from any independently bundled copy of this package built against the same contract version.

**Steps**:
1. [ ] - `p1` - Inspect the realm global for an existing instance stored under this package's version-carrying well-known key - `inst-peek-global`
2. [ ] - `p1` - **IF** no instance is present under that key - `inst-if-absent`
   1. [ ] - `p1` - Construct the navigation-history instance over the browser's own navigation-history API, registering its one underlying subscription against that API at this same construction moment — not deferred until a first caller subscribes, per `cpt-frontx-algo-routing-navigation-substrate-fanout-dispatch` — so `location` is live from the instant this instance exists, for a reader who never subscribes at all - `inst-construct-instance`
   2. [ ] - `p1` - Store the instance on the realm global under the version-carrying well-known key, so the next caller — from this bundle or any other built against the same contract version — finds it already there - `inst-store-global`
3. [ ] - `p1` - **ELSE** the instance already present is the one every earlier caller of this contract version in this realm is already holding - `inst-else-present`
4. [ ] - `p1` - **RETURN** the realm-global instance - `inst-return-instance`

**Rationale**: A realm-global key, not a module-scoped variable, is what makes the instance reachable across independently bundled copies of this package — each copy is its own module graph and cannot see another copy's module-scoped state, but every copy runs in the same realm and can see the same global. The key carries the `NavigationHistory` contract's own version rather than naming the package alone, so a copy built against an incompatible future or past contract version resolves under its own key and constructs its own instance instead of silently capturing and reusing one whose shape it cannot actually satisfy — trading a same-version sharing guarantee for a loud version mismatch instead of a quiet, wrong one. Registering the underlying browser subscription at construction, rather than waiting for a first `subscribe` call, is what keeps `location` from being stale for a caller who only ever reads it (§2 permits reading without subscribing) — a lazily-registered subscription would leave `location` frozen at its construction-time value for exactly the callers who never subscribe.

### Fan-Out Subscription Dispatch

- [ ] `p2` - **ID**: `cpt-frontx-algo-routing-navigation-substrate-fanout-dispatch`

**Input**: A subscriber callback passed to `subscribe`; the singleton instance's own registry of subscribers; its one underlying subscription against the browser's navigation-history API, registered at instance construction (`cpt-frontx-algo-routing-navigation-substrate-singleton-resolution`), not deferred until a first subscriber arrives; and the instance's own `push` and `replace` calls.

**Output**: The subscriber registered or removed; on a browser navigation-history change — which also covers a `go` call made through this instance, observed asynchronously through this same underlying subscription — *or* on a `push`/`replace` call made through this instance, every subscriber registered at the start of that dispatch round invoked once.

**Steps**:
1. [ ] - `p1` - Add the caller's callback to the instance's internal subscriber registry and return an unsubscribe function closed over that registry entry - `inst-add-subscriber`
2. [ ] - `p1` - **WHEN** the one underlying browser navigation-history subscription fires — registered at instance construction rather than at a first `subscribe` call, this covers a navigation this instance did not dispatch directly at its own call site: a back/forward step, a `go` call issued through this instance (moving through history raises `popstate` only asynchronously, so `go` is observed here rather than dispatched directly in step 3), or any third-party call made directly against the browser's own history API from outside this instance - `inst-when-underlying-fires`
   1. [ ] - `p1` - Dispatch a round (`inst-dispatch-round`) - `inst-underlying-dispatch-round`
3. [ ] - `p1` - **WHEN** this instance's own `push` or `replace` is called - `inst-when-own-navigation-call`
   1. [ ] - `p1` - Dispatch a round (`inst-dispatch-round`) directly from the call itself, without waiting for or depending on a `popstate` event — a call made through `pushState`/`replaceState` never raises one, so step 2's browser subscription alone would never observe a navigation this instance performed itself; `go` is deliberately excluded from this direct path because, unlike `push`/`replace`, it does eventually raise `popstate`, and dispatching it synchronously here would notify subscribers before `location` reflects the browser's actual post-move state - `inst-own-call-dispatch-round`
4. [ ] - `p1` - **Dispatch a round** (`inst-dispatch-round`, invoked by both step 2 and step 3) - `inst-dispatch-round`
   1. [ ] - `p1` - Take a snapshot of the callbacks currently in the subscriber registry - `inst-snapshot-subscribers`
   2. [ ] - `p1` - **FOR EACH** callback in that snapshot, in registration order - `inst-foreach-subscriber`
      1. [ ] - `p1` - **TRY** invoke the callback with this instance's own notification payload for the triggering navigation - `inst-invoke-subscriber`
      2. [ ] - `p1` - **CATCH** an error thrown by the callback - `inst-catch-subscriber-error`
         1. [ ] - `p1` - Isolate the failing callback's error so it does not stop delivery to the remaining callbacks in the snapshot - `inst-isolate-error`
   3. [ ] - `p1` - **IF** a callback unsubscribes during this round - `inst-if-unsubscribe-mid-round`
      1. [ ] - `p1` - Remove it from the live subscriber registry; the round in progress still finishes against the snapshot taken in step 4.1, so removing it mid-round does not corrupt this round's iteration - `inst-unsubscribe-mid-round-safe`
   4. [ ] - `p1` - **IF** a callback triggers a new navigation during this round (reentrant navigation) - `inst-if-reentrant-navigation`
      1. [ ] - `p1` - That navigation's own dispatch is deferred to a new, later round rather than folded into the round already in progress - `inst-reentrant-new-round`
5. [ ] - `p1` - **WHEN** the caller invokes the returned unsubscribe function - `inst-when-unsubscribe`
   1. [ ] - `p1` - Remove the callback from the subscriber registry - `inst-remove-subscriber`

**Rationale**: Exactly one subscription reaches the browser's navigation-history API regardless of how many listeners the realm accumulates, and that subscription lives from instance construction onward rather than from a first `subscribe` call, so every listener's fan-out — and every reader's `location` — traces back to that same single, already-live subscription. Dispatch has two triggers rather than one because the browser's own `popstate` event never fires for a `pushState`/`replaceState` call made through this same instance — without step 3's direct dispatch, this instance's own `push` and `replace` would be invisible to every subscriber, including the very Route Ownership Signal observer that depends on observing them. `go` deliberately stays out of that direct path: it does eventually raise `popstate`, only asynchronously, so folding it into step 3 would notify subscribers with a `location` that does not yet reflect the completed move — step 2's subscription, the same one back/forward relies on, is what observes `go` correctly. The snapshot-and-defer rules in step 4 are what make a listener free to unsubscribe or navigate from inside its own callback without corrupting the round it is currently part of.

### Route-Owner Resolution By Longest Matching Declared Prefix

- [ ] `p2` - **ID**: `cpt-frontx-algo-routing-navigation-substrate-prefix-resolution`

**Input**: A pathname; the set of declared identifier-to-prefix pairs exposed by the host-injected route-owner provider.

**Output**: The identifier of the route owner whose declared prefix is the longest match for the pathname, or a "no owner" result when no declared prefix matches.

**Steps**:
1. [ ] - `p1` - Read the current set of declared identifier-to-prefix pairs from the host-injected route-owner provider - `inst-read-declared-prefixes`
2. [ ] - `p1` - Normalize the pathname into its list of non-empty path segments — split on the path-segment separator (`/`) and discard every empty piece the split produces, so a leading, trailing, or repeated separator contributes nothing to the list; the application root and the empty string both normalize to the empty list - `inst-normalize-pathname`
3. [ ] - `p1` - **FOR EACH** declared prefix - `inst-foreach-candidate`
   1. [ ] - `p1` - Normalize that declared prefix into its own list of non-empty path segments by the same rule as step 2 - `inst-normalize-prefix`
   2. [ ] - `p1` - **IF** the prefix's segment list is a prefix of the pathname's segment list — every segment in the prefix's list appears in the pathname's list at the same position, in order, including the case where the two lists are equal - `inst-if-segment-prefix-match`
      1. [ ] - `p1` - Add it to the set of matching candidates, recording the number of segments in its list - `inst-collect-candidate`
4. [ ] - `p1` - **IF** the set of matching candidates is non-empty - `inst-if-candidates`
   1. [ ] - `p1` - Select the candidate with the greatest number of matched segments — never by the declared prefix's string length, which a trailing or repeated separator would otherwise distort - `inst-select-longest`
   2. [ ] - `p1` - **RETURN** that candidate's identifier as the route owner - `inst-return-owner`
5. [ ] - `p1` - **ELSE** - `inst-else-no-candidates`
   1. [ ] - `p1` - **RETURN** the "no owner" result - `inst-return-no-owner`

**Root-prefix note**: A declared prefix of `/` or the empty string — both denoting the application root — normalizes to the empty segment list (step 3.1), and the empty list is a prefix of every segment list, including its own; the root prefix therefore matches every pathname, with no exception carved out for it. It is not a special case of the matching rule, only a candidate whose normalized list happens to be empty.

**Trailing-separator note**: A declared prefix of `/a/` normalizes to the same single-segment list as `/a` (step 3.1 discards the empty piece the trailing separator produces), so the two declared forms match identically — both match `/a` itself and `/a/b`, and neither matches `/ab`, whose only segment is `ab`, not `a`.

**Boundary note**: This is the matching primitive alone — naming an owner or naming "no owner." It performs no mounting, no unmounting, and no URL reflection. Route Ownership Signal exposes this same primitive as its own public entry point and builds an observable signal of ownership changes on top of it (`cpt-frontx-feature-routing-route-ownership-signal`), without re-implementing the matching rule; mounting, unmounting, and any reconciliation between the URL and what is actually mounted are the consumer's own responsibility, never this primitive's or that feature's.

## 4. States (CDSL)

### No Feature-Owned State Machine

Not applicable. The Navigation Substrate itself is stateless beyond the realm-global singleton and its subscriber registry (§3) — neither is a state machine with named states and guarded transitions. No feature in this package defines an occupancy or binding state machine: mounting, unmounting, and the lifecycle of which owner currently occupies a placement belong entirely to whichever mount mechanism the consumer already runs, never to this library (`cpt-frontx-principle-agnostic-core`; `cpt-frontx-feature-routing-route-ownership-signal` §4).

## 5. Definitions of Done

### Single Realm-Shared History With Fan-Out Subscription And Prefix-Resolution Primitive

- [ ] `p1` - **ID**: `cpt-frontx-dod-routing-navigation-substrate-shared-history`

The system **MUST** expose exactly one navigation-history instance per realm and per `NavigationHistory` contract version, resolved through a version-carrying realm-global key so that every independently bundled copy of this package built against the same contract version converges on the same instance, **MUST** register that instance's one underlying browser navigation-history subscription at construction rather than deferring it to a first `subscribe` call, **MUST** dispatch its fan-out both on that one underlying subscription — which also observes a `go` call made through this instance, asynchronously, the same way it observes back/forward — and directly from its own `push`/`replace` calls — since neither raises the `popstate` event the underlying subscription listens for — to every listener registered at the start of that dispatch round, without letting one listener's error, or a listener that unsubscribes or navigates mid-round, corrupt delivery to the rest, and **MUST** expose the longest-matching-declared-prefix resolution primitive against the host-injected route-owner provider, matching by segment-list prefix on the pathname and the declared prefix both normalized into their non-empty path segments, and returning a "no owner" result when nothing matches.

**Implements**:
- `cpt-frontx-flow-routing-navigation-substrate-imperative-navigation`
- `cpt-frontx-algo-routing-navigation-substrate-singleton-resolution`
- `cpt-frontx-algo-routing-navigation-substrate-fanout-dispatch`
- `cpt-frontx-algo-routing-navigation-substrate-prefix-resolution`

**Addresses**:
- `cpt-frontx-routing-fr-single-navigation-substrate`
- `cpt-frontx-routing-fr-route-ownership-signal` (the prefix-resolution primitive this DoD exposes is what that requirement's owner-resolution step, exposed publicly by `cpt-frontx-feature-routing-route-ownership-signal`, invokes)
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
- [ ] The one underlying subscription against the browser's own navigation-history API is registered at instance construction, not deferred until a first `subscribe` call, so `location` is current for a reader who never subscribes at all.
- [ ] Exactly one subscription is registered against the browser's own navigation-history API regardless of how many listeners subscribe through this instance; every listener is invoked on every navigation-history change.
- [ ] A `push` or `replace` call made through this instance dispatches the same fan-out directly, without depending on a `popstate` event, since a same-instance call never raises one for either. A `go` call made through this instance is not dispatched directly; it is observed through the same underlying browser-history subscription used for back/forward, since a history move raises `popstate` only asynchronously.
- [ ] A listener that throws during dispatch does not prevent delivery to the remaining listeners in the same fan-out round.
- [ ] A listener that unsubscribes during a dispatch round does not corrupt that round's iteration; a listener that triggers a new navigation during a round has that navigation dispatched as a new, later round.
- [ ] `push`, `replace`, `go`, `location`, and `subscribe` are usable from a caller with no mounted router in its call path.
- [ ] Given a pathname and a set of declared identifier-to-prefix pairs, both normalized into their non-empty path-segment lists, the resolution primitive returns the identifier whose declared prefix's segment list is the longest matching prefix of the pathname's segment list, and a "no owner" result when no declared prefix's segment list matches; a declared prefix of `/user` does not match a pathname of `/users/42` (its only segment, `user`, is not the same as `users`), a declared prefix of `/a/` matches both `/a` and `/a/b` identically to a declared prefix of `/a` (the trailing separator normalizes away), and a declared prefix of `/` or the empty string (denoting the application root, normalizing to the empty segment list) matches every pathname.
- [ ] The `NavigationHistory` contract's `location` shape (path, search, hash) and its subscriber-notification shape (a `location` plus a navigation kind distinguishing `push`, `replace`, and a history move) are as specified in §1.5, and are what the Engine Provider's `SubscriberArgs` translation (`cpt-frontx-feature-routing-engine-provider`) consumes as input.
- [ ] The Navigation Substrate's own module carries no import of a router engine or a UI-framework rendering primitive.
