---
status: accepted
date: 2026-08-11
---

# Region-Union Marker Grammar and Host Documents


<!-- toc -->

- [Context and Problem Statement](#context-and-problem-statement)
- [Decision Drivers](#decision-drivers)
- [Considered Options](#considered-options)
- [Decision Outcome](#decision-outcome)
  - [Consequences](#consequences)
  - [Confirmation](#confirmation)
- [Pros and Cons of the Options](#pros-and-cons-of-the-options)
  - [Marker-delimited host document](#marker-delimited-host-document)
  - [Marker-block concatenation only](#marker-block-concatenation-only)
  - [Structured per-format merge](#structured-per-format-merge)
- [More Information](#more-information)
- [Traceability](#traceability)

<!-- /toc -->

**ID**: `cpt-frontx-adr-region-union-marker-host-document`

## Context and Problem Statement

`region-union` shared files need one durable contract for both marker parsing and the file model around those markers. The boundary declaration decision deliberately leaves concrete schema to the manifest contract, but the CLI materializer cannot safely compose a shared file while the grammar, malformed-marker handling, and treatment of unmarked host text live only in implementation comments.

## Decision Drivers

* **One schema authority** — marker grammar must live with `cpt-frontx-feature-template-manifest`, not in scanner comments.
* **No silent loss** — materialization must not drop previously written regions, declared regions, or trusted host text without a refusal.
* **Refuse before write** — any untrusted marker shape must preserve `cpt-frontx-adr-assembly-conflict-prevention` by failing before repository writes.
* **Text-format honesty** — marker comments are valid only in marker-capable host documents, not in plain JSON.

## Considered Options

* **Marker-delimited host document** — preserve unmarked host text and replace or insert only owned marker blocks.
* **Marker-block concatenation only** — materialize a shared file as only the sorted set of owned marker blocks.
* **Structured per-format merge** — define JSON, JSONC, YAML, and other format-specific merge semantics instead of using text markers.

## Decision Outcome

Chosen option: **marker-delimited append-safe host document**. A `region-union` shared file is a line-oriented text host document containing template-owned marker blocks plus optional unowned host text. The host must be append-safe: inserting a new marker block at the end of the file is valid for that host format. Materialization replaces or inserts only the marker blocks for the templates in the current assembly, carries forward marker blocks owned by previously applied templates recorded in provenance for the same path and region key, and preserves unmarked host text from the host document. `exclusive` files remain whole-file writes; user edits outside markers are intentionally preserved only for `region-union`.

The marker grammar is owned by `cpt-frontx-feature-template-manifest`: a marker line contains `frontx:region <template-identity>:<region-key>` or `frontx:endregion <template-identity>:<region-key>`, with arbitrary comment text before the `frontx:*` prefix. The prefix must be followed by whitespace or end-of-line. The token after the prefix is delimited by whitespace, split on the first colon, and both identity and region key must be non-empty. Region keys may contain colons after the first colon but may not contain whitespace; a marker embedded in a block-comment or HTML comment must leave whitespace before the comment closer so the token boundary is unambiguous.

Malformed, unterminated, orphaned, duplicate, nested, or overlapping marker blocks are refused before any file is written when their boundaries cannot be trusted. A declared `ownedRegions` key must resolve to exactly one marker block in the contributing template's installed content; silently omitting a declared region is not permitted.

The marker-based `region-union` strategy is for append-safe marker text host documents. Plain JSON files that cannot carry comments are not valid marker hosts under this strategy and are rejected by manifest validation; a future structured JSON merge would be a separate merge strategy rather than a reinterpretation of `region-union`.

### Consequences

* Good, because `frontx add` can preserve previously materialized regions and developer-maintained host text instead of rebuilding the file from only the incoming assembly.
* Good, because marker parsing becomes a manifest-contract rule rather than an implementation accident.
* Good, because missing declared regions fail loudly instead of producing a partial shared file.
* Bad, because `package.json` and other plain JSON files need a future structured merge strategy or a marker-capable wrapper format; marker comments are not valid plain JSON.

### Confirmation

Compliance is confirmed by manifest-contract tests for legal region keys, compose tests for preserving host text and refusing missing declared regions, and add-flow regression tests proving recorded blocks survive a later `frontx add` with no partial writes on refusal.

## Pros and Cons of the Options

### Marker-delimited host document

* Good, because it preserves developer-maintained text outside owned marker blocks.
* Good, because it gives `frontx add` a deterministic way to reconcile incoming regions with already-applied regions.
* Bad, because it is limited to marker-capable text formats.

### Marker-block concatenation only

* Good, because it is simple and deterministic.
* Bad, because it destroys host text and makes `region-union` unsuitable for files that need surrounding structure.
* Bad, because it repeats the truncation class that issue #487 exposed.

### Structured per-format merge

* Good, because it could support plain JSON and other structured files without comment markers.
* Bad, because it would multiply merge semantics by file type and belongs in a separate merge strategy, not in `region-union`.

## More Information

The two-tier boundary declaration is decided in `cpt-frontx-adr-template-ownership-boundary-declaration`; the refusal-before-write rule is decided in `cpt-frontx-adr-assembly-conflict-prevention`; the concrete manifest schema and validation hooks are owned by `cpt-frontx-feature-template-manifest`.

## Traceability

- **PRD**: [PRD.md](../PRD.md)
- **DESIGN**: [DESIGN.md](../DESIGN.md)

This decision directly addresses:

* `cpt-frontx-feature-template-manifest` — Owns the concrete region marker grammar.
* `cpt-frontx-algo-cli-scaffolding-compose-shared-files` — Applies the host-document semantics during materialization.
* `cpt-frontx-adr-template-ownership-boundary-declaration` — Supplies the shared-file region ownership tier this grammar concretizes.
* `cpt-frontx-adr-assembly-conflict-prevention` — Preserves the refuse-before-write rule for untrusted marker structures.
