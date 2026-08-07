# PRD — Microfrontend (MFE) Runtime (`@gears-frontx/mfes`)


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
  - [5.1 Runtime Composition](#51-runtime-composition)
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

`@gears-frontx/mfes` is the ecosystem's runtime substrate: the published library that makes a frontend application runtime-extensible by composable microfrontends. It registers microfrontends with a running application, loads them on demand, places them into governed extension domains, mediates their communication with the host, and validates every unit against type definitions before it is admitted to run. This PRD owns the runtime's requirements; the ecosystem-level requirements that bind every published library are owned by the [root PRD](../../../architecture/PRD.md).

### 1.2 Background / Problem Statement

A composed application gains user-facing functionality from independently developed units at runtime. Without a contracted runtime substrate, each application would improvise its own loading, placement, and communication conventions, and an AI agent assembling such an application would have no stable surface to target. The runtime substrate closes that gap: one registration facade, one admission discipline, one communication mediator — the same in every FrontX application.

### 1.3 Goals (Business Outcomes)

- **Runtime extensibility without redeployment** — an application gains, replaces, or removes user-facing functionality by registering microfrontends at runtime, never by rebuilding the host. Target: zero host redeployments required to change a composed application's unit set; Timeframe: first platform release.
- **Contract violations surface at integration time** — a unit that does not match its extension domain's contract is refused at registration, not discovered by end users. Target: 100% of admitted units validated at admission; Timeframe: first platform release.

### 1.4 Glossary

This PRD uses the root PRD's shared vocabulary ([root PRD §1.4](../../../architecture/PRD.md#14-glossary)) for *application*; *type definition* is defined by the [gts-plugin PRD §1.4](../../gts-plugin/architecture/PRD.md#14-glossary). Runtime terms are defined here.

| Term | Definition |
|------|------------|
| microfrontend | An independently developed frontend unit that a running application can register and load. |
| extension | A contributed capability or UI element admitted into a host through a declared contract. |
| extension domain | A named host-owned slot with rules for what extensions it admits and how admitted occupants are placed. |
| platform | The combined runtime substrate and host contracts that let an application admit, place, and coordinate microfrontends. |

## 2. Actors

### 2.1 Human Actors

#### Application Developer

**ID**: `cpt-frontx-mfes-actor-application-developer`

**Role**: Builds the host application on the runtime — declares extension domains, registers microfrontends and extensions, and wires the injected type-system provider. Fills the root PRD's Project Developer role (`cpt-frontx-actor-project-developer`) at the runtime surface.
**Needs**: A stable registration facade, predictable admission rules, and no coupling between the runtime and the UI framework the application chose.

#### Microfrontend Developer

**ID**: `cpt-frontx-mfes-actor-microfrontend-developer`

**Role**: Authors the independently developed units the runtime loads — their entry points, declared base types, and the contracts their extensions carry. Fills the root PRD's Template Developer role (`cpt-frontx-actor-template-developer`) where a template contributes a microfrontend.
**Needs**: A narrow host-communication bridge, explicit domain contracts to develop against, and admission errors that name the violated contract.

### 2.2 System Actors

#### Type-System Provider

**ID**: `cpt-frontx-mfes-actor-type-system-provider`

**Role**: Supplies type validation, type-of resolution, and application type registration for runtime admission decisions.

#### Browser Runtime

**ID**: `cpt-frontx-mfes-actor-browser-runtime`

**Role**: Supplies the browser capabilities the runtime requires for loading and placing microfrontends.

## 3. Operational Concept & Environment

The runtime operates inside a composed FrontX application in the browser. The host application creates the registry with a type-system provider injected, declares its extension domains, and registers microfrontends and extensions; the runtime loads units on demand and mounts admitted extensions into their domains.

### 3.1 Module-Specific Environment Constraints

- Requires a browser environment with dynamic `import()` for on-demand loading.
- Requires a current evergreen browser baseline that supports dynamic module loading, standard DOM placement, and modern JavaScript execution used by frontend applications.
- UI-framework-agnostic by construction: the runtime must not depend on, or assume, any UI framework (root PRD `cpt-frontx-fr-ui-framework-agnostic`).
- Type-format-agnostic by construction: the runtime holds no concrete type-definition specification.

## 4. Scope

### 4.1 In Scope

- Microfrontend registration with a running application and on-demand loading.
- Multiple microfrontends per extension domain where the domain permits multiple occupants.
- Microfrontend–host communication and host-state reaction through a mediated bridge.
- Type validation of microfrontends and their extensions at registration.
- Extension-domain governance: domain admission, placement expectations, occupant limits, and contract matching.
- Isolation of loaded units.

### 4.2 Out of Scope

- The concrete type-definition specification and its validation engine (owned by the type-system provider, `packages/gts-plugin`).
- Application-defined type registration requirements (owned by the [gts-plugin PRD](../../gts-plugin/architecture/PRD.md)).
- Project scaffolding, templates, and lifecycle tooling (projects orchestration layer).
- UI component libraries, state management, and layout choices (root PRD §4.2).

## 5. Functional Requirements

### 5.1 Runtime Composition

#### Microfrontend runtime registration and on-demand loading

- [x] `p1` - **ID**: `cpt-frontx-fr-mfe-runtime-registration`

The system **MUST** allow microfrontends to be registered with a running application and loaded on demand.

**Rationale**: Lets an application gain user-facing functionality from independently-developed units at runtime, without rebuilding or redeploying the host.

**Actors**: `cpt-frontx-actor-template-developer`, `cpt-frontx-actor-project-developer`

#### Multiple microfrontends per extension domain

- [x] `p1` - **ID**: `cpt-frontx-fr-mfe-multi-occupant-domain`

The system **MUST** allow multiple microfrontends to occupy the same extension domain when that domain permits multiple occupants.

**Rationale**: Enables modular layouts and side-by-side experiences within a single extension point, so teams can compose richer screens without contention over a shared slot.

**Actors**: `cpt-frontx-actor-project-developer`

#### Extension-domain governance

- [ ] `p1` - **ID**: `cpt-frontx-fr-mfe-extension-domain-governance`

The system **MUST** allow a host application to define extension domains with admission rules, placement expectations, occupant limits, and required contracts. The system **MUST** admit only microfrontends and extensions that satisfy the target domain's requirements.

**Rationale**: Domain governance lets applications compose independently developed units without turning extension points into unbounded or ambiguous placement areas.

**Actors**: `cpt-frontx-actor-project-developer`, `cpt-frontx-actor-template-developer`

#### Microfrontend–host communication and host-state reaction

- [ ] `p1` - **ID**: `cpt-frontx-fr-mfe-host-communication`

The system **MUST** allow microfrontends to communicate with the host application. The system **MUST** separately allow microfrontends to react to changes in the host application's state.

**Rationale**: Enables coordinated behavior across independently-deployed units, so a composed application behaves as one product rather than disconnected fragments.

**Actors**: `cpt-frontx-actor-template-developer`, `cpt-frontx-actor-project-developer`

#### On-demand load failure handling

- [ ] `p2` - **ID**: `cpt-frontx-fr-mfe-load-failure-handling`

When an on-demand load fails, the system **MUST** leave the host application usable, surface diagnostics that identify the affected microfrontend or extension domain when known, and allow the developer or host application to retry or recover without rebuilding the host.

**Rationale**: Runtime extensibility is only dependable if failed units degrade gracefully and produce actionable diagnostics.

**Actors**: `cpt-frontx-actor-project-developer`

#### Microfrontend and extension validation at registration

- [x] `p1` - **ID**: `cpt-frontx-fr-mfe-type-validation`

The system **MUST** validate microfrontends and their extensions against type definitions at the time they are registered with the application.

**Rationale**: Surfaces contract violations at the moment of integration rather than later in front of users, lowering the cost and risk of composing third-party units.

**Actors**: `cpt-frontx-actor-template-developer`, `cpt-frontx-actor-project-developer`

## 6. Non-Functional Requirements

### 6.1 NFR Inclusions

#### Runtime performance

- [x] `p1` - **ID**: `cpt-frontx-nfr-runtime-performance`

The system **MUST** meet measurable response-time and throughput targets for runtime operations.

**Thresholds**:
- Registration latency: microfrontend registration completes in ≤ 50 ms at p95 per registration call.
- On-demand load latency: load completes in ≤ 1500 ms at p95 from request to the microfrontend being loaded and placed.
- Registration throughput: the application sustains ≥ 20 registration calls per second without p95 latency exceeding these targets.
- Concurrent scale: one application supports at least 100 concurrently registered microfrontends without architectural failure.

**Rationale**: Predictable runtime performance is required for AI agents that compose applications from many microfrontends at scale.

#### Security

- [x] `p1` - **ID**: `cpt-frontx-nfr-security`

**Thresholds**:
- Admission: 100% of admitted microfrontends and extensions pass validation before running.
- Access posture: a microfrontend receives no host state or capability beyond what its extension domain explicitly grants.
- Isolation: a microfrontend receives no implicit access to other microfrontends.
- Default deny: denied or unvalidated units are not admitted or placed.

**Rationale**: Running independently-developed microfrontends — potentially from different teams or vendors — within one host makes default-deny access and admission validation essential for the trust enterprises require.

### 6.2 NFR Exclusions

The ecosystem-wide NFRs — evolvability and scaling without an architectural ceiling — bind this package but are owned by the [root PRD §6.1](../../../architecture/PRD.md#61-nfr-inclusions) (`cpt-frontx-nfr-evolvability`, `cpt-frontx-nfr-scalability-ceiling`): they govern every published member equally, so no member owns them. The root PRD's §6.2 exclusions (safety, privacy, accessibility, internationalization, inclusivity, regulatory compliance) apply here for the same reasons stated there.

## 7. Public Library Interfaces

### 7.1 Public API Surface

#### MFE Runtime

- [ ] `p1` - **ID**: `cpt-frontx-interface-mfe-runtime`

**Type**: Library

**Stability**: unstable

**Description**: The MFE Runtime registers microfrontends with a running application and loads them on demand, governs extension-domain admission and placement outcomes, lets multiple microfrontends occupy the same extension domain when that domain permits multiple occupants, mediates communication between microfrontends and the host application and lets microfrontends react to changes in the host application's state, handles on-demand load failures with diagnostics and recovery outcomes, and validates microfrontends and their extensions against type definitions when they are registered.

**Documentation Obligation**: The public runtime surface **MUST** document extension-domain and admission concepts, plus host integration use at interface level.

**Breaking Change Policy**: A major version bump is required for any incompatible change to the component's public surface; minor and patch versions preserve backward compatibility.

### 7.2 External Integration Contracts

None owned here. The package is distributed under the root PRD's package-registry distribution contract (`cpt-frontx-contract-package-registry-distribution`), and its type-provider boundary is described by this package's [DESIGN](./DESIGN.md), not an external contract.

## 8. Use Cases

#### Application Developer composes a screen from independently developed units

- [ ] `p2` - **ID**: `cpt-frontx-mfes-usecase-compose-runtime-screen`

**Actor**: `cpt-frontx-mfes-actor-application-developer`

**Preconditions**:
- A host application exists with the runtime installed and a type-system provider injected.
- One or more microfrontends are available with declared base types.

**Main Flow**:
1. The Application Developer declares an extension domain with admission rules, placement expectations, occupant limits, and a contract (`cpt-frontx-fr-mfe-extension-domain-governance`).
2. The Application Developer registers microfrontends and their extensions (`cpt-frontx-fr-mfe-runtime-registration`).
3. The runtime validates each unit and extension against type definitions at registration (`cpt-frontx-fr-mfe-type-validation`).
4. Admitted extensions are loaded on demand and placed into the domain; occupants communicate with the host and react to host-state changes (`cpt-frontx-fr-mfe-host-communication`).

**Postconditions**:
- The screen is composed from admitted units only; each occupant holds exactly the capabilities its domain granted.

**Alternative Flows**:
- **Validation fails**: the runtime refuses admission and reports the violated contract; the unit is not placed.
- **Domain at capacity**: the runtime applies the domain's occupant limit and placement expectations; the new occupant is either admitted according to the domain's rules or refused.
- **On-demand load fails**: the host remains usable, diagnostics identify the affected unit or domain when known, and the application can retry or recover without rebuilding the host (`cpt-frontx-fr-mfe-load-failure-handling`).

## 9. Acceptance Criteria

- [ ] A microfrontend can be registered with a running application and loaded on demand without rebuilding the host — verifiable via `cpt-frontx-fr-mfe-runtime-registration`.
- [ ] Multiple microfrontends can occupy one extension domain when that domain permits it — verifiable via `cpt-frontx-fr-mfe-multi-occupant-domain`.
- [ ] Extension domains enforce admission rules, placement expectations, occupant limits, and required contracts — verifiable via `cpt-frontx-fr-mfe-extension-domain-governance`.
- [ ] Microfrontends can communicate with the host — verifiable via `cpt-frontx-fr-mfe-host-communication`.
- [ ] Microfrontends can react to host-state changes — verifiable via `cpt-frontx-fr-mfe-host-communication`.
- [ ] Load failures degrade gracefully with diagnostics and recovery or retry outcome — verifiable via `cpt-frontx-fr-mfe-load-failure-handling`.
- [ ] No unit is placed without passing type validation and domain contract matching — verifiable via `cpt-frontx-fr-mfe-type-validation`, `cpt-frontx-fr-mfe-extension-domain-governance`, and the security NFR's admission measurement.
- [ ] The supported-platform baseline requires current evergreen browser capabilities for dynamic module loading, standard DOM placement, and modern JavaScript execution.
- [ ] The runtime's public surface names no UI framework and no concrete type-definition specification — verifiable by inspection of the package's exports and dependencies.
- [ ] Registration and on-demand load meet the p95 thresholds stated in `cpt-frontx-nfr-runtime-performance`.

## 10. Dependencies

| Dependency | Description | Criticality |
|------------|-------------|-------------|
| Type-system provider | Supplies validation and type resolution for registered microfrontends, extensions, and application-owned type definitions. | p1 |
| Browser runtime | Dynamic `import()`, module isolation, and the DOM the runtime mounts into. | p1 |

## 11. Assumptions

- Applications inject exactly one type-system provider per registry instance.
- Microfrontends are independently developed and cannot be assumed to trust one another; the default-deny posture is the operating assumption, not an option.

## 12. Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| A UI-framework or type-format assumption leaks into the runtime surface. | The agnostic-core property breaks and the runtime stops being composable with arbitrary stacks. | Keep admission outcomes and public requirements framework- and type-format-agnostic; delegate concrete mechanisms to DESIGN and FEATURE artifacts. |
| Admission checks are bypassed by direct placement. | Unvalidated units run inside the host. | Require observable default-deny admission, validation before placement, and isolation outcomes; delegate enforcement mechanisms to DESIGN and FEATURE artifacts. |
