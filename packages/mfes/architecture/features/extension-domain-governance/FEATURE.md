---
description: Specifies extension-domain governance — named mount strategies, cardinality, subset-rule contract matching for default-deny admission, and router commands from domain mount handlers.
---

# Feature: Extension-Domain Governance (Mount Strategies, Cardinality & Contract Matching)


<!-- toc -->

- [1. Feature Context](#1-feature-context)
  - [1.1 Overview](#11-overview)
  - [1.2 Purpose](#12-purpose)
  - [1.3 Actors](#13-actors)
  - [1.4 References](#14-references)
- [2. Actor Flows (CDSL)](#2-actor-flows-cdsl)
  - [Extension Domain Registration and Extension Admission Flow](#extension-domain-registration-and-extension-admission-flow)
- [3. Processes / Business Logic (CDSL)](#3-processes--business-logic-cdsl)
  - [Subset-Rule Contract Matching](#subset-rule-contract-matching)
  - [Mount Strategy Selection and Cardinality Validation](#mount-strategy-selection-and-cardinality-validation)
  - [Strategy Mount Execution](#strategy-mount-execution)
  - [Slot Attach](#slot-attach)
  - [Slot Detach Teardown](#slot-detach-teardown)
- [4. States (CDSL)](#4-states-cdsl)
  - [Extension Admission Lifecycle](#extension-admission-lifecycle)
  - [Extension Domain Cardinality Lifecycle](#extension-domain-cardinality-lifecycle)
- [5. Definitions of Done](#5-definitions-of-done)
  - [Contract Enforcement at Admission](#contract-enforcement-at-admission)
  - [Cardinality Matrix Enforcement at Domain Registration](#cardinality-matrix-enforcement-at-domain-registration)
  - [Default-Deny Posture and Security NFR](#default-deny-posture-and-security-nfr)
  - [URL Commands From the Domain Handler Wrappers](#url-commands-from-the-domain-handler-wrappers)
  - [Domain Start and Stop at Root Attach and Detach](#domain-start-and-stop-at-root-attach-and-detach)
- [6. Acceptance Criteria](#6-acceptance-criteria)

<!-- /toc -->

- [ ] `p1` - **ID**: `cpt-frontx-featstatus-extension-domain-governance`
## 1. Feature Context

- [ ] `p2` - `cpt-frontx-feature-extension-domain-governance`

### 1.1 Overview

Governs extension-domain occupancy through composable named mount strategies and a cardinality matrix, admitting extensions only by subset-rule contract matching with the scoped infrastructure-lifecycle-action exemption — realizing default-deny admission — and commanding the router injected into the registry holding a domain, from the wrappers the runtime places around the domain's `mount_ext` and `unmount_ext` handlers, to show the domain's projected occupancy when the domain accepts an application request and again when each request settles.

### 1.2 Purpose

This feature specifies the admission lifecycle that decides whether a given extension may occupy a given domain and, once admitted, which occupancy behavior the domain enforces. It covers:

- Multi-occupant domain support through composable named strategies (`cpt-frontx-fr-mfe-multi-occupant-domain`).
- Type-aware contract matching that validates structural capability and property compatibility before any extension is admitted (`cpt-frontx-fr-mfe-type-validation`).
- A security-anchored default-deny posture enforced at the admission boundary (`cpt-frontx-nfr-security`).
- The URL commands a domain's handler wrappers issue to an injected router: at acceptance of a request carrying the history intent `push` or `replace`, the domain's projected occupancy with that verb, and at the settle of every request that reached the wrapper, refused and absorbed requests included, the projected occupancy with `replace`. The projection comes from the domain's occupancy queue in an Exclusive or Optional domain and from a per-extension record of the latest accepted, unsettled request in a Concurrent domain, so the router writes what the runtime decides without reading the action type or holding cardinality knowledge, while a nested release, a slot detach, an unregistration, and terminal disposal issue no command (`cpt-frontx-constraint-mfes-router-port`, `cpt-frontx-adr-extension-domain-occupancy`).

Out of scope here: routing identity and the page-wide uniqueness of routed-domain routes, which belong to the injected router and reach it through the registry's registration notifications (`cpt-frontx-algo-mfe-registry-router-admission`); the abstract router's member contract and the history intent (`cpt-frontx-feature-mfe-host-communication`).

The feature realizes the design principle that nothing is granted until explicitly validated (`cpt-frontx-principle-default-deny-admission`).

**Requirements**: `cpt-frontx-fr-mfe-extension-domain-governance`, `cpt-frontx-fr-mfe-multi-occupant-domain`, `cpt-frontx-fr-mfe-type-validation`, `cpt-frontx-nfr-security`

**Principles**: `cpt-frontx-principle-default-deny-admission`

### 1.3 Actors

| Actor | Role in Feature |
|-------|-----------------|
| `cpt-frontx-actor-project-developer` | Defines extension domains (selecting a mount strategy), registers extensions into those domains, and observes admission outcomes. |

### 1.4 References

- **PRD**: [PRD.md](../../PRD.md)
- **Design**: [DESIGN.md](../../DESIGN.md)
- **ADR 0009**: [ADR/0009-extension-domain-occupancy.md](../../../../../architecture/ADR/0009-extension-domain-occupancy.md)
- **ADR 0036**: [ADR/0036-extension-routing-port.md](../../../../../architecture/ADR/0036-extension-routing-port.md)
- **Dependencies**:
  - `cpt-frontx-feature-mfe-registry` — admission and mount strategies act on registry-resolved extensions; domain registration is an MFE Registry concern.
  - `cpt-frontx-feature-gts-type-provider` — action–behavior consistency validation at admission uses type-of resolution from the GTS provider.
  - `cpt-frontx-feature-mfe-host-communication` — the one per-action timeout rule (`inst-resolve-timeout` in `cpt-frontx-algo-mfe-host-communication-mediator-dispatch`) is the rule the occupancy queue uses for each caller's timer; the abstract router contract (`cpt-frontx-dod-mfe-host-communication-router-port-contract`) supplies the `reflect` member the URL commands are issued through and the `startDomain` and `stopDomain` members the domain's mounter calls, and the history intent (`cpt-frontx-algo-mfe-host-communication-history-intent`) selects the acceptance command's verb.

**Checklist applicability**:
- PERF — Not applicable because this feature sets no latency or throughput target; an Optional or Exclusive domain's occupancy queue holds at most two entries (§3, Strategy Mount Execution, step 6).
- SEC — Addressed in §5 (Contract Enforcement at Admission; Default-Deny Posture and Security NFR): no extension is admitted until contract matching and cardinality validation both succeed.
- REL — Addressed in §3 (Strategy Mount Execution, steps 13 and 14): work that has started is never interrupted, and a request still pending when its domain is unregistered fails and takes its own `fallback`.
- DATA — Not applicable because this feature stores nothing durable; the occupancy queue and the per-extension records live in memory.
- INT — Addressed in §5 (URL Commands From the Domain Handler Wrappers; Domain Start and Stop at Root Attach and Detach): the calls this feature makes on the abstract router.
- OPS — Not applicable because this feature is library code with no deployed service, configuration or monitoring of its own.
- MAINT — Not applicable because this feature sets no maintainability target of its own; each occupancy behavior is a named, reusable strategy (`cpt-frontx-adr-extension-domain-occupancy`).
- TEST — Addressed in §6: the acceptance criteria an implementation is tested against.
- COMPL — Not applicable because this feature handles no regulated or personal data.
- UX — Not applicable because this feature renders no user interface; the moments at which the URL follows a request are specified in §5 (URL Commands From the Domain Handler Wrappers).
- BIZ — Not applicable because this is an internal library feature; its requirements are cited by ID in §1.2.

## 2. Actor Flows (CDSL)

User-facing interactions that start with an actor and describe the end-to-end flow of a use case.

**Use cases**: `cpt-frontx-usecase-add-microfrontend-to-project`

### Extension Domain Registration and Extension Admission Flow

- [x] `p1` - **ID**: `cpt-frontx-flow-extension-domain-governance-admission`

**Actor**: `cpt-frontx-actor-project-developer`

**Success Scenarios**:
- Developer successfully registers a domain with a valid mount strategy and consistent action declaration; subsequently registers a compatible extension that is admitted and mounted.

**Error Scenarios**:
- Domain registration fails because declared lifecycle actions are inconsistent with the chosen mount strategy (cardinality violation).
- Domain registration fails because the router injected into the registry rejects it, for example because its route collides with the route of another routed domain live in the page.
- Extension admission fails because the extension's required properties are not provided by the domain, or the entry does not support all capabilities the domain requires, or the entry requires domain capabilities the domain does not provide.
- Extension registration fails because the router injected into the registry rejects it.

**Steps**:
1. [x] - `p1` - Developer composes a domain implementation factory by selecting one of the three named mount strategies (Concurrent, Optional, or Exclusive) and declaring the domain's lifecycle actions - `inst-compose-domain`
2. [x] - `p1` - Developer calls the registry to register the composed domain - `inst-register-domain-call`
3. [x] - `p1` - System performs action–behavior consistency check against the cardinality matrix for the selected strategy - `inst-cardinality-check`
4. [x] - `p1` - **IF** the domain's declared actions violate the cardinality matrix row for the strategy - `inst-cardinality-fail-check`
   1. [x] - `p1` - System rejects the domain registration and returns an error identifying the violated rule - `inst-cardinality-reject`
   2. [x] - `p1` - **RETURN** domain registration failure - `inst-domain-reg-fail`
5. [x] - `p1` - **IF** a router is injected into the registry and the domain declaration carries `route`, System registers the domain with that router through `registerDomain(domainId, route, declaresUnmount)`, the `route` passed uninterpreted and `declaresUnmount` being whether the domain's actions list the `unmount_ext` action type id, before the domain becomes durable (`inst-algo-ra-present-domain` in `cpt-frontx-algo-mfe-registry-router-admission`); a domain declaration without `route` is not registered with the router; the runtime itself neither validates the route nor checks it against any other domain - `inst-domain-router-admission`
   1. [x] - `p1` - **IF** the router rejects the domain, System rejects the domain registration with the router's error, leaving the domain registered nowhere in the registry, and **RETURN** domain registration failure - `inst-domain-router-reject`
   2. [x] - `p1` - **IF** the router admits the domain but its subsequent type-system registration fails, System releases the router admission (`inst-domain-type-register` in `cpt-frontx-algo-mfe-registry-router-admission`) before rejecting the domain registration with a `DomainValidationError`, leaving the domain registered nowhere in the registry and the router free to admit a corrected retry under the same domain id, and **RETURN** domain registration failure - `inst-domain-type-register-reject`
6. [x] - `p1` - System registers the domain with its strategy instance as the mount executor - `inst-domain-registered`
7. [x] - `p1` - Developer registers an extension entry into the registry (via `cpt-frontx-component-mfe-runtime`), declaring the entry's required properties, supported capabilities, and required domain capabilities - `inst-register-extension`
8. [x] - `p1` - System runs subset-rule contract matching between the extension entry and the target domain as part of that registration — before any mount action is issued - `inst-contract-match`
9. [x] - `p1` - **IF** a router is injected into the registry, the extension declaration carries `route`, and the extension passed every admission check of the registration, System registers the extension with that router through `registerExtension(extensionId, domainId, route)`, the `route` passed uninterpreted, before the extension becomes durable (`inst-algo-ra-present-extension` in `cpt-frontx-algo-mfe-registry-router-admission`); an extension declaration without `route` is not registered with the router; the runtime itself derives no route token and checks no route against any sibling - `inst-extension-router-admission`
   1. [x] - `p1` - **IF** the router rejects the extension, System rejects the extension registration with the router's error, leaving the extension registered nowhere in the registry - `inst-extension-router-reject`
   2. [x] - `p1` - **IF** the router admits the extension but its subsequent type-system registration fails, System releases the router admission (`inst-extension-type-register` in `cpt-frontx-algo-mfe-registry-router-admission`) before rejecting the extension registration with the type system's error, leaving the extension registered nowhere in the registry and the router free to admit a corrected retry under the same extension id - `inst-extension-type-register-reject`
10. [x] - `p1` - Developer issues a mount action targeting the registered domain, specifying the (already contract-matched) extension to admit - `inst-mount-action`
11. [x] - `p1` - **IF** contract matching returns any error - `inst-contract-fail-check`
    1. [x] - `p1` - System rejects the extension admission with an error naming each unsatisfied rule (missing property, unsupported action, or unhandled domain action) - `inst-contract-reject`
    2. [x] - `p1` - **RETURN** extension admission failure - `inst-admission-fail`
12. [x] - `p1` - System admits the extension into the domain and delegates to the domain's mount strategy to execute the occupancy behavior - `inst-admitted-mount`
13. [x] - `p1` - **RETURN** extension mounted successfully - `inst-mount-success`

## 3. Processes / Business Logic (CDSL)

Internal system functions and procedures that do not interact with actors directly.

### Subset-Rule Contract Matching

- [x] `p1` - **ID**: `cpt-frontx-algo-extension-domain-governance-contract-matching`

**Input**: An extension entry (with declared required properties, supported capabilities, and required domain capabilities) and a target extension domain (with declared shared properties, required extension capabilities, and supported actions).

**Output**: A validation result indicating whether the entry is compatible with the domain, with each unsatisfied containment rule named explicitly.

**Steps**:
1. [x] - `p1` - Initialise an empty errors list for the result - `inst-cm-init`
2. [x] - `p1` - **FOR EACH** required property declared by the entry - `inst-cm-rule1-loop`
   1. [x] - `p1` - **IF** the domain's shared-properties set does not contain this property - `inst-cm-rule1-check`
      1. [x] - `p1` - Append a missing-property error naming the absent property - `inst-cm-rule1-error`
3. [x] - `p1` - **FOR EACH** extension-capability action required by the domain of its occupants - `inst-cm-rule2-loop`
   1. [x] - `p1` - **IF** the entry's supported-actions set does not contain this action - `inst-cm-rule2-check`
      1. [x] - `p1` - Append an unsupported-action error naming the required but missing action - `inst-cm-rule2-error`
4. [x] - `p1` - **FOR EACH** domain-capability action required by the entry - `inst-cm-rule3-loop`
   1. [x] - `p1` - **IF** this action belongs to the infrastructure lifecycle action set (load_ext, mount_ext, unmount_ext) - `inst-cm-rule3-exempt`
      1. [x] - `p1` - Skip this action (infrastructure lifecycle actions are exempted; they are wired by the runtime, not entry cross-domain requirements) - `inst-cm-rule3-skip`
   2. [x] - `p1` - **IF** the domain's supported-actions set does not contain this action - `inst-cm-rule3-check`
      1. [x] - `p1` - Append an unhandled-domain-action error naming the unsupported action - `inst-cm-rule3-error`
5. [x] - `p1` - **IF** the errors list is non-empty - `inst-cm-invalid-check`
   1. [x] - `p1` - **RETURN** a validation result with valid=false and the populated errors list - `inst-cm-invalid-return`
6. [x] - `p1` - **RETURN** a validation result with valid=true and an empty errors list - `inst-cm-valid-return`

### Mount Strategy Selection and Cardinality Validation

- [x] `p1` - **ID**: `cpt-frontx-algo-extension-domain-governance-strategy-cardinality`

**Input**: An extension domain composed with a named mount strategy and a declared set of lifecycle actions.

**Output**: The domain is either accepted with its strategy instance as the mount executor, or rejected with the specific violated cardinality rule named: a required action it omits, or a forbidden action it declares.

**Steps**:
1. [x] - `p1` - Identify the mount strategy instance composed inside the domain's implementation factory - `inst-sc-identify-strategy`
   1. [x] - `p1` - **IF** no MountStrategy instance was captured by the domain implementation, **RETURN** domain rejected with a missing-strategy error - `inst-sc-no-strategy-reject`
   2. [x] - `p1` - **IF** more than one MountStrategy instance was captured, use the first captured instance as the representative for cardinality matching; mixed-strategy domains (multiple distinct strategy instances) are not supported - `inst-sc-first-strategy-representative`
2. [x] - `p1` - **MATCH** the strategy instance type - `inst-sc-match-strategy`
   1. [x] - `p1` - **CASE** ConcurrentMountStrategy: the domain's action declaration must include mount_ext AND unmount_ext - `inst-sc-concurrent-row`
   2. [x] - `p1` - **CASE** OptionalMountStrategy: the domain's action declaration must include mount_ext AND unmount_ext - `inst-sc-optional-row`
   3. [x] - `p1` - **CASE** ExclusiveMountStrategy: the domain's action declaration must include mount_ext AND must not include unmount_ext, since an Exclusive domain's occupancy never becomes empty through an explicit unmount - `inst-sc-exclusive-row`
   4. [x] - `p1` - **DEFAULT**: the strategy is unrecognized; **RETURN** domain rejected with an unrecognized-strategy error - `inst-sc-unknown-reject`
3. [x] - `p1` - **FOR EACH** action required by the matched cardinality row - `inst-sc-required-check-loop`
   1. [x] - `p1` - **IF** the domain's declared actions do not contain this required action (the action type ID resolved from the injected type-system plugin via its dedicated `resolveMountExtActionId`/`resolveUnmountExtActionId` method) - `inst-sc-missing-required`
      1. [x] - `p1` - **RETURN** domain rejected, naming the missing required action - `inst-sc-required-fail`
4. [x] - `p1` - **FOR EACH** action forbidden by the matched cardinality row (unmount_ext in the Exclusive row; the Concurrent and Optional rows forbid none), resolved through the same dedicated type-system method - `inst-sc-forbidden-check-loop`
   1. [x] - `p1` - **IF** the domain's declared actions contain this forbidden action - `inst-sc-forbidden-declared`
      1. [x] - `p1` - **RETURN** domain rejected, naming the forbidden action the declaration includes - `inst-sc-forbidden-fail`
5. [x] - `p1` - **FOR EACH** action listed in declaration.actions - `inst-sc-handler-required-loop`
   1. [x] - `p1` - **IF** no handler was registered (via `ctx.registerHandler`) for this action - `inst-sc-handler-missing-check`
      1. [x] - `p1` - **RETURN** domain rejected, naming the declared action with no registered handler - `inst-sc-handler-missing-fail`
6. [x] - `p1` - **FOR EACH** handler registered via `ctx.registerHandler`, excluding handlers pre-populated by the registry itself (e.g. the infrastructure `load_ext` handler) - `inst-sc-handler-extra-loop`
   1. [x] - `p1` - **IF** this handler's action is not present in declaration.actions - `inst-sc-handler-extra-check`
      1. [x] - `p1` - **RETURN** domain rejected, naming the handler-registered action absent from the declaration - `inst-sc-handler-extra-fail`
7. [x] - `p1` - **RETURN** domain accepted; the strategy instance is registered as the domain's mount executor - `inst-sc-accept`

### Strategy Mount Execution

- [x] `p2` - **ID**: `cpt-frontx-algo-extension-domain-governance-mount-execution`

**Input**: The extension identifier (the subject) and the domain that a mount request or, in a domain that declares `unmount_ext`, an explicit unmount request addresses (the extension is not presumed admitted to that domain); the action's declared timeout when it declares one, and the domain's own `defaultActionTimeout` used when it declares none; the addressed domain's strategy instance; the domain's own container hooks; the domain's mount set, read through the domain's own mounter by a lookup private to the runtime; the request's admitted payload, including any history intent it carries; the sources of the domain's projected occupancy — in an Exclusive or Optional domain, the running and pending entries of its occupancy queue, each read as an operation and a subject, and in a Concurrent domain, its per-extension record of the latest accepted request that has not yet settled; and the router injected into the registry holding the domain, or no router.

**Output**: One of: the request completed successfully immediately because the extension was already mounted (in an Optional or Exclusive domain, only while the domain's occupancy queue is empty and the domain is not being unregistered); the request joined an entry and settled with that entry's outcome; the request's entry ran and either physically mounted or unmounted its subject, or found at its turn that nothing needed to change and succeeded without change; a fresh mount proceeded after an in-progress unmount that the occupancy queue does not own settled; or the request failed — the extension is not admitted to the addressed domain, a newer request replaced the pending entry it was in, its own timer fired while its entry was still pending, the domain was unregistered while its entry was pending, the request was accepted while its Optional or Exclusive domain was being unregistered, the entry it joined failed, the unmount it waited on failed, or the mount itself failed and was rolled back (`inst-me-mount-root-detached`, `inst-me-mount-rollback`). Where a router is injected, a request the domain accepted with the history intent `push` or `replace`, or with no intent, has commanded the router, at its acceptance, to show the domain's projected occupancy with that verb (`push` for an absent intent), and every request that reached the wrapper, refused and absorbed requests included, has commanded the projected occupancy with `replace` once its own settlement was reached; the request's outcome and its chain's continuation, `next` on success and `fallback` on failure, are decided by the request's own execution.

**Steps**:
1. [x] - `p1` - **IF** the mount request names an extension that is not admitted to the addressed domain (the extension belongs to another domain, or no domain admits it under that name), **RETURN** the request as failed - `inst-me-eligibility-check`
2. [x] - `p1` - **IF** the extension is currently being unmounted by an unmount the domain's occupancy queue does not own — any unmount in a Concurrent domain, and in an Optional or Exclusive domain an unmount started by a slot detach (`cpt-frontx-algo-extension-domain-governance-slot-detach`) — the mount request neither completes successfully nor joins that unmount: wait for the unmount to settle, then re-evaluate. An extension being unmounted may still be listed as mounted until that unmount settles, so this check runs first. In an Optional or Exclusive domain such a request does not complete immediately (`inst-me-already-mounted-complete`) while that unmount is in flight: it takes its place in the occupancy queue, and the wait runs when its entry starts (`inst-me-queue-await-unmount-at-turn`). An unmount the occupancy queue owns orders a mount behind it instead (`inst-me-queue-enter-pending`) - `inst-me-await-unmount-settle`
   1. [x] - `p1` - **IF** the unmount completed, proceed with a fresh mount - `inst-me-fresh-mount-after-unmount`
   2. [x] - `p1` - **IF** the unmount failed, **RETURN** the mount request as failed - `inst-me-fail-after-unmount-failure`
3. [x] - `p1` - **Unmount Ordering (Concurrent domain)**: **IF** the domain is Concurrent and an unmount request for the extension in the addressed domain is issued while a mount of that extension in that domain is in progress, wait for that mount to settle before proceeding. In an Optional domain the occupancy queue orders an unmount behind a running mount instead (`inst-me-queue-enter-pending`, `inst-um-queue-unmount-at-turn`, `inst-um-queue-absent-noop`) - `inst-um-await-mount-settle`
   1. [x] - `p1` - **IF** the mount succeeded, proceed with the unmount (physical unmount, container released exactly once, extension no longer mounted) - `inst-um-after-mount-success`
   2. [x] - `p1` - **IF** the mount failed, the extension is not mounted; the unmount request completes without action - `inst-um-after-mount-failure`
4. [x] - `p1` - **IF** the extension is already mounted in the addressed domain, and either the domain is Concurrent or the domain's occupancy queue is empty and the domain is not being unregistered, **RETURN** the request as completed successfully immediately — checked by extension identity before container creation, eviction, or any strategy runs. In an Optional or Exclusive domain whose occupancy queue is not empty, the request is placed in the queue like any request (`inst-me-queue-place`) and is evaluated at its turn (`inst-me-sole-occupant-at-turn`). In an Optional or Exclusive domain that is being unregistered, the request fails at once as `inst-me-queue-domain-unregister` states - `inst-me-already-mounted-complete`
5. [x] - `p1` - **ELSE IF** the domain is Concurrent and a mount of the extension in the addressed domain is in progress: join that mount and settle with its outcome: succeed when it finishes; **IF** it fails, fail with the same cause, and each requesting chain follows its own declared fallback. Joining in an Optional or Exclusive domain is `inst-me-queue-join-pending` and `inst-me-queue-join-running` - `inst-me-join-in-progress-mount`
6. [x] - `p1` - **IF** the domain is Optional or Exclusive, the domain's own mount action and, in an Optional domain, its own unmount action order every accepted request through an internal occupancy queue of at most two entries: the running entry and one pending entry. An entry is one operation (a mount, or an explicit unmount) on one subject, together with every request that joined it; each such request is a caller of that entry. The queue is internal to those actions and exposes no public surface. An Exclusive domain has no unmount action (`inst-sc-exclusive-row`), so its queue holds only mounts, and its occupant leaves only through a replacing mount that evicts it (`inst-me-exclusive-evict`), through teardown of an ancestor extension caused by that ancestor's own action, through release by unregistration of its extension or domain, or through terminal disposal of its registry. Concurrent domains keep no occupancy queue, and their requests skip to `inst-me-get-mounted` - `inst-me-occupancy-queue`
7. [x] - `p1` - When the domain accepts a request, start that caller's own timer with the value the shared timeout rule gives (`inst-resolve-timeout` in `cpt-frontx-algo-mfe-host-communication-mediator-dispatch`): the action's declared timeout, otherwise the domain's `defaultActionTimeout`. The mediator and the occupancy queue use this one rule definition. The registry hands the action's declared timeout only to its own internal mount and unmount handlers; the public `ActionHandler` signature carries no timeout parameter - `inst-me-queue-caller-timer`
8. [x] - `p1` - **MATCH** the accepted request against the queue: - `inst-me-queue-place`
   1. [x] - `p1` - **CASE** the queue is empty: the request enters as the running entry and starts at once (`inst-me-queue-evaluate-at-turn`) - `inst-me-queue-start-when-empty`
   2. [x] - `p1` - **CASE** the pending entry has the same operation and the same subject: the request joins the pending entry - `inst-me-queue-join-pending`
   3. [x] - `p1` - **CASE** the running entry has the same operation and the same subject: **IF** a pending entry exists, it is replaced as in `inst-me-queue-replace-pending`, except that no request becomes pending; the request joins the running entry and settles with its outcome - `inst-me-queue-join-running`
   4. [x] - `p1` - **CASE** only the running entry exists, with a different operation or subject: the request enters as the pending entry - `inst-me-queue-enter-pending`
   5. [x] - `p1` - **CASE** both slots are held and neither has the request's operation and subject: the request replaces the pending entry. The replaced entry leaves the queue and never starts; each of its callers, including callers that joined it, fails and takes its own chain's `fallback`. Outcomes stay boolean. The request becomes the pending entry - `inst-me-queue-replace-pending`
   6. [x] - `p1` - Joining requires the same operation and the same subject: a mount of A never joins an unmount of A, and an unmount of A never joins a mount of A - `inst-me-queue-join-same-operation-subject`
9. [x] - `p1` - **IF** a caller's own timer fires while its entry is still pending and has not started, that caller fails alone and takes its own `fallback`. The pending entry leaves the queue only when its last caller has left, and an entry that leaves this way never starts - `inst-me-queue-pending-timeout`
10. [x] - `p1` - The running entry is never replaced, removed, or interrupted: not by a newer request, not by a caller's timer, and not by domain unregistration. A caller's timer that fires after its entry has started leaves the entry running; the mediator's own per-action bound settles that caller's attempt and cancels nothing (`cpt-frontx-adr-action-dispatch-and-chaining`), and that caller's settle command waits for the wrapper's own handling of its request (`inst-me-cmd-settlement-own-handling`) - `inst-me-queue-running-never-interrupted`
11. [x] - `p1` - When an entry starts as the running entry, evaluate it against the domain's mount set present at that moment: - `inst-me-queue-evaluate-at-turn`
    1. [x] - `p1` - **IF** an unmount of the entry's subject that the occupancy queue does not own (a slot detach) is in flight when the entry starts, wait for it to settle before any other check at this turn; **IF** it failed, the entry fails and each of its callers takes its own `fallback`; otherwise evaluate the entry as below. The entry never succeeds on the strength of a mount-set record that the settling unmount removes - `inst-me-queue-await-unmount-at-turn`
    2. [x] - `p1` - **IF** the entry's subject is no longer admitted to the domain at its turn, the entry fails and each of its callers takes its own `fallback` - `inst-me-queue-eligibility-at-turn`
    3. [x] - `p1` - **IF** the entry is a mount of A and A is the domain's occupant at that moment, the entry succeeds without container creation, mount-set change, or an `activated` trigger - `inst-me-sole-occupant-at-turn`
    4. [x] - `p1` - **IF** the entry is a mount of A and A is not mounted, the entry runs as a fresh mount through the strategy (`inst-me-get-mounted`, `inst-me-match-strategy`) - `inst-me-queue-fresh-mount-at-turn`
    5. [x] - `p1` - **IF** the entry is an explicit unmount of A and A is mounted, unmount A: physical unmount, container released exactly once, A no longer mounted - `inst-um-queue-unmount-at-turn`
    6. [x] - `p1` - **IF** the entry is an explicit unmount of A and A is absent at its turn, including when the unmount waited behind a mount of A that failed, the entry succeeds without change - `inst-um-queue-absent-noop`
12. [x] - `p1` - When the running entry finishes, each of its callers continues: on success with its own `next`, on failure with its own `fallback`. The entry leaves the queue, and the pending entry, if any, is promoted to running and started (`inst-me-queue-evaluate-at-turn`) - `inst-me-queue-complete-running`
13. [x] - `p1` - **IF** an Optional or Exclusive domain is unregistered, the queue closes. The pending entry, if any, leaves the queue without starting, and each of its callers fails and takes its own `fallback`; the running entry is not interrupted, and the unregistration releases the domain's extensions and removes its handlers only after the running entry has finished with its own outcome, so that outcome and its callers' `next` or `fallback` continuations are unaffected. A domain whose queue is empty is unregistered at once. A request accepted while the unregistration is in progress fails at once, without entering the queue, and takes its own `fallback`. This holds for every request, including a mount of a subject that is still mounted. When the running entry finishes, nothing is promoted. While an unregistration of the domain is in progress, the domain stays closed to new requests until no unregistration of it remains pending. If an unregistration fails and the domain stays registered, its queue accepts requests again only when no other unregistration of the domain is pending and the registry is not being disposed; the pending entry already failed at close stays failed - `inst-me-queue-domain-unregister`
14. [x] - `p1` - **IF** a Concurrent domain is unregistered, work that has started is never interrupted: from the moment the unregistration begins, and until no unregistration of the domain remains pending, a new `mount_ext` or `unmount_ext` request in that domain is refused at once — it issues no acceptance command, takes its own `fallback`, and issues its settle command, the same as the closed queue of an Optional or Exclusive domain (`inst-me-queue-domain-unregister`) — so the wait covers only work that started before. A failed unregistration reopens the domain only when no other unregistration of it is pending and the registry is not being disposed. The unregistration waits for every Concurrent `mount_ext` and `unmount_ext` execution in flight in that domain, each settling with its own outcome so that its callers' `next` or `fallback` continuations are unaffected, and releases the domain's extensions and removes its handlers only after the last of them has settled. A domain with no execution in flight is unregistered at once. `dispose()` waits the same way (`inst-me-registry-dispose-wait`) - `inst-me-concurrent-domain-unregister`
15. [x] - `p1` - **IF** the registry is disposed, `dispose()` returns a promise and, like domain unregistration, never interrupts work that has started: before it tears down extensions, handlers, and routes it waits, in every domain, for the running occupancy-queue entry of an Optional or Exclusive domain and for every Concurrent `mount_ext` and `unmount_ext` execution in flight, each settling with its own outcome. Pending queue entries fail as they do at domain unregistration, each caller taking its own `fallback`. From the moment disposal begins, a new `mount_ext` or `unmount_ext` request in any domain is refused at once — it issues no acceptance command, takes its own `fallback`, and issues its settle command — and registering a domain once disposal has begun is refused, so no fresh domain opens. The promise resolves when teardown completes - `inst-me-registry-dispose-wait`
16. [x] - `p1` - An already-mounted success (`inst-me-already-mounted-complete`), a joined request (`inst-me-join-in-progress-mount`, `inst-me-queue-join-pending`, `inst-me-queue-join-running`), and a mount that finds its subject still the occupant at its turn (`inst-me-sole-occupant-at-turn`) never run Optional or Exclusive eviction; only a fresh mount runs the strategy below. In an Optional or Exclusive domain only the running entry changes occupancy, so a request arriving during an eviction is evaluated only after that change completes - `inst-me-no-rerun-eviction`
17. [x] - `p1` - The `activated` lifecycle stage is triggered exactly once, for the underlying physical mount only. It is never triggered for an already-mounted success (`inst-me-already-mounted-complete`), a mount that finds its subject still the occupant at its turn (`inst-me-sole-occupant-at-turn`), a joined request (`inst-me-join-in-progress-mount`, `inst-me-queue-join-pending`, `inst-me-queue-join-running`), or a request that failed before its entry started (`inst-me-queue-replace-pending`, `inst-me-queue-pending-timeout`, `inst-me-queue-domain-unregister`). A fresh mount of a subject that an earlier unmount or eviction removed (`inst-me-fresh-mount-after-unmount`, `inst-me-queue-fresh-mount-at-turn`) may trigger it again - `inst-me-activated-once`
18. [x] - `p1` - The Optional and Exclusive strategies read the domain's current mount set through the domain's own mounter, by a lookup private to the runtime; a Concurrent strategy needs no read - `inst-me-get-mounted`
19. [x] - `p1` - **MATCH** the domain's strategy - `inst-me-match-strategy`
    1. [x] - `p1` - **CASE** ConcurrentMountStrategy: create a new container for the extension and mount it; if mounting fails, destroy the container and propagate the error - `inst-me-concurrent`
    2. [x] - `p1` - **CASE** OptionalMountStrategy: **IF** a different extension is already mounted, unmount it and destroy its container before proceeding - `inst-me-optional-displace`
       1. [x] - `p1` - Already-mounted, joined, and still-occupant-at-turn requests are settled before this step (`inst-me-already-mounted-complete`, `inst-me-queue-join-pending`, `inst-me-queue-join-running`, `inst-me-sole-occupant-at-turn`); this branch is reached only for a fresh mount started as the running entry, and a direct strategy call that bypasses the prologue returns without change - `inst-me-optional-already-occupant`
       2. [x] - `p1` - Create a new container and mount the extension; if mounting fails, destroy the container and propagate the error - `inst-me-optional-mount`
    3. [x] - `p1` - **CASE** ExclusiveMountStrategy: **FOR EACH** extension currently mounted in this domain that is not the incoming extension, unmount and destroy its container (eviction) - `inst-me-exclusive-evict`
       1. [x] - `p1` - Already-mounted, joined, and still-occupant-at-turn requests are settled before this step (`inst-me-already-mounted-complete`, `inst-me-queue-join-pending`, `inst-me-queue-join-running`, `inst-me-sole-occupant-at-turn`); this branch is reached only for a fresh mount started as the running entry, and a direct strategy call that bypasses the prologue returns without change - `inst-me-exclusive-already-occupant`
       2. [x] - `p1` - Create a new container and mount the extension; if mounting fails, destroy the container and propagate the error - `inst-me-exclusive-mount`
20. [x] - `p1` - **IF** the domain's root was detached while the extension's own lifecycle mount was running (`inst-sd-clear-root-first`), do not place the container: unmount the extension's lifecycle again so it is not left mounted into a container outside any root, then fail the mount with the detached-root error, carrying a failure of that unmount as its cause. The strategy destroys the container as for any failed mount, and the next mount of the extension runs as a fresh mount - `inst-me-mount-root-detached`
21. [x] - `p1` - **IF** placing the container under the root or recording the extension in the mount set fails after the extension's own lifecycle mount has run, undo each part already done — remove the container from the DOM, drop the extension from the mount set, unmount the extension's lifecycle — and fail with the original error. The strategy destroys the container as for any failed mount - `inst-me-mount-rollback`
22. [x] - `p1` - Every physical unmount — an explicit unmount, an Optional displacement, an Exclusive eviction, or a slot detach — completes its teardown even when the extension's own lifecycle unmount fails, then fails with that lifecycle error; a later mount of the extension runs as a fresh mount - `inst-um-teardown-on-failure`
    1. [x] - `p1` - Deactivate the extension's bridge and release the container's connection to it - `inst-um-failure-bridge-released`
    2. [x] - `p1` - Remove the container from the DOM and the extension from the domain's mount set - `inst-um-failure-container-removed`
    3. [x] - `p1` - Destroy the container exactly once; a failure of that destroy does not replace the lifecycle error the unmount reports - `inst-um-failure-container-destroyed`
23. [x] - `p1` - **IF** the registry holding the domain was built with a router, the wrapper the runtime places around the domain's `mount_ext` handler and, in a domain that declares `unmount_ext`, around its `unmount_ext` handler commands that router through `reflect` (`cpt-frontx-dod-mfe-host-communication-router-port-contract`) with the domain's id, the domain's projected occupancy computed at the moment of the command (`inst-me-cmd-projection`), and a verb, at the two moments below. An action that fails admission at the mediator never reaches the wrapper and issues no command, and domain and MFE code neither place the wrapper nor reach the router through it - `inst-me-cmd-wrapper`
    1. [x] - `p1` - **ACCEPT**: when the request is placed — it takes its place in the occupancy queue (`inst-me-queue-place`), it is accepted in a Concurrent domain (`inst-me-cmd-concurrent-accept`), or it completes at once because its extension is already mounted (`inst-me-already-mounted-complete`) — and its history intent is `push` or `replace`, an absent intent meaning `push`, command the projected occupancy with that verb, synchronously within the call that delivered the request, with no await before the command, and before the request settles (`cpt-frontx-algo-mfe-host-communication-history-intent`) - `inst-me-cmd-accept`
       1. [x] - `p1` - **IF** the request's history intent is `none`, issue no command at acceptance - `inst-me-cmd-accept-none`
       2. [x] - `p1` - **IF** the request is refused — it is a mount whose extension is not admitted to the addressed domain (`inst-me-eligibility-check`), or it arrives while its Optional or Exclusive domain is being unregistered (`inst-me-queue-domain-unregister`), while its Concurrent domain is being unregistered (`inst-me-concurrent-domain-unregister`), or while the registry is being disposed (`inst-me-registry-dispose-wait`) — issue no command at acceptance - `inst-me-cmd-accept-refused`
    2. [x] - `p1` - **SETTLE**: every request that reached the wrapper commands the projected occupancy with `replace` exactly once, when its own settlement is reached, whatever its outcome and whatever its history intent: a request whose entry or Concurrent mount ran, a request completed at once as already mounted, a refused request, a joined request, a request replaced while pending (`inst-me-queue-replace-pending`), a request whose timer fired while pending (`inst-me-queue-pending-timeout`), and a request failed by its domain's unregistration while pending (`inst-me-queue-domain-unregister`). A request's settle command is computed after its entry has left the queue and any pending entry has been promoted; a replaced or unregistration-closed entry has left the queue when its callers' settle commands are computed, whereas a timed-out caller's entry has left only once its last caller has (`inst-me-queue-pending-timeout`), so while other callers remain it stays in the projection - `inst-me-cmd-settle`
       1. [x] - `p1` - A request's settlement is the settling of the wrapper's own handling of that request, not the mediator's per-action bound: a caller whose entry is running when the mediator's bound fires still has its settle command issued when the wrapper's handling of its request settles - `inst-me-cmd-settlement-own-handling`
    3. [x] - `p1` - Issue the settle command only after the wrapper has awaited the request's own settlement through an asynchronous call separate from the one that handles the request, so the command runs in a later turn than the request's delivery; a request refused synchronously, by an eligibility failure or a closed queue, issues its settle command after that await and never synchronously within the call that delivered it. Because the settle command runs in a later turn than the request's delivery, when the router dispatches the chains of one URL change in one synchronous loop, no settle command lands inside that loop - `inst-me-cmd-settle-async`
    4. [x] - `p1` - The runtime keeps no memory of what it has commanded: every command computes the projection afresh from the mount set and the occupancy queue or the Concurrent record, and a settle command is issued even when its projection is unchanged since an earlier command - `inst-me-cmd-no-memory`
    5. [x] - `p1` - The request's outcome and its chain's continuation, `next` on success and `fallback` on failure, are decided by the request's own execution; nothing in the chain waits on a command, and chain execution itself issues no command (`cpt-frontx-constraint-mfes-recursive-chain-execution`, `cpt-frontx-adr-action-dispatch-and-chaining`) - `inst-me-cmd-chain-independent`
24. [x] - `p1` - Compute the domain's projected occupancy — what the domain will hold once every request it has accepted completes as requested — starting from the domain's mount set at the moment of the command - `inst-me-cmd-projection`
    1. [x] - `p1` - **IF** the domain is Exclusive or Optional, apply to the mount set the queue's running entry and then its pending entry, where a mount of X makes the occupancy exactly [X] and an unmount of X removes X; the projection therefore never names two extensions - `inst-me-cmd-projection-queue`
    2. [x] - `p1` - **IF** the domain is Concurrent, apply to the mount set, for each extension holding a record (`inst-me-cmd-concurrent-record`), the operation that record holds: a mount adds the extension, an unmount removes it - `inst-me-cmd-projection-concurrent`
    3. [x] - `p1` - The projected occupancy is a duplicate-free list: the mount set in mount-set order, followed by the extensions the applied operations add, in acceptance order; a mount of an extension already in the list leaves it in place - `inst-me-cmd-projection-order`
    4. [x] - `p1` - The occupancy queue exposes to the wrapper a read of its running and pending entries, each as its operation and its subject; the read adds no public surface and changes nothing in the queue - `inst-me-cmd-queue-read`
25. [x] - `p1` - In a Concurrent domain, keep per extension a record of the latest accepted request for it that has not yet settled, holding that request's identity and its operation, a mount or an unmount - `inst-me-cmd-concurrent-record`
    1. [x] - `p1` - A Concurrent mount request is accepted when it passes the eligibility check (`inst-me-eligibility-check`) and is handed to the domain's Concurrent mount path, whether it starts a mount, joins one in progress (`inst-me-join-in-progress-mount`), or completes at once because its extension is already mounted (`inst-me-already-mounted-complete`), which is an acceptance like any other, its acceptance command issued per its intent; a Concurrent unmount request is accepted when it is handed to the domain's Concurrent unmount path, before it waits on any mount in progress (`inst-um-await-mount-settle`) - `inst-me-cmd-concurrent-accept`
    2. [x] - `p1` - Set the record at acceptance, for every history intent including `none` and for the already-mounted short-circuit, whose record is cleared at its own settle like any other, replacing any earlier record for that extension, before the acceptance command's projection is computed - `inst-me-cmd-record-set`
    3. [x] - `p1` - When a request's settlement is reached, clear its extension's record only while that record still holds this request, before the request's settle command is computed; a request that settles after a later request for the same extension was accepted leaves the later request's record in place - `inst-me-cmd-record-clear`
26. [x] - `p1` - A request for which the domain's strategy never runs issues the same commands as any other request and none of its own beyond them — its settle command once, preceded by its acceptance command when the domain accepted it with `push` or `replace`: a mount of an extension that is already mounted (`inst-me-already-mounted-complete`, `inst-me-sole-occupant-at-turn`), a request that joins an entry already queued or running, a pending request replaced by a later one (`inst-me-queue-replace-pending`), a pending request whose timer fires before it starts (`inst-me-queue-pending-timeout`), a request refused because its domain is being unregistered (`inst-me-queue-domain-unregister`), a request that fails eligibility (`inst-me-eligibility-check`, `inst-me-queue-eligibility-at-turn`) or fails because the unmount it waited on failed (`inst-me-fail-after-unmount-failure`, `inst-me-queue-await-unmount-at-turn`), and an unmount that completes without change because its subject is absent at its turn or the mount it waited on failed (`inst-um-queue-absent-noop`, `inst-um-after-mount-failure`) - `inst-me-cmd-settle-unexecuted`
27. [x] - `p1` - An occupant the strategy releases while executing a mount — an Optional displacement (`inst-me-optional-displace`) or an Exclusive eviction (`inst-me-exclusive-evict`) — is part of that execution and issues no command of its own. Occupants nested inside a departing extension's own registry — the occupants of domains that extension hosts, whose slots detach as it unmounts (`cpt-frontx-algo-extension-domain-governance-slot-detach`) — are released inside that registry as part of the departing host's execution: the nested registry issues no command for them and none dispatches an `unmount_ext` - `inst-me-no-command-nested`
28. [x] - `p1` - Mount or unmount events outside an action execution — a slot detach (`inst-sd-no-command`), the unmount performed by unregistering a mounted extension, the releases of domain unregistration, and terminal disposal of a registry — issue no command; only the release notifications that free what the router admitted and, at a slot detach, the `stopDomain` call reach the router. A pending request that the domain's unregistration fails is a request, not such an event, and issues its settle command (`inst-me-cmd-settle`) - `inst-me-no-command-outside-action`
29. [x] - `p1` - **IF** the registry holding the domain was built with no router, every request runs exactly as above and no command is issued to anyone - `inst-me-no-command-standalone`
30. [x] - `p1` - **RETURN** mount outcome - `inst-me-return`

### Slot Attach

- [x] `p2` - **ID**: `cpt-frontx-algo-extension-domain-governance-slot-attach`

**Input**: A registered domain whose slot hands its mounter a root element through `attach(root)`; the router injected into the registry holding the domain, or no router.

**Output**: The domain holds that root, under which later mounts place their containers; where a router is injected, the router has been told to start the domain.

**Steps**:
1. [x] - `p1` - Keep the root element as the domain's root - `inst-sa-keep-root`
2. [x] - `p1` - **IF** the registry holding the domain was built with a router, call the router's `startDomain(domainId)` once the domain's root is attached, so the router starts observing the domain's part of the URL; a registry built with no router makes no such call - `inst-sa-start-domain`
3. [x] - `p1` - **RETURN** the root attached - `inst-sa-return`

### Slot Detach Teardown

- [x] `p2` - **ID**: `cpt-frontx-algo-extension-domain-governance-slot-detach`

**Input**: A registered domain whose slot releases its root element (the host element the domain places containers under goes away), while the domain itself stays registered with its strategy and container hooks; the router injected into the registry holding the domain, or no router.

**Output**: The domain has no root and every extension that was in its mount set is unmounted with its container destroyed; the detach either completes, or fails with the single unmount failure unchanged, or fails with one aggregate error that carries every unmount failure.

**Steps**:
1. [x] - `p1` - **IF** the registry holding the domain was built with a router, call the router's `stopDomain(domainId)` as the first statement of the detach, synchronously, before the root is cleared and before any extension is unmounted; a registry built with no router makes no such call - `inst-sd-stop-domain`
   1. [x] - `p1` - **IF** the router's `stopDomain` throws, log the error and continue the detach: the failure never interrupts the detach, which still clears the root and unmounts every extension - `inst-sd-stop-domain-failure`
2. [x] - `p1` - Clear the domain's root next, before reading the mount set, so a mount whose lifecycle mount settles during the detach is never placed under the departing root and is rolled back instead (`inst-me-mount-root-detached`) - `inst-sd-clear-root-first`
3. [x] - `p1` - **FOR EACH** extension in the domain's mount set, in mount-set order - `inst-sd-each-occupant`
   1. [x] - `p1` - Unmount it as any physical unmount does, joining an unmount of the same extension already in progress rather than starting a second one; a mount request for it that arrives meanwhile waits for this unmount (`inst-me-await-unmount-settle`) - `inst-sd-unmount-occupant`
   2. [x] - `p1` - Destroy its container exactly once, through the container hooks of the strategy that created it, including when the unmount fails (`inst-um-failure-container-destroyed`) - `inst-sd-destroy-container`
   3. [x] - `p1` - **IF** this unmount fails, record the failure and continue with the next extension - `inst-sd-continue-on-failure`
4. [x] - `p1` - **IF** exactly one unmount failed, **RETURN** the detach as failed with that failure unchanged - `inst-sd-single-failure`
5. [x] - `p1` - **IF** more than one unmount failed, **RETURN** the detach as failed with one aggregate error that carries every failure in mount-set order - `inst-sd-aggregate-failure`
6. [x] - `p1` - A slot detach is resource cleanup, not an occupancy action: the unmounts it performs dispatch no `unmount_ext` and issue no command to any router - `inst-sd-no-command`
7. [x] - `p1` - **RETURN** detach completed - `inst-sd-return`

## 4. States (CDSL)

### Extension Admission Lifecycle

- [x] `p1` - **ID**: `cpt-frontx-state-extension-domain-governance-admission`

**States**: SUBMITTED, CONTRACT_MATCHED, ADMITTED, MOUNTED, REJECTED

**Initial State**: SUBMITTED

**Transitions**:
1. [x] - `p1` - **FROM** SUBMITTED **TO** CONTRACT_MATCHED **WHEN** all three subset-rule containment checks pass (no missing properties, no unsupported actions, no unhandled domain actions) - `inst-adm-t1`
2. [x] - `p1` - **FROM** SUBMITTED **TO** REJECTED **WHEN** any subset-rule containment check fails (contract matching returns at least one error) - `inst-adm-t2`
3. [x] - `p1` - **FROM** CONTRACT_MATCHED **TO** ADMITTED **WHEN** the extension's state is stored and its `init` lifecycle stage is triggered alongside that storage — the trigger accompanies the transition and the transition does not wait for the triggered chain to complete; the mount strategy executes occupancy and holds no accept/veto authority of its own - `inst-adm-t3`
4. [x] - `p1` - **FROM** CONTRACT_MATCHED **TO** REJECTED **WHEN** the internal admission guard finds no registered handler covering the entry's type (defensive path; admission normally proceeds after contract match) - `inst-adm-t4`
5. [x] - `p1` - **FROM** ADMITTED **TO** MOUNTED **WHEN** the domain's strategy mount execution completes without error; the `activated` lifecycle stage is triggered alongside that completion and the transition does not wait for the triggered chain to complete - `inst-adm-t5`
6. [x] - `p1` - **FROM** ADMITTED **TO** REJECTED **WHEN** the strategy mount execution fails (error from mounter or container hooks) - `inst-adm-t6`
7. [x] - `p1` - A stage's chains still executing when its accompanying transition completes is expected: each chain executes recursively (`cpt-frontx-constraint-mfes-recursive-chain-execution`), and a transition owes a stage's chain no window and no ordering guarantee relative to itself - `inst-adm-t7`
8. [x] - `p1` - Failure of a stage's chain never moves this state machine; only the strategy's own mount execution outcome decides ADMITTED → MOUNTED versus ADMITTED → REJECTED - `inst-adm-t8`
9. [x] - `p1` - A mount request that completes successfully immediately because the extension is already mounted (`inst-me-already-mounted-complete`), or whose entry finds the extension still its domain's occupant at its turn (`inst-me-sole-occupant-at-turn`), shares the extension's existing ADMITTED→MOUNTED transition and its `activated` trigger. A request that joins an entry shares that entry's underlying ADMITTED→MOUNTED or ADMITTED→REJECTED transition and, on success, its `activated` trigger. A request that fails before its entry starts (replaced, timed out while pending, or its domain unregistered) moves no state. None of these requests produces an additional transition or an additional `activated` trigger of its own. A fresh mount of an extension that an earlier unmount or eviction removed is not covered by this item: it is an ordinary ADMITTED→MOUNTED transition (`inst-adm-t5`) and triggers `activated` again - `inst-adm-t9`
10. [x] - `p1` - **FROM** MOUNTED **TO** ADMITTED **WHEN** the extension is unmounted (displaced by OptionalMountStrategy, evicted by ExclusiveMountStrategy, or otherwise unmounted): the extension stays admitted/registered, it is no longer mounted - `inst-adm-t10`
11. [x] - `p1` - A fresh mount issued from ADMITTED after such an unmount re-enters MOUNTED under the same ADMITTED→MOUNTED transition (`inst-adm-t5`), so the `activated` lifecycle stage may fire again - `inst-adm-t11`

### Extension Domain Cardinality Lifecycle

- [x] `p2` - **ID**: `cpt-frontx-state-extension-domain-governance-cardinality`

**States**: UNVALIDATED, VALIDATED, ACTIVE, REJECTED

**Initial State**: UNVALIDATED

**Transitions**:
1. [x] - `p1` - **FROM** UNVALIDATED **TO** VALIDATED **WHEN** the domain's declared lifecycle actions satisfy the cardinality matrix row for the selected mount strategy (every required action present and no forbidden action declared) - `inst-card-t1`
2. [x] - `p1` - **FROM** UNVALIDATED **TO** REJECTED **WHEN** the domain's declared lifecycle actions violate the cardinality matrix row (a required action missing, or a forbidden action declared) or the strategy is unrecognized - `inst-card-t2`
3. [x] - `p1` - **FROM** VALIDATED **TO** ACTIVE **WHEN** the domain is successfully registered in the MFE Registry with its strategy as the mount executor - `inst-card-t3`

## 5. Definitions of Done

### Contract Enforcement at Admission

- [x] `p1` - **ID**: `cpt-frontx-dod-extension-domain-governance-contract-enforcement`

The system **MUST** run subset-rule contract matching on every extension before it is admitted into any domain, applying the three containment rules and the infrastructure-lifecycle-action exemption, and reject any extension whose entry fails any rule with an error that names the specific missing property or unsupported action.

**Implements**:
- `cpt-frontx-flow-extension-domain-governance-admission`
- `cpt-frontx-algo-extension-domain-governance-contract-matching`

**Covers (PRD)**:
- `cpt-frontx-fr-mfe-extension-domain-governance`

**Constraints**: `cpt-frontx-constraint-mfes-no-layout-domain-values`

**Touches**:
- API: N/A (internal runtime admission path)
- DB: N/A
- Entities: Extension, ExtensionDomain

### Cardinality Matrix Enforcement at Domain Registration

- [x] `p1` - **ID**: `cpt-frontx-dod-extension-domain-governance-cardinality-enforcement`

The system **MUST** reject any domain registration whose declared lifecycle actions are inconsistent with the cardinality matrix row for the domain's selected mount strategy, producing an error that names the violated rule: the required action the declaration omits, or the forbidden action it declares. The matrix is per row: Concurrent and Optional require both `mount_ext` and `unmount_ext`, and Exclusive requires `mount_ext` and forbids `unmount_ext`, so a domain declares `unmount_ext` exactly when an explicit request can empty its occupancy. The system **MUST** reject any domain backed by an unrecognized strategy.

**Implements**:
- `cpt-frontx-flow-extension-domain-governance-admission`
- `cpt-frontx-algo-extension-domain-governance-strategy-cardinality`

**Covers (PRD)**:
- `cpt-frontx-fr-mfe-extension-domain-governance`

**Constraints**: `cpt-frontx-constraint-mfes-no-layout-domain-values`

**Touches**:
- API: N/A (internal runtime admission path)
- DB: N/A
- Entities: Extension, ExtensionDomain

### Default-Deny Posture and Security NFR

- [x] `p1` - **ID**: `cpt-frontx-dod-extension-domain-governance-default-deny`

The system **MUST** deny extension admission by default: an extension is only mounted into a domain after both contract matching and cardinality validation succeed; no extension gains access to a domain's declared grants without passing the full admission sequence. This satisfies `cpt-frontx-nfr-security` and the default-deny posture described in `cpt-frontx-principle-default-deny-admission`.

**Implements**:
- `cpt-frontx-flow-extension-domain-governance-admission`
- `cpt-frontx-state-extension-domain-governance-admission`

**Covers (PRD)**:
- `cpt-frontx-fr-mfe-extension-domain-governance`

**Constraints**: `cpt-frontx-constraint-mfes-no-layout-domain-values`

**Touches**:
- API: N/A (internal runtime admission path)
- DB: N/A
- Entities: Extension, ExtensionDomain

### URL Commands From the Domain Handler Wrappers

- [x] `p1` - **ID**: `cpt-frontx-dod-extension-domain-governance-url-commands`

The system **MUST**, where the registry holding a domain was built with a router, command that router through `reflect` from the wrappers it places around the domain's `mount_ext` handler and, in a domain that declares it, its `unmount_ext` handler, each command naming the domain's id, the domain's projected occupancy computed at the moment of the command, and a verb. At acceptance — queue placement, Concurrent acceptance, or completion at once as already mounted — a request whose history intent is `push` or `replace`, an absent intent meaning `push`, **MUST** issue one command with that verb, synchronously within the call that delivered the request, with no await before the command, and before the request settles; a request carrying `none` and a refused request (a mount whose extension is not admitted, or any request arriving while its Concurrent domain is being unregistered, or while its Optional or Exclusive domain is being unregistered, or while the registry is being disposed) **MUST NOT** issue an acceptance command. Every request that reached the wrapper — refused, joined, completed at once, replaced while pending, timed out while pending, or failed by its domain's unregistration while pending included — **MUST** issue one command with `replace` once its own settlement is reached, and **MUST** issue it only after awaiting that settlement through an asynchronous call separate from the one that handles the request, so that, when the router dispatches the chains of one URL change in one synchronous loop, no settle command lands inside that loop, a synchronously refused request included; a request's settle command is computed after its entry has left the queue and any pending entry has been promoted, and a request's settlement is the settling of the wrapper's own handling of it, not the mediator's per-action bound. The projected occupancy **MUST** be computed afresh for every command: in an Exclusive or Optional domain, the mount set with the occupancy queue's running entry and then its pending entry applied, a mount of X giving [X] and an unmount of X removing X, read through an internal read of the queue's running and pending entries that adds no public surface, so it never names two extensions; in a Concurrent domain, the mount set with each extension's record of the latest accepted, unsettled request applied, a record set at that request's acceptance for every history intent and cleared when that request settles while it is still the latest. The projected occupancy is a duplicate-free list, in mount-set order, followed by the extensions the applied operations add in acceptance order. The runtime **MUST** keep no memory of what it has commanded. A request's outcome and its chain's continuation, `next` on success and `fallback` on failure, **MUST** be decided by the request's own execution; nothing in the chain waits on a command, and chain execution issues no command. A displacement, an eviction, occupants nested inside a departing extension's own registry, a slot detach, an unregistration, and terminal disposal **MUST NOT** issue a command of their own, and with no router the system **MUST** issue no command. An Exclusive domain declares no `unmount_ext`, so no unmount wrapper exists in it.

**Implements**:
- `cpt-frontx-algo-extension-domain-governance-mount-execution`
- `cpt-frontx-algo-extension-domain-governance-slot-detach`

**Constraints**: `cpt-frontx-constraint-mfes-router-port`, `cpt-frontx-constraint-mfes-recursive-chain-execution`

**Touches**:
- API: N/A (internal runtime mount path)
- DB: N/A
- Entities: Action / ActionsChain, ExtensionDomain, Abstract router
- Sequence: `cpt-frontx-mfes-seq-routed-mount-occupant-value`

### Domain Start and Stop at Root Attach and Detach

- [x] `p1` - **ID**: `cpt-frontx-dod-extension-domain-governance-domain-start-stop`

The system **MUST**, where the registry holding a domain was built with a router, call the router's `startDomain(domainId)` in the domain's mounter `attach(root)`, once the domain's root is attached, and **MUST** call the router's `stopDomain(domainId)` as the first statement of the domain's mounter `detach()`, synchronously, before the root is cleared and before the mass unmount; a `stopDomain` that throws **MUST** be logged and the detach **MUST** continue. A registry built with no router **MUST** make neither call.

**Implements**:
- `cpt-frontx-algo-extension-domain-governance-slot-attach`
- `cpt-frontx-algo-extension-domain-governance-slot-detach`

**Constraints**: `cpt-frontx-constraint-mfes-router-port`

**Touches**:
- API: N/A (internal runtime mounter path)
- DB: N/A
- Entities: ExtensionDomain, Abstract router

## 6. Acceptance Criteria

- [x] Contract matching rejects an extension whose required property is absent from the domain's shared-property set, and the error names the missing property.
- [x] Contract matching rejects an extension that does not support an action the domain requires of its occupants, and the error names the unsupported action.
- [x] Contract matching rejects an extension that requires a domain action (excluding infrastructure lifecycle actions) the domain does not support, and the error names the unhandled action.
- [x] Infrastructure lifecycle actions (load_ext, mount_ext, unmount_ext) appearing in an entry's required-domain-actions set do not by themselves cause contract matching to fail.
- [x] A domain composed with ConcurrentMountStrategy that declares both mount_ext and unmount_ext is accepted; one that omits either is rejected at registration.
- [x] A domain composed with OptionalMountStrategy that declares both mount_ext and unmount_ext is accepted; one that omits either is rejected at registration.
- [x] A domain composed with ExclusiveMountStrategy that declares mount_ext without unmount_ext is accepted; one that omits mount_ext is rejected at registration.
- [x] A domain composed with ExclusiveMountStrategy that declares unmount_ext is rejected at registration, and the error names unmount_ext as the forbidden action.
- [x] A domain backed by an unrecognized strategy instance is rejected at registration.
- [x] No extension-domain name, placement constant, or application-specific vocabulary appears in any admission, matching, or cardinality enforcement code path (satisfies `cpt-frontx-constraint-mfes-no-layout-domain-values`).
- [x] An extension that passes all admission checks is mounted according to the domain's strategy: ConcurrentMountStrategy mounts side by side; OptionalMountStrategy displaces any prior occupant; ExclusiveMountStrategy evicts all other occupants.
- [x] In a Concurrent domain, a mount request for an extension already mounted completes successfully immediately, without container creation or an additional `activated` trigger; a mount request for an extension whose mount is in progress joins that mount and settles with its outcome; a mount request arriving while the extension is being unmounted waits for that unmount to settle before re-evaluating; an unmount request arriving while the extension's mount is in progress waits for that mount to settle, then unmounts it, leaving it absent. A Concurrent domain keeps no occupancy queue, so mounts of two different extensions there run independently and neither replaces the other.
- [x] A mount request naming a domain the extension is not admitted to fails.
- [x] In an Optional or Exclusive domain, a mount request for an extension already mounted completes successfully immediately while the occupancy queue is empty and the domain is not being unregistered, without eviction, container creation, or an additional `activated` trigger; while the queue is not empty, it takes its place in the queue and, if the extension is still the occupant at its turn, succeeds without container creation, mount-set change, or an additional `activated` trigger.
- [x] Rapid navigation: in an Exclusive domain, and equally in an Optional domain, with mount(A) running, accepting mount(B), mount(C) and mount(D) in turn ends with D as the domain's sole occupant; only A and D are physically mounted, and B and C never start.
- [x] Replacement: a request that replaces the pending entry makes every caller of the replaced entry, including callers that joined it, fail and take its own `fallback`; the replaced entry never starts; the outcome is a boolean failure.
- [x] Joining: a mount(A) that matches the pending mount(A) joins it; a mount(A) that matches the running mount(A) while a different pending entry exists replaces that pending entry, whose callers take their fallbacks, and joins the running entry; a mount(A) never joins an unmount(A).
- [x] Pending timeout: when a caller's own timer fires while its entry is pending, that caller alone fails and takes its own `fallback`; the entry stays while other callers remain, leaves the queue when its last caller has left, and never starts. The timer's value is the action's declared timeout, otherwise the domain's `defaultActionTimeout`, given by the same rule the mediator uses.
- [x] The running entry is never replaced by a newer request and never interrupted by a caller's timer; when it finishes, its callers continue with `next` on success and with `fallback` on failure, and the pending entry then starts.
- [x] Eligibility at turn: in an Optional or Exclusive domain, when an entry starts and its subject is no longer admitted to the domain, the entry fails without container creation, mount-set change, or an `activated` trigger, and each of its callers takes its own `fallback`.
- [x] Optional unmount: an unmount(A) joins an identical pending unmount(A); it replaces a different pending entry, including a pending mount(A), whose callers take their fallbacks; a mount(A) arriving while unmount(A) is pending replaces that unmount, whose callers take their fallbacks.
- [x] Optional unmount: an unmount(A) accepted while mount(A) is running waits behind it; if that mount succeeded, the unmount leaves A absent; if that mount failed, the unmount succeeds without change.
- [x] Optional unmount: an unmount of a subject that is absent at its turn succeeds without change.
- [x] Unregister: unregistering an Optional or Exclusive domain whose queue holds a running and a pending entry makes each caller of the pending entry take its own `fallback`; the pending entry never starts, and the running entry is not interrupted: it finishes with its own outcome, its callers continue with `next` on success, and only then are the domain's extensions released. A request accepted while the unregistration is in progress, including a mount of an extension that is still mounted, fails at once without entering the queue and takes its own `fallback`; when the running entry finishes, nothing is promoted.
- [x] Concurrent unregister: with a Concurrent mount of extension A in flight, unregistering the domain does not interrupt that mount; the mount completes with its own outcome, its chain takes `next` on success, and A is released only after the mount has settled.
- [x] Registry dispose: `dispose()` returns a promise; with a mount in flight at dispose, the mount completes with its own outcome; a running queue entry likewise finishes with its own outcome; a pending queue entry fails and takes its own `fallback`; a `mount_ext` or `unmount_ext` request arriving in any domain after disposal began is refused at once, takes its own `fallback`, and issues no acceptance command; registering a domain once disposal has begun is refused; the promise resolves after teardown completes.
- [x] Overlapping unregistrations: with two unregistrations of one domain pending and the first failing, a request arriving before the second completes is refused at once and takes its own `fallback`.
- [x] Concurrent unregister, arrival: during a Concurrent domain's unregistration, a new mount arriving after the unregistration began takes its own `fallback`, issues no acceptance command, issues one settle command, and is never mounted; the unregistration resolves once the work that started before has settled.
- [x] Slot detach: detaching a domain's slot unmounts every extension in its mount set and destroys each one's container exactly once through the strategy's container hooks; the domain is left with no root and an empty mount set.
- [x] Slot detach: a mount whose lifecycle mount settles while the slot is being detached is not placed under the departing root; the extension's lifecycle is unmounted again, the mount fails, its container is destroyed, and the next mount of that extension runs its lifecycle mount again.
- [x] Slot detach: when one extension's unmount fails, the detach still unmounts every other extension; one failure is reported unchanged, and several failures are reported as one aggregate error carrying each of them.
- [ ] With a router test double injected, attaching a domain's root calls `startDomain` with the domain's id once the root is attached, and detaching it calls `stopDomain` with the domain's id synchronously, before any extension of the domain is unmounted, and a `stopDomain` that throws is logged while the detach continues (`router-port-contract.test.ts`); a registry built with no router makes neither call.
- [x] In an Optional or Exclusive domain, a mount request for an extension whose slot-detach unmount is in flight waits for that unmount to settle and never reports success on the strength of the mount-set record the unmount removes; if that unmount failed, the request fails.
- [x] Mount rollback: when placing the container or recording the extension in the mount set fails after the extension's lifecycle mount has run, the container leaves the DOM, the extension is not in the mount set, its lifecycle is unmounted, and the mount fails with the original error.
- [x] Unmount failure: when an extension's own lifecycle unmount fails, its bridge is still deactivated, its container still leaves the DOM and is destroyed exactly once, the extension leaves the mount set, and the unmount fails with the lifecycle error; a later mount of the extension runs as a fresh mount.
- [x] No route-name validation, route-token derivation, or route-uniqueness check appears in the runtime's domain or extension admission path; a domain or extension that declares a `route` is admitted or rejected by the runtime exactly as it would be without one, and the `route` reaches an injected router unchanged.
- [x] With a router test double injected, a fresh mount carrying `push` in an Exclusive, an Optional, and a Concurrent domain issues one acceptance command naming the domain and its projected occupancy with `push` before the mount finishes, and one settle command with `replace` once the request settles, whether the mount succeeds or fails, carrying nothing of the action beyond the domain's id, the extensions, and the verb; an Exclusive mount of B that evicts A and then fails issues a settle command naming no extension, because B's entry has left the queue before the projection is computed.
- [x] An explicit `unmount_ext` carrying `push` of a mounted extension in an Optional and in a Concurrent domain issues one acceptance command whose projected occupancy omits that extension, and one settle command with `replace` once it settles; an Exclusive domain declares no `unmount_ext` and registers no handler for it, so no unmount wrapper exists there and no command is issued for an `unmount_ext` addressed to it.
- [x] A fresh mount of B that displaces A in an Optional domain, or evicts A in an Exclusive domain, issues commands whose projected occupancy names B alone, at acceptance and, when the mount succeeds, at settle; no command names A and B together, and the displacement or eviction issues no command of its own.
- [x] A fresh mount that replaces an extension which itself hosts domains issues its commands in the parent registry only; the nested occupants released by that teardown issue no command in the nested registry and dispatch no `unmount_ext`.
- [x] Each request for which the domain's strategy never runs — a mount of an already-mounted extension, a request joining a queued or running entry, a pending request replaced by a later one, a pending request whose timer fires, a request refused during domain unregistration, a mount whose extension is not admitted, an Optional-domain unmount whose subject is absent at its turn, and a Concurrent-domain unmount whose awaited mount failed — issues exactly one settle command with `replace` and no command beyond its acceptance command; a burst of `push` mounts A, B, C, D in an Exclusive domain issues an acceptance command for each of A, B, C and D naming that extension alone, every settle command of the burst names exactly one extension, and once D is mounted the last command names D.
- [x] A slot detach, and the unmount performed by unregistering a mounted extension, issue no command.
- [x] Terminal disposal of a registry holding mounted extensions issues no command to its router; only the release notifications reach it.
- [x] The history intent itself never reaches the router: every command carries only the domain's id, the projected occupancy, and the verb, and the settle command's verb is `replace` whatever the request's intent.
- [x] A registry built with no router mounts and unmounts in every strategy and issues no command.
- [x] With a router test double injected, a request the domain places in its occupancy queue, accepts in a Concurrent domain, or completes at once as already mounted issues its acceptance command synchronously within the call that delivered the request, with no await before the command, and before the request settles: with `push` for a `push` or absent intent, with `replace` for `replace`, and none for `none`; a mount whose extension is not admitted to the addressed domain, or a request whose Optional or Exclusive domain is being unregistered, is refused at once and issues no acceptance command.
- [x] Every request that reaches the wrapper issues exactly one settle command naming the projected occupancy with `replace` after its own settlement — a refused request, a joined one, one replaced while pending, one whose pending timer fired, and one failed by its domain's unregistration while pending included — and issues it even when the projection is unchanged since an earlier command.
- [x] In an Exclusive and in an Optional domain no command names two extensions: with a mount of A running and a mount of B accepted behind it, the commands issued once B is accepted, and A's settle command, name B alone; in an Optional domain, with a mount of A running and an unmount of A pending behind it, the commands issued once the unmount is accepted name no extension.
- [x] In a Concurrent domain, with a mount of A in flight, an `unmount_ext` of A accepted with `push` issues an acceptance command that omits A, and the settle command of that mount, issued while the unmount has not yet settled, omits A as well; a `mount_ext` of A accepted while an unmount of A has not yet settled issues commands that name A, including the unmount's own settle command; once the latest accepted request for A settles, its record is cleared and the projection follows the mount set.
- [x] In an Optional or Exclusive domain, with two callers joined to one pending mount of B, one caller's own timer fires while B is pending: that caller fails alone, and its settle command still names B, because B's entry is still in the queue.
- [x] In a Concurrent domain with A and B mounted, in that order, a mount of C is accepted and then a mount of A is accepted: the commands name A, B, C in that order, with no duplicate.
- [x] In a Concurrent domain, an `unmount_ext` of A carrying `none`, accepted while a mount of A is in flight, issues no acceptance command, and the in-flight mount's settle command omits A.
- [x] In a Concurrent domain, a mount of an already-mounted A sets its record and clears it at its own settle; an unmount of A accepted after it is not cleared by that short-circuit's settle, so the commands omit A until the unmount settles.
- [x] With a router test double that dispatches the `none` chains of one URL change in one synchronous loop and records the commands it receives during that loop, it receives no settle command during the loop, the settle command of a request refused synchronously included.
- [x] With a router test double injected, a request's outcome and the execution of its chain's `next` or `fallback` are the same as in a registry built with no router, and neither waits on any command.
- [x] With a router test double injected, an Optional unmount naming a subject that is not admitted to the domain is placed in the occupancy queue and issues its acceptance command per its intent, fails at its turn (`inst-me-queue-eligibility-at-turn`), and issues its settle command.
- [x] With a router test double injected, a caller whose entry is running when the mediator's per-action bound fires still has its settle command issued when the wrapper's own handling of its request settles.
