# Decomposition: FrontX Ecosystem

<!-- toc -->

- [1. Overview](#1-overview)
- [2. Entries](#2-entries)
  - [2.1 Opaque Type-Substrate Port - HIGH](#21-opaque-type-substrate-port---high)
  - [2.2 MFE Registry & Handler Resolution - HIGH](#22-mfe-registry--handler-resolution---high)
  - [2.3 GTS Default Type-System Provider - HIGH](#23-gts-default-type-system-provider---high)
  - [2.4 MFE Discovery & Lazy-Import Loading - HIGH](#24-mfe-discovery--lazy-import-loading---high)
  - [2.5 Host–MFE Communication: Actions-Chains Mediator & Parent–Child Bridge - HIGH](#25-hostmfe-communication-actions-chains-mediator--parentchild-bridge---high)
  - [2.6 Extension-Domain Governance: Mount Strategies, Cardinality & Contract Matching - HIGH](#26-extension-domain-governance-mount-strategies-cardinality--contract-matching---high)
  - [2.7 MFE Runtime Isolation - HIGH](#27-mfe-runtime-isolation---high)
  - [2.8 API Protocol Surface - MEDIUM](#28-api-protocol-surface---medium)
  - [2.9 Ecosystem Distribution & Versioning Policy - MEDIUM](#29-ecosystem-distribution--versioning-policy---medium)
  - [2.10 Template Externalization & Source-Spec Resolution - HIGH](#210-template-externalization--source-spec-resolution---high)
  - [2.11 Template Manifest Contract & Pre-Publish Validation - HIGH](#211-template-manifest-contract--pre-publish-validation---high)
  - [2.12 Two-Namespace Commands & Project/MFE Scaffolding - HIGH](#212-two-namespace-commands--projectmfe-scaffolding---high)
  - [2.13 Composed-Template Resolution & Project Provenance - HIGH](#213-composed-template-resolution--project-provenance---high)
  - [2.14 Upgrade Change-Set Engine - HIGH](#214-upgrade-change-set-engine---high)
  - [2.15 AI Tooling Kit Packaging & Base Content - HIGH](#215-ai-tooling-kit-packaging--base-content---high)
  - [2.16 Template AI-Extension Contract & Discovery/Activation - HIGH](#216-template-ai-extension-contract--discoveryactivation---high)
  - [2.17 AI-Driven Upgrade Orchestration - HIGH](#217-ai-driven-upgrade-orchestration---high)
- [3. Feature Dependencies](#3-feature-dependencies)

<!-- /toc -->

## 1. Overview

This decomposition breaks the FROZEN FrontX DESIGN into 17 work-package features, grouped along the three ecosystem pillars and ordered foundation-first. It is a work-package breakdown only: it states what each feature owns, what it depends on, and which upstream DESIGN/PRD elements it covers — it does not re-derive design, model behavior, or restate requirement text. All upstream elements are cited by ID; per-feature behavior is authored in each `features/{slug}/FEATURE.md`.

**Decomposition strategy.** Each feature is a cohesive component/subsystem slice with loose coupling to its neighbours, sized so its dependencies form an acyclic graph with the foundations at the roots. Surviving Pillar-1 features (extraction + boundary-hardening of shipping runtime/type-system/API code) are kept distinct in nature from the greenfield Pillar-2/3 features; the two are never mixed in one feature.

**Three pillars.**
- **Pillar 1 — Core Framework** (`@gears-frontx/mfes`, `@gears-frontx/gts-plugin`, `@gears-frontx/api`): F2 type-substrate port, F4 registry & handler resolution, F3 GTS default type-system provider, F5 discovery & lazy-import loading, F6 host–MFE communication, F7 extension-domain governance, F8 runtime isolation, F9 API protocol surface.
- **Pillar 2 — CLI** (`@gears-frontx/cli`): F10 template externalization & source-spec resolution, F11 template manifest contract, F12 two-namespace commands & scaffolding, F13 composed-template resolution & provenance, F14 upgrade change-set engine.
- **Pillar 3 — AI Tooling** (`cyber-pilot-kit-frontx`): F15 kit packaging & base content, F16 template AI-extension contract & discovery/activation, F17 AI-driven upgrade orchestration.
- **Cross-cutting:** F1 ecosystem distribution & versioning policy governs all published artifacts.

**Coverage and exclusivity.** Every DESIGN component (5), principle (5), constraint (10), and sequence (4), and every PRD functional (24) and non-functional (4) requirement, is assigned to at least one feature; `cpt validate` enforces 100% coverage of the strict DESIGN elements. Each strict element (component / principle / constraint / sequence) is owned by exactly one feature, with one explicit exception: the three components `cpt-frontx-component-mfe-runtime`, `cpt-frontx-component-cli`, and `cpt-frontx-component-ai-tooling-kit` are each realized by several cohesive features and are therefore shared across those features. The shared-component reason is the cohesion/coupling rule: these components decompose into multiple high-cohesion, loosely-coupled features that each own a distinct slice of the component, so listing the component reference in every owning feature preserves coverage without forcing an artificial single-feature monolith. PRD `fr`/`nfr` requirements are covered transitively and may appear in more than one feature's Requirements Covered.

## 2. Entries

**Overall implementation status:**

- [ ] `p1` - **ID**: `cpt-frontx-status-overall`

### 2.1 [Opaque Type-Substrate Port](features/type-substrate-port/) - HIGH

- [ ] `p1` - **ID**: `cpt-frontx-feature-type-substrate-port`

- **Purpose**: Define the MFE Runtime's opaque type-substrate port through which the runtime reasons about types solely by identity and delegates every schema/validation/hierarchy operation to an injected provider — keeping the runtime independent of any concrete type-definition specification.

- **Depends On**: None

- **Scope**:
  - Opaque Schema identity surface on the runtime.
  - The injected type-substrate port contract (validate, type-of/hierarchy resolution) the runtime calls.
  - Extraction of the port out of `packages/screensets` into `@gears-frontx/mfes`.
  - Hardening MFES-1/4/5 boundaries.

- **Out of scope**:
  - The concrete GTS provider implementation (F3).
  - Handler resolution (F4).
  - Registry mechanics (F4).

- **Requirements Covered**:

  - [ ] `p1` - `cpt-frontx-fr-application-type-definitions`
  - [ ] `p1` - `cpt-frontx-fr-mfe-type-validation`

- **Design Principles Covered**:

  - [ ] `p1` - `cpt-frontx-principle-opaque-type-substrate`
  - [ ] `p1` - `cpt-frontx-principle-agnostic-core`

- **Design Constraints Covered**:

  - [ ] `p1` - `cpt-frontx-constraint-mfes-no-type-format-literals`
  - [ ] `p1` - `cpt-frontx-constraint-mfes-no-type-format-dependency`
  - [ ] `p1` - `cpt-frontx-constraint-mfes-opaque-schema-surface`

- **Domain Model Entities**:
  - Schema

- **Design Components**:

  - [ ] `p1` - `cpt-frontx-component-mfe-runtime` (shared)

- **API**:
  - MFE Runtime type-substrate port (TS)

- **Sequences**:
  - N/A

- **Data**:

  - N/A

### 2.2 [MFE Registry & Handler Resolution](features/mfe-registry/) - HIGH

- [ ] `p1` - **ID**: `cpt-frontx-feature-mfe-registry`

- **Purpose**: Provide the abstract `MfeRegistry` façade (built via `mfeRegistryFactory` with the type-system provider injected) that owns microfrontend registration and on-demand load orchestration, resolving each unit's handler by its declared base type rather than by handler self-selection.

- **Depends On**: `cpt-frontx-feature-type-substrate-port`

- **Scope**:
  - Registry façade + factory injection.
  - Registration entry.
  - Handler abstraction + resolution by declared base type (via `typeSystem.isTypeOf`).
  - On-demand load orchestration entry.
  - Ownership of the register→validate→mount sequence.

- **Out of scope**:
  - Manifest discovery + lazy-import ABI (F5).
  - Mediation/bridge (F6).
  - Domain admission/mount strategies (F7).
  - Isolation (F8).
  - The concrete type system (F3).

- **Requirements Covered**:

  - [ ] `p1` - `cpt-frontx-fr-mfe-runtime-registration`
  - [ ] `p1` - `cpt-frontx-fr-ui-framework-agnostic`

- **Design Principles Covered**:

  - [ ] `p1` - `cpt-frontx-principle-agnostic-core`

- **Domain Model Entities**:
  - MfeEntry
  - Extension

- **Design Components**:

  - [ ] `p1` - `cpt-frontx-component-mfe-runtime` (shared)

- **API**:
  - `cpt-frontx-interface-mfe-runtime` (registry facade)

- **Sequences**:

  - [ ] `p1` - `cpt-frontx-seq-mfe-register-validate-mount` (OWNER — orchestrating entry)

- **Data**:

  - N/A

### 2.3 [GTS Default Type-System Provider](features/gts-type-provider/) - HIGH

- [ ] `p1` - **ID**: `cpt-frontx-feature-gts-type-provider`

- **Purpose**: Supply the ecosystem's default, injectable type-system provider (`@gears-frontx/gts-plugin`) implementing the runtime's opaque type-substrate port over a concrete type-definition specification, owning the infrastructure schemas + default lifecycle instances and providing schema validation and type-of resolution.

- **Depends On**: `cpt-frontx-feature-type-substrate-port`

- **Scope**:
  - The `@gears-frontx/gts-plugin` provider implementing `TypeSystemPlugin`.
  - Registration of infrastructure schemas + default lifecycle instances at construction.
  - Schema validation + type-of/hierarchy resolution.
  - Extraction out of `packages/screensets`.

- **Out of scope**:
  - The opaque port contract itself (F2).
  - Runtime registry (F4).
  - Solution-specific schemas (registered by their owners at runtime).

- **Requirements Covered**:

  - [ ] `p1` - `cpt-frontx-fr-mfe-type-validation`
  - [ ] `p1` - `cpt-frontx-fr-application-type-definitions`

- **Design Principles Covered**:

  - [ ] `p1` - `cpt-frontx-principle-opaque-type-substrate`

- **Design Constraints Covered**:

  - [ ] `p1` - `cpt-frontx-constraint-gts-plugin-owns-infra-schemas`
  - [ ] `p1` - `cpt-frontx-constraint-gts-plugin-excludes-solution-schemas`

- **Domain Model Entities**:
  - Schema
  - LifecycleStage

- **Design Components**:

  - [ ] `p1` - `cpt-frontx-component-type-system-plugin`

- **API**:
  - `cpt-frontx-interface-type-system`

- **Sequences**:
  - N/A

- **Data**:

  - N/A

### 2.4 [MFE Discovery & Lazy-Import Loading](features/mfe-loading/) - HIGH

- [ ] `p1` - **ID**: `cpt-frontx-feature-mfe-loading`

- **Purpose**: Drive microfrontend discovery from an enriched published manifest (asset base, per-entry backing files, stylesheets, ordered shared deps) and resolve lazy dynamic imports through a runtime ABI that inherits the parent load's shared-dependency bindings — keeping the runtime ABI distinct from the template-bound build and deferring build cost.

- **Depends On**: `cpt-frontx-feature-mfe-registry`

- **Scope**:
  - Manifest-driven discovery (read declared fields, not parsed remote-entry).
  - Lazy-import ABI separation (build-time rewrite to ABI call, per-load runtime resolver mapping to parent graph).
  - On-demand load execution.

- **Out of scope**:
  - Registry façade/handler resolution (F4).
  - Runtime isolation/trust kernel (F8).

- **Requirements Covered**:

  - [ ] `p1` - `cpt-frontx-fr-mfe-runtime-registration`
  - [ ] `p1` - `cpt-frontx-nfr-runtime-performance`

- **Domain Model Entities**:
  - MfeEntry

- **Design Components**:

  - [ ] `p1` - `cpt-frontx-component-mfe-runtime` (shared)

- **API**:
  - N/A

- **Sequences**:
  - N/A

- **Data**:

  - N/A

### 2.5 [Host–MFE Communication: Actions-Chains Mediator & Parent–Child Bridge](features/mfe-host-communication/) - HIGH

- [ ] `p1` - **ID**: `cpt-frontx-feature-mfe-host-communication`

- **Purpose**: Route host–microfrontend communication through an actions-chains mediator keyed by target and action type with recursive chain execution (success/fallback branching, in-flight tracking for safe teardown) over a narrow parent–child capability bridge that delegates to the registry.

- **Depends On**: `cpt-frontx-feature-mfe-registry`

- **Scope**:
  - Actions-chains mediator (keyed dispatch, per-target catch-all tier, recursive chain success/fallback, in-flight tracking).
  - Narrow capability bridge (executeActionsChain, subscribeToProperty, getProperty, registerActionHandler) delegating to the registry.
  - Matching narrow parent handle.

- **Out of scope**:
  - Domain admission/contract matching (F7).
  - Type validation (F2/F3).

- **Requirements Covered**:

  - [ ] `p1` - `cpt-frontx-fr-mfe-host-communication`

- **Design Principles Covered**:

  - [ ] `p1` - `cpt-frontx-principle-agnostic-core`

- **Design Constraints Covered**:

  - [ ] `p1` - `cpt-frontx-constraint-mfes-no-solution-shared-properties`

- **Domain Model Entities**:
  - Action
  - ActionsChain

- **Design Components**:

  - [ ] `p1` - `cpt-frontx-component-mfe-runtime` (shared)

- **API**:
  - N/A

- **Sequences**:
  - N/A

- **Data**:

  - N/A

### 2.6 [Extension-Domain Governance: Mount Strategies, Cardinality & Contract Matching](features/extension-domain-governance/) - HIGH

- [x] `p1` - **ID**: `cpt-frontx-feature-extension-domain-governance`

- **Purpose**: Govern extension-domain occupancy through composable named mount strategies (concurrent/optional/exclusive) and a cardinality matrix, admitting extensions only by subset-rule contract matching with the scoped infrastructure-lifecycle-action exemption — realizing default-deny admission.

- **Depends On**: `cpt-frontx-feature-mfe-registry`, `cpt-frontx-feature-gts-type-provider`

- **Scope**:
  - Mount-strategy selection + cardinality matrix.
  - Action–behavior consistency validation at admission.
  - Subset-rule contract matching (three containment rules).
  - Domain occupancy admit/reject.

- **Out of scope**:
  - Registry/handler resolution (F4).
  - Isolation (F8).
  - Mediation (F6).

- **Requirements Covered**:

  - [x] `p1` - `cpt-frontx-fr-mfe-multi-occupant-domain`
  - [x] `p1` - `cpt-frontx-fr-mfe-type-validation`
  - [x] `p1` - `cpt-frontx-nfr-security`

- **Design Principles Covered**:

  - [x] `p1` - `cpt-frontx-principle-default-deny-admission`

- **Design Constraints Covered**:

  - [x] `p1` - `cpt-frontx-constraint-mfes-no-layout-domain-values`

- **Domain Model Entities**:
  - Extension
  - ExtensionDomain

- **Design Components**:

  - [ ] `p1` - `cpt-frontx-component-mfe-runtime` (shared)

- **API**:
  - N/A

- **Sequences**:
  - N/A

- **Data**:

  - N/A

### 2.7 [MFE Runtime Isolation](features/mfe-isolation/) - HIGH

- [x] `p1` - **ID**: `cpt-frontx-feature-mfe-isolation`

- **Purpose**: Isolate each loaded microfrontend in its own module graph behind an audited trust kernel — concentrating dynamic-code primitives in one annotated trust-kernel file with a no-mutable-state contract and runtime guards, retaining backing references for the page lifetime to support top-level await.

- **Depends On**: `cpt-frontx-feature-mfe-registry`, `cpt-frontx-feature-mfe-loading`

- **Scope**:
  - Per-unit module-graph isolation.
  - The audited trust kernel (dynamic import + specifier-matcher construction) with safety annotations + guards.
  - Backing-reference retention.

- **Out of scope**:
  - Load orchestration (F5).
  - Registry (F4).

- **Requirements Covered**:

  - [x] `p1` - `cpt-frontx-fr-mfe-runtime-registration`
  - [x] `p1` - `cpt-frontx-nfr-security`

- **Design Principles Covered**:

  - [x] `p1` - `cpt-frontx-principle-default-deny-admission`

- **Domain Model Entities**:
  - MfeEntry

- **Design Components**:

  - [x] `p1` - `cpt-frontx-component-mfe-runtime` (shared)

- **API**:
  - N/A

- **Sequences**:
  - N/A

- **Data**:

  - N/A

### 2.8 [API Protocol Surface](features/api-protocol-surface/) - MEDIUM

- [x] `p2` - **ID**: `cpt-frontx-feature-api-protocol-surface`

- **Purpose**: Provide a protocol-separated, solution-agnostic API surface (`@gears-frontx/api`): request/response and streaming behind a common abstract `ApiProtocol` with descriptor-based endpoints + auto-derived cache keys, a generic plugin short-circuit, and a realm-scoped retainer-counted shared fetch cache that lets independently bundled units reuse in-flight and cached results.

- **Depends On**: None

- **Scope**:
  - `ApiProtocol` request/response + streaming protocols.
  - Protocol-specific plugin hooks + uniform plugin contract.
  - Short-circuit return contract.
  - Realm-shared retainer-counted fetch cache (well-known global symbol, dedupe by key).

- **Out of scope**:
  - Any solution-specific plugin/endpoint/auth wiring (consumer-supplied).
  - Intra-ecosystem package coupling.

- **Requirements Covered**:

  - [x] `p2` - `cpt-frontx-nfr-runtime-performance`

- **Design Constraints Covered**:

  - [x] `p2` - `cpt-frontx-constraint-api-no-solution-content`

- **Domain Model Entities**:
  - ApiService

- **Design Components**:

  - [x] `p2` - `cpt-frontx-component-api-surface`

- **API**:
  - TS library surface (no PRD interface ID by DESIGN §3.3)

- **Sequences**:
  - N/A

- **Data**:

  - N/A

### 2.9 [Ecosystem Distribution & Versioning Policy](features/ecosystem-distribution/) - MEDIUM

- [ ] `p2` - **ID**: `cpt-frontx-feature-ecosystem-distribution`

- **Purpose**: Establish the matched-version, per-concern artifact distribution policy — independently published, independently versioned artifacts whose major/minor stay matched while patch/pre-release diverge, isolating breaking changes behind semver + a deprecation cycle, and imposing no architectural ceiling on integrated units.

- **Depends On**: None

- **Scope**:
  - Matched major/minor version-policy enforcement across published artifacts.
  - Deprecation-cycle gate before removal.
  - npm + GitHub-source distribution channels.
  - The no-architectural-ceiling guarantee (growth governed by performance thresholds, not structure).

- **Out of scope**:
  - Per-component internal behavior (other features).
  - CI implementation code.

- **Requirements Covered**:

  - [ ] `p2` - `cpt-frontx-fr-versioned-platform-evolution`
  - [ ] `p2` - `cpt-frontx-fr-no-architectural-ceiling`
  - [ ] `p2` - `cpt-frontx-nfr-evolvability`
  - [ ] `p2` - `cpt-frontx-nfr-scalability-ceiling`

- **Design Principles Covered**:

  - [ ] `p2` - `cpt-frontx-principle-per-concern-versioning`

- **Domain Model Entities**:
  - N/A

- **API**:
  - `cpt-frontx-contract-package-registry-distribution`

- **Sequences**:
  - N/A

- **Data**:

  - N/A

### 2.10 [Template Externalization & Source-Spec Resolution](features/template-resolution/) - HIGH

- [ ] `p1` - **ID**: `cpt-frontx-feature-template-resolution`

- **Purpose**: Make the CLI (`@gears-frontx/cli`) bundle no template and resolve each template from an external source by versioned source-spec (`host:owner/repo@ref`) at runtime into a tracked local inventory — install, local list, and local update bounded to that inventory, never disturbing scaffolded projects.

- **Depends On**: None

- **Scope**:
  - Template install by versioned source-spec.
  - Source-spec syntax (host-prefixed `host:owner/repo@ref`).
  - Local inventory listing.
  - Local update bounded to inventory.
  - CLI-template-independence (CLI-1).

- **Out of scope**:
  - Manifest pre-publish validation (F11).
  - Scaffolding/namespaces (F12).
  - Composition (F13).
  - Upgrade (F14).

- **Requirements Covered**:

  - [ ] `p1` - `cpt-frontx-fr-cli-template-install`
  - [ ] `p1` - `cpt-frontx-fr-cli-template-list`
  - [ ] `p1` - `cpt-frontx-fr-cli-template-update-local`

- **Design Principles Covered**:

  - [ ] `p1` - `cpt-frontx-principle-template-agnostic-tooling`

- **Design Constraints Covered**:

  - [ ] `p1` - `cpt-frontx-constraint-cli-template-independence`

- **Domain Model Entities**:
  - Template

- **Design Components**:

  - [ ] `p1` - `cpt-frontx-component-cli` (shared)

- **API**:
  - CLI install/list/update commands
  - `cpt-frontx-contract-source-spec`

- **Sequences**:
  - N/A

- **Data**:

  - N/A

### 2.11 [Template Manifest Contract & Pre-Publish Validation](features/template-manifest/) - HIGH

- [x] `p1` - **ID**: `cpt-frontx-feature-template-manifest`

- **Purpose**: Define the single published template manifest as the conformance contract — every template declares itself (identity, version, kind, referenced compositions) in a versioned shape, checked at pre-publish validation and read at install and scaffold, giving one authoritative description.

- **Depends On**: `cpt-frontx-feature-template-resolution`

- **Scope**:
  - Template manifest shape/contract.
  - Pre-publish structure validation against the contract.
  - Manifest consumed at install + scaffold.

- **Out of scope**:
  - Source-spec resolution (F10).
  - Composition recursion (F13).
  - Scaffolding mechanics (F12).

- **Requirements Covered**:

  - [x] `p1` - `cpt-frontx-fr-cli-template-validate-prepublish`

- **Domain Model Entities**:
  - TemplateManifest

- **Design Components**:

  - [x] `p1` - `cpt-frontx-component-cli` (shared)

- **API**:
  - CLI validate (pre-publish) command
  - `cpt-frontx-contract-template-manifest`

- **Sequences**:
  - N/A

- **Data**:

  - N/A

### 2.12 [Two-Namespace Commands & Project/MFE Scaffolding](features/cli-scaffolding/) - HIGH

- [ ] `p1` - **ID**: `cpt-frontx-feature-cli-scaffolding`

- **Purpose**: Organize the CLI command surface into project-level and microfrontend-level namespaces sharing one resolver, and drive project and microfrontend scaffolding from those namespaces — the namespace organization being the CLI's public interface.

- **Depends On**: `cpt-frontx-feature-template-resolution`

- **Scope**:
  - Two-namespace command architecture (project-level + microfrontend-level, one shared resolver).
  - Project scaffolding.
  - Microfrontend scaffolding.

- **Out of scope**:
  - Composed-template recursion + provenance (F13).
  - Upgrade (F14).
  - Manifest validation (F11).

- **Requirements Covered**:

  - [ ] `p1` - `cpt-frontx-fr-cli-two-namespace-commands`
  - [ ] `p1` - `cpt-frontx-fr-cli-project-scaffold`
  - [ ] `p1` - `cpt-frontx-fr-cli-microfrontend-scaffold`

- **Domain Model Entities**:
  - Template

- **Design Components**:

  - [ ] `p1` - `cpt-frontx-component-cli` (shared)

- **API**:
  - `cpt-frontx-interface-cli` (command surface)

- **Sequences**:
  - N/A

- **Data**:

  - N/A

### 2.13 [Composed-Template Resolution & Project Provenance](features/composed-provenance/) - HIGH

- [ ] `p1` - **ID**: `cpt-frontx-feature-composed-provenance`

- **Purpose**: Resolve manifest-declared composed templates recursively in one operation under a defined collision rule (nearest-declaration-wins, collision reported before any write), scaffold the composition, and write each scaffolded project's provenance record (template identity + version + re-resolvable source-spec).

- **Depends On**: `cpt-frontx-feature-cli-scaffolding`, `cpt-frontx-feature-template-resolution`

- **Scope**:
  - Manifest-declared recursive composition through the shared resolver.
  - Nearest-declaration-wins collision rule + pre-write collision report.
  - Project-provenance record written at scaffold time.

- **Out of scope**:
  - Base scaffolding/namespaces (F12).
  - Install/source-spec (F10).
  - Upgrade change-set (F14).

- **Requirements Covered**:

  - [ ] `p1` - `cpt-frontx-fr-cli-composed-template-resolution`

- **Domain Model Entities**:
  - Template
  - ProjectProvenance

- **Design Components**:

  - [ ] `p1` - `cpt-frontx-component-cli` (shared)

- **API**:
  - `cpt-frontx-contract-project-provenance`

- **Sequences**:

  - [ ] `p1` - `cpt-frontx-seq-composed-project-scaffold` (OWNER)

- **Data**:

  - N/A

### 2.14 [Upgrade Change-Set Engine](features/upgrade-changeset/) - HIGH

- [ ] `p1` - **ID**: `cpt-frontx-feature-upgrade-changeset`

- **Purpose**: Provide the single CLI-owned change-set engine that computes a template-version diff against project provenance, presents it for review and approval, applies it non-destructively, and supports rollback — the one reviewable, reversible engine both direct CLI and AI orchestration drive.

- **Depends On**: `cpt-frontx-feature-composed-provenance`

- **Scope**:
  - Version-diff computation against provenance baseline.
  - Reviewable change-set presentation + explicit approval gate.
  - Non-destructive apply.
  - Rollback/reversibility.
  - Provenance update on apply.

- **Out of scope**:
  - AI orchestration/enrichment of the engine (F17).
  - Scaffolding (F12).
  - Composition (F13).

- **Requirements Covered**:

  - [ ] `p1` - `cpt-frontx-fr-cli-project-upgrade-changeset`
  - [ ] `p1` - `cpt-frontx-fr-cli-upgrade-review-approval`

- **Domain Model Entities**:
  - ProjectProvenance

- **Design Components**:

  - [ ] `p1` - `cpt-frontx-component-cli` (shared)

- **API**:
  - CLI upgrade command
  - `cpt-frontx-contract-project-provenance` (reads baseline)

- **Sequences**:
  - N/A

- **Data**:

  - N/A

### 2.15 [AI Tooling Kit Packaging & Base Content](features/ai-kit-packaging/) - HIGH

- [ ] `p1` - **ID**: `cpt-frontx-feature-ai-kit-packaging`

- **Purpose**: Ship the AI Tooling Framework as a Cypilot kit (`cyber-pilot-kit-frontx`) with a declarative manifest, every resource identifier `frontx_`-prefixed, carrying solution-agnostic base ecosystem capabilities (skills, workflows, guidelines, reference artifacts) available to agents at session start — and no solution-specific content.

- **Depends On**: None

- **Scope**:
  - Kit packaging + declarative manifest.
  - `frontx_`-prefixed resource identifiers (KIT-1).
  - Base ecosystem AI capabilities at session start.
  - Solution-agnostic base / no solution content split.
  - Install through the Cypilot CLI.

- **Out of scope**:
  - Template-extension contract + discovery/activation (F16).
  - AI upgrade orchestration (F17).

- **Requirements Covered**:

  - [ ] `p1` - `cpt-frontx-fr-ai-session-start-knowledge`
  - [ ] `p1` - `cpt-frontx-fr-ai-frontx-skills`
  - [ ] `p1` - `cpt-frontx-fr-ai-tooling-template-agnostic`

- **Design Principles Covered**:

  - [ ] `p1` - `cpt-frontx-principle-template-agnostic-tooling`

- **Design Constraints Covered**:

  - [ ] `p1` - `cpt-frontx-constraint-kit-prefixed-resource-ids`

- **Domain Model Entities**:
  - Kit

- **Design Components**:

  - [ ] `p1` - `cpt-frontx-component-ai-tooling-kit` (shared)

- **API**:
  - `cpt-frontx-interface-ai-tooling-framework`
  - `cpt-frontx-contract-kit-installation`

- **Sequences**:
  - N/A

- **Data**:

  - N/A

### 2.16 [Template AI-Extension Contract & Discovery/Activation](features/template-ai-extensions/) - HIGH

- [ ] `p1` - **ID**: `cpt-frontx-feature-template-ai-extensions`

- **Purpose**: Define the closed-set extension-bundle contract a template's AI bundle conforms to (skills, workflows, guidelines, reference artifacts as named typed slots) and the generalized scan that discovers conforming installed-template extensions and activates them into the agent-visible capability set under explicit precedence — with no manual wiring; malformed extensions reported and not activated.

- **Depends On**: `cpt-frontx-feature-ai-kit-packaging`, `cpt-frontx-feature-template-resolution`

- **Scope**:
  - Template AI-extension contract (closed category set, named typed slots, structure independent of content).
  - Discovery scan parameterized by the contract.
  - Activation/composition under precedence.
  - Structural-error reporting for malformed bundles.

- **Out of scope**:
  - Base kit packaging (F15).
  - Upgrade orchestration (F17).
  - CLI install mechanics (F10).

- **Requirements Covered**:

  - [ ] `p1` - `cpt-frontx-fr-ai-template-bundle-extensions`
  - [ ] `p1` - `cpt-frontx-fr-ai-extension-discovery-activation`

- **Domain Model Entities**:
  - AiExtension

- **Design Components**:

  - [ ] `p1` - `cpt-frontx-component-ai-tooling-kit` (shared)

- **API**:
  - N/A

- **Sequences**:

  - [ ] `p1` - `cpt-frontx-seq-template-ai-extension-discovery-activation` (OWNER)

- **Data**:

  - N/A

### 2.17 [AI-Driven Upgrade Orchestration](features/ai-upgrade-orchestration/) - HIGH

- [ ] `p1` - **ID**: `cpt-frontx-feature-ai-upgrade-orchestration`

- **Purpose**: Orchestrate AI-driven template upgrades over the single CLI change-set engine — reading project provenance, invoking and enriching the engine with change-impact analysis, review gates, and downstream-effect assessment, while applying the identical change set the direct CLI path would.

- **Depends On**: `cpt-frontx-feature-upgrade-changeset`, `cpt-frontx-feature-ai-kit-packaging`

- **Scope**:
  - AI workflow surface for template upgrades.
  - Orchestration that invokes + enriches the CLI change-set engine (analysis, review gates, downstream-impact).
  - No second engine.

- **Out of scope**:
  - The change-set engine itself (F14, CLI-owned).
  - Base kit (F15).
  - Extension discovery (F16).

- **Requirements Covered**:

  - [ ] `p1` - `cpt-frontx-fr-ai-upgrade-orchestration`

- **Domain Model Entities**:
  - ProjectProvenance
  - AiExtension

- **Design Components**:

  - [ ] `p1` - `cpt-frontx-component-ai-tooling-kit` (shared)

- **API**:
  - N/A

- **Sequences**:

  - [ ] `p1` - `cpt-frontx-seq-ai-driven-template-upgrade` (OWNER)

- **Data**:

  - N/A

## 3. Feature Dependencies

```text
F1 ecosystem-distribution        (foundation)
F2 type-substrate-port           (foundation)
   ├─→ F3 gts-type-provider
   └─→ F4 mfe-registry
          ├─→ F5 mfe-loading ──────────────┐
          ├─→ F6 mfe-host-communication     │
          ├─→ F7 extension-domain-governance (also ← F3)
          └─→ F8 mfe-isolation ←────────────┘ (← F5)
F9 api-protocol-surface          (foundation, standalone)
F10 template-resolution          (foundation)
   ├─→ F11 template-manifest
   ├─→ F12 cli-scaffolding ──→ F13 composed-provenance ──→ F14 upgrade-changeset
   └─→ F16 template-ai-extensions (also ← F15)
F15 ai-kit-packaging             (foundation)
   ├─→ F16 template-ai-extensions
   └─→ F17 ai-upgrade-orchestration (also ← F14)
```

**Dependency Rationale**:

- `cpt-frontx-feature-gts-type-provider` requires `cpt-frontx-feature-type-substrate-port`: the GTS provider implements the opaque type-substrate port the runtime defines.
- `cpt-frontx-feature-mfe-registry` requires `cpt-frontx-feature-type-substrate-port`: the registry façade is built with the type-system provider injected through the port contract.
- `cpt-frontx-feature-mfe-loading` requires `cpt-frontx-feature-mfe-registry`: on-demand loading is orchestrated from the registry.
- `cpt-frontx-feature-mfe-host-communication` requires `cpt-frontx-feature-mfe-registry`: the capability bridge delegates to the registry.
- `cpt-frontx-feature-extension-domain-governance` requires `cpt-frontx-feature-mfe-registry`: admission and mount strategies act on registry-resolved extensions.
- `cpt-frontx-feature-extension-domain-governance` requires `cpt-frontx-feature-gts-type-provider`: action–behavior consistency validation at admission uses type-of resolution from the provider.
- `cpt-frontx-feature-mfe-isolation` requires `cpt-frontx-feature-mfe-registry`: isolated mounts are driven by the registry's load orchestration.
- `cpt-frontx-feature-mfe-isolation` requires `cpt-frontx-feature-mfe-loading`: isolation wraps the load execution path.
- `cpt-frontx-feature-template-manifest` requires `cpt-frontx-feature-template-resolution`: the manifest is read at install/scaffold through the resolver.
- `cpt-frontx-feature-cli-scaffolding` requires `cpt-frontx-feature-template-resolution`: scaffolding consumes templates from the resolved inventory.
- `cpt-frontx-feature-composed-provenance` requires `cpt-frontx-feature-cli-scaffolding`: composition extends the scaffolding path.
- `cpt-frontx-feature-composed-provenance` requires `cpt-frontx-feature-template-resolution`: recursive composition resolves each composed template through the shared resolver.
- `cpt-frontx-feature-upgrade-changeset` requires `cpt-frontx-feature-composed-provenance`: the change-set diffs against the provenance record written at scaffold time.
- `cpt-frontx-feature-template-ai-extensions` requires `cpt-frontx-feature-ai-kit-packaging`: extensions activate into the base kit's capability set.
- `cpt-frontx-feature-template-ai-extensions` requires `cpt-frontx-feature-template-resolution`: discovery is triggered on template install (cross-pillar edge F16 ← F10).
- `cpt-frontx-feature-ai-upgrade-orchestration` requires `cpt-frontx-feature-upgrade-changeset`: orchestration drives the single CLI change-set engine (cross-pillar edge F17 ← F14).
- `cpt-frontx-feature-ai-upgrade-orchestration` requires `cpt-frontx-feature-ai-kit-packaging`: the orchestration workflow ships inside the base AI kit.
