# Feature: Route Ownership Signal


<!-- toc -->

- [1. Feature Context](#1-feature-context)
  - [1.1 Overview](#11-overview)
  - [1.2 Purpose](#12-purpose)
  - [1.3 Actors](#13-actors)
  - [1.4 References](#14-references)
  - [1.5 Contract Shapes](#15-contract-shapes)
- [2. Actor Flows (CDSL)](#2-actor-flows-cdsl)
  - [Deep Link Resolves Through The Route Ownership Signal, One Domain Level At A Time](#deep-link-resolves-through-the-route-ownership-signal-one-domain-level-at-a-time)
- [3. Processes / Business Logic (CDSL)](#3-processes--business-logic-cdsl)
  - [Owner Resolution Primitive](#owner-resolution-primitive)
  - [Observable Owner-Change Signal](#observable-owner-change-signal)
  - [Observer Release](#observer-release)
  - [URL Back-Projection Helper Via Replace (Axial Mode)](#url-back-projection-helper-via-replace-axial-mode)
  - [Parallel-Axis Back-Projection Via Own-Key Replace](#parallel-axis-back-projection-via-own-key-replace)
- [4. States (CDSL)](#4-states-cdsl)
  - [No Feature-Owned State Machine](#no-feature-owned-state-machine)
- [5. Definitions of Done](#5-definitions-of-done)
  - [Owner Resolution And Observable Signal](#owner-resolution-and-observable-signal)
  - [Observer Release](#observer-release-1)
  - [URL Back-Projection Helper (Axial Mode)](#url-back-projection-helper-axial-mode)
  - [URL Back-Projection Helper (Parallel-Axis Mode)](#url-back-projection-helper-parallel-axis-mode)
- [6. Acceptance Criteria](#6-acceptance-criteria)

<!-- /toc -->

- [ ] `p1` - **ID**: `cpt-frontx-featstatus-routing-route-ownership-signal`
## 1. Feature Context

- [ ] `p2` - `cpt-frontx-feature-routing-route-ownership-signal`

### 1.1 Overview

Route Ownership Signal publishes small, independent facts derived from the URL at one domain level, and orchestrates no mounting. First, it exposes the navigation substrate's own longest-matching-prefix primitive as this package's public owner-resolution surface: given a domain level's own local remainder and that domain's own set of declared identifier-to-prefix pairs, it names the owner and its declared prefix that matched, or reports that none matches; a pure function, not stateful, and not a re-implementation of the substrate's matching rule. Second, it exposes an observable signal a consumer creates once per domain level and once per axis that level projects — passing that domain's own owner-prefix pairs source as a plain argument, never an injected port, and, for a level's own axial axis, the base that level was handed by its enclosing level: the observer subscribes to the navigation substrate's shared history and, on creation and on every subsequent navigation, reports a transition from the previously resolved owner to the newly resolved one at that level, distinguishing an owner appearing, an owner disappearing, an owner changing, or the same owner's own remainder beneath its unchanged, single declared prefix changing — or no transition at all when none of those changed, which is also what a navigation that changes only the current URL's search or hash produces for an axial observer, since resolution matches on that level's own local remainder alone. Creating the observer also returns a release function the consumer calls to stop it, unsubscribing everything the observer itself subscribed to. Third, it exposes a URL back-projection helper a consumer calls when a mount happened for a reason other than navigation: one mode replaces the pathname beneath an axial domain's own base, the other replaces only a parallel axis's own query-string key entries, leaving everything else untouched. None of the three touches mounting, unmounting, a registry of owners, or a state machine tracking which owner currently occupies a placement, at any domain level — those facts and that occupancy belong entirely to whichever mount mechanism the consumer already runs.

Resolving a URL several domain levels deep is a wave through the tree of domains, not one event: each level's own observer resolves and reports independently the moment that level comes to exist, reading whatever the shared history's `location` already is at that moment, never a value captured earlier. This package holds no registry of levels and publishes no signal asserting that a whole path resolved end to end — it cannot, by construction, since it never sees the tree a consumer's own mount mechanism assembles from each level's own report. A deep "no owner" is, for exactly this reason, an event of whichever level detects it, indistinguishable from "the wave has not reached this level yet" until that level's own observer comes to exist and reports.

### 1.2 Purpose

A composed application's routable placements must resolve the same way regardless of how the user arrived at a URL: typing it, reloading it, stepping back or forward through history, or following a link — and that must hold at every domain level a composed application actually nests, not only at the outermost one. But the runtime that actually owns domain occupancy — named mount strategies, a cardinality matrix, and a registry of what is currently mounted — is the `mfes` runtime, not this library; the full boundary this draws is owned by `cpt-frontx-routing-principle-publishes-not-orchestrates` (DESIGN §2.1), not repeated here. Route Ownership Signal exists to give any consumer — this ecosystem's own host, built on the `mfes` runtime, or an unrelated one — the same URL-derived facts a domain level needs to drive its own reconciliation, at whatever depth that level sits, without this package ever holding, orchestrating, or guessing at that reconciliation itself.

**Requirements**: `cpt-frontx-routing-fr-route-ownership-signal`

### 1.3 Actors

| Actor | Role in Feature |
|-------|-----------------|
| `cpt-frontx-routing-actor-application-developer` | Creates a route-ownership-signal observer for each domain level and axis it holds, passing that domain's own source of declared identifier-to-prefix pairs as a plain argument; on each notified ownership transition at that level, mounts or unmounts the named owner through its own mount mechanism (the Binding obligation, §1.4); calls the appropriate URL back-projection helper when a mount it initiated was not driven by navigation. |
| `cpt-frontx-routing-actor-microfrontend-developer` | Declares its own prefix, and relies on the consumer's own mount mechanism — driven by this signal — to unmount it when the URL moves outside that prefix, and on the URL already being current when its own engine provider reads the location at mount. |

### 1.4 References

- **PRD**: [PRD.md](../../PRD.md)
- **Design**: [DESIGN.md](../../DESIGN.md)
- **Use case**: `cpt-frontx-routing-usecase-deep-link-to-microfrontend-screen`
- **Component**: `cpt-frontx-component-routing-screen-binding`
- **Dependencies**: `cpt-frontx-feature-routing-navigation-substrate` — this feature's owner-resolution primitive delegates entirely to the substrate's own longest-matching-prefix algorithm (`cpt-frontx-algo-routing-navigation-substrate-prefix-resolution`) and its observable signal subscribes to the substrate's shared history and fan-out; neither is re-implemented here.

**Boundary note**: This feature holds no registry of route owners, executes no mount or unmount, at any domain level, and carries no occupancy model of its own — the full boundary is owned by `cpt-frontx-routing-principle-publishes-not-orchestrates` (DESIGN §2.1), not repeated here. This feature's coupling to whichever mount mechanism the consumer runs is expressed only through the plain-argument owner-prefix pairs source and the observable signal's transitions, per level and per axis, never through an injected port and never through an import of the runtime that owns occupancy.

**Registry grounding**: The owner-prefix pairs source a domain's own consumer supplies (§1.5) has a natural origin this feature does not decree: the runtime's own registry of GTS-typed route-owner declarations. A route owner's own derived type carries presentation metadata that includes a route-segment field, a domain requires occupants of such a type through its own type-constraint field, and the runtime's own type system validates that declaration's shape at registration — none of which this feature redefines; it only names the registry declaration as the natural place a domain's own pairs come from. Uniqueness of the declared prefix among a domain's own siblings is not itself part of that type-level validation — a type schema validates one declaration in isolation, never a relationship between two — so it remains this feature's own registration-time cross-validation, the consuming domain's own responsibility (PRD §11), exactly as a same-domain conflict already was before this grounding note existed. Whichever glue layer assembles a domain's own pairs source derives it from the registry's own declarations into the flat identifier-to-prefix shape this feature's primitive reads; the registry's own type-level machinery never becomes a concern of this feature's own core, which stays exactly as standalone as it already was. That every child microfrontend runs its own registry, unreachable by enumeration from its own parent, is what makes a per-domain-level pairs source a structural necessity rather than a convenience — no single registry could enumerate every level's own occupants even if this feature wanted one to. The base a level hands to the domain nested inside it is likewise a value, not a registry entry; the natural channel for a consumer to deliver it downward is that domain's own shared-property mechanism, which remains entirely the consumer's own glue and no concern of this feature's. Refining what the registry's own route-segment field means in full is a follow-up owned by whichever member owns that registry contract, not by this artifact set — this note only records the registry's own declarations as the natural source of a domain's own pairs, without redefining that field itself.

**Binding obligation**: Two-way agreement between the URL and the mounted route owner is not a guarantee this package makes on its own, at any domain level — it is a joint guarantee of this package plus the consumer's own host glue holding that level, recorded here the same way `cpt-frontx-feature-routing-engine-provider` records the deployment obligations that fall on a consumer rather than on that feature, and the same way PRD §3.1 records them as deployment obligations rather than library capabilities. This obligation is recursive: whichever consumer holds a domain level's own observer carries it for that level, with no lesser or different obligation for a level several domains deep than for the outermost one. A consumer that wants the URL and the mounted owner to durably agree, at a domain level it holds:
1. Creates the observer described in §3 (Observable Owner-Change Signal) for that level and for each axis it projects, supplying that domain's own owner-prefix pairs source, and, for an axial axis, the base the enclosing level handed it.
2. On each notified transition, mounts or unmounts the named owner through its own mount mechanism — resolving any race between two mounts the same way it already resolves one for that mechanism; this feature resolves no mount race itself, and a mount driven by this signal is racing against, and resolved by, exactly the same mechanism a mount driven by any other trigger already is. Because a route owner declares exactly one prefix for as long as its registration exists (PRD §11), an `appeared` transition and a `remainder-changed` transition are the only two a persisting registration can ever produce for the same owner: the first always requires the mounting action described here, the second never does — the already-mounted instance's own routing table absorbs it.
3. Calls the URL back-projection helper appropriate to that level's own axis (§3, URL Back-Projection Helper Via Replace (Axial Mode), or Parallel-Axis Back-Projection Via Own-Key Replace) whenever a mount was initiated by something other than a navigation-driven transition this feature reported, so the URL does not durably disagree with what actually got mounted.
4. Treats mounting an owner as idempotent — mounting an owner that is already mounted is a no-op. Either back-projection helper's own `replace` call (point 3) dispatches the navigation substrate's fan-out exactly like any other navigation (`cpt-frontx-algo-routing-navigation-substrate-fanout-dispatch`), so the observer reports a transition resolving to the very owner the consumer just finished mounting — an echo of the consumer's own back-projection, not a new ownership fact. Without this obligation, that echo would double-mount or re-initialize the microfrontend the consumer just finished mounting.
5. Does not wait for a transition to conclude there is no owner. Creating the observer on a local remainder no declared prefix covers reports no initial transition at all (§3, Observable Owner-Change Signal — there is nothing yet to report a change from), so between observer creation and the first reported transition the consumer receives no signal about ownership either way. The consumer treats "no transition received yet" as "no owner" from the moment it creates the observer, and shows its own fallback accordingly, rather than waiting for an announcement that will not come. This is a deliberate asymmetry — an appearing owner is always reported, a durable absence of one is not — not a defect: reporting every creation's initial state, including "no owner," was considered and rejected as a redundant announcement for the common case (some owner already resolves at creation) that would buy nothing a consumer's own default assumption cannot already give it.
6. Follows a fixed asymmetry when it itself opens or closes an occupant of a parallel axis outside a navigation-driven transition: opens with a `push` — so a back step closes what was just opened, matching the ordinary expectation that back undoes the last thing the user's own action caused — and closes with a `replace` of that axis's own key — so a back step after closing does not resurrect an occupant the consumer just finished dismissing. This asymmetry is deliberate: a `push` on open buys an undo gesture the user already expects from opening something; a `replace` on close avoids manufacturing a history entry for a dismissal, and avoids letting back silently reopen state the consumer already tore down.
7. Applies the "same owner, same remainder → no transition" rule within its own axis only: for an axial level's own observer, a change to a foreign carrier — another domain's own parallel-axis key, or the hash — is not itself a transition; for a parallel level's own observer, a transition is reported only for a change to that axis's own key entries, never for a change to the pathname or to a sibling key.

Two further obligations apply once more than one axis, or more than one level, is in play:
- A parallel axis's own query-string key is unique realm-wide by convention, not by a mechanism this feature enforces; prefixing the key with the projecting zone's own identifier is the recommended convention, and honoring it is this obligation's own responsibility, not this feature's.
- A key with no observer currently reading it is inert — not an error, not a fallback state, and indistinguishable from a domain whose own wave has not yet reached it. Because a back-projection helper resets rather than carries a key forward by default (§3), an orphaned key is minimized rather than eliminated; a key that does survive resolves correctly the moment a domain that reads it comes to exist, because every observer always reads the URL's current, live state, never a value captured earlier — the URL remains the truth regardless of how late a level arrives to read it.
- Two axes wave independently: an axial level's own transition and a parallel level's own transition, even within the same zone, carry no ordering guarantee relative to each other; a consumer that needs one to wait for the other coordinates that itself.

Without this recipe running in the consumer's own host glue, at every domain level it holds, the primitive, the signal, and the helpers this feature publishes describe facts, not a maintained agreement — the two-way agreement is the combination's guarantee, not this package's alone.

**Multiplicity note**: More than one observer may exist in the same realm at once — one per domain level a consumer holds, and, within one level, one per axis that level projects. Nothing about this feature limits it to a single observer per realm: each observer is independent, is created with its own owner-prefix pairs source and its own axis carrier (a level's own base for an axial observer, a named query-string key for a parallel one), tracks its own previous owner and previous local remainder (§3, Observable Owner-Change Signal), and is released independently (§3, Observer Release). All of them read the one navigation substrate's shared history and fan-out (`cpt-frontx-routing-principle-single-history-authority`), so every observer resolves against the same `location` a given round dispatches, but resolves it against its own domain's own declared pairs and its own local remainder — which is exactly what makes resolving a deep URL a wave rather than one event (§1.1).

### 1.5 Contract Shapes

Field-level shapes for this feature's own inputs and outputs, per `cpt-frontx-adr-contract-schema-ownership` (owned contract role in DESIGN, decision rationale in the ADR, field-level schema in the owning FEATURE).

**Owner-prefix pairs source** (consumer-supplied per domain level, passed as a plain argument — never an injected port):
- A readable snapshot of the current set of declared identifier-to-prefix pairs for that one domain, in the same shape the navigation substrate's owner-resolution primitive reads (`cpt-frontx-algo-routing-navigation-substrate-prefix-resolution`); no identifier appears against more than one prefix (PRD §11).
- Optionally, a way to observe a change to that set, since a domain's own declared-owner set is not fixed for the realm's lifetime — a microfrontend can be registered or deregistered after the observer has already been created. A consumer whose set never changes after creation may supply a static snapshot with no change notification.
- Declares no cardinality floor: zero declared owners is legal and simply means every local remainder resolves to "no owner".

**Ownership-change transition** (this feature's own output, delivered to the callback the consumer registers when creating one domain level's own observer; never delivered at all when nothing ownership-relevant changed, see Kind below):
- Previous owner (or "no owner").
- New owner (or "no owner").
- New owner's own declared prefix (or none): carried as a convenience for the consumer's own mount mechanism — it is the base that owner's own zone hands to whatever domain nests inside it — even though it is always derivable from the new owner's own identifier alone, since a route owner declares exactly one prefix for as long as its registration exists (PRD §11). Absent when the new owner is "no owner".
- Kind: `appeared` (no owner → an owner), `disappeared` (an owner → no owner), `changed` (one owner → a different owner), or `remainder-changed` (the same owner persists, and its one declared prefix is therefore necessarily unchanged too, but the portion of the local remainder beneath that prefix changed). No transition is delivered at all — not a further Kind value, an absence of delivery — when the owner is "no owner" both before and after, or when the same owner persists with no change to the local remainder beneath its prefix; the latter is what a navigation that changes only the current URL's search or hash produces for an axial observer, or a change to a foreign key for a parallel one, since resolution matches on that observer's own local remainder alone (§3, Observable Owner-Change Signal).
- The current local remainder the transition was resolved for.

**Release function** (this feature's own output, returned to the consumer at observer creation, alongside registering its callback): a zero-argument function that, when called, unsubscribes the observer from everything it subscribed to — the navigation substrate's fan-out, and the owner-prefix pairs source's own change notification when the source exposed one (§3, Observer Release). Calling it more than once is a no-op after the first call.

**URL back-projection — axial mode input**: a specific declared prefix to reflect into the current history entry's pathname, beneath the axial domain's own base — the caller supplies the exact prefix, which is always the mounted owner's own single declared prefix (PRD §11). By default this mode does not carry the current search or hash forward: replacing the pathname resets both, exactly as the core navigation substrate's own `push`/`replace` carry nothing forward that the caller does not itself compose into the given location. A caller that wants the current search, or the current hash, carried forward reads either one and passes it explicitly alongside the prefix; carrying forward a foreign axis's own search key selectively is not offered, because doing so would require this helper to know that key's own identity and semantics, which it does not — state that must survive this reflection regardless of which axis changed is a shared property, not something either back-projection mode carries (§1.4, Binding obligation). The helper reports nothing back to the caller beyond letting the underlying `replace` call either succeed or throw whatever the shared history itself throws.

**URL back-projection — parallel-axis mode input**: a named query-string key and the specific local path to reflect into that key's own entries — the caller supplies the exact path, mounted for the axis's own occupant. This mode mutates only that key's own entries: it leaves the pathname, every other query-string key, and the hash exactly as they were, never resetting or carrying anything beyond the one key it was asked to change. The helper reports nothing back to the caller beyond letting the underlying `replace` call either succeed or throw whatever the shared history itself throws.

## 2. Actor Flows (CDSL)

### Deep Link Resolves Through The Route Ownership Signal, One Domain Level At A Time

- [ ] `p1` - **ID**: `cpt-frontx-flow-routing-route-ownership-signal-deep-link-cold-mount`

**Actor**: `cpt-frontx-routing-actor-application-developer`

**Use cases**: `cpt-frontx-routing-usecase-deep-link-to-microfrontend-screen`

**Success Scenarios**:
- A URL naming a route owner several domain levels deep is opened cold, reloaded, or reached by back/forward while none of the extensions along that path are yet mounted; each level's own observer, as it comes to exist, reports the owner appearing at its own level, the consumer's own mount mechanism mounts it, and once mounted its own engine provider reads the already-current location at start, so the mounted screen and the URL agree without a blank screen in between, at every level.
- A URL under a domain level's own already-mounted owner is opened; that level's own observer reports a `remainder-changed` transition (or none, if nothing about the local remainder changed either) and the consumer's own mount mechanism takes no mounting action at that level.

**Error Scenarios**:
- A domain level's own local remainder matches no declared prefix: that level's own observer reports "no owner" (a `disappeared` transition if one was previously bound, or no transition at all on a first resolution to "no owner") and the consumer holding that level shows its own fallback; this feature takes no fallback action itself, and a level several steps deeper that has not yet begun to exist is indistinguishable, at any shallower level, from this same "no owner" case.

**Steps**:
1. [ ] - `p1` - The consumer creates the observer for a domain level, passing that domain's own owner-prefix pairs source and, for an axial level, the base its enclosing level handed it - `inst-create-observer`
2. [ ] - `p1` - **WHEN** the navigation substrate's fan-out notifies the observer of a cold load, reload, back/forward step, or any other navigation (`cpt-frontx-algo-routing-navigation-substrate-fanout-dispatch`) - `inst-notify-navigation`
   1. [ ] - `p1` - The observer resolves that level's own local remainder's owner through the owner resolution primitive (`cpt-frontx-algo-routing-route-ownership-signal-owner-resolution`) - `inst-resolve-owner`
   2. [ ] - `p1` - The observer reports the transition from the previously resolved owner to the newly resolved one to the consumer's registered callback (`cpt-frontx-algo-routing-route-ownership-signal-observe-change`) - `inst-report-transition`
3. [ ] - `p1` - **IF** the transition reports an owner appearing, or changing to a not-yet-mounted owner - `inst-if-appeared`
   1. [ ] - `p1` - The consumer mounts that owner through its own mount mechanism (§1.4, Binding obligation) - `inst-consumer-mounts`
   2. [ ] - `p1` - Once mounted, the microfrontend's own engine provider reads the current location from the shared history at start and matches the remainder of the path under its base (specified in `cpt-frontx-feature-routing-engine-provider`) - `inst-mfe-reads-location-at-start`
   3. [ ] - `p1` - **IF** the newly mounted owner's own zone contains a further domain - `inst-if-nested-domain`
      1. [ ] - `p1` - That domain's own consumer creates its own observer one level deeper, supplying the base just resolved and that domain's own pairs, repeating from step 1 at that level - `inst-recurse-nested-level`
4. [ ] - `p1` - **ELSE IF** the transition reports the same owner already mounted, with only the local remainder changed - `inst-elseif-remainder-changed`
   1. [ ] - `p1` - The consumer takes no mounting action; the already-mounted microfrontend's own router handles the remainder change through its own routing table - `inst-no-mount-action-remainder`
5. [ ] - `p1` - **ELSE** the transition reports no owner, or an owner disappearing - `inst-else-no-owner`
   1. [ ] - `p1` - The consumer's own fallback is shown; this feature takes no fallback action itself - `inst-consumer-fallback`

**Postconditions**:
- Each domain level's own mounted screen and the URL segment it resolved agree without a blank screen, because the freshly mounted router reads the already-current location rather than starting from a blank route, and because that level's own consumer acted on the transition this feature reported — independently at every level, with no event asserting that every level resolved together.

## 3. Processes / Business Logic (CDSL)

### Owner Resolution Primitive

- [ ] `p2` - **ID**: `cpt-frontx-algo-routing-route-ownership-signal-owner-resolution`

**Input**: A domain level's own local remainder of the URL; a set of declared identifier-to-prefix pairs for that domain, supplied by the caller as a plain argument.

**Output**: The identifier of the route owner whose declared prefix is the longest match for that remainder, together with its specific matched declared prefix, or a "no owner" result — exactly the navigation substrate's own result, unmodified.

**Steps**:
1. [ ] - `p1` - Delegate directly to the navigation substrate's own longest-matching-prefix primitive (`cpt-frontx-algo-routing-navigation-substrate-prefix-resolution`), passing the local remainder and the declared pairs unchanged - `inst-delegate-to-substrate`
2. [ ] - `p1` - **RETURN** that primitive's result unchanged — the owner identifier and its matched prefix together, or "no owner" - `inst-return-substrate-result`

**Rationale**: This algorithm exposes the substrate's own segment-matching rule as this feature's public entry point, called once per domain level and once per axis a level projects; it defines no matching rule of its own, so a change to segment-matching behavior — root-prefix handling, trailing-separator normalization, or the longest-match tie-break — is a change to the substrate's algorithm alone (`cpt-frontx-feature-routing-navigation-substrate` §3), never to this one.

### Observable Owner-Change Signal

- [ ] `p2` - **ID**: `cpt-frontx-algo-routing-route-ownership-signal-observe-change`

**Input**: A domain level's own owner-prefix pairs source, passed as a plain argument at creation (never an injected port); for an axial level, the base its enclosing level handed it at that same moment; for a parallel level, the named query-string key whose entries carry that axis's own occupants' local paths; a callback the consumer registers to receive a transition; the navigation substrate's shared history and its fan-out subscription; the observer's own internally tracked previous owner and previous local remainder, updated after every resolution this algorithm performs.

**Output**: An observer subscribed to the navigation substrate's fan-out, plus a release function returned to the consumer at creation (`cpt-frontx-algo-routing-route-ownership-signal-release`); on creation, and on every subsequent navigation that is ownership-relevant to this level's own axis, one call to the consumer's callback carrying an ownership-change transition (§1.5, Ownership-Change Transition); no call at all when neither the owner nor the local remainder beneath it changed.

**Steps**:
1. [ ] - `p1` - **WHEN** the consumer creates the observer, passing that domain's own owner-prefix pairs source, its own axis carrier (the base, for an axial level; the named query-string key, for a parallel one), and registering its callback - `inst-when-create`
   1. [ ] - `p1` - Read the current local remainder for this level's own axis: for an axial level, the portion of the current pathname beneath the given base; for a parallel level, the given key's own current entries - `inst-read-initial-remainder`
   2. [ ] - `p1` - Resolve that local remainder's owner and matched prefix through the owner resolution primitive (`cpt-frontx-algo-routing-route-ownership-signal-owner-resolution`) - `inst-initial-resolve`
   3. [ ] - `p1` - **IF** an owner resolves - `inst-if-initial-owner`
      1. [ ] - `p1` - Report an initial transition of kind `appeared`, with no previous owner recorded - `inst-initial-report-appeared`
   4. [ ] - `p1` - **ELSE** no owner resolves at creation - `inst-else-initial-no-owner`
      1. [ ] - `p1` - Report no initial transition — there is nothing yet to report a change from (§1.4, Binding obligation point 5: the consumer must not wait for one) - `inst-initial-no-report`
   5. [ ] - `p1` - Record the just-resolved owner and the current local remainder as the observer's previous state, regardless of whether step 1.3 or 1.4 ran - `inst-record-initial-state`
   6. [ ] - `p1` - Subscribe to the navigation substrate's fan-out (`cpt-frontx-algo-routing-navigation-substrate-fanout-dispatch`) - `inst-subscribe-fanout`
   7. [ ] - `p1` - **IF** the owner-prefix pairs source exposes a change notification (§1.5) - `inst-if-source-has-notification`
      1. [ ] - `p1` - Subscribe to it as well - `inst-subscribe-pairs-source`
   8. [ ] - `p1` - **RETURN** the release function (`cpt-frontx-algo-routing-route-ownership-signal-release`) to the consumer, closed over the subscription(s) registered in steps 1.6 and 1.7 - `inst-return-release`
2. [ ] - `p1` - **WHEN** the navigation substrate's fan-out notifies the observer of a navigation - `inst-when-navigation`
   1. [ ] - `p1` - Read the current local remainder for this level's own axis, exactly as step 1.1 did - `inst-read-current-remainder`
   2. [ ] - `p1` - Resolve the current local remainder's owner and matched prefix through the owner resolution primitive, reading the consumer's own owner-prefix pairs source at this same moment - `inst-resolve-current`
   3. [ ] - `p1` - **IF** the previous owner was "no owner" and the new one is a declared owner - `inst-if-appeared`
      1. [ ] - `p1` - Report a transition of kind `appeared` - `inst-report-appeared`
   4. [ ] - `p1` - **ELSE IF** the previous owner was a declared owner and the new one is "no owner" - `inst-elseif-disappeared`
      1. [ ] - `p1` - Report a transition of kind `disappeared` - `inst-report-disappeared`
   5. [ ] - `p1` - **ELSE IF** the previous and new owner are both declared and differ - `inst-elseif-changed`
      1. [ ] - `p1` - Report a transition of kind `changed` - `inst-report-changed`
   6. [ ] - `p1` - **ELSE IF** the previous and new owner are the same declared owner, and the current local remainder differs from the previously recorded one - `inst-elseif-remainder-changed`
      1. [ ] - `p1` - Report a transition of kind `remainder-changed` — the same owner persists (and, since an owner declares exactly one prefix for as long as its registration exists, its matched prefix is necessarily unchanged too), but the portion of the local remainder beneath that prefix moved - `inst-report-remainder-changed`
   7. [ ] - `p1` - **ELSE IF** the previous and new owner are the same declared owner, and the current local remainder equals the previously recorded one - `inst-elseif-same-owner-same-remainder`
      1. [ ] - `p1` - Report no transition — nothing about this axis's own local remainder changed; for an axial level, this is, in particular, what a navigation that changes only the current URL's search or hash produces, since resolution matches on the pathname remainder alone; for a parallel level, it is what a change to any key other than this axis's own produces - `inst-no-report-unchanged`
   8. [ ] - `p1` - **ELSE** the previous and new owner are both "no owner" - `inst-else-no-owner-to-no-owner`
      1. [ ] - `p1` - Report no transition: nothing about ownership changed, and this algorithm reports only ownership-relevant transitions, not every navigation indiscriminately - `inst-no-report-no-owner-to-no-owner`
   9. [ ] - `p1` - Record the just-resolved owner and current local remainder as the observer's new previous state, regardless of which branch above ran - `inst-record-navigation-state`
3. [ ] - `p1` - **WHEN** the owner-prefix pairs source's own change notification fires, for a source that exposes one (§1.5) - `inst-when-pairs-source-changes`
   1. [ ] - `p1` - Re-run steps 2.1 through 2.9 against the current local remainder and the source's now-current pairs, exactly as if a navigation had occurred — a registration or deregistration can change which owner a fixed remainder resolves to without the URL itself moving - `inst-reresolve-on-pairs-change`

**Rationale**: Because a route owner declares exactly one prefix for as long as its registration exists (PRD §11), the previously recorded owner alone is enough to tell an owner change from a remainder change — no separate previously-recorded-prefix state is needed. Reporting a `remainder-changed` transition rather than staying silent when the owner does not change is what lets a consumer whose own mount mechanism cares about in-territory navigation — for example, to keep an outer layout in sync — react without this feature inventing knowledge of what that reaction should be; the consumer's own mechanism decides what, if anything, to do with it. Tracking the previously recorded local remainder, not only the previously recorded owner, is what makes that reporting precise: without it, a navigation that leaves this axis's own remainder exactly as it was — most notably one that changes only a foreign carrier — would be indistinguishable from one that actually moved within the owner's own territory. Filtering out a "no owner" to "no owner" transition, and a same-owner/same-remainder transition, are the two cases this algorithm treats as not ownership-relevant: nothing about occupancy could have changed when no declared prefix matched before or after, or when the local remainder beneath a persisting owner's one prefix is unchanged. Reporting an initial transition at creation, rather than only from the first subsequent navigation, is what covers a cold load or a reload — the very case a consumer most needs this signal for — from the first moment the observer exists. Generalizing the observer's own input to an axis carrier — a base for an axial level, a named key for a parallel one — rather than hardwiring it to the pathname is what lets the same algorithm serve both kinds of projection without this feature defining two.

### Observer Release

- [ ] `p2` - **ID**: `cpt-frontx-algo-routing-route-ownership-signal-release`

**Input**: An observer created by `cpt-frontx-algo-routing-route-ownership-signal-observe-change`, at whichever domain level and axis it was created for, and the internal subscription(s) it registered at creation: the navigation substrate's fan-out, and the owner-prefix pairs source's own change notification, when the source exposed one.

**Output**: Every subscription this observer itself registered, unsubscribed; the observer reports no further transitions after this point.

**Steps**:
1. [ ] - `p1` - **WHEN** the consumer calls the release function returned at observer creation - `inst-when-release-called`
   1. [ ] - `p1` - Unsubscribe from the navigation substrate's fan-out subscription registered at observer creation - `inst-unsubscribe-fanout`
   2. [ ] - `p1` - **IF** the observer also subscribed to the owner-prefix pairs source's own change notification at creation - `inst-if-subscribed-pairs-source`
      1. [ ] - `p1` - Unsubscribe from that subscription as well - `inst-unsubscribe-pairs-source`
   3. [ ] - `p1` - **IF** the release function is called again after the first call - `inst-if-called-again`
      1. [ ] - `p1` - Treat the call as a no-op — nothing is subscribed to unsubscribe from a second time - `inst-release-idempotent`
2. [ ] - `p1` - **RETURN** - `inst-return-release-done`

**Rationale**: This feature holds no lifecycle notion of its own beyond the subscriptions its own observer registers (§4, No Feature-Owned State Machine), so leaking one is entirely this algorithm's responsibility to prevent, the same way the Engine Provider's own teardown algorithm prevents a leaked subscription on its own adapted history (`cpt-frontx-algo-routing-engine-provider-teardown`). Releasing both subscriptions this observer itself registered — not only the fan-out one — is what DESIGN §4 already names this feature as the owner of preventing: an observer whose pairs-source subscription outlives it leaks exactly as durably as one whose fan-out subscription does, at whichever domain level and axis it was created for.

### URL Back-Projection Helper Via Replace (Axial Mode)

- [ ] `p2` - **ID**: `cpt-frontx-algo-routing-route-ownership-signal-url-back-projection`

**Input**: A specific declared prefix the consumer wants reflected into the URL's pathname, beneath an axial domain's own base, mounted for a reason other than a navigation-driven transition this feature's observer reported; optionally, the current location's search and/or hash, when the caller chooses to carry either forward.

**Output**: A `replace` call against the shared history reflecting that declared prefix into the URL's pathname beneath the axial domain's own base; the search and the hash are reset to empty unless the caller supplied either to carry forward, in which case exactly what the caller supplied is carried, nothing more.

**Steps**:
1. [ ] - `p1` - The consumer calls this helper with a specific declared prefix — the mounted owner's own single declared prefix (PRD §11) — when its own mount mechanism performed a mount that was not initiated by a navigation-driven transition from the observer (§3, Observable Owner-Change Signal) - `inst-consumer-calls-helper`
2. [ ] - `p1` - **IF** the caller supplied a search and/or a hash to carry forward - `inst-if-caller-supplied-carryover`
   1. [ ] - `p1` - Read exactly the value the caller supplied for each - `inst-read-caller-supplied-carryover`
3. [ ] - `p1` - **ELSE** the caller supplied neither - `inst-else-no-carryover`
   1. [ ] - `p1` - Treat the search and the hash as reset — the default, since nothing is carried forward that the caller does not itself supply - `inst-default-reset`
4. [ ] - `p1` - Call the shared history's `replace` — never `push` — with the given prefix as the pathname, together with whatever search and hash resulted from step 2 or step 3 - `inst-call-replace`
5. [ ] - `p1` - **RETURN** - `inst-return-reflected`

**Timing note**: If the consumer calls this helper before the navigation substrate's fan-out has delivered the notification for a history move already in flight (a `go` call, a back/forward step, or a third-party history move — all observed only asynchronously, per `cpt-frontx-algo-routing-navigation-substrate-fanout-dispatch`), the `replace` in step 4 still overwrites whichever entry the browser's own history has already moved to at the moment this call executes, never the entry that was current before that move started: the browser completes the move to its own current entry synchronously, and it is only this library's own notification of that move that lags asynchronously behind it. A consumer that invokes this helper eagerly, before observing the transition the move itself produces, therefore still replaces the post-move entry.

**Rationale**: `replace` rather than `push` is what keeps a mount the user did not navigate to from creating an extra back/forward entry: unlike `push`, a `replace` does not truncate the forward portion of the history stack after a back step the user has already taken, so the reflection does not discard forward history the way an added entry would — the URL stays authoritative without the reflection itself becoming a navigation the user has to step back through. This has a real, accepted cost: `replace` overwrites the history entry the user was previously on, so that entry becomes unreachable by a subsequent back step, and any sub-path deeper than the reflected prefix that entry carried is discarded along with it. That cost is the price of treating the URL as authoritative, not an oversight of this algorithm — the alternative, `push`, would avoid the cost but let a mount the user never navigated to create a back/forward entry they now have to step through, which is the worse trade this algorithm exists to avoid. Resetting the search and the hash by default, rather than carrying them forward unconditionally, follows directly from the core navigation substrate's own signature: `push` and `replace` accept whatever location string the caller composes, and carry forward nothing the caller did not itself put there (DESIGN §1.1) — a default carry-forward was only ever a convenience layered on top, and it stops being a safe default once a parallel axis's own search key becomes a first-class occupant of the search string, since an unconditional carry-forward would silently revive whatever that key held. A caller for which total carryover is actually wanted reads the current search (and the hash, if wanted) and supplies it explicitly (§1.5) — nothing about this default forecloses that; carrying forward one foreign axis's own key selectively, rather than the whole search, is not offered by this helper at all, because doing so would require knowing that key's own identity and semantics, which this algorithm does not have and should not need — a consumer with state that must survive this reflection regardless of which axis changed holds it as a shared property instead (§1.4, Binding obligation).

### Parallel-Axis Back-Projection Via Own-Key Replace

- [ ] `p2` - **ID**: `cpt-frontx-algo-routing-route-ownership-signal-parallel-axis-back-projection`

**Input**: A named query-string key and the specific local path the consumer wants reflected into that key's own entries, mounted for a reason other than a navigation-driven transition this feature's observer reported; the current location's pathname, every other query-string key, and the hash, all read unchanged.

**Output**: A `replace` call against the shared history that mutates only the given key's own entries to the given local path, leaving the pathname, every other query-string key, and the hash exactly as they were.

**Steps**:
1. [ ] - `p1` - The consumer calls this helper with the axis's own named key and the specific local path to reflect, when its own mount mechanism performed a mount that was not initiated by a navigation-driven transition from the observer (§3, Observable Owner-Change Signal) - `inst-consumer-calls-helper`
2. [ ] - `p1` - Read the current location's pathname, every query-string key other than the given one, and the hash - `inst-read-current-location-minus-own-key`
3. [ ] - `p1` - Compose a location carrying the pathname, every other key, and the hash read in step 2 unchanged, with the given key's own entries set to the given local path - `inst-compose-location-own-key-only`
4. [ ] - `p1` - Call the shared history's `replace` — never `push`, for the same reason the axial mode never does (`cpt-frontx-algo-routing-route-ownership-signal-url-back-projection`) — with the location composed in step 3 - `inst-call-replace`
5. [ ] - `p1` - **RETURN** - `inst-return-reflected`

**Rationale**: This mode mutates only the one key it was asked to change, never resetting or carrying forward anything else, because a parallel axis's own occupant is never the only thing the URL is currently representing — an axial domain's own pathname, and every sibling parallel axis's own key, are independent facts this helper has no business disturbing when it was asked to reflect only one of them. This is a narrower guarantee than the axial mode's own reset-by-default rule (`cpt-frontx-algo-routing-route-ownership-signal-url-back-projection`): the axial mode resets what it does not carry because replacing a pathname is inherently replacing the whole location's dominant fact, while this mode never had a "whole location" to reset in the first place — only its own one key. The replace-not-push reasoning both modes share is owned in full by the axial mode's own algorithm, not repeated here.

## 4. States (CDSL)

### No Feature-Owned State Machine

Not applicable. This feature holds no occupancy or binding lifecycle of its own to model as named states with guarded transitions — an observer's own lifecycle is only "subscribed" or "released" (§3, Observer Release), a lifetime, not an occupancy state machine, at any domain level. Occupancy, cardinality, and any state machine tracking which owner currently occupies a placement belong entirely to whichever mount mechanism the consumer already runs — for this ecosystem's own host, the `mfes` runtime's own mount strategies and registry (`cpt-frontx-adr-extension-domain-occupancy`). Modeling that lifecycle here would duplicate a domain this package does not own and must stay agnostic of (`cpt-frontx-routing-principle-publishes-not-orchestrates`), so no state machine is defined for this feature.

## 5. Definitions of Done

### Owner Resolution And Observable Signal

- [ ] `p1` - **ID**: `cpt-frontx-dod-routing-route-ownership-signal-resolution-and-observation`

The system **MUST** expose the navigation substrate's longest-matching-prefix resolution as this feature's own public primitive, taking a domain level's own local remainder and that domain's own set of declared identifier-to-prefix pairs and returning the matched owner together with its matched declared prefix, or "no owner", without re-implementing the matching rule, and **MUST** let a consumer create an observer per domain level and per axis that level projects — passing that domain's own owner-prefix pairs source as a plain argument, never an injected port, and, for an axial level, the base it was handed — that reports, on creation and on every subsequent ownership-relevant navigation at that level, a transition distinguishing an owner appearing, an owner disappearing, an owner changing, and the same owner's own local remainder changing, to a callback the consumer registers, while reporting no transition at all when the resolved owner is "no owner" both before and after, or when the same owner persists with the local remainder beneath it unchanged — including, for an axial level, a navigation that changes only the current URL's search or hash, and, for a parallel level, a change to any key other than its own.

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

The system **MUST** return a release function to the consumer when an observer is created, at whichever domain level and axis it was created for, and **MUST**, when that function is called, unsubscribe the observer from the navigation substrate's fan-out and from the owner-prefix pairs source's own change notification when the source exposed one, with a call after the first treated as a no-op.

**Implements**:
- `cpt-frontx-algo-routing-route-ownership-signal-release`

**Addresses**:
- `cpt-frontx-routing-fr-route-ownership-signal`

**Touches**:
- Component: `cpt-frontx-component-routing-screen-binding`

### URL Back-Projection Helper (Axial Mode)

- [ ] `p1` - **ID**: `cpt-frontx-dod-routing-route-ownership-signal-url-back-projection`

The system **MUST** provide a helper that replaces — never pushes — the current history entry's pathname with a given, specific declared prefix beneath an axial domain's own base, **MUST** reset the current search and hash by default rather than carrying either forward, and **MUST** carry forward exactly whatever search and/or hash the caller explicitly supplies instead, callable by a consumer whenever its own mount mechanism mounted an owner for a reason other than a navigation-driven transition this feature's observer reported, accepting as the deliberate cost of that guarantee that the replaced entry becomes unreachable by a subsequent back step.

**Implements**:
- `cpt-frontx-algo-routing-route-ownership-signal-url-back-projection`

**Addresses**:
- `cpt-frontx-routing-fr-route-ownership-signal`

**Touches**:
- Component: `cpt-frontx-component-routing-screen-binding`

### URL Back-Projection Helper (Parallel-Axis Mode)

- [ ] `p1` - **ID**: `cpt-frontx-dod-routing-route-ownership-signal-parallel-axis-back-projection`

The system **MUST** provide a helper that replaces — never pushes — only a named query-string key's own entries with a given local path, leaving the pathname, every other query-string key, and the hash untouched, callable by a consumer whenever its own mount mechanism mounted a parallel axis's own occupant for a reason other than a navigation-driven transition this feature's observer reported.

**Implements**:
- `cpt-frontx-algo-routing-route-ownership-signal-parallel-axis-back-projection`

**Addresses**:
- `cpt-frontx-routing-fr-route-ownership-signal`

**Touches**:
- Component: `cpt-frontx-component-routing-screen-binding`

## 6. Acceptance Criteria

- [ ] Given a domain level's own local remainder and that domain's own set of declared identifier-to-prefix pairs, the owner-resolution primitive returns the identifier and its specific matched declared prefix, or "no owner", by delegating unchanged to the navigation substrate's own primitive.
- [ ] A consumer creates the observer, per domain level and per axis that level projects, by passing that domain's own owner-prefix pairs source as a plain argument, never through an injected port, and, for an axial level, the base it was handed.
- [ ] On creation, the observer resolves and reports the current owner for its own local remainder before any subsequent navigation occurs, so a cold load or reload is covered from the observer's first moment, not only from the first navigation after it; on a local remainder no declared prefix covers, creation reports no initial transition at all.
- [ ] On every subsequent ownership-relevant navigation, the observer reports exactly one transition: `appeared` when the owner goes from none to a declared owner, `disappeared` when it goes from a declared owner to none, `changed` when it moves from one declared owner to a different one, and `remainder-changed` when the same declared owner remains but the local remainder beneath it moved.
- [ ] No transition is reported when the resolved owner is "no owner" both before and after a navigation, nor when the same owner persists with the local remainder beneath it unchanged; for an axial level, a navigation that changes only the current URL's search or hash falls into this latter case, and for a parallel level, a change to any key other than its own does, because resolution matches on that observer's own local remainder alone.
- [ ] A change to the owner-prefix pairs source's own declared set re-triggers resolution against the current local remainder, exactly as a navigation would, when the source exposes a change notification.
- [ ] Creating an observer returns a release function; calling it unsubscribes the observer from the navigation substrate's fan-out and, when the owner-prefix pairs source exposed one, from that source's own change notification, and the observer reports no further transitions afterward. Calling it again is a no-op.
- [ ] More than one observer may exist in the same realm at once — one per domain level a consumer holds, and, within one level, one per axis that level projects — each independent, each with its own owner-prefix pairs source and its own axis carrier, each released independently.
- [ ] Resolving a URL several domain levels deep is a wave of independent per-level resolutions, not one event: a deeper level's own observer exists and reports only once its enclosing level's own consumer has mounted the owner whose zone contains it, this feature publishes no signal asserting that a path resolved end to end, and a level several steps deeper reporting nothing yet is indistinguishable, at any shallower level, from that deeper level's own wave simply not having arrived.
- [ ] The axial-mode URL back-projection helper replaces — never pushes — the current history entry's pathname with a given, specific declared prefix, resets the current search and hash by default, and carries forward exactly whatever search and/or hash the caller explicitly supplies instead; the replaced entry becomes unreachable by a subsequent back step as the accepted cost of that guarantee, and a `replace`, unlike a `push`, does not truncate the forward portion of the history stack after a back step already taken. Invoking the helper before the fan-out has delivered the notification for an in-flight history move still replaces the entry the browser has already moved to, not the entry current before that move.
- [ ] The parallel-axis-mode URL back-projection helper replaces — never pushes — only a named query-string key's own entries with a given local path, leaving the pathname, every other query-string key, and the hash exactly as they were.
- [ ] A consumer that opens a parallel axis's own occupant outside a navigation-driven transition uses `push`, so a back step closes what was opened; a consumer that closes one uses a `replace` of that axis's own key, so a back step afterward does not reopen it.
- [ ] A consumer's own mount mechanism treats mounting an already-mounted owner as a no-op, so the transition either back-projection helper's own `replace` produces — an echo of the consumer's own reflection — does not double-mount or re-initialize it.
- [ ] This feature holds no registry of route owners, executes no mount or unmount itself, at any domain level, and defines no occupancy state machine; a consumer that wants the URL and a mounted owner to durably agree implements that agreement itself, per the Binding obligation (§1.4), recursively at every domain level it holds, on top of the primitive, the signal, and the helpers this feature publishes.
- [ ] A domain's occupancy cardinality — how many owners a placement may hold simultaneously, and how a race between two mounts targeting the same placement resolves — is decided entirely by the consumer's own mount mechanism; this feature carries no notion of exclusive versus concurrent occupancy, and resolves no mount race of its own, at any domain level.
- [ ] A parallel axis's own query-string key with no observer currently reading it is inert, not an error and not a fallback state; it is resolved correctly the moment a domain that reads it comes to exist, because every observer reads the URL's current, live state rather than a value captured earlier.
