---
cpt: true
kind: FEATURE
system: frontx
slug: type-substrate-port
---

# Feature: Opaque Type-Substrate Port


<!-- toc -->

- [1. Feature Context](#1-feature-context)
  - [1.1 Overview](#11-overview)
  - [1.2 Purpose](#12-purpose)
  - [1.3 Actors](#13-actors)
  - [1.4 References](#14-references)
- [2. Actor Flows (CDSL)](#2-actor-flows-cdsl)
  - [Register Application Type Definitions and Validate MFE](#register-application-type-definitions-and-validate-mfe)
- [3. Processes / Business Logic (CDSL)](#3-processes--business-logic-cdsl)
  - [Schema Validation Port Delegation](#schema-validation-port-delegation)
  - [Type-Of Resolution](#type-of-resolution)
- [4. States (CDSL)](#4-states-cdsl)
  - [Schema Registration Lifecycle](#schema-registration-lifecycle)
- [5. Definitions of Done](#5-definitions-of-done)
  - [Port Contract Extraction into @cyberfabric/mfes](#port-contract-extraction-into-cyberfabricmfes)
  - [Opaque Boundary Enforcement](#opaque-boundary-enforcement)
  - [Validation and Hierarchy Delegation](#validation-and-hierarchy-delegation)
- [6. Acceptance Criteria](#6-acceptance-criteria)

<!-- /toc -->

- [ ] `p1` - **ID**: `cpt-frontx-featstatus-type-substrate-port`
## 1. Feature Context

- [ ] `p2` - `cpt-frontx-feature-type-substrate-port`

### 1.1 Overview

Defines and extracts the MFE Runtime's opaque type-substrate port — the narrow interface through which the runtime reasons about types solely by identity, delegating every schema registration, validation, and type-hierarchy operation to an injected provider, keeping the runtime independent of any concrete type-definition specification.

### 1.2 Purpose

The MFE Runtime must validate microfrontends and their extensions against type definitions and resolve type hierarchies for handler selection, yet it must carry no concrete type-format knowledge. This feature establishes the opaque port contract that makes this possible — `TypeSystemPlugin` — and extracts it from `packages/screensets` into the published `@cyberfabric/mfes` package, hardening the MFES-1, MFES-4, and MFES-5 boundaries so they are CI-enforceable invariants.

**Requirements**: `cpt-frontx-fr-application-type-definitions`, `cpt-frontx-fr-mfe-type-validation`

**Principles**: `cpt-frontx-principle-opaque-type-substrate`, `cpt-frontx-principle-agnostic-core`

### 1.3 Actors

| Actor | Role in Feature |
|-------|-----------------|
| `cpt-frontx-actor-project-developer` | Supplies application type definitions to the port and registers microfrontends that are admitted only after type validation through the port |

### 1.4 References

- **PRD**: [PRD.md](../../PRD.md)
- **Design**: [DESIGN.md](../../DESIGN.md)
- **ADRs**: `cpt-frontx-adr-type-system-plugin-opaque-schema`, `cpt-frontx-adr-core-package-boundaries`
- **Dependencies**: None

## 2. Actor Flows (CDSL)

User-facing interactions that start with an actor (human or external system) and describe the end-to-end flow of a use case. Each flow has a triggering actor and shows how the system responds to actor actions.

**Use cases**: `cpt-frontx-usecase-add-microfrontend-to-project`

### Register Application Type Definitions and Validate MFE

- [ ] `p1` - **ID**: `cpt-frontx-flow-type-substrate-port-register-validate`

**Actor**: `cpt-frontx-actor-project-developer`

**Success Scenarios**:
- Developer supplies application schemas and registers a microfrontend; runtime validates the MFE through the opaque port and admits it for further lifecycle operations

**Error Scenarios**:
- Developer registers a microfrontend whose declared type identifier has no corresponding schema in the port; validation fails and the runtime rejects the MFE with error details
- Developer registers a microfrontend whose type does not satisfy the required base type; hierarchy check fails and the runtime rejects the MFE

**Steps**:
1. [ ] - `p1` - Developer supplies application-specific type definition schemas to the injected type-substrate port - `inst-supply-schemas`
2. [ ] - `p1` - Port records each schema by its identifier (opaque string; runtime has no access to schema structure) - `inst-port-register`
3. [ ] - `p1` - Developer configures the MFE runtime with the injected type-substrate port at construction time - `inst-configure-runtime`
4. [ ] - `p1` - Developer registers a microfrontend with the runtime, providing its declared type identifier - `inst-register-mfe`
5. [ ] - `p1` - Runtime extracts the declared type identifier from the microfrontend entry as an opaque string (no schema structure accessed) - `inst-extract-type-id`
6. [ ] - `p1` - Runtime delegates entity validation to the port, passing only the opaque type identifier - `inst-delegate-validate`
7. [ ] - `p1` - **IF** validation fails: - `inst-check-valid`
   1. [ ] - `p1` - Runtime collects structured error details from the port result - `inst-collect-errors`
   2. [ ] - `p1` - Runtime rejects the microfrontend and surfaces error details to the developer - `inst-reject-mfe`
   3. [ ] - `p1` - **RETURN** rejection result with validation error details - `inst-return-reject`
8. [ ] - `p1` - Runtime delegates type-hierarchy check to the port, confirming the MFE type satisfies the required base type - `inst-delegate-is-type-of`
9. [ ] - `p1` - **IF** hierarchy check fails: - `inst-check-hierarchy`
   1. [ ] - `p1` - Runtime rejects the microfrontend with a type-mismatch reason - `inst-reject-hierarchy`
   2. [ ] - `p1` - **RETURN** rejection result - `inst-return-hierarchy-reject`
10. [ ] - `p1` - Runtime admits the microfrontend for subsequent lifecycle operations - `inst-admit-mfe`
11. [ ] - `p1` - **RETURN** admission success to caller - `inst-return-success`

## 3. Processes / Business Logic (CDSL)

Internal system functions and procedures that do not interact with actors directly. These are reusable building blocks called by Actor Flows or other processes.

### Schema Validation Port Delegation

- [ ] `p2` - **ID**: `cpt-frontx-algo-type-substrate-port-schema-validation-delegation`

**Input**: Microfrontend entry carrying a declared type identifier; required base type identifier

**Output**: Validation outcome — admitted or rejected with structured error details

**Steps**:
1. [ ] - `p1` - Receive declared type identifier from microfrontend entry as an opaque string - `inst-recv-type-id`
2. [ ] - `p1` - Delegate instance validation to the injected port using the opaque type identifier (runtime performs no schema interpretation) - `inst-call-validate`
3. [ ] - `p1` - **IF** port returns a validation failure: - `inst-check-port-result`
   1. [ ] - `p1` - Collect structured error details from the port result - `inst-collect-port-errors`
   2. [ ] - `p1` - **RETURN** rejection outcome with error details - `inst-return-failure`
4. [ ] - `p1` - Delegate type-hierarchy check to the port, passing declared type identifier and required base type identifier - `inst-call-is-type-of`
5. [ ] - `p1` - **IF** hierarchy check returns false: - `inst-check-hierarchy-result`
   1. [ ] - `p1` - **RETURN** rejection outcome indicating type mismatch - `inst-return-type-mismatch`
6. [ ] - `p1` - **RETURN** admission outcome (validation and hierarchy both resolved through the port) - `inst-return-admitted`

### Type-Of Resolution

- [ ] `p2` - **ID**: `cpt-frontx-algo-type-substrate-port-type-of-resolution`

**Input**: Declared type identifier; required base type identifier (both opaque strings)

**Output**: Boolean indicating whether the declared type satisfies the base type

**Steps**:
1. [ ] - `p1` - Receive declared type identifier and required base type identifier as opaque strings - `inst-recv-ids`
2. [ ] - `p1` - Delegate hierarchy resolution to the injected port (runtime performs no identifier parsing, grammar interpretation, or format knowledge) - `inst-delegate-hierarchy`
3. [ ] - `p1` - **RETURN** the boolean result received from the port unchanged - `inst-return-bool`

## 4. States (CDSL)

Include when entities have explicit lifecycle states.

### Schema Registration Lifecycle

- [ ] `p2` - **ID**: `cpt-frontx-state-type-substrate-port-schema-lifecycle`

**States**: UNREGISTERED, REGISTERED, SUPERSEDED

**Initial State**: UNREGISTERED

**Transitions**:
1. [ ] - `p1` - **FROM** UNREGISTERED **TO** REGISTERED **WHEN** the application supplies the schema and the port records it by its identifier - `inst-transition-register`
2. [ ] - `p1` - **FROM** REGISTERED **TO** SUPERSEDED **WHEN** a schema with the same identifier is re-registered, replacing the prior record - `inst-transition-supersede`

## 5. Definitions of Done

Specific implementation tasks derived from flows and algorithms above.

### Port Contract Extraction into @cyberfabric/mfes

- [ ] `p1` - **ID**: `cpt-frontx-dod-type-substrate-port-port-contract-extraction`

The system **MUST** define and ship the `TypeSystemPlugin` port contract in `@cyberfabric/mfes`, extracted from `packages/screensets/src/mfe/plugins/types.ts`, so the opaque type-substrate port is the sole published surface that MFE Runtime consumers depend on.

**Implements**:
- `cpt-frontx-flow-type-substrate-port-register-validate`

**Constraints**: `cpt-frontx-constraint-mfes-opaque-schema-surface`

**Touches**:
- Entities: `Schema`

### Opaque Boundary Enforcement

- [ ] `p1` - **ID**: `cpt-frontx-dod-type-substrate-port-opaque-boundary`

The system **MUST** ensure the MFE runtime holds the type-substrate port exclusively through the port interface, carrying no concrete type-definition format literals, no schema field access beyond the identifier, and no format-specific import or dependency — enforced as a CI-checkable invariant.

**Implements**:
- `cpt-frontx-flow-type-substrate-port-register-validate`

**Constraints**: `cpt-frontx-constraint-mfes-no-type-format-literals`, `cpt-frontx-constraint-mfes-no-type-format-dependency`

**Touches**:
- Entities: `Schema`

### Validation and Hierarchy Delegation

- [ ] `p1` - **ID**: `cpt-frontx-dod-type-substrate-port-validation-delegation`

The system **MUST** delegate every schema validation and type-hierarchy-resolution operation to the injected port and **MUST NOT** perform any local schema interpretation, format parsing, or direct schema field inspection inside the runtime.

**Implements**:
- `cpt-frontx-algo-type-substrate-port-schema-validation-delegation`
- `cpt-frontx-algo-type-substrate-port-type-of-resolution`

**Constraints**: `cpt-frontx-constraint-mfes-opaque-schema-surface`

**Touches**:
- Entities: `Schema`

## 6. Acceptance Criteria

- [ ] The `TypeSystemPlugin` port contract is published from `@cyberfabric/mfes` (target: extracted from `packages/screensets/src/mfe/plugins/types.ts`)
- [ ] A CI boundary check on MFE runtime source returns 0 hits for any concrete type-definition format literals, schema field access beyond identifier, or format-specific imports
- [ ] A conforming `TypeSystemPlugin` implementation can be injected into the runtime without any runtime modification
- [ ] The runtime correctly rejects a microfrontend whose declared type identifier fails port validation, surfacing port-supplied error details to the caller
- [ ] The runtime correctly resolves type hierarchy through the port for handler-selection decisions, without local identifier parsing
- [ ] GATE A: No references to the pre-ecosystem-redesign archive or the internal surface inventory document appear in this artifact (CI-checkable invariant)
