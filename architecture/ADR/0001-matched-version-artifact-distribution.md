---
status: proposed
date: 2026-06-04
---

# Distribute the Ecosystem as Independently Versioned, Per-Concern Artifacts


<!-- toc -->

- [Context and Problem Statement](#context-and-problem-statement)
- [Decision Drivers](#decision-drivers)
- [Considered Options](#considered-options)
- [Decision Outcome](#decision-outcome)
  - [Consequences](#consequences)
  - [Confirmation](#confirmation)
- [Pros and Cons of the Options](#pros-and-cons-of-the-options)
  - [Per-concern, independently versioned artifacts](#per-concern-independently-versioned-artifacts)
  - [Single monolithic versioned distribution](#single-monolithic-versioned-distribution)
  - [Lockstep-versioned multi-package release](#lockstep-versioned-multi-package-release)
- [More Information](#more-information)
- [Traceability](#traceability)

<!-- /toc -->

**ID**: `cpt-frontx-adr-matched-version-artifact-distribution`
## Context and Problem Statement

The FrontX ecosystem delivers several distinct concerns — a microfrontend runtime, a type-system provider, a protocol surface, a command-line lifecycle tool, and an AI-tooling capability set — to consumers who adopt some of those concerns without others. The ecosystem needs a distribution and versioning model that lets each concern evolve and ship on its own terms while giving consumers a predictable, compatibility-bounded upgrade path. How should the ecosystem be packaged and versioned so that the evolution of one concern does not force unrelated consumers to upgrade in lockstep, and so that the set of distributed concerns can grow or shrink over time without re-versioning the whole?

## Decision Drivers

* Breaking-change isolation — a breaking change in one concern must not compel consumers of an unrelated concern to upgrade.
* Independent evolution cadence — concerns mature at different rates and must be releasable on their own timelines.
* Open-ended composition — the model must accommodate adding or retiring a concern without re-versioning unrelated concerns (anchors `cpt-frontx-fr-no-architectural-ceiling`, `cpt-frontx-nfr-scalability-ceiling`).
* Predictable consumer upgrades under semantic-versioning discipline (anchors `cpt-frontx-fr-versioned-platform-evolution`, `cpt-frontx-nfr-evolvability`).
* Stable, independently governed public surfaces for the consumer-facing tools (anchors `cpt-frontx-interface-cli`, `cpt-frontx-interface-ai-tooling-framework`).

## Considered Options

* **Per-concern, independently versioned artifacts** — each concern is published as its own artifact carrying its own semantic version, changelog, and breaking-change policy.
* **Single monolithic versioned distribution** — the whole ecosystem ships as one artifact under one version.
* **Lockstep-versioned multi-package release** — separate artifacts that are always released together under one shared version number.

## Decision Outcome

Chosen option: **per-concern, independently versioned artifacts**, because it is the only option under which a breaking change in one concern is bounded to that concern's own major-version increment, consumers adopt and upgrade each concern on its own timeline, and the distributed set of concerns is open-ended — adding or retiring a concern affects no other concern's version line.

### Consequences

* Good, because a breaking change is isolated to the version line of the concern that introduced it; unrelated consumers are unaffected.
* Good, because each concern evolves on an independent cadence and consumers compose exactly the concerns they need.
* Good, because the model imposes no ceiling on the number of distributed concerns — the distribution pattern is intrinsically open-ended.
* Bad, because consumers composing several concerns must reason about multiple version lines and their compatibility ranges.
* Bad, because cross-concern compatibility expectations must be communicated through changelogs and version constraints rather than a single ecosystem version.

### Confirmation

Each published artifact carries its own semantic version and changelog, and a breaking change increments only that artifact's major version. Compliance is confirmed by per-artifact release review: every published artifact has an independent version and an accompanying changelog entry, and no release couples a major-version increment across artifacts. The policy is checkable per artifact at publication time.

## Pros and Cons of the Options

### Per-concern, independently versioned artifacts

* Good, because breaking-change blast radius is bounded to a single artifact's version line.
* Good, because concerns release on independent cadences.
* Good, because the distribution set is open-ended with no architectural ceiling.
* Neutral, because it relies on semantic-versioning discipline applied per artifact.
* Bad, because consumers track multiple version lines and their compatibility.

### Single monolithic versioned distribution

* Good, because consumers reason about exactly one version.
* Bad, because any breaking change in any concern forces a whole-ecosystem major bump, coupling unrelated consumers.
* Bad, because concerns cannot evolve on independent cadences.

### Lockstep-versioned multi-package release

* Good, because artifacts remain separable at install time.
* Neutral, because it allows partial adoption of artifacts.
* Bad, because a shared version number still couples release timing and forces version increments on concerns that did not change.

## More Information

The present concrete instantiation of this pattern is four npm packages (`@gears-frontx/mfes`, `@gears-frontx/gts-plugin`, `@gears-frontx/api`, `@gears-frontx/cli`) distributed through the package registry, plus one Cypilot kit (`cyber-pilot-kit-frontx`) distributed through the Cypilot kit system. This set is descriptive and non-binding: adding or removing an artifact requires no amendment to this decision, because the decision names the distribution pattern, not its instantiation. The package-registry distribution touchpoint is traced as `cpt-frontx-contract-package-registry-distribution`.

**Review trigger.** Revisit this decision if a future requirement demands a single atomic ecosystem version (for example, a certification regime that versions the whole platform as one unit), which would invalidate the independence rationale.

**Checklist applicability.**

* ARCH — applicable and addressed above (an architecturally significant, hard-to-reverse distribution decision affecting all consumers).
* ARCH-ADR-008 (supersession) — Not applicable because this is a new, standalone decision that supersedes no prior record.
* PERF — Not applicable because this is a distribution/versioning decision, not a runtime-performance decision.
* SEC — Not applicable because packaging and versioning introduce no secret, credential, or authorization concern.
* REL — Not applicable because this decision governs published-artifact evolution, not runtime availability or fault tolerance.
* DATA — Not applicable because no persistent data store or schema is involved.
* INT — Not applicable because the only integration touchpoint (registry distribution) is captured as the traced contract above rather than evaluated as an integration-protocol choice here.
* OPS — Not applicable because no deployed-service operational procedure is governed by this decision.

## Traceability

- **PRD**: [PRD.md](../PRD.md)
- **DESIGN**: [DESIGN.md](../DESIGN.md)

This decision directly addresses the following requirements or design elements:

* `cpt-frontx-fr-versioned-platform-evolution` — the per-artifact semantic-version-and-breaking-change policy is the distribution mechanism that delivers this requirement's versioned, compatibility-bounded evolution.
* `cpt-frontx-fr-no-architectural-ceiling` — the pattern is intrinsically open-ended, placing no ceiling on the number of independently distributed concerns.
* `cpt-frontx-nfr-evolvability` — independent version lines let each concern evolve without coordinated, ecosystem-wide releases.
* `cpt-frontx-nfr-scalability-ceiling` — the open-ended artifact set scales by addition without re-versioning unrelated concerns.
* `cpt-frontx-contract-package-registry-distribution` — this decision determines how artifacts are versioned and published across the registry distribution channel.
* `cpt-frontx-interface-cli` — the CLI's public surface is governed as one independently versioned artifact with its own breaking-change policy.
* `cpt-frontx-interface-ai-tooling-framework` — the AI-tooling framework's public surface is governed as one independently versioned artifact with its own breaking-change policy.
* `cpt-frontx-design-ecosystem` — realizes the ecosystem design element's composition as independently published, independently versioned artifacts.
