# Feature: Route Ownership Signal


<!-- toc -->

- [1. Feature Context](#1-feature-context)
  - [1.1 Overview](#11-overview)
  - [1.2 Purpose](#12-purpose)
  - [1.3 Actors](#13-actors)
  - [1.4 References](#14-references)
  - [1.5 Contract Shapes](#15-contract-shapes)
- [2. Actor Flows (CDSL)](#2-actor-flows-cdsl)
  - [Deep Link Resolves Through The Route Ownership Signal](#deep-link-resolves-through-the-route-ownership-signal)
- [3. Processes / Business Logic (CDSL)](#3-processes--business-logic-cdsl)
  - [Owner Resolution Primitive](#owner-resolution-primitive)
  - [Observable Owner-Change Signal](#observable-owner-change-signal)
  - [Observer Release](#observer-release)
  - [URL Back-Projection Helper Via Replace](#url-back-projection-helper-via-replace)
- [4. States (CDSL)](#4-states-cdsl)
  - [No Feature-Owned State Machine](#no-feature-owned-state-machine)
- [5. Definitions of Done](#5-definitions-of-done)
  - [Owner Resolution And Observable Signal](#owner-resolution-and-observable-signal)
  - [Observer Release](#observer-release-1)
  - [URL Back-Projection Helper](#url-back-projection-helper)
- [6. Acceptance Criteria](#6-acceptance-criteria)

<!-- /toc -->

- [ ] `p1` - **ID**: `cpt-frontx-featstatus-routing-route-ownership-signal`
## 1. Feature Context

- [ ] `p2` - `cpt-frontx-feature-routing-route-ownership-signal`

### 1.1 Overview

Route Ownership Signal publishes two small, independent facts derived from the URL, and orchestrates no mounting. First, it exposes the navigation substrate's own longest-matching-prefix primitive as this package's public owner-resolution surface: given a pathname and a set of declared identifier-to-prefix pairs, it names the owner and the specific declared prefix that matched — an owner may declare more than one — or reports that none matches; a pure function, not stateful, and not a re-implementation of the substrate's matching rule. Second, it exposes an observable signal a consumer creates by passing the source of those declared pairs as a plain argument — never an injected port: the observer subscribes to the navigation substrate's shared history and, on creation and on every subsequent navigation, reports a transition from the previously resolved owner to the newly resolved one, distinguishing an owner appearing, an owner disappearing, an owner changing, the same owner's remainder beneath its matched prefix changing, or no transition at all when neither the owner nor its remainder changed — which is also what a navigation that changes only the current URL's search or hash produces, since resolution matches on pathname alone. Creating the observer also returns a release function the consumer calls to stop it, unsubscribing everything the observer itself subscribed to. Third, it exposes a URL back-projection helper a consumer calls when a mount happened for a reason other than navigation, replacing the current history entry with a specific declared prefix. None of the three touches mounting, unmounting, a registry of owners, or a state machine tracking which owner currently occupies a placement — those facts and that occupancy belong entirely to whichever mount mechanism the consumer already runs.

### 1.2 Purpose

A composed application's routable placements must resolve the same way regardless of how the user arrived at a URL: typing it, reloading it, stepping back or forward through history, or following a link. But the runtime that actually owns domain occupancy — named mount strategies, a cardinality matrix, and a registry of what is currently mounted — is the `mfes` runtime, not this library (`cpt-frontx-routing-principle-publishes-not-orchestrates`). A version of this feature that orchestrated mounting itself duplicated that runtime's own reconciliation behind a narrower, single-slot vocabulary that could not express the runtime's cardinality matrix or its concurrent-occupancy strategy, and drew an ad hoc boundary between "exclusive" and "concurrent" occupancy that this package had no way to compute on its own. Route Ownership Signal exists to give any consumer — this ecosystem's own host, built on the `mfes` runtime, or an unrelated one — the same URL-derived facts a host needs to drive its own reconciliation, without this package ever holding, orchestrating, or guessing at that reconciliation itself.

**Requirements**: `cpt-frontx-routing-fr-route-ownership-signal`

### 1.3 Actors

| Actor | Role in Feature |
|-------|-----------------|
| `cpt-frontx-routing-actor-application-developer` | Creates the route-ownership-signal observer, passing its own source of declared identifier-to-prefix pairs as a plain argument; on each notified ownership transition, mounts or unmounts the named owner through its own mount mechanism (the Binding obligation, §1.4); calls the URL back-projection helper when a mount it initiated was not driven by navigation. |
| `cpt-frontx-routing-actor-microfrontend-developer` | Declares its own prefix, and relies on the consumer's own mount mechanism — driven by this signal — to unmount it when the URL moves outside that prefix, and on the URL already being current when its own engine provider reads the location at mount. |

### 1.4 References

- **PRD**: [PRD.md](../../PRD.md)
- **Design**: [DESIGN.md](../../DESIGN.md)
- **Use case**: `cpt-frontx-routing-usecase-deep-link-to-microfrontend-screen`
- **Component**: `cpt-frontx-component-routing-screen-binding`
- **Dependencies**: `cpt-frontx-feature-routing-navigation-substrate` — this feature's owner-resolution primitive delegates entirely to the substrate's own longest-matching-prefix algorithm (`cpt-frontx-algo-routing-navigation-substrate-prefix-resolution`) and its observable signal subscribes to the substrate's shared history and fan-out; neither is re-implemented here.

**Boundary note**: This feature holds no registry of route owners, executes no mount or unmount, and carries no notion of exclusive versus concurrent occupancy. Domain occupancy — including any classification of a placement as holding one owner at a time or several simultaneously, and any cardinality matrix governing it — is decided entirely by the consumer's own mount mechanism (for this ecosystem's own host, the `mfes` runtime's mount strategies, `cpt-frontx-adr-extension-domain-occupancy`). This feature's coupling to that mechanism is expressed only through the plain-argument owner-prefix pairs source and the observable signal's transitions, never through an injected port and never through an import of the runtime that owns occupancy.

**Binding obligation**: Two-way agreement between the URL and the mounted route owner is not a guarantee this package makes on its own — it is a joint guarantee of this package plus the consumer's own host glue, recorded here the same way `cpt-frontx-feature-routing-engine-provider` records the deployment obligations (the server rewrite, the independently configured asset base URL) that fall on a consumer rather than on that feature, and the same way PRD §3.1 records them as deployment obligations rather than library capabilities. A consumer that wants the URL and the mounted owner to durably agree:
1. Creates the observer described in §3 (Observable Owner-Change Signal), supplying its own owner-prefix pairs source.
2. On each notified transition, mounts or unmounts the named owner through its own mount mechanism — resolving any race between two mounts the same way it already resolves one for that mechanism; this feature resolves no mount race itself, and a mount driven by this signal is racing against, and resolved by, exactly the same mechanism a mount driven by any other trigger already is.
3. Calls the URL back-projection helper (§3, URL Back-Projection Helper Via Replace) whenever a mount was initiated by something other than a navigation-driven transition this feature reported, so the URL does not durably disagree with what actually got mounted.
4. Treats mounting an owner as idempotent — mounting an owner that is already mounted is a no-op. The back-projection helper's own `replace` call (point 3) dispatches the navigation substrate's fan-out exactly like any other navigation (`cpt-frontx-algo-routing-navigation-substrate-fanout-dispatch`), so the observer reports a transition resolving to the very owner the consumer just finished mounting — an echo of the consumer's own back-projection, not a new ownership fact. Without this obligation, that echo would double-mount or re-initialize the microfrontend the consumer just finished mounting.
5. Does not wait for a transition to conclude there is no owner. Creating the observer on a path no declared prefix covers reports no initial transition at all (§3, Observable Owner-Change Signal — there is nothing yet to report a change from), so between observer creation and the first reported transition the consumer receives no signal about ownership either way. The consumer treats "no transition received yet" as "no owner" from the moment it creates the observer, and shows its own fallback accordingly, rather than waiting for an announcement that will not come. This is a deliberate asymmetry — an appearing owner is always reported, a durable absence of one is not — not a defect: reporting every creation's initial state, including "no owner," was considered and rejected as a redundant announcement for the common case (some owner already resolves at creation) that would buy nothing a consumer's own default assumption cannot already give it.

Without this recipe running in the consumer's own host glue, the primitive, the signal, and the helper this feature publishes describe facts, not a maintained agreement — the two-way agreement is the combination's guarantee, not this package's alone.

**Multiplicity note**: More than one observer may exist in the same realm at once — for example, a host's own observer and a nested host's observer one level down. Nothing about this feature limits it to a single observer per realm: each observer is independent, is created with its own owner-prefix pairs source, tracks its own previous owner/prefix/pathname state (§3, Observable Owner-Change Signal), and is released independently (§3, Observer Release). All of them read the one navigation substrate's shared history and fan-out (`cpt-frontx-routing-principle-single-history-authority`), so every observer resolves against the same `location` a given round dispatches, but resolves it against its own set of declared pairs.

### 1.5 Contract Shapes

Field-level shapes for this feature's own inputs and outputs, per `cpt-frontx-adr-contract-schema-ownership` (owned contract role in DESIGN, decision rationale in the ADR, field-level schema in the owning FEATURE).

**Owner-prefix pairs source** (consumer-supplied, passed as a plain argument — never an injected port):
- A readable snapshot of the current set of declared identifier-to-prefix pairs, in the same shape the navigation substrate's owner-resolution primitive reads (`cpt-frontx-algo-routing-navigation-substrate-prefix-resolution`).
- Optionally, a way to observe a change to that set, since the declared-owner set is not fixed for the realm's lifetime — a microfrontend can be registered or deregistered after the observer has already been created. A consumer whose set never changes after creation may supply a static snapshot with no change notification.
- Declares no cardinality floor: zero declared owners is legal and simply means every pathname resolves to "no owner".

**Ownership-change transition** (this feature's own output, delivered to the callback the consumer registers when creating the observer; never delivered at all when nothing ownership-relevant changed, see Kind below):
- Previous owner (or "no owner").
- New owner (or "no owner").
- Matched prefix (or none): the specific declared prefix that produced the new owner's resolution — carried because a single owner may declare more than one prefix (PRD §11), so the owner's identifier alone does not say which one matched; absent when the new owner is "no owner".
- Kind: `appeared` (no owner → an owner), `disappeared` (an owner → no owner), `changed` (one owner → a different owner), or `remainder-changed` (the same owner, but the portion of the pathname beneath its matched prefix changed). No transition is delivered at all — not a fourth Kind value, an absence of delivery — when the owner is "no owner" both before and after, or when the same owner and the same matched prefix persist with no change to the pathname beneath it; the latter is what a navigation that changes only the current URL's search or hash produces, since resolution matches on pathname alone (§3, Observable Owner-Change Signal).
- The current pathname the transition was resolved for.

**Release function** (this feature's own output, returned to the consumer at observer creation, alongside registering its callback): a zero-argument function that, when called, unsubscribes the observer from everything it subscribed to — the navigation substrate's fan-out, and the owner-prefix pairs source's own change notification when the source exposed one (§3, Observer Release). Calling it more than once is a no-op after the first call.

**URL back-projection input**: a specific declared prefix to reflect into the current history entry — the caller supplies the exact prefix, not merely an owner's identifier, since one owner may have declared more than one prefix; typically the matched prefix carried by the transition that led to the mount this call reflects. The helper's `replace` carries the current location's search and hash forward onto the replaced entry, the same location-preserving discipline this ecosystem applies to any redirect helper — only the pathname is replaced with the given prefix, never the query string or the fragment. The helper reports nothing back to the caller beyond letting the underlying `replace` call either succeed or throw whatever the shared history itself throws.

## 2. Actor Flows (CDSL)

### Deep Link Resolves Through The Route Ownership Signal

- [ ] `p1` - **ID**: `cpt-frontx-flow-routing-route-ownership-signal-deep-link-cold-mount`

**Actor**: `cpt-frontx-routing-actor-application-developer`

**Use cases**: `cpt-frontx-routing-usecase-deep-link-to-microfrontend-screen`

**Success Scenarios**:
- A URL under a declared prefix is opened cold, reloaded, or reached by back/forward while the microfrontend that owns that prefix is not yet mounted; the observer reports the owner appearing, the consumer's own mount mechanism mounts it, and once mounted its own engine provider reads the already-current location at start, so the mounted screen and the URL agree without a blank screen in between.
- A URL under a declared prefix that is already mounted is opened; the observer reports a `remainder-changed` transition (or none, if nothing about the pathname beneath the prefix changed either) and the consumer's own mount mechanism takes no mounting action.

**Error Scenarios**:
- The pathname matches no declared prefix: the observer reports "no owner" (a `disappeared` transition if one was previously bound, or no transition at all on a first resolution to "no owner") and the consumer's own fallback is shown; this feature takes no fallback action itself.

**Steps**:
1. [ ] - `p1` - The consumer creates the observer, passing its own owner-prefix pairs source - `inst-create-observer`
2. [ ] - `p1` - **WHEN** the navigation substrate's fan-out notifies the observer of a cold load, reload, back/forward step, or any other navigation (`cpt-frontx-algo-routing-navigation-substrate-fanout-dispatch`) - `inst-notify-navigation`
   1. [ ] - `p1` - The observer resolves the current pathname's owner through the owner resolution primitive (`cpt-frontx-algo-routing-route-ownership-signal-owner-resolution`) - `inst-resolve-owner`
   2. [ ] - `p1` - The observer reports the transition from the previously resolved owner to the newly resolved one to the consumer's registered callback (`cpt-frontx-algo-routing-route-ownership-signal-observe-change`) - `inst-report-transition`
3. [ ] - `p1` - **IF** the transition reports an owner appearing, or changing to a not-yet-mounted owner - `inst-if-appeared`
   1. [ ] - `p1` - The consumer mounts that owner through its own mount mechanism (§1.4, Binding obligation) - `inst-consumer-mounts`
   2. [ ] - `p1` - Once mounted, the microfrontend's own engine provider reads the current location from the shared history at start and matches the remainder of the path under its `basepath` (specified in `cpt-frontx-feature-routing-engine-provider`) - `inst-mfe-reads-location-at-start`
4. [ ] - `p1` - **ELSE IF** the transition reports the same owner already mounted, with only the remainder changed - `inst-elseif-remainder-changed`
   1. [ ] - `p1` - The consumer takes no mounting action; the already-mounted microfrontend's own router handles the remainder change through its own routing table - `inst-no-mount-action-remainder`
5. [ ] - `p1` - **ELSE** the transition reports no owner, or an owner disappearing - `inst-else-no-owner`
   1. [ ] - `p1` - The consumer's own fallback is shown; this feature takes no fallback action itself - `inst-consumer-fallback`

**Postconditions**:
- The mounted screen and the URL agree without a blank screen, because the freshly mounted router reads the already-current location rather than starting from a blank route, and because the consumer's own mount mechanism acted on the transition this feature reported.

## 3. Processes / Business Logic (CDSL)

### Owner Resolution Primitive

- [ ] `p2` - **ID**: `cpt-frontx-algo-routing-route-ownership-signal-owner-resolution`

**Input**: A pathname; a set of declared identifier-to-prefix pairs, supplied by the caller as a plain argument.

**Output**: The identifier of the route owner whose declared prefix is the longest match for the pathname, together with that specific matched declared prefix, or a "no owner" result — exactly the navigation substrate's own result, unmodified.

**Steps**:
1. [ ] - `p1` - Delegate directly to the navigation substrate's own longest-matching-prefix primitive (`cpt-frontx-algo-routing-navigation-substrate-prefix-resolution`), passing the pathname and the declared pairs unchanged - `inst-delegate-to-substrate`
2. [ ] - `p1` - **RETURN** that primitive's result unchanged — the owner identifier and its matched prefix together, or "no owner" - `inst-return-substrate-result`

**Rationale**: This algorithm exposes the substrate's own segment-matching rule as this feature's public entry point; it defines no matching rule of its own, so a change to segment-matching behavior — root-prefix handling, trailing-separator normalization, or the longest-match tie-break — is a change to the substrate's algorithm alone (`cpt-frontx-feature-routing-navigation-substrate` §3), never to this one.

### Observable Owner-Change Signal

- [ ] `p2` - **ID**: `cpt-frontx-algo-routing-route-ownership-signal-observe-change`

**Input**: The consumer's own owner-prefix pairs source, passed as a plain argument at creation (never an injected port); a callback the consumer registers to receive a transition; the navigation substrate's shared history and its fan-out subscription; the observer's own internally tracked previous owner, previous matched prefix, and previous pathname, updated after every resolution this algorithm performs.

**Output**: An observer subscribed to the navigation substrate's fan-out, plus a release function returned to the consumer at creation (`cpt-frontx-algo-routing-route-ownership-signal-release`); on creation, and on every subsequent navigation that is ownership-relevant, one call to the consumer's callback carrying an ownership-change transition (§1.5, Ownership-Change Transition); no call at all when neither the owner nor the pathname beneath it changed.

**Steps**:
1. [ ] - `p1` - **WHEN** the consumer creates the observer, passing its own owner-prefix pairs source and registering its callback - `inst-when-create`
   1. [ ] - `p1` - Resolve the current pathname's owner and matched prefix through the owner resolution primitive (`cpt-frontx-algo-routing-route-ownership-signal-owner-resolution`) - `inst-initial-resolve`
   2. [ ] - `p1` - **IF** an owner resolves - `inst-if-initial-owner`
      1. [ ] - `p1` - Report an initial transition of kind `appeared`, with no previous owner recorded - `inst-initial-report-appeared`
   3. [ ] - `p1` - **ELSE** no owner resolves at creation - `inst-else-initial-no-owner`
      1. [ ] - `p1` - Report no initial transition — there is nothing yet to report a change from (§1.4, Binding obligation point 5: the consumer must not wait for one) - `inst-initial-no-report`
   4. [ ] - `p1` - Record the just-resolved owner, matched prefix, and the current pathname as the observer's previous state, regardless of whether step 1.2 or 1.3 ran - `inst-record-initial-state`
   5. [ ] - `p1` - Subscribe to the navigation substrate's fan-out (`cpt-frontx-algo-routing-navigation-substrate-fanout-dispatch`) - `inst-subscribe-fanout`
   6. [ ] - `p1` - **IF** the owner-prefix pairs source exposes a change notification (§1.5) - `inst-if-source-has-notification`
      1. [ ] - `p1` - Subscribe to it as well - `inst-subscribe-pairs-source`
   7. [ ] - `p1` - **RETURN** the release function (`cpt-frontx-algo-routing-route-ownership-signal-release`) to the consumer, closed over the subscription(s) registered in steps 1.5 and 1.6 - `inst-return-release`
2. [ ] - `p1` - **WHEN** the navigation substrate's fan-out notifies the observer of a navigation - `inst-when-navigation`
   1. [ ] - `p1` - Read the current pathname from the shared history's `location` - `inst-read-pathname`
   2. [ ] - `p1` - Resolve the current pathname's owner and matched prefix through the owner resolution primitive, reading the consumer's own owner-prefix pairs source at this same moment - `inst-resolve-current`
   3. [ ] - `p1` - **IF** the previous owner was "no owner" and the new one is a declared owner - `inst-if-appeared`
      1. [ ] - `p1` - Report a transition of kind `appeared` - `inst-report-appeared`
   4. [ ] - `p1` - **ELSE IF** the previous owner was a declared owner and the new one is "no owner" - `inst-elseif-disappeared`
      1. [ ] - `p1` - Report a transition of kind `disappeared` - `inst-report-disappeared`
   5. [ ] - `p1` - **ELSE IF** the previous and new owner are both declared and differ - `inst-elseif-changed`
      1. [ ] - `p1` - Report a transition of kind `changed` - `inst-report-changed`
   6. [ ] - `p1` - **ELSE IF** the previous and new owner are the same declared owner, and the current pathname differs from the previously recorded pathname - `inst-elseif-remainder-changed`
      1. [ ] - `p1` - Report a transition of kind `remainder-changed` — the pathname beneath the matched prefix moved without a change of owner - `inst-report-remainder-changed`
   7. [ ] - `p1` - **ELSE IF** the previous and new owner are the same declared owner, and the current pathname equals the previously recorded pathname - `inst-elseif-same-owner-same-pathname`
      1. [ ] - `p1` - Report no transition — nothing about the URL beneath the owner's matched prefix changed; this is, in particular, what a navigation that changes only the current URL's search or hash produces, since resolution matches on pathname alone and neither component is part of it - `inst-no-report-unchanged`
   8. [ ] - `p1` - **ELSE** the previous and new owner are both "no owner" - `inst-else-no-owner-to-no-owner`
      1. [ ] - `p1` - Report no transition: nothing about ownership changed, and this algorithm reports only ownership-relevant transitions, not every navigation indiscriminately - `inst-no-report-no-owner-to-no-owner`
   9. [ ] - `p1` - Record the just-resolved owner, matched prefix, and current pathname as the observer's new previous state, regardless of which branch above ran - `inst-record-navigation-state`
3. [ ] - `p1` - **WHEN** the owner-prefix pairs source's own change notification fires, for a source that exposes one (§1.5) - `inst-when-pairs-source-changes`
   1. [ ] - `p1` - Re-run steps 2.1 through 2.9 against the current pathname and the source's now-current pairs, exactly as if a navigation had occurred — a registration or deregistration can change which owner a fixed pathname resolves to without the URL itself moving - `inst-reresolve-on-pairs-change`

**Rationale**: Reporting a `remainder-changed` transition rather than staying silent when the owner does not change is what lets a consumer whose own mount mechanism cares about in-territory navigation — for example, to keep an outer layout in sync — react without this feature inventing knowledge of what that reaction should be; the consumer's own mechanism decides what, if anything, to do with it. Tracking the previously recorded pathname, not only the previously recorded owner, is what makes that reporting precise: without it, a navigation that leaves the pathname exactly as it was — most notably one that changes only the current URL's search or hash — would be indistinguishable from one that actually moved within the owner's territory, and would report a `remainder-changed` transition carrying no real change for the consumer to act on. Filtering out a "no owner" to "no owner" transition, and a same-owner/same-pathname transition, are the two cases this algorithm treats as not ownership-relevant: nothing about occupancy could have changed when no declared prefix matched before or after, or when the pathname beneath a persisting owner's matched prefix is unchanged. Reporting an initial transition at creation, rather than only from the first subsequent navigation, is what covers a cold load or a reload — the very case a consumer most needs this signal for — from the first moment the observer exists.

### Observer Release

- [ ] `p2` - **ID**: `cpt-frontx-algo-routing-route-ownership-signal-release`

**Input**: An observer created by `cpt-frontx-algo-routing-route-ownership-signal-observe-change`, and the internal subscription(s) it registered at creation: the navigation substrate's fan-out, and the owner-prefix pairs source's own change notification, when the source exposed one.

**Output**: Every subscription this observer itself registered, unsubscribed; the observer reports no further transitions after this point.

**Steps**:
1. [ ] - `p1` - **WHEN** the consumer calls the release function returned at observer creation - `inst-when-release-called`
   1. [ ] - `p1` - Unsubscribe from the navigation substrate's fan-out subscription registered at observer creation - `inst-unsubscribe-fanout`
   2. [ ] - `p1` - **IF** the observer also subscribed to the owner-prefix pairs source's own change notification at creation - `inst-if-subscribed-pairs-source`
      1. [ ] - `p1` - Unsubscribe from that subscription as well - `inst-unsubscribe-pairs-source`
   3. [ ] - `p1` - **IF** the release function is called again after the first call - `inst-if-called-again`
      1. [ ] - `p1` - Treat the call as a no-op — nothing is subscribed to unsubscribe from a second time - `inst-release-idempotent`
2. [ ] - `p1` - **RETURN** - `inst-return-release-done`

**Rationale**: This feature holds no lifecycle notion of its own beyond the subscriptions its own observer registers (§4, No Feature-Owned State Machine), so leaking one is entirely this algorithm's responsibility to prevent, the same way the Engine Provider's own teardown algorithm prevents a leaked subscription on its own adapted history (`cpt-frontx-algo-routing-engine-provider-teardown`). Releasing both subscriptions this observer itself registered — not only the fan-out one — is what DESIGN §4 already names this feature as the owner of preventing: an observer whose pairs-source subscription outlives it leaks exactly as durably as one whose fan-out subscription does.

### URL Back-Projection Helper Via Replace

- [ ] `p2` - **ID**: `cpt-frontx-algo-routing-route-ownership-signal-url-back-projection`

**Input**: A specific declared prefix the consumer wants reflected into the URL, mounted for a reason other than a navigation-driven transition this feature's observer reported; the current location's search and hash.

**Output**: A `replace` call against the shared history reflecting that declared prefix into the URL's pathname, carrying the current location's search and hash forward unchanged.

**Steps**:
1. [ ] - `p1` - The consumer calls this helper with a specific declared prefix — the matched prefix carried by whichever mount it is reflecting, not merely an owner's identifier, since one owner may have declared more than one prefix — when its own mount mechanism performed a mount that was not initiated by a navigation-driven transition from the observer (§3, Observable Owner-Change Signal) - `inst-consumer-calls-helper`
2. [ ] - `p1` - Read the current location's search and hash - `inst-read-current-search-hash`
3. [ ] - `p1` - Call the shared history's `replace` — never `push` — with the given prefix as the pathname, carrying the search and hash read in step 2 forward onto it unchanged, the same location-preserving discipline this ecosystem applies to any redirect helper - `inst-call-replace`
4. [ ] - `p1` - **RETURN** - `inst-return-reflected`

**Timing note**: If the consumer calls this helper before the navigation substrate's fan-out has delivered the notification for a history move already in flight (a `go` call, a back/forward step, or a third-party history move — all observed only asynchronously, per `cpt-frontx-algo-routing-navigation-substrate-fanout-dispatch`), the `replace` in step 3 still overwrites whichever entry the browser's own history has already moved to at the moment this call executes, never the entry that was current before that move started: the browser completes the move to its own current entry synchronously, and it is only this library's own notification of that move that lags asynchronously behind it. A consumer that invokes this helper eagerly, before observing the transition the move itself produces, therefore still replaces the post-move entry.

**Rationale**: `replace` rather than `push` is what keeps a mount the user did not navigate to from creating an extra back/forward entry: unlike `push`, a `replace` does not truncate the forward portion of the history stack after a back step the user has already taken, so the reflection does not discard forward history the way an added entry would — the URL stays authoritative without the reflection itself becoming a navigation the user has to step back through. This has a real, accepted cost: `replace` overwrites the history entry the user was previously on, so that entry becomes unreachable by a subsequent back step, and any sub-path deeper than the reflected prefix that entry carried is discarded along with it. That cost is the price of treating the URL as authoritative, not an oversight of this algorithm — the alternative, `push`, would avoid the cost but let a mount the user never navigated to create a back/forward entry they now have to step through, which is the worse trade this algorithm exists to avoid. Carrying the current search and hash forward, rather than replacing the pathname alone, is what keeps this reflection from being the same dropped-query-string mistake a location-preserving redirect helper exists to prevent.

## 4. States (CDSL)

### No Feature-Owned State Machine

Not applicable. This feature holds no occupancy or binding lifecycle of its own to model as named states with guarded transitions — an observer's own lifecycle is only "subscribed" or "released" (§3, Observer Release), a lifetime, not an occupancy state machine. Occupancy, cardinality, and any state machine tracking which owner currently occupies a placement belong entirely to whichever mount mechanism the consumer already runs — for this ecosystem's own host, the `mfes` runtime's own mount strategies and registry (`cpt-frontx-adr-extension-domain-occupancy`). Modeling that lifecycle here would duplicate a domain this package does not own and must stay agnostic of (`cpt-frontx-routing-principle-publishes-not-orchestrates`), so no state machine is defined for this feature.

## 5. Definitions of Done

### Owner Resolution And Observable Signal

- [ ] `p1` - **ID**: `cpt-frontx-dod-routing-route-ownership-signal-resolution-and-observation`

The system **MUST** expose the navigation substrate's longest-matching-prefix resolution as this feature's own public primitive, taking a pathname and a set of declared identifier-to-prefix pairs and returning the matched owner together with its matched declared prefix, or "no owner", without re-implementing the matching rule, and **MUST** let a consumer create an observer by passing its own owner-prefix pairs source as a plain argument — never an injected port — that reports, on creation and on every subsequent ownership-relevant navigation, a transition distinguishing an owner appearing, an owner disappearing, an owner changing, and the same owner's remainder changing, to a callback the consumer registers, while reporting no transition at all when the resolved owner is "no owner" both before and after, or when the same owner and matched prefix persist with the pathname beneath it unchanged — including a navigation that changes only the current URL's search or hash.

**Implements**:
- `cpt-frontx-flow-routing-route-ownership-signal-deep-link-cold-mount`
- `cpt-frontx-algo-routing-route-ownership-signal-owner-resolution`
- `cpt-frontx-algo-routing-route-ownership-signal-observe-change`

**Addresses**:
- `cpt-frontx-routing-fr-route-ownership-signal`
- `cpt-frontx-routing-usecase-deep-link-to-microfrontend-screen`

**Touches**:
- Component: `cpt-frontx-component-routing-screen-binding`

### Observer Release

- [ ] `p1` - **ID**: `cpt-frontx-dod-routing-route-ownership-signal-release`

The system **MUST** return a release function to the consumer when an observer is created, and **MUST**, when that function is called, unsubscribe the observer from the navigation substrate's fan-out and from the owner-prefix pairs source's own change notification when the source exposed one, with a call after the first treated as a no-op.

**Implements**:
- `cpt-frontx-algo-routing-route-ownership-signal-release`

**Addresses**:
- `cpt-frontx-routing-fr-route-ownership-signal`

**Touches**:
- Component: `cpt-frontx-component-routing-screen-binding`

### URL Back-Projection Helper

- [ ] `p1` - **ID**: `cpt-frontx-dod-routing-route-ownership-signal-url-back-projection`

The system **MUST** provide a helper that replaces — never pushes — the current history entry's pathname with a given, specific declared prefix while carrying the current location's search and hash forward unchanged, callable by a consumer whenever its own mount mechanism mounted an owner for a reason other than a navigation-driven transition this feature's observer reported, accepting as the deliberate cost of that guarantee that the replaced entry becomes unreachable by a subsequent back step.

**Implements**:
- `cpt-frontx-algo-routing-route-ownership-signal-url-back-projection`

**Addresses**:
- `cpt-frontx-routing-fr-route-ownership-signal`

**Touches**:
- Component: `cpt-frontx-component-routing-screen-binding`

## 6. Acceptance Criteria

- [ ] Given a pathname and a set of declared identifier-to-prefix pairs, the owner-resolution primitive returns the identifier and its specific matched declared prefix, or "no owner", by delegating unchanged to the navigation substrate's own primitive.
- [ ] A consumer creates the observer by passing its own owner-prefix pairs source as a plain argument, never through an injected port.
- [ ] On creation, the observer resolves and reports the current pathname's owner before any subsequent navigation occurs, so a cold load or reload is covered from the observer's first moment, not only from the first navigation after it; on a path no declared prefix covers, creation reports no initial transition at all.
- [ ] On every subsequent ownership-relevant navigation, the observer reports exactly one transition: `appeared` when the owner goes from none to a declared owner, `disappeared` when it goes from a declared owner to none, `changed` when it moves from one declared owner to a different one, and `remainder-changed` when the same declared owner remains but the pathname beneath its matched prefix moved.
- [ ] No transition is reported when the resolved owner is "no owner" both before and after a navigation, nor when the same owner and matched prefix persist with the pathname beneath it unchanged; a navigation that changes only the current URL's search or hash falls into this latter case and produces no transition, because resolution matches on pathname alone.
- [ ] A change to the owner-prefix pairs source's own declared set re-triggers resolution against the current pathname, exactly as a navigation would, when the source exposes a change notification.
- [ ] Creating an observer returns a release function; calling it unsubscribes the observer from the navigation substrate's fan-out and, when the owner-prefix pairs source exposed one, from that source's own change notification, and the observer reports no further transitions afterward. Calling it again is a no-op.
- [ ] More than one observer may exist in the same realm at once, each independent, each with its own owner-prefix pairs source, each released independently.
- [ ] The URL back-projection helper replaces — never pushes — the current history entry's pathname with a given, specific declared prefix, carries the current location's search and hash forward unchanged, and the replaced entry becomes unreachable by a subsequent back step as the accepted cost of that guarantee; a `replace`, unlike a `push`, does not truncate the forward portion of the history stack after a back step already taken. Invoking the helper before the fan-out has delivered the notification for an in-flight history move still replaces the entry the browser has already moved to, not the entry current before that move.
- [ ] A consumer's own mount mechanism treats mounting an already-mounted owner as a no-op, so the transition the URL back-projection helper's own `replace` produces — an echo of the consumer's own reflection — does not double-mount or re-initialize it.
- [ ] This feature holds no registry of route owners, executes no mount or unmount itself, and defines no occupancy state machine; a consumer that wants the URL and a mounted owner to durably agree implements that agreement itself, per the Binding obligation (§1.4), on top of the primitive, the signal, and the helper this feature publishes.
- [ ] A domain's occupancy cardinality — how many owners a placement may hold simultaneously, and how a race between two mounts targeting the same placement resolves — is decided entirely by the consumer's own mount mechanism; this feature carries no notion of exclusive versus concurrent occupancy, and resolves no mount race of its own.
