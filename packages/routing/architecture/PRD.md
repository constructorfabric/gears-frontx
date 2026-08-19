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

`@gears-frontx/routing` is the ecosystem's navigation library: the published library through which a composed application and its independently bundled microfrontends share one browser navigation history and keep the URL and the screen a user is looking at in agreement. It exposes a framework-agnostic navigation substrate carrying that shared history, a resolution primitive that names which declared unit owns a URL segment at any depth of a composed application's own nesting of extension domains, and an engine-provider port so a concrete routing engine can be swapped inside a single microfrontend's own territory without touching the substrate, the host, or any sibling microfrontend. This library carries no dependency on any concrete router engine itself; a separately published engine-provider package satisfies the port, and the ecosystem provides a default implementation of it. This PRD owns the library's requirements; ecosystem-level requirements are owned by the [root PRD](../../../architecture/PRD.md).

### 1.2 Background / Problem Statement

A composed application is many independently bundled units running in one browser tab, each capable of owning some slice of the URL — and those units nest: a unit that owns one slice may itself contain further units, each owning its own slice beneath it, to whatever depth the composed application actually has. Left alone, each unit would create its own navigation history, so a programmatic navigation issued by one unit produces no change the others observe, and back/forward, deep links, and reloads stop agreeing with what is actually mounted at any depth. The Routing library gives every unit in the realm one navigation history to read and write, a declared way to scope a unit's own router to the URL segment it owns, and a signal — reported independently at every depth of that nesting, and for whichever part of the URL a unit chooses to represent its own occupancy in, whether that is the address bar's path or a query-string entry of its own — of when the URL's resolved owner changes, from which the consumer keeps the mounted screen and the URL as two views of the same fact rather than two independent ones that can drift.

### 1.3 Goals (Business Outcomes)

- **Single navigation history across independently bundled units** — Target: exactly one navigation-history instance answers `push`/`replace`/`go`/`location`/`subscribe` for the host and every independently bundled microfrontend in the realm; Timeframe: first platform release.
- **URL is the single source of truth for which unit occupies a routable placement** — Target: a cold load, a reload, and a back/forward step all resolve the mounted unit from the URL through the same resolution path; Timeframe: first platform release.
- **Router engine swappable within one microfrontend's own territory** — Target: replacing the engine used by one microfrontend changes no file outside that microfrontend's own route tree and search-parameter handling; Timeframe: first platform release.
- **Composition does not force every microfrontend onto one router-engine version** — Target: the navigation substrate itself declares no dependency on a concrete router engine; Timeframe: first platform release.

### 1.4 Glossary

