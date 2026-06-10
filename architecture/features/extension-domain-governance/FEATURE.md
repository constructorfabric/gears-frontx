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
- [4. States (CDSL)](#4-states-cdsl)
  - [Extension Admission Lifecycle](#extension-admission-lifecycle)
  - [Extension Domain Cardinality Lifecycle](#extension-domain-cardinality-lifecycle)
- [5. Definitions of Done](#5-definitions-of-done)
  - [Contract Enforcement at Admission](#contract-enforcement-at-admission)
  - [Cardinality Matrix Enforcement at Domain Registration](#cardinality-matrix-enforcement-at-domain-registration)
  - [Default-Deny Posture and Security NFR](#default-deny-posture-and-security-nfr)
- [6. Acceptance Criteria](#6-acceptance-criteria)

<!-- /toc -->

- [ ] `p1` - **ID**: `cpt-frontx-featstatus-extension-domain-governance`
## 1. Feature Context

- [ ] `p2` - `cpt-frontx-feature-extension-domain-governance`

### 1.1 Overview

Governs extension-domain occupancy through composable named mount strategies and a cardinality matrix, admitting extensions only by subset-rule contract matching with the scoped infrastructure-lifecycle-action exemption — realizing default-deny admission.

### 1.2 Purpose

This feature specifies the admission lifecycle that decides whether a given extension may occupy a given domain and, once admitted, which occupancy behavior the domain enforces. It covers:

- Multi-occupant domain support through composable named strategies (`cpt-frontx-fr-mfe-multi-occupant-domain`).
- Type-aware contract matching that validates structural capability and property compatibility before any extension is admitted (`cpt-frontx-fr-mfe-type-validation`).
- A security-anchored default-deny posture enforced at the admission boundary (`cpt-frontx-nfr-security`).

The feature realizes the design principle that nothing is granted until explicitly validated (`cpt-frontx-principle-default-deny-admission`).

**Requirements**: `cpt-frontx-fr-mfe-multi-occupant-domain`, `cpt-frontx-fr-mfe-type-validation`, `cpt-frontx-nfr-security`

**Principles**: `cpt-frontx-principle-default-deny-admission`

### 1.3 Actors

| Actor | Role in Feature |
|-------|-----------------|
| `cpt-frontx-actor-project-developer` | Defines extension domains (selecting a mount strategy), registers extensions into those domains, and observes admission outcomes. |

### 1.4 References

- **PRD**: [PRD.md](../../PRD.md)
- **Design**: [DESIGN.md](../../DESIGN.md)
- **Dependencies**:
  - `cpt-frontx-feature-mfe-registry` — admission and mount strategies act on registry-resolved extensions; domain registration is an MFE Registry concern.
  - `cpt-frontx-feature-gts-type-provider` — action–behavior consistency validation at admission uses type-of resolution from the GTS provider.

## 2. Actor Flows (CDSL)

User-facing interactions that start with an actor and describe the end-to-end flow of a use case.

**Use cases**: `cpt-frontx-usecase-add-microfrontend-to-project`

### Extension Domain Registration and Extension Admission Flow

- [ ] `p1` - **ID**: `cpt-frontx-flow-extension-domain-governance-admission`

**Actor**: `cpt-frontx-actor-project-developer`

**Success Scenarios**:
- Developer successfully registers a domain with a valid mount strategy and consistent action declaration; subsequently registers a compatible extension that is admitted and mounted.

**Error Scenarios**:
- Domain registration fails because declared lifecycle actions are inconsistent with the chosen mount strategy (cardinality violation).
- Extension admission fails because the extension's required properties are not provided by the domain, or the entry does not support all capabilities the domain requires, or the entry requires domain capabilities the domain does not provide.

**Steps**:
1. [ ] - `p1` - Developer composes a domain implementation factory by selecting one of the three named mount strategies (Concurrent, Optional, or Exclusive) and declaring the domain's lifecycle actions - `inst-compose-domain`
2. [ ] - `p1` - Developer calls the registry to register the composed domain - `inst-register-domain-call`
3. [ ] - `p1` - System performs action–behavior consistency check against the cardinality matrix for the selected strategy - `inst-cardinality-check`
4. [ ] - `p1` - **IF** the domain's declared actions violate the cardinality matrix row for the strategy - `inst-cardinality-fail-check`
   1. [ ] - `p1` - System rejects the domain registration and returns an error identifying the violated rule - `inst-cardinality-reject`
   2. [ ] - `p1` - **RETURN** domain registration failure - `inst-domain-reg-fail`
5. [ ] - `p1` - System registers the domain with its strategy instance as the mount executor - `inst-domain-registered`
6. [ ] - `p1` - Developer registers an extension entry into the registry (via `cpt-frontx-component-mfe-runtime`), declaring the entry's required properties, supported capabilities, and required domain capabilities - `inst-register-extension`
7. [ ] - `p1` - Developer issues a mount action targeting the registered domain, specifying the extension to admit - `inst-mount-action`
8. [ ] - `p1` - System runs subset-rule contract matching between the extension entry and the target domain - `inst-contract-match`
9. [ ] - `p1` - **IF** contract matching returns any error - `inst-contract-fail-check`
   1. [ ] - `p1` - System rejects the extension admission with an error naming each unsatisfied rule (missing property, unsupported action, or unhandled domain action) - `inst-contract-reject`
   2. [ ] - `p1` - **RETURN** extension admission failure - `inst-admission-fail`
10. [ ] - `p1` - System admits the extension into the domain and delegates to the domain's mount strategy to execute the occupancy behavior - `inst-admitted-mount`
11. [ ] - `p1` - **RETURN** extension mounted successfully - `inst-mount-success`

## 3. Processes / Business Logic (CDSL)

Internal system functions and procedures that do not interact with actors directly.

### Subset-Rule Contract Matching

- [ ] `p1` - **ID**: `cpt-frontx-algo-extension-domain-governance-contract-matching`

**Input**: An extension entry (with declared required properties, supported capabilities, and required domain capabilities) and a target extension domain (with declared shared properties, required extension capabilities, and supported actions).

**Output**: A validation result indicating whether the entry is compatible with the domain, with each unsatisfied containment rule named explicitly.

**Steps**:
1. [ ] - `p1` - Initialise an empty errors list for the result - `inst-cm-init`
2. [ ] - `p1` - **FOR EACH** required property declared by the entry - `inst-cm-rule1-loop`
   1. [ ] - `p1` - **IF** the domain's shared-properties set does not contain this property - `inst-cm-rule1-check`
      1. [ ] - `p1` - Append a missing-property error naming the absent property - `inst-cm-rule1-error`
3. [ ] - `p1` - **FOR EACH** extension-capability action required by the domain of its occupants - `inst-cm-rule2-loop`
   1. [ ] - `p1` - **IF** the entry's supported-actions set does not contain this action - `inst-cm-rule2-check`
      1. [ ] - `p1` - Append an unsupported-action error naming the required but missing action - `inst-cm-rule2-error`
4. [ ] - `p1` - **FOR EACH** domain-capability action required by the entry - `inst-cm-rule3-loop`
   1. [ ] - `p1` - **IF** this action belongs to the infrastructure lifecycle action set (load_ext, mount_ext, unmount_ext) - `inst-cm-rule3-exempt`
      1. [ ] - `p1` - Skip this action (infrastructure lifecycle actions are exempted; they are wired by the runtime, not entry cross-domain requirements) - `inst-cm-rule3-skip`
   2. [ ] - `p1` - **IF** the domain's supported-actions set does not contain this action - `inst-cm-rule3-check`
      1. [ ] - `p1` - Append an unhandled-domain-action error naming the unsupported action - `inst-cm-rule3-error`
5. [ ] - `p1` - **IF** the errors list is non-empty - `inst-cm-invalid-check`
   1. [ ] - `p1` - **RETURN** a validation result with valid=false and the populated errors list - `inst-cm-invalid-return`
6. [ ] - `p1` - **RETURN** a validation result with valid=true and an empty errors list - `inst-cm-valid-return`

### Mount Strategy Selection and Cardinality Validation

- [ ] `p1` - **ID**: `cpt-frontx-algo-extension-domain-governance-strategy-cardinality`

**Input**: An extension domain composed with a named mount strategy and a declared set of lifecycle actions.

**Output**: The domain is either accepted with its strategy instance as the mount executor, or rejected with the specific violated cardinality rule named.

**Steps**:
1. [ ] - `p1` - Identify the mount strategy instance composed inside the domain's implementation factory - `inst-sc-identify-strategy`
2. [ ] - `p1` - **MATCH** the strategy instance type - `inst-sc-match-strategy`
   1. [ ] - `p1` - **CASE** ConcurrentMountStrategy: the domain's action declaration must include mount_ext AND unmount_ext - `inst-sc-concurrent-row`
   2. [ ] - `p1` - **CASE** OptionalMountStrategy: the domain's action declaration must include mount_ext AND unmount_ext - `inst-sc-optional-row`
   3. [ ] - `p1` - **CASE** ExclusiveMountStrategy: the domain's action declaration must include mount_ext AND must NOT include unmount_ext - `inst-sc-exclusive-row`
   4. [ ] - `p1` - **DEFAULT**: the strategy is unrecognized; **RETURN** domain rejected with an unrecognized-strategy error - `inst-sc-unknown-reject`
3. [ ] - `p1` - **FOR EACH** action required by the matched cardinality row - `inst-sc-required-check-loop`
   1. [ ] - `p1` - **IF** the domain's declared actions do not contain this required action - `inst-sc-missing-required`
      1. [ ] - `p1` - **RETURN** domain rejected, naming the missing required action - `inst-sc-required-fail`
4. [ ] - `p1` - **FOR EACH** action forbidden by the matched cardinality row - `inst-sc-forbidden-check-loop`
   1. [ ] - `p1` - **IF** the domain's declared actions contain this forbidden action - `inst-sc-forbidden-present`
      1. [ ] - `p1` - **RETURN** domain rejected, naming the forbidden action that was declared - `inst-sc-forbidden-fail`
5. [ ] - `p1` - **RETURN** domain accepted; the strategy instance is registered as the domain's mount executor - `inst-sc-accept`

### Strategy Mount Execution

- [ ] `p2` - **ID**: `cpt-frontx-algo-extension-domain-governance-mount-execution`

**Input**: An admitted extension identifier, the target domain's strategy instance, and the domain's container hooks and mount-set state from the MFE Registry.

**Output**: The extension is physically mounted into its container according to the domain's occupancy behavior, or an error is returned if mounting fails.

**Steps**:
1. [ ] - `p1` - Retrieve the current set of mounted extensions for the target domain from the registry - `inst-me-get-mounted`
2. [ ] - `p1` - **MATCH** the domain's strategy - `inst-me-match-strategy`
   1. [ ] - `p1` - **CASE** ConcurrentMountStrategy: create a new container for the extension and mount it; if mounting fails, destroy the container and propagate the error - `inst-me-concurrent`
   2. [ ] - `p1` - **CASE** OptionalMountStrategy: **IF** a different extension is already mounted, unmount it and destroy its container before proceeding - `inst-me-optional-displace`
      1. [ ] - `p1` - **IF** the extension is already mounted in this domain, return without action - `inst-me-optional-idempotent`
      2. [ ] - `p1` - Create a new container and mount the extension; if mounting fails, destroy the container and propagate the error - `inst-me-optional-mount`
   3. [ ] - `p1` - **CASE** ExclusiveMountStrategy: **FOR EACH** extension currently mounted in this domain that is not the incoming extension, unmount and destroy its container (eviction) - `inst-me-exclusive-evict`
      1. [ ] - `p1` - **IF** the incoming extension is already the sole mounted extension, return without action - `inst-me-exclusive-idempotent`
      2. [ ] - `p1` - Create a new container and mount the extension; if mounting fails, destroy the container and propagate the error - `inst-me-exclusive-mount`
3. [ ] - `p1` - **RETURN** mount outcome - `inst-me-return`

## 4. States (CDSL)

### Extension Admission Lifecycle

- [ ] `p1` - **ID**: `cpt-frontx-state-extension-domain-governance-admission`

**States**: SUBMITTED, CONTRACT_MATCHED, ADMITTED, MOUNTED, REJECTED

**Initial State**: SUBMITTED

**Transitions**:
1. [ ] - `p1` - **FROM** SUBMITTED **TO** CONTRACT_MATCHED **WHEN** all three subset-rule containment checks pass (no missing properties, no unsupported actions, no unhandled domain actions) - `inst-adm-t1`
2. [ ] - `p1` - **FROM** SUBMITTED **TO** REJECTED **WHEN** any subset-rule containment check fails (contract matching returns at least one error) - `inst-adm-t2`
3. [ ] - `p1` - **FROM** CONTRACT_MATCHED **TO** ADMITTED **WHEN** the domain's cardinality row is already satisfied (domain was admitted at registration time) and the mount strategy accepts the incoming extension - `inst-adm-t3`
4. [ ] - `p1` - **FROM** CONTRACT_MATCHED **TO** REJECTED **WHEN** an internal admission guard vetoes the extension for a strategy-level reason (defensive path; admission normally proceeds after contract match) - `inst-adm-t4`
5. [ ] - `p1` - **FROM** ADMITTED **TO** MOUNTED **WHEN** the domain's strategy mount execution completes without error - `inst-adm-t5`
6. [ ] - `p1` - **FROM** ADMITTED **TO** REJECTED **WHEN** the strategy mount execution fails (error from mounter or container hooks) - `inst-adm-t6`

### Extension Domain Cardinality Lifecycle

- [ ] `p2` - **ID**: `cpt-frontx-state-extension-domain-governance-cardinality`

**States**: UNVALIDATED, VALIDATED, ACTIVE, REJECTED

**Initial State**: UNVALIDATED

**Transitions**:
1. [ ] - `p1` - **FROM** UNVALIDATED **TO** VALIDATED **WHEN** the domain's declared lifecycle actions satisfy the cardinality matrix row for the selected mount strategy (all required actions present, all forbidden actions absent) - `inst-card-t1`
2. [ ] - `p1` - **FROM** UNVALIDATED **TO** REJECTED **WHEN** the domain's declared lifecycle actions violate the cardinality matrix row (missing required action or present forbidden action) or the strategy is unrecognized - `inst-card-t2`
3. [ ] - `p1` - **FROM** VALIDATED **TO** ACTIVE **WHEN** the domain is successfully registered in the MFE Registry with its strategy as the mount executor - `inst-card-t3`

## 5. Definitions of Done

### Contract Enforcement at Admission

- [ ] `p1` - **ID**: `cpt-frontx-dod-extension-domain-governance-contract-enforcement`

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

- [ ] `p1` - **ID**: `cpt-frontx-dod-extension-domain-governance-cardinality-enforcement`

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

- [ ] `p1` - **ID**: `cpt-frontx-dod-extension-domain-governance-default-deny`

The system **MUST** deny extension admission by default: an extension is only mounted into a domain after both contract matching and cardinality validation succeed; no extension gains access to a domain's declared grants without passing the full admission sequence. This satisfies `cpt-frontx-nfr-security` and the default-deny posture described in `cpt-frontx-principle-default-deny-admission`.

**Implements**:
- `cpt-frontx-flow-extension-domain-governance-admission`
- `cpt-frontx-state-extension-domain-governance-admission`

**Constraints**: `cpt-frontx-constraint-mfes-no-layout-domain-values`

**Touches**:
- API: N/A (internal runtime admission path)
- DB: N/A
- Entities: Extension, ExtensionDomain

## 6. Acceptance Criteria

- [ ] Contract matching rejects an extension whose required property is absent from the domain's shared-property set, and the error names the missing property.
- [ ] Contract matching rejects an extension that does not support an action the domain requires of its occupants, and the error names the unsupported action.
- [ ] Contract matching rejects an extension that requires a domain action (excluding infrastructure lifecycle actions) the domain does not support, and the error names the unhandled action.
- [ ] Infrastructure lifecycle actions (load_ext, mount_ext, unmount_ext) appearing in an entry's required-domain-actions set do not by themselves cause contract matching to fail.
- [ ] A domain composed with ConcurrentMountStrategy that declares both mount_ext and unmount_ext is accepted; one that omits either is rejected at registration.
- [ ] A domain composed with OptionalMountStrategy that declares both mount_ext and unmount_ext is accepted; one that omits either is rejected at registration.
- [ ] A domain composed with ExclusiveMountStrategy that declares mount_ext and does not declare unmount_ext is accepted; one that declares unmount_ext is rejected at registration.
- [ ] A domain backed by an unrecognized strategy instance is rejected at registration.
- [ ] No extension-domain name, placement constant, or application-specific vocabulary appears in any admission, matching, or cardinality enforcement code path (satisfies `cpt-frontx-constraint-mfes-no-layout-domain-values`).
- [ ] An extension that passes all admission checks is mounted according to the domain's strategy: ConcurrentMountStrategy mounts side by side; OptionalMountStrategy displaces any prior occupant; ExclusiveMountStrategy evicts all other occupants.
