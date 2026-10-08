# Feature: Host-MFE Communication: Mediator & Bridge


<!-- toc -->

- [1. Feature Context](#1-feature-context)
  - [1.1 Overview](#11-overview)
  - [1.2 Purpose](#12-purpose)
  - [1.3 Actors](#13-actors)
  - [1.4 References](#14-references)
- [2. Actor Flows (CDSL)](#2-actor-flows-cdsl)
  - [Dispatch Actions Chain to MFE Target](#dispatch-actions-chain-to-mfe-target)
- [3. Processes / Business Logic (CDSL)](#3-processes--business-logic-cdsl)
  - [Mediator Keyed Dispatch and Recursive Chain Execution](#mediator-keyed-dispatch-and-recursive-chain-execution)
  - [Registration Propagation, Escalation, and Retraction](#registration-propagation-escalation-and-retraction)
  - [Bridge Delegation to Registry](#bridge-delegation-to-registry)
  - [Occupant-Value Rendezvous](#occupant-value-rendezvous)
  - [History Intent on Lifecycle Actions](#history-intent-on-lifecycle-actions)
- [4. States (CDSL)](#4-states-cdsl)
  - [Action State Machine](#action-state-machine)
- [5. Definitions of Done](#5-definitions-of-done)
  - [Mediator Keyed Dispatch and Recursive Chain Execution](#mediator-keyed-dispatch-and-recursive-chain-execution-1)
  - [Narrow Capability Bridge With Delegating Methods](#narrow-capability-bridge-with-delegating-methods)
  - [Router Port Contract](#router-port-contract)
  - [Occupant-Value Rendezvous](#occupant-value-rendezvous-1)
  - [Occupant Values Exposed on No Interface](#occupant-values-exposed-on-no-interface)
  - [History Intent on Lifecycle Actions](#history-intent-on-lifecycle-actions-1)
- [6. Acceptance Criteria](#6-acceptance-criteria)

<!-- /toc -->

- [ ] `p1` - **ID**: `cpt-frontx-featstatus-mfe-host-communication`
## 1. Feature Context

- [ ] `p2` - `cpt-frontx-feature-mfe-host-communication`

### 1.1 Overview

The host runtime routes actions to microfrontend targets through an actions-chains mediator keyed by target identifier and action type, and that routing reaches any target regardless of how many nesting levels separate sender and target: each registry automatically propagates its admitted targets to its ancestors and escalates an unresolved action not handed down from its parent to its own parent, so the mediator chain composes transitively up to the shell; an action handed down from the parent that finds no local handler runs its `fallback`, if present, or nothing. A narrow parent–child capability bridge gives child microfrontends exactly the participation capabilities they need, delegating each to the registry and its mediator, while the property channel carries no solution-specific vocabulary. `executeActionsChain` on either surface takes only the chain and returns nothing awaitable: the runtime executes each action and then its `next` or `fallback` recursively. Where a target lives in another runtime, the current runtime hands the sub-chain over and nothing comes back. The package also declares the optional router port a registry can be built with: the runtime presents registrations to the injected router, obtains from it each extension's opaque occupant value at mount, hands that value to the extension's own copy of the package through a private realm rendezvous associated with the extension's bridge, and passes the history intent `mount_ext` and `unmount_ext` carry to the router uninterpreted — while no interface handed to extension or host code exposes an occupant value.

### 1.2 Purpose

This feature details the host–MFE dispatch mechanism and the child-facing bridge surface that together realize `cpt-frontx-fr-mfe-host-communication`, including the registration-propagation and escalation mechanism that makes dispatch reach a target at any nesting depth without widening the bridge surface. Action admission is delegated to the injected type-system provider rather than embedded format knowledge, and runs at the registry that executes the action, where the target lives, applying `cpt-frontx-principle-agnostic-core`. The dispatch semantics detailed here — recursive execution, a per-action timeout, and hand-over of a sub-chain to the runtime where its target lives — are what `cpt-frontx-constraint-mfes-recursive-chain-execution` (MFES-8) rests on.

This feature also specifies the router port contract the package declares (`cpt-frontx-mfes-interface-router-port`), the occupant-value rendezvous through which an extension's own copy of the package obtains the value the router assigned it, the guarantee that no interface handed to extension or host code exposes an occupant value, and the history intent on `mount_ext` and `unmount_ext` (`cpt-frontx-constraint-mfes-router-port`). Out of scope here: when the registry presents registrations and sends release notifications (`cpt-frontx-algo-mfe-registry-router-admission`), and when a domain's handler path reports a settled execution (`cpt-frontx-algo-extension-domain-governance-mount-execution`); the closed action schemas that make the history intent strictly typed (`cpt-frontx-feature-gts-type-provider`); and the concrete router, which the template framework provides.

**Requirements**: `cpt-frontx-fr-mfe-host-communication`, `cpt-frontx-nfr-security`

**Principles**: `cpt-frontx-principle-agnostic-core`

### 1.3 Actors

| Actor | Role in Feature |
|-------|-----------------|
| `cpt-frontx-actor-project-developer` | Dispatches action chains to registered microfrontend targets through the host runtime |

### 1.4 References

- **PRD**: [PRD.md](../../../../../architecture/PRD.md)
- **Design**: [DESIGN.md](../../DESIGN.md)
- **ADRs**: `cpt-frontx-adr-action-dispatch-and-chaining`, `cpt-frontx-adr-child-mfe-host-access`, `cpt-frontx-adr-extension-routing-port`, `cpt-frontx-adr-shared-dep-cache-reach`
- **Dependencies**: `cpt-frontx-feature-mfe-registry`

## 2. Actor Flows (CDSL)

**Use cases**: `cpt-frontx-usecase-add-microfrontend-to-project`

### Dispatch Actions Chain to MFE Target

- [x] `p1` - **ID**: `cpt-frontx-flow-mfe-host-communication-dispatch-chain`

**Actor**: `cpt-frontx-actor-project-developer`

**Success Scenarios**:
- Developer dispatches an actions chain; the call returns nothing to await; the runtime executes the action through the registered handler and then executes the `next` chain, if present
- Developer dispatches an actions chain whose target lives in another runtime; the runtime hands the sub-chain to the runtime where the target lives, which executes it the same way; nothing comes back

**Error Scenarios**:
- No handler is registered for the target and action type after exhausting the keyed, downward forwarding-entry, and (when the registry is not the shell and the action was not handed down from the parent) upward escalation tiers; the runtime logs a console warning naming the action's target, action type and payload, then executes the chain's `fallback`, if present; otherwise the chain ends. An action handed down from the parent never reaches the escalation tier, so it fails in the child runtime and the parent is not involved
- The handler throws or rejects, or its per-action timeout expires; the runtime executes the chain's `fallback`, if present; otherwise the chain ends
- The far side of a hop refuses the hand-over — the bridge is inactive or disposed, no receiver is wired, the receiving copy does not recognize the envelope's version, or the receiving registry is disposed; the delivering runtime executes the chain's `fallback`, if present, and the refusal leaves no side effect at the far side
- The far side of a hop accepts the hand-over and the action then fails there; the far side executes the chain's `fallback`, if present, and nothing comes back
- Target entry does not declare the dispatched action type; the declaration check fails, the action fails, and the chain's `fallback` executes, if present
- The target extension is registered but not currently mounted; the hand-over through its inactive bridge is refused, and the delivering runtime executes the chain's `fallback`, if present

**Steps**:
1. [x] - `p1` - Developer assembles an actions chain out of nodes that each carry an action identifying the target and action type and may declare that action's own timeout, linked by the `next` and `fallback` continuations the chain declares - `inst-assemble-chain`
2. [x] - `p1` - Developer hands the assembled chain to the host runtime's `executeActionsChain`, which takes only the chain and returns nothing awaitable - `inst-invoke-execute`
3. [x] - `p1` - Runtime delegates action admission to the type-system provider of the registry that executes the action, where the target lives, which validates the action against its registered schema; an admission failure is a failure of the action, so the runtime executes the chain's `fallback`, if present - `inst-admit-action`
4. [x] - `p1` - Runtime checks that the target entry declares the action type in its receivable-action set; infrastructure lifecycle actions are exempt - `inst-decl-check`
5. [x] - `p1` - **IF** the target entry exists and does not declare the action type - `inst-decl-fail-check`
   1. [x] - `p1` - The action fails; the runtime executes the chain's `fallback`, if present - `inst-decl-fail-return`
6. [x] - `p1` - Runtime resolves the handler for the `(target, action type)` pair; on no handler registered for exactly that pair, falls back to a downward forwarding entry recorded through registration propagation from a descendant registry, then, if the registry is not the shell and the action was not handed down from the parent, to an upward escalation route reached through its inbound bridge - `inst-resolve-handler`
7. [x] - `p1` - **IF** no handler registered for the pair or forwarding entry exists for the target, and no escalation handler exists for it or the action was handed down from the parent - `inst-no-handler-check`
   1. [x] - `p1` - Runtime logs a console warning naming the action's target, action type and payload; only the runtime where resolution fails logs it, so an action that crossed a hop is logged once - `inst-no-handler-log`
   2. [x] - `p1` - The action fails; the runtime executes the chain's `fallback`, if present; for an action handed down from the parent, the child runtime executes it and the parent is not involved - `inst-no-handler-fallback`
   3. [x] - `p1` - **IF** no `fallback` is present - `inst-no-handler-no-fallback`
      1. [x] - `p1` - The chain ends - `inst-no-handler-return`
8. [x] - `p1` - **IF** the resolved route crosses to the runtime where the target lives - `inst-flow-cross-hop-check`
   1. [x] - `p1` - Runtime hands the sub-chain — the action with its `next` and `fallback` — over across the hop - `inst-flow-hand-over`
   2. [x] - `p1` - **IF** the far side refuses the hand-over — the bridge is inactive or disposed, no receiver is wired, the receiving copy does not recognize the envelope's version, or the receiving registry is disposed - `inst-flow-delivery-refused`
      1. [x] - `p1` - The action fails; the runtime executes the chain's `fallback`, if present; the refusal leaves no side effect at the far side - `inst-flow-refused-fallback`
   3. [x] - `p1` - **IF** the far side accepts the hand-over - `inst-flow-delivery-accepted`
      1. [x] - `p1` - The receiving runtime executes the sub-chain the same way, from admission; nothing comes back - `inst-flow-accepted-continues`
9. [x] - `p1` - Runtime invokes the resolved handler within the per-action timeout: the action's declared timeout, otherwise the domain's default action timeout - `inst-invoke-handler`
10. [x] - `p1` - **IF** handler execution succeeds - `inst-success-check`
    1. [x] - `p1` - **IF** the chain has a `next` chain - `inst-check-next`
       1. [x] - `p1` - Runtime executes the `next` chain recursively, routed from this runtime through its own resolution tiers, repeating from admission - `inst-recurse-next`
    2. [x] - `p1` - **IF** no `next` chain is present - `inst-no-next`
       1. [x] - `p1` - The chain ends - `inst-return-completed`
11. [x] - `p1` - **IF** the handler throws or rejects, or the per-action timeout expires - `inst-fail-check`
    1. [x] - `p1` - **IF** the chain has a `fallback` chain - `inst-check-fallback`
       1. [x] - `p1` - Runtime executes the `fallback` chain recursively, routed from this runtime through its own resolution tiers, repeating from admission - `inst-recurse-fallback`
    2. [x] - `p1` - **IF** no `fallback` chain is present - `inst-no-fallback`
       1. [x] - `p1` - The chain ends; nothing is recorded or reported - `inst-return-failed`

## 3. Processes / Business Logic (CDSL)

### Mediator Keyed Dispatch and Recursive Chain Execution

- [x] `p2` - **ID**: `cpt-frontx-algo-mfe-host-communication-mediator-dispatch`

**Input**: An actions chain whose nodes may each declare that action's own timeout — handed to `executeActionsChain`, or handed over across a hop by another runtime

**Output**: Nothing. The runtime executes the action and then the selected branch; nothing is returned, recorded, or reported, apart from the console warning for an action no handler resolves (step 6). For a target in another runtime, the sub-chain is handed to that runtime

**Steps**:
1. [x] - `p1` - `executeActionsChain` returns nothing awaitable; execution proceeds by the steps below - `inst-accept-yields-nothing`
2. [x] - `p1` - **IF** this registry receives a sub-chain handed over across a hop - `inst-receive-hand-over`
   1. [x] - `p1` - **IF** the envelope carries a version this copy does not recognize, or this registry is disposed - `inst-receive-refusal-check`
      1. [x] - `p1` - Refuse the hand-over; the refusal has no side effect here - `inst-receive-refuse`
   2. [x] - `p1` - Otherwise accept the hand-over and execute the sub-chain from admission (step 3) after the hand-over call returns. Every later failure is handled here by executing the `fallback`; nothing surfaces back through the hand-over call - `inst-receive-transfer`
3. [x] - `p1` - Delegate action admission to this registry's type-system provider, where the target lives; an admission failure is a failure of the action (step 12) - `inst-delegate-admit`
4. [x] - `p1` - Look up the handler for the `(targetId, actionTypeId)` pair in the keyed handler registry - `inst-keyed-lookup`
5. [x] - `p1` - **IF** no keyed handler is found for the pair - `inst-no-keyed`
   1. [x] - `p1` - Look up a downward forwarding entry for the target identifier, recorded through registration propagation from a descendant registry — the same distinct cross-hop route shape as the escalation tier below, not a plain `ActionHandler`, since it hands the sub-chain across the hop to the registry where the target lives, which executes it, and nothing comes back; exclude any forwarding entry whose bridge equals the tagged arrival edge of the action being routed, if it carries one - `inst-forwarding-entry-lookup`
   2. [x] - `p1` - **IF** no forwarding entry resolves, the registry holds an inbound bridge (that is, the registry is not the shell), and the action was not handed down from the parent, resolve the escalation tier: the cross-hop route the parent registry minted for that extension's current registration, when it first linked that registration's bridge (`inst-mint-escalation-on-link`), reached through the bridge itself — distinct in shape from a plain `ActionHandler`, since it hands the sub-chain across the hop to the parent registry, which executes the action or routes it onward. This runtime hands the sub-chain over through that route (`inst-hand-over-node`), and nothing comes back - `inst-escalation-lookup`
      1. [x] - `p1` - That parent-minted handler tags the action being routed with this inbound bridge as its arrival edge before handing its sub-chain to the parent registry's mediator, so the parent's forwarding-entry resolution never re-routes that action back onto this same edge; the `next` or `fallback` executed after the action is routed from the runtime that executed the action and is not subject to that exclusion - `inst-tag-arrival-edge`
6. [x] - `p1` - **IF** neither a keyed nor forwarding-entry handler exists for the target, and no escalation handler exists for it or the action was handed down from the parent, which never escalates - `inst-no-handler`
   1. [x] - `p1` - Log a console warning naming the action's target, action type and payload - `inst-log-no-handler`
   2. [x] - `p1` - The action fails with a missing-handler error (step 12) - `inst-throw-no-handler`
7. [x] - `p1` - Resolve the per-action timeout through the shared `ActionTimeoutResolver`: the action's declared timeout, otherwise the domain's default action timeout - `inst-resolve-timeout`
8. [x] - `p1` - **IF** the resolved route crosses to another runtime — a downward forwarding entry or the escalation tier — hand over the sub-chain in the cross-hop envelope, which carries a version and the sub-chain: the action with its `next` and `fallback` - `inst-hand-over-node`
   1. [x] - `p1` - Delivery is synchronous and binary: the hand-over call either refuses or accepts, and never both - `inst-delivery-binary`
   2. [x] - `p1` - **IF** the hand-over is refused — the bridge it travels through is inactive or disposed, a revoked link included, no receiver is wired on the far side, the receiving copy does not recognize the envelope's version, or the receiving registry is disposed - `inst-delivery-refused`
      1. [x] - `p1` - The action fails; this runtime executes the chain's `fallback` per step 12; the refusal leaves no side effect at the far side - `inst-refused-delivery-fallback`
   3. [x] - `p1` - **IF** the hand-over is accepted - `inst-delivery-accepted`
      1. [x] - `p1` - This runtime is done with the sub-chain when the call returns, and nothing comes back; the receiving registry executes it (`inst-receive-transfer`) - `inst-hand-over-done`
9. [x] - `p1` - Invoke the resolved handler within the per-action timeout bound - `inst-invoke-within-timeout`
10. [x] - `p1` - The runtime that executed the action executes the selected branch recursively from itself, routed through its own resolution tiers. The arrival-edge exclusion governs re-routing of the action, not the branch that follows, so a branch whose target lies back across the edge the action arrived on travels back across that edge - `inst-dispatch-continuation`
11. [x] - `p1` - **IF** handler execution succeeds - `inst-success`
    1. [x] - `p1` - **IF** the chain has a `next` - `inst-has-next`
       1. [x] - `p1` - Execute `next` recursively - `inst-recurse-success`
    2. [x] - `p1` - **IF** no `next` is present - `inst-chain-done`
       1. [x] - `p1` - The chain ends - `inst-return-done`
12. [x] - `p1` - **IF** the action fails — the handler throws or rejects, the per-action timeout expires, no handler exists for the target, admission or the declaration check fails, or the hand-over is refused - `inst-failure`
    1. [x] - `p1` - **IF** the chain has a `fallback` - `inst-has-fallback`
       1. [x] - `p1` - Execute `fallback` recursively - `inst-recurse-fallback-algo`
    2. [x] - `p1` - **IF** no `fallback` is present - `inst-no-fallback-algo`
       1. [x] - `p1` - The chain ends; nothing more is recorded or reported - `inst-end-at-node`

### Registration Propagation, Escalation, and Retraction

- [ ] `p2` - **ID**: `cpt-frontx-algo-mfe-host-communication-registration-propagation`

**Input**: A domain-or-extension admission event carrying a target identifier, at a registry that may or may not hold an inbound bridge; an unmount or mount-failure event for a host extension; an unregistration event for a host extension, or a disposal event for a registry; a registry-construction event that may occur while a mount is in progress, possibly against an independently loaded copy of this package from the extension's own mount host; a mount of a re-registered extension whose adopters the parent kept at unregistration (the re-offer cause)

**Output**: A newly constructed registry automatically holds the inbound bridge of the extension currently being mounted, if any and if resolvable, without any explicit action by the microfrontend author; every ancestor registry up to and including the shell holds a forwarding entry for the admitted target, or the advertisement was rejected by a collision guard and logged; on the host extension's unmount or mount failure the parent deactivates that extension's bridge, keeping every advertisement propagated through it recorded while refusing each hand-over that would travel through it; on the host extension's unregistration or the disposal of the parent registry that minted the link, every advertisement propagated through that link is retracted by the parent and the link is revoked, and on a registry's own disposal the advertisements it itself propagated are retracted, so later deliveries to its targets find no route, and the parent unlinks every adopter and keeps its relink callbacks; on the next mount of that extension, the kept adopters are re-offered the new link, advertise again, restore downward delivery and receive their navigation supply; in every case a sub-chain a far side accepted before the deactivation or retraction keeps executing there

**Steps**:
1. [x] - `p1` - While a mount is invoking an extension's lifecycle `mount(shadowRoot, childBridge, mountContext)` synchronously, the runtime records `childBridge` — the extension's own persistent bridge, created at its first mount after the registration and reactivated on each later mount of that registration — as the currently-mounting bridge through a realm-global, version-namespaced rendezvous point — not an ES-module-scoped variable, because the mounting extension and a registry it constructs may each hold their own independently loaded copy of this package — scoped to exactly that synchronous invocation; the same rendezvous entry also collects the relink callback published by each registry that adopts that bridge during the window (step 2.2 — ordinarily exactly one). As the window closes the runtime takes the relink callbacks off the entry and keeps them, per extension, as that extension's retention record; a fresh claim in a later window replaces the record (`inst-unlink-on-retraction`), an ordinary unmount leaves it unchanged, and unregistration unlinks the adopters and keeps them (`inst-retract-advertisements`). Nothing remains at the rendezvous itself once the window closes; the rendezvous serves first contact only, and every later contact is a re-offer through the retained relink callback, which needs no rendezvous (`inst-reoffer-retained-adoption`) - `inst-track-mounting-bridge`
   1. [x] - `p1` - The relink callbacks claimed from the window are recorded into the retention record, superseding the previous record, even when the lifecycle `mount` call throws synchronously - `inst-record-claims-on-mount-throw`
2. [x] - `p1` - **IF** a registry is constructed while the rendezvous point holds a currently-mounting bridge tagged with a protocol version this copy recognizes - `inst-adopt-ambient-bridge`
   1. [x] - `p1` - The newly constructed registry automatically adopts that bridge as its own inbound bridge at construction, with no configuration or method call required from the microfrontend author; the rendezvous entry carries the protocol version of the copy that wrote it, `3`, and at that version the link attached to the handed-down bridge escalates under a synchronous accept-or-throw contract: it accepts the hand-over or throws to refuse it, and never returns a pending result - `inst-inbound-bridge-auto-adopt`
   2. [x] - `p1` - The adopting registry publishes, into the same rendezvous entry, a relink callback the runtime records in the retention record — the only channel through which the parent reaches an already-constructed registry to supersede it, unlink it, or re-offer it a new link — carrying no importable symbol - `inst-publish-relink-callback`
3. [x] - `p1` - **IF** no registry is constructed while the rendezvous point holds a currently-mounting bridge (the extension does not build its own nested registry synchronously within `mount`, or is not itself a host), or the rendezvous entry found carries a protocol version this copy does not recognize, or carries a recognized version but a bridge with no link attached - `inst-no-ambient-bridge`
   1. [x] - `p1` - The constructed registry holds no inbound bridge and behaves as a root/shell registry for propagation and escalation purposes; when an unrecognized protocol version was found, or when the entry's bridge carries no link, log a diagnostic rather than degrading silently - `inst-registry-is-root`
4. [x] - `p1` - The link the parent registry mints for a host extension is minted per registration — once, at that extension's first mount after each registration — and carried by that registration's persistent bridge; it carries the escalation route and the arrival-edge tagging applied to a chain escalating through it. A nested registry reaches both through the link it adopted at construction or was handed by re-offer (step 5), and never by the child's own registry testing the bridge's concrete class identity, since the two sides may not share a class definition. Escalation resolves against the link held at dispatch time, so a registry spanning any number of mount cycles and re-registrations escalates through the current link - `inst-mint-escalation-on-link`
5. [x] - `p1` - **IF**, when an extension mounts, that registration's link exists, the mount window has not yet opened, and the parent kept adopters for the extension in its retention record - `inst-reoffer-retained-adoption`
   1. [x] - `p1` - The parent hands the new link to every adopter in the record through its retained relink callback; no rendezvous is involved, the re-offer stays between the parent and its immediate child, and it adds no member to the registry or either bridge (MFES-6). The receiving registry then advertises, restores downward delivery, and receives its navigation supply (`inst-relink-repropagate`, `inst-relink-downward-delivery`, `inst-ov-supply-navigation`) - `inst-reoffer-hand-link`
6. [x] - `p1` - A registry that receives the link — by adoption at construction, by re-offer (step 5), or by a fresh adoption superseding the previous adopter (step 11.1) — advertises through it every target it currently holds: each domain and extension admitted to it, and every forwarding entry it holds on behalf of its own descendants - `inst-relink-repropagate`
   1. [x] - `p1` - Downward chain delivery is established through the link on every such receipt, and the registry escalates thereafter through the route the link carries (step 4); where the receipt is a fresh adoption superseding an earlier one, the superseded registry discards its record of what the link had accepted from it, so nothing it propagated is counted against the adoption that replaced it - `inst-relink-downward-delivery`
7. [x] - `p1` - On admission of a domain or extension, the registry composes a forwarding advertisement consisting of the target identifier, treated as an opaque identifier - `inst-compose-advertisement`
8. [x] - `p1` - **IF** the registry holds an inbound bridge (that is, the registry is not the shell) - `inst-has-inbound-bridge`
   1. [x] - `p1` - Propagate the advertisement upward through the inbound bridge to the immediate parent registry's mediator - `inst-propagate-upward`
9. [x] - `p1` - **IF** the receiving ancestor already holds a local or forwarding entry for the advertised target identifier - `inst-collision-check`
   1. [x] - `p1` - **IF** the entry the ancestor already holds for that target identifier was recorded for the SAME edge this advertisement arrived on - accept the re-statement without rejecting it, logging a diagnostic, or altering the entry: a repeated statement of a target over a still-live link leaves the entry unchanged, since the entry the advertisement would record is the entry already present, so any such statement — one arriving before the parent revokes that edge, or one of several registries sharing a single mount's link re-stating a target the ancestor already holds for it — resolves to a no-op rather than a collision (see `cpt-frontx-adr-action-dispatch-and-chaining` for rationale) - `inst-readvertise-same-edge`
   2. [x] - `p1` - **IF** the entry belongs to a different edge - reject the advertisement, do not propagate it further, and log a diagnostic - `inst-collision-reject`
10. [x] - `p1` - **IF** the receiving ancestor holds no entry for the advertised target identifier - `inst-no-collision`
    1. [x] - `p1` - Record a downward forwarding entry for the target identifier, pointing back through the bridge the advertisement arrived on - `inst-record-forwarding-entry`
    2. [x] - `p1` - **IF** the ancestor itself holds an inbound bridge (that is, the ancestor is not the shell) - `inst-ancestor-has-inbound-bridge`
       1. [x] - `p1` - Re-propagate the advertisement upward to the ancestor's own parent registry, composing the transitive chain of forwarding entries up to and including the shell - `inst-repropagate-upward`
11. [x] - `p1` - On the unregistration of the host extension a registry's inbound bridge belongs to, or on the disposal of the parent registry that minted the link, the parent registry — not the disposing side — revokes that link, deletes every forwarding entry it holds keyed to that specific bridge, releases the bridge pair, unlinks every adopter and keeps its relink callbacks, and re-propagates the retraction to its own ancestors. An unmount or a mount failure is not such an event: there the parent deactivates that extension's bridge instead, keeping every forwarding entry recorded through it while refusing each hand-over that would travel through it, so the delivering runtime executes the `fallback` and the next mount finds the routing already established still in place. A sub-chain a far side accepted before the retraction or deactivation keeps executing there - `inst-retract-advertisements`
    1. [x] - `p1` - The parent notifies every adopter in the retention record to unlink — on the unregistration or disposal above, where the adopters are kept, and equally when a fresh adoption in a later mount window supersedes the record, where the old adopters are unlinked and the record is replaced; each notified registry drops the link, tears down its downward chain-delivery subscription, and clears its own record of what it had propagated - `inst-unlink-on-retraction`
    2. [x] - `p1` - A link revoked at unregistration or disposal refuses all further `propagateAdvertisement` and `escalate` calls, rejecting each explicitly so the caller's own fallback branch runs rather than the call appearing to succeed, so a reference to it retained beyond revocation — by any copy of the runtime — can never resurrect routing to an extension that is not registered. A `retractAdvertisement` call on a revoked link is the one exception: it is a silent no-op, because the revoking parent has already performed that retraction itself (step 11). A re-offer hands over the new link and never revives the revoked one - `inst-revoked-link-inert`
12. [x] - `p1` - On a registry's own disposal, it symmetrically retracts every advertisement it had itself propagated through its own inbound bridge, recursively for the whole disposing subtree - `inst-retract-own-advertisements`
13. [ ] - `p1` - A nested registry's lifetime tracks its runtime — the independently loaded copy the extension's code runs in — not one registration or one mount: the nested runtime builds its registry once, inside its first mount window, where it adopts (step 2). That one registry keeps its link across every remount, and across unregistration and re-registration of its extension it is re-offered the new link on the next mount (step 5). Building once is a contract of the nested runtime's own application that this package does not enforce. A registry built outside every mount window — at module-evaluation time, or asynchronously after `mount` already returned — is a root registry (step 3). Adoption, re-offer, and unlinking require no act by the microfrontend author beyond building its registry once, per that contract - `inst-nested-registry-lifetime-scope`

### Bridge Delegation to Registry

- [x] `p2` - **ID**: `cpt-frontx-algo-mfe-host-communication-bridge-delegation`

**Input**: A child bridge instance wired with injected registry and mediator callbacks; a request from the child to execute an actions chain or register an action handler; a mount, unmount, mount-failure, or unregistration event for the extension the bridge belongs to

**Output**: Execution delegated to the host registry or mediator while the bridge is active; nothing handed over while the bridge is disposed, inactive, or not wired to a dispatch callback; where the bridge is the route a sub-chain is handed over through, a hand-over the bridge refuses while it is inactive, disposed, or has no receiver wired, after which the delivering runtime executes the `fallback`; no coordination logic inside the bridge itself

**Steps**:
1. [x] - `p1` - **IF** the child requests to execute an actions chain - `inst-child-exec-chain`
   1. [x] - `p1` - Child bridge hands the chain to the injected `executeActionsChain` registry callback without coordination logic and returns nothing; while the bridge is disposed, inactive, or not wired to a dispatch callback, it hands nothing over - `inst-fwd-exec-chain`
2. [x] - `p1` - **IF** the child registers an action handler for a specific action type - `inst-child-reg-handler`
   1. [x] - `p1` - Child bridge invokes the injected mediator-registration callback with the action type identifier and handler instance, keyed to the extension's own GTS identifier; the registration survives the bridge's deactivation and is released only at that extension's unregistration. The bridge wraps the registered handler in an internal activity gate, so an invocation arriving while the bridge is inactive never reaches the handler - `inst-fwd-reg-handler`
3. [x] - `p1` - **IF** the parent runtime sends an action chain to the child's domain - `inst-parent-send-chain`
   1. [x] - `p1` - Parent bridge delivers the chain to the child bridge's registered actions-chain handler - `inst-deliver-to-child`
   2. [x] - `p1` - Child bridge passes the handed-over sub-chain to its registered receiver, which accepts or refuses it (`inst-receive-hand-over`); with no receiver registered, or with the bridge inactive, the bridge refuses the hand-over without invoking the receiver, leaving no side effect in the child runtime, and the delivering runtime executes the `fallback` - `inst-child-invoke`
4. [x] - `p1` - Parent bridge exposes `instanceId` and `dispose()` as its complete narrow public surface; `instanceId` holds the extension's own GTS identifier and is therefore stable across every mount of that extension rather than a per-mount token, and `dispose()` is teardown at unregistration — invoking child bridge cleanup and released state — performed only when that extension is unregistered, while an unmount performs an internal deactivation that appears on no surface - `inst-parent-handle`
5. [x] - `p1` - The registry's inbound bridge — the child bridge its own host extension received at mount and holds for its whole registration lifetime — carries registration-propagation advertisements and upward escalation as internal registry plumbing, through the link the parent attaches to that bridge. The link adds no member to the abstract `ChildMfeBridge` contract or to `ParentMfeBridge`; it is nonetheless reachable by code holding that bridge, the child's own code included, since the child holds the bridge, and the version tag and the synchronous mount window guard only against accidental misattribution — the security analysis of `cpt-frontx-adr-action-dispatch-and-chaining` records that reachability as an accepted limitation. The abstract `ChildMfeBridge` contract is the type the host hands to `mount`, and the one this feature means wherever it says "the child-facing bridge surface". That abstract surface stays exactly the four capability methods `executeActionsChain`, `subscribeToProperty`, `getProperty`, and `registerActionHandler`, alongside exactly two readonly identity properties, `extDomainId` and `extensionId`, regardless of nesting depth. The concrete implementation carries further public members that are not on it — its transport, activity-state, and wiring internals - `inst-inbound-bridge-internal`
6. [x] - `p1` - One parent–child bridge pair is created per extension registration, at that extension's first mount after the registration, and the very same child bridge object is handed to `mount` on every later mount of that registration; `extensionId` carries the extension's own GTS identifier and `extDomainId` the GTS identifier of the domain it is mounted into, both fixed for the pair's whole life. The pair is released only when that extension is unregistered - `inst-bridge-lifetime`
7. [x] - `p1` - On the extension's unmount or a failed mount the parent deactivates the bridge rather than destroying it: every hand-over through an inactive bridge is refused, so the delivering runtime executes the `fallback`, and a chain the child hands to an inactive bridge is not handed over. A sub-chain the far side accepted before the deactivation carries on there; property updates are recorded against the bridge but not dispatched to its subscribers while it is inactive. The next mount reactivates that same bridge and delivery through it resumes - `inst-bridge-deactivation`
8. [x] - `p1` - Action-handler registrations and property subscriptions made through the bridge survive its deactivation and are live again the moment it is reactivated, so an MFE that registers once at its first mount keeps participating across remounts without registering again; an MFE that wants the opposite unregisters its handlers, unsubscribes its properties, and clears its own state from its `unmount()` hook - `inst-registration-survives-remount`

### Occupant-Value Rendezvous

- [x] `p2` - **ID**: `cpt-frontx-algo-mfe-host-communication-occupant-value-rendezvous`

**Input**: A mount of an extension in a domain of a registry, about to invoke the extension's lifecycle `mount(shadowRoot, childBridge, mountContext)`; the release of an extension's bridge pair; a read, by the extension's own copy of this package, of the value associated with its registry's inbound bridge; the construction of a registry that adopts an inbound bridge; the re-offer of a new link to a retained registry; the router injected into the registry, or no router; possibly several independently loaded copies of this package in one realm, of the same or of different protocol versions

**Output**: The occupant value the router assigned is associated with the extension's child bridge at the realm rendezvous before the lifecycle mount runs, and is readable by the extension's own copy through an internal accessor until that bridge is released; a registry built with a router supplies navigation on each adoption, at construction and at each re-offer; with no router, or where a copy does not recognize the rendezvous, no value crosses and the mount proceeds unchanged

**Steps**:
1. [x] - `p1` - Reach the rendezvous through an internal accessor that reads the realm-global slot `Symbol.for('@gears-frontx/mfes:occupant-value:1')`, whose description carries the protocol version this copy speaks, and expects there an entry `{ v: 1, values }` whose `values` is a `WeakMap` keyed by an extension's child bridge object and holding that extension's occupant value. The slot is the package's own, distinct from the mount-context rendezvous (`inst-track-mounting-bridge`) and from the shared-dependency source-text cache slot, and the accessor adds no exported symbol, no capability method on `MfeRegistry`, `ChildMfeBridge` or `ParentMfeBridge`, and no member to either bridge contract (`cpt-frontx-constraint-mfes-cross-nesting-reachability`) - `inst-ov-read-slot`
2. [x] - `p1` - **IF** the slot holds nothing - `inst-ov-if-empty`
   1. [x] - `p1` - Create the `WeakMap` and publish the version-tagged entry into the slot synchronously, before using it, so two copies reaching the slot in one realm cannot each end up holding a map of their own - `inst-ov-publish`
3. [x] - `p1` - **ELSE IF** the entry carries the protocol version this copy speaks and its `values` offers `get`, `set`, `has`, and `delete` as functions - `inst-ov-if-version-known`
   1. [x] - `p1` - Adopt that map, recognizing it by those operations rather than by class identity, which cannot be relied upon across independently evaluated copies - `inst-ov-adopt`
   2. [x] - `p1` - Adopt a structurally conforming entry whichever same-realm code published it: the slot is trusted same-realm coordination state, not an authenticity or confidentiality boundary, so the version and structural checks guard against accidental incompatibility only (`cpt-frontx-adr-shared-dep-cache-reach` records that acceptance for the protocol this rendezvous follows) - `inst-ov-trusted-coordination`
4. [x] - `p1` - **ELSE** the entry is malformed, or carries a protocol version this copy does not recognize - `inst-ov-else-version-unknown`
   1. [x] - `p1` - Treat the rendezvous as absent, emit a diagnostic naming the unrecognized entry, and neither read, mutate, replace nor delete what was found; this copy then associates and reads no occupant value, and every mount it performs proceeds with no value crossing - `inst-ov-back-away`
5. [x] - `p1` - **IF** the registry holding the domain was built with a router, then on each mount of an extension — after the extension's bridge pair is acquired for that mount, created at its first mount or reactivated on a later one (`inst-bridge-lifetime`), and before its lifecycle `mount` is invoked — obtain the extension's occupant value through the router's `assignOccupantValue`, passing the registered domain declaration, the registered extension declaration, and the enclosing level's value - `inst-ov-assign`
   1. [x] - `p1` - The enclosing level's value is the value associated with this registry's own inbound bridge, read through the accessor (`inst-ov-read-own`); it is `undefined` when this registry holds no inbound bridge, when no value is associated with that bridge, or when this copy backed away from the rendezvous - `inst-ov-enclosing-value`
   2. [x] - `p1` - **IF** `assignOccupantValue` throws, the mount fails before the lifecycle `mount` is invoked and is handled as any failed mount: the bridge is deactivated, the strategy destroys the container, and no newly assigned value is associated - `inst-ov-assign-failure`
6. [x] - `p1` - Associate the value the router returned with the extension's child bridge in `values`, replacing any value an earlier mount of that extension associated, before invoking the lifecycle `mount`, so the value is in place for the whole synchronous mount window and after it; the runtime associates whatever the router returned and never inspects it - `inst-ov-set-before-mount`
7. [x] - `p1` - **IF** the registry was built with no router, assign and associate nothing: the extension mounts standalone with no occupant value - `inst-ov-standalone`
8. [x] - `p1` - When the extension's bridge pair is released — at the extension's unregistration or the registry's disposal (`inst-retract-advertisements`) — delete that child bridge's entry from `values`. An unmount or a failed mount deactivates the bridge and leaves the association in place, since the same bridge is handed to the next mount, which replaces the value (`inst-ov-set-before-mount`) - `inst-ov-release-with-bridge`
9. [x] - `p1` - The extension's own copy of this package reads its occupant value through the internal accessor, keyed by its registry's inbound bridge — the child bridge its host extension received at mount — and obtains `undefined` when the registry holds no inbound bridge, when no value is associated with it, or when this copy backed away from the rendezvous - `inst-ov-read-own`
10. [x] - `p1` - **IF** a registry built with a router adopts an inbound bridge — at its construction (`inst-inbound-bridge-auto-adopt`) and at each re-offer (`inst-reoffer-retained-adoption`) — it calls the router's `supplyNavigation` once per adoption, handing it a reader that performs `inst-ov-read-own` against the registry's current inbound bridge at the moment it is called, so the router reads the value the latest mount associated whenever it builds or rebuilds that extension's navigation. A registry that holds no inbound bridge makes no such call - `inst-ov-supply-navigation`
11. [x] - `p1` - Occupant values pass only between copies of this package through this rendezvous, and between the runtime and the injected router through `assignOccupantValue` and `supplyNavigation`; no value is placed on the child or parent bridge, on the inbound bridge link, on the mount context, in the lifecycle arguments, in an action, or in a shared property, and no code of this package passes one to extension or host code - `inst-ov-private-exchange`
12. [x] - `p1` - That guarantee holds at the level of the package's own interfaces and is not a confidentiality boundary: the rendezvous slot is readable by any script running in the same realm, which is accepted on the ground `cpt-frontx-adr-shared-dep-cache-reach` records for its own slot - `inst-ov-interface-level-guarantee`
13. [x] - `p1` - **RETURN** the association made, read, or released, or nothing where no router is injected or the copy backed away - `inst-ov-return`

### History Intent on Lifecycle Actions

- [ ] `p2` - **ID**: `cpt-frontx-algo-mfe-host-communication-history-intent`

**Input**: A `mount_ext` or `unmount_ext` action handed to `executeActionsChain`, whose payload may carry a history intent

**Output**: The action admitted with its history intent unchanged and, once executed, handed to the router uninterpreted inside the settled-action report; or the action rejected at admission, failing as any action fails

**Steps**:
1. [ ] - `p1` - Every mount, restoration and opening included, is requested as a `mount_ext` actions chain, and every explicit unmount as an `unmount_ext` actions chain; each executes through the mediator like any other chain (`cpt-frontx-algo-mfe-host-communication-mediator-dispatch`) - `inst-hi-through-actions`
2. [x] - `p1` - A `mount_ext` or `unmount_ext` payload may carry one optional `history` whose value is one of `none`, `replace`, or `push` - `inst-hi-declare`
3. [ ] - `p1` - The action is admitted through the type-system provider of the registry that executes it (`inst-delegate-admit`), whose closed concrete schemas reject a `history` outside those three values and any undeclared field on the action or its payload (`cpt-frontx-feature-gts-type-provider`); an action that fails admission fails, and its chain's `fallback` executes, if present - `inst-hi-admit-strict`
4. [ ] - `p1` - The runtime reads, defaults, and rewrites no history intent on either action: an absent intent stays absent, and reading an absent intent as `push` is the router's - `inst-hi-uninterpreted`
5. [ ] - `p1` - The intent reaches the router only inside the executed payload of the settled-action report (`inst-me-report-settled` in `cpt-frontx-algo-extension-domain-governance-mount-execution`) - `inst-hi-reach-router`
6. [ ] - `p1` - **RETURN** the admitted action, or the admission failure - `inst-hi-return`

## 4. States (CDSL)

### Action State Machine

- [x] `p2` - **ID**: `cpt-frontx-state-mfe-host-communication-action-lifecycle`

**States**: PENDING, DISPATCHED, SUCCEEDED, FAILED, FALLBACK

**Initial State**: PENDING

**Transitions**:
1. [x] - `p1` - **FROM** PENDING **TO** DISPATCHED **WHEN** a handler is resolved and the action is invoked within its timeout bound - `inst-t-pending-dispatched`
2. [x] - `p1` - **FROM** DISPATCHED **TO** SUCCEEDED **WHEN** handler execution completes without error - `inst-t-dispatched-succeeded`
3. [x] - `p1` - **FROM** DISPATCHED **TO** FAILED **WHEN** the handler throws or rejects, or the per-action timeout expires - `inst-t-dispatched-failed`
   **Actions**:
   - [x] - `p1` - **IF** the chain declares a `fallback` continuation - `inst-failed-check-fallback`
     - [x] - `p1` - Transition the action to FALLBACK and recurse into the fallback chain node - `inst-failed-to-fallback`
   - [x] - `p1` - **IF** no `fallback` is declared - `inst-failed-no-fallback`
     - [x] - `p1` - The chain ends; nothing is recorded or reported - `inst-failed-end-at-node`
4. [x] - `p1` - **FROM** FAILED **TO** FALLBACK **WHEN** the chain declares a fallback continuation that is recursively executed - `inst-t-failed-fallback`
5. [x] - `p1` - **FROM** SUCCEEDED **TO** DISPATCHED **WHEN** the chain declares a `next` continuation and the next action is dispatched - `inst-t-succeeded-dispatched`
6. [x] - `p1` - **FROM** PENDING **TO** FAILED **WHEN** no handler exists for the target, admission or the declaration check fails, or the hand-over is refused (`inst-failure`, `inst-delivery-refused`, `inst-refused-delivery-fallback`, `inst-flow-refused-fallback`) - `inst-t-pending-failed-refused`

## 5. Definitions of Done

### Mediator Keyed Dispatch and Recursive Chain Execution

- [ ] `p1` - **ID**: `cpt-frontx-dod-mfe-host-communication-mediator-dispatch`

The system **MUST** implement the actions-chains mediator with a keyed `(targetId, actionTypeId)` handler registry. `executeActionsChain` **MUST** take only the chain and **MUST** return nothing awaitable. The runtime **MUST** execute a chain recursively: it executes the action, then executes `next` recursively, if present, where the action succeeded, and `fallback` recursively, if present, where the action failed; where the selected branch is absent the chain ends, and nothing is recorded or reported, satisfying `cpt-frontx-constraint-mfes-recursive-chain-execution` (MFES-8). An action fails where the handler throws or rejects, the per-action timeout expires, no handler exists for the target, admission or the declaration check fails, or a hand-over across a hop is refused. Where no handler resolves for an action, the runtime where resolution fails **MUST** log a console warning naming the action's target, action type and payload. The per-action timeout **MUST** be resolved through the shared `ActionTimeoutResolver`: the action's declared timeout, otherwise the domain's default action timeout. Each action's handler **MUST** be resolved when that action executes. Action admission **MUST** run through the type-system provider of the registry that executes the action, where the target lives. The runtime **MUST NOT** process a chain ahead of time — no validation, pre-parsing, or cycle check — and **MUST NOT** track a chain's origin, status, or completion. Where a target lives in another runtime, the current runtime **MUST** hand over the sub-chain — the action with its `next` and `fallback` — in a cross-hop envelope that carries a version and the sub-chain, and nothing comes back. A hand-over **MUST** be refused where the bridge it travels through is inactive or disposed, a revoked link included, no receiver is wired on the far side, the receiving copy does not recognize the envelope's version, or the receiving registry is disposed; a refused hand-over is a failure of the action at the delivering runtime, which executes the chain's `fallback`, if present, and the refusal **MUST** leave no side effect at the far side. After the far side accepts, every failure **MUST** be handled there by executing the far side's `fallback`, and nothing comes back to the delivering runtime. Action admission is delegated to the injected type-system provider; the mediator carries no type-format knowledge. The property channel passed through the bridge surface carries no solution-specific identifiers, satisfying `cpt-frontx-constraint-mfes-no-solution-shared-properties` (MFES-2). The reachability guarantee behind this handler resolution MUST hold transitively across any nesting depth, not just at a single hop, and MUST hold when a nested registry is built against its own independently loaded copy of this package rather than sharing an evaluated module with its host: a registry constructed while an extension's `mount` call is synchronously in progress MUST automatically adopt that extension's bridge as its own inbound bridge, coordinated through a realm-global, version-namespaced rendezvous rather than shared module state, with no configuration or method call from the microfrontend author; a registry that resolves no bridge, or finds a rendezvous entry tagged with an unrecognized protocol version, MUST behave as a root registry; it **MUST** log a diagnostic when an unrecognized protocol version was found or when the entry's bridge carries no link, and **MUST NOT** log one for a registry constructed outside every mount window; admitting a domain or extension MUST automatically propagate a forwarding advertisement through the registry's inbound bridge to every ancestor up to and including the shell, with a collision guard that MUST accept, without rejection and without a diagnostic, an advertisement re-stating an entry the ancestor already holds for the very edge that advertisement arrived on, and MUST reject and log one whose target identifier collides with an entry the ancestor holds locally or for a different edge; resolution MUST add a downward forwarding-entry tier and, when the registry holds an inbound bridge, a final upward-escalation tier reached through that bridge and carried by the link the parent registry minted for that host extension's current registration rather than identified by the child testing the bridge's concrete class, both resolving to the cross-hop route shape rather than to a plain `ActionHandler`, both handing the sub-chain across as every hop does; an action forwarded or escalated across a bridge MUST be tagged with that arrival edge so forwarding-entry resolution never re-routes that same action onto that edge, while the `next` or `fallback` executed after the action, routed from the runtime that executed it, MUST NOT be excluded from it; and on a host extension's unregistration or the disposal of the parent registry that minted the link, the parent registry **MUST** retract every advertisement propagated through that link, unlink every adopter, and keep its relink callbacks, while a registry's own disposal **MUST** retract the advertisements it itself propagated through its own inbound bridge, so later deliveries to its targets find no route. A host extension's unmount or mount failure MUST NOT retract those advertisements: the parent MUST deactivate that extension's bridge instead, keeping every entry recorded through it while refusing each hand-over through it, so the delivering runtime executes the `fallback`. Retraction and deactivation MUST act on routes only: each stops new hand-overs through the route, and neither touches a sub-chain a far side already accepted, which keeps executing there. The link the parent mints for a host extension MUST be minted per registration, once, at that extension's first mount after each registration, and stay live across every subsequent mount of that registration, so a registry spanning remounts keeps routing without any further act by the parent, and, on the next mount of an extension whose adopters the parent kept, the parent **MUST** re-offer the new link to them before the mount window opens; adopters claimed during a mount call that throws synchronously MUST still be recorded; a registry that adopts that link MUST propagate every target it currently holds, both its own admissions and the forwarding entries it holds on behalf of its own descendants, and MUST escalate thereafter through the escalation route and arrival-edge tagging that link carries, while a registry whose adoption a later mount supersedes MUST be unlinked and MUST clear its own record of what it had propagated; and a link revoked at unregistration or disposal MUST be inert, refusing all further propagation and escalation through it explicitly rather than silently, while a retraction through it MUST be a silent no-op because the revoking parent has already performed that retraction itself, so no ancestor can ever acquire or retain a forwarding entry pointing at an extension that is not registered. This composition MUST introduce zero growth to the package's public surface, satisfying `cpt-frontx-constraint-mfes-cross-nesting-reachability` (MFES-6): no new capability method is added to `MfeRegistry` or any other exported type to support propagation, the collision guard, escalation, the hand-over across a hop, loop containment, deactivation, retraction, or re-offer, and the rendezvous protocol carries no importable symbol.

**Implements**:
- `cpt-frontx-flow-mfe-host-communication-dispatch-chain`
- `cpt-frontx-algo-mfe-host-communication-mediator-dispatch`
- `cpt-frontx-algo-mfe-host-communication-registration-propagation`

**Constraints**: `cpt-frontx-constraint-mfes-no-solution-shared-properties`, `cpt-frontx-constraint-mfes-cross-nesting-reachability`, `cpt-frontx-constraint-mfes-recursive-chain-execution`

**Touches**:
- Entities: `Action`, `ActionsChain`
- Component: `cpt-frontx-component-mfe-runtime`

### Narrow Capability Bridge With Delegating Methods

- [ ] `p1` - **ID**: `cpt-frontx-dod-mfe-host-communication-bridge-delegation`

The system **MUST** provide an abstract child bridge contract exposing exactly four capability methods — `executeActionsChain`, `subscribeToProperty`, `getProperty`, and `registerActionHandler` — each delegating to the host registry or mediator without duplicating coordination logic, with `executeActionsChain` taking only the chain and returning nothing awaitable, alongside exactly two readonly identity properties, `extDomainId` carrying the GTS identifier of the domain the extension is mounted into and `extensionId` carrying the extension's own GTS identifier; and a matching parent bridge exposing only `instanceId`, likewise the extension's own GTS identifier, and `dispose()`. Both identity values MUST be stable for the extension's whole registration lifetime rather than tokens minted per mount. The bridge MUST NOT expose runtime internals, and the bridge's active/inactive state MUST stay a private implementation detail of the package, visible on no public surface. One bridge pair MUST be created per extension at its first mount after each registration, handed as the same object to every later mount of that registration, and released at unregistration, so handler registrations and property subscriptions made through it survive an unmount and are live again on the next mount unless the microfrontend's own `unmount()` hook withdraws them; a chain the child hands to a disposed, inactive, or unwired bridge MUST NOT be handed over; a hand-over through an inactive, disposed, or receiver-less bridge MUST be refused so the delivering runtime executes the `fallback`; and a sub-chain the far side accepted before the bridge went inactive MUST keep executing there. This four-method, two-property abstract child-facing surface — the type the host hands to `mount` — MUST remain unchanged regardless of nesting depth, while the concrete implementation's additional members, including its transport, activity-state, and wiring members, MUST stay off it, satisfying `cpt-frontx-constraint-mfes-cross-nesting-reachability` (MFES-6): the link on the registry's own inbound bridge that carries registration-propagation advertisements and upward escalation is internal registry plumbing, not a bridge method, though it remains reachable by code holding that bridge — the accepted limitation recorded in the security analysis of `cpt-frontx-adr-action-dispatch-and-chaining` — and propagation and escalation MUST be fully automatic internal registry behavior, triggered by admission, by adoption of the host extension's link, and by unregistration or disposal, requiring no explicit registration call and no action by the microfrontend author.

**Implements**:
- `cpt-frontx-flow-mfe-host-communication-dispatch-chain`
- `cpt-frontx-algo-mfe-host-communication-bridge-delegation`
- `cpt-frontx-algo-mfe-host-communication-registration-propagation`

**Constraints**: `cpt-frontx-constraint-mfes-no-solution-shared-properties`, `cpt-frontx-constraint-mfes-cross-nesting-reachability`

**Touches**:
- Entities: `Action`, `ActionsChain`
- Component: `cpt-frontx-component-mfe-runtime`

### Router Port Contract

- [x] `p1` - **ID**: `cpt-frontx-dod-mfe-host-communication-router-port-contract`

The system **MUST** declare the router port `RouterPort` — the abstract contract an injected router implements, accepted through the optional `MfeRegistryConfig.router` — and export it, with the types its members name, from the package entry as types. `RouterPort` **MUST** have exactly these members, each synchronous:

- `registerDomain(domain: ExtensionDomain): void` — the registration notification for a domain; throwing rejects the registration.
- `registerExtension(extension: Extension): void` — the registration notification for an extension; throwing rejects the registration.
- `releaseDomain(domainId: string): void` and `releaseExtension(extensionId: string): void` — the release notifications that free what the router admitted.
- `assignOccupantValue(assignment: OccupantValueAssignment): OccupantValue` — the value assignment at mount, where `OccupantValueAssignment` is `{ domain: ExtensionDomain; extension: Extension; enclosingValue: OccupantValue | undefined }`.
- `reportSettled(report: SettledActionReport): void` — the settled-action report, where `SettledActionReport` is `{ actionTypeId: string; domainId: string; payload: MountExtPayload | UnmountExtPayload; succeeded: boolean }`, `payload` being the executed payload exactly as admitted, history intent included.
- `supplyNavigation(readOccupantValue: () => OccupantValue | undefined): void` — the supply of an extension's navigation from its occupant value.

`OccupantValue` **MUST** be an opaque type the runtime stores and hands over without inspecting it. The port **MUST** add no member to `MfeRegistry`, `ChildMfeBridge`, or `ParentMfeBridge`, and this package **MUST NOT** import `@gears-frontx/routing` or `@gears-frontx/routing-tanstack`, nor be imported by either.

**Implements**:
- `cpt-frontx-algo-mfe-host-communication-occupant-value-rendezvous`
- `cpt-frontx-algo-mfe-host-communication-history-intent`

**Constraints**: `cpt-frontx-constraint-mfes-router-port`, `cpt-frontx-constraint-mfes-cross-nesting-reachability`

**Touches**:
- Interface: `cpt-frontx-mfes-interface-router-port`, `cpt-frontx-interface-mfe-runtime`
- Entities: Router port, Occupant value, `Action`
- Component: `cpt-frontx-component-mfe-runtime`

### Occupant-Value Rendezvous

- [x] `p1` - **ID**: `cpt-frontx-dod-mfe-host-communication-occupant-value-rendezvous`

The system **MUST** hand each extension's occupant value to the extension's own copy of this package through a realm-global rendezvous of its own that follows the protocol of `cpt-frontx-adr-shared-dep-cache-reach`: the slot `Symbol.for('@gears-frontx/mfes:occupant-value:1')`, an entry `{ v: 1, values }` whose `values` is a `WeakMap` keyed by the extension's child bridge, recognized structurally rather than by class identity, published synchronously when absent, and left untouched — neither read, mutated, replaced nor deleted — when malformed or of an unrecognized version, in which case the copy backs away and mounts with no value crossing. Where a router is injected, the parent-side copy **MUST** obtain the value through `assignOccupantValue` from the registered domain, the registered extension, and the value associated with its own registry's inbound bridge, and **MUST** associate it with the extension's child bridge before the lifecycle `mount` runs, on every mount; a throwing assignment **MUST** fail the mount before the lifecycle `mount` runs. The association **MUST** be released with the bridge pair and **MUST** survive an unmount. The extension's own copy **MUST** read the value only through the internal accessor, and a registry built with a router that adopts an inbound bridge **MUST** hand its router a reader of that value through `supplyNavigation` on every adoption, re-offer included. With no router, nothing is assigned or associated.

**Implements**:
- `cpt-frontx-algo-mfe-host-communication-occupant-value-rendezvous`

**Constraints**: `cpt-frontx-constraint-mfes-router-port`, `cpt-frontx-constraint-mfes-cross-nesting-reachability`

**Touches**:
- Entities: Occupant value, Extension
- Component: `cpt-frontx-component-mfe-runtime`
- Sequence: `cpt-frontx-mfes-seq-routed-mount-occupant-value`

### Occupant Values Exposed on No Interface

- [x] `p1` - **ID**: `cpt-frontx-dod-mfe-host-communication-occupant-value-not-exposed`

The system **MUST** expose no occupant value on any interface it hands to extension or host code: no member of `MfeRegistry`, of the abstract or concrete `ChildMfeBridge`, of `ParentMfeBridge`, or of the inbound bridge link; no field of `MfeMountContext`; no argument of the lifecycle `mount` or `unmount`; no `Action` or `ActionsChain` the runtime dispatches or hands over; and no shared property value carries or returns one. The system **MUST NOT** pass an occupant value to extension or host code by any other path. The guarantee is stated at the level of the package's own interfaces; the realm slot remains readable by same-realm code, which is accepted and is not claimed as a confidentiality boundary.

**Implements**:
- `cpt-frontx-algo-mfe-host-communication-occupant-value-rendezvous`

**Constraints**: `cpt-frontx-constraint-mfes-router-port`

**Touches**:
- Entities: Occupant value, `Action`, `ActionsChain`
- Component: `cpt-frontx-component-mfe-runtime`

### History Intent on Lifecycle Actions

- [x] `p1` - **ID**: `cpt-frontx-dod-mfe-host-communication-history-intent`

The system **MUST** declare `HistoryIntent` as `'none' | 'replace' | 'push'` and an optional `history?: HistoryIntent` on `MountExtPayload` and on `UnmountExtPayload`; **MUST** request every mount, restoration and opening included, as a `mount_ext` actions chain; **MUST** admit both actions through the injected type-system provider, so a malformed intent or an undeclared field fails the action; and **MUST NOT** read, default, or rewrite the intent, passing it to the router uninterpreted inside the reported payload, an absent intent staying absent.

**Implements**:
- `cpt-frontx-algo-mfe-host-communication-history-intent`

**Constraints**: `cpt-frontx-constraint-mfes-router-port`, `cpt-frontx-constraint-mfes-recursive-chain-execution`

**Touches**:
- Entities: `Action`, `ActionsChain`
- Interface: `cpt-frontx-interface-mfe-runtime`
- Component: `cpt-frontx-component-mfe-runtime`

## 6. Acceptance Criteria

- [x] The actions-chains mediator resolves a handler by the `(targetId, actionTypeId)` pair and a handler matches only its exact action type
- [x] When no handler is registered for the exact pair, resolution continues through a downward forwarding entry and, when the registry has an inbound bridge and the action was not handed down from the parent, a final upward-escalation handler, before treating the target as unresolved
- [x] The runtime executing each action executes `next` on success and `fallback` on failure, each recursively from the runtime that executed the action; the chain ends where the selected branch is absent, and nothing is recorded or reported
- [x] `executeActionsChain` on the registry facade and on the child bridge takes only the chain and returns nothing awaitable
- [x] A handler that throws or rejects, an expired per-action timeout, a missing handler, an admission or declaration failure, and a refused hand-over each lead to the chain's `fallback`
- [x] An action no handler resolves is logged once, as a console warning naming its target, action type and payload, by the runtime where resolution fails
- [ ] Action admission runs through the type-system provider of the registry that executes the action, where the target lives, and an admission failure leads to the chain's `fallback`
- [x] Each action runs within its per-action timeout — its declared timeout, otherwise the domain's default action timeout — resolved through the shared `ActionTimeoutResolver`
- [ ] A chain is executed without prior validation, pre-parsing, or cycle check, and no origin, status, or completion of it is tracked
- [x] Action admission is delegated to the injected type-system provider; no type-format literals appear in the mediator
- [x] The child bridge surface is exactly the four capability methods `executeActionsChain`, `subscribeToProperty`, `getProperty`, and `registerActionHandler` plus exactly two readonly identity properties, `extDomainId` (the GTS identifier of the domain the extension is mounted into) and `extensionId` (the extension's own GTS identifier); the parent bridge surface is exactly `instanceId` and `dispose()`, unchanged regardless of nesting depth
- [x] Both child-bridge identity properties hold the extension's and its domain's own GTS identifiers and are stable for the extension's whole registration lifetime, and the bridge's active/inactive state appears on no public surface of the abstract `ChildMfeBridge`/`ParentMfeBridge` contracts; the concrete child-bridge implementation that holds that state is not exported from the package barrel, so the members through which it inspects that state reach no consumer
- [x] The property channel carries no solution-specific shared-property identifiers, satisfying `cpt-frontx-constraint-mfes-no-solution-shared-properties` (MFES-2)
- [ ] A nested runtime builds its registry once, inside its first mount window, and a registry constructed while an extension's `mount` call is synchronously in progress automatically adopts that extension's bridge as its own inbound bridge via a realm-global rendezvous, requiring no configuration or method call by the microfrontend author, and this holds even when the registry and its host extension are evaluating independently loaded copies of this package; a registry constructed outside any such window holds no inbound bridge and behaves as a root registry with no diagnostic logged, while a registry resolving a rendezvous entry carrying an unrecognized protocol version, or a bridge with no link attached, likewise holds no inbound bridge but logs a diagnostic
- [x] Admitting a domain or extension automatically propagates a forwarding advertisement through each registry's inbound bridge, so that every ancestor up to and including the shell ends up holding a forwarding entry for the admitted target, without any explicit registration action by the microfrontend author
- [ ] An ancestor that already holds a local registration, or a forwarding entry recorded for a different edge, for an advertised target identifier rejects the colliding advertisement, logs a diagnostic, and does not propagate it further; an advertisement re-stating an entry that ancestor already holds for the very edge it arrived on is accepted as a no-op, neither rejected nor logged
- [ ] A chain not handed down from the parent and unresolved by the keyed and forwarding-entry tiers escalates upward through the registry's inbound bridge to the parent's mediator, except at the shell, which has no further ancestor to escalate to, using an escalation handler the parent registry minted for that host extension's current registration rather than one the child identifies by testing the bridge's concrete class; an action handed down from the parent is never escalated: unresolved in the child runtime, it fails there, the child executes the chain's `fallback`, if present, and otherwise does nothing, and the parent is not involved
- [x] A sub-chain whose target lives in another runtime — reached through a downward forwarding entry or the upward escalation tier — is handed over and nothing comes back; the receiving runtime executes it the same way, across one and several hops
- [ ] A hand-over across a hop is either refused or accepted, never both: it is refused where the bridge is inactive or disposed, no receiver is wired, the receiving copy does not recognize the envelope's version, or the receiving registry is disposed; the delivering runtime then executes the chain's `fallback`, and the refusal leaves no side effect at the far side
- [x] After the far side accepts a hand-over, every failure is handled by the receiving runtime's `fallback` and never by the delivering runtime's
- [x] An action is never re-routed onto the bridge edge it most recently arrived on, preventing an escalate-then-forward loop between the same two registries, while a continuation dispatched afresh from the runtime that executed the action is routed through that runtime's own tiers and, where its target lies back across that edge, travels back across it and reaches it
- [ ] A host extension's unregistration, or the disposal of the parent registry that minted the link, causes the parent registry to revoke that link, retract every forwarding advertisement propagated through it, unlink every adopter, and keep their relink callbacks, regardless of whether the registry's own author disposes it, so later deliveries to its targets find no route; a sub-chain a far side accepted before the retraction keeps executing there
- [ ] A host extension's unmount or mount failure leaves every forwarding advertisement propagated through its link in place and deactivates its bridge instead; a hand-over through that inactive bridge is refused, so the delivering runtime executes the `fallback`, while a sub-chain the far side accepted before the deactivation is left executing there; the next mount reactivates the same bridge with its handler registrations and property subscriptions still live unless the microfrontend's own `unmount()` hook withdrew them
- [x] A runtime's single registry, built once in its first mount window, keeps its link across remounts with no act by the parent or author; after unregistration and re-registration of its extension, the next mount re-offers the new link to that same retained registry, which advertises every target it holds, receives downward delivery and navigation supply, and is reachable again; a fresh adoption in a later mount window supersedes the previous adopter, which is unlinked and clears its propagation record; adopters claimed during a mount call that throws synchronously are still recorded; and no dispatch is delivered through a bridge whose extension is not registered
- [ ] A link revoked at a host extension's unregistration or the parent registry's disposal is inert: a registry that retained a reference to it can neither propagate nor escalate through it, each such call being rejected explicitly rather than silently ignored, so no ancestor can acquire a forwarding entry pointing at an extension that is not registered; `retractAdvertisement` is the one exception, a silent no-op on a revoked link, because the revoking parent has already performed that retraction itself
- [ ] Propagation, the collision guard, escalation, the hand-over across a hop, loop containment, deactivation, retraction, and re-offer introduce no new capability method or exported type anywhere in the package's public surface, satisfying `cpt-frontx-constraint-mfes-cross-nesting-reachability` (MFES-6); the inbound-bridge rendezvous is verified, by a test exercising two independently loaded copies of this package rather than one shared module graph, to adopt correctly and never misattribute one extension's bridge to another's registry
- [x] The package entry exports `RouterPort`, `OccupantValue`, `OccupantValueAssignment`, `SettledActionReport`, and `HistoryIntent` as types; `RouterPort` has exactly the members `registerDomain`, `registerExtension`, `releaseDomain`, `releaseExtension`, `assignOccupantValue`, `reportSettled`, and `supplyNavigation`; `MfeRegistry`, `ChildMfeBridge`, and `ParentMfeBridge` gain no member; and the import-graph guard confirms no edge between this package and `@gears-frontx/routing` or `@gears-frontx/routing-tanstack` in either direction
- [x] With a router test double, each mount calls `assignOccupantValue` with the registered domain, the registered extension, and the value associated with the mounting registry's own inbound bridge — `undefined` for a root registry — and the returned value is associated with the extension's child bridge before its lifecycle `mount` runs, as observed from inside that `mount`
- [ ] Across two independently loaded copies of this package rather than one shared module graph, the parent copy associates the value and the extension's own copy reads it through its internal accessor, and a nested registry built with a router inside the extension's `mount` calls `supplyNavigation` once with a reader that returns that value
- [ ] A rendezvous entry carrying an unrecognized version, and a malformed entry, are left untouched — neither read, mutated, overwritten nor deleted — a diagnostic is logged, and the extension still mounts with no occupant value crossing
- [ ] After an unmount or a failed mount the accessor still returns the extension's value; a later mount replaces it with the newly assigned value; after the extension's unregistration, and after the registry's disposal, the accessor returns `undefined` for that bridge
- [x] An `assignOccupantValue` that throws fails the mount before the lifecycle `mount` is invoked, and the chain's `fallback` executes
- [ ] A registry built with no router associates no occupant value for any bridge and makes no `supplyNavigation` call
- [ ] With a router test double whose `assignOccupantValue` returns a unique sentinel object it holds only in a closure, never on a property, a test mounts an extension and inspects, for each of `MfeRegistry`, the `ChildMfeBridge` handed to `mount` (abstract surface and concrete implementation), `ParentMfeBridge`, the inbound bridge link attached to that bridge, the `MfeMountContext`, every argument passed to the lifecycle `mount` and `unmount`, every action and actions chain dispatched or handed over during the mount and unmount, and every shared property value delivered to the extension, every own and inherited property — string- and symbol-keyed, enumerable or not — recursively through the plain objects and arrays reachable from it, and finds no reference to the sentinel; the same test finds the sentinel through the internal accessor keyed by that child bridge
- [ ] A `mount_ext` and an `unmount_ext` carrying `history: 'none'`, `'replace'`, or `'push'` reach the router inside the reported payload with that value unchanged; one carrying no `history` reaches it with none; one carrying a `history` outside those values, or an undeclared payload field, fails admission and its chain's `fallback` executes
