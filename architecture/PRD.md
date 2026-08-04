# PRD — FrontX Ecosystem

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
  - [5.1 Core Framework](#51-core-framework)
  - [5.2 CLI](#52-cli)
  - [5.3 AI Tooling Framework](#53-ai-tooling-framework)
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

The FrontX Ecosystem exists to enable AI-driven creation of frontend projects. It gives teams a product set in which AI agents can reliably scaffold, extend, and evolve frontend projects by targeting stable, narrow, explicitly-contracted product capabilities instead of improvising against an open-ended codebase. Templates define what any given project becomes; the platform provides the lifecycle and runtime mechanisms for assembling, extending, and evolving a project from them. The ecosystem delivers this through three co-equal pillars: a **Core Framework** that makes an application runtime-extensible by composable microfrontends over a substrate for typed entities; a **CLI** that owns the full lifecycle of assembling and evolving a repository from templates — installing, listing, updating, and validating templates, applying a template to seed a new repository or extend an existing one, assembling a repository from multiple templates while detecting and preventing conflicting assembly, recording each applied template's provenance independently, and upgrading each applied template independently to a newer version; and an **AI Tooling Framework** that equips AI agents with ecosystem-wide capabilities, declares every capability it offers to AI agents so any agent host can find and use it without per-host configuration, lets templates contribute their own AI capabilities, activates those capabilities automatically in consuming projects, and orchestrates AI-driven template upgrades.

Together these pillars let an AI agent carry a frontend project from first scaffold through ongoing extension and version upgrades, while the human Template Developers and Project Developers steering the work stay in control of intent and review. The product's value is measured by how predictably and safely AI agents and their human collaborators can produce and maintain real frontend applications on top of it.

### 1.2 Background / Problem Statement

Teams building frontend projects increasingly depend on AI agents to do the work — scaffolding new projects, adding features, and keeping projects current as their foundations evolve. For an AI agent to do this reliably, it needs a product surface that is stable, narrow, and explicitly contracted, so the agent targets well-defined capabilities rather than guessing at the shape of an open-ended codebase.

Two groups of people, each working alongside AI agents, have distinct needs. **Template Developers** design, version, and publish the templates that other teams build from; they need stable product contracts, pre-publish validation, semantic-versioning discipline, a way to declare the boundaries of what a template owns so independently-authored templates assemble without conflict, and a way to bundle template-specific AI capabilities. **Project Developers** assemble a repository from one or more templates and then build business code on top; they need predictable assembly output, reliable per-template upgrades, a clear boundary between what the product provides and what the application must supply, and AI agents that already understand both the ecosystem and the specific templates in use.

Across both groups, three needs recur: stable, narrow contracts an AI agent can target; a repository lifecycle — install, apply, assemble, validate, and upgrade — that an AI agent can drive end to end; and AI tooling that knows the ecosystem out of the box and can be extended with knowledge specific to each template. The FrontX Ecosystem addresses these needs directly, so that AI-driven frontend development is predictable and safe for both the people directing it and the agents performing it.

### 1.3 Goals (Business Outcomes)

- **Bounded time-to-scaffold** — A Project Developer (or an AI agent acting for one) can assemble a working repository from a template in a single operation whose duration is bounded by a target published in the platform's release notes. Baseline: not yet measured (new product); Target: a predictable, bounded assembly operation; Timeframe: established and published at the first platform release.
- **Reviewable, reversible upgrades** — Every upgrade of an applied template to a newer version is applied as a reviewable change set that a developer approves before it touches repository files, with non-destructive rollback. Baseline: none (new product); Target: 100% of upgrades review-gated and reversible; Timeframe: first platform release.
- **Automatic activation of template AI extensions** — When a template that bundles AI capabilities is installed in a project, those capabilities become available to AI agents automatically, with no manual wiring by the developer. Baseline: none (new product); Target: zero manual wiring steps for template-bundled AI capabilities; Timeframe: first platform release.
- **Compatibility within a major version** — Platform releases preserve backward compatibility within a major version, so consuming applications are not forced to upgrade in lockstep with the product. Baseline: none (new product); Target: zero breaking changes to published product contracts within a major version line; Timeframe: ongoing from the first major release.
- **No architectural ceiling on application scale** — The platform places no upper limit on the number of microfrontends or type definitions an application integrates, beyond the thresholds stated in the non-functional requirements. Baseline: none (new product); Target: scale governed only by the stated NFR thresholds, not by product architecture; Timeframe: first platform release.

### 1.4 Glossary

| Term | Definition |
|------|------------|
| ecosystem | The FrontX product set as a whole; referred to hereinafter as "the ecosystem". |
| project | The development-time unit a Project Developer works in: a repository assembled from one or more templates, together with the recorded provenance of each applied template, and which the CLI installs into, validates, and upgrades. The development-time form of an application. |
| application | The running frontend product the platform composes at runtime: the host into which microfrontends are loaded and placed, made runtime-extensible by the Core Framework. The runtime form of a project. |
| microfrontend (MFE) | An independently-developed, runtime-loadable unit of user-facing functionality that the platform loads and places into a running application. Abbreviated **MFE**. |
| extension | A configured placement that binds one microfrontend into one extension domain, producing a concrete occupant of that domain. An extension is not the microfrontend itself; it is the microfrontend as placed and configured in a specific domain. |
| extension domain | A named extension point in the application where microfrontends can be placed. It governs which microfrontends may occupy it, whether it permits one or several occupants at once, and what shared state and capabilities its occupants receive. |
| type definition | A description of an entity's shape that the type system can validate against; specification-format-agnostic at the product-requirements level. |
| platform | The Core Framework pillar as a consuming application depends on it at runtime — the versioned runtime foundation an application is built upon. (Distinct from "ecosystem", which is the whole FrontX product set.) |
| template | A generator of some part of a project. A template produces files and configuration and declares the boundaries of what it owns. What a template produces is defined by the template itself. |
| preset | A template that references one or more other templates so that they are applied together as a set. |
| assembly | A repository composed from one or more independently-applied templates, whether within a single repository or across several repositories. |
| ownership boundary | A template's declaration of what it owns — the parts of a repository it may create or modify — used to detect and prevent conflicting assembly before any files are written. |
| scaffold | The act of applying a template to generate files and configuration into a target, whether seeding a new repository or extending an existing one. |
| template provenance | Recorded information, held per applied template, about which template and which template version it was applied from. A repository carries one provenance record per applied template. |
| upgrade | Applying a newer version of an already-applied template to a repository, delivered as a reviewable change set; each applied template upgrades independently. |
| update | Installation of a newer template version locally, without applying it to any repository. |
| template-bundled AI extension | An AI capability — a skill, workflow, guideline, or reference artifact — that ships inside a template and activates when that template is installed. |
| declared agent resource | A capability unit the AI Tooling Framework publishes in its manifest, carrying its own identity and the metadata that states when it applies, so that a project and the AI agents working in it can account for every agent-facing capability present. |
| AI agent host | The coding-agent environment an AI agent works in, which discovers the declared agent resources present in a project and activates them for the agent. Third-party to the product. |
| AI Tooling Framework | The Pillar 3 component that provides base ecosystem AI capabilities, the extension contract templates use to bundle AI extensions, and the discovery-and-activation surface that turns installed-template extensions into available capabilities for AI agents. |

## 2. Actors

### 2.1 Human Actors

#### Template Developer

**ID**: `cpt-frontx-actor-template-developer`

**Role**: Designs, authors, versions, and publishes templates that other teams build from. Works alongside AI agents throughout this work.
**Needs**: Stable product contracts; pre-publish validation tooling; semantic-versioning discipline tooling; reference templates; a way to declare the boundaries of what a template owns; support for bundling template-specific AI capabilities.

#### Project Developer

**ID**: `cpt-frontx-actor-project-developer`

**Role**: Assembles a repository from one or more templates, then builds business code on top of it. Works alongside AI agents throughout this work.
**Needs**: Predictable assembly output; reliable per-template upgrades; a clear boundary between what the product provides and what the application must provide; AI agents that already understand both the ecosystem and the specific templates in use.

### 2.2 System Actors

#### AI Tooling CLI

**ID**: `cpt-frontx-actor-ai-tooling-cli`

**Role**: The AI-tooling command-line integration. The FrontX AI Tooling Framework is installed into a consuming project through it, and AI agents discover the ecosystem's skills, workflows, and guidelines through it.
**Direction**: Inbound (installs the framework into a consuming project).
**Availability**: Required at template-project install and upgrade time and during AI-driven development sessions.

#### AI Agent Host

**ID**: `cpt-frontx-actor-ai-agent-host`

**Role**: The coding-agent environment an AI agent works in. It discovers the framework's declared resources in a consuming project and activates them for the agent, so the framework's capabilities become usable without per-host configuration.
**Direction**: Inbound (consumes the declared resources installed into a consuming project).
**Conformance expectation**: Honors the discovery obligations of the kit-installation contract (`cpt-frontx-contract-kit-installation`).
**Availability**: Third-party, outside the product's control; required during AI-driven development sessions.

#### GitHub

**ID**: `cpt-frontx-actor-github`

**Role**: Public source registry that hosts the templates published by Template Developers, and hosts the FrontX AI Tooling Framework. Both the FrontX CLI and the AI Tooling CLI fetch from it by versioned reference.
**Direction**: Outbound (publications flow to the registry); inbound (the CLI and AI Tooling CLI fetch from the registry into a consuming project).
**Availability**: Required at install and upgrade time.

#### Package Registry

**ID**: `cpt-frontx-actor-package-registry`

**Role**: npm-compatible package registry that hosts FrontX's published packages. Project Developers install FrontX packages from it using their chosen npm-compatible package manager.
**Direction**: Outbound (FrontX publishes packages to the registry); inbound (an application installs packages from the registry).
**Availability**: Required at publish time and at application install time.

## 3. Operational Concept & Environment

The ecosystem operates as a set of products that Template Developers and Project Developers use, together with AI agents, across two recurring activities: publishing templates and the AI capabilities bundled with them, and scaffolding and evolving projects from those templates. These activities run in ordinary developer environments and require nothing beyond standard project defaults.

### 3.1 Module-Specific Environment Constraints

None.

## 4. Scope

### 4.1 In Scope

#### Core Framework (Pillar 1)

- Microfrontends can be registered with the application and loaded on demand.
- Multiple microfrontends can occupy the same extension domain when the domain permits multiple occupants.
- Microfrontends can communicate with the host application and react to changes in the host application's state.
- Microfrontends and their extensions are validated against type definitions at registration.
- Applications can use type definitions for their own entities, and additional type definitions can be registered at runtime.
- Applications may use any UI framework; the core framework does not constrain that choice.
- Versioned platform releases with semantic-versioning discipline, so breaking changes are isolated from consuming applications by versioning and compatibility commitments.
- No architectural ceiling on application complexity — the number of microfrontends or type definitions an application integrates — within the stated non-functional thresholds.

#### CLI (Pillar 2)

- Installing a template from a public source registry by versioned reference.
- Listing installed templates and their versions.
- Updating an installed template locally to a newer version.
- Validating a template's structure — including that its declared ownership boundaries are well-formed — against the publication contract before publishing.
- Applying an installed template to seed a new repository in a chosen target directory.
- Adding an installed template into an existing repository.
- Assembling a repository from multiple independently-applied templates, resolving any templates a preset references so they are applied as part of the same operation.
- Declaring the boundaries of what a template owns, and detecting and preventing conflicting assembly before any files are written.
- Upgrading each applied template independently to a newer version, applied as a reviewable change set.
- Reviewing and approving upgrade changes before they apply to repository files.

#### AI Tooling Framework (Pillar 3)

- FrontX-specific skills available to AI agents, such as creating microfrontends, validating templates, generating type definitions, and other ecosystem-scoped operations.
- Every capability the framework offers to AI agents is declared, with its own identity and a statement of when it applies, so any AI agent host can find and use it without per-host configuration and nothing agent-facing arrives undeclared.
- Template-bundled AI extensions — template-specific skills, workflows, guidelines, and reference artifacts that operate alongside the ecosystem's base AI capabilities.
- Automatic discovery and activation of installed-template AI extensions in consuming projects, without manual wiring by the developer.
- AI-driven project-upgrade orchestration that complements direct CLI invocation, including review gates, migration analyses, and downstream impact assessments.
- Ecosystem-knowledge artifacts — rules, examples, guidelines, and reference artifacts — available to AI agents at session start, with no training step required.
- The AI Tooling Framework itself is template-agnostic and ships zero template-specific content; template-specific AI capabilities arrive through template bundles.

### 4.2 Out of Scope

- FrontX does not include specific UI component libraries (buttons, modals, forms, and the like).
- FrontX does not include a specific state management library.
- FrontX does not include specific internationalization or locale handling.
- FrontX does not include specific authentication or authorization implementations.
- FrontX does not include a specific theming or styling system.
- FrontX does not include specific layout choices — which extension domains exist, what they are called, or what microfrontends occupy them.
- FrontX does not include specific shared application state schemas, such as theme, language, or user-locale schemas.
- FrontX does not include specific build-tooling configurations.
- FrontX does not include specific AI workflows, skills, or guidelines tied to a particular application domain.
- FrontX is not a host for application-domain business logic of any kind.

## 5. Functional Requirements

Functional requirements define WHAT the system must do. Group by feature area or priority tier.

### 5.1 Core Framework

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

#### Microfrontend–host communication and host-state reaction

- [ ] `p1` - **ID**: `cpt-frontx-fr-mfe-host-communication`

The system **MUST** allow microfrontends to communicate with the host application. The system **MUST** allow microfrontends to react to changes in the host application's state.

**Rationale**: Enables coordinated behavior across independently-deployed units, so a composed application behaves as one product rather than disconnected fragments.

**Actors**: `cpt-frontx-actor-template-developer`, `cpt-frontx-actor-project-developer`

#### Microfrontend and extension validation at registration

- [x] `p1` - **ID**: `cpt-frontx-fr-mfe-type-validation`

The system **MUST** validate microfrontends and their extensions against type definitions at the time they are registered with the application.

**Rationale**: Surfaces contract violations at the moment of integration rather than later in front of users, lowering the cost and risk of composing third-party units.

**Actors**: `cpt-frontx-actor-template-developer`, `cpt-frontx-actor-project-developer`

#### Application-defined type definitions with runtime registration

- [ ] `p1` - **ID**: `cpt-frontx-fr-application-type-definitions`

The system **MUST** allow an application to use type definitions for its own entities. The system **MUST** allow additional type definitions to be registered at runtime.

**Rationale**: Lets an application extend the shared vocabulary it uses with its microfrontends, so the product grows with the application's own domain rather than being fixed at build time.

**Actors**: `cpt-frontx-actor-project-developer`

#### UI-framework-agnostic application components

- [ ] `p1` - **ID**: `cpt-frontx-fr-ui-framework-agnostic`

The system **MUST** allow an application built on the platform to use any UI framework for its components, including React, Vue, Svelte, and vanilla JavaScript. The core framework **MUST NOT** constrain the UI library choice.

**Rationale**: Lets applications and templates choose their UI stack independently of the platform, protecting that choice across platform updates and broadening the set of teams the product can serve.

**Actors**: `cpt-frontx-actor-project-developer`, `cpt-frontx-actor-template-developer`

#### Versioned platform evolution with compatibility commitments

- [x] `p1` - **ID**: `cpt-frontx-fr-versioned-platform-evolution`

The system **MUST** evolve through versioned releases under semantic-versioning discipline. The system **MUST** isolate breaking changes from consuming applications through versioning and compatibility commitments.

**Rationale**: Gives consuming applications predictable upgrades and frees them from upgrading in lockstep with the product, protecting investment in code built on the platform.

**Actors**: `cpt-frontx-actor-project-developer`, `cpt-frontx-actor-template-developer`

#### No architectural ceiling on application complexity

- [x] `p2` - **ID**: `cpt-frontx-fr-no-architectural-ceiling`

The system **MUST NOT** place an upper limit on the number of microfrontends or type definitions an application integrates, beyond the thresholds stated in the non-functional requirements.

**Rationale**: Lets the platform scale with the complexity of the applications built on it, so growth is governed by stated performance thresholds rather than by product architecture.

**Actors**: `cpt-frontx-actor-project-developer`

### 5.2 CLI

#### Template install from the source registry by versioned reference

- [x] `p1` - **ID**: `cpt-frontx-fr-cli-template-install`

The system **MUST** allow a developer to install a template from the source registry by versioned reference.

**Rationale**: Gives developers deterministic, version-pinned acquisition of templates, so the starting point for a project is reproducible rather than dependent on whichever version happens to be current.

**Actors**: `cpt-frontx-actor-template-developer`, `cpt-frontx-actor-project-developer`, `cpt-frontx-actor-github`

#### List installed templates and their versions

- [x] `p1` - **ID**: `cpt-frontx-fr-cli-template-list`

The system **MUST** allow a developer to list the templates currently installed and their versions.

**Rationale**: Gives developers visibility into their template inventory, so they can confirm what is available to scaffold from and at which version.

**Actors**: `cpt-frontx-actor-template-developer`, `cpt-frontx-actor-project-developer`

#### Update an installed template locally

- [x] `p1` - **ID**: `cpt-frontx-fr-cli-template-update-local`

The system **MUST** allow a developer to update an installed template to a newer version locally. This update **MUST NOT** alter any project that was scaffolded from the template.

**Rationale**: Decouples acquiring a newer template version from applying it to a project, so developers can obtain and inspect updates without disturbing existing projects.

**Actors**: `cpt-frontx-actor-template-developer`, `cpt-frontx-actor-project-developer`, `cpt-frontx-actor-github`

#### Validate a template's structure before publishing

- [x] `p1` - **ID**: `cpt-frontx-fr-cli-template-validate-prepublish`

The system **MUST** allow a Template Developer to validate a template's structure — including that the template's declared ownership boundaries are well-formed — against the publication contract before publishing it.

**Rationale**: Catches structural errors and malformed ownership boundaries before a template reaches other teams, so consumers are protected from malformed templates and from assembly conflicts, and the publisher avoids costly post-publication corrections.

**Actors**: `cpt-frontx-actor-template-developer`

#### Apply a template to seed a new repository

- [x] `p1` - **ID**: `cpt-frontx-fr-cli-seed-repository`

The system **MUST** allow a Project Developer to apply an installed template to seed a new repository in a chosen target directory.

**Rationale**: Gives developers predictable, reproducible bootstrap of a repository from a known template, so every repository starts from a consistent, contracted foundation.

**Actors**: `cpt-frontx-actor-project-developer`

#### Add a template into an existing repository

- [x] `p1` - **ID**: `cpt-frontx-fr-cli-add-template-to-repository`

The system **MUST** allow a Project Developer to add an installed template into an existing repository.

**Rationale**: Lets a repository grow by layering in further templates over time, so parts can be added independently rather than fixed at the moment the repository is first seeded.

**Actors**: `cpt-frontx-actor-project-developer`

#### Multi-template assembly and preset resolution

- [x] `p1` - **ID**: `cpt-frontx-fr-cli-composed-template-resolution`

A repository **MAY** be assembled from multiple independently-applied templates. When a template a developer applies references other templates (a preset), the system **MUST** resolve and apply those referenced templates as part of the same operation.

**Rationale**: Lets a repository be composed from several templates in a single step and lets a preset arrange a validated set of templates, so developers do not have to discover and apply each referenced template by hand.

**Actors**: `cpt-frontx-actor-project-developer`

#### Template ownership-boundary declaration

- [x] `p1` - **ID**: `cpt-frontx-fr-cli-template-boundary-declaration`

The system **MUST** allow a template to declare the boundaries of what it owns — the parts of a repository it may create or modify.

**Rationale**: Makes the ground each template claims explicit, so independently-authored templates can be assembled with conflicts detected up front rather than discovered as corrupted output.

**Actors**: `cpt-frontx-actor-template-developer`

#### Conflict-free assembly enforcement

- [x] `p1` - **ID**: `cpt-frontx-fr-cli-assembly-conflict-prevention`

When one or more templates are applied to a repository, the system **MUST** detect when two templates claim the same ground and **MUST** report and refuse the conflicting assembly before any files are written. The system **MUST NOT** silently merge conflicting claims.

**Rationale**: Turns the multi-writer problem into a declared, reviewable, design-time concern, so a repository is never left in a corrupted or silently-clobbered state by two templates fighting over the same ground.

**Actors**: `cpt-frontx-actor-project-developer`

#### Per-template upgrade as a reviewable change set

- [x] `p1` - **ID**: `cpt-frontx-fr-cli-project-upgrade-changeset`

The system **MUST** allow a developer to upgrade an applied template in a repository to a newer version of that template, with the upgrade applied as a reviewable change set. Each applied template **MUST** be upgradeable independently of the others.

**Rationale**: Makes adopting newer template versions non-destructive and auditable, and lets each part of a repository move on its own cadence, so developers can keep a repository current without a single whole-repository origin baseline and without risking unreviewed changes to their files.

**Actors**: `cpt-frontx-actor-project-developer`

#### Review and approval of upgrade changes before they apply

- [x] `p1` - **ID**: `cpt-frontx-fr-cli-upgrade-review-approval`

The system **MUST** allow a developer to review and approve upgrade changes before they apply to the repository's files.

**Rationale**: Keeps a human in control of what an upgrade changes, so no modification reaches a repository's files without explicit approval.

**Actors**: `cpt-frontx-actor-project-developer`

### 5.3 AI Tooling Framework

#### FrontX-specific skills available to AI agents

- [x] `p1` - **ID**: `cpt-frontx-fr-ai-frontx-skills`

The system **MUST** make FrontX-specific skills available to AI agents working in a FrontX-based project, including scaffolding a new project from a developer's stated intent by choosing among the templates installed locally, creating new microfrontends, validating templates, generating type definitions, and other ecosystem-scoped operations.

**Rationale**: Gives AI agents fluency in ecosystem operations from the start, so developers receive correct, ecosystem-aware assistance without configuring it for each project - including reaching a scaffolded project from what they want built rather than from a template reference they must already know.

**Actors**: `cpt-frontx-actor-template-developer`, `cpt-frontx-actor-project-developer`

#### Framework capabilities discoverable by any AI agent host

- [x] `p1` - **ID**: `cpt-frontx-fr-ai-agent-skill-resources`

Every capability the AI Tooling Framework offers to AI agents **MUST** carry a defined identity and state when it applies. Each capability the framework offers as an invocable entry point **MUST** be discoverable and invocable by any AI agent host honouring the kit-installation contract (`cpt-frontx-contract-kit-installation`), without per-host configuration by the developer. The framework **MUST NOT** deliver into a consuming project any agent-facing capability the project cannot account for.

**Rationale**: A uniform discovery guarantee lets every AI agent host find and use the framework's capabilities without per-host configuration, and leaves nothing agent-facing in a project that the project cannot account for.

**Actors**: `cpt-frontx-actor-project-developer`, `cpt-frontx-actor-ai-agent-host`, `cpt-frontx-actor-ai-tooling-cli`

#### Template-bundled AI extensions

- [x] `p1` - **ID**: `cpt-frontx-fr-ai-template-bundle-extensions`

The system **MUST** allow a Template Developer to bundle a template with AI extensions — template-specific skills, workflows, guidelines, and reference artifacts — that operate alongside the ecosystem's base AI capabilities.

**Rationale**: Lets templates carry their own AI expertise, so the knowledge specific to a template travels with it instead of being recreated in each consuming project.

**Actors**: `cpt-frontx-actor-template-developer`

#### Automatic discovery and activation of template-supplied AI extensions

- [x] `p1` - **ID**: `cpt-frontx-fr-ai-extension-discovery-activation`

When a template is installed in a project, the system **MUST** discover the template's AI extensions and activate them for AI agents working in that project, without the developer needing to wire them up manually.

**Rationale**: Delivers zero-configuration extensibility, so template-supplied AI capabilities become available the moment a template is installed.

**Actors**: `cpt-frontx-actor-project-developer`, `cpt-frontx-actor-ai-tooling-cli`

#### AI-driven project-upgrade orchestration

- [x] `p1` - **ID**: `cpt-frontx-fr-ai-upgrade-orchestration`

The system **MUST** allow a Project Developer to use AI agents to orchestrate template upgrades — analysing the change, applying the upgrade, and validating downstream effects — through AI-driven workflows that may include review gates, migration analyses, and downstream impact assessments.

**Rationale**: Complements direct CLI invocation with guided, AI-driven upgrades, so developers can adopt newer template versions with analysis and review built into the flow.

**Actors**: `cpt-frontx-actor-project-developer`

#### Ecosystem-knowledge artifacts available at session start

- [x] `p1` - **ID**: `cpt-frontx-fr-ai-session-start-knowledge`

The system **MUST** make ecosystem-knowledge artifacts — rules, examples, guidelines, and reference artifacts — available to AI agents at session start, with no training step required.

**Rationale**: Makes AI agents ecosystem-aware from the first interaction, so developers receive correct guidance immediately rather than after a setup or learning step.

**Actors**: `cpt-frontx-actor-template-developer`, `cpt-frontx-actor-project-developer`

#### AI Tooling Framework is template-agnostic

- [x] `p1` - **ID**: `cpt-frontx-fr-ai-tooling-template-agnostic`

The AI Tooling Framework **MUST** ship zero template-specific content; template-specific AI capabilities **MUST** arrive exclusively via template bundles.

**Rationale**: Keeps the framework free of coupling to any particular template's domain, so it stays portable across every template and templates remain the single source of their own AI capabilities.

**Actors**: `cpt-frontx-actor-template-developer`, `cpt-frontx-actor-project-developer`

## 6. Non-Functional Requirements

### 6.1 NFR Inclusions

#### Runtime performance

- [x] `p1` - **ID**: `cpt-frontx-nfr-runtime-performance`

The system **MUST** meet measurable response-time and throughput targets for runtime operations.

**Threshold**: Microfrontend registration completes in ≤ 50 ms at p95 per registration call; on-demand microfrontend load completes in ≤ 1500 ms at p95 from request to the microfrontend being loaded and placed; the application sustains ≥ 20 registration calls per second without p95 latency exceeding these targets.

**Rationale**: Predictable runtime performance is required for AI agents that compose applications from many microfrontends at scale.

#### Evolvability

- [x] `p1` - **ID**: `cpt-frontx-nfr-evolvability`

The system **MUST** evolve through versioned releases without forcing consumers to upgrade in lockstep.

**Threshold**: Major and minor versions across the product's published artifacts match; patch and pre-release versions may diverge; breaking changes are isolated from consuming applications by versioning and compatibility commitments; every removal is preceded by a deprecation cycle of at least one minor version.

**Rationale**: Predictable upgrade discipline lets consuming applications adopt new platform versions on their own cadence rather than in forced lockstep.

#### Scaling without an architectural ceiling

- [x] `p1` - **ID**: `cpt-frontx-nfr-scalability-ceiling`

The system **MUST** place no architectural upper limit on the number of microfrontends or type definitions an application can integrate.

**Threshold**: At least 100 microfrontends concurrently registered with a single application, and at least 500 type definitions registered with a single application, measured without architectural failure; these values are operational floors that conforming implementations meet or exceed, not ceilings.

**Rationale**: AI-driven projects accumulate complexity over time; the platform must not impose architectural limits that force teams to re-platform.

#### Security

- [x] `p1` - **ID**: `cpt-frontx-nfr-security`

**Threshold**: The platform enforces a default-deny access posture — a microfrontend receives no host state or capability beyond what its extension domain explicitly grants, and no implicit access to other microfrontends; every microfrontend and its extension passes type validation before it is admitted to run. Measured: 100% of admitted microfrontends validated at admission (zero unvalidated executions); zero access paths available to a microfrontend outside its extension domain's declared grants.

**Rationale**: Running independently-developed microfrontends — potentially from different teams or vendors — within one host makes default-deny access and admission validation essential for the trust enterprises require.

### 6.2 NFR Exclusions

- **Safety** (SAFE-PRD-001/002) — Not applicable as a safety-critical concern. FrontX is frontend developer tooling; it does not control, monitor, or interact with physical or safety-critical systems, so it cannot directly cause harm to people, property, or the environment. Risks arising from loading and running independently-developed microfrontends at runtime are addressed by the Security NFR in §6.1, not as a physical-safety concern.
- **Privacy by Design** (SEC-PRD-005): Not applicable — the product is developer tooling that does not collect, store, or process end-user personal data.
- **Accessibility** (UX-PRD-002): Not applicable — the product ships no end-user-facing interface; applications and templates built on the product own their own accessibility posture.
- **Internationalization** (UX-PRD-003): Not applicable — the product ships no end-user-facing text; applications and templates built on the product own their own internationalization.
- **Inclusivity** (UX-PRD-005): Not applicable — for the same reason as Accessibility, the product ships no end-user-facing interface.
- **Regulatory Compliance** (COMPL-PRD-001 / COMPL-PRD-002 / COMPL-PRD-003): Not applicable — the product is developer tooling that does not process regulated data; applications and templates built on the product own their own compliance posture.

## 7. Public Library Interfaces

### 7.1 Public API Surface

#### MFE Runtime

- [ ] `p1` - **ID**: `cpt-frontx-interface-mfe-runtime`

**Type**: Library

**Stability**: unstable

**Description**: The MFE Runtime registers microfrontends with a running application and loads them on demand, lets multiple microfrontends occupy the same extension domain when that domain permits multiple occupants, mediates communication between microfrontends and the host application and lets microfrontends react to changes in the host application's state, and validates microfrontends and their extensions against type definitions when they are registered (anchors capabilities C1-1, C1-2, C1-3, C1-4).

**Breaking Change Policy**: A major version bump is required for any incompatible change to the component's public surface; minor and patch versions preserve backward compatibility.

#### Type System

- [ ] `p1` - **ID**: `cpt-frontx-interface-type-system`

**Type**: Library

**Stability**: unstable

**Description**: The Type System validates microfrontends and their extensions against type definitions at registration and lets an application use type definitions for its own entities, with additional type definitions registered at runtime (anchors capabilities C1-4, C1-5).

**Breaking Change Policy**: A major version bump is required for any incompatible change to the component's public surface; minor and patch versions preserve backward compatibility.

#### CLI

- [ ] `p1` - **ID**: `cpt-frontx-interface-cli`

**Type**: CLI

**Stability**: unstable

**Description**: The CLI owns the repository lifecycle: it installs, lists, updates, and validates templates from the source registry; applies a template to seed a new repository or extend an existing one; assembles a repository from multiple independently-applied templates and resolves any templates a preset references as part of a single operation; detects and prevents conflicting assembly before any files are written by honoring each template's declared ownership boundaries; records per-applied-template provenance; and upgrades each applied template independently to a newer version as reviewable change sets that a developer approves before they apply (anchors capabilities C2-1 through C2-11).

**Breaking Change Policy**: A major version bump is required for any incompatible change to the command surface; minor and patch versions preserve backward compatibility.

#### AI Tooling Framework

- [ ] `p1` - **ID**: `cpt-frontx-interface-ai-tooling-framework`

**Type**: Library

**Stability**: unstable

**Description**: The AI Tooling Framework provides FrontX-specific skills to AI agents working in a project, presents its agent-facing capabilities as a surface of declared agent resources that any conforming AI agent host can discover and invoke, lets Template Developers bundle template-specific AI extensions, automatically discovers and activates installed-template AI extensions for AI agents in a consuming project, supports AI-driven orchestration of template upgrades, and makes ecosystem-knowledge artifacts available to AI agents at session start, while itself shipping zero template-specific content (anchors capabilities C3-2, C3-3, C3-4, C3-5, C3-6, C3-7, C3-8).

**Breaking Change Policy**: A major version bump is required for any incompatible change to the component's public surface; minor and patch versions preserve backward compatibility.

### 7.2 External Integration Contracts

#### Source-spec contract

- [ ] `p2` - **ID**: `cpt-frontx-contract-source-spec`

**Direction**: required from client

**Description**: The product accepts versioned references that identify templates hosted on the source registry (`cpt-frontx-actor-github`). References resolve generically; the contract does not prescribe a specific reference syntax at the product-requirements level.

**Compatibility**: Reference resolution remains compatible across minor and patch versions; any breaking change follows the platform's evolvability requirement (`cpt-frontx-nfr-evolvability`).

#### Template manifest contract

- [ ] `p2` - **ID**: `cpt-frontx-contract-template-manifest`

**Direction**: bidirectional

**Description**: The product requires every template to publish a manifest that describes the template in a defined shape — including the boundaries of what the template owns and any other templates it references to be applied together — and it both produces that manifest when a template is validated for publication and consumes it when a template is installed, applied, or assembled with others. The declared ownership boundaries are what let the product detect and refuse conflicting assembly before any files are written. This is an internal contract between templates and the product; it names no external party.

**Compatibility**: The manifest shape is versioned with the platform; changes that are not backward-compatible follow `cpt-frontx-nfr-evolvability`.

#### Per-template provenance contract

- [ ] `p2` - **ID**: `cpt-frontx-contract-project-provenance`

**Direction**: provided by library

**Description**: The product records provenance per applied template into the repository, capturing which template and which template version each was applied from, so a later upgrade can determine what to apply for that template. A repository carries one provenance record per applied template rather than a single whole-repository origin. This is an internal contract recorded per applied template; it names no external party.

**Compatibility**: Provenance records remain readable across versions; any change that is not backward-compatible follows `cpt-frontx-nfr-evolvability`.

#### Kit-installation contract

- [ ] `p2` - **ID**: `cpt-frontx-contract-kit-installation`

**Direction**: required from client

**Description**: The AI Tooling Framework is installed into a consuming project through the AI-tooling CLI integration (`cpt-frontx-actor-ai-tooling-cli`), which is how AI agents come to have the framework's skills and the activated template extensions available. Installation materializes the framework's declared agent resources into the project and surfaces its public entry points, so that an AI agent host (`cpt-frontx-actor-ai-agent-host`) honouring this contract can discover and invoke them without bespoke wiring; this discovery obligation is what `cpt-frontx-fr-ai-agent-skill-resources` relies on.

**Compatibility**: The installation contract remains compatible across minor and patch versions; breaking changes follow `cpt-frontx-nfr-evolvability`.

#### Package-registry distribution contract

- [ ] `p2` - **ID**: `cpt-frontx-contract-package-registry-distribution`

**Direction**: bidirectional

**Description**: The product publishes its packages to the package registry (`cpt-frontx-actor-package-registry`) and is installed from that registry by consuming applications using their chosen package manager.

**Compatibility**: Published packages follow semantic versioning; consuming applications rely on the platform's evolvability commitments (`cpt-frontx-nfr-evolvability`).

#### Template AI-extension contract

- [ ] `p2` - **ID**: `cpt-frontx-contract-template-ai-extension`

**Direction**: bidirectional

**Description**: The product requires a template's bundled AI extensions to conform to a defined shape — a closed set of extension categories (skills, workflows, guidelines, and reference artifacts) — so the same expertise a Template Developer bundles with a template is recognized and activated uniformly in any project that installs it. This is an internal contract between templates and the product: it is declared by the Template Developer at authoring and consumed by the AI Tooling Framework at discovery and activation; it names no external party.

**Compatibility**: Additive changes within the contract preserve conforming templates; admitting or removing an extension category is a breaking change that follows the platform's evolvability requirement (`cpt-frontx-nfr-evolvability`).

## 8. Use Cases

#### Template Developer publishes a template that references other templates

- [ ] `p2` - **ID**: `cpt-frontx-usecase-publish-composed-project-template`

**Actor**: `cpt-frontx-actor-template-developer`

**Preconditions**:
- A template repository exists with the template's content authored.
- The product is installed on the developer's machine.

**Main Flow**:
1. The Template Developer authors the template's content.
2. The Template Developer declares the boundaries of what the template owns (`cpt-frontx-fr-cli-template-boundary-declaration`) and, for a preset, the other templates it references to be applied together (`cpt-frontx-fr-cli-composed-template-resolution`).
3. The Template Developer validates the template's structure, including that its declared ownership boundaries are well-formed, against the publication contract before publishing (`cpt-frontx-fr-cli-template-validate-prepublish`).
4. The Template Developer publishes the template to the source registry (`cpt-frontx-actor-github`).

**Postconditions**:
- The template is available for installation by Project Developers from the source registry.

**Alternative Flows**:
- **Validation fails**: the validation step reports specific errors — including malformed ownership boundaries; the Template Developer fixes them and re-validates before publishing.

#### Template Developer bundles a template with AI extensions

- [ ] `p2` - **ID**: `cpt-frontx-usecase-bundle-template-ai-extensions`

**Actor**: `cpt-frontx-actor-template-developer`

**Preconditions**:
- A template exists.
- The AI Tooling Framework's extension contract is documented in the ecosystem-knowledge artifacts available to AI agents at session start.

**Main Flow**:
1. The Template Developer declares AI extensions — skills, workflows, guidelines, and reference artifacts — inside the template bundle (`cpt-frontx-fr-ai-template-bundle-extensions`).
2. The Template Developer publishes the template via the source registry (`cpt-frontx-actor-github`).

**Postconditions**:
- When Project Developers install this template, the AI Tooling Framework automatically discovers and activates the bundled AI extensions for AI agents working in that project (`cpt-frontx-fr-ai-extension-discovery-activation`).

**Alternative Flows**:
- **Extension declaration malformed**: pre-publish validation reports the structural error before publication.

#### Project Developer assembles a repository from multiple templates

- [ ] `p2` - **ID**: `cpt-frontx-usecase-scaffold-composed-project`

**Actor**: `cpt-frontx-actor-project-developer`

**Preconditions**:
- The source registry (`cpt-frontx-actor-github`) is reachable.
- A target directory is chosen.
- The product is installed.

**Main Flow**:
1. The Project Developer installs the templates to apply by versioned reference (`cpt-frontx-fr-cli-template-install`).
2. The Project Developer applies a template to seed the repository (`cpt-frontx-fr-cli-seed-repository`); when a preset is applied, the templates it references are resolved and applied as part of the same operation (`cpt-frontx-fr-cli-composed-template-resolution`).
3. Before writing, the CLI checks that no two applied templates claim the same ground, honoring each template's declared ownership boundaries (`cpt-frontx-fr-cli-assembly-conflict-prevention`).
4. The AI Tooling Framework activates the ecosystem's base AI capabilities and any template-bundled AI extensions for AI agents working in the new repository (`cpt-frontx-fr-ai-extension-discovery-activation`, `cpt-frontx-fr-ai-session-start-knowledge`).

**Postconditions**:
- A repository on disk assembled from its templates, with one provenance record per applied template; AI agents have ecosystem and template-specific AI capabilities active.

**Alternative Flows**:
- **Source registry unreachable**: the CLI reports the failure and aborts the assembly without writing any files.
- **Conflicting assembly**: the CLI detects that two templates claim the same ground and reports and refuses the assembly before any files are written (`cpt-frontx-fr-cli-assembly-conflict-prevention`).

#### Project Developer adds a template into an existing repository

- [ ] `p2` - **ID**: `cpt-frontx-usecase-add-microfrontend-to-project`

**Actor**: `cpt-frontx-actor-project-developer`

**Preconditions**:
- An existing repository is on disk.
- The template is available in the source registry.

**Main Flow**:
1. The Project Developer installs the template by versioned reference (`cpt-frontx-fr-cli-template-install`).
2. The Project Developer adds the template into the existing repository (`cpt-frontx-fr-cli-add-template-to-repository`); before writing, the CLI checks the added template's declared ownership boundaries against those of the templates already applied and refuses if they conflict (`cpt-frontx-fr-cli-assembly-conflict-prevention`).
3. If the added template contributes a microfrontend, at application runtime that microfrontend is registered with the application (`cpt-frontx-fr-mfe-runtime-registration`) and type-definition validation runs at registration (`cpt-frontx-fr-mfe-type-validation`).

**Postconditions**:
- The template is added to the repository with its own provenance record; any microfrontend it contributes registers and validates successfully at runtime.

**Alternative Flows**:
- **Conflicting assembly**: the CLI detects that the added template claims ground an already-applied template owns and refuses the addition before any files are written.
- **Type validation fails at registration**: the application surfaces the validation error and the microfrontend is not placed into its extension domain.

#### Project Developer scaffolds a project from a stated intent

- [ ] `p2` - **ID**: `cpt-frontx-usecase-ai-driven-project-scaffolding`

**Actor**: `cpt-frontx-actor-project-developer`

**Preconditions**:
- One or more templates are installed in the local template inventory (`cpt-frontx-fr-cli-template-install`).
- A target directory is chosen.
- The product is installed.

**Main Flow**:
1. The Project Developer states what the project should be, in their own words, rather than naming a template (`cpt-frontx-fr-ai-frontx-skills`).
2. An AI agent uses the AI Tooling Framework to read the locally installed templates and match the stated intent against the description each template declares about itself, producing an application plan it presents to the developer before anything is written.
3. The AI agent applies the plan through the CLI: one template seeded to establish the repository (`cpt-frontx-fr-cli-seed-repository`), then each further distinct template added (`cpt-frontx-fr-cli-add-template-to-repository`), with the CLI checking declared ownership boundaries before every write (`cpt-frontx-fr-cli-assembly-conflict-prevention`).
4. The AI agent reports the applied set back to the developer from the provenance record written per applied template, together with the work the applied templates do not themselves cover.

**Postconditions**:
- A repository on disk assembled from the templates the stated intent selected, with one provenance record per applied template, reported back to the developer.

**Alternative Flows**:
- **Nothing matches the intent**: the AI agent reports which templates are installed and which declare no description to match against, and writes no files.
- **Candidates match indistinguishably**: the AI agent asks the Project Developer to choose between the named candidates and their declared descriptions before anything is applied.
- **A CLI command refuses**: the AI agent relays the CLI's reported reason, names the templates applied before the refusal, and stops rather than retrying.

#### Project Developer runs an AI-driven template upgrade

- [ ] `p2` - **ID**: `cpt-frontx-usecase-ai-driven-template-upgrade`

**Actor**: `cpt-frontx-actor-project-developer`

**Preconditions**:
- A repository has a template applied at an older version.
- A newer version of that template is available in the source registry.

**Main Flow**:
1. An AI agent uses the AI Tooling Framework's upgrade orchestration to analyse the change from the applied template's older version to the newer version (`cpt-frontx-fr-ai-upgrade-orchestration`).
2. The AI agent applies the per-template upgrade as a reviewable change set (`cpt-frontx-fr-cli-project-upgrade-changeset`).
3. The Project Developer reviews and approves the upgrade changes before they apply to repository files (`cpt-frontx-fr-cli-upgrade-review-approval`).
4. The approved change set is applied to the repository files, and the applied template's provenance record is updated to the newer version.

**Postconditions**:
- The applied template is upgraded to its newer version with all reviewable changes accepted; other applied templates are unaffected.

**Alternative Flows**:
- **Change set rejected**: the Project Developer declines the change set; the applied template remains at its current version and no files are written.
- **Downstream impact assessment flags incompatibilities**: the AI agent surfaces the incompatibilities before the change set is applied, and the Project Developer decides whether to proceed.

## 9. Acceptance Criteria

- [ ] AI agents can drive end-to-end FrontX-project creation: install a template, assemble a repository from one or more templates chosen from a stated intent, and operate on the resulting repository with ecosystem-aware AI capabilities - verifiable via `cpt-frontx-usecase-publish-composed-project-template`, `cpt-frontx-usecase-scaffold-composed-project`, `cpt-frontx-usecase-ai-driven-project-scaffolding`, and `cpt-frontx-usecase-ai-driven-template-upgrade`.
- [ ] All three pillars deliver capabilities at the user-capability level: §5 contains functional requirements for all 26 capabilities across the three pillars (Core Framework: 8; CLI: 11; AI Tooling Framework: 7) — verifiable via the §5 inventory.
- [ ] Pillar balance is maintained in the §5 distribution: each pillar has at least 5 functional requirements and the maximum-to-minimum ratio is at most 2 — verifiable by counting §5 entries per pillar.
- [ ] All four public components have a §7.1 entry with a stability level and a breaking-change policy — verifiable via the §7.1 enumeration.
- [ ] All six external integration contracts are documented with party, direction, and a compatibility commitment in §7.2 — verifiable via the §7.2 enumeration.
- [ ] The PRD is structurally valid and internally consistent: `cfs validate --artifact architecture/PRD.md --skip-code` returns PASS, and the standing content-quality checks — citation discipline, design-agnostic prose, controlled product vocabulary, and external-system-name scope, together with pillar balance — all clear.
- [ ] Downstream SDLC artifacts authored against this PRD trace back to specific functional-requirement IDs (`cpt-frontx-fr-*`) and component or contract IDs (`cpt-frontx-interface-*` / `cpt-frontx-contract-*`).

## 10. Dependencies

| Dependency | Description | Criticality |
|------------|-------------|-------------|
| GitHub (source registry, `cpt-frontx-actor-github`) | Public source registry hosting the templates and the FrontX AI Tooling Framework; referenced by versioned source-spec contract at install and upgrade time. | p1 |
| npm-compatible package registry (`cpt-frontx-actor-package-registry`) | Package registry hosting the product's published packages; consumed by applications at install time using their chosen npm-compatible package manager. | p1 |
| AI Tooling CLI (`cpt-frontx-actor-ai-tooling-cli`) | The AI-tooling command-line integration through which the AI Tooling Framework is installed into consuming projects and AI agents discover the ecosystem's skills, workflows, and guidelines. | p1 |
| JavaScript / TypeScript runtime | The runtime environment on which the platform and its consuming applications execute. | p1 |
| Type-definition specification | The specification language the product uses to describe and validate entity shapes; resolved generically at the product-requirements level so the contract, not any single specification, is what the product depends on. | p1 |

## 11. Assumptions

- AI agents capable of operating FrontX's AI tooling are available to both human actor types — Template Developer and Project Developer — during their work.
- Humans-using-AI is the dominant interaction model for the product's two human actor types; the product is designed for work driven by AI agents under human direction rather than for unaided manual operation.
- The package registry and its compatible package managers remain the dominant distribution channel for frontend libraries throughout the product's release horizon.
- Semantic versioning remains the dominant version-discipline convention for the product's published artifacts and for the templates that consume them.
- Templates and their bundled AI extensions are versioned together; a template's AI extensions are part of the template bundle, not separate publications, and upgrade in step with the template.

## 12. Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| The forward-looking AI Tooling Framework pillar lacks initial concrete parity with the Core Framework and CLI pillars at the first published baseline. | Pillar 3 capabilities may be perceived as aspirational rather than delivered at the product's first published baseline. | Deliver Pillar 3 alongside Pillar 1 and Pillar 2 in a matched-version release; publish reference template-bundled AI extensions that exercise template extension, automatic activation, and AI-driven upgrade orchestration. |
| Template-ecosystem adoption depends on the quality of the reference templates the product ships. | Without high-quality reference templates, Project Developers may not discover the product's strengths, slowing adoption. | Bundle a reference preset together with at least two reference templates it assembles into a repository with the first published baseline; validate each against the publication contract before publishing. |
| The type-definition specification dependency couples the product to an external specification. | A breaking change in the chosen type-definition specification could ripple through the product and its consumers. | Depend on the type-definition contract rather than on a single specification, keeping the specification a replaceable concern at the contract boundary. |
| Pillar parity drifts over time as new capabilities accumulate unevenly across the three pillars. | One pillar may come to dominate future releases, eroding the co-equal framing the product depends on. | Re-check pillar balance on every revision of this document; escalate any imbalance before it propagates into downstream work. |
