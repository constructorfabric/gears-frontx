# PRD — API Protocol Surface (`@gears-frontx/api`)


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
  - [5.1 Service Communication](#51-service-communication)
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

`@gears-frontx/api` is the ecosystem's API communication library: the published library through which applications and microfrontends call back-end services. It separates communication by protocol — request/response and streaming — behind uniform service surfaces, and shares fetch results across independently bundled units so the same request is not paid for twice. This PRD owns the library's requirements; ecosystem-level requirements are owned by the [root PRD](../../../architecture/PRD.md).

### 1.2 Background / Problem Statement

A composed application is many independently bundled units calling the same back-end services. Left alone, each unit brings its own HTTP conventions and its own copy of every in-flight request. The API Protocol Surface gives all units one protocol-separated way to declare and call services, and one shared cache for the results, so composition does not multiply network cost or convention drift.

### 1.3 Goals (Business Outcomes)

- **One service convention across all units** — every unit in a composed application declares and calls services the same way. Target: no unit needs its own HTTP conventions; Timeframe: first platform release.
- **Composition does not multiply requests** — identical fetches from independently bundled units share results. Target: one network request per distinct fetch across the realm; Timeframe: first platform release.

### 1.4 Glossary

This PRD uses the ecosystem's shared vocabulary: *application* means what the root glossary defines ([root PRD §1.4](../../../architecture/PRD.md#14-glossary)), and *microfrontend* means what the runtime's glossary defines ([mfes PRD §1.4](../../mfes/architecture/PRD.md#14-glossary)). A **service surface** is a declared, protocol-separated interface to one back-end service.

## 2. Actors

### 2.1 Human Actors

#### Application Developer

**ID**: `cpt-frontx-api-actor-application-developer`

**Role**: Declares the application's service surfaces and registers them; microfrontends and application code call services through them. Fills the root PRD's Project Developer role (`cpt-frontx-actor-project-developer`) at the service surface.
**Needs**: Protocol-appropriate calling conventions, a service registry usable from any unit, and control over the transport version the application ships.

### 2.2 System Actors

#### Back-End Service

**ID**: `cpt-frontx-api-actor-backend-service`

**Role**: The HTTP endpoint a service surface fronts — request/response or streaming. Operated by the application's deployment; the library treats it as opaque.

## 3. Operational Concept & Environment

The application declares service surfaces and registers them once; every unit in the composed application resolves services from the shared registry and calls them through the protocol-appropriate surface. Identical fetches across units share one in-flight request and one cached result.

### 3.1 Module-Specific Environment Constraints

- Requires a browser environment with `fetch` for the shared fetch cache.
- The HTTP transport is a peer dependency: the application controls its version, and the library declares no hard runtime transport coupling.
- Standalone by construction: no intra-ecosystem package dependency.

## 4. Scope

### 4.1 In Scope

- Protocol-separated service surfaces: request/response and streaming.
- A service registry shared across independently bundled units.
- A realm-shared fetch cache with auto-derived cache keys, reusing in-flight and completed results across units.

### 4.2 Out of Scope

- Microfrontend loading, placement, and communication (owned by the [mfes PRD](../../mfes/architecture/PRD.md)).
- Back-end service implementations, authentication, and authorization (application concerns, root PRD §4.2).
- State management above the fetch layer.

## 5. Functional Requirements

### 5.1 Service Communication

#### Protocol-separated service surfaces

- [x] `p1` - **ID**: `cpt-frontx-api-fr-protocol-separated-services`

The system **MUST** let an application declare back-end services as protocol-separated service surfaces — request/response and streaming — and **MUST** let any unit in the composed application call a declared service through the surface matching its protocol.

**Rationale**: One declared convention per protocol keeps independently developed units interoperable and spares each unit its own HTTP layer.

**Actors**: `cpt-frontx-api-actor-application-developer`

#### Service registry shared across units

- [x] `p1` - **ID**: `cpt-frontx-api-fr-shared-service-registry`

The system **MUST** provide a service registry through which independently bundled units resolve the application's declared service surfaces.

**Rationale**: Units composed at runtime cannot share compile-time imports; a registry is what lets them find the same services anyway.

**Actors**: `cpt-frontx-api-actor-application-developer`

#### Shared fetch results across independently bundled units

- [x] `p1` - **ID**: `cpt-frontx-api-fr-shared-fetch-cache`

The system **MUST** share fetch results — including in-flight requests — across independently bundled units in the same realm, with cache keys derived automatically from the request.

**Rationale**: Without sharing, composing an application from many units multiplies identical requests; the realm-shared cache keeps network cost proportional to distinct requests, not to unit count.

**Actors**: `cpt-frontx-api-actor-application-developer`

## 6. Non-Functional Requirements

### 6.1 NFR Inclusions

The ecosystem-wide NFRs are owned by the [root PRD §6.1](../../../architecture/PRD.md#61-nfr-inclusions); the library's contribution to runtime performance (fetch sharing and plugin short-circuit) serves the runtime-performance NFR owned by the [mfes PRD §6.1](../../mfes/architecture/PRD.md#61-nfr-inclusions).

#### Standalone Package Boundary

- [x] `p1` - **ID**: `cpt-frontx-api-nfr-standalone`

The system **MUST** contain no import of another ecosystem package, no import of a UI framework, and no import of template territory, anywhere in its published source, and **MUST** declare its HTTP transport only as a peer dependency.

**Threshold**: Zero intra-ecosystem manifest and import edges, and no hard runtime transport dependency, verified mechanically by the boundary guards.

**Rationale**: This is the membership property the package claims in the published-libraries layer, and what lets an application adopt the service surface while using none of the rest of the ecosystem and while controlling its own transport version.

### 6.2 NFR Exclusions

The root PRD's §6.2 exclusions (safety, privacy, accessibility, internationalization, inclusivity, regulatory compliance) apply here for the same reasons stated there.

## 7. Public Library Interfaces

### 7.1 Public API Surface

The package's public surface is deliberately below the root interface altitude: the root DESIGN introduces no `interface` identifier for it, anchoring it by decision records instead (the API surface-organization and transport-bypass ADRs). Its concrete surface is specified by this package's [DESIGN](./DESIGN.md) and the `api-protocol-surface` FEATURE.

### 7.2 External Integration Contracts

None owned here. The package is distributed under the root PRD's package-registry distribution contract (`cpt-frontx-contract-package-registry-distribution`). Back-end services are application-declared, not product contracts.

## 8. Use Cases

#### Application Developer declares a service once and every unit calls it

- [ ] `p2` - **ID**: `cpt-frontx-api-usecase-declare-and-share-service`

**Actor**: `cpt-frontx-api-actor-application-developer`

**Preconditions**:
- A composed application exists with more than one independently bundled unit.
- A back-end service endpoint is available.

**Main Flow**:
1. The Application Developer declares the service as a protocol-separated surface (`cpt-frontx-api-fr-protocol-separated-services`).
2. The Application Developer registers it in the service registry (`cpt-frontx-api-fr-shared-service-registry`).
3. Two units resolve the same service from the registry and issue the same request; the realm-shared cache serves both from one network fetch (`cpt-frontx-api-fr-shared-fetch-cache`).

**Postconditions**:
- Both units hold the same result; exactly one request reached the back-end service.

**Alternative Flows**:
- **Protocol mismatch**: a streaming call against a request/response surface is refused at the surface, not sent malformed to the service.

## 9. Acceptance Criteria

- [ ] A service declared once is callable from every independently bundled unit through the registry — verifiable via `cpt-frontx-api-fr-shared-service-registry`.
- [ ] Identical concurrent fetches from two units produce one network request — verifiable via `cpt-frontx-api-fr-shared-fetch-cache`.
- [ ] The package declares no intra-ecosystem dependency and no hard transport dependency — verifiable via the boundary guards and the manifest's peer-dependency declaration.

## 10. Dependencies

| Dependency | Description | Criticality |
|------------|-------------|-------------|
| HTTP transport (peer dependency) | The transport library the application supplies and versions; the library declares no hard runtime coupling to it. | p1 |
| Browser `fetch` | The primitive under the realm-shared fetch cache. | p1 |

## 11. Assumptions

- Units composed into one application share a JavaScript realm; the fetch cache's sharing boundary is the realm.

## 12. Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Transport-version skew between the application and the library's expectations. | Request behaviour differs between units. | The transport is a single application-controlled peer dependency, so exactly one version is resolved per application. |
