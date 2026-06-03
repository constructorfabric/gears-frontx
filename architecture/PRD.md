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

The FrontX Ecosystem exists to enable AI-driven creation of frontend projects. It gives teams a product set in which AI agents can reliably scaffold, extend, and evolve frontend projects by targeting stable, narrow, explicitly-contracted product capabilities instead of improvising against an open-ended codebase. The ecosystem delivers this through three co-equal pillars: a **Core Framework** that makes an application runtime-extensible by composable microfrontends over a substrate for typed entities; a **CLI** that owns the full project lifecycle — installing, listing, updating, and validating templates, scaffolding projects and microfrontends, resolving composed templates, recording project provenance, and upgrading existing projects to newer template versions; and an **AI Tooling Framework** that equips AI agents with ecosystem-wide capabilities, lets templates contribute their own AI capabilities, activates those capabilities automatically in consuming projects, and orchestrates AI-driven project upgrades.

Together these pillars let an AI agent carry a frontend project from first scaffold through ongoing extension and version upgrades, while the human Template Developers and Project Developers steering the work stay in control of intent and review. The product's value is measured by how predictably and safely AI agents and their human collaborators can produce and maintain real frontend applications on top of it.

### 1.2 Background / Problem Statement

Teams building frontend projects increasingly depend on AI agents to do the work — scaffolding new projects, adding features, and keeping projects current as their foundations evolve. For an AI agent to do this reliably, it needs a product surface that is stable, narrow, and explicitly contracted, so the agent targets well-defined capabilities rather than guessing at the shape of an open-ended codebase.

Two groups of people, each working alongside AI agents, have distinct needs. **Template Developers** design, version, and publish the project templates and microfrontend templates that other teams build from; they need stable product contracts, pre-publish validation, semantic-versioning discipline, deterministic composition of templates, and a way to bundle template-specific AI capabilities. **Project Developers** scaffold a project from a template and then build business code on top; they need predictable scaffolding output, reliable template upgrades, a clear boundary between what the product provides and what the application must supply, and AI agents that already understand both the ecosystem and the specific template in use.

Across both groups, three needs recur: stable, narrow contracts an AI agent can target; a project lifecycle — install, scaffold, compose, validate, and upgrade — that an AI agent can drive end to end; and AI tooling that knows the ecosystem out of the box and can be extended with knowledge specific to each template. The FrontX Ecosystem addresses these needs directly, so that AI-driven frontend development is predictable and safe for both the people directing it and the agents performing it.

### 1.3 Goals (Business Outcomes)

- **Bounded time-to-scaffold** — A Project Developer (or an AI agent acting for one) can scaffold a working project from a project template in a single operation whose duration is bounded by a target published in the platform's release notes. Baseline: not yet measured (new product); Target: a predictable, bounded scaffold operation; Timeframe: established and published at the first platform release.
- **Reviewable, reversible upgrades** — Every upgrade of an existing project to a newer template version is applied as a reviewable change set that a developer approves before it touches project files, with non-destructive rollback. Baseline: none (new product); Target: 100% of upgrades review-gated and reversible; Timeframe: first platform release.
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

### 5.3 AI Tooling Framework

#### FrontX-specific skills available to AI agents

- [ ] `p1` - **ID**: `cpt-frontx-fr-ai-frontx-skills`

The system **MUST** make FrontX-specific skills available to AI agents working in a FrontX-based project, including creating new microfrontends, validating templates, generating type definitions, and other ecosystem-scoped operations.

**Rationale**: Gives AI agents fluency in ecosystem operations from the start, so developers receive correct, ecosystem-aware assistance without configuring it for each project.

**Actors**: `cpt-frontx-actor-template-developer`, `cpt-frontx-actor-project-developer`

#### Template-bundled AI extensions

- [ ] `p1` - **ID**: `cpt-frontx-fr-ai-template-bundle-extensions`

The system **MUST** allow a Template Developer to bundle a template with AI extensions — template-specific skills, workflows, guidelines, and reference artifacts — that operate alongside the ecosystem's base AI capabilities.

**Rationale**: Lets templates carry their own AI expertise, so the knowledge specific to a template travels with it instead of being recreated in each consuming project.

**Actors**: `cpt-frontx-actor-template-developer`

#### Automatic discovery and activation of template-supplied AI extensions

- [ ] `p1` - **ID**: `cpt-frontx-fr-ai-extension-discovery-activation`

When a template is installed in a project, the system **MUST** discover the template's AI extensions and activate them for AI agents working in that project, without the developer needing to wire them up manually.

**Rationale**: Delivers zero-configuration extensibility, so template-supplied AI capabilities become available the moment a template is installed.

**Actors**: `cpt-frontx-actor-project-developer`, `cpt-frontx-actor-cypilot-cli`

