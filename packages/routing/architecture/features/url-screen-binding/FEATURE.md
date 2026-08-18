# Feature: URL–Screen-Domain Binding


<!-- toc -->

- [1. Feature Context](#1-feature-context)
  - [1.1 Overview](#11-overview)
  - [1.2 Purpose](#12-purpose)
  - [1.3 Actors](#13-actors)
  - [1.4 References](#14-references)
  - [1.5 Port Shapes](#15-port-shapes)
- [2. Actor Flows (CDSL)](#2-actor-flows-cdsl)
  - [Deep Link Resolves To A Not-Yet-Mounted Microfrontend's Screen](#deep-link-resolves-to-a-not-yet-mounted-microfrontends-screen)
- [3. Processes / Business Logic (CDSL)](#3-processes--business-logic-cdsl)
  - [Primary Direction: URL-To-Mount Reconciliation](#primary-direction-url-to-mount-reconciliation)
  - [No Declared Owner Matches: Host Fallback](#no-declared-owner-matches-host-fallback)
  - [Secondary Direction: Mount-To-URL Reflection Via Replace](#secondary-direction-mount-to-url-reflection-via-replace)
  - [Unmount When The URL Resolves To A Different Owner](#unmount-when-the-url-resolves-to-a-different-owner)
- [4. States (CDSL)](#4-states-cdsl)
  - [Screen-Domain Slot Binding State Machine](#screen-domain-slot-binding-state-machine)
- [5. Definitions of Done](#5-definitions-of-done)
  - [Primary URL-To-Mount Reconciliation And Host Fallback](#primary-url-to-mount-reconciliation-and-host-fallback)
  - [Secondary Mount-To-URL Reflection And Prefix-Exit Unmount](#secondary-mount-to-url-reflection-and-prefix-exit-unmount)
- [6. Acceptance Criteria](#6-acceptance-criteria)

<!-- /toc -->

- [ ] `p1` - **ID**: `cpt-frontx-featstatus-routing-url-screen-binding`
## 1. Feature Context

- [ ] `p2` - `cpt-frontx-feature-routing-url-screen-binding`

### 1.1 Overview

Screen Binding keeps the URL and the currently mounted route owner in agreement in both directions, treating the URL as the single source of truth. On the primary path — a cold load, a reload, a back/forward step, or any other navigation — it invokes the navigation substrate's longest-matching-prefix primitive to resolve the pathname to its declared route owner and mounts that owner if it is not already mounted or already being mounted. On the secondary path — a mount that happened for a reason other than navigation — it reflects the mounted owner's declared prefix back into the URL by `replace`. It also unmounts every currently mounted owner that is not the one the current resolution named — which, under legal prefix nesting, can be more than the one owner whose own declared prefix stopped containing the pathname — and defers to the host's own fallback when no declared prefix matches at all.

### 1.2 Purpose

A composed application's routable placements must resolve the same way regardless of how the user arrived at a URL: typing it, reloading it, stepping back or forward through history, or following a link. Without a resolver that treats the URL as authoritative and reconciles the mounted screen against it on every one of those paths, a deep link or a reload could show a blank screen, or the address bar could disagree with what the user is actually looking at. Screen Binding exists to make deep links, reloads, and back/forward all resolve through the one code path that a click-driven navigation already uses, and to keep a mount that happens outside the URL channel from leaving the address bar behind.

**Requirements**: `cpt-frontx-routing-fr-url-screen-binding`

### 1.3 Actors

| Actor | Role in Feature |
|-------|-----------------|
| `cpt-frontx-routing-actor-application-developer` | Mounts the navigation substrate with a route-owner provider and a mounting executor injected, so that a deep link into a not-yet-mounted microfrontend's screen resolves without a blank screen. |
| `cpt-frontx-routing-actor-microfrontend-developer` | Relies on Screen Binding to unmount their microfrontend when the URL moves outside its declared prefix, and to have the URL already current when their router's engine provider reads it at mount. |

### 1.4 References

- **PRD**: [PRD.md](../../PRD.md)
- **Design**: [DESIGN.md](../../DESIGN.md)
- **Use case**: `cpt-frontx-routing-usecase-deep-link-to-microfrontend-screen`
- **Component**: `cpt-frontx-component-routing-screen-binding`
- **Dependencies**: `cpt-frontx-feature-routing-navigation-substrate` — the URL projection this feature computes binds against the single navigation history that feature owns, and this feature's owner-naming step is the substrate's own longest-matching-prefix primitive (`cpt-frontx-algo-routing-navigation-substrate-prefix-resolution`), not a re-implementation of it.

**Boundary note**: This feature does not duplicate or mediate the addressed-action-dispatch or shared-property-broadcast channels between microfrontends and the host, and it does not implement or hold the registry of route owners or the mechanics of executing a mount — those belong to the runtime that provides them. Screen Binding's coupling to that runtime is expressed entirely through two host-injected ports — a route-owner provider and a mounting executor — never through an import of the runtime itself.

### 1.5 Port Shapes

Field-level shapes for the two ports this feature owns, per `cpt-frontx-adr-contract-schema-ownership` (owned contract role in DESIGN, decision rationale in the ADR, field-level schema in the owning FEATURE).

**Route-owner provider** (host-injected):
- Exposes the current set of declared identifier-to-prefix pairs as a readable snapshot — what the longest-matching-prefix primitive (`cpt-frontx-algo-routing-navigation-substrate-prefix-resolution`) reads on every resolution.
- Exposes a way to observe a change to that set, since the declared-owner set is not fixed for the realm's lifetime — a microfrontend can be registered or deregistered after resolution has already started. Screen Binding re-resolves the current pathname against the provider's current set whenever this notification fires, through the same reconciliation the navigation fan-out drives (`cpt-frontx-algo-routing-url-screen-binding-url-to-mount`).
- Declares no cardinality floor: zero declared owners is legal and simply means every pathname resolves to "no owner".

**Mounting executor** (host-injected):
- `mount(ownerId)` — requests that the named owner be mounted. Reports an observable success-or-failure result rather than running fire-and-forget; the primary reconciliation's in-flight mount guard and the slot's own RESOLVING→BOUND / RESOLVING→UNBOUND transitions (`cpt-frontx-state-routing-url-screen-binding-slot-binding`) both depend on that result being observable.
- `unmount(ownerId)` — requests that the named owner be unmounted. Idempotent: calling `unmount` for an owner that is not currently mounted (already unmounted, or never mounted) is a no-op reporting success, not an error, since the unmount rule (`cpt-frontx-algo-routing-url-screen-binding-unmount-on-prefix-exit`) calls it for every non-resolved mounted owner without first re-proving each one is still mounted at call time.
- This feature never calls `mount` for an owner already mounted or already in its own in-flight set (§3 guards both cases before calling), so the executor's own idempotence for a repeated `mount` call is not a requirement this feature depends on.

**Resolver diagnostic** (this feature's own surface, not host-injected): Screen Binding exposes an observable inert-or-active status. Inert means no route-owner provider and no mounting executor were injected — the deliberate standalone-deployment case (`cpt-frontx-routing-fr-standalone-deployment`). Active means both ports are injected and resolution is running. Without this diagnostic, a host that meant to inject both ports but forgot is silently indistinguishable from a deliberate standalone deployment — both present as the same inertness; the diagnostic is what lets a host or an operator tell a configuration mistake apart from working as designed.

## 2. Actor Flows (CDSL)

### Deep Link Resolves To A Not-Yet-Mounted Microfrontend's Screen

- [ ] `p1` - **ID**: `cpt-frontx-flow-routing-url-screen-binding-deep-link-cold-mount`

**Actor**: `cpt-frontx-routing-actor-application-developer`

**Use cases**: `cpt-frontx-routing-usecase-deep-link-to-microfrontend-screen`

**Success Scenarios**:
- A URL under a declared prefix is opened cold, reloaded, or reached by back/forward while the microfrontend that owns that prefix is not yet mounted; the mounting executor mounts it, and once mounted its own engine provider reads the already-current location at start, so the mounted screen and the URL agree without a blank screen in between.
- A URL under a declared prefix that is already mounted is opened; no mount action is taken.

**Error Scenarios**:
- The pathname matches no declared prefix: the host's own fallback is shown and nothing is mounted (`cpt-frontx-algo-routing-url-screen-binding-no-owner-fallback`).

**Steps**:
1. [ ] - `p1` - The navigation substrate's fan-out notifies Screen Binding of a cold load, reload, back/forward step, or any other navigation (`cpt-frontx-algo-routing-navigation-substrate-fanout-dispatch`) - `inst-notify-navigation`
2. [ ] - `p1` - Screen Binding runs the primary URL-to-mount reconciliation against the current pathname (`cpt-frontx-algo-routing-url-screen-binding-url-to-mount`) - `inst-run-url-to-mount`
3. [ ] - `p1` - **IF** the resolved owner is not yet mounted - `inst-if-not-mounted`
   1. [ ] - `p1` - Screen Binding calls the host-injected mounting executor with the resolved owner - `inst-call-mount-executor`
   2. [ ] - `p1` - Once mounted, the microfrontend's own engine provider reads the current location from the shared history at start and matches the remainder of the path under its `basepath` (specified in `cpt-frontx-feature-routing-engine-provider`) - `inst-mfe-reads-location-at-start`
4. [ ] - `p1` - **ELSE IF** the resolved owner is already mounted - `inst-elseif-already-mounted`
   1. [ ] - `p1` - Screen Binding takes no mounting action - `inst-no-action-mounted`
5. [ ] - `p1` - **ELSE** no declared prefix matches the pathname - `inst-else-no-match`
   1. [ ] - `p1` - The host's own fallback is shown and nothing is mounted (`cpt-frontx-algo-routing-url-screen-binding-no-owner-fallback`) - `inst-show-fallback`

**Postconditions**:
- The mounted screen and the URL agree without a blank screen, because the freshly mounted router reads the already-current location rather than starting from a blank route.

## 3. Processes / Business Logic (CDSL)

### Primary Direction: URL-To-Mount Reconciliation

- [ ] `p2` - **ID**: `cpt-frontx-algo-routing-url-screen-binding-url-to-mount`

**Input**: The current pathname, read from the navigation substrate's shared history on every cold load, reload, back/forward step, or other navigation; the host-injected route-owner provider; the host-injected mounting executor, whose mount operation reports an observable success-or-failure result rather than running fire-and-forget; knowledge of which owners are currently mounted; and this algorithm's own in-flight set — owners whose mount has been requested and has not yet reported a result.

**Output**: Either a call to the mounting executor for a resolved owner that is neither already mounted nor already in flight, no action for an already-mounted or already-in-flight resolved owner, or deferral to the no-owner fallback (`cpt-frontx-algo-routing-url-screen-binding-no-owner-fallback`) when nothing matches. A later mount result (success or failure) moves the screen-domain slot's own state (`cpt-frontx-state-routing-url-screen-binding-slot-binding`), not this reconciliation step itself.

**Steps**:
1. [ ] - `p1` - **WHEN** the navigation substrate's fan-out notifies of a navigation (cold load, reload, back/forward, or any push/replace — dispatched either from the browser-history subscription or directly from the substrate's own `push`/`replace`/`go` call, per `cpt-frontx-algo-routing-navigation-substrate-fanout-dispatch`) - `inst-when-navigation`
   1. [ ] - `p1` - Read the current pathname from the shared history's `location` - `inst-read-pathname`
2. [ ] - `p1` - Resolve the route owner for that pathname via the navigation substrate's longest-matching-prefix primitive (`cpt-frontx-algo-routing-navigation-substrate-prefix-resolution`), passing the host-injected route-owner provider's declared prefixes - `inst-resolve-owner`
3. [ ] - `p1` - **IF** the resolution returns "no owner" - `inst-if-no-owner`
   1. [ ] - `p1` - Defer to the no-owner fallback (`cpt-frontx-algo-routing-url-screen-binding-no-owner-fallback`) and **RETURN** - `inst-defer-fallback`
4. [ ] - `p1` - **ELSE IF** the resolved owner is already mounted - `inst-elseif-mounted`
   1. [ ] - `p1` - **RETURN** — no action needed - `inst-return-no-action`
5. [ ] - `p1` - **ELSE IF** the resolved owner is already in this algorithm's own in-flight set — its mount was requested by an earlier resolution and has not yet reported a result - `inst-elseif-in-flight`
   1. [ ] - `p1` - **RETURN** — no second mount call for an owner already being mounted; this is the guard against a duplicate executor invocation for a still-resolving owner (see the state machine's in-flight mount guard) - `inst-return-in-flight-guard`
6. [ ] - `p1` - **ELSE** the resolved owner is neither mounted nor in flight - `inst-else-not-mounted`
   1. [ ] - `p1` - Add the resolved owner to the in-flight set - `inst-add-in-flight`
   2. [ ] - `p1` - Invoke the host-injected mounting executor with the resolved owner's identifier - `inst-invoke-mount-executor`
   3. [ ] - `p1` - **RETURN** without waiting for the mount to complete — mounting is asynchronous; the freshly mounted microfrontend's own engine provider reading the current location at start (`cpt-frontx-feature-routing-engine-provider`) is what prevents a blank screen once the mount resolves - `inst-return-async`
7. [ ] - `p1` - **WHEN** a mount invoked in step 6 later reports its result - `inst-when-mount-result`
   1. [ ] - `p1` - Remove the owner from the in-flight set unconditionally - `inst-remove-in-flight`
   2. [ ] - `p1` - **IF** the result is success - `inst-if-mount-success`
      1. [ ] - `p1` - Add the owner to the set of currently mounted owners; the slot moves to BOUND if this owner is still the one a resolution currently targets (`inst-t-resolving-bound`/`inst-t-rebinding-bound`) - `inst-mount-success-bound`
   3. [ ] - `p1` - **ELSE** the result is failure - `inst-else-mount-failure`
      1. [ ] - `p1` - Do not add the owner to the set of currently mounted owners; if this owner is still the one a resolution currently targets, the slot returns to UNBOUND and the host fallback is shown (`inst-t-resolving-unbound-mount-failure`) rather than remaining RESOLVING forever - `inst-mount-failure-unbound`

### No Declared Owner Matches: Host Fallback

- [ ] `p2` - **ID**: `cpt-frontx-algo-routing-url-screen-binding-no-owner-fallback`

**Input**: A "no owner" result from the longest-matching-prefix resolution primitive for the current pathname.

**Output**: The host's own fallback is shown; no extension is mounted.

**Steps**:
1. [ ] - `p1` - **IF** the longest-matching-prefix resolution names no declared owner for the current pathname - `inst-if-unclaimed`
   1. [ ] - `p1` - Take no mounting action against any declared route owner - `inst-no-mount-action`
   2. [ ] - `p1` - Leave the host's own fallback visible for the unclaimed pathname - `inst-leave-fallback-visible`
2. [ ] - `p1` - **RETURN** - `inst-return`

### Secondary Direction: Mount-To-URL Reflection Via Replace

- [ ] `p2` - **ID**: `cpt-frontx-algo-routing-url-screen-binding-mount-to-url`

**Input**: A route owner mounted for a reason other than a navigation-driven resolution (the primary direction above did not initiate it); that owner's declared prefix.

**Output**: A `replace` call against the shared history reflecting the mounted owner's declared prefix into the URL, or no action when the mount was itself navigation-driven.

**Steps**:
1. [ ] - `p1` - **IF** the mount was initiated by the primary URL-to-mount reconciliation (`cpt-frontx-algo-routing-url-screen-binding-url-to-mount`) - `inst-if-url-driven`
   1. [ ] - `p1` - **RETURN** — the URL already agrees with the mount; no reflection is needed - `inst-return-already-agrees`
2. [ ] - `p1` - **ELSE** the mount was not driven by a navigation - `inst-else-not-url-driven`
   1. [ ] - `p1` - Read the mounted owner's declared prefix from the host-injected route-owner provider - `inst-read-declared-prefix`
   2. [ ] - `p1` - Call the shared history's `replace` — never `push` — with that declared prefix - `inst-call-replace`
3. [ ] - `p1` - **RETURN** - `inst-return-reflected`

**Rationale**: `replace` rather than `push` is what keeps a mount the user did not navigate to from creating an extra back/forward entry, and from discarding an in-progress back/forward navigation the user did initiate — the URL stays authoritative without the reflection itself becoming a navigation the user has to step back through. This has a real, accepted cost: `replace` overwrites the history entry the user was previously on, so that entry becomes unreachable by a subsequent back step, and any sub-path deeper than the reflected owner's declared prefix that entry carried is discarded along with it. That cost is the price of the "URL is the single source of truth for occupancy" principle, not an oversight of this algorithm — the alternative, `push`, would avoid the cost but let a mount the user never navigated to create a back/forward entry they now have to step through, which is the worse trade this algorithm exists to avoid.

### Unmount When The URL Resolves To A Different Owner

- [ ] `p2` - **ID**: `cpt-frontx-algo-routing-url-screen-binding-unmount-on-prefix-exit`

**Input**: The current pathname's resolved route owner, from the primary direction; the set of currently mounted route owners.

**Output**: The host-injected mounting-executor port is called to unmount every currently mounted route owner that is not the resolved owner; the unmount itself is executed by the host.

**Steps**:
1. [ ] - `p1` - **WHEN** the primary URL-to-mount reconciliation (`cpt-frontx-algo-routing-url-screen-binding-url-to-mount`) has resolved the current navigation to an owner (or to "no owner") - `inst-when-resolved`
2. [ ] - `p1` - **FOR EACH** currently mounted route owner - `inst-foreach-mounted`
   1. [ ] - `p1` - **IF** that owner is not the owner the current resolution named (or the resolution named no owner at all) - `inst-if-not-resolved-owner`
      1. [ ] - `p1` - Call the host-injected mounting-executor port to unmount that owner - `inst-signal-unmount`

**Rationale**: The unmount rule is "not the currently resolved owner", not "declared prefix no longer contains the pathname". Declared prefixes may legally nest (`cpt-frontx-routing-fr-url-screen-binding`, PRD §11): an owner declared at `/a` and another at `/a/b` are both prefixes of `/a/b/x`, so a prefix-containment test alone would leave *both* mounted when only the longest-match winner — the resolution's actual output — should be. Testing "is this the resolved owner" instead of "does this owner's prefix still contain the pathname" is what keeps exactly one owner mounted for the slot even when prefixes nest.
3. [ ] - `p1` - **RETURN** - `inst-return-unmount`

## 4. States (CDSL)

### Screen-Domain Slot Binding State Machine

- [ ] `p2` - **ID**: `cpt-frontx-state-routing-url-screen-binding-slot-binding`

**States**: UNBOUND, RESOLVING, BOUND, REBINDING

**Initial State**: UNBOUND

**Transitions**:
1. [ ] - `p1` - **FROM** UNBOUND **TO** RESOLVING **WHEN** a navigation (cold load, reload, back/forward, or any other navigation) is notified by the navigation substrate's fan-out and the slot currently names no bound owner - `inst-t-unbound-resolving`
2. [ ] - `p1` - **FROM** RESOLVING **TO** BOUND **WHEN** the primary URL-to-mount reconciliation resolves a declared owner and that owner's mount completes successfully — immediately, if it was already mounted, or once the host-injected mounting executor reports its mount succeeded - `inst-t-resolving-bound`
3. [ ] - `p1` - **FROM** RESOLVING **TO** UNBOUND **WHEN** the resolution names no declared owner for the pathname (owner loss at first resolution); the host fallback is shown and the slot stays unbound - `inst-t-resolving-unbound`
4. [ ] - `p1` - **FROM** RESOLVING **TO** UNBOUND **WHEN** the host-injected mounting executor reports the in-flight mount failed rather than succeeded (mount rejection) - `inst-t-resolving-unbound-mount-failure`
5. [ ] - `p1` - **FROM** RESOLVING **TO** RESOLVING **WHEN** a new navigation resolves a declared owner different from the one whose mount is currently in flight, before that in-flight mount reports its result (resolution restart) — the slot's target owner becomes the newly resolved one; the earlier mount call is not cancelled, but its eventual result no longer moves the slot, since by the time it resolves the slot is already resolving toward, or bound to, the newer owner - `inst-t-resolving-resolving-restart`
6. [ ] - `p1` - **FROM** BOUND **TO** REBINDING **WHEN** a later navigation resolves a declared owner different from the one currently bound (owner change) - `inst-t-bound-rebinding`
7. [ ] - `p1` - **FROM** REBINDING **TO** BOUND **WHEN** the newly resolved owner's mount completes successfully and the previously bound owner, if it is not the newly resolved owner, has been unmounted (`cpt-frontx-algo-routing-url-screen-binding-unmount-on-prefix-exit`) - `inst-t-rebinding-bound`
8. [ ] - `p1` - **FROM** BOUND **TO** UNBOUND **WHEN** a later navigation resolves no declared owner at all (owner loss); the currently bound owner is unmounted and the host fallback is shown - `inst-t-bound-unbound`
9. [ ] - `p1` - **FROM** REBINDING **TO** UNBOUND **WHEN** the navigation that triggered rebinding is itself immediately followed by one resolving no declared owner before the new owner's mount completes (owner loss during rebinding); the previously bound owner is unmounted and the host fallback is shown - `inst-t-rebinding-unbound`

**In-flight mount guard**: The slot's own RESOLVING/REBINDING state is not, by itself, enough to prevent a duplicate mount call — the owner named by a *prior* resolution may still be "not yet mounted" from the executor's point of view when a second navigation resolves the *same* owner again while the first mount is still in flight. The reconciliation algorithm (§3, `cpt-frontx-algo-routing-url-screen-binding-url-to-mount`) therefore tracks its own set of owners with a mount currently requested and not yet resolved (success or failure), separate from the set of owners already mounted, and treats an owner in that in-flight set the same way it treats an already-mounted owner: no second mount call for it. Without this guard, re-entering RESOLVING for the same still-mounting owner — which a rapid successive navigation to the same pathname can do — would invoke the mounting executor a second time for an owner that is not yet "mounted" but is already being mounted.

**Description**: This machine tracks one screen-domain slot's binding to a route owner, not the mounting mechanics themselves — mount and unmount execution are host-owned, reached only through the injected mounting-executor port (§1.4 boundary note), whose result — success or failure — is observable, not fire-and-forget. RESOLVING is the window between a navigation being observed and its owner's mount reporting a result; REBINDING is the same window when a different owner was already bound. RESOLVING is not a dead end if that result is failure (transition 4) or if a newer navigation supersedes the in-flight one (transition 5) — without both, a failed or superseded mount would leave the slot permanently RESOLVING. A "no owner" resolution (§3, `cpt-frontx-algo-routing-url-screen-binding-no-owner-fallback`) always returns the slot to UNBOUND rather than introducing a distinct fallback state, because the host's fallback is not itself a route owner this machine tracks occupancy for.

## 5. Definitions of Done

### Primary URL-To-Mount Reconciliation And Host Fallback

- [ ] `p1` - **ID**: `cpt-frontx-dod-routing-url-screen-binding-url-to-mount`

The system **MUST**, on every cold load, reload, back/forward step, or other navigation, resolve the current pathname to its declared route owner through the navigation substrate's longest-matching-prefix primitive and mount that owner through the host-injected mounting executor if it is neither already mounted nor already in this reconciliation's own in-flight set, **MUST** move the screen-domain slot to UNBOUND and show the host's own fallback when that in-flight mount reports failure rather than leaving the slot in RESOLVING indefinitely, **MUST** retarget an in-flight resolution to a newly resolved owner rather than queuing behind the superseded one when a later navigation resolves a different owner before the current mount reports its result, and **MUST** take no mounting action and leave the host's own fallback visible when no declared prefix matches the pathname.

**Implements**:
- `cpt-frontx-flow-routing-url-screen-binding-deep-link-cold-mount`
- `cpt-frontx-algo-routing-url-screen-binding-url-to-mount`
- `cpt-frontx-algo-routing-url-screen-binding-no-owner-fallback`
- `cpt-frontx-state-routing-url-screen-binding-slot-binding`

**Addresses**:
- `cpt-frontx-routing-fr-url-screen-binding`
- `cpt-frontx-routing-usecase-deep-link-to-microfrontend-screen`

**Touches**:
- Component: `cpt-frontx-component-routing-screen-binding`

### Secondary Mount-To-URL Reflection And Prefix-Exit Unmount

- [ ] `p1` - **ID**: `cpt-frontx-dod-routing-url-screen-binding-mount-to-url-and-unmount`

The system **MUST** reflect a mount that was not driven by navigation back into the URL under that owner's declared prefix using a history `replace`, never a `push`, so no extra back/forward entry is created and an in-progress back/forward navigation is not discarded — accepting that the `replace`d entry itself becomes unreachable by a subsequent back step as the deliberate cost of that guarantee — and **MUST** unmount every currently mounted route owner that is not the owner the current resolution named, not only one whose own declared prefix stopped containing the pathname, so that legally nested declared prefixes never leave more than one owner mounted for the slot.

**Implements**:
- `cpt-frontx-algo-routing-url-screen-binding-mount-to-url`
- `cpt-frontx-algo-routing-url-screen-binding-unmount-on-prefix-exit`
- `cpt-frontx-state-routing-url-screen-binding-slot-binding`

**Addresses**:
- `cpt-frontx-routing-fr-url-screen-binding`

**Touches**:
- Component: `cpt-frontx-component-routing-screen-binding`

## 6. Acceptance Criteria

- [ ] A cold load, a reload, and a back/forward step all resolve the same mounted route owner from the URL through the same resolution path (the longest-matching-prefix primitive owned by `cpt-frontx-feature-routing-navigation-substrate`), dispatched whether the navigation reached the resolver through the browser-history subscription or through the substrate's own `push`/`replace`/`go`.
- [ ] When the resolved owner is neither already mounted nor already in the in-flight set, the host-injected mounting executor is invoked with that owner, and no blank screen appears because the mounted microfrontend's own engine provider reads the already-current location at start.
- [ ] When the resolved owner is already mounted, no mounting action is taken.
- [ ] When the resolved owner's mount is already in flight (requested by an earlier resolution and not yet resolved), no second mounting call is made for it.
- [ ] When an in-flight mount reports failure, the screen-domain slot returns to UNBOUND and the host's own fallback is shown, rather than the slot remaining RESOLVING indefinitely.
- [ ] When a new navigation resolves a different owner before the current in-flight mount reports a result, the slot's target becomes the newly resolved owner rather than waiting on, or queuing behind, the superseded mount.
- [ ] When no declared prefix matches the pathname, the host's own fallback is shown and no extension is mounted.
- [ ] A mount not driven by navigation is reflected into the URL by `replace`, never `push`, under the mounted owner's declared prefix.
- [ ] A mount driven by navigation is not redundantly reflected back into the URL a second time.
- [ ] An in-progress back/forward navigation is not discarded by a mount-to-URL reflection, and the entry a `replace` reflection overwrites is understood to become unreachable by a subsequent back step as the accepted cost of that guarantee.
- [ ] Every currently mounted route owner that is not the owner the current resolution named is unmounted — including, under legally nested declared prefixes, an outer owner whose own prefix still contains the pathname but which is no longer the longest-match winner.
- [ ] This feature holds no registry of route owners and executes no mount itself; both are reached only through the host-injected route-owner provider and mounting executor ports, and a repeated `unmount` call for an owner already unmounted is a no-op, not an error.
- [ ] The resolver's inert-or-active status is observable, so a host that forgot to inject the route-owner provider or the mounting executor is distinguishable from a deliberate standalone deployment.
