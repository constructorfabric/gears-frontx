---
status: accepted
date: 2026-08-04
---

# Per-Gear Artifact Chains for Products Outside the Ecosystem Pillars


<!-- toc -->

- [Context and Problem Statement](#context-and-problem-statement)
- [Decision Drivers](#decision-drivers)
- [Considered Options](#considered-options)
- [Decision Outcome](#decision-outcome)
  - [Consequences](#consequences)
  - [Confirmation](#confirmation)
- [Pros and Cons of the Options](#pros-and-cons-of-the-options)
  - [Per-gear chain rooted in the package](#per-gear-chain-rooted-in-the-package)
  - [Amend the root chain with a pillar per gear](#amend-the-root-chain-with-a-pillar-per-gear)
  - [Leave non-ecosystem gears undocumented, or as dated explorations](#leave-non-ecosystem-gears-undocumented-or-as-dated-explorations)
- [More Information](#more-information)
- [Traceability](#traceability)

<!-- /toc -->

**ID**: `cpt-frontx-adr-per-gear-architecture-chains`

## Context and Problem Statement

The repository publishes products that are not part of the FrontX Ecosystem. The ecosystem is three
co-equal pillars — Core Framework, CLI, AI Tooling Framework — and the root artifact chain
(`architecture/PRD.md` → `DESIGN.md` → `DECOMPOSITION.md` → `features/`) describes exactly those,
with `cfs validate` enforcing that every design element is covered by a feature and every marker in
code traces back to an instruction.

`@gears-frontx/telemetry` is the first published package that falls outside them. It is standalone by
construction: no import of another gear, no UI-framework import, no framework-plugin entry, and app
wiring is template-side. It appears in no root DESIGN component and no DECOMPOSITION entry, and the
root PRD's out-of-scope section excludes bundled libraries of this kind. It nonetheless needs the same
artifacts any product needs — requirements, decisions, and traceability from code back to them.

Where do the SDLC artifacts for a product that ships from this repository but is not part of the
ecosystem live, so that the product is documented and traceable without weakening the root chain's
guarantee about what the ecosystem is?

## Decision Drivers

* **The root chain describes the ecosystem, and only it** — the coverage guarantee is meaningful
  because the root PRD, DESIGN, and DECOMPOSITION describe one product set. Admitting unrelated
  products dilutes what a reader can conclude from that chain.
* **Every published product is documented and traceable** — a package that ships to a registry needs
  stated requirements and `@cpt-` markers that resolve, whether or not it belongs to the ecosystem.
* **Artifacts near the code they govern** — a gear's requirements should be discoverable from the
  package a contributor is working in, not only from a repository-root document that mostly concerns
  other packages.
* **A standalone product's chain evolves at its own pace** — a gear with no shared components should
  not require an amendment to a frozen ecosystem DESIGN in order to revise its own requirements.
* **One rule, not a precedent per package** — the next non-ecosystem gear must not reopen the same
  question.

## Considered Options

* **Per-gear chain rooted in the package** — a non-ecosystem gear carries its own chain under
  `packages/<gear>/architecture/`, rooted at its own PRD, with its own ID namespace; the root chain
  stays scoped to the ecosystem pillars.
* **Amend the root chain with a pillar per gear** — add each non-ecosystem gear to the root PRD,
  DESIGN, and DECOMPOSITION as a further pillar, keeping one chain for the whole repository.
* **Leave non-ecosystem gears undocumented, or as dated explorations** — publish the package and keep
  any requirements as informal notes outside the artifact chain.

## Decision Outcome

Chosen option: **per-gear chain rooted in the package**, because it is the only option that documents
a non-ecosystem product without changing what the root chain claims to describe.

A product published from this repository that is not part of the FrontX Ecosystem carries its own
artifact chain under `packages/<gear>/architecture/`, rooted at its own `PRD.md`. That chain uses its
own traceability namespace — `cpt-<gear>-*` rather than `cpt-frontx-*` — so an identifier states which
product's chain resolves it. Code in the package carries `@cpt-` markers into its own chain. The gear
decides how much of the chain it needs; a small gear may carry a PRD alone, and adding DESIGN,
DECOMPOSITION, or per-feature specs later is a revision within its chain rather than a change to
this decision.

The root chain remains scoped to the three ecosystem pillars. A non-ecosystem gear is not added to
the root PRD, DESIGN, or DECOMPOSITION, and its absence from root coverage is by construction, not an
omission to be patched.

The test for which chain a product belongs to is whether it realizes a component of the ecosystem
DESIGN. A package that implements or extends an ecosystem component belongs to the root chain; a
package that shares no component with the pillars — and whose package boundaries prevent it from
importing them — carries its own. `@gears-frontx/telemetry` is the latter, and
`packages/telemetry/architecture/PRD.md` is its chain root.

Amending the root chain per gear is rejected because it makes the root PRD a container for unrelated
products, so its coverage guarantee stops meaning "the ecosystem is fully described" and starts
meaning "everything in this repository is listed somewhere"; it also couples a standalone gear's
revisions to a frozen ecosystem DESIGN. Leaving gears undocumented is rejected because a published
product without stated requirements has nothing for its markers to resolve against, and an
exploration is by definition not an artifact anything may depend on.

The scope of this decision is where a non-ecosystem gear's artifacts live and which namespace they
use. It does not decide the content of any gear's chain, how complete that chain must be, or whether
a given gear belongs to the ecosystem — that follows from the DESIGN-component test above.

### Consequences

* Good, because the root chain keeps describing exactly the ecosystem, so its coverage guarantee
  continues to support the conclusion a reader draws from it.
* Good, because a contributor working in a package finds its requirements in that package.
* Good, because a standalone gear revises its own requirements without an amendment to a frozen
  ecosystem DESIGN.
* Good, because the namespace makes chain membership legible from any identifier.
* Bad, because the repository now holds more than one artifact chain, so a reader must know which one
  answers a given question.
* Bad, because validation and review tooling must be pointed at each chain rather than one path.
* Bad, because a product that later becomes part of the ecosystem needs its chain migrated and its
  identifiers renamed.

### Confirmation

Compliance is confirmed by review and by validation runs over each chain: `cfs validate` passes for
the root chain with no reference to a non-ecosystem gear, and passes for each per-gear chain
independently; every `@cpt-` marker in a gear's package resolves to an instruction in that gear's own
chain; no gear's artifacts use the `cpt-frontx-*` namespace, and no root artifact cites a
`cpt-<gear>-*` identifier as covered work. Review of a new package confirms the DESIGN-component test
was applied before its chain was placed.

## Pros and Cons of the Options

### Per-gear chain rooted in the package

Non-ecosystem gears carry their own chain under `packages/<gear>/architecture/` with their own
namespace; the root chain stays scoped to the pillars.

* Good, because the root chain's coverage guarantee keeps its meaning.
* Good, because artifacts sit beside the code they govern.
* Good, because a standalone gear evolves without touching a frozen ecosystem DESIGN.
* Neutral, because it leaves how complete each gear's chain must be to the gear.
* Bad, because more than one chain exists, and tooling must be aimed at each.

### Amend the root chain with a pillar per gear

Every published product is added to the root PRD, DESIGN, and DECOMPOSITION.

* Good, because one chain answers every question about the repository.
* Bad, because the root PRD becomes a container for unrelated products and its coverage guarantee
  stops meaning the ecosystem is fully described.
* Bad, because each standalone gear's revisions require amending a frozen ecosystem DESIGN.
* Bad, because pillar balance — a property the ecosystem chain maintains deliberately — becomes
  meaningless once unrelated products are counted as pillars.

### Leave non-ecosystem gears undocumented, or as dated explorations

Ship the package; keep requirements informal and outside any chain.

* Good, because it costs nothing up front.
* Bad, because a published product's `@cpt-` markers have nothing to resolve against.
* Bad, because an exploration is not an artifact anything may depend on, so downstream work has no
  stable reference.
* Bad, because it reopens the same question for every future gear.

## More Information

The first chain placed under this decision is the telemetry gear's
(`packages/telemetry/architecture/PRD.md`). The artifact-versioning and distribution decision
(`cpt-frontx-adr-artifact-versioning-and-distribution`) governs how published packages are versioned
and is unaffected by where their artifacts live. These are non-binding pointers and do not form part
of this decision's durable identity.

Applicability of the checklist categories: **MAINT** — addressed: one placement rule covers every
future non-ecosystem gear, and each chain is revisable without touching the others. **INT** —
addressed: the namespace convention is the contract between chains, keeping identifiers
unambiguous about which chain resolves them. **OPS** — addressed to the extent that validation and
review tooling must be configured per chain rather than for a single path. **PERF**, **SEC**,
**DATA**, **COMPL**, **UX**, **BIZ**, **REL** — Not applicable: this decision places documents and
introduces no runtime behavior, schema, secret material, or user-facing surface.

## Traceability

- **PRD**: [PRD.md](../PRD.md)
- **DESIGN**: [DESIGN.md](../DESIGN.md)

This decision governs repository artifact structure rather than an ecosystem requirement, so it
covers no `cpt-frontx-fr-*` element. Its relationships:

* `cpt-frontx-nfr-evolvability` — the per-gear chain lets a standalone gear version and evolve its
  own requirements without an amendment to the ecosystem chain, which this NFR's independent-cadence
  discipline depends on.
* `cpt-telemetry-*` — the telemetry gear's chain, the first placed under this decision, uses the
  namespace this decision establishes.
