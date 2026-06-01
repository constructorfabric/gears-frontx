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

<!-- /toc -->

## 1. Overview

### 1.1 Purpose

The FrontX Ecosystem exists to enable AI-driven creation of frontend projects. It gives teams a product set in which AI agents can reliably scaffold, extend, and evolve frontend projects by targeting stable, narrow, explicitly-contracted product capabilities instead of improvising against an open-ended codebase. The ecosystem delivers this through three co-equal pillars: a **Core Framework** that makes an application runtime-extensible by composable microfrontends over a substrate for typed entities; a **CLI** that owns the full project lifecycle — installing, listing, updating, and validating templates, scaffolding projects and microfrontends, resolving composed templates, recording project provenance, and upgrading existing projects to newer template versions; and an **AI Tooling Framework** that equips AI agents with ecosystem-wide capabilities, lets templates contribute their own AI capabilities, activates those capabilities automatically in consuming projects, and orchestrates AI-driven project upgrades.

Together these pillars let an AI agent carry a frontend project from first scaffold through ongoing extension and version upgrades, while the human Template Developers and Project Developers steering the work stay in control of intent and review. The product's value is measured by how predictably and safely AI agents and their human collaborators can produce and maintain real frontend applications on top of it.

### 1.2 Background / Problem Statement

Teams building frontend projects increasingly depend on AI agents to do the work — scaffolding new projects, adding features, and keeping projects current as their foundations evolve. For an AI agent to do this reliably, it needs a product surface that is stable, narrow, and explicitly contracted, so the agent targets well-defined capabilities rather than guessing at the shape of an open-ended codebase.

Two groups of people, each working alongside AI agents, have distinct needs. **Template Developers** design, version, and publish the project templates and microfrontend templates that other teams build from; they need stable product contracts, pre-publish validation, semantic-versioning discipline, deterministic composition of templates, and a way to bundle template-specific AI capabilities. **Project Developers** scaffold a project from a template and then build business code on top; they need predictable scaffolding output, reliable template upgrades, a clear boundary between what the product provides and what the application must supply, and AI agents that already understand both the ecosystem and the specific template in use.

Across both groups, three needs recur: stable, narrow contracts an AI agent can target; a project lifecycle — install, scaffold, compose, validate, and upgrade — that an AI agent can drive end to end; and AI tooling that knows the ecosystem out of the box and can be extended with knowledge specific to each template. The FrontX Ecosystem addresses these needs directly, so that AI-driven frontend development is predictable and safe for both the people directing it and the agents performing it.

### 1.3 Goals (Business Outcomes)

- **Bounded time-to-scaffold** — A Project Developer (or an AI agent acting for one) can scaffold a working project from a project template in a single operation whose duration is bounded by a target published in the platform's release notes. Baseline: not yet measured (new product); Target: a predictable, bounded scaffold operation; Timeframe: established and published at the first platform release.
- **Reviewable, reversible upgrades** — Every upgrade of an existing project to a newer template version is applied as a reviewable change set that a developer approves before it touches project files, with non-destructive rollback. Baseline: none (new product); Target: 100% of upgrades review-gated and reversible; Timeframe: first platform release.
- **Ecosystem-wide AI SDLC coverage** — AI agents working in any FrontX-based project have ecosystem SDLC operations available — creating and validating PRD, ADR, DESIGN, DECOMPOSITION, and FEATURE artifacts with traceability across them — at session start, with no per-project training step. Baseline: none (new product); Target: all five artifact types supported; Timeframe: first platform release.
- **Automatic activation of template AI extensions** — When a template that bundles AI capabilities is installed in a project, those capabilities become available to AI agents automatically, with no manual wiring by the developer. Baseline: none (new product); Target: zero manual wiring steps for template-bundled AI capabilities; Timeframe: first platform release.
- **Compatibility within a major version** — Platform releases preserve backward compatibility within a major version, so consuming applications are not forced to upgrade in lockstep with the product. Baseline: none (new product); Target: zero breaking changes to published product contracts within a major version line; Timeframe: ongoing from the first major release.
- **No architectural ceiling on application scale** — The platform places no upper limit on the number of microfrontends or type definitions an application integrates, beyond the thresholds stated in the non-functional requirements. Baseline: none (new product); Target: scale governed only by the stated NFR thresholds, not by product architecture; Timeframe: first platform release.

