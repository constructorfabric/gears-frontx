# Feature: GTS Default Type-System Provider


<!-- toc -->

- [1. Feature Context](#1-feature-context)
  - [1.1 Overview](#11-overview)
  - [1.2 Purpose](#12-purpose)
  - [1.3 Actors](#13-actors)
  - [1.4 References](#14-references)
- [2. Actor Flows (CDSL)](#2-actor-flows-cdsl)
  - [Validate MFE Extension Type at Registration](#validate-mfe-extension-type-at-registration)
- [3. Processes / Business Logic (CDSL)](#3-processes--business-logic-cdsl)
  - [Infrastructure Schema and Lifecycle Instance Registration](#infrastructure-schema-and-lifecycle-instance-registration)
  - [Schema Validation](#schema-validation)
  - [Type-Of Hierarchy Resolution](#type-of-hierarchy-resolution)
- [4. States (CDSL)](#4-states-cdsl)
  - [Provider Initialization State Machine](#provider-initialization-state-machine)
- [5. Definitions of Done](#5-definitions-of-done)
  - [Infrastructure Schema Ownership](#infrastructure-schema-ownership)
  - [Type Validation and Hierarchy Resolution](#type-validation-and-hierarchy-resolution)
- [6. Acceptance Criteria](#6-acceptance-criteria)

<!-- /toc -->

- [ ] `p1` - **ID**: `cpt-frontx-featstatus-gts-type-provider`
## 1. Feature Context

- [ ] `p2` - `cpt-frontx-feature-gts-type-provider`

### 1.1 Overview

The GTS Default Type-System Provider (`@cyberfabric/gts-plugin` — target) implements the MFE Runtime's opaque type-substrate port over the Global Type System (GTS) specification, owning the ecosystem's infrastructure schemas and default lifecycle instances, and supplying schema validation and type-of hierarchy resolution ready to use immediately after construction.

### 1.2 Purpose

This feature makes the MFE Runtime ready to validate microfrontends and extensions without requiring every consumer to author a type system. It confines the concrete type-definition specification to a single injectable component, keeping every other Core Framework concern agnostic of the schema format.

**Requirements**: `cpt-frontx-fr-mfe-type-validation`, `cpt-frontx-fr-application-type-definitions`

**Principles**: `cpt-frontx-principle-opaque-type-substrate`

### 1.3 Actors

| Actor | Role in Feature |
|-------|-----------------|
| `cpt-frontx-actor-project-developer` | Wires the provider into the registry factory and registers application type definitions at runtime through the type-substrate port |

### 1.4 References

- **PRD**: [PRD.md](../../PRD.md)
- **Design**: [DESIGN.md](../../DESIGN.md)
- **Dependencies**: `cpt-frontx-feature-type-substrate-port`

## 2. Actor Flows (CDSL)

User-facing interactions that start with an actor (human or external system) and describe the end-to-end flow of a use case. Each flow has a triggering actor and shows how the system responds to actor actions.

**Use cases**: `cpt-frontx-usecase-add-microfrontend-to-project`

### Validate MFE Extension Type at Registration

- [ ] `p1` - **ID**: `cpt-frontx-flow-gts-type-provider-validate-extension-type`

**Actor**: `cpt-frontx-actor-project-developer`

**Success Scenarios**:
- Extension type identifier is recognized and validates successfully; the runtime admits the extension.

**Error Scenarios**:
- Extension type identifier does not derive from the expected base type — runtime rejects the extension with a type-mismatch error.
- Extension instance data does not satisfy the registered schema — runtime rejects the extension with validation errors.
- No schema is registered for the declared type identifier — runtime rejects the extension with an unknown-type error.

**Steps**:
1. [ ] - `p1` - Actor supplies an extension definition to the MFE Runtime with a declared type identifier. - `inst-vt-01`
2. [ ] - `p1` - Runtime delegates type-derivation resolution to the provider: invokes `isTypeOf` with the extension's declared type identifier and the expected infrastructure base type. - `inst-vt-02`
3. [ ] - `p1` - Provider applies the GTS prefix-matching rule to determine whether the declared type derives from the base type. - `inst-vt-03`
4. [ ] - `p1` - **IF** the declared type does not derive from the expected base type: - `inst-vt-04`
   1. [ ] - `p1` - Provider returns a negative derivation result. - `inst-vt-04a`
   2. [ ] - `p1` - Runtime rejects the extension with a type-mismatch error. - `inst-vt-04b`
   3. [ ] - `p1` - **RETURN** rejected extension registration. - `inst-vt-04c`
5. [ ] - `p1` - Runtime delegates instance validation to the provider: invokes `validateInstance` for the extension's instance identifier. - `inst-vt-05`
6. [ ] - `p1` - **IF** no schema is registered for the instance's type: - `inst-vt-06`
   1. [ ] - `p1` - Provider returns a validation failure indicating an unknown type. - `inst-vt-06a`
   2. [ ] - `p1` - Runtime rejects the extension. - `inst-vt-06b`
   3. [ ] - `p1` - **RETURN** rejected extension registration. - `inst-vt-06c`
7. [ ] - `p1` - Provider validates the instance data against the resolved schema. - `inst-vt-07`
8. [ ] - `p1` - **IF** validation fails: - `inst-vt-08`
   1. [ ] - `p1` - Provider returns a failure result with error details. - `inst-vt-08a`
   2. [ ] - `p1` - Runtime rejects the extension with the reported validation errors. - `inst-vt-08b`
   3. [ ] - `p1` - **RETURN** rejected extension registration. - `inst-vt-08c`
9. [ ] - `p1` - Provider returns a validation success result. - `inst-vt-09`
10. [ ] - `p1` - Runtime proceeds to admit the extension. - `inst-vt-10`
11. [ ] - `p1` - **RETURN** successful extension registration. - `inst-vt-11`

## 3. Processes / Business Logic (CDSL)

Internal system functions and procedures that do not interact with actors directly. Examples: database layer operations, authorization logic, middleware, validation routines, library functions, background jobs. These are reusable building blocks called by Actor Flows or other processes.

### Infrastructure Schema and Lifecycle Instance Registration

- [ ] `p1` - **ID**: `cpt-frontx-algo-gts-type-provider-infra-registration`

**Input**: None — executed at construction of the provider.

**Output**: Provider internal store populated with infrastructure schemas and validated default lifecycle stage instances; provider transitions to READY state.

**Steps**:
1. [ ] - `p1` - Create the internal GTS store for schema and instance registration. - `inst-ir-01`
2. [ ] - `p1` - Load the full set of ecosystem infrastructure schema definitions from the declared schema sources (13 schemas: 8 core, 2 MF-specific, 3 extension action schemas). - `inst-ir-02`
3. [ ] - `p1` - **FOR EACH** infrastructure schema in the loaded set: - `inst-ir-03`
   1. [ ] - `p1` - Wrap the schema as a typed entity and register it in the internal GTS store. - `inst-ir-03a`
4. [ ] - `p1` - Load the set of default lifecycle stage instances from the declared instance sources (4 instances: init, activated, deactivated, destroyed). - `inst-ir-04`
5. [ ] - `p1` - **FOR EACH** lifecycle stage instance in the loaded set: - `inst-ir-05`
   1. [ ] - `p1` - Wrap the instance as a typed entity and register it in the internal GTS store. - `inst-ir-05a`
6. [ ] - `p1` - **FOR EACH** registered lifecycle stage instance: - `inst-ir-06`
   1. [ ] - `p1` - Request the GTS store to validate the instance against its corresponding registered schema. - `inst-ir-06a`
   2. [ ] - `p1` - **IF** validation fails: - `inst-ir-06b`
      1. [ ] - `p1` - Abort construction and raise an error that identifies the failing instance and the reported failure reason. - `inst-ir-06b1`
7. [ ] - `p1` - **RETURN** provider ready for use with all infrastructure schemas and lifecycle stage instances registered and validated. - `inst-ir-07`

### Schema Validation

- [ ] `p1` - **ID**: `cpt-frontx-algo-gts-type-provider-schema-validation`

**Input**: `instanceId` — the identifier of a previously registered GTS instance.

**Output**: Validation result — success with an empty error list, or failure with a non-empty error list describing the violation.

**Steps**:
1. [ ] - `p1` - Request the GTS store to validate the registered instance identified by `instanceId` against its schema. - `inst-sv-01`
2. [ ] - `p1` - **IF** the GTS store reports a successful and valid result: - `inst-sv-02`
   1. [ ] - `p1` - **RETURN** a success result with an empty error list. - `inst-sv-02a`
3. [ ] - `p1` - Compose a failure result containing the GTS store's reported error message. - `inst-sv-03`
4. [ ] - `p1` - **RETURN** the failure result. - `inst-sv-04`

### Type-Of Hierarchy Resolution

- [ ] `p1` - **ID**: `cpt-frontx-algo-gts-type-provider-typof-resolution`

**Input**: `typeId` — the type identifier to test; `baseTypeId` — the base type to test derivation against.

**Output**: Boolean — true when `typeId` is identical to or derives from `baseTypeId` in the GTS type hierarchy; false otherwise.

**Steps**:
1. [ ] - `p1` - Apply the GTS prefix-matching derivation rule: in GTS a derived type identifier always starts with its base type identifier. - `inst-tr-01`
2. [ ] - `p1` - **IF** `typeId` equals `baseTypeId` or `typeId` starts with `baseTypeId`: - `inst-tr-02`
   1. [ ] - `p1` - **RETURN** true — the type is the same as or derives from the base type. - `inst-tr-02a`
3. [ ] - `p1` - **RETURN** false — no derivation relationship exists. - `inst-tr-03`

## 4. States (CDSL)

### Provider Initialization State Machine

- [ ] `p1` - **ID**: `cpt-frontx-state-gts-type-provider-init`

**States**: UNINITIALIZED, INFRA_SCHEMAS_REGISTERED, READY

**Initial State**: UNINITIALIZED

**Transitions**:
1. [ ] - `p1` - **FROM** UNINITIALIZED **TO** INFRA_SCHEMAS_REGISTERED **WHEN** all ecosystem infrastructure schemas and default lifecycle stage instances have been registered in the internal GTS store. - `inst-pi-01`
2. [ ] - `p1` - **FROM** INFRA_SCHEMAS_REGISTERED **TO** READY **WHEN** every registered lifecycle stage instance has been validated against its schema without error. - `inst-pi-02`

## 5. Definitions of Done

### Infrastructure Schema Ownership

- [ ] `p1` - **ID**: `cpt-frontx-dod-gts-type-provider-infra-schema-ownership`

The provider **MUST** register all ecosystem infrastructure schemas and default lifecycle stage instances in the internal GTS store at construction time, and **MUST** validate every lifecycle stage instance against its registered schema before the provider is considered ready. Construction **MUST** fail if any lifecycle stage instance does not satisfy its schema. No solution-specific schemas are registered by the provider at construction.

**Implements**:
- `cpt-frontx-algo-gts-type-provider-infra-registration`
- `cpt-frontx-state-gts-type-provider-init`

**Constraints**: `cpt-frontx-constraint-gts-plugin-owns-infra-schemas`, `cpt-frontx-constraint-gts-plugin-excludes-solution-schemas`

**Touches**:
- Component: `cpt-frontx-component-type-system-plugin`
- Interface: `cpt-frontx-interface-type-system`
- Entities: `Schema`, `LifecycleStage`

### Type Validation and Hierarchy Resolution

- [ ] `p1` - **ID**: `cpt-frontx-dod-gts-type-provider-type-validation`

The provider **MUST** validate registered instances against their schemas and resolve type hierarchy by GTS prefix-matching when invoked through the type-substrate port, returning a structured validation result for every call.

**Implements**:
- `cpt-frontx-flow-gts-type-provider-validate-extension-type`
- `cpt-frontx-algo-gts-type-provider-schema-validation`
- `cpt-frontx-algo-gts-type-provider-typof-resolution`

**Constraints**: `cpt-frontx-constraint-gts-plugin-owns-infra-schemas`, `cpt-frontx-constraint-gts-plugin-excludes-solution-schemas`

**Touches**:
- Component: `cpt-frontx-component-type-system-plugin`
- Interface: `cpt-frontx-interface-type-system`
- Entities: `Schema`, `LifecycleStage`

## 6. Acceptance Criteria

- [ ] The GTS provider registers all ecosystem infrastructure schemas and default lifecycle stage instances at construction, making it ready to use immediately after instantiation.
- [ ] Lifecycle stage instances that fail validation during construction cause the provider to abort construction with a descriptive error.
- [ ] `isTypeOf` returns true when the declared type identifier equals or starts with the base type identifier, and false otherwise.
- [ ] `validateInstance` returns a success result for a registered valid instance and a failure result with error details for an invalid or unrecognized instance.
- [ ] The provider owns no solution-specific schemas at construction; application schemas registered at runtime through the port do not affect the infrastructure schema set.
- [ ] The provider is injectable as the type-substrate port implementation in the MFE Registry factory without requiring any consumer-authored type configuration.
