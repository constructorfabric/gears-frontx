# PRD — GTS Type-System Provider (`@gears-frontx/gts-plugin`)


<!-- toc -->

- [1. Overview](#1-overview)
  - [1.1 Purpose](#11-purpose)
  - [1.2 Background / Problem Statement](#12-background--problem-statement)
  - [1.3 Goals (Business Outcomes)](#13-goals-business-outcomes)
  - [1.4 Glossary](#14-glossary)
- [2. Actors](#2-actors)
  - [2.1 Human Actors](#21-human-actors)
  - [2.2 System Actors](#22-system-actors)
- [3. Operational Concept & Environment](#3-operational-concept--environment)
  - [3.1 Module-Specific Environment Constraints](#31-module-specific-environment-constraints)
- [4. Scope](#4-scope)
  - [4.1 In Scope](#41-in-scope)
  - [4.2 Out of Scope](#42-out-of-scope)
- [5. Functional Requirements](#5-functional-requirements)
  - [5.1 Application Type Definitions](#51-application-type-definitions)
  - [5.2 Shared Type Knowledge](#52-shared-type-knowledge)
- [6. Non-Functional Requirements](#6-non-functional-requirements)
  - [6.1 NFR Inclusions](#61-nfr-inclusions)
  - [6.2 NFR Exclusions](#62-nfr-exclusions)
- [7. Public Library Interfaces](#7-public-library-interfaces)
  - [7.1 Public API Surface](#71-public-api-surface)
  - [7.2 External Integration Contracts](#72-external-integration-contracts)
- [8. Use Cases](#8-use-cases)
- [9. Acceptance Criteria](#9-acceptance-criteria)
- [10. Dependencies](#10-dependencies)
- [11. Assumptions](#11-assumptions)
- [12. Risks](#12-risks)

<!-- /toc -->

## 1. Overview

### 1.1 Purpose

`@gears-frontx/gts-plugin` is the ecosystem's default type-system provider. It supplies the concrete GTS type-definition specification, validates entities against type definitions, resolves type-of relationships, registers application-defined definitions at runtime, and provides the default infrastructure type definitions the runtime lifecycle needs. Compatible copies of the provider in a JavaScript realm share what they know, so one runtime can rely on what another registered. This PRD owns the provider's product requirements; ecosystem-level requirements are owned by the [root PRD](../../../architecture/PRD.md), and structural boundaries are owned by this package's [DESIGN](./DESIGN.md).

### 1.2 Background / Problem Statement

The runtime validates microfrontends and extensions against type definitions but deliberately owns no type format. Someone must supply the concrete specification, validation outcomes, type-of resolution, and application registration capability while keeping the provider replaceable. This package is that default provider.

### 1.3 Goals (Business Outcomes)

- **A working type system out of the box** — an application gets validated, typed composition by injecting this provider, with no type-system assembly work. Target: zero provider-side configuration beyond injection; Timeframe: first platform release.
- **The specification stays replaceable** — the concrete format is confined to this package, so an application can adopt a different conforming provider without runtime changes. Target: zero type-format leakage outside this package; Timeframe: ongoing.

### 1.4 Glossary

This PRD uses the root PRD's vocabulary ([root PRD §1.4](../../../architecture/PRD.md#14-glossary)) for *application*; *microfrontend* and *extension* are defined by the [mfes PRD §1.4](../../mfes/architecture/PRD.md#14-glossary). Defined here: a **type definition** is a named contract used to validate entities and extensions; **GTS** is the concrete type-definition specification this provider implements.

## 2. Actors

### 2.1 Human Actors

#### Application Developer

**ID**: `cpt-frontx-gts-plugin-actor-application-developer`

**Role**: Makes the provider available to the runtime and registers the application's own type definitions. Fills the root PRD's Project Developer role (`cpt-frontx-actor-project-developer`) at the type-system surface.
**Needs**: Runtime registration of application-defined types, and validation errors that name the violated definition.

### 2.2 System Actors

#### MFE Runtime

**ID**: `cpt-frontx-gts-plugin-actor-mfe-runtime`

**Role**: The runtime consumer of this provider (`@gears-frontx/mfes`). It relies on the provider for validation, type-of resolution, and application type registration.

## 3. Operational Concept & Environment

The provider is made available to the runtime by the application. From then on, the runtime can use it for type validation and type-of resolution, and the application can register its own definitions through the provider.

A composed application runs several copies of the provider in one JavaScript realm: one in the host, and one in each microfrontend whose code imports it. Copies that use the same store format, the same GTS library version and the same built-in type definitions share one store of type knowledge, whatever their release. A definition or instance registered through any of them is known to all of them, and a runtime may rely on it. A copy that differs in any of the three keeps a separate store and reports that it does. A provider instance constructed with the isolation option keeps a private store.

### 3.1 Module-Specific Environment Constraints

- Must remain compatible with the runtime type-system expectations declared by `@gears-frontx/mfes`.
- Must keep GTS-specific behavior replaceable by a conforming alternative provider.

## 4. Scope

### 4.1 In Scope

- Supplying the GTS specification as the default provider format.
- Validation of entities against type definitions.
- Type-of resolution for handler matching.
- Application-defined type definitions registered at runtime.
- Default infrastructure type definitions the runtime's lifecycle model uses.
- Sharing registered type knowledge among compatible copies of the provider in one realm, with an option for an instance to keep a private store.

### 4.2 Out of Scope

- The runtime's provider boundary and structural contract (owned by the [mfes DESIGN](../../mfes/architecture/DESIGN.md) and this package's [DESIGN](./DESIGN.md)).
- Microfrontend registration, admission, and mounting (owned by the [mfes PRD](../../mfes/architecture/PRD.md)).
- Any UI or application-domain schema content.

## 5. Functional Requirements

### 5.1 Application Type Definitions

#### Application-defined type definitions with runtime registration

- [ ] `p1` - **ID**: `cpt-frontx-fr-application-type-definitions`

The system **MUST** allow an application to use type definitions for its own entities. The system **MUST** allow additional type definitions to be registered at runtime.

**Threshold**: One application supports at least 500 registered type definitions without architectural failure.

**Rationale**: Lets an application extend the shared vocabulary it uses with its microfrontends, so the product grows with the application's own domain rather than being fixed at build time.

**Actors**: `cpt-frontx-actor-project-developer`

#### Entity validation against type definitions

- [ ] `p1` - **ID**: `cpt-frontx-fr-gts-type-validation`

The system **MUST** validate entities against GTS type definitions and report whether the entity satisfies the requested definition.

**Rationale**: Runtime composition depends on reliable contract checks before a microfrontend or extension is admitted.

**Actors**: `cpt-frontx-actor-project-developer`

#### Type-of relationship resolution

- [ ] `p1` - **ID**: `cpt-frontx-fr-gts-type-of-resolution`

The system **MUST** resolve type-of relationships among registered type definitions so consumers can determine whether an entity can be handled as a requested type.

**Rationale**: Handler matching needs a product-level guarantee that type relationships are knowable without applications duplicating type rules.

**Actors**: `cpt-frontx-actor-project-developer`

#### Default infrastructure type definitions

- [ ] `p1` - **ID**: `cpt-frontx-fr-gts-default-infrastructure-types`

The system **MUST** provide the default infrastructure type definitions required by the runtime lifecycle model. These provider-owned defaults are separate from application-defined type definitions registered by a consuming application.

**Rationale**: A project should receive a working baseline type system while still being able to add its own application vocabulary.

**Actors**: `cpt-frontx-actor-project-developer`

### 5.2 Shared Type Knowledge

#### Realm-shared type knowledge

- [ ] `p2` - **ID**: `cpt-frontx-fr-gts-realm-shared-type-store`

The system **MUST** make a type definition or instance registered through one provider instance known to every provider instance in the same JavaScript realm whose copy uses the same store format, the same GTS library version and the same built-in type definitions. A runtime **MAY** rely on such a registration without registering it again. The system **MUST NOT** share between copies that differ in any of the three, and **MUST** report when a realm comes to hold more than one store. When a definition a runtime relies on is missing, the system **MUST** report the missing identifier and the store it searched. A type definition registered under an identifier the store already holds **MUST NOT** replace the definition held there. Identical content **MUST** change nothing and report nothing. Different content **MUST** be reported to the developer as a conflict. A provider instance constructed with the isolation option **MUST** keep a private store.

**Threshold**: A definition registered once is known to every runtime on the same store, with zero further registrations, and a runtime relies on it without registering it itself.

**Rationale**: A composed application runs several copies of the provider, one in each runtime that evaluates it. Without sharing, no runtime can rely on what another registered, each runtime registers again every definition it uses, and what one runtime knows stays invisible to the rest.

**Actors**: `cpt-frontx-actor-project-developer`

## 6. Non-Functional Requirements

### 6.1 NFR Inclusions

The ecosystem-wide NFRs are owned by the [root PRD §6.1](../../../architecture/PRD.md#61-nfr-inclusions); the runtime's admission-performance and security posture by the [mfes PRD §6.1](../../mfes/architecture/PRD.md#61-nfr-inclusions).

#### Replaceable Default Provider

- [x] `p1` - **ID**: `cpt-frontx-gts-plugin-nfr-standalone`

The system **MUST** keep the default GTS provider independently adoptable and replaceable by another conforming provider without requiring consuming applications to change their runtime composition requirements.

**Threshold**: GTS-specific behavior remains confined to this provider's product surface and documented as provider-owned behavior.

**Rationale**: Replaceability is the reason the concrete GTS specification belongs in a provider package rather than in the runtime or application requirements.

### 6.2 NFR Exclusions

The root PRD's §6.2 exclusions (safety, privacy, accessibility, internationalization, inclusivity, regulatory compliance) apply here for the same reasons stated there.

## 7. Public Library Interfaces

### 7.1 Public API Surface

#### Type System

- [ ] `p1` - **ID**: `cpt-frontx-interface-type-system`

**Type**: Library

**Stability**: unstable

**Description**: The Type System provides the default GTS specification, validates entities against type definitions, resolves type-of relationships, supplies default infrastructure type definitions, and lets an application use type definitions for its own entities with additional type definitions registered at runtime.

**Documentation Obligation**: The public provider surface **MUST** document the provider-facing interface, how applications use runtime registration through the injected provider, and the isolation option for an instance that must keep a private store.

**Breaking Change Policy**: A major version bump is required for any incompatible change to the component's public surface; minor and patch versions preserve backward compatibility.

### 7.2 External Integration Contracts

None owned here. The package is distributed under the root PRD's package-registry distribution contract (`cpt-frontx-contract-package-registry-distribution`); provider structure is described by this package's [DESIGN](./DESIGN.md).

## 8. Use Cases

#### Application Developer registers the application's own types

- [ ] `p2` - **ID**: `cpt-frontx-gts-plugin-usecase-register-application-types`

**Actor**: `cpt-frontx-gts-plugin-actor-application-developer`

**Preconditions**:
- A host application exists with the provider injected into the runtime's registry.

**Main Flow**:
1. The Application Developer starts from the provider-owned default infrastructure type definitions (`cpt-frontx-fr-gts-default-infrastructure-types`).
2. The Application Developer defines schemas for the application's own entities in the provider's specification.
3. The Application Developer registers those definitions at runtime through the provider (`cpt-frontx-fr-application-type-definitions`).
4. Microfrontends registered afterwards validate against the application's definitions as well as the default infrastructure definitions (`cpt-frontx-fr-gts-type-validation`).
5. Consumers resolve type-of relationships for handler matching (`cpt-frontx-fr-gts-type-of-resolution`).

**Postconditions**:
- The application's vocabulary is part of the type substrate; admission decisions account for it.

**Alternative Flows**:
- **Malformed definition**: registration is refused with an error naming the defect; the substrate is unchanged.

## 9. Acceptance Criteria

- [ ] An application can register its own type definitions at runtime and have subsequent admissions validate against them — verifiable via `cpt-frontx-fr-application-type-definitions`.
- [ ] Entities can be validated against GTS type definitions — verifiable via `cpt-frontx-fr-gts-type-validation`.
- [ ] Type-of relationships can be resolved for handler matching — verifiable via `cpt-frontx-fr-gts-type-of-resolution`.
- [ ] Provider-owned default infrastructure type definitions are available separately from application-defined registrations — verifiable via `cpt-frontx-fr-gts-default-infrastructure-types` and `cpt-frontx-fr-application-type-definitions`.
- [ ] A type definition or instance registered through one provider instance can be relied on by every runtime on the same store; a later conflicting definition of the same type leaves it unchanged and is reported; a missing definition is reported with the store searched; and an isolated instance keeps a private store — verifiable via `cpt-frontx-fr-gts-realm-shared-type-store`.
- [ ] The default GTS provider remains independently adoptable and replaceable by a conforming alternative provider without changing consuming applications' runtime composition requirements — verifiable via `cpt-frontx-gts-plugin-nfr-standalone`.

## 10. Dependencies

| Dependency | Description | Criticality |
|------------|-------------|-------------|
| `@gears-frontx/mfes` | Runtime consumer that relies on this provider for type validation and type-of resolution. | p1 |

## 11. Assumptions

- Independently loaded copies of the provider in one realm may come from different releases. They share a store when they agree on the store format, the GTS library version and the built-in type definitions, whatever their release.
- An application that relies on sharing keeps its runtimes on provider copies that open the same store.
- A runtime that relies on another runtime's registration runs after that registration. The runtime's own order provides this for targets: the host registers a domain before it mounts an extension into it.

## 12. Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| The GTS specification changes incompatibly. | Applications with registered schemas face migration. | The specification is confined to this provider's product surface; the evolvability requirement's deprecation cycle applies to the provider's own major line. |
| The first runtime to register a type identifier decides its definition for every runtime on that store. | A runtime that registers a different definition later validates against the first one. A shell that registers microfrontend schemas from copies taken at its own build wins over a redeployed microfrontend. Template-owned schemas collide across template releases. | A type identifier names its version, so different content under one identifier is a defect in a definition. The provider reports the conflict with both definitions and the copies involved. |
| Runtimes whose provider copies differ in store format, GTS library version or built-in definitions share nothing. | A runtime that relies on another runtime's registration does not find it. | The provider warns when a realm opens a second store, and names the store in every missing-definition error. |
| A runtime replaces an instance another runtime registered under the same identifier. | A manifest or entry looked up by identifier is read with the later content in every runtime on that store. | The provider warns when one runtime replaces different content another runtime wrote. Instance identifiers must be unique across the runtimes of an application. |