### 1.4 Glossary

| Term | Definition |
|------|------------|
| ecosystem | The FrontX product set as a whole; referred to hereinafter as "the ecosystem". |
| project | The development-time unit a Project Developer scaffolds from a project template — its source files plus the recorded provenance of the template it came from — and which the CLI installs into, validates, and upgrades. The development-time form of an application. |
| application | The running frontend product the platform composes at runtime: the host into which microfrontends are loaded and placed, made runtime-extensible by the Core Framework. The runtime form of a project. |
| microfrontend (MFE) | An independently-developed, runtime-loadable unit of user-facing functionality that the platform loads and places into a running application. Abbreviated **MFE**. |
| extension | A configured placement that binds one microfrontend into one extension domain, producing a concrete occupant of that domain. An extension is not the microfrontend itself; it is the microfrontend as placed and configured in a specific domain. |
| extension domain | A named extension point in the application where microfrontends can be placed. It governs which microfrontends may occupy it, whether it permits one or several occupants at once, and what shared state and capabilities its occupants receive. |
| type definition | A description of an entity's shape that the type system can validate against; specification-format-agnostic at the product-requirements level. |
| platform | The Core Framework pillar as a consuming application depends on it at runtime — the versioned runtime foundation an application is built upon. (Distinct from "ecosystem", which is the whole FrontX product set.) |
| project template | A template that scaffolds an entire new project. |
| microfrontend template | A template that scaffolds a single, independently-developed microfrontend. |
| scaffold | The act of generating files and configuration into a target directory from a template. |
| composed template | A project template that references one or more microfrontend templates and resolves them as part of a single scaffold operation. |
| project provenance | Recorded information about which template, and which template version, a project was scaffolded from. |
| upgrade | Applying a newer template version to an existing project, delivered as a reviewable change set. |
| update | Installation of a newer template version locally, without applying it to any existing project. |
| template-bundled AI extension | An AI capability — a skill, workflow, guideline, or reference artifact — that ships inside a template and activates when that template is installed. |
| AI Tooling Framework | The Pillar 3 component that provides base ecosystem AI capabilities, the extension contract templates use to bundle AI extensions, and the discovery-and-activation surface that turns installed-template extensions into available capabilities for AI agents. |

## 2. Actors

### 2.1 Human Actors

#### Template Developer

**ID**: `cpt-frontx-actor-template-developer`

**Role**: Designs, authors, versions, and publishes project templates or microfrontend templates that other teams build from. Works alongside AI agents throughout this work.
**Needs**: Stable product contracts; pre-publish validation tooling; semantic-versioning discipline tooling; reference templates; deterministic composition primitives; support for bundling template-specific AI capabilities.

#### Project Developer

**ID**: `cpt-frontx-actor-project-developer`

**Role**: Scaffolds a project from an existing project template, then builds business code on top of it. Works alongside AI agents throughout this work.
**Needs**: Predictable scaffolding output; reliable template upgrades; a clear boundary between what the product provides and what the application must provide; AI agents that already understand both the ecosystem and the specific template in use.

### 2.2 System Actors

#### Cypilot CLI

**ID**: `cpt-frontx-actor-cypilot-cli`

**Role**: The AI-tooling command-line integration. The FrontX AI Tooling Framework is installed into a consuming project through it, and AI agents discover the ecosystem's skills, workflows, and guidelines through it.
**Direction**: Inbound (installs the framework into a consuming project).
**Availability**: Required at template-project install and upgrade time and during AI-driven development sessions.

#### GitHub

**ID**: `cpt-frontx-actor-github`

**Role**: Public source registry that hosts the project templates and microfrontend templates published by Template Developers, and hosts the FrontX AI Tooling Framework. Both the FrontX CLI and the Cypilot CLI fetch from it by versioned reference.
**Direction**: Outbound (publications flow to the registry); inbound (the CLI and Cypilot CLI fetch from the registry into a consuming project).
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

