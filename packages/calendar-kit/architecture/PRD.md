# PRD — Calendar Kit (`@gears-frontx/calendar-kit`)

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
  - [5.1 Calendar Surface](#51-calendar-surface)
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

`@gears-frontx/calendar-kit` is the ecosystem's published calendar UI component library: the installable React package through which applications embed calendar views — day, week, month, agenda — together with their event interactions, without re-implementing or copying the calendar UI. It is a member of the published-libraries layer admitted by the member packaging ADR ([ADR 0001](./ADR/0001-calendar-kit-packaging.md)); ecosystem-level requirements are owned by the [root PRD](../../../architecture/PRD.md).

### 1.2 Background / Problem Statement

The ecosystem needs one calendar UI surface — day, week, month and agenda views, an event card, a detail panel, a create-event shell, an availability grid, and sidebar widgets — that host applications embed inside their own pages with their own data and permission model. The adoption rule rules out forking: copying the calendar source would create a second drifting calendar UI. The package therefore ships as a versioned member of this monorepo's published-libraries layer, published to the registry on merge to develop, with planning, solver and data staying in the host's backend. This PRD owns the library's requirements so that delivery is an installable artifact, not a source tree to copy.

### 1.3 Goals (Business Outcomes)

- **Installable, never copied** — a consuming team installs `@gears-frontx/calendar-kit` as a versioned dependency and upgrades by bumping the version; no consuming repository holds a copy of the calendar implementation. Target: a clean consumer installs the alpha and imports a family-unit entry; Timeframe: ongoing from first publication.
- **One calendar UI language** — every consuming application renders the same calendar views, interaction patterns and accessibility behaviour from one library, so calendar UI does not drift between host applications. Target: zero duplicated calendar view implementations in consuming repositories that adopt the kit; Timeframe: ongoing from first delivery.
- **Host stays in control** — a host application supplies its own data, permission state and interaction mode, and receives typed callbacks; the library never owns backend operations or version switching. Target: every consumer-visible action resolves to a host callback; Timeframe: first delivery.

### 1.4 Glossary

This PRD uses the ecosystem's shared vocabulary: _published library_ and _member_ mean what the root glossary defines ([root PRD §1.4](../../../architecture/PRD.md#14-glossary)). A **host application** is a consuming application that embeds the library's components inside its own pages. A **UI data model** is the neutral, library-owned shape of calendar data that a host maps its backend data into before rendering. An **interaction mode** is a host-selected behaviour of a grid — quick-create, paint-and-move, or read-only. A **slot** is a render function through which a host replaces or customizes part of a component's structure or content. A **family unit** is one public component family shipped as a flat subpath entry of the package.

## 2. Actors

### 2.1 Human Actors

#### Consumer Developer

**ID**: `cpt-frontx-calendar-kit-actor-consumer-developer`

**Role**: Installs the library in a host application, maps the host's backend data into the UI data model, embeds the calendar components, and wires the typed callbacks and slots. Fills the root PRD's Project Developer role (`cpt-frontx-actor-project-developer`) at the calendar surface. **Needs**: An installable versioned artifact; a stable, intentional public API; host-owned data/mode/permission boundaries; customization through props, slots and theme tokens without modifying library source.

### 2.2 System Actors

#### Host Application

**ID**: `cpt-frontx-calendar-kit-actor-host-application`

**Role**: The running frontend application that embeds the library's components. Owns its backend responses, version state, permissions, planning and solver behavior; maps them into the UI data model and receives the library's callbacks. Operated by the consuming application; the library treats it as the sole owner of application state.

## 3. Operational Concept & Environment

The host application declares a dependency on `@gears-frontx/calendar-kit`, imports the shared theme stylesheets once, maps its backend data into the neutral UI data model, and renders the calendar components with host-owned data, mode and permission state. The library performs framework-independent date/time/grid calculations in its React-free core, exposes controlled and uncontrolled React state adapters, and renders the visual units; every consumer-visible action — event selection, quick-create, paint selection, move request — returns to the host as a typed callback, and every host-specific rendering decision enters through a slot.

### 3.1 Module-Specific Environment Constraints

- Requires a browser environment with `Intl` for locale-aware temporal formatting; the host supplies `locale`, `direction` and the `t` translation callback (`CalendarTranslate`) to `CalendarLocalizationProvider`, and `timeZone` to `CalendarProvider` — the library ships no i18n registry.
- React and react-dom are peer dependencies at `^19.0.0`; `@gears-frontx/ui-kit` is an exact-pinned runtime dependency imported only by `src/ui/primitives/`, and the package ships its own theme stylesheet with host token values as fallbacks.
- The core layer runs framework-free: no React, no ui-kit, no browser globals, no translation registry — enforced mechanically, not by convention.

## 4. Scope

### 4.1 In Scope

- The neutral UI data model separating application data from UI data.
- The React-free core: temporal types and validation, range/day segmentation, all-day span allocation, overlap layout, interaction transitions, pure format-input helpers.
- The week grid as the first-delivery family unit, with host-provided data and the three interaction modes.
- Event-card and detail-panel slots, conflict rendering carrying a dimension label, and the remaining family units (day/month/agenda views, toolbar, create-event shell, availability grid, sidebar widgets) as later deliveries behind the same package identity.
- The documented theme contract: semantic `--cal-*` custom properties backed by package-local primitive tokens and host-token fallbacks, plus the enumerated calendar-owned tokens.
- Controlled and uncontrolled APIs, intentional flat public exports, and documentation for every public unit.

### 4.2 Out of Scope

- Backend services, planning, solver, and data ownership — these stay in the host's backend; the library exposes a UI data model and callbacks only.
- Version switching, hidden-calendar filtering policy, and permission decisions — host state that chooses the mode outside the kit.
- A calendar-creation form or creation workflow — creation is a host callback/slot only (member packaging ADR).
- State management, data fetching, and i18n registry integration — host concerns; the library receives data and a host-supplied `t` translation callback.
- Any existing date/range picker entry outside this member — untouched by this package.

## 5. Functional Requirements

### 5.1 Calendar Surface

#### Installable versioned artifact, never copied source

- [ ] `p1` - **ID**: `cpt-frontx-calendar-kit-fr-installable-artifact`

The system **MUST** be distributed as an installable, independently versioned npm artifact that a host application adopts by declaring a dependency and upgrading by bumping the version, and **MUST NOT** require or permit a consuming repository to hold a copy of the calendar implementation.

**Rationale**: The adoption rule rules out a second drifting calendar UI; the consumer upgrades by bumping a version, and the repository's bump-on-change gate makes the package boundary the release boundary (member packaging ADR).

**Actors**: `cpt-frontx-calendar-kit-actor-consumer-developer`

#### Neutral UI data model between backend and UI

- [ ] `p1` - **ID**: `cpt-frontx-calendar-kit-fr-neutral-ui-data-model`

The system **MUST** define a library-owned UI data model for calendar events, cells, ranges and conflicts, and **MUST** let a host application map its backend responses into that model before rendering, so no component depends on any specific backend response shape.

**Rationale**: Backend contracts evolve independently of the UI; keeping them out of components is what lets one library serve multiple hosts with different backends.

**Actors**: `cpt-frontx-calendar-kit-actor-consumer-developer`

#### Host-selected interaction modes with typed callbacks

- [ ] `p1` - **ID**: `cpt-frontx-calendar-kit-fr-host-owned-interaction-modes`

The system **MUST** let the host select a grid's interaction mode — quick-create, paint-and-move, or read-only — and **MUST** return every consumer-visible action to the host through stable, domain-level typed callbacks, where read-only emits none of the create, paint or move callbacks and a move commits only through its confirm handshake.

**Rationale**: The host picks the mode per screen (a planning flow paints availability; a scheduling screen quick-creates; a published schedule is read-only), and the host owns the backend operation each callback triggers.

**Actors**: `cpt-frontx-calendar-kit-actor-consumer-developer`, `cpt-frontx-calendar-kit-actor-host-application`

#### Host-specific rendering through slots

- [ ] `p1` - **ID**: `cpt-frontx-calendar-kit-fr-product-render-slots`

The system **MUST** provide render slots through which a host replaces the event card, detail panel content, and other host-specific sections, receiving typed render contexts and never requiring modification of library source code.

**Rationale**: Each host carries different card/detail data; slots keep that variance in the host while the shared structure stays in the library.

**Actors**: `cpt-frontx-calendar-kit-actor-consumer-developer`

#### Conflict rendering carrying a dimension label

- [ ] `p1` - **ID**: `cpt-frontx-calendar-kit-fr-conflict-dimension-rendering`

The system **MUST** render event conflicts carrying a conflict dimension plus a host-supplied display label, and **MUST NOT** invent host-specific conflict labels itself.

**Rationale**: Conflicts name their dimension; the label text is host vocabulary the host owns.

**Actors**: `cpt-frontx-calendar-kit-actor-consumer-developer`

#### Documented theme contract

- [ ] `p1` - **ID**: `cpt-frontx-calendar-kit-fr-theme-contract`

The system **MUST** ship a documented theme contract of semantic custom properties — every property either backed by a package-local token or belonging to the enumerated calendar-owned set, with host-token fallbacks where provided — plus a stylesheet export, so a host overrides branding by redefining custom properties without changing component source.

**Rationale**: One documented token surface keeps branding overrides predictable and prevents raw palette values from leaking into component styles.

**Actors**: `cpt-frontx-calendar-kit-actor-consumer-developer`

#### Controlled and uncontrolled state APIs

- [ ] `p1` - **ID**: `cpt-frontx-calendar-kit-fr-controlled-uncontrolled-apis`

The system **MUST** provide both controlled APIs, where the host owns the state value and change callback, and uncontrolled APIs, where the component manages its own state from a default, for every stateful behaviour such as selection and interaction mode.

**Rationale**: Hosts integrating into existing state management need control; simpler hosts need the component to manage state locally.

**Actors**: `cpt-frontx-calendar-kit-actor-consumer-developer`

#### Intentional public exports

- [ ] `p1` - **ID**: `cpt-frontx-calendar-kit-fr-intentional-public-exports`

The system **MUST** expose only intentional public APIs — components, hooks, types, core, theme and styles — through explicit flat subpath entries with type declarations resolvable under both `bundler` and `nodenext`, and **MUST NOT** expose internal implementation files.

**Rationale**: The public API is part of the package surface; internal files must not become accidental contracts.

**Actors**: `cpt-frontx-calendar-kit-actor-consumer-developer`

#### Accessibility as a first-class requirement

- [ ] `p1` - **ID**: `cpt-frontx-calendar-kit-fr-accessibility`

The system **MUST** meet WCAG 2.1 Level AA for every interactive component: semantic roles, accessible labels and states, keyboard navigation and interaction, correct focus management, and screen-reader compatibility, verified by integrated accessibility checks.

**Rationale**: Calendar grids are dense keyboard surfaces; the library is the single place these behaviours can be guaranteed once for every consuming application.

**Actors**: `cpt-frontx-calendar-kit-actor-consumer-developer`

## 6. Non-Functional Requirements

### 6.1 NFR Inclusions

The ecosystem-wide NFRs are owned by the [root PRD §6.1](../../../architecture/PRD.md#61-nfr-inclusions); this member contributes the boundaries below.

#### React-free core boundary

- [ ] `p1` - **ID**: `cpt-frontx-calendar-kit-nfr-react-free-core`

The system **MUST** keep its core layer free of any React, react-dom, ui-kit, backend-package, bridge, Redux-slice, translation-registry, or browser-global import, and **MUST** enforce that property mechanically — the separate core type-check configuration and the root dependency-cruiser rules — rather than by folder convention.

**Threshold**: Zero forbidden imports in `src/core/**`, verified by the named gates on every change.

**Rationale**: An untested folder convention is not a boundary; the deferral of a separate core package is honest only while the no-React property is enforced (member packaging ADR).

#### Independent version line

- [ ] `p1` - **ID**: `cpt-frontx-calendar-kit-nfr-independent-versioning`

The system **MUST** evolve on its own semantic-version line such that a calendar-only source change bumps and publishes only this package. Its `@gears-frontx/ui-kit` dependency **MUST** be exact-pinned and **MUST** be imported only by the package-local primitives.

**Threshold**: A calendar-only change requires no UI-kit change: ui-kit is a pinned dependency behind the primitives, never a peer the host must align.

**Rationale**: This serves the root evolvability commitment (`cpt-frontx-nfr-evolvability`) at the member level and is the consumer's "bump a version" workflow made mechanical.

#### Tree-shakeable family units

- [ ] `p1` - **ID**: `cpt-frontx-calendar-kit-nfr-tree-shakeable-units`

The system **MUST** build each family unit as an independent entry with injected component CSS and CSS-only side effects, so an unimported family unit contributes neither JavaScript nor CSS to a consumer bundle.

**Threshold**: A consumer importing one family unit's entry contains no JavaScript or CSS of any other family unit, verified by the consumer-bundle gate.

**Rationale**: Hosts embed a subset of the surface; they must not pay the bundle cost of the families they do not mount.

### 6.2 NFR Exclusions

The root PRD's §6.2 exclusions for safety, privacy by design, inclusivity, and regulatory compliance apply here for the same reasons stated there. Accessibility and internationalization are not excluded at this member: the package ships an end-user-facing interface, so accessibility is a first-class functional requirement (§5.1) and internationalization is handled by the host-supplied `t` translation callback, `locale` and `timeZone` props rather than a bundled registry.

## 7. Public Library Interfaces

### 7.1 Public API Surface

The package's public surface is deliberately below the root interface altitude: the root DESIGN introduces no `interface` identifier for it, anchoring it by the member packaging decision record instead ([ADR 0001](./ADR/0001-calendar-kit-packaging.md)). Its concrete surface — the neutral UI data model types, the family-unit props and callback/slot signatures, and the theme tokens — is specified by this package's [DESIGN](./DESIGN.md) and its FEATUREs, starting with [week-grid](./features/week-grid/FEATURE.md).

### 7.2 External Integration Contracts

No external ecosystem edge is owned here. The package is distributed under the root PRD's package-registry distribution contract (`cpt-frontx-contract-package-registry-distribution`), and its package-local primitives wrap `@gears-frontx/ui-kit` controls behind the calendar theme.

## 8. Use Cases

#### A host embeds the week grid with its own data and receives typed callbacks

- [ ] `p2` - **ID**: `cpt-frontx-calendar-kit-usecase-embed-week-grid`

**Actor**: `cpt-frontx-calendar-kit-actor-consumer-developer`

**Preconditions**:

- The host application declares `@gears-frontx/calendar-kit` and its peers as dependencies and imports the theme stylesheets once.
- The host holds its calendar data, permission state, and the desired interaction mode.

**Main Flow**:

1. The Consumer Developer maps the host's backend events into the neutral UI data model (`cpt-frontx-calendar-kit-fr-neutral-ui-data-model`).
2. The Consumer Developer renders the week grid with host-provided events, the selected interaction mode, and the host's permission/read-only state (`cpt-frontx-calendar-kit-fr-host-owned-interaction-modes`).
3. The user selects an event; the grid calls the host's event-select callback with the event and its render context.
4. The user performs a mode-appropriate action — quick-create on an empty cell, paint over cells, or drag an event; the grid returns the corresponding typed payload, and a move commits only when the host confirms its request.
5. Host-specific card and detail content renders through the host's slots (`cpt-frontx-calendar-kit-fr-product-render-slots`), and conflicts render with their dimension label (`cpt-frontx-calendar-kit-fr-conflict-dimension-rendering`).

**Postconditions**:

- Every consumer-visible action resolved to a host callback; the library holds no backend state and performed no backend operation.

**Alternative Flows**:

- **Read-only mode**: the grid renders the same surface but emits none of the create, paint or move callbacks.
- **Host denies a move**: the host cancels the move request; the grid restores the pending state without committing.

## 9. Acceptance Criteria

- [ ] A clean consumer installs the published-shaped alpha, imports the week-grid entry, provides host-owned UI data and permission/mode state, and receives typed callbacks without importing any host scheduling backend, solver or planning code — verifiable via `cpt-frontx-calendar-kit-fr-installable-artifact` and the pack-plus-clean-consumer gate.
- [ ] No consuming repository holds a copy of the calendar implementation; consumption is by declared dependency only — verifiable via `cpt-frontx-calendar-kit-fr-installable-artifact`.
- [ ] Any pre-existing date/range picker entry outside this package remains distinct from the calendar-kit public names — verifiable via the package export names.
- [ ] Calendar creation ships as generic UI only (`CreateEventPopover` driven by host callbacks); persistence, backend and scheduling rules stay with the host — verifiable via the member packaging ADR and the package source scan.
- [ ] Every file under `src/core` carries no React, ui-kit, or browser-global import — verifiable via `cpt-frontx-calendar-kit-nfr-react-free-core` and the root dependency-cruiser rules.
- [ ] A calendar-only source change bumps only this package — verifiable via `cpt-frontx-calendar-kit-nfr-independent-versioning` and the bump-on-change gate.

## 10. Dependencies

| Dependency | Description | Criticality |
| --- | --- | --- |
| React / react-dom (peer dependencies, `^19.0.0`) | The UI framework the host supplies and versions; the library declares no hard runtime coupling. | p1 |
| `@gears-frontx/ui-kit` | Exact-pinned dependency, imported only by `src/ui/primitives/`; the calendar theme defines the seams its controls read. | p1 |
| Browser `Intl` | The primitive under locale-aware temporal formatting. | p1 |
| npm-compatible package registry | Distribution channel per the root package-registry contract. | p1 |

## 11. Assumptions

- The host maps its backend data into the UI data model before rendering; the library never sees a backend response shape.
- Local verification against a consumer goes through the built/packed output (packed tarball installed into a clean app); no link or local path is committed.
- Third-party runtime dependencies are added only when the package imports them directly, each exact-pinned; the first inventory is icons only.
- First delivery ships the week grid and shared model/theme; the remaining family units follow behind the same package identity.

## 12. Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| UI-kit leaking past the primitives. | Family units or hosts would couple to ui-kit's API and styles. | Only `src/ui/primitives/` imports `@gears-frontx/ui-kit`; hosts import `theme.css` and never ui-kit's stylesheet. |
| Thin evidence for drag/time-zone/virtualization dependencies. | Late dependency additions change the manifest. | Each addition requires a written reason and an exact pin; the first alpha ships with the minimal inventory. |
| Workspace registration cost before first delivery. | Boundary or fan-out gaps fail gates late. | Registration is a named lane step with its own gates (classification, allowlists, version-policy enumeration, CI consumer step). |
| Theme-token drift beyond the documented contract. | Consumers override tokens that do not exist. | The token test rejects a raw palette value, a non-alias absent from the owned table, or fixed geometry exposed as a public token. |
