---
status: superseded
superseded_by: cpt-frontx-adr-atomic-all-targets-upgrade
date: 2026-06-04
---

# The Per-Applied-Template Upgrade Mechanism

<!-- toc -->

- [Context and Problem Statement](#context-and-problem-statement)
- [Decision Drivers](#decision-drivers)
- [Considered Options](#considered-options)
- [Decision Outcome](#decision-outcome)
  - [Consequences](#consequences)
  - [Confirmation](#confirmation)
- [Pros and Cons of the Options](#pros-and-cons-of-the-options)
  - [Single per-template change-set engine in the CLI; AI orchestrates and enriches it](#single-per-template-change-set-engine-in-the-cli-ai-orchestrates-and-enriches-it)
  - [Split engines: a CLI engine and a separate AI engine](#split-engines-a-cli-engine-and-a-separate-ai-engine)
  - [AI-only engine](#ai-only-engine)
- [More Information](#more-information)
- [Traceability](#traceability)

<!-- /toc -->

**ID**: `cpt-frontx-adr-project-upgrade-mechanism`

## Context and Problem Statement

A repository is assembled from one or more independently-applied templates, and each applied template must be able to adopt a newer version of that same template without the developer hand-editing files or risking unreviewed changes, independently of the other applied templates (`cpt-frontx-fr-cli-project-upgrade-changeset`); no modification may reach the repository's files without the developer's explicit approval (`cpt-frontx-fr-cli-upgrade-review-approval`). This requires a mechanism that, for a chosen applied template, computes the difference between the version it was applied from and a newer one, expresses it as something a human can examine and approve, and applies it without destroying work in progress or disturbing the other applied templates. Two design questions follow: what is the unit of this mechanism (a per-template diff-and-apply engine over template versions), and where does it live relative to the AI-driven upgrade workflow that a developer's agent uses to analyse and enrich the change (`cpt-frontx-usecase-ai-driven-template-upgrade`)?

## Decision Drivers

* **Per-applied-template independence** — each applied template upgrades on its own cadence against its own provenance baseline (`cpt-frontx-adr-project-provenance-record`), so the engine operates on one applied template at a time and must leave the others untouched.
* **Reviewable before applied** — the result of an upgrade computation must be an approvable artifact a developer examines and accepts or declines before anything is written, so a human stays in control of every change.
* **Non-destructive application** — applying an approved change must not silently overwrite developer modifications; the engine must produce a change set whose application is bounded and recoverable rather than an in-place blind overwrite.
* **Reversibility** — an applied change set must be reversible to the pre-upgrade state, so an upgrade that proves unwanted can be rolled back cleanly.
* **One authoritative computation** — the difference between two template versions and its application must be computed in exactly one place, so the change a developer reviews is the same change that is applied, with no second, divergent implementation, for every applied template.
* **Reuse across invokers** — the same engine must serve both a direct developer invocation and an AI-driven workflow, so upgrade behaviour does not fork by who triggers it.
* **Engine independent of AI availability** — the core upgrade capability must function whether or not an AI agent is present; AI enriches the experience but is not a precondition for upgrading.

## Considered Options

* **Single per-template change-set engine in the CLI; AI orchestrates and enriches it** — one engine in the `@gears-frontx/cli` package computes, for a chosen applied template, a template-version-diff change set against that template's provenance record, presents it for approval, applies it non-destructively within that template's boundary, and supports rollback; the AI upgrade workflow invokes this engine per template and enriches the experience (change analysis, downstream-impact assessment) alongside it.
* **Split engines: a CLI engine and a separate AI engine** — the CLI carries one diff-and-apply implementation and the AI workflow carries its own, each computing and applying upgrades independently.
* **AI-only engine** — the diff-and-apply capability lives entirely in the AI workflow; the CLI exposes no standalone upgrade engine and an upgrade requires the AI agent.

## Decision Outcome

Chosen option: **Single per-template change-set engine in the CLI; AI orchestrates and enriches it**, because it is the only option that gives one authoritative computation while still serving both a direct invocation and an AI-driven workflow, for each applied template independently. A generic template-version-diff engine in the CLI takes one applied template, reads its provenance record as the baseline (`cpt-frontx-adr-project-provenance-record`), computes the change between the version it was applied from and a target version, expresses it as an approvable change set, applies it non-destructively within that template's ownership boundary, and supports rollback to the pre-upgrade state — leaving the other applied templates and their provenance records unchanged.

The boundary with AI is explicit: the single change-set engine lives in the **CLI**, and the AI-driven upgrade orchestration decided in `cpt-frontx-adr-ai-driven-upgrade-orchestration` **invokes and enriches** that engine per applied template — running alongside it, not subordinating or replacing it. The AI workflow contributes change analysis and downstream-impact assessment around the engine's change set; it does not compute or apply the change set itself. This keeps the engine usable without AI and guarantees the change a developer reviews is exactly the change the engine applies. The split-engines option fails the one-authoritative-computation and no-fork drivers and risks the reviewed change diverging from the applied change; the AI-only option fails the engine-independent-of-AI driver by making every upgrade require an agent.

The scope of this decision is the upgrade engine's unit (one applied template at a time) and ownership and its reviewability, non-destructiveness, and reversibility. It does not decide the AI orchestration workflow's own shape (`cpt-frontx-adr-ai-driven-upgrade-orchestration`), how a template reference resolves to a version (`cpt-frontx-adr-template-acquisition-and-location`), the per-applied-template provenance the engine diffs against (`cpt-frontx-adr-project-provenance-record`), nor the local-update path that refreshes an installed template without touching a repository.

### Consequences

* Good, because one engine computes and applies the change set for each applied template, so the reviewed change and the applied change are guaranteed identical.
* Good, because each applied template upgrades independently against its own provenance baseline, leaving the other applied templates untouched.
* Good, because the upgrade capability is available by direct CLI invocation and does not require an AI agent to be present.
* Good, because non-destructive application plus rollback makes adopting a newer template version safe and recoverable.
* Good, because the AI workflow can enrich the upgrade (analysis, impact assessment) without re-implementing the engine, keeping the two concerns layered cleanly.
* Bad, because a single generic diff engine must handle template-shaped changes it cannot always merge automatically; some changes surface as conflicts the developer must resolve during review.
* Bad, because rollback requires the engine to retain enough pre-upgrade state to reverse an applied change set, which is state the engine must manage and bound per applied template.

### Confirmation

Compliance is confirmed by continuous-integration checks on the CLI package: a fixture repository assembled from two templates, one at an older version, is upgraded for that one template and the check asserts (a) the engine produces an approvable change set and writes nothing to repository files until approval, (b) declining the change set leaves the repository byte-for-byte unchanged, (c) applying the approved change set then rolling it back restores the pre-upgrade state, (d) the other applied template and its provenance record are unaffected, and (e) the AI orchestration path drives the same engine rather than a second implementation. Design and code review confirm the diff-and-apply computation exists in exactly one place in the `@gears-frontx/cli` package and that the AI workflow calls into it.

## Pros and Cons of the Options

### Single per-template change-set engine in the CLI; AI orchestrates and enriches it

One CLI engine computes, presents, applies, and reverses the change set for one applied template at a time; the AI workflow invokes and enriches it alongside.

* Good, because there is exactly one authoritative diff-and-apply computation for every applied template.
* Good, because each applied template upgrades independently, and the engine works with or without AI.
* Good, because reviewability, non-destructive apply, and rollback are properties of one engine and apply uniformly to every invoker and every applied template.
* Neutral, because it defines a clean invocation boundary the AI orchestration decision depends on.
* Bad, because the engine carries the per-template rollback state it must manage, and some template-shaped changes still require manual conflict resolution.

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

The AI-driven upgrade orchestration that invokes and enriches this engine is decided in `cpt-frontx-adr-ai-driven-upgrade-orchestration`; that decision sits alongside, not above, this one. The per-applied-template provenance baseline the engine diffs against is decided in `cpt-frontx-adr-project-provenance-record`. Resolution of a template reference to a target version is performed by the shared resolver decided in `cpt-frontx-adr-template-acquisition-and-location`. These are non-binding pointers to related decisions and are not part of this decision's durable identity.

Reliability treatment (REL): the change-set model is the engine's reliability design. **Failure modes** — a target version that cannot be resolved, or a change the engine cannot apply cleanly, surfaces during computation or review, before any repository file is written; the applied template stays at its current version and the other applied templates are untouched. **Non-destructive apply** — application is gated behind explicit approval and writes only the approved change set within the template's boundary. **Recovery / rollback** — an applied change set is reversible to the pre-upgrade state, so an unwanted upgrade is recoverable at the change-set level. **Single point of failure** — the single engine is deliberately the one authoritative computation; its reliability properties are proven once and apply to every invoker and every applied template (the Confirmation defines those checks). **Operational readiness (REL-ADR-002)**: rollback strategy is the change-set reversal above; service-oriented items — deployment complexity, monitoring, alerting, runbooks, SLA — are Not applicable, because this is a local developer command with no running service, no availability target, and no operational on-call surface.

Applicability of the remaining checklist categories:

* **PERF** — Not applicable, because there is no latency or throughput budget bound to a local upgrade command.
* **SEC** — Not applicable, because the decision introduces no secret material and no authentication surface.
* **DATA** — Not applicable, because no persistent database or schema is defined here; the pre-upgrade state the engine retains for rollback is an implementation concern, not a schema decision.
* **OPS** — Not applicable, per the operational-readiness note above.
* **COMPL** — Not applicable, because no regulatory obligation bears on the engine.
* **UX** — addressed implicitly: review-then-approve keeps the developer in control.
* **MAINT** — addressed: one engine is one place to maintain the upgrade behaviour for every applied template.
* **Review cadence**: revisit if AI enrichment ever needs to alter the change set the engine computes (which would pressure the alongside-not-subordinate boundary), or if template-shaped changes routinely defeat automatic application.

## Traceability

- **PRD**: [PRD.md](../PRD.md)
- **DESIGN**: [DESIGN.md](../DESIGN.md)

This decision directly addresses the following requirements and design elements:

* `cpt-frontx-fr-cli-project-upgrade-changeset` — The single CLI engine is the mechanism that applies a per-applied-template version upgrade as a reviewable, non-destructive change set, each applied template upgraded independently against its own provenance baseline.
* `cpt-frontx-fr-cli-upgrade-review-approval` — The change set is approvable before application; the engine writes nothing to repository files until the developer approves, satisfying this requirement's human-in-control guarantee.
* `cpt-frontx-usecase-ai-driven-template-upgrade` — This decision sets the boundary the use case relies on: the AI orchestration analyses and enriches, and the CLI engine computes and applies the per-template change set the developer approves.
* `cpt-frontx-component-cli` — The CLI component owns the change-set engine; this decision constrains that ownership and its per-template, reviewable, non-destructive, reversible operation.
