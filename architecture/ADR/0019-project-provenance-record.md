---
status: proposed
date: 2026-06-05
---

# Project Provenance Record for Upgradeable Scaffolding

<!-- toc -->

- [Context and Problem Statement](#context-and-problem-statement)
- [Decision Drivers](#decision-drivers)
- [Considered Options](#considered-options)
- [Decision Outcome](#decision-outcome)
  - [Consequences](#consequences)
  - [Confirmation](#confirmation)
- [Pros and Cons of the Options](#pros-and-cons-of-the-options)
  - [An in-project provenance record capturing template identity, version, and source-spec](#an-in-project-provenance-record-capturing-template-identity-version-and-source-spec)
  - [A central external provenance index](#a-central-external-provenance-index)
  - [No recorded provenance; infer origin at upgrade time](#no-recorded-provenance-infer-origin-at-upgrade-time)
- [More Information](#more-information)
- [Traceability](#traceability)

<!-- /toc -->

**ID**: `cpt-frontx-adr-project-provenance-record`

## Context and Problem Statement

The CLI (`cpt-frontx-component-cli`, the `@cyberfabric/cli` package) scaffolds a project from a template and, later, can upgrade that project to a newer version of the same template as a reviewable change set (`cpt-frontx-fr-cli-project-upgrade-changeset`). An upgrade can only compute what to apply if it knows what the project was scaffolded from. The project-provenance contract (`cpt-frontx-contract-project-provenance`) requires that each scaffolded project record which template and which template version it originated from. What should a scaffolded project record about its origin, and where should that record live, so that a later upgrade can diff the project's origin against a newer template version?

## Decision Drivers

* **Upgrade needs an origin baseline** — an upgrade diffs a project against the template version it came from; without a recorded origin there is no baseline to diff against, so origin must be captured at scaffold time.
* **Reproducible re-resolution** — the recorded origin must be sufficient to re-resolve the exact source the project came from, which means it must carry the same versioned reference shape used to acquire templates (`cpt-frontx-contract-source-spec`).
* **Self-contained per project** — provenance describes one project's origin and must travel with that project, so the record belongs inside the scaffolded project rather than in any external index the CLI would have to keep in sync.
* **Durable and human-readable** — the record must remain readable across versions and legible to a developer reviewing what a project was built from, consistent with the platform evolvability requirement.
* **Minimal but sufficient** — the record should capture exactly what an upgrade requires (which template, which version, which source) and no more, so it stays a small, stable origin descriptor rather than a mirror of the template.

## Considered Options

* **An in-project provenance record capturing template identity, version, and source-spec** — each scaffolded project carries a small provenance record, stored inside the project, that captures the template's identity, the exact template version it was scaffolded from, and the source-spec that resolves it, so an upgrade reads the record to establish its diff baseline.
* **A central external provenance index** — the CLI maintains a single external index mapping each scaffolded project to its origin, separate from the projects themselves.
* **No recorded provenance; infer origin at upgrade time** — the project records nothing; an upgrade asks the developer to name the template and version, or infers origin from project contents.

## Decision Outcome

Chosen option: **An in-project provenance record capturing template identity, version, and source-spec**, because it is the only option that gives an upgrade a reliable, self-contained origin baseline that travels with the project. The record captures the template's identity, the exact template version the project was scaffolded from, and the source-spec that re-resolves that origin — exactly the information an upgrade needs to diff the project's origin against a newer template version and apply the difference as a reviewable change set. Storing the record inside the project keeps provenance self-contained, so the origin is never lost or out of sync with an external index. The central-index option introduces an external store the CLI must keep consistent with every project and that does not travel when a project moves; the no-provenance option pushes origin reconstruction onto the developer or onto fragile inference, defeating reproducible upgrades.

The provenance record is written at scaffold time and read at upgrade time. It carries the template identity, the scaffolded-from template version, and the source-spec (in the shape decided by `cpt-frontx-adr-source-spec-syntax`) sufficient to re-resolve the origin. The record's exact field layout and storage filename are design-document concerns; this decision fixes what the record captures (template id, version, source-spec), where it lives (inside the scaffolded project), and its write-at-scaffold / read-at-upgrade lifecycle.

### Consequences

* Good, because an upgrade always has a precise origin baseline to diff against, making `cpt-frontx-fr-cli-project-upgrade-changeset` deterministic rather than dependent on developer recall.
* Good, because provenance travels inside the project, so it is never lost when a project is copied or moved and never drifts out of sync with an external index.
* Good, because the recorded source-spec re-resolves the exact origin, reusing one versioned-reference shape across acquisition and provenance.
* Bad, because a record written into the project is a file a developer could edit or delete, so an upgrade must tolerate a missing or malformed record gracefully.
* Bad, because every scaffolded project carries an extra origin file that a no-provenance approach would not produce.

### Confirmation

Compliance is confirmed by design and code review plus an end-to-end check on the CLI: a continuous-integration test scaffolds a project, asserts that an in-project provenance record is present and contains the template identity, the scaffolded-from version, and a re-resolvable source-spec, then runs an upgrade and asserts that the upgrade reads that record to establish its diff baseline. The test also asserts that an absent or malformed record fails the upgrade with a clear, recoverable result rather than proceeding from an unknown origin.

## Pros and Cons of the Options

### An in-project provenance record capturing template identity, version, and source-spec

Each scaffolded project carries a small in-project record of its template identity, scaffolded-from version, and source-spec, read by upgrade to establish a diff baseline.

* Good, because the upgrade baseline is precise and always available.
* Good, because provenance is self-contained and travels with the project.
* Good, because the recorded source-spec re-resolves the exact origin using one reference shape.
* Neutral, because the exact field layout is deferred to the design document.
* Bad, because an in-project file can be edited or deleted, so upgrade must handle a missing or malformed record.

### A central external provenance index

The CLI keeps one external index mapping each scaffolded project to its origin, separate from the projects.

* Good, because all provenance is queryable in one place.
* Good, because the projects themselves carry no extra file.
* Bad, because the index must be kept consistent with every project and does not travel when a project moves or is shared.
* Bad, because a project separated from the index loses its origin entirely.

### No recorded provenance; infer origin at upgrade time

The project records nothing; upgrade asks the developer or infers origin from contents.

* Good, because scaffolding writes no extra file.
* Bad, because the upgrade baseline depends on developer recall or fragile inference, failing the origin-baseline driver.
* Bad, because reproducible, non-destructive upgrades become unreliable without a known origin.

## More Information

This decision fixes what provenance captures and where it lives at decision altitude; the exact field layout and storage filename belong to the DESIGN document. The source-spec shape the record stores is decided in `cpt-frontx-adr-source-spec-syntax`; the upgrade that reads the record and applies a change set is decided in `cpt-frontx-adr-upgrade-changeset-engine`. These are non-binding pointers and do not form part of this decision's durable identity.

Integration analysis (**INT**): provenance is a library-provided internal contract (`cpt-frontx-contract-project-provenance`) — written by the scaffold operation and read by the upgrade operation, both within the CLI; it names no external party. Its producer is scaffold; its consumer is upgrade. Version-compatibility intent is forward-looking: provenance records remain readable across versions, and the record's shape evolves additively so that records written by an earlier scaffold remain readable by a later upgrade; any change to the shape that is not backward-compatible follows the platform evolvability requirement.

Applicability of the remaining checklist categories: **PERF** — Not applicable, because writing and reading one small per-project record has no throughput or latency budget at decision altitude. **SEC** — Not applicable, because the record holds a template identity, version, and public source reference, not secret material. **REL** — Not applicable, because there is no service availability target for a local file; graceful handling of an absent record is covered under Confirmation. **DATA** — Not applicable as a complete schema, because the exact field layout is deferred to DESIGN; this decision fixes only the captured categories. **OPS** — Not applicable, because no operational procedure attaches to an in-project record. **MAINT** — addressed: a self-contained, minimal origin record keeps upgrade logic simple and resilient to project relocation. **UX** — addressed implicitly: a developer can read a project's origin directly from the project. **BIZ** — Not applicable, because product requirements live in the PRD and are cited here by ID.

## Traceability

- **PRD**: [PRD.md](../PRD.md)
- **DESIGN**: [DESIGN.md](../DESIGN.md)

This decision directly addresses the following requirements and design elements:

* `cpt-frontx-contract-project-provenance` — This decision fixes what the provenance record captures (template id, version, source-spec), where it is stored (inside the scaffolded project), and its write-at-scaffold / read-at-upgrade lifecycle.
* `cpt-frontx-fr-cli-project-upgrade-changeset` — The provenance record is the origin baseline an upgrade diffs against, which is what makes a reviewable, non-destructive upgrade possible.