- Installing a project template or microfrontend template from a public source registry by versioned reference.
- Listing installed templates and their versions.
- Updating an installed template locally to a newer version.
- Validating a template's structure against the publication contract before publishing.
- Scaffolding a new project from an installed project template into a chosen target directory.
- Scaffolding a new microfrontend from an installed microfrontend template into a chosen target directory.
- Resolving composed templates at scaffold time, so referenced microfrontend templates are scaffolded as part of the same operation.
- Upgrading an existing project to a newer template version, applied as a reviewable change set.
- Reviewing and approving upgrade changes before they apply to project files.
- Organizing commands into two namespaces — project-level and microfrontend-level — reflecting the two first-class template kinds the product supports.

#### AI Tooling Framework (Pillar 3)

- Ecosystem-wide SDLC workflows available to AI agents, for creating and validating SDLC artifacts with traceability across them.
- FrontX-specific skills available to AI agents, such as creating microfrontends, validating templates, generating type definitions, and other ecosystem-scoped operations.
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

- [ ] `p1` - **ID**: `cpt-frontx-fr-mfe-runtime-registration`

The system **MUST** allow microfrontends to be registered with a running application and loaded on demand.

**Rationale**: Lets an application gain user-facing functionality from independently-developed units at runtime, without rebuilding or redeploying the host.

**Actors**: `cpt-frontx-actor-template-developer`, `cpt-frontx-actor-project-developer`

#### Multiple microfrontends per extension domain

- [ ] `p1` - **ID**: `cpt-frontx-fr-mfe-multi-occupant-domain`

The system **MUST** allow multiple microfrontends to occupy the same extension domain when that domain permits multiple occupants.

**Rationale**: Enables modular layouts and side-by-side experiences within a single extension point, so teams can compose richer screens without contention over a shared slot.

**Actors**: `cpt-frontx-actor-project-developer`

#### Microfrontend–host communication and host-state reaction

- [ ] `p1` - **ID**: `cpt-frontx-fr-mfe-host-communication`

The system **MUST** allow microfrontends to communicate with the host application. The system **MUST** allow microfrontends to react to changes in the host application's state.

**Rationale**: Enables coordinated behavior across independently-deployed units, so a composed application behaves as one product rather than disconnected fragments.

**Actors**: `cpt-frontx-actor-template-developer`, `cpt-frontx-actor-project-developer`

#### Microfrontend and extension validation at registration

- [ ] `p1` - **ID**: `cpt-frontx-fr-mfe-type-validation`

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

- [ ] `p1` - **ID**: `cpt-frontx-fr-versioned-platform-evolution`

The system **MUST** evolve through versioned releases under semantic-versioning discipline. The system **MUST** isolate breaking changes from consuming applications through versioning and compatibility commitments.

**Rationale**: Gives consuming applications predictable upgrades and frees them from upgrading in lockstep with the product, protecting investment in code built on the platform.

**Actors**: `cpt-frontx-actor-project-developer`, `cpt-frontx-actor-template-developer`

#### No architectural ceiling on application complexity

- [ ] `p2` - **ID**: `cpt-frontx-fr-no-architectural-ceiling`

The system **MUST NOT** place an upper limit on the number of microfrontends or type definitions an application integrates, beyond the thresholds stated in the non-functional requirements.

**Rationale**: Lets the platform scale with the complexity of the applications built on it, so growth is governed by stated performance thresholds rather than by product architecture.

**Actors**: `cpt-frontx-actor-project-developer`

### 5.2 CLI

#### Template install from the source registry by versioned reference

- [ ] `p1` - **ID**: `cpt-frontx-fr-cli-template-install`

The system **MUST** allow a developer to install a project template or microfrontend template from the source registry by versioned reference.

**Rationale**: Gives developers deterministic, version-pinned acquisition of templates, so the starting point for a project is reproducible rather than dependent on whichever version happens to be current.

**Actors**: `cpt-frontx-actor-template-developer`, `cpt-frontx-actor-project-developer`, `cpt-frontx-actor-github`

