---
status: accepted
date: 2026-07-28
supersedes: cpt-frontx-adr-source-spec-syntax
---

# Subdirectory Addressing in the Source-Spec Reference Shape

<!-- toc -->

- [Context and Problem Statement](#context-and-problem-statement)
- [Decision Drivers](#decision-drivers)
- [Considered Options](#considered-options)
- [Decision Outcome](#decision-outcome)
  - [Consequences](#consequences)
  - [Confirmation](#confirmation)
- [Pros and Cons of the Options](#pros-and-cons-of-the-options)
  - [A `//path` segment inside the existing reference token](#a-path-segment-inside-the-existing-reference-token)
  - [A separate subdirectory input alongside the reference](#a-separate-subdirectory-input-alongside-the-reference)
  - [One repository per template](#one-repository-per-template)
- [More Information](#more-information)
- [Traceability](#traceability)

<!-- /toc -->

**ID**: `cpt-frontx-adr-source-spec-subdirectory-addressing`

## Context and Problem Statement

The versioned reference a developer supplies to acquire a template was fixed as `host:owner/repo@ref` (`cpt-frontx-adr-source-spec-syntax`), a shape that addresses a repository as a whole and therefore admits exactly one template per repository. That assumption does not survive the uniform template mechanism (`cpt-frontx-adr-uniform-template-mechanism`): a single repository is the natural home for a family of templates that are authored, versioned, and released together, and a composed preset (`cpt-frontx-adr-composed-template-resolution`) references sibling templates that have no reason to live in separate repositories. Requiring one repository per template forces a repository split for a packaging reason rather than an ownership reason. How should a versioned reference address a template that occupies a subtree of a repository rather than the whole of it, and what complete shape should the reference then have?

## Decision Drivers

* **Several templates in one repository** — a reference must be able to name one template among several published from the same repository at the same version, so repository topology follows ownership rather than the addressing scheme.
* **No second reference vocabulary** — the ecosystem already expresses external sources in a host-prefixed form, and the platform substrate's own kit installer already addresses a subtree with a `//` segment; introducing a differently-shaped reference for the same purpose would leave two vocabularies for one concept.
* **References already written keep their meaning** — every reference in existing provenance records, documentation, and developer habit omits any subtree, and must continue to parse into the same structured reference and address the same content root, consistent with the forward-compatibility driver of the shape being extended.
* **Deterministic parse** — every delimiter position must be fixed by rule, so any reference either splits into its parts one way only or is rejected; no input may split two plausible ways.
* **Acquisition mechanism unchanged** — subtree selection must be a filter applied to acquired content, not a second transport, so the externalized-acquisition decision (`cpt-frontx-adr-template-acquisition-and-location`) and its single shared resolver stay intact.

## Considered Options

* **A `//path` segment inside the existing reference token** — the reference becomes `host:owner/repo//path@ref`, where the optional `//path` segment names the subtree the template occupies; a reference without the segment addresses the repository root exactly as before.
* **A separate subdirectory input alongside the reference** — the reference keeps its current shape and the subtree is supplied as a second, independently labelled input carried beside it wherever a reference travels.
* **One repository per template** — no addressing change; a template that needs to be addressable is published from its own repository, and a family of templates becomes a family of repositories.

## Decision Outcome

Chosen option: **A `//path` segment inside the existing reference token**, because it is the only option that makes a subtree addressable while keeping one reference that travels as one value. This decision fixes the complete reference shape, superseding the shape decided in `cpt-frontx-adr-source-spec-syntax`:

```
host:owner/repo[//subtree]@ref
```

The `host:` prefix is mandatory and names the source registry; `owner/repo` is mandatory and identifies the repository; `@ref` is a mandatory version selector; `//subtree` is optional and names the subtree the template occupies. The mandatory host prefix and mandatory version pin are re-decided here on the drivers the superseded record established — unambiguous origin and reproducible, version-pinned acquisition — so no part of the shape rests on a superseded record.

Delimiter positions are fixed by rule, and the rules are chosen so that every reference valid under the superseded shape parses into the same parts it did before:

* the host token ends at the **first** `:`;
* the ref selector begins after the **first** `@` in the remainder, exactly as before;
* the repository path is what lies between them, and splits at its **first** `//`;
* `owner` and `repo` are each exactly one non-empty segment, so `//` cannot occur inside a well-formed repository path and the split point is unambiguous;
* a subtree segment must be a relative path with no empty, `.`, or `..` segments, and must resolve within the acquired content root;
* anything else — an empty or trailing-slash subtree segment, a repository path with a segment count other than two, a subtree that escapes the content root — is rejected rather than reinterpreted.

Absence of the segment denotes the repository root; there is no second spelling of that meaning, because a present-but-empty segment is invalid rather than equivalent. The subtree is compared literally, so two references differing only in the case of a subtree segment are two references, even on a filesystem that would not distinguish them. Because the ref selector still begins at the first `@`, a subtree path containing `@` is not addressable under this shape.

Subtree selection is a filter applied to content already acquired by the existing mechanism: the whole-repository acquisition and the single shared resolver are untouched, and only the materialization step narrows to the matched subtree, re-rooted so that the template's own paths are relative to itself and a template is unaware of where in a repository it lives.

The separate-input option splits one logical reference into two values that can disagree and must be carried together through every surface that stores or re-resolves a reference — provenance records and a preset's declared sibling references among them. The repository-per-template option answers the addressing question by forbidding the case, imposing repository proliferation as the price of packaging and leaving a composed preset's siblings spread across repositories that must then be versioned in lockstep by convention.

This decision fixes the reference shape only. Which value identifies a template once several templates share a repository is not decided here: the manifest declares a template's identity (`cpt-frontx-adr-template-manifest-contract`), and the field-level schema of that declaration belongs to the owning FEATURE per `cpt-frontx-adr-contract-schema-ownership`.

### Consequences

* Good, because a repository can publish a family of templates addressed individually, so repository boundaries follow ownership instead of the addressing scheme.
* Good, because every reference already written parses into the same parts and addresses the same content root, since the segment is optional and no existing delimiter rule changed.
* Good, because the ecosystem carries one subtree-addressing vocabulary shared with the platform substrate rather than two shapes for one concept.
* Good, because acquisition is unchanged and subtree selection is confined to materialization, so the shared resolver stays the single resolution path.
* Bad, because admitting several templates per repository removes the uniqueness the registry namespace previously supplied for free: under one template per repository, `owner/repo` made a template's identity unique by construction. Identity is used as a content-path segment and as a provenance and conflict-check key, so it must now carry a uniqueness guarantee of its own — a requirement this decision creates and the manifest contract (`cpt-frontx-adr-template-manifest-contract`) and its owning FEATURE must satisfy.
* Bad, because filtering after acquisition means installing N sibling templates from one repository acquires that repository N times — the cost of leaving acquisition unchanged, paid exactly in the case this decision makes common. Only acquisition is duplicated: each install materializes its own subtree alone. Sparse acquisition would remove the duplicate transfer and would require revisiting this record.
* Bad, because a subtree path containing `@` is not addressable, which is the price of leaving the ref delimiter rule unchanged so that references already written keep their meaning.
* Bad, because a reference can now fail in ways parsing cannot detect, and those failures land on the upgrade path as well as at install: the subtree may not exist at the referenced version, may exist but declare no manifest, or may have been relocated by an ordinary repository reorganization between the applied version and the target one. Repositories reorganize far more often than they are renamed, so this is a routine upgrade failure mode rather than an edge case.
* Bad, because bounded local update accepts a new reference for an existing entry, so pointing an entry at a different subtree of the same repository substitutes one template for another without any acquisition-level failure; only the identity the substituted template declares can distinguish the two, which places the guard outside this decision.
* Bad, because the reference token gains an optional position and is correspondingly less self-describing to a first-time reader than the fixed three-position form was.

### Confirmation

Compliance is confirmed by design and code review plus parser-level and resolution-level checks on the CLI.

The reference parser MUST round-trip a valid `host:owner/repo//subtree@ref` reference into its five constituent parts (host, owner, repository, subtree, ref); MUST parse a reference without the segment into the same four parts as before this decision, with no subtree; MUST continue to reject any reference omitting the `host:` prefix or the `@ref` selector; and MUST reject, rather than reinterpret, a repository path whose segment count is not two, an empty or trailing-slash subtree segment, and a subtree segment containing an empty, `.`, or `..` segment. A continuous-integration test asserts each rejection and asserts that a subtree-less reference addresses the same content root it addressed before this decision.

A resolution-level test asserts that only the matched subtree is materialized, that materialized paths are relative to the subtree rather than to the repository, and that a reference naming a subtree absent at the referenced version fails with an error identifying the subtree rather than silently materializing the repository root. A further test asserts that narrowing refuses outright when re-rooting would lift a retained path out of the subtree: an acquired path may sit inside the repository and escape only once its prefix is stripped, so the reference-side check cannot catch it and the refusal has to happen where the escape is created.

The assertion that two references differing only in their subtree segment yield two distinct tracked templates from one repository at one version is a property of template identity, not of the reference shape, and is verifiable only where identity is taken from the manifest per `cpt-frontx-adr-template-manifest-contract`. That conformance is a precondition of this assertion rather than of this decision, and it is named here so a reader of this record alone can see which other decision the assertion rests on.

## Pros and Cons of the Options

### A `//path` segment inside the existing reference token

The reference becomes `host:owner/repo//subtree@ref`, with the segment optional and its absence meaning the repository root.

* Good, because one reference remains one value that can be stored, copied, and re-resolved as a unit.
* Good, because every delimiter rule that governed the previous shape is unchanged, so no reference already written changes meaning.
* Good, because the shape has mainstream precedent: Terraform module sources address a subdirectory with the same `//` segment.
* Neutral, because the subtree is interpreted by the resolver rather than fixed here, as the host token vocabulary already is.
* Bad, because the position of the ref delimiter is now a constraint on subtree paths rather than a free choice, so `@`-containing paths are excluded.
* Bad, because the token carries an optional position and reads as denser than the fixed three-position form.

### A separate subdirectory input alongside the reference

The reference keeps its shape and the subtree travels beside it as a second labelled input.

* Good, because each part is explicitly labelled and self-describing, and no delimiter constrains what a subtree path may contain.
* Good, because it is a working mainstream precedent rather than a hypothetical: Copier scopes a template to a subdirectory through a declared `_subdirectory` setting rather than through the reference.
* Bad, because two independent inputs can disagree and must be cross-validated wherever a reference is stored or re-resolved.
* Bad, because every surface that carries a reference must be widened to carry the second value — provenance records, a preset's declared sibling references, and command arguments — and the Copier precedent avoids that only by placing the setting in the template's own configuration, which is not available to a reference that must name one template among several before any content is fetched.

### One repository per template

No addressing change; a template that must be addressable gets its own repository.

* Good, because it requires no change to the reference shape or to any parser.
* Good, because each template's version history is unambiguously its own.
* Bad, because it forces repository proliferation for a packaging reason rather than an ownership reason.
* Bad, because a composed preset's sibling templates end up in separate repositories that must be kept version-aligned by convention rather than by construction.

## More Information

This decision supersedes `cpt-frontx-adr-source-spec-syntax` and absorbs the whole reference shape, including the parts it leaves unchanged, so that no element of the shape is decided only by a superseded record. The following artifacts state the previous shape or cite the superseded record and are updated alongside this decision rather than left to resolve forward: `architecture/DESIGN.md` (the source-spec contract entry, the Template entity's format owner, and the functional driver for template install), `architecture/features/template-resolution/FEATURE.md` (the parse and resolve algorithms and the parser-rejection definition of done, which states four constituent parts), and `architecture/features/composed-provenance/FEATURE.md` (the source-spec shape a provenance record stores).

The subtree form reused here is already accepted by the platform substrate's own kit installer: its documented command surface admits `install git/<url>[//<subdir>][@<kit>]`, which a reviewer can confirm from the installed tool's own help output. That substrate behaviour is cited as a neutral example of an established shape, not as a binding dependency; the concrete tool and its command surface are non-binding present detail. The mechanism that acquires the referenced content and the single shared resolver that performs resolution are decided in `cpt-frontx-adr-template-acquisition-and-location`. Which value identifies a template is declared by the manifest per `cpt-frontx-adr-template-manifest-contract`, with its field-level schema owned by the corresponding FEATURE per `cpt-frontx-adr-contract-schema-ownership`.

The determinism of the split rests on a property of the admitted host set rather than on the shape alone: every admitted host's repository path must consist of non-empty segments, so that a doubled slash cannot occur inside it. Admitting a host whose identifier path may carry an empty segment, or a requirement to address subtree paths containing `@`, invalidates the split rule and triggers revisiting this decision, as would a move from post-acquisition filtering to sparse acquisition.

Integration analysis (**INT**): the source-spec remains a client-supplied contract (`cpt-frontx-contract-source-spec`, direction required-from-client), consumed by the CLI's reference parser and shared resolver and produced by any developer or tool that names a template. Version-compatibility intent is additive: the subtree segment is optional and no existing delimiter rule changed, so references written against the superseded shape remain valid and keep their meaning, and the source registry (`cpt-frontx-actor-github`) is addressed by the same acquisition mechanism as before. A reference is also stored and re-resolved rather than only consumed once: a provenance record retains it (`cpt-frontx-adr-project-provenance-record`), so a reference that carries a subtree must re-resolve to the same subtree at upgrade time. No external integration partner consumes this shape beyond the source registry it addresses.

**SEC** — addressed: the subtree segment is the first developer- or third-party-supplied path fragment in a reference, and it reaches local filesystem selection and re-rooting. It arrives not only by hand but inside a third-party manifest, since a composed preset declares its sibling references (`cpt-frontx-adr-composed-template-resolution`). This decision therefore fixes as a property of the shape that a subtree segment MUST be relative, MUST contain no empty, `.`, or `..` segment, and MUST resolve within the acquired content root; a segment that does not is rejected, and no path outside that root is ever written. The reference carries no secret material.

Applicability of the remaining checklist categories: **PERF** — Not applicable at decision altitude, because parsing a short reference carries no throughput or latency budget; the acquisition cost of sibling templates is recorded as a consequence rather than as a performance target. **REL** — Not applicable, because there is no service availability target for a parsed reference. **DATA** — Not applicable, because no persistent schema is defined here; the reference is a transient input shape, and the record that stores it is decided in `cpt-frontx-adr-project-provenance-record`. **OPS** — Not applicable, because no operational procedure attaches to a reference shape. **MAINT** — addressed: one addressing vocabulary shared with the substrate, and one repository able to hold a family of templates, reduce both cognitive load and repository sprawl. **UX** — addressed: the reference remains a single compact, copy-pasteable token. **BIZ** — Not applicable, because product requirements live in the PRD and are cited here by ID.

## Traceability

- **PRD**: [PRD.md](../PRD.md)
- **DESIGN**: [DESIGN.md](../DESIGN.md)

This decision directly addresses the following requirements and design elements:

* `cpt-frontx-contract-source-spec` — This decision fixes the complete shape of the versioned-reference contract, adding an optional subtree segment so one repository can serve several referenced templates.
* `cpt-frontx-fr-cli-template-install` — Installation by versioned reference stays deterministic and reproducible when the referenced template occupies a subtree rather than a whole repository.
* `cpt-frontx-fr-cli-template-update-local` — Bounded local update accepts a versioned reference as input, so its input surface carries the new shape, including the substitution risk recorded in the consequences.
* `cpt-frontx-fr-cli-template-list` — The inventory a developer lists may now hold several templates acquired from one repository, distinguished by the subtree each reference named.
* `cpt-frontx-fr-cli-composed-template-resolution` — A preset's declared sibling references are the motivating case for addressing templates that share a repository, and they carry the shape this decision fixes.
* `cpt-frontx-contract-project-provenance` — A provenance record stores the reference that re-resolves an applied template, so a stored reference must retain its subtree for a later upgrade to re-resolve the same template rather than the repository root.
* `cpt-frontx-actor-github` — The referenced subtree is selected from content acquired from the source registry by the existing acquisition mechanism, which this decision leaves unchanged.