This PRD uses the ecosystem's shared vocabulary: *application* means what the root glossary defines ([root PRD §1.4](../../../architecture/PRD.md#14-glossary)), and *microfrontend*, *extension*, and *extension domain* mean what the runtime's glossary defines ([mfes PRD §1.4](../../mfes/architecture/PRD.md#14-glossary)). The terms below are this library's own.

| Term | Definition |
|------|------------|
| navigation substrate | The framework-agnostic core owning the single shared navigation history, the `basepath` contract, and route-owner resolution; it depends on no router engine and no UI framework. |
| engine provider | A separately published package that binds the navigation substrate's shared history to a concrete router engine so the engine can drive rendering and matching, by satisfying this library's engine-provider port. Not owned by this library: an engine provider's own requirements, behavior, and package boundary are owned by that provider's own PRD and DESIGN — the ecosystem's own default is `@gears-frontx/routing-tanstack`. |
| zone | The territory an extension owns once mounted into an extension domain; a zone may itself contain further extension domains, so a composed application is a tree of domains and the zones their occupants open, to whatever depth the application actually composes. |
| level | One extension domain's own position in that tree, and the point at which this library resolves and reports ownership: resolution and observation both run against one domain at a time, never against the whole URL in one step, using only that domain's own declared route-owner pairs and the portion of the URL local to it. |
| base | The concrete URL value a level's own resolution runs relative to, supplied to it by the enclosing level the moment it begins to exist — a value fixed at that moment, never a declaration carried in a registration. Only the outermost level's base is an absolute prefix of the browser's own location; every nested level's base is itself a value the level above it produced. |
| basepath | This same base value, named specifically at the point an engine-provider package consumes it to scope a constructed router. |
| axial domain | The one domain, at most, within a zone whose resolved route owner continues the pathname; a zone nests no more than one, because a second would make the pathname branch beneath it. |
| parallel axis | Any other domain a zone projects into the URL; it occupies its own dedicated query-string key instead of continuing the pathname, so more than one such domain can be projected within the same zone without competing for the same URL segment. |
| projection | The act by which a domain's resolved occupancy is represented in the URL at all — axial or parallel — chosen by that domain's own consuming level. A domain never projected into the URL is ordinary application state this library takes no part in. |
| route owner | The opaque identifier of whichever extension currently occupies a declared prefix within one domain, supplied to the navigation substrate by that domain's own level as a plain argument; the substrate never interprets what the identifier names. A route owner's own declared prefix is always exactly one path segment — the same extension mounted more than once is a distinct route owner at each mount, each with its own single-segment prefix, never one route owner declaring more than one prefix. |
| route ownership signal | The observable signal this library publishes, independently at every domain level and for every axis a level projects, when that level's own locally resolved route owner changes — an owner appearing, disappearing, changing, or its remainder beneath the resolved segment changing — together with the URL back-projection helper a consumer calls after a mount not driven by navigation. Two-way agreement between the URL and which unit is actually mounted, at any level, is not this library's own guarantee; it is the consumer's, built on top of this signal (§11). |

## 2. Actors

### 2.1 Human Actors

#### Application Developer

**ID**: `cpt-frontx-routing-actor-application-developer`

**Role**: Mounts the navigation substrate at the host application, creates the route ownership signal's observer for the host's own domain level with its own source of declared identifier-to-prefix pairs, and wires the host's own router to the shared history; the same role recurs one domain level deeper whenever a mounted extension's own zone contains a further domain, with that extension's own consumer creating that level's own observer. Fills the root PRD's Project Developer role (`cpt-frontx-actor-project-developer`) at the navigation surface.
**Needs**: A single history usable from the host and from every independently bundled microfrontend, a declared way to bind a URL segment to whichever unit currently owns it at any domain level, and no obligation to standardize every microfrontend on one router-engine version.

#### Microfrontend Developer

**ID**: `cpt-frontx-routing-actor-microfrontend-developer`

**Role**: Builds a microfrontend's own router scoped to its own base, matching only the remainder of the URL beneath it. The extension declares its own prefix in its own registered declaration, not in this library's own contract; the enclosing level assigns that prefix's own base to the microfrontend's router the moment it mounts it — the host is that enclosing level for a microfrontend mounted at the outermost domain, and the deployment supplies the base directly when the same microfrontend is served on its own. Fills the root PRD's Template Developer role (`cpt-frontx-actor-template-developer`) where a template contributes a microfrontend.
**Needs**: A stable base contract, freedom to choose or swap the router engine inside the microfrontend's own territory, and a documented way to navigate outside that territory when the microfrontend legitimately needs to.

### 2.2 System Actors

#### Router Engine

**ID**: `cpt-frontx-routing-actor-router-engine`

**Role**: The pluggable, replaceable engine an engine-provider package binds the shared navigation history to, through this library's engine-provider port. Treated as opaque and substitutable by the navigation substrate and by every microfrontend other than the one that chose it; this library carries no concrete engine dependency of its own and no opinion on which engine a provider package chooses.

## 3. Operational Concept & Environment

The host application mounts the navigation substrate once per realm and creates the route ownership signal's observer for its own domain level, supplying its own source of declared identifier-to-prefix pairs as a plain argument; the substrate exposes the shared history to the host's own router and to every microfrontend an engine provider mounts under its assigned base. Every navigation — a link click, a back/forward step, a cold load, a reload, an imperative call — is read from or written to the one shared history, and the route ownership signal reports the resulting ownership transition to whichever level's own consumer created that level's observer; that consumer mounts or unmounts through its own mount mechanism and keeps the URL and the mounted route owner in agreement by acting on that signal and calling the URL back-projection helper when it mounts for a reason other than navigation. The same recurs one domain level deeper whenever a mounted extension's own zone contains a further domain: that extension's own consumer creates the deeper level's own observer, supplying that domain's own pairs, and resolves that level's own local remainder exactly as the host resolved its own.

The same microfrontend runs under two deployment modes without a change to its routing code. **Composed**: the host mounts the substrate, creates the route ownership signal's observer, and assigns each microfrontend the base its own resolved prefix names. **Standalone**: the microfrontend is served on its own, no observer is required, and the base comes from the deployment's own configuration — empty when served at a root, or the sub-path it is published under. The substrate and the engine provider behave identically in both; only whether an observer exists differs, and nothing in standalone operation depends on one not existing.

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
- The route ownership signal: resolving, at each domain level, the local portion of the URL beneath that level's own base to that domain's own declared route owner, observing and reporting every ownership-relevant transition at that level to the consumer, and a URL back-projection helper the consumer calls after a mount not driven by navigation — the two-way agreement between the URL and a mounted owner is the consumer's own guarantee, built on this signal (§11).
- The channel boundary: this library owns the URL channel only, among the ecosystem's host–microfrontend communication channels.

### 4.2 Out of Scope

- Addressed action dispatch and shared-property broadcast between microfrontends and the host — owned by the runtime that provides those channels ([mfes PRD](../../mfes/architecture/PRD.md)); this library neither duplicates nor mediates either one.
- Microfrontend loading, admission, placement, and isolation — owned by the runtime ([mfes PRD](../../mfes/architecture/PRD.md)).
- The registry of route owners, the execution of a mount, and any reconciliation between a competing pair of mounts — all owned by the consumer's own mount mechanism at every domain level, reached only through the plain-argument owner-prefix pairs source and the observable signal this library publishes, never through an injected port or an import of the runtime that implements them.
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

The system **MUST** resolve, at each domain level independently, the local portion of the URL beneath that level's own base to that domain's own declared route owner by longest matching declared prefix — matched against the level's own axial remainder of the pathname, or against a parallel axis's own named query-string key entries when the domain projects one instead — and **MUST** publish an observable signal, per level and per axis, reporting every ownership-relevant transition at that level to a consumer that supplies its own set of declared identifier-to-prefix pairs for that domain as a plain argument: an owner appearing, disappearing, changing, or its local remainder changing. The system **MUST** also provide a URL back-projection helper the consumer calls to reflect a mount that was not driven by navigation back into the URL under a specific declared prefix — replacing the pathname beneath an axial domain's own base, or replacing only a parallel axis's own query-string key entries — using a `replace` that — unlike a `push` — does not truncate the forward portion of the history stack after a back step the user has already taken. Two-way agreement between the URL and which unit is actually mounted, at any level, is the consumer's own guarantee, built on top of this signal and this helper — not a guarantee this library makes on its own (§11).

**Rationale**: Treating the URL as the single source of truth for occupancy at every domain level — not only the outermost one — and publishing that fact as an observable signal per level rather than orchestrating mounting itself, is what lets a deep link into a nested domain, a reload, and a back/forward step all resolve to the same declared owner an ordinary click-driven navigation would reach, one level at a time, as each level comes to exist. Because this library holds no registry of levels, it publishes no signal asserting that a deep path resolved end to end; only each level's own local transition, which the consumer's own mount mechanism composes across levels into whatever end-to-end fact it needs. Giving every other projected domain within a zone its own query-string key, rather than making it compete with a zone's own axial domain for the same pathname, is what lets more than one domain project within a zone without either one displacing the other's own segment.

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

#### Deep link resolves to a not-yet-mounted extension's screen, level by level

- [ ] `p2` - **ID**: `cpt-frontx-routing-usecase-deep-link-to-microfrontend-screen`

**Actor**: `cpt-frontx-routing-actor-application-developer`

**Preconditions**:
- The navigation substrate is mounted at the host, and the host has created the route ownership signal's observer for the host's own domain level, supplying its own source of declared identifier-to-prefix pairs.
- A URL naming a route owner several domain levels deep is opened cold, reloaded, or reached by back/forward, and none of the extensions along that path are yet mounted.

**Main Flow**:
1. The host's own domain-level observer resolves the URL's local remainder beneath the host's own base to a declared route owner by longest matching declared prefix, and reports the owner appearing (`cpt-frontx-routing-fr-route-ownership-signal`); the observer supplies only the pathname and the host's own declared pairs to the resolution primitive itself, never performing the matching directly.
2. The host's own mount mechanism mounts that route owner in response to the reported transition.
3. Once mounted, that extension's own zone may itself contain a further domain; for each such domain that comes to exist, its own consumer creates that level's own observer, which resolves the remainder of the URL beneath the base supplied to it at that moment against that domain's own declared pairs, exactly as the host's own level did, and reports its own transition.
4. This repeats one domain level deeper each time a resolved owner's own zone contains a further domain that has come to exist, until every domain level along the URL's path has resolved, or until a level resolves to no owner.
5. At every level, once its own owner is mounted, that extension's own engine-provider package reads the current location from the shared history at start and matches the remainder of the path under its own base — a guarantee the engine-provider port's consumer, not this library, makes about its own construction (owned by that provider's own PRD).

**Postconditions**:
- Each mounted extension and the URL segment its own domain level resolved agree without a blank screen, because each freshly mounted router reads the already-current location rather than starting from a blank route. This library never asserts that every level along the path resolved together as one event — only that each level resolved from a location already current the moment that level began observing.

**Alternative Flows**:
- **No declared owner matches a level's local remainder**: that level's own observer reports no owner; the consumer holding that level shows its own fallback and mounts nothing beneath it. A level several steps deeper along the same URL reporting nothing is indistinguishable, at any shallower level's own observer, from that deeper level's own wave simply not having arrived yet, since no level's own signal ever asserts that a path resolved beyond that level's own base.
- **The URL later moves outside a mounted owner's declared prefix at some level**: that level's own observer reports the owner disappearing or changing, and the consumer holding that level unmounts through its own mount mechanism. A navigation issued while several levels are still resolving is safe: the resolution restarts as a fresh wave from the outermost level, every stale level is torn down by whichever level mounted it, and no level ever holds onto a remainder of its own — every level always reads the shared history's current location.

## 9. Acceptance Criteria

- [ ] A single navigation-history instance answers `push`/`replace`/`go`/`location`/`subscribe` for the host and for every independently bundled microfrontend registered in the same realm, and every one of those five members is callable by a caller with no mounted router or UI-framework component tree in its call path — verifiable via `cpt-frontx-routing-fr-single-navigation-substrate` and `cpt-frontx-routing-fr-imperative-navigation`.
- [ ] Replacing the engine-provider package used by one microfrontend changes no file outside that microfrontend's own route tree and search-parameter handling — verifiable via `cpt-frontx-routing-fr-engine-provider-port`.
- [ ] A cold load, a reload, and a back/forward step all resolve the same declared route owner from a domain level's own local URL portion through the same resolution path, at every level a consumer holds an observer for, reported as an observable transition to that level's own consumer — verifiable via `cpt-frontx-routing-fr-route-ownership-signal`.
- [ ] The package declares no intra-ecosystem dependency, and its navigation substrate carries no import of any router engine or a UI framework — verifiable via the boundary guards.

## 10. Dependencies

| Dependency | Description | Criticality |
|------------|-------------|-------------|
| Browser navigation-history API | The primitive the substrate's own realm-shared history implementation is built on. | p1 |

## 11. Assumptions

- The host and every independently bundled microfrontend composed into one application share a single JavaScript realm; the navigation substrate's sharing boundary is the realm.
- The host mounts the navigation substrate, and creates the route ownership signal's observer for its own domain level with its own owner-prefix pairs source, before any deep link into any domain level's screen is resolved; a nested level's own consumer does the same for its own level, once that level begins to exist.
- A domain-level conflict — two route owners registered at the same domain declaring the same prefix — is caught at the point that domain's own consumer registers its route owners, not by this library; prefix equality for this purpose is decided by this library's own segment-normalization rule (equivalently, an equivalence predicate over declared prefixes), published precisely so a domain's own consumer can apply the same rule the library itself uses to resolve either prefix at navigation time. Nesting a further domain inside one route owner's own zone is not a same-domain conflict: it is a separate domain, one level deeper, with its own independent set of route owners and its own independent conflict check.
- A route owner's own declared prefix is always exactly one path segment: the owner-prefix pairs source a domain's own consumer supplies is a set of pairs, but no identifier appears in it against more than one prefix. The same underlying extension mounted more than once — to present the same UI at more than one place — is a distinct route owner at each mount, each with its own single prefix, never one route owner declaring several; an ownership-change transition therefore never needs to carry more than the new owner's own current prefix, since that prefix is fixed for as long as the registration producing it exists.
- A segment of the local URL portion beneath a domain's own base that is not itself a declared prefix registered at that domain — most typically a value a route owner's own engine-provider package consumes inside its own zone, such as an identifier — is opaque to this library's resolution: resolution matches only a domain's own declared, static prefixes, never a value a nested engine's own route tree would otherwise interpret. Where a further domain nested inside a route owner's own zone declares a prefix that a value in the route owner's own parametric route could otherwise have consumed, the nested domain's own static resolution takes precedence: that prefix is carved out of the enclosing route owner's own zone, and the enclosing route owner's own engine-provider package never receives it as part of its own opaque remainder.
- A microfrontend declares the routes in its own routing table relative to its own base, never as absolute paths carrying that base. An absolute path pins the routing table to one deployment mode's base, which is what would make the composed and standalone modes diverge.
- A consumer that needs the URL and the mounted route owner to durably agree, at any domain level, implements that reconciliation itself at that level, on top of the route ownership signal and the URL back-projection helper that level's own observer publishes (`cpt-frontx-routing-fr-route-ownership-signal`); this library publishes the facts the reconciliation acts on but does not perform the reconciliation itself, at the outermost level or at any level nested beneath it — a level several domains deep carries exactly the same obligation as the outermost one, never a lesser or different one.
- More than one route-ownership-signal observer may exist in the same realm at once — one per domain level a consumer holds, and, within one level, one per axis that level projects — with no conflict between them: each observer is independent, reads its own owner-prefix pairs source, resolves against its own base or its own axis carrier, and reports its own transitions against the one shared navigation history every observer in the realm reads. Resolving a URL several domain levels deep is therefore not one event but a wave of independent, per-level resolutions: each level's own observer resolves and reports the moment that level begins to exist, this library holds no registry of levels and so publishes no signal asserting that a path resolved end to end, and a level several steps deeper reporting nothing yet is indistinguishable, at any shallower level, from that deeper level's own wave simply not having arrived — until the deeper level itself begins to exist and reports its own first resolution.

## 12. Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Two independently bundled copies of this package end up with two separate history instances instead of one shared instance. | Programmatic navigation in one copy produces no change the other observes, so routers drift out of agreement with each other and with the URL. | The navigation substrate is reached through a single realm-shared instance rather than a per-bundle one, by construction, for every copy built against the same `NavigationHistory` contract version. This prevention holds within one contract version only: a copy built against a different version resolves under its own versioned key and constructs its own instance, so a cross-version mismatch yields one instance per version rather than a single shared one. |
| A replacement router engine's history adapter does not fully satisfy the shared history's contract. | The microfrontend that adopted it may navigate correctly in isolation while disagreeing with the rest of the realm. | The engine-provider port states the history contract the substrate expects; the engine-behind-port constraint keeps every other unit unaffected by the substitution either way. |
