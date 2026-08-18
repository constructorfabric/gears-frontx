# PRD — Routing (`@gears-frontx/routing`)


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
  - [5.1 Navigation Coordination](#51-navigation-coordination)
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

`@gears-frontx/routing` is the ecosystem's navigation library: the published library through which a composed application and its independently bundled microfrontends share one browser navigation history and keep the URL and the screen a user is looking at in agreement. It exposes a framework-agnostic navigation substrate carrying that shared history, and an engine-provider port so a concrete routing engine can be swapped inside a single microfrontend's own territory without touching the substrate, the host, or any sibling microfrontend. This library carries no dependency on any concrete router engine itself; a separately published engine-provider package satisfies the port, and the ecosystem provides a default implementation of it. This PRD owns the library's requirements; ecosystem-level requirements are owned by the [root PRD](../../../architecture/PRD.md).

### 1.2 Background / Problem Statement

A composed application is many independently bundled units running in one browser tab, each capable of owning some slice of the URL. Left alone, each unit would create its own navigation history, so a programmatic navigation issued by one unit produces no change the others observe, and back/forward, deep links, and reloads stop agreeing with what is actually mounted. The Routing library gives every unit in the realm one navigation history to read and write, a declared way to scope a unit's own router to the URL segment it owns, and a signal reporting when the URL's resolved owner changes, from which the consumer keeps the mounted screen and the URL as two views of the same fact rather than two independent ones that can drift.

### 1.3 Goals (Business Outcomes)

- **Single navigation history across independently bundled units** — Target: exactly one navigation-history instance answers `push`/`replace`/`go`/`location`/`subscribe` for the host and every independently bundled microfrontend in the realm; Timeframe: first platform release.
- **URL is the single source of truth for which unit occupies a routable placement** — Target: a cold load, a reload, and a back/forward step all resolve the mounted unit from the URL through the same resolution path; Timeframe: first platform release.
- **Router engine swappable within one microfrontend's own territory** — Target: replacing the engine used by one microfrontend changes no file outside that microfrontend's own route tree and search-parameter handling; Timeframe: first platform release.
- **Composition does not force every microfrontend onto one router-engine version** — Target: the navigation substrate itself declares no dependency on a concrete router engine; Timeframe: first platform release.

### 1.4 Glossary

This PRD uses the ecosystem's shared vocabulary: *application* means what the root glossary defines ([root PRD §1.4](../../../architecture/PRD.md#14-glossary)), and *microfrontend* means what the runtime's glossary defines ([mfes PRD §1.4](../../mfes/architecture/PRD.md#14-glossary)). The terms below are this library's own.

| Term | Definition |
|------|------------|
| navigation substrate | The framework-agnostic core owning the single shared navigation history, the `basepath` contract, and route-owner resolution; it depends on no router engine and no UI framework. |
| engine provider | A separately published package that binds the navigation substrate's shared history to a concrete router engine so the engine can drive rendering and matching, by satisfying this library's engine-provider port. Not owned by this library: an engine provider's own requirements, behavior, and package boundary are owned by that provider's own PRD and DESIGN — the ecosystem's own default is `@gears-frontx/routing-tanstack`. |
| basepath | The URL path segment prefix a mounted microfrontend's own router is scoped to; the microfrontend's router matches only the remainder of the path beneath it. |
| route owner | The opaque identifier of whichever unit currently owns a declared URL prefix, supplied to the navigation substrate by the host as a plain argument; the substrate never interprets what the identifier names. |
| route ownership signal | The observable signal this library publishes when the URL's resolved route owner changes — an owner appearing, disappearing, changing, or its remainder beneath the prefix changing — together with the URL back-projection helper a consumer calls after a mount not driven by navigation. Two-way agreement between the URL and which unit is actually mounted is not this library's own guarantee; it is the consumer's, built on top of this signal (§11). |

## 2. Actors

### 2.1 Human Actors

#### Application Developer

**ID**: `cpt-frontx-routing-actor-application-developer`

**Role**: Mounts the navigation substrate at the host application, creates the route ownership signal's observer with its own source of declared identifier-to-prefix pairs, and wires the host's own router to the shared history. Fills the root PRD's Project Developer role (`cpt-frontx-actor-project-developer`) at the navigation surface.
**Needs**: A single history usable from the host and from every independently bundled microfrontend, a declared way to bind a URL prefix to whichever unit currently owns it, and no obligation to standardize every microfrontend on one router-engine version.

#### Microfrontend Developer

**ID**: `cpt-frontx-routing-actor-microfrontend-developer`

**Role**: Builds a microfrontend's own router scoped to its `basepath`, matching only the remainder of the URL beneath that prefix. The extension declares that prefix in its own manifest; the host assigns the declared prefix to the microfrontend's router when it mounts it into a composed application, and the deployment supplies it directly when the same microfrontend is served on its own. Fills the root PRD's Template Developer role (`cpt-frontx-actor-template-developer`) where a template contributes a microfrontend.
**Needs**: A stable `basepath` contract, freedom to choose or swap the router engine inside the microfrontend's own territory, and a documented way to navigate outside that territory when the microfrontend legitimately needs to.

### 2.2 System Actors

#### Router Engine

**ID**: `cpt-frontx-routing-actor-router-engine`

**Role**: The pluggable, replaceable engine an engine-provider package binds the shared navigation history to, through this library's engine-provider port. Treated as opaque and substitutable by the navigation substrate and by every microfrontend other than the one that chose it; this library carries no concrete engine dependency of its own and no opinion on which engine a provider package chooses.

## 3. Operational Concept & Environment

The host application mounts the navigation substrate once per realm and creates the route ownership signal's observer, supplying its own source of declared identifier-to-prefix pairs as a plain argument; the substrate exposes the shared history to the host's own router and to every microfrontend an engine provider mounts under its assigned `basepath`. Every navigation — a link click, a back/forward step, a cold load, a reload, an imperative call — is read from or written to the one shared history, and the route ownership signal reports the resulting ownership transition to the host; the host mounts or unmounts through its own mount mechanism and keeps the URL and the mounted route owner in agreement by acting on that signal and calling the URL back-projection helper when it mounts for a reason other than navigation.

The same microfrontend runs under two deployment modes without a change to its routing code. **Composed**: the host mounts the substrate, creates the route ownership signal's observer, and assigns each microfrontend its prefix. **Standalone**: the microfrontend is served on its own, no observer is required, and the prefix comes from the deployment's own configuration — empty when served at a root, or the sub-path it is published under. The substrate and the engine provider behave identically in both; only whether an observer exists differs, and nothing in standalone operation depends on one not existing.

### 3.1 Module-Specific Environment Constraints

- Requires a browser environment with a navigation-history API for the substrate's own realm-shared instance.
- Requires a single JavaScript realm shared by the host and every independently bundled microfrontend: the navigation substrate's single-shared-history guarantee is a realm-scoped property, not a per-bundle one.
- The router engine is never a dependency of the navigation substrate itself: every engine-specific dependency is confined to whichever separately published engine-provider package implements this library's engine-provider port (`cpt-frontx-routing-fr-engine-provider-port`).
- Standalone by construction: no intra-ecosystem package dependency; the binding to route owners is expressed only through a consumer-supplied owner-prefix pairs source, passed as a plain argument, and the binding to mounting only through the observable signal this library publishes — never through an import of the runtime that manages either one. The composed and standalone modes differ only in whether a route-ownership-signal observer is created and in where the `basepath` comes from, not in any port supplied to the package.
- Third-party code on the page may call the browser's own navigation-history API directly, bypassing the shared navigation history. This is an environmental condition the library does not prevent, not a supported way to navigate: a call that bypasses the shared instance leaves its `location` stale and its fan-out silent for that change (see DESIGN §4 failure modes).

## 4. Scope

### 4.1 In Scope

- A single, realm-shared navigation history with fan-out subscription: one real subscription to the browser's navigation history, redistributed to every listener.
- Imperative navigation outside the UI tree: `push`, `replace`, `go`, `location`, `subscribe` against the shared history.
- The `basepath` contract, and the engine-provider port a separately published provider package implements against it.
- The route ownership signal: resolving a URL to its declared route owner, observing and reporting every ownership-relevant transition to the consumer, and a URL back-projection helper the consumer calls after a mount not driven by navigation — the two-way agreement between the URL and a mounted owner is the consumer's own guarantee, built on this signal (§11).
- The channel boundary: this library owns the URL channel only, among the ecosystem's host–microfrontend communication channels.

### 4.2 Out of Scope

- Addressed action dispatch and shared-property broadcast between microfrontends and the host — owned by the runtime that provides those channels ([mfes PRD](../../mfes/architecture/PRD.md)); this library neither duplicates nor mediates either one.
- Microfrontend loading, admission, placement, and isolation — owned by the runtime ([mfes PRD](../../mfes/architecture/PRD.md)).
- The registry of route owners, the execution of a mount, and any reconciliation between a competing pair of mounts — all owned by the consumer's own mount mechanism, reached only through the plain-argument owner-prefix pairs source and the observable signal this library publishes, never through an injected port or an import of the runtime that implements them.
- Any router-engine implementation, and any provider-side concern — router construction, deployment-mode parity for a microfrontend's own routing code, and location-preserving navigation helpers — all owned entirely by whichever separately published engine-provider package a microfrontend depends on, including the ecosystem's own default engine-provider package.

## 5. Functional Requirements

### 5.1 Navigation Coordination

#### Single navigation substrate shared across independently bundled units

- [ ] `p1` - **ID**: `cpt-frontx-routing-fr-single-navigation-substrate`

The system **MUST** expose exactly one navigation-history instance per realm, reachable by the host and by every independently bundled microfrontend, and **MUST** fan out one underlying browser-history subscription to every listener that subscribes to it.

**Rationale**: Independently bundled units cannot share a compile-time singleton; a realm-shared instance is what keeps `push`/`replace`/`go` and back/forward consistent for every unit without requiring them to coordinate with each other directly.

**Actors**: `cpt-frontx-routing-actor-application-developer`, `cpt-frontx-routing-actor-microfrontend-developer`

#### Engine provider port

- [ ] `p1` - **ID**: `cpt-frontx-routing-fr-engine-provider-port`

The system **MUST** expose the shared navigation history to a router engine only through a pluggable engine-provider port, satisfied by a separately published provider package, and **MUST** let a microfrontend replace its provider package with a different one without changing the navigation substrate, the `basepath` contract, the host, or any sibling microfrontend. The port describes only what a provider **MUST** accept from the substrate — the shared `NavigationHistory` instance, an assigned or deployment-supplied `basepath`, an opaque route tree — and that a provider is responsible for producing a constructed, mounted router from them; it names no concrete engine.

**Rationale**: Concrete router engines evolve independently of the substrate; confining engine choice to a swappable, separately published provider package is what keeps that evolution from reaching outside the microfrontend that made the choice, and what keeps the substrate itself free of any concrete engine dependency.

**Actors**: `cpt-frontx-routing-actor-microfrontend-developer`

#### Route ownership signal

- [ ] `p1` - **ID**: `cpt-frontx-routing-fr-route-ownership-signal`

The system **MUST** resolve a URL to its declared route owner by longest matching declared prefix, and **MUST** publish an observable signal reporting every ownership-relevant transition — an owner appearing, disappearing, changing, or its remainder beneath the prefix changing — to a consumer that supplies its own set of declared identifier-to-prefix pairs as a plain argument, and **MUST** provide a URL back-projection helper the consumer calls to reflect a mount that was not driven by navigation back into the URL under a specific declared prefix, using a `replace` that — unlike a `push` — does not truncate the forward portion of the history stack after a back step the user has already taken. Two-way agreement between the URL and which unit is actually mounted is the consumer's own guarantee, built on top of this signal and this helper — not a guarantee this library makes on its own (§11).

**Rationale**: Treating the URL as the single source of truth for occupancy, and publishing that fact as an observable signal rather than orchestrating mounting itself, is what lets a deep link, a reload, and a back/forward step all resolve to the same declared owner an ordinary click-driven navigation would reach, while leaving the actual mount mechanism — and the occupancy semantics governing it — to whichever runtime the consumer already uses for that.

**Actors**: `cpt-frontx-routing-actor-application-developer`, `cpt-frontx-routing-actor-microfrontend-developer`

#### Imperative navigation outside the UI tree

- [ ] `p2` - **ID**: `cpt-frontx-routing-fr-imperative-navigation`

The system **MUST** expose `push`, `replace`, `go`, `location`, and `subscribe` against the shared navigation history for use outside any UI component tree.

**Rationale**: Not every caller that needs to read or change the URL is a rendered component; a mounting resolver, a host action handler, or a bootstrapping routine needs the same navigation surface without needing a mounted router to reach it.

**Actors**: `cpt-frontx-routing-actor-application-developer`, `cpt-frontx-routing-actor-microfrontend-developer`

## 6. Non-Functional Requirements

### 6.1 NFR Inclusions

#### Standalone Package Boundary

- [ ] `p1` - **ID**: `cpt-frontx-routing-nfr-standalone`

The system **MUST** import no other package in this ecosystem, and **MUST** call no consumer of its own: the source of declared owner-prefix pairs reaches the system only as a plain argument supplied by the consumer, and the system never itself invokes a mounting operation — mounting is performed by the consumer, acting on the system's published signal.

**Threshold**: Zero intra-ecosystem edges in the package manifest, and zero intra-ecosystem edges in the import graph, both verified mechanically by the boundary guards.

**Rationale**: This is the membership property the package claims in the published-libraries layer, and what lets an application adopt shared navigation while using none of the rest of the ecosystem.

#### Agnostic Navigation Core

- [ ] `p1` - **ID**: `cpt-frontx-routing-nfr-agnostic-core`

The navigation substrate **MUST** carry no dependency on any router engine or UI framework whatsoever; every dependency on a concrete engine **MUST** live in a separately published engine-provider package that implements the engine-provider port, never inside this package.

**Threshold**: This package's own module carries zero import of any router engine or of a UI-framework rendering primitive; checked mechanically by the boundary guards as a package-boundary property — no engine or UI-framework package can appear in this package's manifest or import graph at all, not merely inside a designated internal component.

**Rationale**: Keeping the substrate free of engine or framework knowledge is what lets one microfrontend's routing table change engines, or lets the default engine-provider package itself be replaced ecosystem-wide, without the substrate, the host, or any other microfrontend noticing. Making this a package boundary rather than an intra-package convention is what turns "confined to one component" into "absent from this package's own dependency graph, mechanically checkable without inspecting which module inside the package a given import lives in."

### 6.2 NFR Exclusions

The root PRD's §6.2 exclusions (safety, privacy, accessibility, internationalization, inclusivity, regulatory compliance) apply here for the same reasons stated there.

## 7. Public Library Interfaces

### 7.1 Public API Surface

The package's public surface is specified by this package's [DESIGN](./DESIGN.md) §3.3 and by its FEATUREs.

### 7.2 External Integration Contracts

None owned here. The package is distributed under the root PRD's package-registry distribution contract (`cpt-frontx-contract-package-registry-distribution`). The mapping from a route owner's identifier to the concrete unit it names, and the execution of a mount, are the consumer's own contracts, reached only through the plain-argument owner-prefix pairs source and the observable signal this package publishes — never products this package publishes itself.

## 8. Use Cases

#### Deep link resolves to a not-yet-mounted microfrontend's screen

- [ ] `p2` - **ID**: `cpt-frontx-routing-usecase-deep-link-to-microfrontend-screen`

**Actor**: `cpt-frontx-routing-actor-application-developer`

**Preconditions**:
- The navigation substrate is mounted at the host, and the host has created the route ownership signal's observer with its own source of declared identifier-to-prefix pairs.
- A URL under a declared prefix is opened cold, reloaded, or reached by back/forward, and the microfrontend that owns that prefix is not yet mounted.

**Main Flow**:
1. The route ownership signal's observer resolves the URL's pathname to a declared route owner by longest matching prefix and reports the owner appearing (`cpt-frontx-routing-fr-route-ownership-signal`).
2. The host's own mount mechanism mounts that route owner in response to the reported transition.
3. Once mounted, the microfrontend's own engine-provider package reads the current location from the shared history at start and matches the remainder of the path under its `basepath` — a guarantee the engine-provider port's consumer, not this library, makes about its own construction (owned by that provider's own PRD).

**Postconditions**:
- The mounted screen and the URL agree without a blank screen, because the freshly mounted router reads the already-current location rather than starting from a blank route.

**Alternative Flows**:
- **No declared owner matches the path**: the observer reports no owner; the host's own fallback is shown and nothing is mounted.
- **The URL later moves outside the mounted owner's declared prefix**: the observer reports the owner disappearing or changing, and the host unmounts that microfrontend through its own mount mechanism.

## 9. Acceptance Criteria

- [ ] A single navigation-history instance answers `push`/`replace`/`go`/`location`/`subscribe` for the host and for every independently bundled microfrontend registered in the same realm, and every one of those five members is callable by a caller with no mounted router or UI-framework component tree in its call path — verifiable via `cpt-frontx-routing-fr-single-navigation-substrate` and `cpt-frontx-routing-fr-imperative-navigation`.
- [ ] Replacing the engine-provider package used by one microfrontend changes no file outside that microfrontend's own route tree and search-parameter handling — verifiable via `cpt-frontx-routing-fr-engine-provider-port`.
- [ ] A cold load, a reload, and a back/forward step all resolve the same declared route owner from the URL through the same resolution path, reported as an observable transition to the consumer — verifiable via `cpt-frontx-routing-fr-route-ownership-signal`.
- [ ] The package declares no intra-ecosystem dependency, and its navigation substrate carries no import of any router engine or a UI framework — verifiable via the boundary guards.

## 10. Dependencies

| Dependency | Description | Criticality |
|------------|-------------|-------------|
| Browser navigation-history API | The primitive the substrate's own realm-shared history implementation is built on. | p1 |

## 11. Assumptions

- The host and every independently bundled microfrontend composed into one application share a single JavaScript realm; the navigation substrate's sharing boundary is the realm.
- The host mounts the navigation substrate, and creates the route ownership signal's observer with its own owner-prefix pairs source, before any deep link into a microfrontend's screen is resolved.
- Nesting between declared prefixes is legal (see `cpt-frontx-routing-fr-route-ownership-signal`): a conflict means two route owners declaring the *same* prefix, not one prefix nesting inside another. Prefix equality for this purpose is decided by this library's own segment-normalization rule, not by string equality of the two declared forms; this library publishes that rule (equivalently, an equivalence predicate over declared prefixes) precisely so the host can apply the same rule the library itself will use to resolve either prefix at navigation time. A same-prefix conflict, so defined, is caught at the point the host registers its route owners, not by this library.
- A single route owner may declare more than one prefix — the owner-prefix pairs source is a set of pairs, not a map keyed uniquely by identifier — and an ownership-change transition and the URL back-projection helper both carry a specific matched prefix rather than "the" owner's prefix (see the route-ownership-signal FEATURE's own contract shapes).
- A microfrontend declares the routes in its own routing table relative to its `basepath`, never as absolute paths carrying the prefix. An absolute path pins the routing table to one deployment mode's prefix, which is what would make the composed and standalone modes diverge.
- A consumer that needs the URL and the mounted route owner to durably agree in both directions implements that reconciliation itself, on top of the route ownership signal and the URL back-projection helper (`cpt-frontx-routing-fr-route-ownership-signal`); this library publishes the facts the reconciliation acts on but does not perform the reconciliation itself.
- More than one route-ownership-signal observer may exist in the same realm at once — for example, a host's own observer and a nested host's observer one level down — with no conflict between them: each observer is independent, reads its own owner-prefix pairs source, and reports its own transitions against the one shared navigation history every observer in the realm reads.

## 12. Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Two independently bundled copies of this package end up with two separate history instances instead of one shared instance. | Programmatic navigation in one copy produces no change the other observes, so routers drift out of agreement with each other and with the URL. | The navigation substrate is reached through a single realm-shared instance rather than a per-bundle one, by construction, for every copy built against the same `NavigationHistory` contract version. This prevention holds within one contract version only: a copy built against a different version resolves under its own versioned key and constructs its own instance, so a cross-version mismatch yields one instance per version rather than a single shared one. |
| A replacement router engine's history adapter does not fully satisfy the shared history's contract. | The microfrontend that adopted it may navigate correctly in isolation while disagreeing with the rest of the realm. | The engine-provider port states the history contract the substrate expects; the engine-behind-port constraint keeps every other unit unaffected by the substitution either way. |
