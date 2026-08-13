---
status: accepted
date: 2026-08-12
---

# A Thin Manifest Where Description Carries All Selection and Usage Semantics

<!-- toc -->

- [Context and Problem Statement](#context-and-problem-statement)
- [Decision Drivers](#decision-drivers)
- [Considered Options](#considered-options)
- [Decision Outcome](#decision-outcome)
  - [Consequences](#consequences)
  - [Confirmation](#confirmation)
- [Pros and Cons of the Options](#pros-and-cons-of-the-options)
  - [Keep the five-category manifest from ADR 0018](#keep-the-five-category-manifest-from-adr-0018)
  - [A thin manifest plus a structured post-instantiation field](#a-thin-manifest-plus-a-structured-post-instantiation-field)
  - [A thin manifest where `description` carries all semantics](#a-thin-manifest-where-description-carries-all-semantics)
- [More Information](#more-information)
- [Traceability](#traceability)

<!-- /toc -->

**ID**: `cpt-frontx-adr-thin-template-manifest`

## Context and Problem Statement

The CLI (`cpt-frontx-component-cli`, the `@gears-frontx/cli` package) requires every template to publish a manifest conforming to the template-manifest contract (`cpt-frontx-contract-template-manifest`). The five-category shape fixed by `cpt-frontx-adr-template-manifest-contract` (ADR 0018) had a template declare its identity, its version, the boundaries of what it owns (exclusive subtrees plus shared-file regions with merge strategies), any other templates it references to be applied together as a preset, and a description of what it establishes. A design session revisited this shape against the template-registration redesign and found it heavier than the mechanism it serves: a template that owns its entire target needs no per-subtree exclusivity taxonomy, no shared-file merge machinery, and no self-declared composition list once composition is driven explicitly rather than inferred from a template's own references. The session also found that `description` — already the field a caller with no reference selects a template by — was the natural place to carry a second kind of semantics the old shape had no field for at all: instructions for how a template should be *used* once selected (for example, that it is applied once per unique target and later projects import from it rather than reapplying it). What should the manifest declare, and what should carry post-selection usage semantics, so that a template that owns its whole target self-describes with the least surface an author must maintain and the least surface the CLI must validate?

## Decision Drivers

* **Total ownership needs no boundary taxonomy** — the project-level ownership model computed for a repository (`cpt-frontx-fr-cli-template-boundary-declaration`) now derives a template's owned ground algorithmically as its entire target minus a small set of exclusions, so a manifest field enumerating exclusive subtrees and shared-file regions with merge strategies has nothing left to add once the template owns everything it does not explicitly exclude.
* **One semantic carrier, not two** — `description` already serves selection (`cpt-frontx-feature-template-manifest` matches a caller's intent against manifest-declared descriptions); introducing a second structured field for post-instantiation usage semantics would split one concern (what an AI or human needs to know about a template) across two places that could drift out of agreement.
* **Composition is explicit, not self-declared** — where the retired composed-template-resolution requirement (removed from the PRD together with `cpt-frontx-adr-composed-template-resolution`, its superseded decision record) previously let a template's manifest name the other templates it composes with, the redesigned assembly flow drives composition from the caller's explicit application of each template, so a manifest field for referenced templates no longer has a consumer.
* **Least authoring and validation surface** — every field a template author must populate is also a field pre-publish validation (`cpt-frontx-fr-cli-template-validate-prepublish`) must check and every field a consumer must be prepared to read; a manifest with four required fields is cheaper to author correctly and cheaper to validate exhaustively than one with five categories, some themselves internally structured.
* **Legacy manifests must not leak into the current type** — templates already published under the ADR 0018 shape exist and must remain installable; their fields must not appear in the manifest type every command reads, so a narrowed current shape needs an isolated migration path rather than a superset type carrying both eras' fields.

## Considered Options

* **Keep the five-category manifest from ADR 0018** — identity, version, ownership boundaries (exclusive subtrees and shared-file regions), referenced templates, and an optional description remain as published.
* **A thin manifest plus a structured post-instantiation field** — narrow ownership to a single exclusion list and drop referenced templates as in the chosen option, but add a new structured field (e.g. `usage` or `aiCapabilities`) dedicated to post-instantiation instructions for an AI agent or human, separate from `description`.
* **A thin manifest where `description` carries all semantics** — declare exactly `name`, `version`, a required non-empty `description`, and `ownership.excludedSubtrees`; `description` is the sole carrier of both selection semantics and any post-instantiation usage semantics (such as apply-once-then-import), with no dedicated structured field for the latter.

## Decision Outcome

Chosen option: **A thin manifest where `description` carries all semantics**, because it is the only option that both retires the ownership and composition categories the redesigned assembly and ownership mechanics no longer consume, and avoids introducing a second semantic channel that competes with `description` for the same audience. The manifest declares exactly four things: `name`, `version`, a required non-empty `description`, and `ownership.excludedSubtrees` — the points within the template's target where another template is permitted to nest. A template's effective ownership is now computed algorithmically as its entire target minus its declared `excludedSubtrees` (and minus the small set of project-level exclusions the ownership FEATURE also subtracts), so the manifest need declare only the one list that carries information the algorithm cannot derive on its own. `referencedTemplates`, `sharedFiles` with its merge strategies and region markers, `exclusiveSubtrees`, and `schemaVersion` are removed from the contract: composition is now performed by explicit application of each template rather than by one template naming the others it composes with, and total ownership by exclusion removes any need for a category distinguishing exclusive from shared ground. `description` is the sole carrier of semantics for both an AI agent and a human — what the template is, when to choose it, and how to use it once applied, including any apply-once-then-import discipline a template requires. A second structured field for the latter would duplicate the same audience's concern in two places that could disagree. The middle option (a dedicated `usage`/`aiCapabilities` field) was rejected on exactly this ground, and because it re-inflates the manifest the simplification is meant to shrink.

`name` is the template's identity and carries two rules this contract fixes directly, because they are consumed everywhere identity is used — as a content-path segment, a registration key, and a conflict-check key — and must therefore live in exactly one place rather than being restated by every ADR that relies on identity: **uniqueness** (once several templates can share one source repository, nothing but the manifest's own declared `name` distinguishes them, so `name` must be unique among templates a project can register) and a **character prohibition** on `:`, `\`, and control characters (each carries a platform-dependent meaning — `:` designates a Windows drive, `\` is a path separator on one platform and an ordinary character on the other, and a control character can make a platform path API throw), because `name` is resolved into filesystem and command-line positions the same way a source-spec's subtree segment is. This is the one living statement of both rules; other decisions that depend on template identity (`cpt-frontx-adr-template-registration-and-origin-pinning`, ADR 0040, among them) point back here rather than restating them.

`/` is permitted as a path-segment separator in `name` (npm-scoped package names such as `@gears-frontx/frontx-template-shell` are expected, and both templates this ecosystem itself publishes already use it); a name containing `/` resolves to a multi-segment bundle root under `.frontx/ai/<manifest-name>/` rather than a single path component. Permitting `/` carries two invariants the uniqueness rule above already exists to enforce, stated here at the segment level rather than left implicit: (a) **bundle-root prefix-uniqueness** — no registered name may be a segment-wise prefix of another registered name (`a` and `a/b` collide and are refused by the same uniqueness check this decision already fixes, not a second rule); (b) **non-empty segments** — every `/`-delimited segment must be non-empty and must not be `.` or `..`, so a leading, trailing, or doubled `/` is malformed and rejected at pre-publish validation the same way a bare `..` segment already is. This per-segment geometry is consistent with, and does not loosen, the ancestor/descendant containment rule `cpt-frontx-adr-nesting-aware-conflict-prevention` fixes for targets: a multi-segment bundle root is checked the same way any other nested path is.

A manifest published under the retired ADR 0018 shape is distinguished from a current one by a concrete discriminator: the **presence of any retired field** — `schemaVersion`, `ownershipBoundaries` (or its `exclusiveSubtrees`/`sharedFiles` children), or `referencedTemplates` — marks a manifest as legacy. A legacy manifest is read only through an isolated migration path that produces the current four-field shape when both hold — its retired `exclusiveSubtrees`/`sharedFiles` translate losslessly into `ownership.excludedSubtrees` (they were already effectively whole-target) and it carries a usable, non-empty description — or fails validation naming whichever of the two does not hold; the retired fields never appear on the primary manifest type any command reads. The generic path is retained for this whole-target-already legacy shape even though it is a narrower case than ADR 0018 admitted, because the boundary-narrowing category it retires was itself an advanced feature only a host/guest-composing template needed to use — a legacy manifest that never opted into it, the plausible common case among third-party templates this repository does not control, still migrates cleanly.

### Consequences

* Good, because a template author populates and maintains four fields instead of five categories, some themselves internally structured, lowering the authoring and review burden the pre-publish validation contract enforces.
* Good, because ownership becomes a single algorithmic rule — the whole target minus declared exclusions minus project-level exclusions — giving the assembly conflict check one total definition of owned ground instead of reconciling separate exclusive-subtree and shared-file categories.
* Good, because selection and usage semantics live in exactly one field, so an AI agent or human reads one piece of prose per template rather than cross-referencing a structured field against free-text description for a possibly inconsistent story.
* Good, because retiring `referencedTemplates` removes a manifest-level composition declaration that the redesigned, explicitly-driven assembly flow no longer reads, so the manifest no longer states something the CLI does not consult.
* Bad, because a template that must cooperatively edit ground outside its own target — a CI, router, or end-to-end template touching a shared root file — has no manifest vocabulary left to declare that cooperation; under the redesigned ownership model this remains a conflict by design, and resolving it stays outside template application, in the caller's hands, an open risk carried forward rather than closed by this decision.
* Bad, because nothing machine-checks that a template's free-text `description` correctly states its usage discipline (for example, that it must be applied once per unique target); pre-publish validation confirms only that the field is present and non-empty, not that its content is accurate — a gap this decision leaves for a possible future semantic-checking capability rather than closing itself.
* Bad, because a manifest published under the retired ADR 0018 shape is not directly readable by the current type; supporting it requires an isolated migration read path, adding a small amount of permanent compatibility surface at the boundary between eras.
* Bad, because this decision revokes the guarantee ADR 0018 made when it left `description` optional specifically "so that manifests published before it was declared stay conforming and installable": a legacy manifest with no `description` still reads through the migration path for `install` (nothing here blocks reading it), but can never be `register`ed, because registration fail-closes on a missing or empty `description`. A previously "installable" manifest that carries no description is therefore not fully usable under the current model until its author adds one; ADR 0018's own installability guarantee holds only up to the boundary this decision draws at `register` — for this missing-description case specifically. The next consequence draws that boundary earlier still, at `install` itself, for a legacy manifest whose retired ownership cannot be translated at all.
* Bad, because the retired `exclusiveSubtrees`/`sharedFiles` categories have no faithful translation into `ownership.excludedSubtrees` when they named a genuine proper subset of a legacy template's target — a whitelist narrower than the whole target has no blacklist equivalent that reproduces it, since the current model's only ownership vocabulary is "whole target minus these exclusions," and no exclusion list expresses a claim *narrower* than whole-target. The migration path this decision requires therefore cannot honestly widen such a manifest's effective ownership to its entire target on the strength of an inexact translation; it refuses instead, directing the author to convert the template manually with a deliberately chosen `excludedSubtrees`. A legacy manifest whose retired categories were already effectively whole-target (empty or `["."]` `exclusiveSubtrees`, empty `sharedFiles`) is unaffected — that translation is exact — but a legacy manifest that genuinely narrowed its claim, such as a whitelist of specific paths, cannot be auto-migrated at all until its author performs that conversion.

### Confirmation

Compliance is confirmed by the pre-publish validation command itself: a continuous-integration step runs pre-publish validation against a candidate template and fails the build unless the manifest declares exactly `name`, `version`, a non-empty `description`, and `ownership.excludedSubtrees`, and passes if a manifest declaring `referencedTemplates`, `sharedFiles`, `exclusiveSubtrees`, or `schemaVersion` is rejected as non-conforming to the current shape. Design and code review additionally confirm that the primary manifest type carries no field from the retired shape, that a legacy manifest — discriminated by the presence of any retired field — is read only through an isolated migration function whose output is the current four-field shape, and that no command surface (install, apply, assemble, or list) reads a retired field from the primary type. A further fixture registers two candidate templates declaring the same `name` and asserts the second is refused for the collision, and a companion fixture asserts a manifest declaring `:`, `\`, or a control character anywhere in `name` fails pre-publish validation. A last fixture installs a legacy manifest with no `description` and confirms `install` succeeds while `register` refuses it until a `description` is added. Two further fixtures confirm the migration path's ownership fidelity: a legacy manifest whose retired `exclusiveSubtrees` is absent, empty, or exactly `["."]`, and whose `sharedFiles` is empty, migrates to an empty `ownership.excludedSubtrees` and registers cleanly; a legacy manifest whose retired `exclusiveSubtrees` names a genuine proper subset of its target — the shape a pre-conversion `template-shell` manifest actually had — is refused with `INVALID_MANIFEST` rather than migrated into a silently widened, un-nestable whole-target claim.

## Pros and Cons of the Options

### Keep the five-category manifest from ADR 0018

Retain identity, version, ownership boundaries (exclusive subtrees and shared-file regions with merge strategies), referenced templates, and an optional description exactly as ADR 0018 fixed them.

* Good, because no published template's manifest needs to change.
* Good, because shared-file regions with merge strategies give templates that must cooperatively edit common ground a declared mechanism, rather than leaving that case an unresolved conflict.
* Bad, because the ownership category duplicates what the redesigned algorithmic ownership model (whole target minus exclusions) already computes, so exclusive-subtree declarations carry no information the algorithm needs.
* Bad, because `referencedTemplates` names a composition path the redesigned, explicitly-driven assembly flow does not read, so the field states something no consumer consults.
* Bad, because five categories, some internally structured, are more surface for an author to populate correctly and for validation to check exhaustively than the redesign requires.

### A thin manifest plus a structured post-instantiation field

Narrow ownership and drop referenced templates as in the chosen option, but add a dedicated structured field for post-instantiation usage instructions, separate from `description`.

* Good, because a structured field is more directly machine-parseable for an AI agent than free-text `description`, if a future consumer needs to branch on specific usage properties.
* Neutral, because it still removes the ownership and composition categories the chosen option removes.
* Bad, because it splits one audience's concern — what a template is and how to use it — across two fields that must be kept mutually consistent, exactly the divergence risk `description`-as-sole-carrier avoids.
* Bad, because it re-inflates the manifest the simplification is meant to shrink, adding a new field and its own validation rules in the same decision that removes others.

### A thin manifest where `description` carries all semantics

Declare exactly `name`, `version`, a required non-empty `description`, and `ownership.excludedSubtrees`; `description` alone carries selection semantics and any post-instantiation usage semantics.

* Good, because one field serves one audience for both purposes selection and usage, with nothing to keep in sync.
* Good, because the manifest shrinks to the minimum the redesigned ownership and composition mechanics still require.
* Neutral, because semantic correctness of what `description` states is not machine-checked; it remains, as before this decision, a matter for the AI agent or human choosing and applying the template, not the CLI.
* Bad, because a template with a usage discipline it needs enforced (not merely stated) has no stronger mechanism than prose to rely on.

## More Information

This record **supersedes** `cpt-frontx-adr-template-manifest-contract` (ADR 0018): the categories ADR 0018 fixed — ownership boundaries as exclusive subtrees plus shared-file regions, and referenced templates for preset composition — are retired from the manifest contract by this decision, and `description` changes from optional to required and non-empty.

A template's **payload** — the content `apply` materializes into a target — is everything in the template's directory except two things: the manifest file itself (`frontx-template.json`) and, when present, the conventional `.frontx/ai/<manifest-name>/` bundle that the CLI, not `apply`'s ownership-governed write, materializes into the project as a separate CLI-owned step (`cpt-frontx-adr-whole-target-ownership`). Nothing else is excluded: an authoring or development harness — a dev-only `package.json` with `file:` overrides, local build tooling, or any other scaffolding an author needs to iterate on the template itself — does not live inside the template's own directory, precisely because the payload definition here draws no boundary for it to sit outside of; a harness inside the template directory would be payload, and would therefore be delivered to every project the template is applied to. This is the definition self-containment iterates over; the concrete schema for expressing it remains owned by `cpt-frontx-feature-template-manifest`, per `cpt-frontx-adr-contract-schema-ownership`.

This decision's ADR number continues the sequence after a gap: ADR numbers 0033 and 0034 are not missing by accident, they were assigned to parallel work landing separately (PR #560) and are not part of this decision sequence.

This decision governs the manifest's declared categories only, at decision altitude; the manifest's complete field-by-field schema remains owned by the manifest FEATURE (`cpt-frontx-feature-template-manifest`), per `cpt-frontx-adr-contract-schema-ownership`, and not by this record or by DESIGN. Three related ADRs described mechanics in terms of the categories this decision retires, and each is superseded by a companion decision accepted alongside this record: boundary declaration (`cpt-frontx-adr-template-ownership-boundary-declaration`, ADR 0031) by `cpt-frontx-adr-whole-target-ownership`, conflict detection (`cpt-frontx-adr-assembly-conflict-prevention`, ADR 0032) by `cpt-frontx-adr-nesting-aware-conflict-prevention`, and preset resolution (`cpt-frontx-adr-composed-template-resolution`, ADR 0020) by `cpt-frontx-adr-explicit-batch-application`. The uniform-mechanism decision (`cpt-frontx-adr-uniform-template-mechanism`) is unaffected: this record adds no template-classification field, consistent with that decision's constraint. These are non-binding pointers and do not form part of this decision's durable identity.

Integration analysis (**INT**): the manifest remains a bidirectional internal contract (`cpt-frontx-contract-template-manifest`) between templates and the CLI — produced when a template is validated for publication, consumed when a template is installed, applied, or assembled. This decision does not change the contract's producer (the template author, through pre-publish validation) or its consumers (install, apply, assembly, and list); it changes only what the contract requires them to produce and read. Version-compatibility intent is forward-looking but discontinuous at this boundary: the current shape is not a strict superset of the retired one, so old manifests are not read by the current type directly; an isolated migration path preserves installability for previously published templates without admitting their retired fields into the current type, consistent with the platform evolvability requirement.

Applicability of the remaining checklist categories:

* **PERF** — Not applicable, because reading a four-field manifest has no throughput or latency budget at decision altitude, and is if anything less work than reading the five-category shape it replaces.
* **SEC** — Not applicable, because the manifest carries descriptive structure and an exclusion list, not secret material or an authentication surface.
* **REL** — Not applicable, because there is no service availability target for a local manifest read; the isolated migration path's handling of a malformed legacy manifest is covered under Confirmation.
* **DATA** — Not applicable as a complete schema, because the exact field layout remains owned by `cpt-frontx-feature-template-manifest` per `cpt-frontx-adr-contract-schema-ownership`; this decision fixes only the four declared categories and that retired fields are excluded from the primary type.
* **OPS** — Not applicable, because no operational procedure attaches to a manifest contract.
* **MAINT** — addressed: fewer declared categories and a single semantic carrier concentrate what an author and a reviewer must maintain, and an isolated migration path keeps the retired shape from leaking into ongoing maintenance of the current type.
* **UX** — addressed implicitly: an author populates four fields instead of five categories, and an AI agent or human reads one field, `description`, for both selection and usage guidance instead of cross-referencing two.
* **BIZ** — Not applicable, because product requirements live in the PRD and are cited here by ID.

**Review cadence**: revisit if the deferred field-layout decision (`cpt-frontx-adr-contract-schema-ownership`) surfaces a validated need for a fifth declared category beyond `name`, `version`, `description`, and `ownership.excludedSubtrees`, or once real-world template authoring shows the isolated migration path needs to accommodate a legacy manifest shape not yet seen.

## Traceability

- **PRD**: [PRD.md](../PRD.md)
- **DESIGN**: [DESIGN.md](../DESIGN.md)

This decision directly addresses the following requirements and design elements:

* `cpt-frontx-contract-template-manifest` — This decision narrows the manifest contract's declared categories to `name`, `version`, a required `description`, and `ownership.excludedSubtrees`, retiring the ownership-boundary and referenced-templates categories `cpt-frontx-adr-template-manifest-contract` (ADR 0018) fixed.
* `cpt-frontx-fr-cli-template-boundary-declaration` — This decision changes how a template declares what it owns, from an explicit exclusive/shared boundary taxonomy to a single `excludedSubtrees` list consumed by an algorithmic whole-target-minus-exclusions ownership computation.
* `cpt-frontx-fr-cli-template-validate-prepublish` — Pre-publish validation now checks a candidate template against the narrowed four-field shape, including that `description` is present and non-empty, in place of the five-category check ADR 0018 established.
* `cpt-frontx-adr-template-manifest-contract` — Superseded by this decision: the five-category shape (identity, version, ownership boundaries, referenced templates, optional description) is replaced by the four-field shape (`name`, `version`, required `description`, `ownership.excludedSubtrees`) fixed here.
