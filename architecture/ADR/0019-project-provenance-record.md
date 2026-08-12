---
status: superseded
superseded_by: cpt-frontx-adr-single-project-state-file
date: 2026-06-05
---

# Per-Applied-Template Provenance for Independently Upgradeable Assembly

<!-- toc -->

- [Context and Problem Statement](#context-and-problem-statement)
- [Decision Drivers](#decision-drivers)
- [Considered Options](#considered-options)
- [Decision Outcome](#decision-outcome)
  - [Consequences](#consequences)
  - [Confirmation](#confirmation)
- [Pros and Cons of the Options](#pros-and-cons-of-the-options)
  - [A set of in-project per-applied-template records](#a-set-of-in-project-per-applied-template-records)
  - [A single whole-repository origin record](#a-single-whole-repository-origin-record)
  - [A central external provenance index](#a-central-external-provenance-index)
- [More Information](#more-information)
- [Traceability](#traceability)

<!-- /toc -->

**ID**: `cpt-frontx-adr-project-provenance-record`

## Context and Problem Statement

The CLI (`cpt-frontx-component-cli`, the `@gears-frontx/cli` package) assembles a repository from one or more independently-applied templates and, later, can upgrade each applied template to a newer version of that same template as a reviewable change set, independently of the others (`cpt-frontx-fr-cli-project-upgrade-changeset`). An upgrade can only compute what to apply for a given template if it knows what that template was applied from. Because a repository is assembled from many templates and each upgrades on its own cadence, a single whole-repository origin cannot serve — there is no one template a repository came from. The project-provenance contract (`cpt-frontx-contract-project-provenance`) requires that each applied template record which template and which template version it was applied from. What should a repository record about the origin of each applied template, and where should those records live, so that a later per-template upgrade can diff each applied template's origin against a newer version of that template?

## Decision Drivers

* **One baseline per applied template** — each applied template upgrades independently, so each needs its own recorded origin to diff against; a single shared origin cannot describe a repository assembled from many templates.
* **No single whole-repository origin** — a repository has no one originating template, so provenance must be a set of per-applied-template records, not one repository-wide record.
* **Reproducible re-resolution** — each record must be sufficient to re-resolve the exact source its template was applied from, carrying the same versioned reference shape used to acquire templates (`cpt-frontx-contract-source-spec`).
* **The boundary each template occupies** — because templates are arbitrated by the ground they own (`cpt-frontx-adr-template-ownership-boundary-declaration`), a record should capture the boundary its template occupies, so a per-template upgrade stays within that template's ground.
* **Self-contained per repository** — the records describe one repository's assembly and must travel with it, so they belong inside the repository rather than in an external index the CLI would keep in sync.
* **Minimal but sufficient** — each record should capture exactly what a per-template upgrade requires (which template, which version, which source, which boundary) and no more.

## Considered Options

* **A set of in-project per-applied-template records** — the repository carries one provenance record per applied template, each capturing that template's identity, the exact version it was applied from, the source-spec that re-resolves it, and the ownership boundary it occupies; a per-template upgrade reads the matching record to establish its diff baseline.
* **A single whole-repository origin record** — the repository carries one record naming a single originating template and version, as if the whole repository came from one template.
* **A central external provenance index** — the CLI maintains one external index mapping each repository and applied template to its origin, separate from the repositories themselves.

## Decision Outcome

Chosen option: **A set of in-project per-applied-template records**, because it is the only option that gives each independently-applied template its own reliable, self-contained origin baseline. The repository carries **one provenance record per applied template**; each record captures the template's identity, the exact version it was applied from, the source-spec that re-resolves that origin (in the shape decided by `cpt-frontx-adr-source-spec-syntax`), and the ownership boundary the template occupies. A per-template upgrade reads the record for the template being upgraded to establish its diff baseline and applies the change within that template's boundary, leaving the other applied templates and their records untouched. There is **no single whole-repository origin**: a repository assembled from several templates carries several records, one per applied template.

The single-origin record is rejected because a repository assembled from many independently-applied templates has no one originating template, and a single origin cannot support per-template independent upgrades. The central-index option introduces an external store the CLI must keep consistent with every repository and that does not travel when a repository moves; storing the records inside the repository keeps provenance self-contained. The records are written at apply time — one per template as each is applied — and the matching record is read and updated at that template's upgrade time. Each record's exact field layout and storage are owned by the provenance FEATURE (`cpt-frontx-feature-composed-provenance`) per `cpt-frontx-adr-contract-schema-ownership`, not by this decision record or DESIGN; this decision fixes what each record captures (template id, version, source-spec, occupied boundary), that there is one record per applied template with no single whole-repository origin, where the records live (inside the repository), and their write-at-apply / read-and-update-at-upgrade lifecycle.

### Consequences

* Good, because each applied template has a precise, independent origin baseline, so `cpt-frontx-fr-cli-project-upgrade-changeset` can upgrade each template on its own cadence deterministically.
* Good, because provenance is a set of self-contained records inside the repository, so it travels with the repository and never drifts out of sync with an external index.
* Good, because each record's source-spec re-resolves the exact origin of its template, reusing one versioned-reference shape across acquisition and provenance.
* Good, because recording the boundary each template occupies keeps a per-template upgrade within that template's ground.
* Bad, because a repository holds several origin records rather than one, so the CLI must locate and update the correct record for the template being upgraded.
* Bad, because a record written into the repository is a file a developer could edit or delete, so an upgrade must tolerate a missing or malformed record for a given template gracefully.

### Confirmation

Compliance is confirmed by design and code review plus an end-to-end check on the CLI: a continuous-integration test assembles a repository from two templates, asserts one in-project provenance record per applied template — each containing the template identity, the applied-from version, a re-resolvable source-spec, and the occupied boundary — then upgrades one applied template and asserts the upgrade reads and updates only that template's record while the other record is unchanged. The test also asserts that no single whole-repository origin record is written, and that an absent or malformed record for a template fails that template's upgrade with a clear, recoverable result rather than proceeding from an unknown origin.

## Pros and Cons of the Options

### A set of in-project per-applied-template records

One in-project record per applied template, each capturing its template identity, applied-from version, source-spec, and occupied boundary; read per template at upgrade.

* Good, because each applied template has its own precise, independent upgrade baseline.
* Good, because the record set is self-contained and travels with the repository.
* Good, because each record re-resolves its template's exact origin and names the ground it occupies.
* Neutral, because the exact field layout is owned by the provenance FEATURE (`cpt-frontx-feature-composed-provenance`) rather than fixed here.
* Bad, because the CLI must locate the correct record among several and handle a missing or malformed one.

### A single whole-repository origin record

One record names a single originating template and version for the whole repository.

* Good, because there is exactly one record to write and read.
* Bad, because a repository assembled from many templates has no single originating template, so the record cannot describe it.
* Bad, because it cannot support upgrading each applied template independently, failing the one-baseline-per-template driver.

### A central external provenance index

The CLI keeps one external index mapping each repository and applied template to its origin.

* Good, because all provenance is queryable in one place.
* Good, because the repositories themselves carry no extra files.
* Bad, because the index must be kept consistent with every repository and does not travel when a repository moves or is shared.
* Bad, because a repository separated from the index loses its origin entirely.

## More Information

This decision fixes what each provenance record captures, that there is one per applied template, and where they live at decision altitude; the exact field layout and storage belong to the owning FEATURE `cpt-frontx-feature-composed-provenance`, per `cpt-frontx-adr-contract-schema-ownership`, and not to this decision record or DESIGN. The source-spec shape a record stores is decided in `cpt-frontx-adr-source-spec-syntax`; the ownership boundary a record captures is shaped by `cpt-frontx-adr-template-ownership-boundary-declaration`; the per-template upgrade that reads and updates a record is decided in `cpt-frontx-adr-project-upgrade-mechanism`. These are non-binding pointers and do not form part of this decision's durable identity.

Integration analysis (**INT**): provenance is a library-provided internal contract (`cpt-frontx-contract-project-provenance`) — one record written per applied template by the apply operation and read and updated by that template's upgrade operation, both within the CLI; it names no external party. Its producer is apply; its consumer is upgrade. Version-compatibility intent is forward-looking: provenance records remain readable across versions, and each record's shape evolves additively so that records written by an earlier apply remain readable by a later upgrade; any change to the shape that is not backward-compatible follows the platform evolvability requirement.

Applicability of the remaining checklist categories: **PERF** — Not applicable, because writing and reading small per-template records has no throughput or latency budget at decision altitude. **SEC** — Not applicable, because a record holds a template identity, version, public source reference, and declared boundary, not secret material. **REL** — Not applicable, because there is no service availability target for local files; graceful handling of an absent record is covered under Confirmation. **DATA** — Not applicable as a complete schema, because the exact field layout is owned by `cpt-frontx-feature-composed-provenance` per `cpt-frontx-adr-contract-schema-ownership`; this decision fixes only the captured categories and the one-record-per-applied-template rule. **OPS** — Not applicable, because no operational procedure attaches to in-project records. **MAINT** — addressed: self-contained, minimal per-template records keep upgrade logic simple and resilient to repository relocation. **UX** — addressed implicitly: a developer can read each applied template's origin directly from the repository. **BIZ** — Not applicable, because product requirements live in the PRD and are cited here by ID.

## Traceability

- **PRD**: [PRD.md](../PRD.md)
- **DESIGN**: [DESIGN.md](../DESIGN.md)

This decision directly addresses the following requirements and design elements:

* `cpt-frontx-contract-project-provenance` — This decision fixes what each provenance record captures (template id, version, source-spec, occupied boundary), that a repository carries one record per applied template with no single whole-repository origin, and their write-at-apply / read-and-update-at-upgrade lifecycle.
* `cpt-frontx-fr-cli-project-upgrade-changeset` — Each per-applied-template provenance record is the origin baseline the matching per-template upgrade diffs against, which is what lets each applied template upgrade independently and reviewably.
