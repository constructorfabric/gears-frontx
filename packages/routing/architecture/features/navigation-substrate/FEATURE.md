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

*Navigation substrate* in this document names this agnostic core component alone, not the whole published package: `@gears-frontx/routing` is this core plus the Route Ownership Signal component specified in the sibling FEATURE (root DESIGN and ADR 0002 use the same term at package granularity — a broader use than this FEATURE's own; see the package's own [DESIGN §1.1](../../DESIGN.md#11-architectural-vision)). The Engine Provider is not part of this package at all: it is a separately published member (`cpt-frontx-feature-routing-engine-provider`) — the ecosystem provides a default implementation of it — that consumes this component's contract from outside.

The Navigation Substrate is exactly one navigation-history instance per realm, reachable by the host and by every independently bundled microfrontend, with one real subscription against the browser's own navigation history fanned out to every listener — a fan-out its own `push`/`replace` calls also trigger directly, as a second dispatch path alongside that one subscription; the full reasoning for both dispatch triggers, including why a `go` call is observed through the subscription rather than dispatched directly, belongs to §3 (Fan-Out Subscription Dispatch), not repeated here. It exposes that history's `push`, `replace`, `go`, `location`, and `subscribe` — its own `NavigationHistory` contract — for use outside any mounted UI-framework component tree, and it carries the primitive that names which declared route owner a local remainder of the URL belongs to, at whatever domain level and axis a consumer applies it to — the longest matching declared prefix, respecting path-segment boundaries. It carries no dependency on a concrete router engine or UI framework whatsoever; `NavigationHistory` is deliberately narrower than what any concrete engine's own history contract typically requires — a separately published engine-provider package is responsible for adapting one into the other, never this component.

### 1.2 Purpose

Independently bundled units cannot share a compile-time singleton — each is its own module graph, built and shipped on its own schedule. A composed application built from such units still needs exactly one navigation history: programmatic navigation performed through `pushState` produces no `popstate` event, so it is invisible to any second copy of a history-managing module that did not perform the call itself. Left alone, two independently bundled copies of this package would each construct their own history instance, and a `push`/`replace`/`go` issued through one would leave the other holding a stale `location` — the two copies, and the routers built on top of them, would drift out of agreement with each other and with the address bar. The Navigation Substrate exists to make that divergence structurally impossible: every unit in the realm reaches the same instance, by construction, rather than by convention. How the substrate's own fan-out stays visible to every subscriber despite that same `pushState`/`popstate` gap is §3's own concern (Fan-Out Subscription Dispatch), not this one's.

**Requirements**: `cpt-frontx-routing-fr-single-navigation-substrate`, `cpt-frontx-routing-fr-imperative-navigation`, `cpt-frontx-routing-fr-route-ownership-signal`, `cpt-frontx-routing-nfr-agnostic-core`

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
- **Navigation kind** — which of three kinds of navigation triggered this round: an added history entry performed through this instance's own `push`, a replaced history entry performed through this instance's own `replace`, or a navigation delivered through the browser's own subscription rather than dispatched directly from this instance's own call site. This third kind covers a `go` call issued through this instance, a user's own back/forward step, and a third-party call to the browser's own history API that moves through existing entries (e.g. `history.go`) — and it equally covers an observed third-party addition the same browser subscription delivers, such as a fragment-only anchor activation that adds a new history entry rather than moving through existing ones: the underlying subscription cannot tell a movement among existing entries apart from an observed addition, and this classification does not promise to either — both surface as the same third kind. This is `NavigationHistory`'s own classification, carried in every notification regardless of which of the two dispatch paths (§3, Fan-Out Subscription Dispatch) produced it.

**Observed browser events** — stated explicitly because not every third-party mutation of the browser's own history produces one:
- A user's own back/forward step, and a third-party call that moves through existing history entries (e.g. `history.go` invoked outside this instance), are both observed: the browser raises an event for each, and this substrate's one underlying subscription listens for it.
- A same-document navigation that changes only the URL's fragment — a fragment-only anchor activation, or a third-party mutation of `location.hash` alone — is also observed: the browser raises an event for it too, and the dispatched round's Location shape carries the changed fragment exactly as any other round's does, classified under the same third navigation kind as any other browser-subscription-delivered navigation (Navigation kind, above) even though it adds a history entry rather than moving through existing ones.
- A third-party call that adds or replaces a history entry directly (`pushState`/`replaceState` invoked outside this instance) raises no event this substrate's underlying subscription listens for, so it produces no notification at all — the one third-party history mutation this substrate cannot observe (PRD §3.1; DESIGN §4 failure modes).

This shape is `NavigationHistory`'s own notification, internal to this contract until an adapter translates it into a different contract's shape — the Engine Provider is that adapter for whatever contract shape its own concrete engine's `subscribe` callback expects (`cpt-frontx-feature-routing-engine-provider`), deriving that shape's own action/kind field from this shape's navigation-kind field and its own location field from this shape's Location field, rather than inventing either. A caller who subscribes directly against `NavigationHistory`, without an adapter in between, receives this shape as-is.

**Navigation method signatures** — `NavigationHistory`'s own imperative surface, referenced by `cpt-frontx-feature-routing-engine-provider`'s claim of exposing it directly:
- **`push(path)`** — accepts a path string (pathname, and optionally a query string and a fragment, exactly as the caller composes it) and appends a new history entry for it.
- **`replace(path)`** — accepts a path string composed exactly like `push`'s own argument and overwrites the current history entry with it, leaving every entry before and after the current one untouched.
- **`go(delta)`** — accepts a signed step count (negative for back, positive for forward) and moves through existing history entries; observed asynchronously through the underlying browser subscription (§3, Fan-Out Subscription Dispatch) rather than dispatched directly at the call site.

**Prefix-equivalence predicate** — published as its own callable entry point, alongside the owner-resolution primitive it shares its rule with: given two declared prefixes, it normalizes each into its own list of non-empty path segments (`cpt-frontx-algo-routing-navigation-substrate-prefix-resolution`, step 3.1) and reports whether the two lists are identical, segment by segment, under the same character-by-character, case-sensitive comparison that primitive itself uses (Segment-equality rule, §3). A domain's own consumer calls this predicate at route-owner registration time to check two candidate declared prefixes for a same-prefix conflict (PRD §11), applying the identical rule the resolution primitive itself applies at navigation time rather than approximating it with a separate comparison of its own.

**Entry-carried state — not part of this contract**: a concrete engine's own history contract may let a caller attach an opaque state value to a history entry alongside its path. `NavigationHistory` carries no such member: `push` and `replace` take a path alone, and the Location shape above carries no state field. This is a stated limitation of the substrate's own contract, not an omission from this description — a replacement engine provider that needs entry-carried state gets it from its own engine's contract, never by reading it back out of `NavigationHistory`.

**Contract commitment**: by the time any subscriber callback executes for a given round, `NavigationHistory`'s own `location` already reflects the navigation that triggered that round — this holds for both dispatch paths in §3 (Fan-Out Subscription Dispatch) equally, including a history move observed only asynchronously through the underlying browser subscription. A subscriber never observes a round whose notification is stale relative to `location` at the moment its callback runs; this is what lets a callback trust `location` as current without re-reading it defensively, and it is why `go` is deliberately excluded from the substrate's direct-dispatch path (§3) rather than dispatched synchronously at its own call site — a synchronous dispatch would notify a subscriber before the browser's actual post-move `location` was in place, breaking this commitment for exactly that one case.

**Engine-provider port shape** — the field-level schema this feature owns as the normative contract every engine-provider port implementation must satisfy, per `cpt-frontx-adr-contract-schema-ownership` (owned contract role in DESIGN, decision rationale in the ADR, field-level schema here in the owning FEATURE). This schema lives here, in the core package's own tree, because the port is declared by this component (`cpt-frontx-component-routing-navigation-substrate`, `cpt-frontx-routing-fr-engine-provider-port`), not by whichever separately published package implements it — the same reasoning that keeps every other contract shape in this section owned by the declaring side, not the consuming one.

A conforming provider **MUST** accept, as its construction input:
- The navigation substrate's `NavigationHistory` instance (`location`, `subscribe`, `push`, `replace`, `go`) — the same realm-shared instance every other unit reads and writes, never a copy or a wrapper that diverges from it.
- The `basepath` assigned to the microfrontend it is mounted for — host-assigned when the microfrontend is composed, deployment-supplied or absent when it is served standalone. `basepath` is defined only for a level whose own carrier is the pathname: a level whose own carrier is a parallel-axis key's own entry value does not, in this release, hand a `basepath` to an engine-provider package for a constructed, mounted router — projecting a provider-constructed router inside a parallel-axis occupant's own zone is deferred until a first real consumer needs one, exactly as this package defers projecting a concurrently-occupied domain (`cpt-frontx-adr-extension-domain-occupancy`).
- The microfrontend's own route tree, carried as an opaque value this feature never inspects and imposes no shape on.

A conforming provider is responsible for producing, from those inputs:
- Its own concrete engine's history-contract object, derived from `NavigationHistory` — deriving whatever members that engine's own contract requires beyond `location`/`subscribe`/`push`/`replace`/`go`, and translating `NavigationHistory`'s own subscriber notification (Subscriber notification shape, above) into whatever shape its own engine's `subscribe` callback expects. This feature names no concrete engine and mandates no particular translation target; it constrains only what a provider receives from the substrate, never how a provider's own engine wants that input reshaped.
- A constructed, mounted router, scoped to the given `basepath` when one is supplied, matching only the remainder of the URL beneath it.

**Diagnostic of mismatch**: a provider that cannot accept `NavigationHistory` as-is — for example, one whose own engine's history contract requires a constructor argument this port does not supply — fails at construction rather than at first navigation: it cannot receive the shared history, so the microfrontend's routing does not initialize. This failure is local to the microfrontend that adopted the mismatched provider; it does not reach the substrate, the host, or a sibling microfrontend.

This shape is the port's normative contract, binding on every conforming provider. A provider's own adaptation of it into a concrete engine's history and subscriber-notification shapes is a worked example of satisfying this schema, not a restatement of it — the ecosystem's own default provider records its worked example in its own FEATURE (`cpt-frontx-feature-routing-engine-provider` §1.5), which points back here for the normative form rather than repeating it.

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
2. [ ] - `p1` - **IF** the caller needs to react to future navigation - `inst-branch-subscribe`
   1. [ ] - `p1` - Caller registers a listener via `subscribe`, joining the instance's fan-out (`cpt-frontx-algo-routing-navigation-substrate-fanout-dispatch`) - `inst-subscribe`
   2. [ ] - `p1` - Caller retains the returned unsubscribe function for later teardown - `inst-retain-unsubscribe`
3. [ ] - `p1` - **IF** the caller also needs to act immediately — independently of step 2, and commonly alongside it, since a typical caller both reads or writes the URL once now and subscribes for later changes - `inst-branch-immediate`
   1. [ ] - `p1` - Caller reads `location` for the current URL, or calls `push`/`replace`/`go` to change it - `inst-immediate-call`
4. [ ] - `p1` - **IF** the caller needs to know which declared unit currently owns the resulting pathname - `inst-branch-owner`
   1. [ ] - `p1` - Caller invokes the longest-matching-prefix resolution primitive, passing its own set of declared identifier-to-prefix pairs as a plain argument (`cpt-frontx-algo-routing-navigation-substrate-prefix-resolution`) - `inst-resolve-owner`
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

**Rationale**: A realm-global key, not a module-scoped variable, is what makes the instance reachable across independently bundled copies of this package — each copy is its own module graph and cannot see another copy's module-scoped state, but every copy runs in the same realm and can see the same global. The key carries the `NavigationHistory` contract's own version rather than naming the package alone, so a copy built against an incompatible future or past contract version resolves under its own key and constructs its own instance instead of silently capturing and reusing one whose shape it cannot actually satisfy — trading a same-version sharing guarantee for a per-version instance instead of a single instance quietly used the wrong way (PRD §12 records this as a bounded risk: prevention holds within one contract version, and a cross-version mismatch yields one instance per version, without a detection mechanism of its own). Registering the underlying browser subscription at construction, rather than waiting for a first `subscribe` call, is what keeps `location` from being stale for a caller who only ever reads it (§2 permits reading without subscribing) — a lazily-registered subscription would leave `location` frozen at its construction-time value for exactly the callers who never subscribe. A version-carrying string key, held for the page's own lifetime with no retain/release discipline of its own, is deliberate rather than an omission: the browser's own history is itself page-lifetime by nature, so nothing needs releasing before the page itself goes away; retain/release exists for resources with their own teardown semantics, which a realm-global singleton with no teardown does not have; and a well-known key without the contract's own version folded in would not tell two incompatible copies apart in the first place, which is the entire reason the key carries a version at all.

### Fan-Out Subscription Dispatch

- [ ] `p2` - **ID**: `cpt-frontx-algo-routing-navigation-substrate-fanout-dispatch`

**Input**: A subscriber callback passed to `subscribe`; the singleton instance's own registry of subscribers; its one underlying subscription against the browser's navigation-history API, registered at instance construction (`cpt-frontx-algo-routing-navigation-substrate-singleton-resolution`), not deferred until a first subscriber arrives; and the instance's own `push` and `replace` calls.

**Output**: The subscriber registered or removed; on a browser navigation-history change — which also covers a `go` call made through this instance, observed asynchronously through this same underlying subscription — *or* on a `push`/`replace` call made through this instance, every subscriber registered at the start of that dispatch round invoked once.

**Steps**:
1. [ ] - `p1` - Add the caller's callback to the instance's internal subscriber registry and return an unsubscribe function closed over that registry entry - `inst-add-subscriber`
2. [ ] - `p1` - **WHEN** the one underlying browser navigation-history subscription fires — registered at instance construction rather than at a first `subscribe` call, this covers a navigation this instance did not dispatch directly at its own call site: a back/forward step, a `go` call issued through this instance (moving through history raises `popstate` only asynchronously, so `go` is observed here rather than dispatched directly in step 3), a third-party call that moves through existing history entries from outside this instance (e.g. `history.go`), or an observed third-party addition such as a fragment-only navigation — never a third-party `pushState`/`replaceState` call made outside this instance, which raises no event this subscription listens for, produces no notification at all, and so is not observed here or anywhere else in this instance (§1.5, Observed browser events) - `inst-when-underlying-fires`
   1. [ ] - `p1` - Dispatch a round (`inst-dispatch-round`) - `inst-underlying-dispatch-round`
3. [ ] - `p1` - **WHEN** this instance's own `push` or `replace` is called - `inst-when-own-navigation-call`
   1. [ ] - `p1` - Dispatch a round (`inst-dispatch-round`) directly from the call itself, without waiting for or depending on a `popstate` event — a call made through `pushState`/`replaceState` never raises one, so step 2's browser subscription alone would never observe a navigation this instance performed itself; `go` is deliberately excluded from this direct path because, unlike `push`/`replace`, it does eventually raise `popstate`, and dispatching it synchronously here would notify subscribers before `location` reflects the browser's actual post-move state - `inst-own-call-dispatch-round`
4. [ ] - `p1` - **Dispatch a round** (`inst-dispatch-round`, invoked by both step 2 and step 3) - `inst-dispatch-round`
   1. [ ] - `p1` - Take a snapshot of the callbacks currently in the subscriber registry — this snapshot fixes which callbacks are eligible for this round, never which of them actually get invoked - `inst-snapshot-subscribers`
   2. [ ] - `p1` - **FOR EACH** callback in that snapshot, in registration order - `inst-foreach-subscriber`
      1. [ ] - `p1` - **IF** that callback is still present in the live subscriber registry at the moment this iteration reaches its slot — i.e., nothing has unsubscribed it since the snapshot was taken - `inst-if-still-live`
         1. [ ] - `p1` - **TRY** invoke the callback with this instance's own notification payload for the triggering navigation - `inst-invoke-subscriber`
         2. [ ] - `p1` - **CATCH** an error thrown by the callback - `inst-catch-subscriber-error`
            1. [ ] - `p1` - Isolate the failing callback's error so it does not stop delivery to the remaining callbacks in the snapshot - `inst-isolate-error`
      2. [ ] - `p1` - **ELSE** that callback was unsubscribed after the snapshot was taken but before this iteration reached its slot - `inst-else-unsubscribed-before-turn`
         1. [ ] - `p1` - Skip it without invoking it — an unsubscribe always wins over a still-pending, not-yet-invoked slot in this round, even though the snapshot already fixed that slot as eligible - `inst-skip-unsubscribed-slot`
   3. [ ] - `p1` - **IF** a callback unsubscribes during this round - `inst-if-unsubscribe-mid-round`
      1. [ ] - `p1` - Remove it from the live subscriber registry immediately. The round in progress still finishes iterating the snapshot taken in step 4.1, so removing it mid-round does not corrupt this round's iteration; if the round has not yet reached that callback's own slot, step 4.2's liveness check skips invoking it when the iteration gets there, and if the round already invoked it earlier in this same round, that completed invocation is not undone - `inst-unsubscribe-mid-round-safe`
   4. [ ] - `p1` - **IF** a callback triggers a new navigation during this round (reentrant navigation) - `inst-if-reentrant-navigation`
      1. [ ] - `p1` - That navigation's own dispatch is deferred to a new, later round rather than folded into the round already in progress - `inst-reentrant-new-round`
5. [ ] - `p1` - **WHEN** the caller invokes the returned unsubscribe function - `inst-when-unsubscribe`
   1. [ ] - `p1` - Remove the callback from the subscriber registry - `inst-remove-subscriber`

**Rationale**: Exactly one subscription reaches the browser's navigation-history API regardless of how many listeners the realm accumulates, and that subscription lives from instance construction onward rather than from a first `subscribe` call, so every listener's fan-out — and every reader's `location` — traces back to that same single, already-live subscription. Dispatch has two triggers rather than one because the browser's own `popstate` event never fires for a `pushState`/`replaceState` call made through this same instance — without step 3's direct dispatch, this instance's own `push` and `replace` would be invisible to every subscriber, including the very Route Ownership Signal observer that depends on observing them. `go` deliberately stays out of that direct path: it does eventually raise `popstate`, only asynchronously, so folding it into step 3 would notify subscribers with a `location` that does not yet reflect the completed move — step 2's subscription, the same one back/forward relies on, is what observes `go` correctly. The snapshot-and-defer rules in step 4 are what make a listener free to unsubscribe or navigate from inside its own callback without corrupting the round it is currently part of: the snapshot fixes which callbacks are eligible for the round, but a callback's own release always wins over a still-pending, not-yet-invoked slot the snapshot reserved for it — an invocation already completed earlier in the same round is never undone, only one still pending is ever skipped.

### Route-Owner Resolution By Longest Matching Declared Prefix

- [ ] `p2` - **ID**: `cpt-frontx-algo-routing-navigation-substrate-prefix-resolution`

**Input**: A pathname — in practice, whatever local remainder of the URL a caller supplies: a domain level's own remainder beneath its base for an axial caller, or a parallel axis's own carried local path for a parallel caller; this primitive treats either one the same way and carries no notion of which kind of caller supplied it. The set of declared identifier-to-prefix pairs, supplied by the caller as a plain argument.

**Output**: The identifier of the route owner whose declared prefix is the longest match for the pathname, together with that specific matched declared prefix — returned as a fact of this resolution, for the caller's own convenience, even though a route owner declares exactly one prefix for as long as its registration exists (PRD §11) and the matched prefix is therefore always derivable from the identifier alone once resolved — or a "no owner" result when no declared prefix matches.

**Steps**:
1. [ ] - `p1` - Read the current set of declared identifier-to-prefix pairs from the caller-supplied argument - `inst-read-declared-prefixes`
2. [ ] - `p1` - Normalize the pathname into its list of non-empty path segments — split on the path-segment separator (`/`) and discard every empty piece the split produces, so a leading, trailing, or repeated separator contributes nothing to the list; the application root and the empty string both normalize to the empty list - `inst-normalize-pathname`
3. [ ] - `p1` - **FOR EACH** declared prefix - `inst-foreach-candidate`
   1. [ ] - `p1` - Normalize that declared prefix into its own list of non-empty path segments by the same rule as step 2 - `inst-normalize-prefix`
   2. [ ] - `p1` - **IF** the prefix's segment list is a prefix of the pathname's segment list — every segment in the prefix's list appears in the pathname's list at the same position, in order, including the case where the two lists are equal - `inst-if-segment-prefix-match`
      1. [ ] - `p1` - Add it to the set of matching candidates, recording the number of segments in its list - `inst-collect-candidate`
4. [ ] - `p1` - **IF** the set of matching candidates is non-empty - `inst-if-candidates`
   1. [ ] - `p1` - Select the candidate with the greatest number of matched segments — never by the declared prefix's string length, which a trailing or repeated separator would otherwise distort - `inst-select-longest`
   2. [ ] - `p1` - **RETURN** that candidate's identifier and its declared prefix, as the route owner and its matched prefix - `inst-return-owner`
5. [ ] - `p1` - **ELSE** - `inst-else-no-candidates`
   1. [ ] - `p1` - **RETURN** the "no owner" result - `inst-return-no-owner`

**Declared-prefix validity note**: A declared prefix normalizes (step 3.1) into one or more non-empty path segments; a prefix that normalizes to the empty segment list — an empty string, or a bare `/` — is not a valid declaration, and this primitive does not treat one as a candidate that matches every pathname. Catching an invalid declaration is the same registration-time responsibility that catches a same-prefix conflict (PRD §11), not a matching-time concern of this primitive: the set of declared pairs this primitive receives is assumed free of a prefix that normalizes to the empty list, exactly as it is assumed free of two prefixes that normalize to the identical non-empty list (Equivalent-prefix precondition, below). A zone whose own root carries no declared occupant simply has no declared prefix that matches an empty local remainder there, and that remainder resolves through the ordinary matching rule (steps 4–5) to "no owner" like any other unmatched remainder — the consumer's own fallback for that state, the same fallback an index-route redirect at the engine-provider level already relies on.

**Trailing-separator note**: A declared prefix of `/a/` normalizes to the same single-segment list as `/a` (step 3.1 discards the empty piece the trailing separator produces), so the two declared forms match identically — both match `/a` itself and `/a/b`, and neither matches `/ab`, whose only segment is `ab`, not `a`.

**Segment-equality rule**: Two segments are equal exactly when they are equal character-by-character on the raw pathname — no percent-decoding of a percent-escaped sequence, and case-sensitive comparison. This is the rule steps 3.1–3.2 use to decide whether a prefix's segment list matches, and it is also the rule PRD §11 means by "the *same* prefix" when it defines a same-prefix conflict between two declared route owners: two declared prefixes conflict exactly when this rule normalizes them to the identical segment list.

**Equivalent-prefix precondition**: The set of declared pairs this primitive receives is assumed free of two prefixes that normalize to the identical segment list under the rule above — catching that conflict is the host's own responsibility at route-owner registration (PRD §11), not this primitive's. An input set that violates this precondition is invalid input this primitive does not defend against: which of the two equivalently-normalized candidates it selects in that case is unspecified, and not guaranteed to be deterministic across calls.

**Boundary note**: This is the matching primitive alone — naming an owner and its matched prefix, or naming "no owner." It performs no mounting, no unmounting, and no URL reflection. Route Ownership Signal exposes this same primitive as its own public entry point and builds an observable signal of ownership changes on top of it (`cpt-frontx-feature-routing-route-ownership-signal`), without re-implementing the matching rule; mounting, unmounting, and any reconciliation between the URL and what is actually mounted are the consumer's own responsibility, never this primitive's or that feature's. Route Ownership Signal calls this primitive once per domain level and once per axis a level projects, each time against that call's own local remainder; the primitive itself carries no notion of level or axis at all — that structure exists only in how a caller chooses to invoke it, never in the primitive's own state.

## 4. States (CDSL)

### No Feature-Owned State Machine

Not applicable. The Navigation Substrate itself is stateless beyond the realm-global singleton and its subscriber registry (§3) — neither is a state machine with named states and guarded transitions. No feature in this package defines an occupancy or binding state machine: mounting, unmounting, and the lifecycle of which owner currently occupies a placement belong entirely to whichever mount mechanism the consumer already runs, never to this library (`cpt-frontx-routing-principle-publishes-not-orchestrates`; `cpt-frontx-feature-routing-route-ownership-signal` §4).

## 5. Definitions of Done

### Single Realm-Shared History With Fan-Out Subscription And Prefix-Resolution Primitive

- [ ] `p1` - **ID**: `cpt-frontx-dod-routing-navigation-substrate-shared-history`

The system **MUST** expose exactly one navigation-history instance per realm and per `NavigationHistory` contract version, resolved through a version-carrying realm-global key so that every independently bundled copy of this package built against the same contract version converges on the same instance, **MUST** register that instance's one underlying browser navigation-history subscription at construction rather than deferring it to a first `subscribe` call, **MUST** dispatch its fan-out both on that one underlying subscription — which also observes a `go` call made through this instance, asynchronously, the same way it observes back/forward — and directly from its own `push`/`replace` calls — since neither raises the `popstate` event the underlying subscription listens for — to every listener registered at the start of that dispatch round whose registration still stands at the moment the round reaches it — a listener that unsubscribes after the round's own snapshot was taken but before its own slot is reached is skipped rather than invoked — without letting one listener's error, or a listener that unsubscribes or navigates mid-round, corrupt delivery to the rest, and **MUST** expose the longest-matching-declared-prefix resolution primitive, taking the pathname and a caller-supplied set of declared identifier-to-prefix pairs as plain arguments, matching by segment-list prefix on the pathname and the declared prefix both normalized into their non-empty path segments, and returning the matched owner together with its specific matched declared prefix, or a "no owner" result when nothing matches.

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
- [ ] A listener that unsubscribes during a dispatch round does not corrupt that round's iteration and receives no further invocation from that round once unsubscribed — the round's snapshot fixes which listeners are eligible for it, but an unsubscribe always wins over a still-pending, not-yet-invoked slot in that same round, without undoing an invocation the round already completed; a listener that triggers a new navigation during a round has that navigation dispatched as a new, later round.
- [ ] `push`, `replace`, `go`, `location`, and `subscribe` are usable from a caller with no mounted router in its call path.
- [ ] Given a pathname and a set of declared identifier-to-prefix pairs, both normalized into their non-empty path-segment lists, the resolution primitive returns the identifier whose declared prefix's segment list is the longest matching prefix of the pathname's segment list, together with that specific matched declared prefix — returned as a fact of the resolution, for the caller's own convenience — and a "no owner" result when no declared prefix's segment list matches; a declared prefix of `/user` does not match a pathname of `/users/42` (its only segment, `user`, is not the same as `users`), a declared prefix of `/a/` matches both `/a` and `/a/b` identically to a declared prefix of `/a` (the trailing separator normalizes away), and a declared prefix of `/` or the empty string is not a valid declaration at all — it normalizes to the empty segment list, and this primitive requires one or more segments from a declared prefix — so a zone with no declared occupant at its own root resolves an empty local remainder to "no owner" like any other unmatched remainder.
- [ ] The `NavigationHistory` contract's `location` shape (path, search, hash) and its subscriber-notification shape (a `location` plus a navigation kind distinguishing `push`, `replace`, and a third kind covering both a history move and an observed third-party addition such as fragment navigation) are as specified in §1.5, and are what the Engine Provider's own subscriber-notification translation (`cpt-frontx-feature-routing-engine-provider`) consumes as input.
- [ ] By the time any subscriber callback executes for a dispatched round, `NavigationHistory`'s own `location` already reflects the navigation that triggered that round, for both dispatch paths in §3 alike, including a history move observed only asynchronously.
- [ ] The Navigation Substrate's own module carries no import of a router engine or a UI-framework rendering primitive.
