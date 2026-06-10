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
  - [Bridge Delegation to Registry](#bridge-delegation-to-registry)
- [4. States (CDSL)](#4-states-cdsl)
  - [Action State Machine](#action-state-machine)
- [5. Definitions of Done](#5-definitions-of-done)
  - [Mediator Keyed Dispatch and In-Flight Tracking](#mediator-keyed-dispatch-and-in-flight-tracking)
  - [Narrow Capability Bridge With Delegating Methods](#narrow-capability-bridge-with-delegating-methods)
- [6. Acceptance Criteria](#6-acceptance-criteria)

<!-- /toc -->

- [ ] `p1` - **ID**: `cpt-frontx-featstatus-mfe-host-communication`
## 1. Feature Context

- [ ] `p2` - `cpt-frontx-feature-mfe-host-communication`

### 1.1 Overview

The host runtime routes actions to microfrontend targets through an actions-chains mediator keyed by target identifier and action type. A narrow parent–child capability bridge gives child microfrontends exactly the participation capabilities they need, delegating each to the registry and its mediator, while the property channel carries no solution-specific vocabulary.

### 1.2 Purpose

This feature details the host–MFE dispatch mechanism and the child-facing bridge surface that together realize `cpt-frontx-fr-mfe-host-communication`. Action admission is delegated to the injected type-system provider rather than embedded format knowledge, applying `cpt-frontx-principle-agnostic-core`.

**Requirements**: `cpt-frontx-fr-mfe-host-communication`

**Principles**: `cpt-frontx-principle-agnostic-core`

### 1.3 Actors

| Actor | Role in Feature |
|-------|-----------------|
| `cpt-frontx-actor-project-developer` | Dispatches action chains to registered microfrontend targets through the host runtime |

### 1.4 References

- **PRD**: [PRD.md](../../PRD.md)
- **Design**: [DESIGN.md](../../DESIGN.md)
- **ADRs**: `cpt-frontx-adr-actions-chains-mediator`, `cpt-frontx-adr-parent-child-bridge`
- **Dependencies**: `cpt-frontx-feature-mfe-registry`

## 2. Actor Flows (CDSL)

**Use cases**: `cpt-frontx-usecase-add-microfrontend-to-project`

### Dispatch Actions Chain to MFE Target

- [ ] `p1` - **ID**: `cpt-frontx-flow-mfe-host-communication-dispatch-chain`

**Actor**: `cpt-frontx-actor-project-developer`

**Success Scenarios**:
- Developer dispatches an action chain; the mediator routes it to the registered handler; the chain completes through the success continuation and returns a completed result with the execution path

**Error Scenarios**:
- No handler is registered for the target and action type; the mediator follows the fallback branch or returns a non-completed result
- Chain execution exceeds the configured timeout; the mediator returns a timed-out non-completed result
- Target entry does not declare the dispatched action type; the mediator rejects the action before handler resolution

**Steps**:
1. [ ] - `p1` - Developer assembles an actions chain with an action that identifies the target and action type - `inst-assemble-chain`
2. [ ] - `p1` - Developer invokes `executeActionsChain` on the host runtime with the assembled chain and an optional timeout override - `inst-invoke-execute`
3. [ ] - `p1` - Runtime delegates action admission to the injected type-system provider, which validates the action against its registered schema - `inst-admit-action`
4. [ ] - `p1` - Runtime checks that the target entry declares the action type in its receivable-action set; infrastructure lifecycle actions are exempt - `inst-decl-check`
5. [ ] - `p1` - **IF** the target entry exists and does not declare the action type - `inst-decl-fail-check`
   1. [ ] - `p1` - **RETURN** non-completed result with a declaration error - `inst-decl-fail-return`
6. [ ] - `p1` - Runtime resolves the handler for the `(target, action type)` pair; on no specific match, falls back to the per-target catch-all handler - `inst-resolve-handler`
7. [ ] - `p1` - **IF** no specific handler and no catch-all handler exists for the target - `inst-no-handler-check`
   1. [ ] - `p1` - Runtime follows the chain fallback branch if defined - `inst-no-handler-fallback`
   2. [ ] - `p1` - **IF** no fallback is defined - `inst-no-handler-no-fallback`
      1. [ ] - `p1` - **RETURN** non-completed result with a missing-handler error - `inst-no-handler-return`
8. [ ] - `p1` - Runtime registers the action dispatch as an in-flight operation for the target - `inst-register-inflight`
9. [ ] - `p1` - Runtime invokes the resolved handler within the per-action timeout bound - `inst-invoke-handler`
10. [ ] - `p1` - **IF** handler execution succeeds - `inst-success-check`
    1. [ ] - `p1` - Runtime records the action type in the execution path - `inst-success-record-path`
    2. [ ] - `p1` - **IF** the chain declares a `next` continuation - `inst-check-next`
       1. [ ] - `p1` - Runtime recurses into the next chain node and repeats from admission - `inst-recurse-next`
    3. [ ] - `p1` - **IF** no `next` continuation is declared - `inst-no-next`
       1. [ ] - `p1` - **RETURN** completed result with the accumulated execution path and elapsed time - `inst-return-completed`
11. [ ] - `p1` - **IF** handler execution fails or times out - `inst-fail-check`
    1. [ ] - `p1` - Runtime records the action type in the execution path - `inst-fail-record-path`
    2. [ ] - `p1` - **IF** the chain declares a `fallback` continuation - `inst-check-fallback`
       1. [ ] - `p1` - Runtime recurses into the fallback chain node and repeats from admission - `inst-recurse-fallback`
    3. [ ] - `p1` - **IF** no `fallback` continuation is declared - `inst-no-fallback`
       1. [ ] - `p1` - **RETURN** non-completed result propagating the error or timeout - `inst-return-failed`
12. [ ] - `p1` - Runtime removes the in-flight tracking entry for the target once the action promise settles - `inst-untrack-inflight`
13. [ ] - `p1` - **RETURN** final result with completion flag, execution path, and elapsed time - `inst-return-final`

## 3. Processes / Business Logic (CDSL)

### Mediator Keyed Dispatch and Recursive Chain Execution

- [ ] `p2` - **ID**: `cpt-frontx-algo-mfe-host-communication-mediator-dispatch`

**Input**: An actions chain with one action identifying target and action type, an optional chain timeout, and an execution path accumulator

**Output**: A chain result with completion flag, accumulated path, optional error, optional timeout flag, and elapsed time

**Steps**:
1. [ ] - `p1` - Check whether the accumulated elapsed time exceeds the chain timeout; if exceeded, throw a chain-timeout error - `inst-check-chain-timeout`
2. [ ] - `p1` - Delegate action admission to the injected type-system provider - `inst-delegate-admit`
3. [ ] - `p1` - Look up the handler for the `(targetId, actionTypeId)` pair in the keyed handler registry - `inst-keyed-lookup`
4. [ ] - `p1` - **IF** no keyed handler is found for the pair - `inst-no-keyed`
   1. [ ] - `p1` - Look up the per-target catch-all handler; the catch-all tier enables forwarding to child domains whose action vocabulary is not enumerated in the parent - `inst-catchall-lookup`
5. [ ] - `p1` - **IF** neither a keyed nor a catch-all handler exists for the target - `inst-no-handler`
   1. [ ] - `p1` - Throw a missing-handler error that propagates to the chain fallback or outer result - `inst-throw-no-handler`
6. [ ] - `p1` - Resolve the per-action timeout from the action's explicit timeout field or, if absent, from the domain's default action timeout - `inst-resolve-timeout`
7. [ ] - `p1` - Add the action dispatch to the in-flight tracking set for the target - `inst-add-inflight`
8. [ ] - `p1` - Invoke the resolved handler within the per-action timeout bound - `inst-invoke-within-timeout`
9. [ ] - `p1` - Remove the action from the in-flight tracking set once the promise settles - `inst-remove-inflight`
10. [ ] - `p1` - **IF** handler execution succeeds - `inst-success`
    1. [ ] - `p1` - Append the action type to the execution path - `inst-append-path-success`
    2. [ ] - `p1` - **IF** the chain carries a `next` continuation - `inst-has-next`
       1. [ ] - `p1` - Recurse into `next` with the updated path and remaining time budget - `inst-recurse-success`
    3. [ ] - `p1` - **IF** no `next` continuation is declared - `inst-chain-done`
       1. [ ] - `p1` - **RETURN** completed result - `inst-return-done`
11. [ ] - `p1` - **IF** handler execution throws or times out - `inst-failure`
    1. [ ] - `p1` - Append the action type to the execution path - `inst-append-path-failure`
    2. [ ] - `p1` - **IF** the chain carries a `fallback` continuation - `inst-has-fallback`
       1. [ ] - `p1` - Recurse into `fallback` with the updated path and remaining time budget - `inst-recurse-fallback-algo`
    3. [ ] - `p1` - **IF** no `fallback` continuation is declared - `inst-no-fallback-algo`
       1. [ ] - `p1` - Re-throw the error so the outer chain execution resolves it to a non-completed result - `inst-rethrow`

### Bridge Delegation to Registry

- [ ] `p2` - **ID**: `cpt-frontx-algo-mfe-host-communication-bridge-delegation`

**Input**: A child bridge instance wired with injected registry and mediator callbacks; a request from the child to execute an actions chain, register an action handler, or register a child domain

**Output**: Execution delegated to the host registry or mediator; no coordination logic inside the bridge itself

**Steps**:
1. [ ] - `p1` - **IF** the child requests to execute an actions chain - `inst-child-exec-chain`
   1. [ ] - `p1` - Child bridge forwards the chain to the injected `executeActionsChain` registry callback without adding coordination logic - `inst-fwd-exec-chain`
2. [ ] - `p1` - **IF** the child registers an action handler for a specific action type - `inst-child-reg-handler`
   1. [ ] - `p1` - Child bridge invokes the injected mediator-registration callback with the action type identifier and handler instance - `inst-fwd-reg-handler`
3. [ ] - `p1` - **IF** the child registers a child domain for cross-runtime action forwarding - `inst-child-reg-domain`
   1. [ ] - `p1` - Child bridge invokes the injected child-domain-registration callback with the domain identifier - `inst-fwd-reg-domain`
   2. [ ] - `p1` - Parent runtime registers a catch-all forwarding handler in the mediator, keyed to the child domain identifier - `inst-register-catchall`
   3. [ ] - `p1` - The catch-all forwarding handler wraps any incoming action in an actions chain and delivers it through the bridge transport to the child runtime's mediator - `inst-catchall-forward`
4. [ ] - `p1` - **IF** the parent runtime sends an action chain to the child's domain - `inst-parent-send-chain`
   1. [ ] - `p1` - Parent bridge delivers the chain to the child bridge's registered actions-chain handler - `inst-deliver-to-child`
   2. [ ] - `p1` - Child bridge invokes its registered handler; if no handler is registered, throws a no-handler error - `inst-child-invoke`
5. [ ] - `p1` - Parent bridge exposes `instanceId` and `dispose()` as its complete narrow public surface; disposal invokes child bridge cleanup - `inst-parent-handle`

## 4. States (CDSL)

### Action State Machine

- [ ] `p2` - **ID**: `cpt-frontx-state-mfe-host-communication-action-lifecycle`

**States**: PENDING, DISPATCHED, SUCCEEDED, FAILED, FALLBACK

**Initial State**: PENDING

**Transitions**:
1. [ ] - `p1` - **FROM** PENDING **TO** DISPATCHED **WHEN** a handler is resolved and the action is invoked within its timeout bound - `inst-t-pending-dispatched`
2. [ ] - `p1` - **FROM** DISPATCHED **TO** SUCCEEDED **WHEN** handler execution completes without error - `inst-t-dispatched-succeeded`
3. [ ] - `p1` - **FROM** DISPATCHED **TO** FAILED **WHEN** handler execution throws an error or the per-action timeout expires - `inst-t-dispatched-failed`
   **Actions**:
   - [ ] - `p1` - Runtime records the action type in the execution path - `inst-failed-record-path`
   - [ ] - `p1` - Runtime removes the in-flight tracking entry for the target - `inst-failed-untrack`
   - [ ] - `p1` - **IF** the chain declares a `fallback` continuation - `inst-failed-check-fallback`
     - [ ] - `p1` - Transition the action to FALLBACK and recurse into the fallback chain node - `inst-failed-to-fallback`
   - [ ] - `p1` - **IF** no `fallback` is declared - `inst-failed-no-fallback`
     - [ ] - `p1` - Propagate the error; the outer chain execution resolves to a non-completed result - `inst-failed-propagate`
4. [ ] - `p1` - **FROM** FAILED **TO** FALLBACK **WHEN** the chain declares a fallback continuation that is recursively executed - `inst-t-failed-fallback`
5. [ ] - `p1` - **FROM** SUCCEEDED **TO** DISPATCHED **WHEN** the chain declares a `next` continuation and the next action is dispatched - `inst-t-succeeded-dispatched`

## 5. Definitions of Done

### Mediator Keyed Dispatch and In-Flight Tracking

- [ ] `p1` - **ID**: `cpt-frontx-dod-mfe-host-communication-mediator-dispatch`

The system **MUST** implement the actions-chains mediator with a keyed `(targetId, actionTypeId)` handler registry and a per-target catch-all tier, executing chains recursively with success and fallback branching, per-action and whole-chain timeout bounds, and in-flight tracking that blocks handler unregistration for a target while its actions are pending. Action admission is delegated to the injected type-system provider; the mediator carries no type-format knowledge. The property channel passed through the bridge surface carries no solution-specific identifiers, satisfying `cpt-frontx-constraint-mfes-no-solution-shared-properties` (MFES-2).

**Implements**:
- `cpt-frontx-flow-mfe-host-communication-dispatch-chain`
- `cpt-frontx-algo-mfe-host-communication-mediator-dispatch`

**Constraints**: `cpt-frontx-constraint-mfes-no-solution-shared-properties`

**Touches**:
- Entities: `Action`, `ActionsChain`
- Component: `cpt-frontx-component-mfe-runtime`

### Narrow Capability Bridge With Delegating Methods

- [ ] `p1` - **ID**: `cpt-frontx-dod-mfe-host-communication-bridge-delegation`

The system **MUST** provide a child bridge exposing exactly `executeActionsChain`, `subscribeToProperty`, `getProperty`, and `registerActionHandler`, each delegating to the host registry or mediator without duplicating coordination logic, and a matching parent bridge exposing only `instanceId` and `dispose()`. The bridge MUST NOT expose runtime internals. Child domain forwarding MUST use the catch-all handler tier in the parent mediator, forwarding actions through the bridge transport without the parent enumerating the child's action vocabulary.

**Implements**:
- `cpt-frontx-flow-mfe-host-communication-dispatch-chain`
- `cpt-frontx-algo-mfe-host-communication-bridge-delegation`

**Constraints**: `cpt-frontx-constraint-mfes-no-solution-shared-properties`

**Touches**:
- Entities: `Action`, `ActionsChain`
- Component: `cpt-frontx-component-mfe-runtime`

## 6. Acceptance Criteria

- [ ] The actions-chains mediator resolves a handler by the `(targetId, actionTypeId)` pair and falls back to the per-target catch-all handler when no specific pair matches
- [ ] Chain execution follows the `next` continuation on success and the `fallback` continuation on failure, both within per-action and whole-chain timeout bounds
- [ ] In-flight action tracking prevents unregistration of a target's handlers while actions for that target are pending
- [ ] Action admission is delegated to the injected type-system provider; no type-format literals appear in the mediator
- [ ] The child bridge surface is exactly `executeActionsChain`, `subscribeToProperty`, `getProperty`, and `registerActionHandler`; the parent bridge surface is exactly `instanceId` and `dispose()`
- [ ] The property channel carries no solution-specific shared-property identifiers, satisfying `cpt-frontx-constraint-mfes-no-solution-shared-properties` (MFES-2)
- [ ] Child domain forwarding uses the catch-all handler tier in the parent mediator, forwarding actions through the bridge transport without the parent enumerating the child's action vocabulary
