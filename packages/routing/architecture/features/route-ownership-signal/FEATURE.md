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
  - [URL Back-Projection Helper Via Replace](#url-back-projection-helper-via-replace)
- [4. States (CDSL)](#4-states-cdsl)
  - [No Feature-Owned State Machine](#no-feature-owned-state-machine)
- [5. Definitions of Done](#5-definitions-of-done)
  - [Owner Resolution And Observable Signal](#owner-resolution-and-observable-signal)
  - [URL Back-Projection Helper](#url-back-projection-helper)
- [6. Acceptance Criteria](#6-acceptance-criteria)

<!-- /toc -->

- [ ] `p1` - **ID**: `cpt-frontx-featstatus-routing-route-ownership-signal`
## 1. Feature Context

- [ ] `p2` - `cpt-frontx-feature-routing-route-ownership-signal`

### 1.1 Overview

Route Ownership Signal publishes two small, independent facts derived from the URL, and orchestrates no mounting. First, it exposes the navigation substrate's own longest-matching-prefix primitive as this package's public owner-resolution surface: given a pathname and a set of declared identifier-to-prefix pairs, it names the owner or reports that none matches — a pure function, not stateful, and not a re-implementation of the substrate's matching rule. Second, it exposes an observable signal a consumer creates by passing the source of those declared pairs as a plain argument — never an injected port: the observer subscribes to the navigation substrate's shared history and, on creation and on every subsequent navigation, reports a transition from the previously resolved owner to the newly resolved one, distinguishing an owner appearing, an owner disappearing, an owner changing, and the owner staying the same while the URL's remainder beneath its prefix changes. Third, it exposes a URL back-projection helper a consumer calls when a mount happened for a reason other than navigation, replacing the current history entry with the mounted owner's declared prefix. None of the three touches mounting, unmounting, a registry of owners, or a state machine tracking which owner currently occupies a placement — those facts and that occupancy belong entirely to whichever mount mechanism the consumer already runs.

### 1.2 Purpose

A composed application's routable placements must resolve the same way regardless of how the user arrived at a URL: typing it, reloading it, stepping back or forward through history, or following a link. But the runtime that actually owns domain occupancy — named mount strategies, a cardinality matrix, and a registry of what is currently mounted — is the `mfes` runtime, not this library (`cpt-frontx-principle-agnostic-core`). A version of this feature that orchestrated mounting itself duplicated that runtime's own reconciliation behind a narrower, single-slot vocabulary that could not express the runtime's cardinality matrix or its concurrent-occupancy strategy, and drew an ad hoc boundary between "exclusive" and "concurrent" occupancy that this package had no way to compute on its own. Route Ownership Signal exists to give any consumer — this ecosystem's own host, built on the `mfes` runtime, or an unrelated one — the same URL-derived facts a host needs to drive its own reconciliation, without this package ever holding, orchestrating, or guessing at that reconciliation itself.

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

Without this recipe running in the consumer's own host glue, the primitive, the signal, and the helper this feature publishes describe facts, not a maintained agreement — the two-way agreement is the combination's guarantee, not this package's alone.

### 1.5 Contract Shapes

Field-level shapes for this feature's own inputs and outputs, per `cpt-frontx-adr-contract-schema-ownership` (owned contract role in DESIGN, decision rationale in the ADR, field-level schema in the owning FEATURE).

**Owner-prefix pairs source** (consumer-supplied, passed as a plain argument — never an injected port):
- A readable snapshot of the current set of declared identifier-to-prefix pairs, in the same shape the navigation substrate's owner-resolution primitive reads (`cpt-frontx-algo-routing-navigation-substrate-prefix-resolution`).
- Optionally, a way to observe a change to that set, since the declared-owner set is not fixed for the realm's lifetime — a microfrontend can be registered or deregistered after the observer has already been created. A consumer whose set never changes after creation may supply a static snapshot with no change notification.
- Declares no cardinality floor: zero declared owners is legal and simply means every pathname resolves to "no owner".

**Ownership-change transition** (this feature's own output, delivered to the callback the consumer registers when creating the observer):
- Previous owner (or "no owner").
- New owner (or "no owner").
- Kind: `appeared` (no owner → an owner), `disappeared` (an owner → no owner), `changed` (one owner → a different owner), or `remainder-changed` (the same owner, but the portion of the pathname beneath its declared prefix changed).
- The current pathname the transition was resolved for.

**URL back-projection input**: the declared prefix of the owner to reflect into the current history entry. The helper reports nothing back to the caller beyond letting the underlying `replace` call either succeed or throw whatever the shared history itself throws.

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

**Output**: The identifier of the route owner whose declared prefix is the longest match for the pathname, or a "no owner" result — exactly the navigation substrate's own result, unmodified.

**Steps**:
1. [ ] - `p1` - Delegate directly to the navigation substrate's own longest-matching-prefix primitive (`cpt-frontx-algo-routing-navigation-substrate-prefix-resolution`), passing the pathname and the declared pairs unchanged - `inst-delegate-to-substrate`
2. [ ] - `p1` - **RETURN** that primitive's result unchanged - `inst-return-substrate-result`

**Rationale**: This algorithm exposes the substrate's own segment-matching rule as this feature's public entry point; it defines no matching rule of its own, so a change to segment-matching behavior — root-prefix handling, trailing-separator normalization, or the longest-match tie-break — is a change to the substrate's algorithm alone (`cpt-frontx-feature-routing-navigation-substrate` §3), never to this one.

### Observable Owner-Change Signal

- [ ] `p2` - **ID**: `cpt-frontx-algo-routing-route-ownership-signal-observe-change`

**Input**: The consumer's own owner-prefix pairs source, passed as a plain argument at creation (never an injected port); a callback the consumer registers to receive a transition; the navigation substrate's shared history and its fan-out subscription.

**Output**: An observer subscribed to the navigation substrate's fan-out; on creation, and on every subsequent navigation that is ownership-relevant, one call to the consumer's callback carrying an ownership-change transition (§1.5, Ownership-Change Transition).

**Steps**:
1. [ ] - `p1` - **WHEN** the consumer creates the observer, passing its own owner-prefix pairs source and registering its callback - `inst-when-create`
   1. [ ] - `p1` - Resolve the current pathname's owner through the owner resolution primitive (`cpt-frontx-algo-routing-route-ownership-signal-owner-resolution`) - `inst-initial-resolve`
   2. [ ] - `p1` - **IF** an owner resolves - `inst-if-initial-owner`
      1. [ ] - `p1` - Report an initial transition of kind `appeared`, with no previous owner recorded - `inst-initial-report-appeared`
   3. [ ] - `p1` - **ELSE** no owner resolves at creation - `inst-else-initial-no-owner`
      1. [ ] - `p1` - Report no initial transition — there is nothing yet to report a change from - `inst-initial-no-report`
   4. [ ] - `p1` - Subscribe to the navigation substrate's fan-out (`cpt-frontx-algo-routing-navigation-substrate-fanout-dispatch`) - `inst-subscribe-fanout`
2. [ ] - `p1` - **WHEN** the navigation substrate's fan-out notifies the observer of a navigation - `inst-when-navigation`
   1. [ ] - `p1` - Read the current pathname from the shared history's `location` - `inst-read-pathname`
   2. [ ] - `p1` - Resolve the current pathname's owner through the owner resolution primitive, reading the consumer's own owner-prefix pairs source at this same moment - `inst-resolve-current`
   3. [ ] - `p1` - **IF** the previous owner was "no owner" and the new one is a declared owner - `inst-if-appeared`
      1. [ ] - `p1` - Report a transition of kind `appeared` - `inst-report-appeared`
   4. [ ] - `p1` - **ELSE IF** the previous owner was a declared owner and the new one is "no owner" - `inst-elseif-disappeared`
      1. [ ] - `p1` - Report a transition of kind `disappeared` - `inst-report-disappeared`
   5. [ ] - `p1` - **ELSE IF** the previous and new owner are both declared and differ - `inst-elseif-changed`
      1. [ ] - `p1` - Report a transition of kind `changed` - `inst-report-changed`
   6. [ ] - `p1` - **ELSE IF** the previous and new owner are the same declared owner - `inst-elseif-same-owner`
      1. [ ] - `p1` - Report a transition of kind `remainder-changed` — the pathname beneath the declared prefix moved without a change of owner - `inst-report-remainder-changed`
   7. [ ] - `p1` - **ELSE** the previous and new owner are both "no owner" - `inst-else-no-owner-to-no-owner`
      1. [ ] - `p1` - Report no transition: nothing about ownership changed, and this algorithm reports only ownership-relevant transitions, not every navigation indiscriminately - `inst-no-report-no-owner-to-no-owner`
3. [ ] - `p1` - **WHEN** the owner-prefix pairs source's own change notification fires, for a source that exposes one (§1.5) - `inst-when-pairs-source-changes`
   1. [ ] - `p1` - Re-run steps 2.1 through 2.7 against the current pathname and the source's now-current pairs, exactly as if a navigation had occurred — a registration or deregistration can change which owner a fixed pathname resolves to without the URL itself moving - `inst-reresolve-on-pairs-change`

**Rationale**: Reporting a `remainder-changed` transition rather than staying silent when the owner does not change is what lets a consumer whose own mount mechanism cares about in-territory navigation — for example, to keep an outer layout in sync — react without this feature inventing knowledge of what that reaction should be; the consumer's own mechanism decides what, if anything, to do with it. Filtering out a "no owner" to "no owner" transition is the one case this algorithm treats as not ownership-relevant: nothing about occupancy could have changed when no declared prefix matched before or after. Reporting an initial transition at creation, rather than only from the first subsequent navigation, is what covers a cold load or a reload — the very case a consumer most needs this signal for — from the first moment the observer exists.

### URL Back-Projection Helper Via Replace

- [ ] `p2` - **ID**: `cpt-frontx-algo-routing-route-ownership-signal-url-back-projection`

**Input**: The declared prefix of an owner the consumer has mounted for a reason other than a navigation-driven transition this feature's observer reported.

**Output**: A `replace` call against the shared history reflecting that declared prefix into the URL.

**Steps**:
1. [ ] - `p1` - The consumer calls this helper with the mounted owner's declared prefix, when its own mount mechanism performed a mount that was not initiated by a navigation-driven transition from the observer (§3, Observable Owner-Change Signal) - `inst-consumer-calls-helper`
2. [ ] - `p1` - Call the shared history's `replace` — never `push` — with that declared prefix - `inst-call-replace`
3. [ ] - `p1` - **RETURN** - `inst-return-reflected`

**Rationale**: `replace` rather than `push` is what keeps a mount the user did not navigate to from creating an extra back/forward entry, and from discarding an in-progress back/forward navigation the user did initiate — the URL stays authoritative without the reflection itself becoming a navigation the user has to step back through. This has a real, accepted cost: `replace` overwrites the history entry the user was previously on, so that entry becomes unreachable by a subsequent back step, and any sub-path deeper than the reflected owner's declared prefix that entry carried is discarded along with it. That cost is the price of treating the URL as authoritative, not an oversight of this algorithm — the alternative, `push`, would avoid the cost but let a mount the user never navigated to create a back/forward entry they now have to step through, which is the worse trade this algorithm exists to avoid.

## 4. States (CDSL)

### No Feature-Owned State Machine

Not applicable. This feature holds no occupancy or binding lifecycle of its own to model as named states with guarded transitions. Occupancy, cardinality, and any state machine tracking which owner currently occupies a placement belong entirely to whichever mount mechanism the consumer already runs — for this ecosystem's own host, the `mfes` runtime's own mount strategies and registry (`cpt-frontx-adr-extension-domain-occupancy`). Modeling that lifecycle here would duplicate a domain this package does not own and must stay agnostic of (`cpt-frontx-principle-agnostic-core`), so no state machine is defined for this feature.

## 5. Definitions of Done

### Owner Resolution And Observable Signal

- [ ] `p1` - **ID**: `cpt-frontx-dod-routing-route-ownership-signal-resolution-and-observation`

The system **MUST** expose the navigation substrate's longest-matching-prefix resolution as this feature's own public primitive, taking a pathname and a set of declared identifier-to-prefix pairs and returning the matched owner or "no owner" without re-implementing the matching rule, and **MUST** let a consumer create an observer by passing its own owner-prefix pairs source as a plain argument — never an injected port — that reports, on creation and on every subsequent ownership-relevant navigation, a transition distinguishing an owner appearing, an owner disappearing, an owner changing, and the same owner's remainder changing, to a callback the consumer registers, while reporting no transition when the resolved owner is "no owner" both before and after.

**Implements**:
- `cpt-frontx-flow-routing-route-ownership-signal-deep-link-cold-mount`
- `cpt-frontx-algo-routing-route-ownership-signal-owner-resolution`
- `cpt-frontx-algo-routing-route-ownership-signal-observe-change`

**Addresses**:
- `cpt-frontx-routing-fr-route-ownership-signal`
- `cpt-frontx-routing-usecase-deep-link-to-microfrontend-screen`

**Touches**:
- Component: `cpt-frontx-component-routing-screen-binding`

### URL Back-Projection Helper

- [ ] `p1` - **ID**: `cpt-frontx-dod-routing-route-ownership-signal-url-back-projection`

The system **MUST** provide a helper that replaces — never pushes — the current history entry with a given declared prefix, callable by a consumer whenever its own mount mechanism mounted an owner for a reason other than a navigation-driven transition this feature's observer reported, accepting as the deliberate cost of that guarantee that the replaced entry becomes unreachable by a subsequent back step.

**Implements**:
- `cpt-frontx-algo-routing-route-ownership-signal-url-back-projection`

**Addresses**:
- `cpt-frontx-routing-fr-route-ownership-signal`

**Touches**:
- Component: `cpt-frontx-component-routing-screen-binding`

## 6. Acceptance Criteria

- [ ] Given a pathname and a set of declared identifier-to-prefix pairs, the owner-resolution primitive returns the identifier whose declared prefix is the longest match, or "no owner", by delegating unchanged to the navigation substrate's own primitive.
- [ ] A consumer creates the observer by passing its own owner-prefix pairs source as a plain argument, never through an injected port.
- [ ] On creation, the observer resolves and reports the current pathname's owner before any subsequent navigation occurs, so a cold load or reload is covered from the observer's first moment, not only from the first navigation after it.
- [ ] On every subsequent ownership-relevant navigation, the observer reports exactly one transition: `appeared` when the owner goes from none to a declared owner, `disappeared` when it goes from a declared owner to none, `changed` when it moves from one declared owner to a different one, and `remainder-changed` when the same declared owner remains but the pathname beneath its prefix moved.
- [ ] No transition is reported when the resolved owner is "no owner" both before and after a navigation.
- [ ] A change to the owner-prefix pairs source's own declared set re-triggers resolution against the current pathname, exactly as a navigation would, when the source exposes a change notification.
- [ ] The URL back-projection helper replaces — never pushes — the current history entry with a given declared prefix, and the replaced entry becomes unreachable by a subsequent back step as the accepted cost of that guarantee.
- [ ] This feature holds no registry of route owners, executes no mount or unmount itself, and defines no occupancy state machine; a consumer that wants the URL and a mounted owner to durably agree implements that agreement itself, per the Binding obligation (§1.4), on top of the primitive, the signal, and the helper this feature publishes.
- [ ] A domain's occupancy cardinality — how many owners a placement may hold simultaneously, and how a race between two mounts targeting the same placement resolves — is decided entirely by the consumer's own mount mechanism; this feature carries no notion of exclusive versus concurrent occupancy, and resolves no mount race of its own.
