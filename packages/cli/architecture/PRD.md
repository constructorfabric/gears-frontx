---
version: 1.1.0
description: Product requirements for @gears-frontx/cli, which installs, applies, assembles, validates, and upgrades templates across a repository's lifecycle with per-template provenance.
---

# PRD — FrontX CLI (`@gears-frontx/cli`)


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
  - [5.1 Template Acquisition](#51-template-acquisition)
  - [5.2 Assembly](#52-assembly)
  - [5.3 Upgrade](#53-upgrade)
  - [5.4 Project Builds](#54-project-builds)
  - [5.5 Host Deliveries](#55-host-deliveries)
- [6. Non-Functional Requirements](#6-non-functional-requirements)
  - [6.1 NFR Inclusions](#61-nfr-inclusions)
  - [6.2 NFR Exclusions](#62-nfr-exclusions)
- [7. Public Library Interfaces](#7-public-library-interfaces)
  - [7.1 Public API Surface](#71-public-api-surface)
  - [7.2 External Integration Contracts](#72-external-integration-contracts)
- [8. Use Cases](#8-use-cases)
  - [8.1 Build and Delivery Journeys](#81-build-and-delivery-journeys)
  - [8.2 Template Lifecycle Journeys](#82-template-lifecycle-journeys)
- [9. Acceptance Criteria](#9-acceptance-criteria)
- [10. Dependencies](#10-dependencies)
- [11. Assumptions](#11-assumptions)
- [12. Risks](#12-risks)

<!-- /toc -->

## 1. Overview

### 1.1 Purpose

`@gears-frontx/cli` is the ecosystem's projects-orchestration unit for the repository lifecycle. It installs, lists, updates, and validates templates from the source registry. It applies a template to seed a new repository or extend an existing one. It assembles a repository from multiple independently-applied templates while detecting and preventing conflicting assembly. It records per-applied-template provenance and upgrades each applied template independently as reviewable change sets. This PRD owns the CLI's lifecycle, publication, assembly, provenance, and upgrade requirements. Ecosystem-level requirements are owned by the [root PRD](../../../architecture/PRD.md), and template AI-extension obligations are owned by the [AI Tooling Framework PRD](../../cyber-pilot-kit-frontx/architecture/PRD.md).

The requested scope also includes programmatic builds and delivery composition
for projects derived from supported FrontX templates. The consuming project
owns application sources, host profiles and publication policy.

### 1.2 Background / Problem Statement

Projects also need a reusable way to build their own hosts and microfrontends
from FrontX templates, then produce distinct deliveries. Copying ready-made
JavaScript does not supply this build capability. Reimplementing template build
contracts in every consumer creates divergent producers and incomplete manifests.
The lifecycle surface must provide these capabilities as a programmatic API;
an additional command-line wrapper is optional.

Revision 1.1.0 adds build and delivery requirements. These additions describe
requested behavior, not existing implementation. Existing template lifecycle
requirements and identifiers are retained.

Templates define what a project becomes, and they are authored independently of each other. Without one contracted lifecycle tool, every team improvises acquisition, assembly, and upgrades — and independently-authored templates writing into one repository is a multi-writer corruption problem. The CLI closes both gaps: one lifecycle surface an AI agent can drive end to end, and declared, arbitrated template ownership so composition is refused rather than corrupted when claims collide.

### 1.3 Goals (Business Outcomes)

- **Reusable project builds** — at the first release of the build capability,
  consumers can build a host and an MFE independently through the supplied API,
  without recreating the supported template's build pipeline.
- **Distinct reproducible deliveries** — at that release, two independently
  built host applications can have different admitted MFE sets and build
  references; repeated resolution of unchanged inputs produces the same
  composition identity, with zero silently substituted builds.

- **Single-operation scaffold** — a repository is assembled from a template through one contracted apply operation. Target: 100% of successful scaffold operations use one contracted apply operation; Timeframe: first platform release.
- **Reviewable, approval-gated upgrades** — every upgrade of an applied template is a reviewable change set approved before it touches repository files. Target: 100% of upgrades review-gated before repository file writes; Timeframe: first platform release.
- **Conflicts refused, never merged** — no assembly writes a file two templates both claim. Target: zero silently merged ownership conflicts; Timeframe: first platform release.

### 1.4 Glossary

This PRD uses the root PRD's shared vocabulary ([root PRD §1.4](../../../architecture/PRD.md#14-glossary)) for *template* and *project*. CLI-specific terms are defined here.

| Term | Definition |
|------|------------|
| preset | A template that references other templates so they are applied as one composed operation. |
| assembly | One CLI-driven apply operation that resolves the selected template set, checks ownership claims, and writes accepted project content. |
| ownership boundary | The declared part of a repository that one template may create or modify. |
| scaffold | The first repository content created by applying a template into a target directory. |
| template provenance | The recorded source and version identity of a template that has been applied to a project. |
| upgrade | Applying a newer version of an already applied template to a project as a reviewable change set. |
| update | Replacing the locally installed copy of a template with a newer version without changing any project. |
| host | An independently buildable application with its own entrypoint, bootstrap and permitted MFE composition. |
| delivery profile | Consumer-owned declaration of a host, its permitted MFE set and concrete published-build references for packaged or initial selections. |
| published build manifest | Producer-owned, versioned description sufficient to identify, retrieve and register one concrete MFE build, including its entry, extension, schema and resource information. |
| resource closure | All executable, stylesheet, lazy-loaded, shared and supporting resources required by the declared build. |
| resolved delivery | A recorded host/profile revision, resolved build identities, resource closure and supported build inputs sufficient to repeat composition. |

## 2. Actors

### 2.1 Human Actors

#### Template Developer

**ID**: `cpt-frontx-cli-actor-template-developer`

**Role**: Authors, versions, validates, and publishes templates. Uses the CLI for pre-publish validation and local template management. The root PRD's Template Developer (`cpt-frontx-actor-template-developer`) at the CLI surface.
**Needs**: Pre-publish validation against the publication contract; a way to declare ownership boundaries; deterministic versioned publication.

#### Project Developer

**ID**: `cpt-frontx-cli-actor-project-developer`

**Role**: Assembles repositories from templates and keeps them current. Uses the CLI to install, seed, add, and upgrade. The root PRD's Project Developer (`cpt-frontx-actor-project-developer`) at the CLI surface.
**Needs**: Reproducible assembly; per-template upgrades that are reviewable before they apply; refusal instead of corruption when templates conflict.

### 2.2 System Actors

#### Artifact Repository

**ID**: `cpt-frontx-cli-actor-artifact-repository`

**Role**: Provides already published manifests and resources to build/delivery
operations. Repository location and access are configured by the consumer;
availability is required during resolution, and unavailable inputs cause an
explicit failure rather than a substitute build.

#### Source Registry

**ID**: `cpt-frontx-cli-actor-source-registry`

**Role**: Hosts published templates, fetched by versioned source-spec at install and upgrade time. The root PRD's GitHub actor (`cpt-frontx-actor-github`).

## 3. Operational Concept & Environment

The CLI runs as the `frontx` executable wherever the supported JavaScript/TypeScript runtime and required filesystem and process capabilities are available. Templates are externally hosted and resolved by versioned source-spec at runtime; the CLI bundles none. Every apply flows through one uniform mechanism: resolve the template set (including a preset's references), compare declared ownership boundaries, refuse conflicts before writing, write, and record one provenance record per applied template.

Build and delivery operations are also invoked programmatically in the
consumer's development/build environment. They do not run in the browser host;
their supported toolchain and template contract versions are explicit inputs.

### 3.1 Module-Specific Environment Constraints

- Requires the supported JavaScript/TypeScript runtime, filesystem access to the target repository, and process execution support for the CLI command surface.
- Requires network access to the source registry for install, local template update, and upgrade lifecycle operations that fetch template versions. This PRD makes no offline guarantee for inventory or inspection operations unless a requirement states one explicitly.
- Holds no intra-ecosystem package dependency; the AI Tooling Framework reaches it only over its command surface.

## 4. Scope

### 4.1 In Scope

- Consumer-invoked project builds for the supported FrontX host and MFE template contracts.
- Independent host/MFE builds and separate hosts with distinct entrypoints and compositions.
- Published-build manifest production, reference resolution, validation and delivery packaging.
- Programmatic configuration of build inputs, artifact access and consumer-owned delivery profiles.

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
- Retaining enough applied-template provenance history to audit or restore repository upgrades.

### 4.2 Out of Scope

- Backend-version selection policy and browser runtime lifecycle; the runtime member owns manifest admission and switching behavior.
- Consumer-specific product names, cluster models, repository layouts, task runners or CI providers in FrontX contracts.
- Building unpublished MFE versions on demand from the browser.
- A mandatory new package identity, exact future API signatures or a mandatory build CLI wrapper.
- Supporting every possible build tool; support is bounded by declared FrontX template/build contract versions.

- What any template produces (owned by the template).
- Template-bundled AI-extension obligations and AI-driven upgrade orchestration above the change-set engine (owned by the [AI Tooling Framework PRD](../../cyber-pilot-kit-frontx/architecture/PRD.md)).
- Runtime behaviour of composed applications (published libraries layer).

## 5. Functional Requirements

### 5.1 Template Acquisition

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

### 5.2 Assembly

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

### 5.3 Upgrade

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

#### Applied upgrade reversibility

- [ ] `p2` - **ID**: `cpt-frontx-fr-cli-upgrade-restore`

After an approved upgrade is applied, the system **MUST** allow a developer to restore the repository to the previously applied template state for that upgrade.

**Rationale**: Keeps approved upgrades reversible, so a bad template update can be backed out without losing the audit trail of what changed.

**Actors**: `cpt-frontx-actor-project-developer`

### 5.4 Project Builds

#### Build hosts and microfrontends through a supported API

- [ ] `p1` - **ID**: `cpt-frontx-cli-fr-project-build-api`

The system **MUST** provide a programmatic capability to build host and MFE
projects produced by supported FrontX templates. FrontX must supply the build
tools, plugins and documented invocation/configuration needed to fulfill those
templates' producer contracts. Consumers supply their sources, dependencies
and build settings without reimplementing the common pipeline.

**Rationale**: A reusable producer must cover compilation and manifest generation,
not merely retrieval of previously compiled assets.

**Actors**: `cpt-frontx-cli-actor-project-developer`, `cpt-frontx-cli-actor-template-developer`

#### Independent host and MFE builds

- [ ] `p1` - **ID**: `cpt-frontx-cli-fr-independent-project-builds`

The system **MUST** allow one selected MFE to be built and made ready for
publication without rebuilding a host or unrelated MFEs. It must allow one
selected host to be built against published MFE references without rebuilding
those MFEs. Reusing a host implementation must not prevent independently
configured hosts with different application entrypoints and bootstrap settings.

**Rationale**: Independent release cycles require independence at the build boundary.

**Actors**: `cpt-frontx-cli-actor-project-developer`

#### Produce complete published manifests

- [ ] `p1` - **ID**: `cpt-frontx-cli-fr-published-build-manifest`

The system **MUST** produce a published manifest sufficient to obtain and
register its concrete MFE build. This includes entry declarations and their
exposed resources, extensions, required schemas, shared dependencies and the
complete resource closure. Referenced external resources must remain explicitly
resolvable under declared source policy. A partial loader manifest alone must
not be represented as a complete published manifest.

**Rationale**: Consumers must not reconstruct registration information from
unrelated project files or guess a build's resources.

**Actors**: `cpt-frontx-cli-actor-project-developer`

#### Preserve artifact identity and version meaning

- [ ] `p1` - **ID**: `cpt-frontx-cli-fr-build-identity`

The system **MUST** preserve the producer-declared MFE build version in its
manifest and distinguish it from type-contract versions and delivery revisions.
Publication-ready output must carry an explicitly declared producer build
version; an unrelated tool's fallback label must not silently become its release version.
A manifest reference must resolve to an immutable artifact identity or a
verified identity covering its manifest and resource closure. Reuse of one
declared immutable identity for different content must fail. A default or
repeated build-version label alone must not establish artifact identity.
Delivery profiles must not require duplicating the manifest's MFE version;
any supplied duplicate must agree with the resolved manifest.

**Rationale**: A human-readable version and an artifact's reproducible identity
serve different purposes; neither a type ID nor a delivery revision identifies
all build bytes.

**Actors**: `cpt-frontx-cli-actor-project-developer`

### 5.5 Host Deliveries

#### Resolve distinct host compositions

- [ ] `p1` - **ID**: `cpt-frontx-cli-fr-host-delivery-profiles`

The system **MUST** accept consumer-owned profiles for multiple independently
buildable hosts. Each profile declares its own permitted MFE set and concrete
published-manifest references for included builds. An MFE ID alone is insufficient
to select a build. The same MFE may resolve to different build identities in
different hosts. Profile definitions must not depend on a prescribed directory
layout, product vocabulary, task runner or CI service.

**Rationale**: Distinct applications require separately built entrypoints and
compositions, rather than two module lists for one fixed shell.

**Actors**: `cpt-frontx-cli-actor-project-developer`, `cpt-frontx-cli-actor-artifact-repository`

#### Configure artifact access and package complete resources

- [ ] `p1` - **ID**: `cpt-frontx-cli-fr-delivery-resource-closure`

The system **MUST** support consumer-configured artifact sources and destination
locations. A delivery must preserve resolution of its included builds' complete
resource closures after packaging, including stylesheets, lazy-loaded resources
and shared dependencies. Packaged resources and declared remotely retained
resources must be distinguishable; no resource may depend accidentally on its
producer's filesystem or development server. Excluded MFEs must contribute no
packaged files, registrations or navigation to that host delivery.

**Rationale**: A working entry module does not establish a deployable application.

**Actors**: `cpt-frontx-cli-actor-project-developer`, `cpt-frontx-cli-actor-artifact-repository`

#### Refuse invalid or ambiguous compositions

- [ ] `p1` - **ID**: `cpt-frontx-cli-fr-delivery-validation`

The system **MUST** reject unresolved references, incomplete registration data,
missing required resources, unsupported contracts, inconsistent identities and
conflicting entry, extension, schema or destination claims. It must check
declared host/MFE/shared contracts before declaring a delivery ready. Repeated
compatible declarations may be shared only when their meaning and identity
agree. A failed build or assembly must not be reported or exposed as a ready
delivery. Diagnostics must identify the affected host, build and cause when known.

**Rationale**: Silent overwrite, omission or version substitution makes a
composition unpredictable. Static contract checks cannot prove behavioral
compatibility with a backend API; consumer integration evidence remains required.

**Actors**: `cpt-frontx-cli-actor-project-developer`

#### Record repeatable resolution

- [ ] `p1` - **ID**: `cpt-frontx-cli-fr-delivery-reproducibility`

The system **MUST** record each successful delivery's host/profile revision,
resolved manifest/artifact identities, included resource identities and build
input/tool contract versions. Repeating resolution against unchanged inputs
must produce the same included identities and composition identity. A mutable
reference may be an input only if its concrete resolution is recorded and can
be reused without silently following a later publication.

**Rationale**: Composition repeatability is required even when bit-for-bit
compiler output is outside the supported toolchain's guarantees.

**Actors**: `cpt-frontx-cli-actor-project-developer`

#### Support runtime-selected published builds and migration

- [ ] `p1` - **ID**: `cpt-frontx-cli-fr-runtime-delivery-handoff`

The system **MUST** produce hosts able to admit permitted published builds
selected at runtime, including builds absent from their packaged resources.
Deliveries must carry their MFE admission boundary and required host contract
information. FrontX must document migration from a consumer's aggregate manifest
and copied build scripts to the supported build API, published manifests and
host profiles, while preserving declared registration/resource behavior.

**Rationale**: The host package is not an exhaustive catalog of backend-selected
builds; migration must retain working consumers without embedding their policy.

**Actors**: `cpt-frontx-cli-actor-project-developer`

## 6. Non-Functional Requirements

### 6.1 NFR Inclusions

The ecosystem-wide NFRs — evolvability and scaling without an architectural ceiling — bind this package and are owned by the [root PRD §6.1](../../../architecture/PRD.md#61-nfr-inclusions).

#### No Ecosystem Coupling, No Bundled Templates

- [x] `p1` - **ID**: `cpt-frontx-cli-nfr-no-ecosystem-coupling`

The system **MUST** hold no intra-ecosystem package dependency and **MUST** bundle no template: every template is resolved from the source registry by versioned source-spec at runtime.

**Threshold**: Zero intra-ecosystem package coupling and zero template content in the published package.

**Rationale**: The lifecycle tool must outlive any template and any library version. Bundling either would couple the command surface to content it exists to manage, and would turn every template release into a CLI release.

#### Multi-template lifecycle scale

- [ ] `p2` - **ID**: `cpt-frontx-cli-nfr-template-scale`

The system **MUST** keep inventory, assembly, conflict reporting, and upgrade preparation usable for repositories composed from multiple templates.

**Thresholds**:
- Inventory: list at least 100 installed templates with version identity in no more than 2 seconds at p95 on a normal developer workstation.
- Assembly and conflict reporting: evaluate at least 20 templates in one composed operation and report every ownership conflict found before any repository file is written.
- Upgrade preparation: prepare a reviewable upgrade change set for one applied template in a repository with at least 20 applied templates without requiring unrelated templates to upgrade.

**Rationale**: Multi-template repositories are the normal composition case, so the CLI must stay useful as inventory and provenance grow.

#### Developer CLI discoverability

- [ ] `p2` - **ID**: `cpt-frontx-cli-nfr-discoverability`

The system **MUST** support both first-time learning and expert use through its command help and lifecycle feedback.

**Thresholds**:
- A developer can discover install, validate, seed, add, list, update, and upgrade capabilities from product help without reading source code.
- Lifecycle failures name the failed operation, affected template or boundary when known, and the next developer action.
- Repeated lifecycle commands expose enough stable command and argument names for scripted or AI-agent-driven use.

**Rationale**: A developer CLI must be teachable at the terminal and predictable enough for repeated expert use.

#### Delivery integrity

- [ ] `p1` - **ID**: `cpt-frontx-cli-nfr-delivery-integrity`

The system **MUST** preserve complete, repeatable delivery outcomes.

**Thresholds**: Zero silent build substitutions, zero excluded-MFE contributions
and complete resolved identity reporting for every successful delivery. These
outcomes must hold at the capability's first release for at least two distinct
hosts and two builds of one MFE. Credentials must never appear in delivery
output or diagnostics.

**Rationale**: Consumers must be able to identify what they ship without
unintended code or access secrets entering a delivery.

### 6.2 NFR Exclusions

Additional applicability boundaries for this capability:

- **Security**: Project Developers may build their selected sources and resolve
  artifacts through consumer-granted repository access. Template Developers may
  publish their own templates; they receive no authority over consumer profiles
  or publication destinations. Access credentials must not enter delivery output
  or diagnostics. Identity and resource validation are covered by §5.4–5.5.
- **Data and recovery**: Consumers own sources, profiles and delivery records;
  publishers own build manifests and retention. Incomplete output is never a
  ready delivery. Retention must preserve referenced builds for each consumer's
  declared supported backend lifetime, which may span years; pruning policy
  remains with the publisher. No universal retention duration is imposed.
- **Performance and capacity**: A universal compiler duration or artifact-volume
  SLA is not applicable because these depend on consumer sources and supported
  toolchains. Two hosts and two MFE builds are the minimum capability acceptance
  scale; existing template-scale targets remain unchanged.
- **Availability and operations**: Hosted-service uptime, rate limits, global
  deployment topology, canary policy and paid support tiers are not applicable
  because this is a consumer-invoked tool. Artifact publication, backup and
  retention operations remain consumer/publisher responsibilities. Failed access
  has an explicit outcome and never silently falls back to another build.
- **Documentation and usability**: JavaScript/TypeScript project developers must
  be able to perform the independent-build and two-host use case from supplied
  API/configuration and migration documentation without reading FrontX source.
  Every delivery failure must identify a corrective action. Market-share and
  satisfaction-survey targets are not applicable to this scoped capability.
- **Privacy, authentication and legal policy**: End-user sign-in, MFA, SSO,
  impersonation, personal-data retention and consent policy are not applicable
  because the tool does not manage end-user sessions or personal records.
  Consumers own repository credential policy; no compliance certification or
  contractual support SLA is introduced by these requirements.

The root PRD's §6.2 exclusions (safety, privacy, accessibility, internationalization, inclusivity, regulatory compliance) apply here for the same reasons stated there.

## 7. Public Library Interfaces

### 7.1 Public API Surface

#### Project build and delivery API

- [ ] `p1` - **ID**: `cpt-frontx-cli-interface-project-build-delivery`

**Type**: Programmatic library/API for consumers' development and build environments.

**Stability**: Required new surface; not an assertion that an API already exists.

**Description**: Builds selected supported host/MFE projects, produces and resolves
published manifests, validates host profiles and produces recorded deliveries.
Consumers configure sources, build settings, artifact access and destinations.
The exact call signatures and distribution packaging remain technical design work.

**Breaking Change Policy**: Independently versioned under the ecosystem's
compatibility commitments; supported template/build contract versions must be documented.

#### CLI

- [ ] `p1` - **ID**: `cpt-frontx-interface-cli`

**Type**: CLI

**Stability**: unstable

**Description**: The CLI owns the repository lifecycle: it installs, lists, updates, and validates templates from the source registry; applies a template to seed a new repository or extend an existing one; assembles a repository from multiple independently-applied templates and resolves any templates a preset references as part of a single operation; detects and prevents conflicting assembly before any files are written by honoring each template's declared ownership boundaries; records per-applied-template provenance; and upgrades each applied template independently to a newer version as reviewable change sets that a developer approves before they apply.

**Documentation / Help Obligation**: The developer-facing lifecycle surface **MUST** be documented and discoverable through product help so developers can understand the available lifecycle capabilities, stability expectations, and template-contract responsibilities without reading source code.

**Breaking Change Policy**: The command surface follows the root PRD's independent-version and active-channel compatibility policy (`cpt-frontx-nfr-evolvability`), including its pre-1.0 distinction.

### 7.2 External Integration Contracts

#### Published-build and delivery exchange

- [ ] `p1` - **ID**: `cpt-frontx-cli-contract-build-delivery-exchange`

**Direction**: Published manifests provided to consumers; artifact resolution
consumes publisher resources; delivery records provided to consuming projects.

**Description**: Exchanges concrete build identity, complete registration/resource
information and declared compatibility. Consumer-configured artifact access must
work without a particular registry vendor or repository layout. Profiles and
publication credentials remain consumer-owned.

**Compatibility**: Producer, template, profile and runtime contract versions are
declared and validated. Unsupported versions fail explicitly. Backend behavioral
compatibility is outside what this exchange can certify.

This package owns repository-lifecycle contracts for templates. The contracts below define what a template must satisfy to be acquired, assembled, and upgraded by the CLI. Template-bundled AI-extension obligations are owned by the [AI Tooling Framework PRD](../../cyber-pilot-kit-frontx/architecture/PRD.md).

#### Source-spec contract

- [ ] `p2` - **ID**: `cpt-frontx-contract-source-spec`

**Direction**: required from client

**Description**: The product accepts versioned references that identify templates hosted on the source registry (`cpt-frontx-actor-github`). References resolve generically; the contract does not prescribe a specific reference syntax at the product-requirements level.

**Compatibility**: Reference resolution remains compatible across minor and patch versions; any breaking change follows the platform's evolvability requirement (`cpt-frontx-nfr-evolvability`).

#### Template manifest contract

- [ ] `p2` - **ID**: `cpt-frontx-contract-template-manifest`

**Direction**: bidirectional

**Description**: The product requires every template to publish a manifest in a defined shape. The manifest describes the boundaries of what the template owns and any other templates it references to be applied together. The CLI produces that manifest when a template is validated for publication and consumes it when a template is installed, applied, or assembled with others. The declared ownership boundaries let the product detect and refuse conflicting assembly before any files are written. This is an internal contract between templates and the product; it names no external party.

**Compatibility**: The manifest shape is versioned with the platform; changes that are not backward-compatible follow `cpt-frontx-nfr-evolvability`.

#### Per-template provenance contract

- [ ] `p2` - **ID**: `cpt-frontx-contract-project-provenance`

**Direction**: provided by library

**Description**: The product records provenance per applied template into the repository, capturing which template and which template version each was applied from, so a later upgrade can determine what to apply for that template. Current provenance is authoritative for the repository's applied template state. Previous applied provenance is retained sufficiently to audit and restore upgrades, and migration preserves auditable continuity. A repository carries one provenance record per applied template rather than a single whole-repository origin. This is an internal contract recorded per applied template; it names no external party.

**Compatibility**: Provenance records remain readable across versions; any change that is not backward-compatible follows `cpt-frontx-nfr-evolvability`.

## 8. Use Cases

### 8.1 Build and Delivery Journeys

#### Project Developer builds two different host deliveries

- [ ] `p2` - **ID**: `cpt-frontx-cli-usecase-build-distinct-hosts`

**Actor**: `cpt-frontx-cli-actor-project-developer`

**Preconditions**: Supported host/MFE templates and build dependencies are
available; two consumer-owned host profiles and artifact access are configured.

**Main Flow**:
1. The developer builds and publishes two builds of one MFE independently of the hosts.
2. The developer selects different published manifests and permitted MFE sets for two hosts with distinct application entrypoints.
3. The developer builds each host independently and resolves its delivery through the supplied API.
4. FrontX validates and packages each delivery and records the resolved composition.
5. The developer repeats resolution using recorded inputs and obtains the same included identities.

**Postconditions**: Two separately deployable hosts have distinct bootstraps and
compositions; excluded MFEs contribute nothing to their respective deliveries.

**Alternative Flows**: Missing resources, conflicting declarations or unsupported
contracts prevent readiness with actionable diagnostics. A permitted later build
selected through a consumer's backend-for-frontend can be loaded without rebuilding
the host; the runtime member owns that lifecycle.

#### Project Developer migrates an aggregate-manifest consumer

- [ ] `p2` - **ID**: `cpt-frontx-cli-usecase-migrate-build-consumer`

**Actor**: `cpt-frontx-cli-actor-project-developer`

**Preconditions**: The consumer has working builds, an aggregate manifest and
project-owned build scripts.

**Main Flow**:
1. The developer maps existing host/MFE inputs and artifact access to supported build configuration.
2. The developer produces complete published manifests and explicit host profiles through FrontX capabilities.
3. The developer verifies equivalent registration and resource loading, then adopts the runtime manifest handoff.

**Postconditions**: The consumer owns its profiles and publication policy; common
build logic follows the supported FrontX contracts.

**Alternative Flows**: Unsupported legacy data or missing producer information
is reported for explicit migration; the system does not guess type IDs as URLs.

### 8.2 Template Lifecycle Journeys

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
4. The CLI writes the accepted repository content and records one provenance record per applied template.

**Postconditions**:
- A repository on disk assembled from its templates, with one provenance record per applied template.

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
3. The CLI writes the accepted repository content and records a provenance record for the added template.

**Postconditions**:
- The template is added to the repository with its own provenance record. Runtime behavior for any contributed microfrontend is owned by the [MFE Runtime PRD](../../mfes/architecture/PRD.md).

**Alternative Flows**:
- **Conflicting assembly**: the CLI detects that the added template claims ground an already-applied template owns and refuses the addition before any files are written.

#### Project Developer upgrades one applied template

- [ ] `p2` - **ID**: `cpt-frontx-usecase-upgrade-applied-template`

**Actor**: `cpt-frontx-actor-project-developer`

**Preconditions**:
- A repository has at least one applied template with recorded provenance.
- A newer version of that applied template is available in the source registry.
- The product is installed.

**Main Flow**:
1. The Project Developer selects one applied template to upgrade independently (`cpt-frontx-fr-cli-project-upgrade-changeset`).
2. The CLI prepares a reviewable change set for that applied template without writing those changes to repository files (`cpt-frontx-fr-cli-project-upgrade-changeset`, `cpt-frontx-fr-cli-upgrade-review-approval`).
3. The Project Developer reviews and approves the change set before file writes (`cpt-frontx-fr-cli-upgrade-review-approval`).
4. The CLI applies the approved changes and updates the applied template's provenance record.

**Postconditions**:
- The selected applied template is upgraded to the approved newer version with updated provenance; other applied templates are unaffected.
- The developer can restore the repository to the previously applied template state for that upgrade (`cpt-frontx-fr-cli-upgrade-restore`).

**Alternative Flows**:
- **Upgrade rejected**: the Project Developer rejects the change set; the CLI writes no repository files and leaves provenance unchanged.

## 9. Acceptance Criteria

The following criteria apply at the first release of the build/delivery capability;
they are required outcomes, not claims of completed implementation.

- [ ] A consumer builds one MFE from template-derived source without rebuilding a host or another MFE, and builds a host against published manifests without rebuilding MFEs, using only the supplied API and documented configuration — `cpt-frontx-cli-fr-project-build-api`, `cpt-frontx-cli-fr-independent-project-builds`.
- [ ] Two separately built host applications have distinct application entrypoints/bootstrap settings, different permitted MFE sets and different concrete builds of at least one common MFE. Neither result is only a different module list for one prebuilt shell — `cpt-frontx-cli-fr-host-delivery-profiles`.
- [ ] Every published build can be retrieved and registered from its manifest with all entries, extensions, schemas and exposed/shared resources. No consumer-side reconstruction from unpublished project files is required — `cpt-frontx-cli-fr-published-build-manifest`.
- [ ] A default or repeated build-version label never makes different artifact content indistinguishable. Build, type-contract and delivery versions remain distinguishable; no duplicated profile build-version field is required — `cpt-frontx-cli-fr-build-identity`.
- [ ] Both host deliveries retain working initial, CSS, lazy, shared and supporting resource resolution at the configured destination, with no accidental development-source dependency. Each excluded MFE has zero files, registrations and navigation contributions — `cpt-frontx-cli-fr-delivery-resource-closure`.
- [ ] Missing manifests/resources, incomplete registration metadata, incompatible declared contracts, identity mismatch and conflicting entry/extension/schema/destination claims each prevent a ready delivery and identify their cause — `cpt-frontx-cli-fr-delivery-validation`.
- [ ] Repeating unchanged recorded inputs yields identical included artifact identities and composition identity. Changed mutable publications cannot silently alter a recorded delivery — `cpt-frontx-cli-fr-delivery-reproducibility`.
- [ ] A host produced through this capability can load a permitted runtime-selected published build absent from its package; selection does not require a host rebuild, publication or page reload — `cpt-frontx-cli-fr-runtime-delivery-handoff`.
- [ ] The same build/delivery capability is used from two consumer-selected source/output layouts and artifact source configurations, without FrontX changes or knowledge of product names, cluster versions, Nx or a CI provider — `cpt-frontx-cli-fr-host-delivery-profiles`, `cpt-frontx-cli-fr-delivery-resource-closure`.
- [ ] Migration documentation covers existing aggregate manifests, type-ID references, complete producer metadata, build invocation and profile adoption, with registration/resource equivalence and unsupported-data diagnostics — `cpt-frontx-cli-fr-runtime-delivery-handoff`.
- [ ] Every successful delivery meets the integrity thresholds, including zero credentials in output/diagnostics — `cpt-frontx-cli-nfr-delivery-integrity`.

- [ ] A developer (or an AI agent acting for one) can drive the full lifecycle end to end: install, validate, seed, add, assemble with conflict refusal, and upgrade with review — verifiable via `cpt-frontx-usecase-publish-composed-project-template`, `cpt-frontx-usecase-scaffold-composed-project`, `cpt-frontx-usecase-add-microfrontend-to-project`, and `cpt-frontx-usecase-upgrade-applied-template`.
- [ ] A developer can see installed templates and their versions — verifiable via `cpt-frontx-fr-cli-template-list`.
- [ ] A developer can update an installed template locally to a newer version without altering any project scaffolded from that template — verifiable via `cpt-frontx-fr-cli-template-update-local`.
- [ ] No assembly writes files when two templates claim the same ground — verifiable via `cpt-frontx-fr-cli-assembly-conflict-prevention`.
- [ ] Every upgrade is applied as a reviewable change set approved before files change — verifiable via `cpt-frontx-fr-cli-project-upgrade-changeset` and `cpt-frontx-fr-cli-upgrade-review-approval`.
- [ ] A developer can restore the repository to the previously applied template state after an applied upgrade — verifiable via `cpt-frontx-fr-cli-upgrade-restore` and retained provenance.
- [ ] The template and build/delivery contracts in §7.2 are documented with direction and a compatibility commitment — verifiable via the §7.2 enumeration.
- [ ] CLI help and lifecycle failures satisfy the discoverability thresholds in `cpt-frontx-cli-nfr-discoverability`.
- [ ] Multi-template inventory, assembly/conflict reporting, and upgrade preparation satisfy `cpt-frontx-cli-nfr-template-scale`.

## 10. Dependencies

| Dependency | Description | Criticality |
|------------|-------------|-------------|
| GitHub (source registry, `cpt-frontx-actor-github`) | Hosts published templates; fetched by versioned source-spec for install, local template update, and upgrade operations that need template versions. | p1 |
| JavaScript / TypeScript runtime and repository filesystem/process capabilities | The execution boundary the CLI requires to run as `frontx` and read or write repository lifecycle changes. | p1 |
| Supported template build toolchain and dependencies | Required to compile selected projects; supported contract versions must be declared, without bundling template content. | p1 |
| Consumer-configured artifact repository | Provides published manifests and their resource closures during resolution. | p1 |

## 11. Assumptions

- Consumers supply source revisions, dependency locks and build inputs required by their supported toolchain. Composition repeatability does not promise bit-for-bit compilation across uncontrolled environments.
- Published builds selected by a backend-for-frontend already exist. Publishers retain addressable builds for their declared support lifetime.
- Consumers own backend compatibility decisions and verify behavior against their supported backends; static manifest validation is necessary but insufficient evidence.
- No product-scope question remains open. Exact API signatures, identity representation and supported contract-version matrix belong to technical design, owned by the projects-orchestration maintainer before implementation of this capability.

- Templates and their bundled AI extensions are versioned together as stated in [root PRD §11](../../../architecture/PRD.md#11-assumptions).
- Semantic versioning remains the version discipline for templates and their references.

## 12. Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Template-ecosystem adoption depends on the quality of the reference templates. | Without high-quality reference templates, Project Developers may not discover the product's strengths. | Separately governed reference templates demonstrate conflict-free composition and conformance to the publication contract. |
| A manifest-shape change breaks published templates. | Templates fail validation or assembly after a CLI upgrade. | The manifest contract is versioned with the platform and bound by the evolvability requirement's deprecation cycle. |
| A build-version label is reused or defaults for every release. | Different artifacts appear identical. | Require immutable or verified artifact identity and preserve the producer's version meaning. |
| A required old build is deleted or a shared dependency changes underneath it. | A supported backend loses its matching frontend. | Publisher-owned support retention and complete resource identities; unavailable inputs fail explicitly. |
| A delivery passes static checks but fails against a backend. | Runtime behavior is incompatible. | Consumer-owned backend selection and integration evidence; do not represent contract validation as behavioral certification. |
