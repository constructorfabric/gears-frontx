---
status: proposed
date: 2026-06-04
---

# Upgrade Change-Set Engine: A Single CLI-Owned, Reviewable, Reversible Engine


<!-- toc -->

- [Context and Problem Statement](#context-and-problem-statement)
- [Decision Drivers](#decision-drivers)
- [Considered Options](#considered-options)
- [Decision Outcome](#decision-outcome)
  - [Consequences](#consequences)
  - [Confirmation](#confirmation)
- [Pros and Cons of the Options](#pros-and-cons-of-the-options)
  - [Single change-set engine in the CLI; AI orchestrates and enriches it](#single-change-set-engine-in-the-cli-ai-orchestrates-and-enriches-it)
  - [Split engines: a CLI engine and a separate AI engine](#split-engines-a-cli-engine-and-a-separate-ai-engine)
  - [AI-only engine](#ai-only-engine)
- [More Information](#more-information)
- [Traceability](#traceability)

<!-- /toc -->

**ID**: `cpt-frontx-adr-upgrade-changeset-engine`
## Context and Problem Statement

A project scaffolded from a template at one version must be able to adopt a newer version of that template without the developer hand-editing files or risking unreviewed changes (`cpt-frontx-fr-cli-project-upgrade-changeset`), and no modification may reach the project's files without the developer's explicit approval (`cpt-frontx-fr-cli-upgrade-review-approval`). This requires a mechanism that computes the difference between the project's current template version and a newer one, expresses it as something a human can examine and approve, and applies it without destroying work in progress. Two design questions follow: what is the unit of this mechanism (a diff-and-apply engine over template versions), and where does it live relative to the AI-driven upgrade workflow that a developer's agent uses to analyse and enrich the change (`cpt-frontx-usecase-ai-driven-template-upgrade`)?

## Decision Drivers

* **Reviewable before applied** — the result of an upgrade computation must be an approvable artifact a developer examines and accepts or declines before anything is written, so a human stays in control of every change.
* **Non-destructive application** — applying an approved change must not silently overwrite developer modifications; the engine must produce a change set whose application is bounded and recoverable rather than an in-place blind overwrite.
* **Reversibility** — an applied change set must be reversible to the pre-upgrade project state, so an upgrade that proves unwanted can be rolled back cleanly.
* **One authoritative computation** — the difference between two template versions and its application must be computed in exactly one place, so the change a developer reviews is the same change that is applied, with no second, divergent implementation.
* **Reuse across invokers** — the same engine must serve both a direct developer invocation and an AI-driven workflow, so the upgrade behaviour does not fork by who triggers it.
* **Engine independent of AI availability** — the core upgrade capability must function whether or not an AI agent is present; AI enriches the experience but is not a precondition for upgrading.

## Considered Options

* **Single change-set engine in the CLI; AI orchestrates and enriches it** — one engine in the `@cyberfabric/cli` package computes a template-version-diff change set, presents it for approval, applies it non-destructively, and supports rollback; the AI upgrade workflow invokes this engine and enriches the experience (change analysis, downstream-impact assessment) alongside it.
* **Split engines: a CLI engine and a separate AI engine** — the CLI carries one diff-and-apply implementation and the AI workflow carries its own, each computing and applying upgrades independently.
* **AI-only engine** — the diff-and-apply capability lives entirely in the AI workflow; the CLI exposes no standalone upgrade engine and an upgrade requires the AI agent.

## Decision Outcome

Chosen option: **Single change-set engine in the CLI; AI orchestrates and enriches it**, because it is the only option that gives one authoritative computation while still serving both a direct invocation and an AI-driven workflow. A generic template-version-diff engine in the CLI computes the change between the project's current template version and a target version, expresses it as an approvable change set, applies it non-destructively, and supports rollback to the pre-upgrade state.

The boundary with AI is explicit: the single change-set engine lives in the **CLI**, and the AI-driven upgrade orchestration decided in `cpt-frontx-adr-ai-driven-upgrade-orchestration` **invokes and enriches** that engine — running alongside it, not subordinating or replacing it. The AI workflow contributes change analysis and downstream-impact assessment around the engine's change set; it does not compute or apply the change set itself. This keeps the engine usable without AI and guarantees the change a developer reviews is exactly the change the engine applies. The split-engines option fails the one-authoritative-computation and no-fork drivers and risks the reviewed change diverging from the applied change; the AI-only option fails the engine-independent-of-AI driver by making every upgrade require an agent.

The scope of this decision is the upgrade engine's unit and ownership and its reviewability, non-destructiveness, and reversibility. It does not decide the AI orchestration workflow's own shape (that is `cpt-frontx-adr-ai-driven-upgrade-orchestration`), nor how a template reference resolves to a version (that is `cpt-frontx-adr-template-externalization-resolution`), nor the local-update path that refreshes an installed template without touching a project.

### Consequences

* Good, because one engine computes and applies the change set, so the reviewed change and the applied change are guaranteed identical.
* Good, because the upgrade capability is available by direct CLI invocation and does not require an AI agent to be present.
* Good, because non-destructive application plus rollback makes adopting a newer template version safe and recoverable.
* Good, because the AI workflow can enrich the upgrade (analysis, impact assessment) without re-implementing the engine, keeping the two concerns layered cleanly.
* Bad, because a single generic diff engine must handle template-shaped changes it cannot always merge automatically; some changes will surface as conflicts the developer must resolve during review.
* Bad, because rollback requires the engine to retain enough pre-upgrade state to reverse an applied change set, which is state the engine must manage and bound.

### Confirmation

Compliance is confirmed by continuous-integration checks on the CLI package: a fixture project at an older template version is upgraded toward a newer version and the check asserts (a) the engine produces an approvable change set and writes nothing to project files until approval, (b) declining the change set leaves the project byte-for-byte unchanged, (c) applying the approved change set then rolling it back restores the pre-upgrade project state, and (d) the AI orchestration path drives the same engine rather than a second implementation. Design and code review confirm the diff-and-apply computation exists in exactly one place in the `@cyberfabric/cli` package and that the AI workflow calls into it.

## Pros and Cons of the Options

### Single change-set engine in the CLI; AI orchestrates and enriches it

One CLI engine computes, presents, applies, and reverses the change set; the AI workflow invokes and enriches it alongside.

* Good, because there is exactly one authoritative diff-and-apply computation.
* Good, because the engine works with or without AI, and the AI workflow reuses rather than duplicates it.
* Good, because reviewability, non-destructive apply, and rollback are properties of one engine and apply uniformly to every invoker.
* Neutral, because it defines a clean invocation boundary the AI orchestration decision depends on.
* Bad, because the engine carries the rollback state it must manage, and some template-shaped changes still require manual conflict resolution.

### Split engines: a CLI engine and a separate AI engine

The CLI and the AI workflow each carry their own diff-and-apply implementation.

* Good, because each invoker can evolve its engine independently.
* Bad, because two implementations can diverge, so the change a developer reviews under one path may differ from what another applies, failing the one-authoritative-computation driver.
* Bad, because reviewability, non-destructiveness, and rollback must be re-proven separately for each engine, doubling the reliability surface.

### AI-only engine

The diff-and-apply capability lives entirely in the AI workflow; the CLI exposes no standalone engine.

* Good, because the upgrade experience and its enrichment live in one place.
* Bad, because every upgrade then requires an AI agent, failing the engine-independent-of-AI driver.
* Bad, because the CLI's own command surface cannot offer a reviewable, reversible upgrade without the agent, narrowing where upgrades are possible.

## More Information

The AI-driven upgrade orchestration that invokes and enriches this engine is decided in `cpt-frontx-adr-ai-driven-upgrade-orchestration`; that decision sits alongside, not above, this one. Resolution of a template reference to a target version is performed by the shared resolver decided in `cpt-frontx-adr-template-externalization-resolution`. These are non-binding pointers to related decisions and are not part of this decision's durable identity.

Reliability treatment (REL): the change-set model is the engine's reliability design. **Failure modes** — a target version that cannot be resolved, or a change the engine cannot apply cleanly, surfaces during computation or review, before any project file is written; the project stays at its current version. **Non-destructive apply** — application is gated behind explicit approval and writes only the approved change set. **Recovery / rollback** — an applied change set is reversible to the pre-upgrade state, so an unwanted upgrade is recoverable at the change-set level. **Single point of failure** — the single engine is deliberately the one authoritative computation; its reliability properties are proven once and apply to every invoker (the Confirmation defines those checks). **Operational readiness (REL-ADR-002)**: rollback strategy is the change-set reversal above; service-oriented items — deployment complexity, monitoring, alerting, runbooks, SLA — are Not applicable, because this is a local developer command with no running service, no availability target, and no operational on-call surface.

Applicability of the remaining checklist categories: **PERF** — Not applicable, because there is no latency or throughput budget bound to a local upgrade command. **SEC** — Not applicable, because the decision introduces no secret material and no authentication surface. **DATA** — Not applicable, because no persistent database or schema is defined here; the pre-upgrade state the engine retains for rollback is an implementation concern, not a schema decision. **OPS** — Not applicable, per the operational-readiness note above. **COMPL** — Not applicable, because no regulatory obligation bears on the engine. **UX** — addressed implicitly: review-then-approve keeps the developer in control. **MAINT** — addressed: one engine is one place to maintain the upgrade behaviour. **ARCH-ADR-008 (supersession)** — Not applicable, because this ADR supersedes no live ADR. **Review cadence**: revisit if AI enrichment ever needs to alter the change set the engine computes (which would pressure the alongside-not-subordinate boundary), or if template-shaped changes routinely defeat automatic application.

## Traceability

- **PRD**: [PRD.md](../PRD.md)
- **DESIGN**: [DESIGN.md](../DESIGN.md)

This decision directly addresses the following requirements and design elements:

* `cpt-frontx-fr-cli-project-upgrade-changeset` — The single CLI engine is the mechanism that applies a template-version upgrade as a reviewable, non-destructive change set.
* `cpt-frontx-fr-cli-upgrade-review-approval` — The change set is approvable before application; the engine writes nothing to project files until the developer approves, satisfying this requirement's human-in-control guarantee.
* `cpt-frontx-usecase-ai-driven-template-upgrade` — This decision sets the boundary the use case relies on: the AI orchestration analyses and enriches, and the CLI engine computes and applies the change set the developer approves.
* `cpt-frontx-component-cli` — The CLI component owns the change-set engine; this decision constrains that ownership and its reviewability, non-destructiveness, and reversibility.