#### List installed templates and their versions

- [ ] `p1` - **ID**: `cpt-frontx-fr-cli-template-list`

The system **MUST** allow a developer to list the templates currently installed and their versions.

**Rationale**: Gives developers visibility into their template inventory, so they can confirm what is available to scaffold from and at which version.

**Actors**: `cpt-frontx-actor-template-developer`, `cpt-frontx-actor-project-developer`

#### Update an installed template locally

- [ ] `p1` - **ID**: `cpt-frontx-fr-cli-template-update-local`

The system **MUST** allow a developer to update an installed template to a newer version locally. This update **MUST NOT** alter any project that was scaffolded from the template.

**Rationale**: Decouples acquiring a newer template version from applying it to a project, so developers can obtain and inspect updates without disturbing existing projects.

**Actors**: `cpt-frontx-actor-template-developer`, `cpt-frontx-actor-project-developer`, `cpt-frontx-actor-github`

#### Validate a template's structure before publishing

- [ ] `p1` - **ID**: `cpt-frontx-fr-cli-template-validate-prepublish`

The system **MUST** allow a Template Developer to validate a template's structure against the publication contract before publishing it.

**Rationale**: Catches structural errors before a template reaches other teams, so consumers are protected from malformed templates and the publisher avoids costly post-publication corrections.

**Actors**: `cpt-frontx-actor-template-developer`

#### Scaffold a new project from an installed project template

- [ ] `p1` - **ID**: `cpt-frontx-fr-cli-project-scaffold`

The system **MUST** allow a Project Developer to scaffold a new project from an installed project template into a chosen target directory.

**Rationale**: Gives developers predictable, reproducible project bootstrap from a known template, so every project starts from a consistent, contracted foundation.

**Actors**: `cpt-frontx-actor-project-developer`

#### Scaffold a new microfrontend from a microfrontend template

- [ ] `p1` - **ID**: `cpt-frontx-fr-cli-microfrontend-scaffold`

The system **MUST** allow a Project Developer to scaffold a new microfrontend from an installed microfrontend template into a chosen target directory.

**Rationale**: Lets a microfrontend be created as an independently-developed unit that an application loads at runtime, so it can be built and versioned on its own rather than built into an application.

**Actors**: `cpt-frontx-actor-project-developer`

#### Composed-template resolution at project scaffold

- [ ] `p1` - **ID**: `cpt-frontx-fr-cli-composed-template-resolution`

When a developer scaffolds a project from a project template that references microfrontend templates, the system **MUST** resolve and scaffold those referenced microfrontends as part of the same operation.

**Rationale**: Delivers a complete composed project in a single step, so developers do not have to discover and scaffold each referenced microfrontend by hand.

**Actors**: `cpt-frontx-actor-project-developer`

#### Project upgrade as a reviewable change set

- [ ] `p1` - **ID**: `cpt-frontx-fr-cli-project-upgrade-changeset`

The system **MUST** allow a developer to upgrade an existing project to a newer version of the template it was scaffolded from, with the upgrade applied as a reviewable change set.

**Rationale**: Makes adopting newer template versions non-destructive and auditable, so developers can keep projects current without risking unreviewed changes to their files.

**Actors**: `cpt-frontx-actor-project-developer`

#### Review and approval of upgrade changes before they apply

- [ ] `p1` - **ID**: `cpt-frontx-fr-cli-upgrade-review-approval`

The system **MUST** allow a developer to review and approve upgrade changes before they apply to project files.

**Rationale**: Keeps a human in control of what an upgrade changes, so no modification reaches a project's files without explicit approval.

**Actors**: `cpt-frontx-actor-project-developer`

#### Two-namespace command organization

- [ ] `p2` - **ID**: `cpt-frontx-fr-cli-two-namespace-commands`

The system **MUST** organize its commands into two namespaces: one for project-level operations and one for microfrontend-level operations.

**Rationale**: Reflects the two first-class template kinds the product supports, so developers find the right command by the kind of work they are doing.

**Actors**: `cpt-frontx-actor-template-developer`, `cpt-frontx-actor-project-developer`