#### AI-driven project-upgrade orchestration

- [ ] `p1` - **ID**: `cpt-frontx-fr-ai-upgrade-orchestration`

The system **MUST** allow a Project Developer to use AI agents to orchestrate template upgrades — analysing the change, applying the upgrade, and validating downstream effects — through AI-driven workflows that may include review gates, migration analyses, and downstream impact assessments.

**Rationale**: Complements direct CLI invocation with guided, AI-driven upgrades, so developers can adopt newer template versions with analysis and review built into the flow.

**Actors**: `cpt-frontx-actor-project-developer`

#### Ecosystem-knowledge artifacts available at session start

- [ ] `p1` - **ID**: `cpt-frontx-fr-ai-session-start-knowledge`

The system **MUST** make ecosystem-knowledge artifacts — rules, examples, guidelines, and reference artifacts — available to AI agents at session start, with no training step required.

**Rationale**: Makes AI agents ecosystem-aware from the first interaction, so developers receive correct guidance immediately rather than after a setup or learning step.

**Actors**: `cpt-frontx-actor-template-developer`, `cpt-frontx-actor-project-developer`

#### AI Tooling Framework is template-agnostic

- [ ] `p1` - **ID**: `cpt-frontx-fr-ai-tooling-template-agnostic`

The AI Tooling Framework **MUST** ship zero template-specific content; template-specific AI capabilities **MUST** arrive exclusively via template bundles.

**Rationale**: Keeps the framework free of coupling to any particular template's domain, so it stays portable across every template and templates remain the single source of their own AI capabilities.

**Actors**: `cpt-frontx-actor-template-developer`, `cpt-frontx-actor-project-developer`

## 6. Non-Functional Requirements

### 6.1 NFR Inclusions

#### Runtime performance

- [ ] `p1` - **ID**: `cpt-frontx-nfr-runtime-performance`

The system **MUST** meet measurable response-time and throughput targets for runtime operations.

**Threshold**: Microfrontend registration completes in ≤ 50 ms at p95 per registration call; on-demand microfrontend load completes in ≤ 1500 ms at p95 from request to the microfrontend being loaded and placed; the application sustains ≥ 20 registration calls per second without p95 latency exceeding these targets.

**Rationale**: Predictable runtime performance is required for AI agents that compose applications from many microfrontends at scale.

#### Evolvability

- [ ] `p1` - **ID**: `cpt-frontx-nfr-evolvability`

The system **MUST** evolve through versioned releases without forcing consumers to upgrade in lockstep.

**Threshold**: Major and minor versions across the product's published artifacts match; patch and pre-release versions may diverge; breaking changes are isolated from consuming applications by versioning and compatibility commitments; every removal is preceded by a deprecation cycle of at least one minor version.

**Rationale**: Predictable upgrade discipline lets consuming applications adopt new platform versions on their own cadence rather than in forced lockstep.

#### Scaling without an architectural ceiling

- [ ] `p1` - **ID**: `cpt-frontx-nfr-scalability-ceiling`

The system **MUST** place no architectural upper limit on the number of microfrontends or type definitions an application can integrate.

**Threshold**: At least 100 microfrontends concurrently registered with a single application, and at least 500 type definitions registered with a single application, measured without architectural failure; these values are operational floors that conforming implementations meet or exceed, not ceilings.

**Rationale**: AI-driven projects accumulate complexity over time; the platform must not impose architectural limits that force teams to re-platform.

#### Security

- [ ] `p1` - **ID**: `cpt-frontx-nfr-security`

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

**Description**: The CLI owns the project lifecycle: it installs, lists, updates, and validates templates from the source registry; scaffolds projects and microfrontends into a chosen target directory; resolves composed templates as part of a single scaffold operation; records project provenance; upgrades existing projects to newer template versions as reviewable change sets that a developer approves before they apply; and organizes its commands into project-level and microfrontend-level namespaces (anchors capabilities C2-1 through C2-10).

**Breaking Change Policy**: A major version bump is required for any incompatible change to the command surface; minor and patch versions preserve backward compatibility.

#### AI Tooling Framework

- [ ] `p1` - **ID**: `cpt-frontx-interface-ai-tooling-framework`

**Type**: Library

**Stability**: unstable

**Description**: The AI Tooling Framework provides FrontX-specific skills to AI agents working in a project, lets Template Developers bundle template-specific AI extensions, automatically discovers and activates installed-template AI extensions for AI agents in a consuming project, supports AI-driven orchestration of template upgrades, and makes ecosystem-knowledge artifacts available to AI agents at session start, while itself shipping zero template-specific content (anchors capabilities C3-2, C3-3, C3-4, C3-5, C3-6, C3-7).

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

