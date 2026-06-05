---
status: proposed
date: 2026-06-05
---

# Template Manifest as the Published Conformance Contract

<!-- toc -->

- [Context and Problem Statement](#context-and-problem-statement)
- [Decision Drivers](#decision-drivers)
- [Considered Options](#considered-options)
- [Decision Outcome](#decision-outcome)
  - [Consequences](#consequences)
  - [Confirmation](#confirmation)
- [Pros and Cons of the Options](#pros-and-cons-of-the-options)
  - [A single published manifest as the conformance contract](#a-single-published-manifest-as-the-conformance-contract)
  - [Convention-over-manifest structural inference](#convention-over-manifest-structural-inference)
  - [Per-command ad-hoc descriptors](#per-command-ad-hoc-descriptors)
- [More Information](#more-information)
- [Traceability](#traceability)

<!-- /toc -->

**ID**: `cpt-frontx-adr-template-manifest-contract`

## Context and Problem Statement

The CLI (`cpt-frontx-component-cli`, the `@cyberfabric/cli` package) installs, validates, and scaffolds from templates it does not own, authored and published by separate teams. For the command surface to operate on a template it has never seen, the template must describe itself in a defined, machine-readable shape that the CLI can both check at publication time and read at install and scaffold time. The template-manifest contract (`cpt-frontx-contract-template-manifest`) requires every template to publish such a manifest and is produced when a template is validated for publication and consumed when a template is installed or scaffolded. What shape should that manifest take, and what should it declare, so that a single contract lets the CLI validate a template before publication and resolve its composition at scaffold time without coupling the command surface to any specific template?

## Decision Drivers

* **Self-description for an unknown template** — the CLI owns no template, so a template must declare its own identity, version, and structure in a form the CLI can read generically rather than the CLI hard-coding knowledge of any template.
* **One contract for produce and consume** — the same manifest is checked at pre-publish validation (`cpt-frontx-fr-cli-template-validate-prepublish`) and read at install and scaffold; a single defined shape avoids two divergent descriptions of the same template.
* **Composition declaration** — a project template can reference microfrontend templates; the manifest must declare those referenced compositions so composed resolution has an authoritative source to read.
* **Versioned, evolvable shape** — the manifest shape must be versioned so that the contract can evolve while older published templates remain readable, consistent with the platform evolvability requirement.
* **Pre-publish checkability** — the shape must be checkable in isolation, before publication, so a structurally malformed template is caught by its author rather than by a consumer.

## Considered Options

* **A single published manifest as the conformance contract** — every template publishes one manifest, in a defined and versioned shape, declaring the template's identity, version, kind, and any referenced microfrontend-template compositions; the CLI produces a pass/fail check against this shape at pre-publish validation and reads the same manifest at install and scaffold.
* **Convention-over-manifest structural inference** — the CLI infers a template's identity, kind, and composition from file-layout conventions and naming, with no published descriptor.
* **Per-command ad-hoc descriptors** — each command (validate, install, scaffold) reads its own purpose-built descriptor file, so a template carries several partial descriptions rather than one.

## Decision Outcome

Chosen option: **A single published manifest as the conformance contract**, because it is the only option that serves the produce-and-consume driver with one authoritative description: the same defined, versioned shape is the target of pre-publish validation and the source of install-time and scaffold-time resolution, so a template describes itself once and every command reads that one description. The manifest declares the template's identity, its version, its kind (project template or microfrontend template), and the microfrontend-template compositions a project template references, which gives composed resolution an authoritative declaration to read. The convention-inference option couples the CLI to brittle layout heuristics and offers nothing concrete to validate before publication; the per-command-descriptor option fragments one description into several that can drift out of agreement.

The manifest is the conformance contract a template MUST satisfy to be publishable: pre-publish validation checks a candidate template against the manifest shape and reports a structural pass or fail, and install and scaffold read the published manifest to learn what the template is and what it composes. The manifest shape is versioned so the contract can evolve while previously published manifests remain readable. The concrete field-by-field schema is a design-document concern and is not fixed here; this decision fixes the manifest's role, the categories of information it declares (identity, version, kind, declared compositions), and its produce-once / consume-many lifecycle.

### Consequences

* Good, because one authoritative self-description serves validation, install, and scaffold, so a template is described once and never inconsistently across commands.
* Good, because the CLI operates on any conforming template generically, reading the manifest rather than embedding knowledge of specific templates, reinforcing the command surface's independence from content.
* Good, because declared compositions give composed resolution an authoritative source to read instead of inferring structure.
* Good, because a versioned shape lets the contract evolve while older published manifests remain readable.
* Bad, because every template author must author and maintain a conforming manifest, adding an authoring obligation that pure convention-inference would avoid.
* Bad, because the manifest shape becomes a contract whose evolution must be governed for compatibility, adding contract-stewardship overhead.

### Confirmation

Compliance is confirmed by the pre-publish validation command itself acting as the contract check: a continuous-integration step runs pre-publish validation against a candidate template and fails the build if the template's manifest does not conform to the published shape (`cpt-frontx-fr-cli-template-validate-prepublish`). Design and code review additionally confirm that install and scaffold read the same manifest shape that validation checks — one shape, one contract — and that no command embeds template-specific knowledge that the manifest is meant to carry.

## Pros and Cons of the Options

### A single published manifest as the conformance contract

Every template publishes one defined, versioned manifest declaring identity, version, kind, and referenced compositions; validated at pre-publish and read at install and scaffold.

* Good, because one description is the single source for validation, install, and scaffold.
* Good, because the CLI reads any conforming template generically without template-specific code.
* Good, because declared compositions give composed resolution an authoritative source.
* Neutral, because the concrete field schema is deferred to the design document rather than fixed in the contract.
* Bad, because template authors must author and maintain a conforming manifest.

### Convention-over-manifest structural inference

The CLI infers identity, kind, and composition from file-layout conventions and naming, with no published descriptor.

* Good, because template authors write no descriptor.
* Good, because there is no manifest shape to version.
* Bad, because the CLI is coupled to brittle layout heuristics that a template can break silently.
* Bad, because there is nothing concrete to validate before publication, failing the pre-publish-checkability driver.

### Per-command ad-hoc descriptors

Each command reads its own purpose-built descriptor file, so a template carries several partial descriptions.

* Good, because each descriptor is shaped exactly for its command.
* Bad, because several descriptions of one template can drift out of agreement.
* Bad, because there is no single conformance contract to validate or to evolve coherently.

## More Information

This decision fixes the manifest's role and the categories it declares at decision altitude only; the complete field-by-field manifest schema belongs to the DESIGN document, not to this decision record. The compositions a manifest declares are resolved at scaffold time by the composed-resolution decision (`cpt-frontx-adr-composed-template-resolution`); the manifest is the authoritative declaration that decision reads. The pre-publish validation requirement is `cpt-frontx-fr-cli-template-validate-prepublish`. These are non-binding pointers and do not form part of this decision's durable identity.

Integration analysis (**INT**): the manifest is a bidirectional internal contract (`cpt-frontx-contract-template-manifest`) between templates and the CLI — produced when a template is validated for publication, consumed when a template is installed or scaffolded. Its producer is the template author (through pre-publish validation); its consumers are the install and scaffold commands and composed resolution. Version-compatibility intent is forward-looking: the manifest shape is versioned so the contract can evolve while previously published manifests stay readable; any change to the shape that is not backward-compatible follows the platform evolvability requirement. The contract names no external party; it is internal between templates and the command surface.

Applicability of the remaining checklist categories: **PERF** — Not applicable, because reading a per-template manifest has no throughput or latency budget at decision altitude. **SEC** — Not applicable, because the manifest carries descriptive structure, not secret material or an authentication surface. **REL** — Not applicable, because there is no service availability target for a local manifest read. **DATA** — addressed by deliberate omission: this decision fixes the manifest's categories of information but does NOT define a complete schema; the full schema is a DESIGN concern. **OPS** — Not applicable, because no operational procedure attaches to a manifest contract. **MAINT** — addressed: one versioned contract governs how every template describes itself, concentrating evolution in one place. **UX** — addressed implicitly: authors get a single descriptor to maintain and a single pre-publish check. **BIZ** — Not applicable, because product requirements live in the PRD and are cited here by ID.

## Traceability

- **PRD**: [PRD.md](../PRD.md)
- **DESIGN**: [DESIGN.md](../DESIGN.md)

This decision directly addresses the following requirements and design elements:

* `cpt-frontx-contract-template-manifest` — This decision fixes the role, declared categories, and produce-once / consume-many lifecycle of the manifest contract every template conforms to.
* `cpt-frontx-fr-cli-template-validate-prepublish` — Pre-publish validation is defined here as the conformance check of a candidate template against the published manifest shape.
