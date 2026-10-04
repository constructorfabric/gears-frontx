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
  - [Slot Detach Teardown](#slot-detach-teardown)
- [4. States (CDSL)](#4-states-cdsl)
  - [Extension Admission Lifecycle](#extension-admission-lifecycle)
  - [Extension Domain Cardinality Lifecycle](#extension-domain-cardinality-lifecycle)
- [5. Definitions of Done](#5-definitions-of-done)
  - [Contract Enforcement at Admission](#contract-enforcement-at-admission)
  - [Cardinality Matrix Enforcement at Domain Registration](#cardinality-matrix-enforcement-at-domain-registration)
  - [Default-Deny Posture and Security NFR](#default-deny-posture-and-security-nfr)
  - [Settled-Action Report From the Domain Handler Path](#settled-action-report-from-the-domain-handler-path)
- [6. Acceptance Criteria](#6-acceptance-criteria)

<!-- /toc -->

- [ ] `p1` - **ID**: `cpt-frontx-featstatus-extension-domain-governance`
## 1. Feature Context

- [ ] `p2` - `cpt-frontx-feature-extension-domain-governance`

### 1.1 Overview

Governs extension-domain occupancy through composable named mount strategies and a cardinality matrix, admitting extensions only by subset-rule contract matching with the scoped infrastructure-lifecycle-action exemption — realizing default-deny admission — and reporting each executed `mount_ext` or `unmount_ext` once, from the domain's own handler path, to the router injected into the registry holding the domain.

### 1.2 Purpose

This feature specifies the admission lifecycle that decides whether a given extension may occupy a given domain and, once admitted, which occupancy behavior the domain enforces. It covers:

- Multi-occupant domain support through composable named strategies (`cpt-frontx-fr-mfe-multi-occupant-domain`).
- Type-aware contract matching that validates structural capability and property compatibility before any extension is admitted (`cpt-frontx-fr-mfe-type-validation`).
- A security-anchored default-deny posture enforced at the admission boundary (`cpt-frontx-nfr-security`).
- The one settled-action report per executed `mount_ext` or `unmount_ext`, made from the domain's handler path before the chain continues, which lets an injected router derive the domain's occupancy and keep the URL in agreement with it, while every request absorbed before execution, every slot detach, and every unregistration reports nothing (`cpt-frontx-constraint-mfes-router-port`, `cpt-frontx-adr-extension-domain-occupancy`).

Out of scope here: routing identity and the page-wide uniqueness of routed-domain routes, which belong to the injected router and reach it through the registry's registration notifications (`cpt-frontx-algo-mfe-registry-router-admission`); the router port's member contract and the history intent (`cpt-frontx-feature-mfe-host-communication`).

The feature realizes the design principle that nothing is granted until explicitly validated (`cpt-frontx-principle-default-deny-admission`).

**Requirements**: `cpt-frontx-fr-mfe-multi-occupant-domain`, `cpt-frontx-fr-mfe-type-validation`, `cpt-frontx-nfr-security`

**Principles**: `cpt-frontx-principle-default-deny-admission`

### 1.3 Actors

| Actor | Role in Feature |
|-------|-----------------|
| `cpt-frontx-actor-project-developer` | Defines extension domains (selecting a mount strategy), registers extensions into those domains, and observes admission outcomes. |

### 1.4 References

- **PRD**: [PRD.md](../../../../../architecture/PRD.md)
- **Design**: [DESIGN.md](../../DESIGN.md)
- **ADR 0009**: [ADR/0009-extension-domain-occupancy.md](../../../../../architecture/ADR/0009-extension-domain-occupancy.md)
- **ADR 0036**: [ADR/0036-extension-routing-port.md](../../../../../architecture/ADR/0036-extension-routing-port.md)
- **Dependencies**:
  - `cpt-frontx-feature-mfe-registry` — admission and mount strategies act on registry-resolved extensions; domain registration is an MFE Registry concern.
  - `cpt-frontx-feature-gts-type-provider` — action–behavior consistency validation at admission uses type-of resolution from the GTS provider.
  - `cpt-frontx-feature-mfe-host-communication` — the one per-action timeout rule (`inst-resolve-timeout` in `cpt-frontx-algo-mfe-host-communication-mediator-dispatch`) is the rule the occupancy queue uses for each caller's timer; the router port contract (`cpt-frontx-dod-mfe-host-communication-router-port-contract`) supplies the `reportSettled` member the settled-action report is made through.

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
5. [x] - `p1` - **IF** a router is injected into the registry, System presents the domain declaration, any declared `route` carried uninterpreted, to that router before the domain becomes durable (`inst-algo-ra-present-domain` in `cpt-frontx-algo-mfe-registry-router-admission`); the runtime itself neither validates the route nor checks it against any other domain - `inst-domain-router-admission`
   1. [x] - `p1` - **IF** the router rejects the domain, System rejects the domain registration with the router's error, leaving the domain registered nowhere in the registry, and **RETURN** domain registration failure - `inst-domain-router-reject`
   2. [x] - `p1` - **IF** the router admits the domain but its subsequent type-system registration fails, System releases the router admission (`inst-domain-type-register` in `cpt-frontx-algo-mfe-registry-router-admission`) before rejecting the domain registration with a `DomainValidationError`, leaving the domain registered nowhere in the registry and the router free to admit a corrected retry under the same domain id, and **RETURN** domain registration failure - `inst-domain-type-register-reject`
6. [x] - `p1` - System registers the domain with its strategy instance as the mount executor - `inst-domain-registered`
7. [x] - `p1` - Developer registers an extension entry into the registry (via `cpt-frontx-component-mfe-runtime`), declaring the entry's required properties, supported capabilities, and required domain capabilities - `inst-register-extension`
8. [x] - `p1` - System runs subset-rule contract matching between the extension entry and the target domain as part of that registration — before any mount action is issued - `inst-contract-match`
9. [x] - `p1` - **IF** a router is injected into the registry and the extension passed every admission check of the registration, System presents the extension declaration, any declared `route` carried uninterpreted, to that router before the extension becomes durable (`inst-algo-ra-present-extension` in `cpt-frontx-algo-mfe-registry-router-admission`); the runtime itself derives no route token and checks no route against any sibling - `inst-extension-router-admission`
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

**Output**: The domain is either accepted with its strategy instance as the mount executor, or rejected with the specific violated cardinality rule named.

**Steps**:
1. [x] - `p1` - Identify the mount strategy instance composed inside the domain's implementation factory - `inst-sc-identify-strategy`
   1. [x] - `p1` - **IF** no MountStrategy instance was captured by the domain implementation, **RETURN** domain rejected with a missing-strategy error - `inst-sc-no-strategy-reject`
   2. [x] - `p1` - **IF** more than one MountStrategy instance was captured, use the first captured instance as the representative for cardinality matching; mixed-strategy domains (multiple distinct strategy instances) are not supported - `inst-sc-first-strategy-representative`
2. [x] - `p1` - **MATCH** the strategy instance type - `inst-sc-match-strategy`
   1. [x] - `p1` - **CASE** ConcurrentMountStrategy: the domain's action declaration must include mount_ext AND unmount_ext - `inst-sc-concurrent-row`
   2. [x] - `p1` - **CASE** OptionalMountStrategy: the domain's action declaration must include mount_ext AND unmount_ext - `inst-sc-optional-row`
   3. [x] - `p1` - **CASE** ExclusiveMountStrategy: the domain's action declaration must include mount_ext AND must NOT include unmount_ext - `inst-sc-exclusive-row`
   4. [x] - `p1` - **DEFAULT**: the strategy is unrecognized; **RETURN** domain rejected with an unrecognized-strategy error - `inst-sc-unknown-reject`
3. [x] - `p1` - **FOR EACH** action required by the matched cardinality row - `inst-sc-required-check-loop`
   1. [x] - `p1` - **IF** the domain's declared actions do not contain this required action (the action type ID resolved from the injected type-system plugin via its dedicated `resolveMountExtActionId`/`resolveUnmountExtActionId` method) - `inst-sc-missing-required`
      1. [x] - `p1` - **RETURN** domain rejected, naming the missing required action - `inst-sc-required-fail`
4. [x] - `p1` - **FOR EACH** action forbidden by the matched cardinality row - `inst-sc-forbidden-check-loop`
   1. [x] - `p1` - **IF** the domain's declared actions contain this forbidden action (the action type ID resolved from the injected type-system plugin via its dedicated `resolveMountExtActionId`/`resolveUnmountExtActionId` method) - `inst-sc-forbidden-present`
      1. [x] - `p1` - **RETURN** domain rejected, naming the forbidden action that was declared - `inst-sc-forbidden-fail`
5. [x] - `p1` - **FOR EACH** action listed in declaration.actions - `inst-sc-handler-required-loop`
   1. [x] - `p1` - **IF** no handler was registered (via `ctx.registerHandler`) for this action - `inst-sc-handler-missing-check`
      1. [x] - `p1` - **RETURN** domain rejected, naming the declared action with no registered handler - `inst-sc-handler-missing-fail`
6. [x] - `p1` - **FOR EACH** handler registered via `ctx.registerHandler`, excluding handlers pre-populated by the registry itself (e.g. the infrastructure `load_ext` handler) - `inst-sc-handler-extra-loop`
   1. [x] - `p1` - **IF** this handler's action is not present in declaration.actions - `inst-sc-handler-extra-check`
      1. [x] - `p1` - **RETURN** domain rejected, naming the handler-registered action absent from the declaration - `inst-sc-handler-extra-fail`
7. [x] - `p1` - **RETURN** domain accepted; the strategy instance is registered as the domain's mount executor - `inst-sc-accept`

### Strategy Mount Execution

- [ ] `p2` - **ID**: `cpt-frontx-algo-extension-domain-governance-mount-execution`

**Input**: The extension identifier (the subject) and the domain that a mount request, or in an Optional domain an explicit unmount request, addresses (the extension is not presumed admitted to that domain); the action's declared timeout when it declares one, and the domain's own `defaultActionTimeout` used when it declares none; the addressed domain's strategy instance; the domain's container hooks and mount-set state from the MFE Registry; the request's admitted payload, including any history intent it carries; and the router injected into the registry holding the domain, or no router.

**Output**: One of: the request completed successfully immediately because the extension was already mounted (in an Optional or Exclusive domain, only while the domain's occupancy queue is empty and the domain is not being unregistered); the request joined an entry and settled with that entry's outcome; the request's entry ran and either physically mounted or unmounted its subject, or found at its turn that nothing needed to change and succeeded without change; a fresh mount proceeded after an in-progress unmount that the occupancy queue does not own settled; or the request failed — the extension is not admitted to the addressed domain, a newer request replaced the pending entry it was in, its own timer fired while its entry was still pending, the domain was unregistered while its entry was pending, the request was accepted while its Optional or Exclusive domain was being unregistered, the entry it joined failed, the unmount it waited on failed, or the mount itself failed and was rolled back (`inst-me-mount-root-detached`, `inst-me-mount-rollback`). Where a router is injected, a request whose execution reached the domain's handler has been reported to it exactly once, with that execution's outcome, before the request settles; every other request has reported nothing.

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
6. [x] - `p1` - **IF** the domain is Optional or Exclusive, the domain's own mount action and, in an Optional domain, its own unmount action order every accepted request through an internal occupancy queue of at most two entries: the running entry and one pending entry. An entry is one operation (a mount, or an explicit unmount) on one subject, together with every request that joined it; each such request is a caller of that entry. The queue is internal to those actions and exposes no public surface. Concurrent domains keep no occupancy queue, and their requests skip to `inst-me-get-mounted` - `inst-me-occupancy-queue`
7. [x] - `p1` - When the domain accepts a request, start that caller's own timer with the value the shared timeout rule gives (`inst-resolve-timeout` in `cpt-frontx-algo-mfe-host-communication-mediator-dispatch`): the action's declared timeout, otherwise the domain's `defaultActionTimeout`. The mediator and the occupancy queue use this one rule definition. The registry hands the action's declared timeout only to its own internal mount and unmount handlers; the public `ActionHandler` signature carries no timeout parameter - `inst-me-queue-caller-timer`
8. [x] - `p1` - **MATCH** the accepted request against the queue: - `inst-me-queue-place`
   1. [x] - `p1` - **CASE** the queue is empty: the request enters as the running entry and starts at once (`inst-me-queue-evaluate-at-turn`) - `inst-me-queue-start-when-empty`
   2. [x] - `p1` - **CASE** the pending entry has the same operation and the same subject: the request joins the pending entry - `inst-me-queue-join-pending`
   3. [x] - `p1` - **CASE** the running entry has the same operation and the same subject: **IF** a pending entry exists, it is replaced as in `inst-me-queue-replace-pending`, except that no request becomes pending; the request joins the running entry and settles with its outcome - `inst-me-queue-join-running`
   4. [x] - `p1` - **CASE** only the running entry exists, with a different operation or subject: the request enters as the pending entry - `inst-me-queue-enter-pending`
   5. [x] - `p1` - **CASE** both slots are held and neither has the request's operation and subject: the request replaces the pending entry. The replaced entry leaves the queue and never starts; each of its callers, including callers that joined it, fails and takes its own chain's `fallback`. Outcomes stay boolean. The request becomes the pending entry - `inst-me-queue-replace-pending`
   6. [x] - `p1` - Joining requires the same operation and the same subject: a mount of A never joins an unmount of A, and an unmount of A never joins a mount of A - `inst-me-queue-join-same-operation-subject`
9. [x] - `p1` - **IF** a caller's own timer fires while its entry is still pending and has not started, that caller fails alone and takes its own `fallback`. The pending entry leaves the queue only when its last caller has left, and an entry that leaves this way never starts - `inst-me-queue-pending-timeout`
10. [x] - `p1` - The running entry is never replaced, removed, or interrupted: not by a newer request, not by a caller's timer, and not by domain unregistration. A caller's timer that fires after its entry has started leaves the entry running; the mediator's own per-action bound settles that caller's attempt and cancels nothing (`cpt-frontx-adr-action-dispatch-and-chaining`) - `inst-me-queue-running-never-interrupted`
11. [x] - `p1` - When an entry starts as the running entry, evaluate it against the domain's mount set present at that moment: - `inst-me-queue-evaluate-at-turn`
    1. [x] - `p1` - **IF** an unmount of the entry's subject that the occupancy queue does not own (a slot detach) is in flight when the entry starts, wait for it to settle before any other check at this turn; **IF** it failed, the entry fails and each of its callers takes its own `fallback`; otherwise evaluate the entry as below. The entry never succeeds on the strength of a mount-set record that the settling unmount removes - `inst-me-queue-await-unmount-at-turn`
    2. [x] - `p1` - **IF** the entry's subject is no longer admitted to the domain at its turn, the entry fails and each of its callers takes its own `fallback` - `inst-me-queue-eligibility-at-turn`
    3. [x] - `p1` - **IF** the entry is a mount of A and A is the domain's occupant at that moment, the entry succeeds without container creation, mount-set change, or an `activated` trigger - `inst-me-sole-occupant-at-turn`
    4. [x] - `p1` - **IF** the entry is a mount of A and A is not mounted, the entry runs as a fresh mount through the strategy (`inst-me-get-mounted`, `inst-me-match-strategy`) - `inst-me-queue-fresh-mount-at-turn`
    5. [x] - `p1` - **IF** the entry is an explicit unmount of A (Optional domain only) and A is mounted, unmount A: physical unmount, container released exactly once, A no longer mounted - `inst-um-queue-unmount-at-turn`
    6. [x] - `p1` - **IF** the entry is an explicit unmount of A and A is absent at its turn, including when the unmount waited behind a mount of A that failed, the entry succeeds without change - `inst-um-queue-absent-noop`
12. [x] - `p1` - When the running entry finishes, each of its callers continues: on success with its own `next`, on failure with its own `fallback`. The entry leaves the queue, and the pending entry, if any, is promoted to running and started (`inst-me-queue-evaluate-at-turn`) - `inst-me-queue-complete-running`
13. [x] - `p1` - **IF** an Optional or Exclusive domain is unregistered, unregistration proceeds as it does for a domain whose queue is empty. The pending entry, if any, leaves the queue without starting, and each of its callers fails and takes its own `fallback`; the running entry is not interrupted. A request accepted while the unregistration is in progress fails at once, without entering the queue, and takes its own `fallback`. This holds for every request, including a mount of a subject that is still mounted. When the running entry finishes, nothing is promoted. If the unregistration fails and the domain stays registered, its queue accepts requests again; the pending entry already failed at close stays failed - `inst-me-queue-domain-unregister`
14. [x] - `p1` - An already-mounted success (`inst-me-already-mounted-complete`), a joined request (`inst-me-join-in-progress-mount`, `inst-me-queue-join-pending`, `inst-me-queue-join-running`), and a mount that finds its subject still the occupant at its turn (`inst-me-sole-occupant-at-turn`) never run Optional or Exclusive eviction; only a fresh mount runs the strategy below. In an Optional or Exclusive domain only the running entry changes occupancy, so a request arriving during an eviction is evaluated only after that change completes - `inst-me-no-rerun-eviction`
15. [x] - `p1` - The `activated` lifecycle stage is triggered exactly once, for the underlying physical mount only. It is never triggered for an already-mounted success (`inst-me-already-mounted-complete`), a mount that finds its subject still the occupant at its turn (`inst-me-sole-occupant-at-turn`), a joined request (`inst-me-join-in-progress-mount`, `inst-me-queue-join-pending`, `inst-me-queue-join-running`), or a request that failed before its entry started (`inst-me-queue-replace-pending`, `inst-me-queue-pending-timeout`, `inst-me-queue-domain-unregister`). A fresh mount of a subject that an earlier unmount or eviction removed (`inst-me-fresh-mount-after-unmount`, `inst-me-queue-fresh-mount-at-turn`) may trigger it again - `inst-me-activated-once`
16. [x] - `p1` - Retrieve the current set of mounted extensions for the target domain from the registry - `inst-me-get-mounted`
17. [x] - `p1` - **MATCH** the domain's strategy - `inst-me-match-strategy`
    1. [x] - `p1` - **CASE** ConcurrentMountStrategy: create a new container for the extension and mount it; if mounting fails, destroy the container and propagate the error - `inst-me-concurrent`
    2. [x] - `p1` - **CASE** OptionalMountStrategy: **IF** a different extension is already mounted, unmount it and destroy its container before proceeding - `inst-me-optional-displace`
       1. [x] - `p1` - Already-mounted, joined, and still-occupant-at-turn requests are settled before this step (`inst-me-already-mounted-complete`, `inst-me-queue-join-pending`, `inst-me-queue-join-running`, `inst-me-sole-occupant-at-turn`); this branch is reached only for a fresh mount started as the running entry, and a direct strategy call that bypasses the prologue returns without change - `inst-me-optional-idempotent`
       2. [x] - `p1` - Create a new container and mount the extension; if mounting fails, destroy the container and propagate the error - `inst-me-optional-mount`
    3. [x] - `p1` - **CASE** ExclusiveMountStrategy: **FOR EACH** extension currently mounted in this domain that is not the incoming extension, unmount and destroy its container (eviction) - `inst-me-exclusive-evict`
       1. [x] - `p1` - Already-mounted, joined, and still-occupant-at-turn requests are settled before this step (`inst-me-already-mounted-complete`, `inst-me-queue-join-pending`, `inst-me-queue-join-running`, `inst-me-sole-occupant-at-turn`); this branch is reached only for a fresh mount started as the running entry, and a direct strategy call that bypasses the prologue returns without change - `inst-me-exclusive-idempotent`
       2. [x] - `p1` - Create a new container and mount the extension; if mounting fails, destroy the container and propagate the error - `inst-me-exclusive-mount`
18. [x] - `p1` - **IF** the domain's root was detached while the extension's own lifecycle mount was running (`inst-sd-clear-root-first`), do not place the container: unmount the extension's lifecycle again so it is not left mounted into a container outside any root, then fail the mount with the detached-root error, carrying a failure of that unmount as its cause. The strategy destroys the container as for any failed mount, and the next mount of the extension runs as a fresh mount - `inst-me-mount-root-detached`
19. [x] - `p1` - **IF** placing the container under the root or recording the extension in the mount set fails after the extension's own lifecycle mount has run, undo each part already done — remove the container from the DOM, drop the extension from the mount set, unmount the extension's lifecycle — and fail with the original error. The strategy destroys the container as for any failed mount - `inst-me-mount-rollback`
20. [x] - `p1` - Every physical unmount — an explicit unmount, an Optional displacement, an Exclusive eviction, or a slot detach — completes its teardown even when the extension's own lifecycle unmount fails, then fails with that lifecycle error; a later mount of the extension runs as a fresh mount - `inst-um-teardown-on-failure`
    1. [x] - `p1` - Deactivate the extension's bridge and release the container's connection to it - `inst-um-failure-bridge-released`
    2. [x] - `p1` - Remove the container from the DOM and the extension from the domain's mount set - `inst-um-failure-container-removed`
    3. [x] - `p1` - Destroy the container exactly once; a failure of that destroy does not replace the lifecycle error the unmount reports - `inst-um-failure-container-destroyed`
21. [x] - `p1` - **IF** the request's execution reached the domain's handler — the handler the domain implementation registered for `mount_ext` or `unmount_ext` ran for it: a fresh mount started as the running entry (`inst-me-queue-fresh-mount-at-turn`), a fresh mount in a Concurrent domain, including one that proceeds after an in-progress unmount settled (`inst-me-fresh-mount-after-unmount`), an explicit unmount of a mounted subject at its turn (`inst-um-queue-unmount-at-turn`), or an unmount in a Concurrent domain that `inst-um-after-mount-failure` does not complete without action (`inst-um-after-mount-success`) — and the registry holding the domain was built with a router, report that execution once to that router through `reportSettled` (`cpt-frontx-dod-mfe-host-communication-router-port-contract`), carrying the executed action's type, its payload exactly as admitted with any history intent it carries passed uninterpreted, the domain's id, and whether the execution succeeded - `inst-me-report-settled`
    1. [x] - `p1` - The report is made from the domain's handler path after the domain's handler settles, whether it succeeded or failed, and before the request settles back to the actions-chains mediator, so it precedes the chain's `next` on success and its `fallback` on failure; chain execution itself records and reports nothing (`cpt-frontx-constraint-mfes-recursive-chain-execution`) - `inst-me-report-before-next`
    2. [x] - `p1` - One execution produces one report: every caller of the entry that ran, joined callers included (`inst-me-queue-join-pending`, `inst-me-queue-join-running`, `inst-me-join-in-progress-mount`), settles on that one execution, and no caller produces a report of its own - `inst-me-report-once-per-execution`
    3. [x] - `p1` - The physical releases an execution performs internally — an Optional displacement (`inst-me-optional-displace`), an Exclusive eviction (`inst-me-exclusive-evict`), and the teardown of the nested occupants of a departing extension that itself hosts domains, whose slots detach as it unmounts (`cpt-frontx-algo-extension-domain-governance-slot-detach`) — are part of that one settled outcome: none is reported separately and none dispatches an `unmount_ext` of its own; the router derives the resulting occupancy from the action, the domain's cardinality semantics, and its own orchestration state - `inst-me-report-internal-releases`
    4. [x] - `p1` - **IF** `reportSettled` throws, log a diagnostic naming the domain and the subject and settle the request with the execution's own outcome; the report never changes an outcome - `inst-me-report-failure-isolated`
22. [x] - `p1` - A request that never reaches the domain's handler reports nothing: a mount of an extension that is already mounted (`inst-me-already-mounted-complete`, `inst-me-sole-occupant-at-turn`), a request that joins an entry already queued or running, a pending request superseded by a later one (`inst-me-queue-replace-pending`), a pending request whose timer fires before it starts (`inst-me-queue-pending-timeout`), a request refused because its domain is being unregistered (`inst-me-queue-domain-unregister`), a request that fails eligibility (`inst-me-eligibility-check`, `inst-me-queue-eligibility-at-turn`) or fails because the unmount it waited on failed (`inst-me-fail-after-unmount-failure`, `inst-me-queue-await-unmount-at-turn`), and an unmount that completes without change because its subject is absent or the mount it waited on failed (`inst-um-queue-absent-noop`, `inst-um-after-mount-failure`) - `inst-me-no-report-unexecuted`
23. [x] - `p1` - **IF** the registry holding the domain was built with no router, every request runs exactly as above and nothing is reported to anyone - `inst-me-report-standalone`
24. [ ] - `p1` - An Exclusive domain keeps no public `unmount_ext` (`inst-sc-exclusive-row`): its occupant leaves only through a replacing `mount_ext` that evicts it, through teardown of an ancestor extension caused by that ancestor's own action, or through terminal disposal of its registry - `inst-me-exclusive-no-public-unmount`
25. [x] - `p1` - **RETURN** mount outcome - `inst-me-return`

### Slot Detach Teardown

- [x] `p2` - **ID**: `cpt-frontx-algo-extension-domain-governance-slot-detach`

**Input**: A registered domain whose slot releases its root element (the host element the domain places containers under goes away), while the domain itself stays registered with its strategy and container hooks.

**Output**: The domain has no root and every extension that was in its mount set is unmounted with its container destroyed; the detach either completes, or fails with the single unmount failure unchanged, or fails with one aggregate error that carries every unmount failure.

**Steps**:
1. [x] - `p1` - Clear the domain's root first, before reading the mount set, so a mount whose lifecycle mount settles during the detach is never placed under the departing root and is rolled back instead (`inst-me-mount-root-detached`) - `inst-sd-clear-root-first`
2. [x] - `p1` - **FOR EACH** extension in the domain's mount set, in mount-set order - `inst-sd-each-occupant`
   1. [x] - `p1` - Unmount it as any physical unmount does, joining an unmount of the same extension already in progress rather than starting a second one; a mount request for it that arrives meanwhile waits for this unmount (`inst-me-await-unmount-settle`) - `inst-sd-unmount-occupant`
   2. [x] - `p1` - Destroy its container exactly once, through the container hooks of the strategy that created it, including when the unmount fails (`inst-um-failure-container-destroyed`) - `inst-sd-destroy-container`
   3. [x] - `p1` - **IF** this unmount fails, record the failure and continue with the next extension - `inst-sd-continue-on-failure`
3. [x] - `p1` - **IF** exactly one unmount failed, **RETURN** the detach as failed with that failure unchanged - `inst-sd-single-failure`
4. [x] - `p1` - **IF** more than one unmount failed, **RETURN** the detach as failed with one aggregate error that carries every failure in mount-set order - `inst-sd-aggregate-failure`
5. [x] - `p1` - A slot detach is resource cleanup, not an occupancy action: the unmounts it performs dispatch no `unmount_ext` and send no settled-action report to any router - `inst-sd-no-report`
6. [x] - `p1` - **RETURN** detach completed - `inst-sd-return`

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
1. [x] - `p1` - **FROM** UNVALIDATED **TO** VALIDATED **WHEN** the domain's declared lifecycle actions satisfy the cardinality matrix row for the selected mount strategy (all required actions present, all forbidden actions absent) - `inst-card-t1`
2. [x] - `p1` - **FROM** UNVALIDATED **TO** REJECTED **WHEN** the domain's declared lifecycle actions violate the cardinality matrix row (missing required action or present forbidden action) or the strategy is unrecognized - `inst-card-t2`
3. [x] - `p1` - **FROM** VALIDATED **TO** ACTIVE **WHEN** the domain is successfully registered in the MFE Registry with its strategy as the mount executor - `inst-card-t3`

## 5. Definitions of Done

### Contract Enforcement at Admission

- [x] `p1` - **ID**: `cpt-frontx-dod-extension-domain-governance-contract-enforcement`

The system **MUST** run subset-rule contract matching on every extension before it is admitted into any domain, applying the three containment rules and the infrastructure-lifecycle-action exemption, and reject any extension whose entry fails any rule with an error that names the specific missing property or unsupported action.

**Implements**:
- `cpt-frontx-flow-extension-domain-governance-admission`
- `cpt-frontx-algo-extension-domain-governance-contract-matching`

**Constraints**: `cpt-frontx-constraint-mfes-no-layout-domain-values`

**Touches**:
- API: N/A (internal runtime admission path)
- DB: N/A
- Entities: Extension, ExtensionDomain

### Cardinality Matrix Enforcement at Domain Registration

- [x] `p1` - **ID**: `cpt-frontx-dod-extension-domain-governance-cardinality-enforcement`

The system **MUST** reject any domain registration whose declared lifecycle actions are inconsistent with the cardinality matrix row for the domain's selected mount strategy, producing an error that names the violated row (missing required action or present forbidden action), and **MUST** reject any domain backed by an unrecognized strategy.

**Implements**:
- `cpt-frontx-flow-extension-domain-governance-admission`
- `cpt-frontx-algo-extension-domain-governance-strategy-cardinality`

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

**Constraints**: `cpt-frontx-constraint-mfes-no-layout-domain-values`

**Touches**:
- API: N/A (internal runtime admission path)
- DB: N/A
- Entities: Extension, ExtensionDomain

### Settled-Action Report From the Domain Handler Path

- [ ] `p1` - **ID**: `cpt-frontx-dod-extension-domain-governance-settled-action-report`

The system **MUST**, where the registry holding a domain was built with a router, report each `mount_ext` or `unmount_ext` execution that reaches the domain's handler exactly once to that router through `reportSettled`, with the executed action's type, its payload as admitted (any history intent passed uninterpreted), the domain's id, and its outcome, from the domain's handler path before the request settles back to the mediator and so before the chain's `next` runs. Optional displacement, Exclusive eviction, and the teardown of a departing host's nested occupants **MUST** be part of that one report and **MUST NOT** be reported separately or dispatched as `unmount_ext` actions. A request that never reaches the domain's handler — already mounted, joined, superseded while pending, timed out while pending, refused during domain unregistration, ineligible, or an unmount that changes nothing — **MUST** report nothing, and a slot detach **MUST** report nothing. A report that throws **MUST NOT** change the request's outcome. With no router the system **MUST** report nothing. An Exclusive domain **MUST** keep no public `unmount_ext`.

**Implements**:
- `cpt-frontx-algo-extension-domain-governance-mount-execution`
- `cpt-frontx-algo-extension-domain-governance-slot-detach`

**Constraints**: `cpt-frontx-constraint-mfes-router-port`, `cpt-frontx-constraint-mfes-recursive-chain-execution`

**Touches**:
- API: N/A (internal runtime mount path)
- DB: N/A
- Entities: Action / ActionsChain, ExtensionDomain, Router port
- Sequence: `cpt-frontx-mfes-seq-routed-mount-occupant-value`

## 6. Acceptance Criteria

- [x] Contract matching rejects an extension whose required property is absent from the domain's shared-property set, and the error names the missing property.
- [x] Contract matching rejects an extension that does not support an action the domain requires of its occupants, and the error names the unsupported action.
- [x] Contract matching rejects an extension that requires a domain action (excluding infrastructure lifecycle actions) the domain does not support, and the error names the unhandled action.
- [x] Infrastructure lifecycle actions (load_ext, mount_ext, unmount_ext) appearing in an entry's required-domain-actions set do not by themselves cause contract matching to fail.
- [x] A domain composed with ConcurrentMountStrategy that declares both mount_ext and unmount_ext is accepted; one that omits either is rejected at registration.
- [x] A domain composed with OptionalMountStrategy that declares both mount_ext and unmount_ext is accepted; one that omits either is rejected at registration.
- [x] A domain composed with ExclusiveMountStrategy that declares mount_ext and does not declare unmount_ext is accepted; one that declares unmount_ext is rejected at registration.
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
- [x] Unregister: unregistering an Optional or Exclusive domain whose queue holds a running and a pending entry makes each caller of the pending entry take its own `fallback`; the pending entry never starts, and the running entry is not interrupted. A request accepted while the unregistration is in progress, including a mount of an extension that is still mounted, fails at once without entering the queue and takes its own `fallback`; when the running entry finishes, nothing is promoted.
- [x] Slot detach: detaching a domain's slot unmounts every extension in its mount set and destroys each one's container exactly once through the strategy's container hooks; the domain is left with no root and an empty mount set.
- [x] Slot detach: a mount whose lifecycle mount settles while the slot is being detached is not placed under the departing root; the extension's lifecycle is unmounted again, the mount fails, its container is destroyed, and the next mount of that extension runs its lifecycle mount again.
- [x] Slot detach: when one extension's unmount fails, the detach still unmounts every other extension; one failure is reported unchanged, and several failures are reported as one aggregate error carrying each of them.
- [x] In an Optional or Exclusive domain, a mount request for an extension whose slot-detach unmount is in flight waits for that unmount to settle and never reports success on the strength of the mount-set record the unmount removes; if that unmount failed, the request fails.
- [x] Mount rollback: when placing the container or recording the extension in the mount set fails after the extension's lifecycle mount has run, the container leaves the DOM, the extension is not in the mount set, its lifecycle is unmounted, and the mount fails with the original error.
- [x] Unmount failure: when an extension's own lifecycle unmount fails, its bridge is still deactivated, its container still leaves the DOM and is destroyed exactly once, the extension leaves the mount set, and the unmount fails with the lifecycle error; a later mount of the extension runs as a fresh mount.
- [x] No route-name validation, route-token derivation, or route-uniqueness check appears in the runtime's domain or extension admission path; a domain or extension that declares a `route` is admitted or rejected by the runtime exactly as it would be without one, and the `route` reaches an injected router unchanged.
- [ ] With a router test double injected, a fresh mount in an Exclusive, an Optional, and a Concurrent domain is reported exactly once, carrying the executed action's type, its payload as admitted, the domain id, and a successful outcome, before the chain's `next` runs; a mount whose execution fails is reported once with a failed outcome before the chain's `fallback` runs.
- [ ] An explicit `unmount_ext` of a mounted extension in an Optional and in a Concurrent domain is reported exactly once before the chain's `next` runs.
- [x] A fresh mount that displaces a prior occupant in an Optional domain, or evicts the occupant of an Exclusive domain, produces one report for the mount and none for the displaced or evicted extension.
- [x] A fresh mount that replaces an extension which itself hosts domains produces one report in the parent registry, and the nested occupants released by that teardown produce no report in the nested registry and dispatch no `unmount_ext`.
- [ ] A mount of an already-mounted extension, a request joining a queued or running entry, a pending request superseded by a later one, a pending request whose timer fires, a request refused during domain unregistration, and an Optional-domain unmount whose subject is absent at its turn each report nothing; a burst A, B, C, D in an Exclusive domain produces exactly two reports, for A and for D.
- [ ] A slot detach, and the unmount performed by unregistering a mounted extension, report nothing.
- [ ] A history intent on an executed `mount_ext` or `unmount_ext` reaches the router inside the reported payload unchanged, and an absent history intent stays absent in the report.
- [ ] A router test double whose `reportSettled` throws leaves the request's outcome and its chain's continuation unchanged.
- [ ] A registry built with no router mounts and unmounts in every strategy with nothing reported.
