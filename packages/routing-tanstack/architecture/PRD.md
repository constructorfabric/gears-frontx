---
description: Product requirements for the routing-tanstack package, the default routing-engine provider that gives each runtime one TanStack router over its own private subroute.
---

# PRD — Routing TanStack Provider (`@gears-frontx/routing-tanstack`)


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
  - [5.1 Engine Adaptation](#51-engine-adaptation)
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

`@gears-frontx/routing-tanstack` is the ecosystem's default routing-engine provider: the published library that implements the engine-provider port the navigation substrate (`@gears-frontx/routing`) declares, binding that substrate's `NavigationHistory` contract to TanStack Router. It gives each runtime exactly one router over that runtime's own private subroute: an extension's own entry, or, in the shell runtime, the shell's subroute (the pathname). The runtime renders the package's extension router from its own route tree, and the package projects that subroute into a virtual location the engine can navigate. It also gives code outside the rendered tree, through the navigation facade, reading and changing of that same subroute and nothing else. The package never mounts an extension and never obtains an entry address from anywhere but the FrontX router of the extension's own runtime. This PRD owns the provider's requirements; ecosystem-level requirements are owned by the [root PRD](../../../architecture/PRD.md), and the navigation substrate's own requirements — including the engine-provider port this package implements, the FrontX router, and the URL grammar this package's virtual location is projected from — are owned by the [routing PRD](../../routing/architecture/PRD.md).

### 1.2 Background / Problem Statement

The navigation substrate carries a single realm-shared navigation history and one uniform URL grammar for every domain in a composed application's tree, but declares no dependency on a concrete router engine: a router engine renders routes and matches search parameters, and evolves on its own release cadence, independent of the substrate and of every other extension in the realm. Something must bind the substrate's own `NavigationHistory` contract to a concrete engine and project the one subroute an extension owns into a location that engine can navigate — without that binding reaching back into the substrate, the runtime, or a sibling extension, and without it ever reading or writing a sibling's subroute or another domain's own entries. An extension's own entry address is not this package's to obtain from anywhere else: the FrontX router, which lives in the routing package, holds it for the extension's own runtime, and an MFE developer never sees it. This package is the binding itself — the ecosystem's default, TanStack-Router-backed engine provider — and it exposes only what keeps each runtime to its own private subroute: the extension router, the navigation facade, and the engine's route-tree builders and scoped route hooks.

### 1.3 Goals (Business Outcomes)

- **A working router out of the box** — an MFE developer renders the extension router from the extension's own route tree and gets one router over the extension's own subroute, with no adapter code of its own. Target: zero provider-side adaptation work for an extension using the default engine; Timeframe: first platform release.
- **The engine stays replaceable** — the concrete engine dependency is confined to this package, so a microfrontend can adopt a different conforming provider without a change to the substrate, the runtime, or any sibling extension, beyond the route-tree builders that provider itself re-exports. Target: zero router-engine leakage outside this package; Timeframe: ongoing.
- **Runtime parity** — the same provider code runs the router of the shell runtime and of an extension composed at any depth of the domain tree. Target: no code branch beyond where the virtual location's own pathname and search come from; Timeframe: first platform release.
- **Own-subroute access only** — code in any runtime, rendered or not, can read and change its own private subroute and nothing else. Target: zero public entry points that build a history or a router over another extension's part of the URL; Timeframe: first platform release.

### 1.4 Glossary

This PRD uses the ecosystem's shared vocabulary: *application* means what the root glossary defines ([root PRD §1.4](../../../architecture/PRD.md#14-glossary)), and *extension* means what the runtime's glossary defines ([mfes PRD §1.4](../../mfes/architecture/PRD.md#14-glossary)). *Navigation substrate*, *FrontX router*, *shell's subroute (the pathname)*, *occupant value*, *entry*, *entry address*, *domain key*, *extension token*, *payload*, *occupant*, *zone*, *route owner*, and *route ownership signal* mean what the [routing PRD §1.4](../../routing/architecture/PRD.md#14-glossary) defines. The terms below are this package's own.

| Term | Definition |
|------|------------|
| extension router | The one router this package renders for a runtime, built from the route tree that runtime provides and addressed at the runtime's own private subroute: an extension's own entry, or, in the shell runtime, the shell's subroute (the pathname). A microfrontend renders it from its own route tree. |
| navigation facade | This package's own access to the calling runtime's own private subroute from code outside the rendered tree: navigate, replace and location, over that subroute only. |
| engine-provider port | The port the navigation substrate declares, describing what a provider must accept from the substrate (the shared `NavigationHistory` instance, the entry address of the extension's own occupant value, or its absence in the shell runtime, and an opaque route tree) and what it is responsible for producing (a constructed router, rendered for that occupant). This package is the default implementation of that port. |
| virtual location | The pathname-and-search pair this package's adapter constructs for the engine to navigate: the entry's own reserved `route` parameter as the pathname (`/` when the entry carries none; the pathname is written back as `route` only when it is not `/`), and every other parameter of that same entry as the search. In the shell runtime, it is the shell's subroute (the pathname) with an empty search. It never carries a hash. A convention this package adopts to give a concrete, page-shaped engine something to route against; not a value the navigation substrate itself produces or reads. |
| reserved parameter `route` | The one payload parameter name this package's adapter treats specially: it becomes the virtual location's own pathname. Every other parameter of the occupant's entry is left to the constructed router as its own search. A convention of this provider, never a rule the navigation substrate imposes. |

## 2. Actors

### 2.1 Human Actors

#### Microfrontend Developer

**ID**: `cpt-frontx-routing-tanstack-actor-microfrontend-developer`

**Role**: Authors an extension's own route tree using this package's re-exported route-tree builders, renders this package's extension router from it, and uses the navigation facade from code outside the rendered tree. Never constructs a router, adapts history, or reads an entry address or an occupant value. May redirect from inside the route tree with the engine's own redirect, which stays within its own subroute, and may use the engine's own scoped route hooks from rendered code. The role covers shell code as well as microfrontend code: in the shell runtime, the same extension router and navigation facade work over the shell's subroute (the pathname) alone. Fills the root PRD's Project Developer role (`cpt-frontx-actor-project-developer`) at a runtime's own routing.
**Needs**: A stable, engine-native surface for declaring routes and parameters that requires no knowledge of how the router it runs under was constructed or addressed, and access to its own subroute alone from code outside the rendered tree.

### 2.2 System Actors

#### Router Engine

**ID**: `cpt-frontx-routing-tanstack-actor-router-engine`

**Role**: The concrete engine this package binds the navigation substrate's shared history to — TanStack Router, constructed over this package's own adapted, virtual history. Treated as an implementation detail of this package alone; no other package in the ecosystem depends on it.

## 3. Operational Concept & Environment

The microfrontend renders this package's extension router from its own route tree, and the router is addressed at the extension's own subroute. The package reads that extension's own entry address from the FrontX router of the extension's own runtime (`cpt-frontx-routing-actor-frontx-router`, in `@gears-frontx/routing`), which holds it and never mounts anything through this package; the package reads it from nowhere else. The package adapts the substrate's shared `NavigationHistory` into a virtual history whose pathname is that entry's own reserved `route` parameter (default `/` when absent) and whose search is every other parameter of that same entry, builds TanStack Router's router over that virtual history and the extension's own route tree, and renders it. An extension's own routing table matches only its own virtual location, and every navigation the router performs writes back only that same entry's own parameters, in one history write, with the verb the engine requested — never a sibling's entry or another domain's entry, and never the pathname.

Code outside the rendered tree reads and changes its runtime's own private subroute through this package's navigation facade: navigate, replace and location. The extension router and the navigation facade both work in every runtime, over that runtime's own private subroute. The shell runtime is the runtime whose FrontX router was never supplied navigation; its private subroute is the shell's subroute (the pathname). There, the router changes the pathname only, and leaves the query string, which carries the extensions' entries, untouched. A hash passed to a navigation is dropped: the page hash stays outside every runtime's reach. From inside the route tree, code may use the engine's own redirect and scoped route hooks, which stay within its own subroute. History adaptation, router construction, the provider component and the entry address are internal to this package, because exposing them would let code build a history over another extension's part of the URL.

Every runtime runs the same routing code. In an extension's runtime, the FrontX router assigns the extension its occupant value at mount and validates it, the extension's runtime supplies its own router a reader of that value, and this package reads the extension's own entry address — its own domain key and extension — from that ready router; this package's virtual history is projected from that one entry's own payload. A runtime whose FrontX router was never supplied navigation is the shell runtime, and its virtual location is the pathname alone. When navigation was supplied but the FrontX router holds no occupant value (an extension with no route of its own or of its domain, or a failed occupant-value exchange), that extension has no access to the router: reading its entry address refuses, so its extension router and the navigation facade refuse too. This package runs the same construction path in every case.

### 3.1 Module-Specific Environment Constraints

- Requires the navigation substrate (`@gears-frontx/routing`) to already expose its realm-shared `NavigationHistory` instance; this package adapts that instance, it does not construct one of its own.
- Requires a browser environment with the primitives TanStack Router's own history contract assumes.
- The only intra-ecosystem package this package imports is the navigation substrate; nothing else in this ecosystem is imported (`cpt-frontx-routing-tanstack-nfr-single-ecosystem-edge`).

## 4. Scope

### 4.1 In Scope

- Rendering one extension router per runtime, built from the route tree that runtime provides and addressed at the runtime's own private subroute: an extension's own entry, or, in the shell runtime, the shell's subroute (the pathname).
- The navigation facade: reading and changing the calling runtime's own private subroute from code outside the rendered tree.
- Adapting the navigation substrate's `NavigationHistory` contract, together with the extension's own entry address, into a virtual history TanStack Router can navigate.
- Reserving the entry's own `route` parameter as the virtual location's pathname, and projecting every other parameter of that entry as the virtual location's search.
- Writing every navigation an extension's router performs back to the occupant's own entry alone, through the navigation substrate's own control boundary — never a sibling's entry, another domain's entry, or the pathname. In the shell runtime, writing every navigation to the pathname alone, leaving the query string untouched.
- Dropping a hash passed to a navigation or when composing a link: the page hash stays outside every runtime's reach.
- Producing a full, shareable composed-application URL for a location within the runtime's own private subroute.
- Re-exporting the engine's own route-tree builders and scoped route hooks so an extension's own code never needs a direct dependency on the concrete engine.
- A public entry limited to the extension router, the navigation facade, and the engine's route-tree builders and scoped route hooks.
- Runtime parity: the same provider code running in the shell runtime and in an extension composed at any domain in the tree.
- Unsubscribing a constructed router from the shared navigation history when the extension that owns it unmounts.

### 4.2 Out of Scope

- The navigation substrate itself, the URL grammar's own definition, and the route ownership signal — all owned by the navigation substrate ([routing PRD](../../routing/architecture/PRD.md)); this package consumes them, it does not define them.
- The FrontX router, including obtaining, deriving, and validating an entry address and assigning the occupant value — owned by the navigation substrate's package ([routing PRD](../../routing/architecture/PRD.md)); this package only reads the entry address the FrontX router of the extension's own runtime holds.
- Extension loading, admission, placement, mounting, and isolation — owned by the runtime ([mfes PRD](../../mfes/architecture/PRD.md)).
- Any router-engine implementation other than TanStack Router; a different engine is supplied by a different provider package satisfying the same engine-provider port.

## 5. Functional Requirements

### 5.1 Engine Adaptation

#### Engine adaptation and router construction

- [ ] `p1` - **ID**: `cpt-frontx-routing-tanstack-fr-engine-adaptation`

The system **MUST**, internally, adapt the navigation substrate's `NavigationHistory` contract, together with the extension's own entry address, into a virtual history satisfying TanStack Router's own history contract — deriving every member that contract requires beyond `NavigationHistory`'s five, projecting the entry's own reserved `route` parameter as the virtual location's pathname (`/` when the entry carries none) and every other parameter as its search, and translating `NavigationHistory`'s own subscriber notification into the shape TanStack Router's `subscribe` callback expects — and **MUST** build TanStack Router's router over that virtual history and the extension's own route tree. History adaptation, router construction and rendering are steps of the extension router and of the navigation facade; none of them is public.

**Rationale**: The navigation substrate's own contract is deliberately narrower than a concrete engine's, and carries no notion of pathname and search at all beyond a subroute; someone must bridge that gap so an extension gets a working router without writing its own adapter or its own virtual-location convention.

**Actors**: `cpt-frontx-routing-tanstack-actor-microfrontend-developer`

#### Extension router

- [ ] `p1` - **ID**: `cpt-frontx-routing-tanstack-fr-extension-router`

The system **MUST** provide an extension router that a runtime renders from its own route tree, and that gives the runtime exactly one router over its own private subroute. In an extension's runtime, that subroute is the extension's own entry, and the extension router **MUST** read the extension's entry address from the runtime's FrontX router. In the shell runtime, whose FrontX router was never supplied navigation, that subroute is the shell's subroute (the pathname). In an extension runtime whose FrontX router was supplied navigation but has no occupant value, the extension has no access to the router, and the extension router **MUST** refuse. The extension router **MUST** accept the engine's search parser and serializer from the runtime and construct its router with them, using the engine's own when none is given, and **MUST NOT** accept any other construction option. The extension router **MUST NOT** mount, load, or place any extension.

**Rationale**: A microfrontend authors nothing beyond its own route tree, and its search parser and serializer when the engine's default reading of search values does not suit it; one router per extension keeps its routing table to its own subroute and keeps routing code out of the shell and the microfrontend.

**Actors**: `cpt-frontx-routing-tanstack-actor-microfrontend-developer`

#### Own-subroute navigation from outside the UI tree

- [ ] `p1` - **ID**: `cpt-frontx-routing-tanstack-fr-extension-navigation`

The system **MUST** provide a navigation facade to give code outside the rendered tree reading and changing of the calling runtime's own private subroute only — navigate, replace and location: an extension's own entry, or, in the shell runtime, the shell's subroute (the pathname). In an extension runtime whose FrontX router was supplied navigation but has no occupant value, the extension has no access to the router, and the navigation facade **MUST** refuse. It **MUST NOT** expose the FrontX router, the occupant value, or the raw shared history.

**Rationale**: Action handlers and other non-rendered code need the same own-subroute access the rendered tree has, and no more; reading or changing anything outside that subroute would let one extension claim state another occupant or the shell owns.

**Actors**: `cpt-frontx-routing-tanstack-actor-microfrontend-developer`

#### Public entry

- [ ] `p1` - **ID**: `cpt-frontx-routing-tanstack-fr-public-entry`

The system **MUST** limit its public entry to the extension router, the navigation facade, and the engine's route-tree builders, scoped route hooks and search codec builders, and **MUST** keep history adaptation, router construction — the engine's own included — the provider component and the entry address internal.

**Rationale**: Each internal item would let code build a history or a router over another extension's part of the URL if it were public.

**Actors**: `cpt-frontx-routing-tanstack-actor-microfrontend-developer`

#### Own-entry navigation boundary

- [ ] `p1` - **ID**: `cpt-frontx-routing-tanstack-fr-scoped-navigation-zone`

The system **MUST** confine every navigation an extension's own router performs to that extension's own entry — writing only that entry's own parameters back through the navigation substrate's own control boundary — and **MUST NOT** read or write a sibling occupant's entry under the same domain key, an entry under another domain key, or the pathname, through its own routing table. It **MUST** confine every navigation the shell runtime's router performs to the shell's subroute (the pathname), leaving the query string, which carries every extension's entry, untouched. Every router **MUST** leave the page hash unchanged: a hash passed to a navigation is dropped.

**Rationale**: An entry is an occupant's namespace; a router that could reach outside it would let one occupant's routing table silently claim state another occupant or another domain owns.

**Actors**: `cpt-frontx-routing-tanstack-actor-microfrontend-developer`

## 6. Non-Functional Requirements

### 6.1 NFR Inclusions

#### Single Ecosystem Edge

- [ ] `p1` - **ID**: `cpt-frontx-routing-tanstack-nfr-single-ecosystem-edge`

The system **MUST** import exactly one package from this ecosystem — the navigation substrate (`@gears-frontx/routing`) — and **MUST** import no other package in this ecosystem.

**Threshold**: Exactly one intra-ecosystem edge in the package manifest, and exactly one intra-ecosystem edge in the import graph, both verified mechanically by the boundary guards.

**Rationale**: This is the membership property the package claims in the published-libraries layer: it is not a standalone package (no intra-ecosystem dependency), because it depends on the navigation substrate, but that dependency is bounded to a single, named edge rather than an unbounded one.

### 6.2 NFR Exclusions

The root PRD's §6.2 exclusions (safety, privacy, accessibility, internationalization, inclusivity, regulatory compliance) apply here for the same reasons stated there. The categories this PRD does not address are dispositioned as follows:

- **Security (authentication, authorization, audit, data classification)** — Not applicable because this library authenticates no one, holds no credential and records nothing for audit. What each runtime may read and change of the URL — its own private subroute only — is a functional requirement (`cpt-frontx-routing-tanstack-fr-scoped-navigation-zone`, `cpt-frontx-routing-tanstack-fr-public-entry`).
- **Safety** — Not applicable because this library is a pure information system with no physical interaction.
- **Performance (response time, throughput, capacity)** — Not applicable because this library sets no latency or throughput target of its own.
- **Reliability (availability, recovery)** — Not applicable because this library runs inside the page and has no service of its own to keep available.
- **Usability (accessibility, internationalization, offline use, inclusivity)** — Not applicable because this library renders no user interface of its own; the extension router renders the route tree the runtime provides.
- **Compliance (regulatory, industry standards, legal)** — Not applicable because this library handles no regulated or personal data.
- **Data (ownership, quality, lifecycle)** — Not applicable because this library stores no data; the virtual location is projected from the shared navigation history.
- **Maintainability (code quality, documentation, technical debt)** — Not applicable because this library sets no maintainability target of its own; its package boundary is held by the single-ecosystem-edge requirement (§6.1).
- **Operations (deployment, monitoring, support)** — Not applicable because this library is a published package with no deployed service of its own to run, monitor or support.

## 7. Public Library Interfaces

### 7.1 Public API Surface

The package's public surface is specified by this package's [DESIGN](./DESIGN.md) §3.3 and by its `engine-provider` FEATURE.

### 7.2 External Integration Contracts

None owned here. The package is distributed under the root PRD's package-registry distribution contract (`cpt-frontx-contract-package-registry-distribution`). The engine-provider port this package implements is owned by the navigation substrate's own PRD, DESIGN, and navigation-substrate FEATURE, not by this package; the FrontX router that holds each extension's entry address is owned by the routing package, not by this package either.

## 8. Use Cases

#### Swap the router engine of a microfrontend

- [ ] `p2` - **ID**: `cpt-frontx-routing-tanstack-usecase-swap-router-engine`

**Actor**: `cpt-frontx-routing-tanstack-actor-microfrontend-developer`

**Preconditions**:
- A microfrontend currently depends on this package as its engine provider.

**Main Flow**:
1. The Microfrontend Developer replaces this package with a different provider satisfying the same engine-provider port (`cpt-frontx-routing-tanstack-fr-engine-adaptation`).
2. The replacement provider is handed the same navigation substrate's shared `NavigationHistory` instance and the same entry address the FrontX router holds for the extension.
3. The microfrontend's route tree, its search-parameter handling and its imports of this package are rewritten to the replacement provider's own builders and hooks; nothing outside that microfrontend's own code changes.

**Postconditions**:
- The navigation substrate, the runtime and every sibling microfrontend observe no change.

**Alternative Flows**:
- **The replacement provider does not satisfy the engine-provider port's history contract**: it cannot receive the shared history, and the extension's router does not initialize.

## 9. Acceptance Criteria

- [ ] A microfrontend renders the extension router from its own route tree and gets one router over its own subroute, adapted from the shared `NavigationHistory` and the extension's own entry address; in the shell runtime, the same extension router works over the shell's subroute (the pathname) — verifiable via `cpt-frontx-routing-tanstack-fr-extension-router` and `cpt-frontx-routing-tanstack-fr-engine-adaptation`.
- [ ] The navigation facade navigates, replaces and reads the location of the calling runtime's own private subroute from code outside the rendered tree — an extension's own entry, or the shell's subroute (the pathname) in the shell runtime — verifiable via `cpt-frontx-routing-tanstack-fr-extension-navigation`.
- [ ] The public entry carries the extension router, the navigation facade, and the engine's route-tree builders and scoped route hooks, and none of history adaptation, router construction (the engine's own included), the provider component or the entry address — verifiable via `cpt-frontx-routing-tanstack-fr-public-entry`.
- [ ] An extension's own router writes only its own entry's own parameters, never a sibling's entry, another domain's entry, or the pathname; the shell runtime's router writes the pathname alone and leaves the query string untouched; no router changes the page hash, and a hash passed to a navigation is dropped — verifiable via `cpt-frontx-routing-tanstack-fr-scoped-navigation-zone`.
- [ ] The package imports exactly one ecosystem package — the navigation substrate — and no other — verifiable via the boundary guards.
- [ ] Replacing this package with a different engine-provider port implementation changes only the microfrontend's own route-tree authoring code — its route tree, its search-parameter handling, and every one of its own imports of this package — and changes no file belonging to the navigation substrate, the runtime or a sibling microfrontend — verifiable via `cpt-frontx-routing-tanstack-usecase-swap-router-engine`.
- [ ] An implementation **MUST** reproduce this provider's own worked example 1 below as one of its own acceptance scenarios — the reserved `route` parameter is this provider's own convention, not a rule the navigation substrate imposes (`packages/routing/architecture/DESIGN.md`, "Navigation Substrate"):

  **Example 1 — An extension's own router.** Under this default engine provider, an occupant's internal route is the reserved parameter `route`; its remaining parameters are its router's search.

  ```
  /en?screen=dashboard;route=settings/general;orientation=left
     &sheet=tenant-details;route=contacts;tenantId=456
  ```

  The dashboard's router sees pathname `/settings/general` and search `orientation=left`.

## 10. Dependencies

| Dependency | Description | Criticality |
|------------|-------------|-------------|
| `@gears-frontx/routing` | The navigation substrate whose `NavigationHistory` contract this package adapts, and whose engine-provider port this package implements. | p1 |
| TanStack Router and its history contract | The concrete router engine this package binds the adapted history to. | p1 |

## 11. Assumptions

- A microfrontend using this package has also depended on the navigation substrate — directly or transitively — so the shared `NavigationHistory` instance this package adapts already exists in the realm.
- An extension declares the routes in its own routing table relative to its own virtual location, never as absolute paths carrying the pathname or another domain's own entries; this is the navigation substrate's own assumption ([routing PRD §11](../../routing/architecture/PRD.md#11-assumptions)), unchanged by which engine provider a microfrontend uses.
- The reserved parameter `route` is this package's own convention for carrying an occupant's internal navigation state inside its own entry, decided at provider level, as the navigation substrate's own PRD §11 records ([routing PRD §11](../../routing/architecture/PRD.md#11-assumptions)); a microfrontend that adopts a different engine-provider port implementation is not bound to this same convention, only to producing a virtual location its own engine can navigate from the entry address it is handed.

## 12. Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| TanStack Router's own history contract changes incompatibly. | A microfrontend depending on this package's default adaptation faces a breaking change. | The concrete engine dependency is confined to this package's own product surface; a breaking change is bounded to this package's own major-version line, per the root evolvability requirement. |
| A replacement provider's adaptation does not fully satisfy the navigation substrate's history contract. | The microfrontend that adopted it may navigate correctly in isolation while disagreeing with the rest of the realm. | The engine-provider port, owned by the navigation substrate, states the history contract every provider must satisfy; this package's own adaptation is a worked example, not the only conforming shape. |
| A replacement provider adopts a different reserved-parameter convention, or none at all, for an occupant's own internal route. | Two extensions in the same composed application encode their own internal route differently, with no shared convention a tool built across both could rely on. | The reserved parameter `route` is documented as this provider's own convention, not a rule the navigation substrate imposes (§11); a composed application standardizing across providers documents and enforces its own convention at that level. |