**Description**: The product requires every template to publish a manifest that describes the template in a defined shape, and it both produces that manifest when a template is validated for publication and consumes it when a template is installed or scaffolded. This is an internal contract between templates and the product; it names no external party.

**Compatibility**: The manifest shape is versioned with the platform; changes that are not backward-compatible follow `cpt-frontx-nfr-evolvability`.

#### Project provenance contract

- [ ] `p2` - **ID**: `cpt-frontx-contract-project-provenance`

**Direction**: provided by library

**Description**: The product records provenance into each scaffolded project, capturing which template and which template version the project was scaffolded from, so a later upgrade can determine what to apply. This is an internal contract recorded per scaffolded project; it names no external party.

**Compatibility**: Provenance records remain readable across versions; any change that is not backward-compatible follows `cpt-frontx-nfr-evolvability`.

#### Kit-installation contract

- [ ] `p2` - **ID**: `cpt-frontx-contract-kit-installation`

**Direction**: required from client

**Description**: The AI Tooling Framework is installed into a consuming project through the AI-tooling CLI integration (`cpt-frontx-actor-cypilot-cli`), which is how AI agents come to have the framework's skills and the activated template extensions available.

**Compatibility**: The installation contract remains compatible across minor and patch versions; breaking changes follow `cpt-frontx-nfr-evolvability`.

#### Package-registry distribution contract

- [ ] `p2` - **ID**: `cpt-frontx-contract-package-registry-distribution`

**Direction**: bidirectional

**Description**: The product publishes its packages to the package registry (`cpt-frontx-actor-package-registry`) and is installed from that registry by consuming applications using their chosen package manager.

**Compatibility**: Published packages follow semantic versioning; consuming applications rely on the platform's evolvability commitments (`cpt-frontx-nfr-evolvability`).

## 8. Use Cases

#### Template Developer publishes a project template that composes microfrontend templates

- [ ] `p2` - **ID**: `cpt-frontx-usecase-publish-composed-project-template`

**Actor**: `cpt-frontx-actor-template-developer`

**Preconditions**:
- A template repository exists with the template's content authored.
- The product is installed on the developer's machine.

**Main Flow**:
1. The Template Developer authors the project template's content.
2. The Template Developer declares the project template's composed microfrontend templates by reference.
3. The Template Developer validates the template's structure against the publication contract before publishing (`cpt-frontx-fr-cli-template-validate-prepublish`).
4. The Template Developer publishes the template to the source registry (`cpt-frontx-actor-github`).

**Postconditions**:
- The template is available for installation by Project Developers from the source registry.

**Alternative Flows**:
- **Validation fails**: the validation step reports specific errors; the Template Developer fixes them and re-validates before publishing.

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

#### Project Developer scaffolds a new project from a composed project template

- [ ] `p2` - **ID**: `cpt-frontx-usecase-scaffold-composed-project`

**Actor**: `cpt-frontx-actor-project-developer`

**Preconditions**:
- The source registry (`cpt-frontx-actor-github`) is reachable.
- A target directory is chosen.
- The product is installed.

**Main Flow**:
1. The Project Developer installs the project template by versioned reference (`cpt-frontx-fr-cli-template-install`).
2. The Project Developer scaffolds the project (`cpt-frontx-fr-cli-project-scaffold`); the composed microfrontends declared by the template are resolved and scaffolded as part of the same operation (`cpt-frontx-fr-cli-composed-template-resolution`).
3. The AI Tooling Framework activates the ecosystem's base AI capabilities and any template-bundled AI extensions for AI agents working in the new project (`cpt-frontx-fr-ai-extension-discovery-activation`, `cpt-frontx-fr-ai-session-start-knowledge`).

**Postconditions**:
- A scaffolded project on disk with its composed microfrontends; AI agents have ecosystem and template-specific AI capabilities active.

**Alternative Flows**:
- **Source registry unreachable**: the CLI reports the failure and aborts the scaffold without writing any files.
- **Composition collision**: the CLI reports the conflicting composition before any files are written.

#### Project Developer adds a new microfrontend to an existing project

- [ ] `p2` - **ID**: `cpt-frontx-usecase-add-microfrontend-to-project`

**Actor**: `cpt-frontx-actor-project-developer`

**Preconditions**:
- An existing scaffolded project is on disk.
- The microfrontend template is available in the source registry.

**Main Flow**:
1. The Project Developer installs the microfrontend template by versioned reference (`cpt-frontx-fr-cli-template-install`).
2. The Project Developer scaffolds the microfrontend into the existing project (`cpt-frontx-fr-cli-microfrontend-scaffold`).
3. At application runtime the microfrontend is registered with the application (`cpt-frontx-fr-mfe-runtime-registration`); type-definition validation runs at registration (`cpt-frontx-fr-mfe-type-validation`).

