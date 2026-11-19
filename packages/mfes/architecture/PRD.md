---
version: 1.1.0
description: Product requirements for @gears-frontx/mfes, the runtime substrate that registers, loads, places, mediates, and validates composable microfrontends in a frontend application.
---

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
  - [5.2 Context-Selected Published Builds](#52-context-selected-published-builds)
- [6. Non-Functional Requirements](#6-non-functional-requirements)
  - [6.1 NFR Inclusions](#61-nfr-inclusions)
  - [6.2 NFR Exclusions](#62-nfr-exclusions)
- [7. Public Library Interfaces](#7-public-library-interfaces)
  - [7.1 Public API Surface](#71-public-api-surface)
  - [7.2 External Integration Contracts](#72-external-integration-contracts)
- [8. Use Cases](#8-use-cases)
  - [8.1 Context Selection Journey](#81-context-selection-journey)
  - [8.2 Runtime Composition Journey](#82-runtime-composition-journey)
- [9. Acceptance Criteria](#9-acceptance-criteria)
- [10. Dependencies](#10-dependencies)
- [11. Assumptions](#11-assumptions)
- [12. Risks](#12-risks)

<!-- /toc -->

## 1. Overview

### 1.1 Purpose

`@gears-frontx/mfes` is the ecosystem's runtime substrate: the published library that makes a frontend application runtime-extensible by composable microfrontends. It registers microfrontends with a running application, loads them on demand, places them into governed extension domains, mediates their communication with the host, and validates every unit against type definitions before it is admitted to run. This PRD owns the runtime's requirements; the ecosystem-level requirements that bind every published library are owned by the [root PRD](../../../architecture/PRD.md).

### 1.2 Background / Problem Statement

One running host may serve backend contexts with versions separated by years.
A backend-for-frontend (BFF) selects the already published MFE build appropriate
to the current context and returns its manifest or a resolvable manifest
reference. The required build need not be packaged with the host. Changing
context must activate the matching build without reloading the host page.

Revision 1.1.0 adds these required outcomes. They are not assertions that BFF
integration or no-reload version switching is already implemented. Existing
runtime requirements and identifiers are retained.

A composed application gains user-facing functionality from independently developed units at runtime. Without a contracted runtime substrate, each application would improvise its own loading, placement, and communication conventions, and an AI agent assembling such an application would have no stable surface to target. The runtime substrate closes that gap: one registration facade, one admission discipline, one communication mediator — the same in every FrontX application.

### 1.3 Goals (Business Outcomes)

- **Context-correct operation** — at the first release of context-selected builds,
  switching between two supported backend contexts selects their required
  published MFE builds with zero host reloads and zero stale-context activations.

- **Runtime extensibility without redeployment** — an application gains, replaces, or removes user-facing functionality by registering microfrontends at runtime, never by rebuilding the host. Target: zero host redeployments required to change a composed application's unit set; Timeframe: first platform release.
- **Contract violations surface at integration time** — a unit that does not match its extension domain's contract is refused at registration, not discovered by end users. Target: 100% of admitted units validated at admission; Timeframe: first platform release.

### 1.4 Glossary

| Term | Definition |
|------|------------|
| backend context | Consumer-owned identity of the backend environment for the current interaction; FrontX does not interpret its product or version policy. |
| BFF | Backend-for-frontend: the consumer's service that selects a published MFE manifest for the requested backend context. |
| published build manifest | Complete producer description of one concrete build and its registration information and resource closure, not only a loader's partial metadata. |
| selection | BFF-chosen build associated with one host-approved backend context and permitted MFE. |
| activation | Making an admitted build and its contributions available for interaction in that context. |

Build versions, type-contract versions and delivery revisions have distinct
meanings under the ecosystem published-build contract. An in-memory registration
ID does not by itself identify an immutable published artifact.

This PRD uses the root PRD's shared vocabulary ([root PRD §1.4](../../../architecture/PRD.md#14-glossary)) for *application*; *type definition* is defined by the [gts-plugin PRD §1.4](../../gts-plugin/architecture/PRD.md#14-glossary). Runtime terms are defined here.

| Term | Definition |
|------|------------|
| microfrontend | An independently developed frontend unit that a running application can register and load. |
| extension | A contributed capability or UI element admitted into a host through a declared contract. |
| extension domain | A named host-owned slot with rules for what extensions it admits and how admitted occupants are placed. |
| platform | The combined runtime substrate and host contracts that let an application admit, place, and coordinate microfrontends. |

## 2. Actors

### 2.1 Human Actors

#### Application User

**ID**: `cpt-frontx-mfes-actor-application-user`

**Role**: Selects an authorized backend context through the consuming host.
**Needs**: A matching functional screen, an understandable loading/failure outcome
and continued host operation without page reload when changing context.

#### Application Developer

**ID**: `cpt-frontx-mfes-actor-application-developer`

**Role**: Builds the host application on the runtime — declares extension domains, registers microfrontends and extensions, and wires the injected type-system provider. Fills the root PRD's Project Developer role (`cpt-frontx-actor-project-developer`) at the runtime surface.
**Needs**: A stable registration facade, predictable admission rules, and no coupling between the runtime and the UI framework the application chose.

#### Microfrontend Developer

**ID**: `cpt-frontx-mfes-actor-microfrontend-developer`

**Role**: Authors the independently developed units the runtime loads — their entry points, declared base types, and the contracts their extensions carry. Fills the root PRD's Project Developer role (`cpt-frontx-actor-project-developer`) where a project contributes a microfrontend.
**Needs**: A narrow host-communication bridge, explicit domain contracts to develop against, and admission errors that name the violated contract.

### 2.2 System Actors

#### Consumer Manifest Selector

**ID**: `cpt-frontx-mfes-actor-manifest-selector`

**Role**: Consumer-owned BFF that returns the selected published manifest or
manifest reference for a requested context. The host consumes this selection
through its configured integration. The selector must be reachable for a fresh
selection; failure is explicit and must not choose a different build silently.

#### Published Artifact Source

**ID**: `cpt-frontx-mfes-actor-artifact-source`

**Role**: Supplies the selected manifest and required build resources at
consumer-approved locations. Access and support retention are publisher/consumer
responsibilities; missing resources prevent activation of that build.

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

- Admission of concrete published MFE builds selected by a consumer-owned BFF.
- Loading permitted builds absent from the host package and switching backend contexts without host reload.
- Context-correct lifecycle, registration, navigation and shared-resource behavior during version transitions.

- Microfrontend registration with a running application and on-demand loading.
- Multiple microfrontends per extension domain where the domain permits multiple occupants.
- Microfrontend–host communication and host-state reaction through a mediated bridge.
- Type validation of microfrontends and their extensions at registration.
- Extension-domain governance: domain admission, placement expectations, occupant limits, and contract matching.
- Isolation of loaded units.

### 4.2 Out of Scope

- Backend-version compatibility policy, cluster/product models and consumer-specific selector endpoints.
- Compiling or publishing an MFE from the browser; selected builds must already be published.
- Guaranteeing behavioral backend compatibility from static declared contracts alone.
- Preserving arbitrary MFE-local screen state across different builds; a consumer may define state transfer separately.
- Simultaneous interactive versions of the same logical MFE in multiple contexts; this capability requires sequential context transitions within one running host.

- The concrete type-definition specification and its validation engine (owned by the type-system provider, `packages/gts-plugin`).
- Application-defined type registration requirements (owned by the [gts-plugin PRD](../../gts-plugin/architecture/PRD.md)).
- Project scaffolding and lifecycle tooling (projects orchestration layer).
- UI component libraries, state management, and layout choices (root PRD §4.2).

## 5. Functional Requirements

### 5.1 Runtime Composition

#### Microfrontend runtime registration and on-demand loading

- [x] `p1` - **ID**: `cpt-frontx-fr-mfe-runtime-registration`

The system **MUST** allow microfrontends to be registered with a running application and loaded on demand.

**Rationale**: Lets an application gain user-facing functionality from independently-developed units at runtime, without rebuilding or redeploying the host.

**Actors**: `cpt-frontx-actor-project-developer`

#### Multiple microfrontends per extension domain

- [x] `p1` - **ID**: `cpt-frontx-fr-mfe-multi-occupant-domain`

The system **MUST** allow multiple microfrontends to occupy the same extension domain when that domain permits multiple occupants.

**Rationale**: Enables modular layouts and side-by-side experiences within a single extension point, so teams can compose richer screens without contention over a shared slot.

**Actors**: `cpt-frontx-actor-project-developer`

#### Extension-domain governance

- [ ] `p1` - **ID**: `cpt-frontx-fr-mfe-extension-domain-governance`

The system **MUST** allow a host application to define extension domains with admission rules, placement expectations, occupant limits, and required contracts. The system **MUST** admit only microfrontends and extensions that satisfy the target domain's requirements.

**Rationale**: Domain governance lets applications compose independently developed units without turning extension points into unbounded or ambiguous placement areas.

**Actors**: `cpt-frontx-actor-project-developer`

#### Microfrontend–host communication and host-state reaction

- [ ] `p1` - **ID**: `cpt-frontx-fr-mfe-host-communication`

The system **MUST** allow microfrontends to communicate with the host application. The system **MUST** separately allow microfrontends to react to changes in the host application's state.

**Rationale**: Enables coordinated behavior across independently-deployed units, so a composed application behaves as one product rather than disconnected fragments.

**Actors**: `cpt-frontx-actor-project-developer`

#### On-demand load failure handling

- [ ] `p2` - **ID**: `cpt-frontx-fr-mfe-load-failure-handling`

When an on-demand load fails, the system **MUST** leave the host application usable, surface diagnostics that identify the affected microfrontend or extension domain when known, and allow the developer or host application to retry or recover without rebuilding the host.

**Rationale**: Runtime extensibility is only dependable if failed units degrade gracefully and produce actionable diagnostics.

**Actors**: `cpt-frontx-actor-project-developer`

#### Microfrontend and extension validation at registration

- [x] `p1` - **ID**: `cpt-frontx-fr-mfe-type-validation`

The system **MUST** validate microfrontends and their extensions against type definitions at the time they are registered with the application.

**Rationale**: Surfaces contract violations at the moment of integration rather than later in front of users, lowering the cost and risk of composing third-party units.

**Actors**: `cpt-frontx-actor-project-developer`

### 5.2 Context-Selected Published Builds

#### Consume a context-bound manifest selection

- [ ] `p1` - **ID**: `cpt-frontx-mfes-fr-context-manifest-selection`

The system **MUST** support a host-configured integration that obtains the BFF's
selected published manifest or manifest reference for the requested backend
context. The BFF owns compatibility selection; FrontX must not infer backend
policy, substitute the newest build or restrict selection to packaged builds.
The selected MFE must still belong to the host's permitted MFE set.

**Rationale**: One host must support independently evolving backend generations
without embedding their version policy.

**Actors**: `cpt-frontx-mfes-actor-application-developer`, `cpt-frontx-mfes-actor-manifest-selector`

#### Resolve complete build information before admission

- [ ] `p1` - **ID**: `cpt-frontx-mfes-fr-published-manifest-admission`

The system **MUST** resolve a selected reference to the concrete published
build and its complete registration and resource information before activation.
It must validate the artifact identity, supported manifest and declared host,
entry, extension, schema and shared contracts. Unsupported or conflicting
declarations, denied sources and identity mismatches must prevent activation.
A registration type ID must not be treated implicitly as a network location.

**Rationale**: Loader metadata alone does not describe everything needed for
safe, predictable registration. Declared-contract validity cannot certify
behavioral compatibility with an actual backend API.

**Actors**: `cpt-frontx-mfes-actor-application-developer`, `cpt-frontx-mfes-actor-artifact-source`, `cpt-frontx-mfes-actor-type-system-provider`

#### Change builds without reloading the host

- [ ] `p1` - **ID**: `cpt-frontx-mfes-fr-context-transition`

The system **MUST** allow an Application User to change backend context and
activate the BFF-selected build in the same host page, including a different
version of an already used logical MFE. This must work in both directions
between supported older and newer builds without host reload, rebuild or
redeployment. Completion must expose only the active context's admitted
registrations, extensions and navigation contributions.

**Rationale**: Selecting a different backend is an in-session application action,
not a new host deployment or page session.

**Actors**: `cpt-frontx-mfes-actor-application-user`, `cpt-frontx-mfes-actor-application-developer`

#### Prevent work from crossing context boundaries

- [ ] `p1` - **ID**: `cpt-frontx-mfes-fr-context-lifecycle-integrity`

The system **MUST** prevent the outgoing build from receiving or performing
host-mediated operations for the incoming context. Outgoing mounts and
contributions must cease participating before the new context becomes
interactive. Results from superseded selection, loading, registration or
activation attempts must never activate a stale build or overwrite the current
context. Host-mediated pending work and subscriptions must not deliver stale
results into the new context.

**Rationale**: Loading the correct version is insufficient if old screens,
capabilities or asynchronous results remain connected to another backend.

**Actors**: `cpt-frontx-mfes-actor-application-developer`, `cpt-frontx-mfes-actor-browser-runtime`

#### Preserve resource and identity correctness across transitions

- [ ] `p1` - **ID**: `cpt-frontx-mfes-fr-context-resource-integrity`

The system **MUST** load each selected build's initial, stylesheet, lazy-loaded,
shared and supporting resources under the configured artifact-source policy.
Reuse must respect concrete artifact and declared shared-contract identities;
different build content must not alias because MFE names, type IDs or version
labels coincide. Switching must not corrupt unrelated active host/MFE resources,
and outgoing build contributions must not affect the incoming build.

**Rationale**: A no-reload transition must preserve working resources and
contracts across versions, including published builds outside the host package.

**Actors**: `cpt-frontx-mfes-actor-application-developer`, `cpt-frontx-mfes-actor-artifact-source`

#### Provide a recoverable failure outcome

- [ ] `p1` - **ID**: `cpt-frontx-mfes-fr-context-selection-failure`

The system **MUST** report selection, access, validation, teardown, registration
and load failures to the host with the affected context/build and actionable
cause when known. A failed transition must leave no partially active incoming
build, stale navigation or old build operating against the new context. The
host must remain usable for retry or another context selection without reload.
An old build must not silently stand in for a failed new selection.

**Rationale**: The safe failure state is an unavailable selected capability,
not execution against the wrong backend. Restoring an earlier context is a
new explicit selection, not an implicit mixed-context rollback.

**Actors**: `cpt-frontx-mfes-actor-application-user`, `cpt-frontx-mfes-actor-application-developer`

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
- Isolation: a microfrontend receives no implicit access to other microfrontends' module state or capabilities. Microfrontends in one realm whose type-system providers share a store also share type registrations. That sharing is deliberate and grants no access: microfrontend code already shares the realm. Its risk is coupling between well-behaved runtimes, which the type-system provider mitigates.
- Default deny: denied or unvalidated units are not admitted or placed.

**Rationale**: Running independently-developed microfrontends — potentially from different teams or vendors — within one host makes default-deny access and admission validation essential for the trust enterprises require.

#### Context transition correctness and diagnosability

- [ ] `p1` - **ID**: `cpt-frontx-mfes-nfr-context-correctness`

The system **MUST** preserve context-correct operation across sequential backend
selections at the first release of this capability.

**Thresholds**: Zero host reloads; zero activations from superseded attempts;
zero excluded-MFE registrations/navigation contributions; zero outgoing-build
host-mediated effects in the incoming context. Every transition must report
success or a recoverable failure associated with its selection. These outcomes
must hold for older-to-newer and newer-to-older transitions between two builds
and for repeated overlapping selections.

**Rationale**: Correctness and an explicit outcome are necessary for users to
trust backend switching. Existing runtime-operation performance targets remain
in force; no unsupported whole-transition latency promise is introduced for
consumer-controlled BFF and artifact network time.

### 6.2 NFR Exclusions

The ecosystem-wide NFRs — evolvability and scaling without an architectural ceiling — bind this package but are owned by the [root PRD §6.1](../../../architecture/PRD.md#61-nfr-inclusions) (`cpt-frontx-nfr-evolvability`, `cpt-frontx-nfr-scalability-ceiling`): they govern every published member equally, so no member owns them. The root PRD's §6.2 exclusions (safety, privacy, accessibility, internationalization, inclusivity, regulatory compliance) apply here for the same reasons stated there. The categories this PRD does not address in §6.1 are dispositioned as follows:

- **Safety** — Not applicable because this library is a pure information system with no physical interaction.
- **Reliability (hosted-service availability, durable recovery)** — Hosted-service uptime and durable recovery targets are not applicable because this library runs inside the page and operates no service or durable store. In-page load recovery is required by `cpt-frontx-fr-mfe-load-failure-handling`; context-transition recovery is required by §5.2.
- **Usability (accessibility, internationalization, offline use, inclusivity)** — Not applicable because this library renders no user interface; what a microfrontend renders belongs to that microfrontend.
- **Compliance (regulatory, industry standards, legal)** — Not applicable because this library handles no regulated or personal data.
- **Data (ownership, quality, lifecycle)** — Consumer owns context and selection policy; publisher owns manifests, resource identity and support retention, which may span years. The runtime must preserve exact selected identities and discard superseded contributions under §5.2. Durable archive, deletion schedules and personal-data retention are not applicable because this library maintains no durable store.
- **Maintainability (code quality, technical debt)** — Additional targets are not applicable because this library sets no code-quality or technical-debt target of its own; evolvability is owned by the root PRD. Public integration and migration documentation obligations are stated in §7.1.
- **Operations (deployment, monitoring, support)** — Not applicable because this library is a published package with no deployed service of its own to run, monitor or support.

For §5.2, end-user authentication, MFA, SSO, credential policy and delegation
are not applicable as runtime-owned capabilities: the consuming host supplies
the authenticated session and authorized contexts. The Application User may
request only host-authorized contexts; the Consumer Manifest Selector may
select builds only for the requested context and permitted MFE. Its answer
grants no new host capabilities or MFE permissions. Artifact sources supply
bytes but do not authorize activation. Selection diagnostics must exclude
credentials and unnecessary end-user data.

The library provides context/loading/failure outcomes to the host; the host
owns accessible and localized presentation, user notification and support
escalation. Source-operation audit retention, regulatory reporting, forensic
non-repudiation and hosted service SLAs are not applicable to this in-page
library. Complete transition identity and cause are required for consumer
diagnostics, not an independent hosted logging service. Session-preserving
recovery is covered by §5.2; durable backup and disaster recovery are not
applicable because selections can be obtained again from the consumer's BFF.

The capability is for developers integrating a browser host. Universal user
volume, geographic distribution, BFF request rate and artifact retention SLAs
are not applicable because consumers operate those services. The minimum new
acceptance scale is two contexts and two builds of one MFE, including overlapping
selections; existing runtime capacity requirements remain unchanged.

## 7. Public Library Interfaces

### 7.1 Public API Surface

#### Context-selected build lifecycle

- [ ] `p1` - **ID**: `cpt-frontx-mfes-interface-context-selection`

**Type**: Host-facing programmatic runtime integration.

**Stability**: Required new capability, not a claim of an existing API shape.

**Description**: Accepts consumer-configured selection/artifact access and
authorized context changes; reports context-bound activation or failure while
preserving host operation. The interface must document transitions, resource
admission, diagnostics and migration from static registration. Exact signatures
and BFF wire representation remain technical design work.

**Breaking Change Policy**: Independently versioned under ecosystem compatibility
commitments; accepted published-manifest and host contract versions are declared.

#### MFE Runtime

- [ ] `p1` - **ID**: `cpt-frontx-interface-mfe-runtime`

**Type**: Library

**Stability**: unstable

**Description**: The MFE Runtime registers microfrontends with a running application and loads them on demand, governs extension-domain admission and placement outcomes, lets multiple microfrontends occupy the same extension domain when that domain permits multiple occupants, mediates communication between microfrontends and the host application and lets microfrontends react to changes in the host application's state, handles on-demand load failures with diagnostics and recovery outcomes, and validates microfrontends and their extensions against type definitions when they are registered.

**Documentation Obligation**: The public runtime surface **MUST** document extension-domain and admission concepts, plus host integration use at interface level.

**Breaking Change Policy**: The runtime surface follows the root PRD's independent-version and active-channel compatibility policy (`cpt-frontx-nfr-evolvability`), including its pre-1.0 distinction.

### 7.2 External Integration Contracts

The package is distributed under the root PRD's package-registry distribution contract (`cpt-frontx-contract-package-registry-distribution`), and its type-provider boundary is described by this package's [DESIGN](./DESIGN.md).

#### Consumer-selected published build

- [ ] `p1` - **ID**: `cpt-frontx-mfes-contract-selected-published-build`

**Direction**: Selection consumed from the consumer's BFF integration; manifest
and resources consumed from configured artifact sources; outcomes provided to host.

**Description**: The selection identifies an already published concrete build
for the requested context. The published manifest supplies complete registration
and resource information. The host's permitted MFE set and declared contracts
bound admission even when the build is not in its package. BFF transport, access
and backend selection rules are consumer-owned.

**Compatibility**: Unsupported contracts and unavailable or conflicting artifacts
fail explicitly; no latest-version or packaged-build substitution is implied.
Supported published-build contract versions and migration expectations must be
documented independently of backend product versions.

## 8. Use Cases

### 8.1 Context Selection Journey

#### Application User changes backend generation without page reload

- [ ] `p2` - **ID**: `cpt-frontx-mfes-usecase-switch-backend-context`

**Actor**: `cpt-frontx-mfes-actor-application-user`

**Preconditions**: The host has an authorized current context, a configured BFF
integration and a permitted MFE. Older and newer published builds are retained
at configured artifact sources; at least one is absent from the host package.

**Main Flow**:
1. The user selects another authorized context in the running host.
2. The host obtains that context's selected published manifest from the BFF integration.
3. FrontX admits the selected build and completes the outgoing context's lifecycle boundary.
4. The matching build becomes interactive with its own resources and navigation, without host reload.
5. The user selects the previous context and its appropriate build becomes interactive in the same page.

**Postconditions**: Only the current selection contributes interactive MFE
state, registrations and navigation. Unrelated permitted host functionality
continues to work.

**Alternative Flows**: An overlapping later selection supersedes the earlier
attempt; late results cannot activate it. Unavailable artifacts, denied sources,
invalid contracts or failed cleanup yield an unavailable selected capability
with retry/another-selection support. No old build operates in the new context.

### 8.2 Runtime Composition Journey

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

The following required outcomes apply at the first release of context-selected
builds; they are not claims that the capability has been implemented.

- [ ] For two backend contexts requiring different builds of the same logical MFE, the configured BFF selection is used exactly. At least one selected published build is absent from the host package and loads without rebuilding or republishing the host — `cpt-frontx-mfes-fr-context-manifest-selection`.
- [ ] Older-to-newer and newer-to-older context transitions both complete in one host page with zero page reloads. Completed transitions expose only the selected build's registrations, extensions and navigation — `cpt-frontx-mfes-fr-context-transition`.
- [ ] An MFE excluded by the host remains unregistered, unloaded and absent from navigation even if the BFF returns its manifest — `cpt-frontx-mfes-fr-context-manifest-selection`, `cpt-frontx-mfes-nfr-context-correctness`.
- [ ] Incomplete manifests, unsupported declared host/shared contracts, denied sources, identity mismatches and conflicting registrations prevent activation with a context/build-specific cause. Type IDs are not guessed to be URLs — `cpt-frontx-mfes-fr-published-manifest-admission`.
- [ ] Superseded BFF, loading and registration results never activate an outdated build. Outgoing mounts, subscriptions, navigation and host-mediated pending operations produce zero effects in the incoming context — `cpt-frontx-mfes-fr-context-lifecycle-integrity`.
- [ ] Initial, CSS, lazy, shared and supporting resources work for both builds from configured publication locations after packaging. Returning to a previous build causes no identity aliasing, stylesheet contamination or corruption of unrelated active resources — `cpt-frontx-mfes-fr-context-resource-integrity`.
- [ ] Selector failure, missing resources and failed transition cleanup each leave no partially active incoming build or old build using the new context. Retry or another context selection remains available without reload; no silent substitute version is used — `cpt-frontx-mfes-fr-context-selection-failure`.
- [ ] Static validation reports declared contract compatibility only. Backend behavioral compatibility is established by consumer-owned integration evidence, and no FrontX contract requires product names, cluster-version tables or a specific BFF endpoint — `cpt-frontx-mfes-fr-published-manifest-admission`, `cpt-frontx-mfes-contract-selected-published-build`.

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
| Consumer BFF integration | Selects a concrete published build for an authorized backend context; required for fresh context selection. | p1 |
| Configured artifact sources | Retain and supply selected manifests and resource closures for supported backend lifetimes. | p1 |

## 11. Assumptions

- BFF selections refer to already published builds. Consumers own their selection policy and backend compatibility evidence; FrontX does not build missing releases at runtime.
- Host/MFE participants follow the declared lifecycle and mediated-capability contracts. This requirement does not claim a security sandbox against arbitrary malicious code already executing in the host's browser realm.
- Long-lived supported backend versions require publisher retention of their manifests and resource closures; runtime validation cannot recover deleted artifacts.
- Unsaved MFE-local state transfer is not guaranteed. The host owns user-facing navigation policy while preserving the context isolation requirements.
- Exact BFF representation, runtime integration signatures and the published-build identity representation are technical design questions owned by the runtime maintainer, coordinated with producer maintainers before implementing the capability. The no-reload product requirement is settled.

- Applications inject exactly one type-system provider per registry instance.
- Microfrontends are independently developed and cannot be assumed to trust one another; the default-deny posture is the operating assumption, not an option.

## 12. Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| A UI-framework or type-format assumption leaks into the runtime surface. | The agnostic-core property breaks and the runtime stops being composable with arbitrary stacks. | Keep admission outcomes and public requirements framework- and type-format-agnostic; delegate concrete mechanisms to DESIGN and FEATURE artifacts. |
| Admission checks are bypassed by direct placement. | Unvalidated units run inside the host. | Require observable default-deny admission, validation before placement, and isolation outcomes; delegate enforcement mechanisms to DESIGN and FEATURE artifacts. |
| An outgoing build or late selection remains connected after a context change. | Actions affect the wrong backend or stale navigation reappears. | Require context lifecycle integrity and no stale activation, including explicit failure when cleanup cannot finish. |
| Older/newer builds assume incompatible shared or type contracts. | No-reload transition corrupts the running application. | Reject unsupported coexistence/admission contracts; preserving old/new behavioral compatibility remains consumer responsibility. |
| A retained manifest points to deleted or changed resources. | A supported backend's frontend cannot activate. | Immutable/verified resource identity and publisher-owned support retention; failure remains recoverable without silent fallback. |
