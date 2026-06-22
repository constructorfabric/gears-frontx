---
status: proposed
date: 2026-06-05
---

# Source-Spec Syntax for Versioned Template References

<!-- toc -->

- [Context and Problem Statement](#context-and-problem-statement)
- [Decision Drivers](#decision-drivers)
- [Considered Options](#considered-options)
- [Decision Outcome](#decision-outcome)
  - [Consequences](#consequences)
  - [Confirmation](#confirmation)
- [Pros and Cons of the Options](#pros-and-cons-of-the-options)
  - [Host-prefixed reference with an explicit ref selector](#host-prefixed-reference-with-an-explicit-ref-selector)
  - [Full URL plus a separate version field](#full-url-plus-a-separate-version-field)
  - [Bare package name resolved against a default registry](#bare-package-name-resolved-against-a-default-registry)
- [More Information](#more-information)
- [Traceability](#traceability)

<!-- /toc -->

**ID**: `cpt-frontx-adr-source-spec-syntax`

## Context and Problem Statement

The CLI (`cpt-frontx-component-cli`, the `@gears-frontx/cli` package) resolves every template from an external source by a versioned reference rather than bundling any (the externalization decision, `cpt-frontx-adr-template-externalization-resolution`). For that resolution to be deterministic, the reference a developer supplies must have a defined shape that names a host, a repository, and an explicit version. The source-spec contract (`cpt-frontx-contract-source-spec`) requires versioned references to templates hosted on the source registry (`cpt-frontx-actor-github`) but deliberately fixes no concrete syntax at the product-requirements level. What concrete shape should a versioned source-spec take, so that a reference is unambiguous, version-pinned, and consistent with the host-prefixed reference form already established across the platform substrate?

## Decision Drivers

* **Unambiguous origin** — a reference must encode which host and which repository identify a template, so resolution is never guessed from context.
* **Explicit, mandatory version pin** — the reference must carry an explicit version selector (a tag, branch, or commit) so acquisition is reproducible (`cpt-frontx-fr-cli-template-install`), rather than defaulting to a moving target.
* **Substrate consistency** — the platform substrate already expresses external sources in a host-prefixed `host:owner/repo` form; reusing that established shape keeps one mental model across the ecosystem instead of introducing a second reference vocabulary.
* **Human-writable and parseable** — the shape must be short enough to type and copy by hand yet structured enough to parse deterministically into its host, owner, repository, and version parts.
* **Forward compatibility** — the shape must admit additional hosts and additional version-selector kinds without a breaking change to references already in use, consistent with the platform evolvability requirement.

## Considered Options

* **Host-prefixed reference with an explicit ref selector** — a single string of the form `host:owner/repo@ref`, where `host` names the source registry, `owner/repo` identifies the repository, and `@ref` is a mandatory version selector (tag, branch, or commit). This is the host-prefixed form already established in the platform substrate.
* **Full URL plus a separate version field** — references are expressed as a complete repository URL accompanied by a distinct version argument, parsed as two independent inputs.
* **Bare package name resolved against a default registry** — references are an unprefixed name resolved against an implied default registry and an implied default version, with host and version inferred rather than stated.

## Decision Outcome

Chosen option: **Host-prefixed reference with an explicit ref selector** (`host:owner/repo@ref`), because it resolves the unambiguous-origin and explicit-version drivers in a single compact token while reusing the host-prefixed reference shape already established across the platform substrate, satisfying the substrate-consistency driver. The host prefix names the source registry generically (the established host token `github` names the GitHub source registry, `cpt-frontx-actor-github`); `owner/repo` fixes the repository; and the mandatory `@ref` selector pins the version so acquisition is reproducible. The full-URL-plus-field option splits one logical reference into two inputs that can disagree and is more verbose to write and copy; the bare-name option infers host and version, which forfeits the unambiguous-origin and explicit-version-pin drivers.

The `host:` prefix is an extension point: additional source hosts are admitted by defining additional host tokens without changing the shape of existing references. The `@ref` selector likewise admits tags, branches, and commit identifiers under one position. Resolving a source-spec is the responsibility of the shared resolver established by the externalization decision; this decision fixes only the reference shape, not the resolution mechanism.

### Consequences

* Good, because a single compact token unambiguously encodes host, repository, and an explicit version, making references easy to write, copy, and parse.
* Good, because it reuses the host-prefixed shape already established in the platform substrate, so the ecosystem carries one reference vocabulary rather than two.
* Good, because the `host:` prefix and the `@ref` position are extension points that admit new hosts and new selector kinds without breaking existing references.
* Bad, because a single packed string is less self-describing to a first-time reader than separately labelled fields would be.
* Bad, because a mandatory `@ref` adds friction for a developer who would otherwise omit a version and accept an implied default.

### Confirmation

Compliance is confirmed by design and code review plus a parser-level check on the CLI: the reference parser MUST reject any source-spec that omits the `host:` prefix or the `@ref` version selector, and MUST round-trip a valid `host:owner/repo@ref` reference into its four constituent parts. A continuous-integration test asserts that an unversioned or unprefixed reference is rejected, confirming that acquisition cannot proceed without an explicit version pin.

## Pros and Cons of the Options

### Host-prefixed reference with an explicit ref selector

A single string `host:owner/repo@ref` reusing the host-prefixed form established in the platform substrate, with a mandatory version selector.

* Good, because origin and version are encoded unambiguously in one compact, copy-pasteable token.
* Good, because it matches the host-prefixed reference shape already established in the substrate.
* Good, because the host prefix and ref position extend to new hosts and selector kinds without breaking existing references.
* Neutral, because the `host` token vocabulary is an open set governed by the resolver rather than fixed here.
* Bad, because a packed string is less self-describing than labelled fields.

### Full URL plus a separate version field

A complete repository URL accompanied by a distinct version argument, parsed as two inputs.

* Good, because each part is explicitly labelled and self-describing.
* Good, because a full URL is unambiguous about transport and host.
* Bad, because two independent inputs can disagree and must be cross-validated.
* Bad, because it diverges from the host-prefixed shape established in the substrate, introducing a second reference vocabulary.

### Bare package name resolved against a default registry

An unprefixed name resolved against an implied default registry and an implied default version.

* Good, because it is the shortest possible reference to type.
* Bad, because host is inferred, failing the unambiguous-origin driver.
* Bad, because an implied default version is a moving target, failing the explicit-version-pin and reproducibility drivers.

## More Information

The host-prefixed reference shape this decision reuses is already established in the platform substrate: external sources are expressed in the host-prefixed `host:owner/repo` form in `.cypilot/config/core.toml` (for example the `source = "github:gears-frontx/cyber-pilot-kit-sdlc"` entry under `[kits.sdlc]`). That substrate entry is cited only as a neutral, timeless example of the established shape so this decision's reuse is accurate; the concrete `github:` token and that specific repository are non-binding present detail, not part of this decision's durable identity. The resolver that consumes a source-spec is decided in `cpt-frontx-adr-template-externalization-resolution`; the source registry actor is `cpt-frontx-actor-github`.

Integration analysis (**INT**): the source-spec is a client-supplied contract (`cpt-frontx-contract-source-spec`, direction required-from-client). Its consumer is the CLI's reference parser and shared resolver; its producer is any developer or tool that names a template. Version-compatibility intent is forward-looking: the `host:owner/repo@ref` shape is stable, and additional hosts and selector kinds are introduced additively so that references already written remain valid; any change to the shape that is not backward-compatible follows the platform evolvability requirement. No external integration partner consumes this shape beyond the source registry it addresses.

Applicability of the remaining checklist categories: **PERF** — Not applicable, because parsing a short reference string has no throughput or latency budget at decision altitude. **SEC** — Not applicable, because the shape carries no secret material; it names a public host, repository, and version only. **REL** — Not applicable, because there is no service availability target for a parsed reference. **DATA** — Not applicable, because no persistent schema is defined; the reference is a transient input shape. **OPS** — Not applicable, because no operational procedure attaches to a reference shape. **MAINT** — addressed: one reference vocabulary shared with the substrate reduces cognitive load. **UX** — addressed: a compact, copy-pasteable token. **BIZ** — Not applicable, because product requirements live in the PRD and are cited here by ID.

## Traceability

- **PRD**: [PRD.md](../PRD.md)
- **DESIGN**: [DESIGN.md](../DESIGN.md)

This decision directly addresses the following requirements and design elements:

* `cpt-frontx-contract-source-spec` — This decision fixes the concrete `host:owner/repo@ref` shape for the versioned-reference contract that the contract leaves unspecified at product-requirements altitude.
* `cpt-frontx-fr-cli-template-install` — The mandatory `@ref` version selector is what makes installation by versioned reference deterministic and reproducible.
* `cpt-frontx-actor-github` — The `host:` prefix names the source registry generically, with the established host token identifying the GitHub source registry that hosts the referenced templates.