**Postconditions**:
- The microfrontend is added to the project and registers and validates successfully at runtime.

**Alternative Flows**:
- **Type validation fails at registration**: the application surfaces the validation error and the microfrontend is not placed into its extension domain.

#### Project Developer runs an AI-driven template upgrade

- [ ] `p2` - **ID**: `cpt-frontx-usecase-ai-driven-template-upgrade`

**Actor**: `cpt-frontx-actor-project-developer`

**Preconditions**:
- A project is scaffolded from a template at an older version.
- A newer version of that template is available in the source registry.

**Main Flow**:
1. An AI agent uses the AI Tooling Framework's upgrade orchestration to analyse the change from the older version to the newer version (`cpt-frontx-fr-ai-upgrade-orchestration`).
2. The AI agent applies the upgrade as a reviewable change set (`cpt-frontx-fr-cli-project-upgrade-changeset`).
3. The Project Developer reviews and approves the upgrade changes before they apply to project files (`cpt-frontx-fr-cli-upgrade-review-approval`).
4. The approved change set is applied to the project files.

**Postconditions**:
- The project is upgraded to the newer template version with all reviewable changes accepted.

**Alternative Flows**:
- **Change set rejected**: the Project Developer declines the change set; the project remains at its current version and no files are written.
- **Downstream impact assessment flags incompatibilities**: the AI agent surfaces the incompatibilities before the change set is applied, and the Project Developer decides whether to proceed.

## 9. Acceptance Criteria

- [ ] AI agents can drive end-to-end FrontX-project creation: install a project template, scaffold the project with its composed microfrontends, and operate on the resulting project with ecosystem-aware AI capabilities — verifiable via `cpt-frontx-usecase-publish-composed-project-template`, `cpt-frontx-usecase-scaffold-composed-project`, and `cpt-frontx-usecase-ai-driven-template-upgrade`.
- [ ] All three pillars deliver capabilities at the user-capability level: §5 contains functional requirements for all 24 capabilities locked in §2 (Core Framework: 8; CLI: 10; AI Tooling Framework: 6) — verifiable via the §5 inventory.
- [ ] Pillar balance is maintained in the §5 distribution: each pillar has at least 5 functional requirements and the maximum-to-minimum ratio is at most 2 — verifiable by counting §5 entries per pillar.
- [ ] All four public components have a §7.1 entry with a stability level and a breaking-change policy — verifiable via the §7.1 enumeration.
- [ ] All five external integration contracts are documented with party, direction, and a compatibility commitment in §7.2 — verifiable via the §7.2 enumeration.
- [ ] The PRD is structurally valid and internally consistent: `cpt validate --artifact architecture/PRD.md --skip-code` returns PASS, and the standing content-quality checks — citation discipline, design-agnostic prose, controlled product vocabulary, and external-system-name scope, together with pillar balance — all clear.
- [ ] Downstream SDLC artifacts authored against this PRD trace back to specific functional-requirement IDs (`cpt-frontx-fr-*`) and component or contract IDs (`cpt-frontx-interface-*` / `cpt-frontx-contract-*`).

## 10. Dependencies

| Dependency | Description | Criticality |
|------------|-------------|-------------|
| GitHub (source registry, `cpt-frontx-actor-github`) | Public source registry hosting the project templates, microfrontend templates, and the FrontX AI Tooling Framework; referenced by versioned source-spec contract at install and upgrade time. | p1 |
| npm-compatible package registry (`cpt-frontx-actor-package-registry`) | Package registry hosting the product's published packages; consumed by applications at install time using their chosen npm-compatible package manager. | p1 |
| Cypilot CLI (`cpt-frontx-actor-cypilot-cli`) | The AI-tooling command-line integration through which the AI Tooling Framework is installed into consuming projects and AI agents discover the ecosystem's skills, workflows, and guidelines. | p1 |
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
| Template-ecosystem adoption depends on the quality of the reference templates the product ships. | Without high-quality reference templates, Project Developers may not discover the product's strengths, slowing adoption. | Bundle at least one reference project template and at least one reference microfrontend template with the first published baseline; validate each against the publication contract before publishing. |
| The type-definition specification dependency couples the product to an external specification. | A breaking change in the chosen type-definition specification could ripple through the product and its consumers. | Depend on the type-definition contract rather than on a single specification, keeping the specification a replaceable concern at the contract boundary. |
| Pillar parity drifts over time as new capabilities accumulate unevenly across the three pillars. | One pillar may come to dominate future releases, eroding the co-equal framing the product depends on. | Re-check pillar balance on every revision of this document; escalate any imbalance before it propagates into downstream work. |
