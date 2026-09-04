---
status: accepted
date: 2026-09-04
---

# Which Repository Holds the FrontX Templates

<!-- toc -->

- [Context and Problem Statement](#context-and-problem-statement)
- [Decision Drivers](#decision-drivers)
- [Considered Options](#considered-options)
- [Decision Outcome](#decision-outcome)
  - [Consequences](#consequences)
  - [Confirmation](#confirmation)
- [Pros and Cons of the Options](#pros-and-cons-of-the-options)
  - [A dedicated templates repository holding the whole family](#a-dedicated-templates-repository-holding-the-whole-family)
  - [Keep the templates in the ecosystem repository](#keep-the-templates-in-the-ecosystem-repository)
  - [Keep the templates addressable here through a submodule or subtree](#keep-the-templates-addressable-here-through-a-submodule-or-subtree)
  - [One repository per template](#one-repository-per-template)
- [More Information](#more-information)
- [Traceability](#traceability)

<!-- /toc -->

**ID**: `cpt-frontx-adr-template-repository-separation`

## Context and Problem Statement

A template is a top-level directory carrying a `frontx-template.json` manifest (`cpt-frontx-adr-template-manifest-contract`). Three of them lived in this repository: `template-shell`, `template-mfe` and `template-design-guardrails`. The architecture already says templates are external. `cpt-frontx-adr-template-acquisition-and-location` decided the CLI bundles no template and resolves each one from an external source at runtime, and `cpt-frontx-adr-source-spec-syntax` decided a reference may name a subtree inside a source repository, so one repository can hold a family of templates. Until now that was true on paper only: the CLI shipped no template, but the templates it resolved sat in the same repository as the packages they consume, and every guard, test and release step written for them ran in the ecosystem's continuous integration.

Sharing one repository kept the templates and the packages moving together, and it also kept them entangled. Template-only guards ran on every ecosystem change. Ecosystem test tooling borrowed configuration from a template. The CLI's end-to-end tests reached for the real templates sitting next to them, which is a reach no consumer can make. Which repository should hold the templates, so that the physical layout matches the layer partition the architecture already states?

## Decision Drivers

* **Layout should match the stated architecture** — the PRD and DESIGN already place templates in their own layer, hosted outside this repository and resolved by versioned source-spec. A layout that contradicts the artifacts makes the artifacts unreliable, and it lets code quietly grow dependencies the architecture forbids.
* **Consume the templates the way a developer does** — while the real templates sit beside the CLI, a test can read them from disk. That path does not exist for anyone else, so it proves nothing about resolution and hides breakage in the path that matters.
* **Independent cadence** — templates are versioned and published by their owners on a schedule unrelated to the packages (`cpt-frontx-principle-per-concern-versioning`). A shared repository ties them to one branch, one review queue and one release train.
* **One repository, one subject** — the ecosystem repository's guards, its release pipeline and its artifact tree describe published packages, the CLI and the AI tooling kit. Template-only machinery in the same repository gives it a second subject and a second reason to change.
* **Keep the family together** — the three templates share conventions, share the packages they pin, and are reviewed by the same people. Whatever holds them should let one change touch several of them at once.
* **Drift must still be caught** — the shell template pins ecosystem packages and mirrors some of their configuration. Separating the repositories must not turn that into an unwatched divergence.

## Considered Options

* **A dedicated templates repository holding the whole family** — the templates move to `constructorfabric/gears-frontx-templates`, one top-level directory per template, each addressed by the subtree form of a source-spec.
* **Keep the templates in the ecosystem repository** — the status quo: template directories at this repository's root, template-only guards in this repository's continuous integration, and the CLI's tests reading the real templates from disk.
* **Keep the templates addressable here through a submodule or subtree** — the templates get their own repository, and this repository embeds it as a git submodule or a git subtree so the directories still appear at the root.
* **One repository per template** — `template-shell`, `template-mfe` and `template-design-guardrails` each get a repository of their own.

## Decision Outcome

Chosen option: **A dedicated templates repository holding the whole family**, because it is the only option that makes the layout agree with the layer partition while keeping the three templates in one place to review and release together.

The templates leave this repository and live in **`constructorfabric/gears-frontx-templates`**, one top-level directory per template. A consumer addresses one by the subtree form the source-spec already defines, for example `github:constructorfabric/gears-frontx-templates//template-shell@<ref>`. Nothing in the resolution mechanism changes: this decision is the physical realization of `cpt-frontx-adr-template-acquisition-and-location` and of the subtree addressing in `cpt-frontx-adr-source-spec-syntax`, not an amendment to either. The CLI's zero-template-content constraint (`cpt-frontx-constraint-cli-template-independence`) is unchanged and still enforced here.

**After this change no template directory exists in this repository.** Everything that existed only to serve them goes with them. The template-only guards leave: manifest validation, the lockfile self-link check, the token-format check, the guideline-index generation, the template composition job and the template publish pipeline. Version-bump governance for the packages a template contains moves to the templates repository, which now owns their release. The CLI's end-to-end tests stop reading the real templates and use **synthetic fixture templates** instead, which is also the honest test: a fixture is resolved through the same path a consumer uses, and it does not break when an unrelated template changes. `packages/api` stops borrowing the shell template's vitest configuration and carries its own.

**The drift check becomes a cross-repository check.** Comparison between the ecosystem's `packages/*` and what the shell template pins and mirrors now runs **in the templates repository**, against a checkout of this repository. It finds that checkout as a sibling directory, named by the `FRONTX_ECOSYSTEM_DIR` convention, and falls back to the package registry when no sibling checkout is present. The check moves to the side that can act on its result: a drift is fixed by re-pinning the template.

**Release sequencing becomes cross-repository and ordered.** The ecosystem packages publish first. The templates repository then re-pins to the published versions and publishes after. A change that spans both is two pull requests in that order, and the second one cannot be prepared until the first has published.

The scope of this decision is which repository holds the templates and what moves with them. It does not decide the manifest contract (`cpt-frontx-adr-template-manifest-contract`), the source-spec form (`cpt-frontx-adr-source-spec-syntax`), how the CLI applies or upgrades a template (`cpt-frontx-adr-uniform-template-mechanism`), or whether the templates repository authors an artifact tree of its own, which is that repository's decision to make (see More Information).

### Consequences

* Good, because the repository layout now matches what the PRD and DESIGN already state, so a reader is not told one thing by the artifacts and another by the directory listing.
* Good, because the CLI is exercised the way a developer uses it: every template it resolves in a test is resolved through the source-spec path, from a fixture rather than from a neighbouring directory.
* Good, because the ecosystem repository has one subject again. Its guards, its pipeline and its artifact tree describe published packages, the CLI and the AI tooling kit, and nothing else.
* Good, because the templates release on their own cadence, in their own review queue, without waiting for an ecosystem release or dragging one along.
* Good, because the three templates stay together, so a convention that spans them is changed once.
* Bad, because a change spanning both repositories is now two pull requests in a fixed order, and the second waits for the first to publish. Work that used to be one atomic commit is no longer atomic.
* Bad, because drift between the packages and what the shell template pins is caught later. It surfaces on the templates repository's schedule rather than on the ecosystem pull request that caused it.
* Bad, because the cross-repository drift check needs a checkout of this repository to compare against, so it carries a setup convention that a single-repository check did not need.
* Bad, because a contributor working across the boundary needs both repositories checked out and needs to know the sibling-directory convention.

### Confirmation

Compliance is confirmed by the repository state and by continuous integration. No top-level directory in this repository carries a `frontx-template.json` manifest, and template discovery over this repository returns an empty set. No template-only guard, job or publish step remains in this repository's continuous integration. The CLI's end-to-end tests resolve only synthetic fixture templates and no test reads a path that would have been a template directory. The CLI boundary check for `cpt-frontx-constraint-cli-template-independence` continues to pass unchanged, since the CLI bundled no template before this change either. On the other side, the templates repository runs the drift check against an ecosystem checkout and fails when a template's pins no longer match the packages it compares to. Review confirms that a change spanning both repositories publishes the ecosystem packages before the templates repository re-pins to them.

## Pros and Cons of the Options

### A dedicated templates repository holding the whole family

All three templates move to one repository, one top-level directory each, addressed by the source-spec's subtree form.

* Good, because the layout matches the layer partition and the resolution mechanism needs no change to support it.
* Good, because the family stays together, so shared conventions are changed once and reviewed once.
* Good, because each repository keeps one subject, one guard set and one release pipeline.
* Neutral, because it relies on subtree addressing, which the source-spec already defines and the resolver already implements.
* Bad, because cross-boundary changes become ordered pairs of pull requests, and drift is caught later than it was.

### Keep the templates in the ecosystem repository

Leave the template directories at this repository's root, with their guards and release steps in its continuous integration.

* Good, because a change spanning packages and templates stays one atomic commit, and drift is caught immediately.
* Good, because it needs no migration and no cross-repository convention.
* Bad, because the layout contradicts the architecture, which states templates are hosted outside this repository.
* Bad, because it lets the CLI's tests read real templates from disk, a path no consumer has, so resolution stays under-tested.
* Bad, because template-only machinery gives the ecosystem repository a second subject and slows every unrelated change with guards that do not apply to it.
* Bad, because templates cannot release on their own cadence.

### Keep the templates addressable here through a submodule or subtree

Give the templates their own repository, then embed it so the directories still appear at this repository's root.

* Good, because it separates ownership and history while keeping a single working tree for contributors.
* Neutral, because the templates would still be resolvable by source-spec from their own repository.
* Bad, because the directories still appear here, so every path-based guard, discovery script and test can still reach them, and the entanglement this decision removes stays reachable.
* Bad, because it adds submodule or subtree mechanics — pointer commits, sync steps, partial clones — to every contributor and every job, in exchange for an appearance the separation was meant to end.

### One repository per template

Each template gets a repository of its own.

* Good, because each template has the smallest possible blast radius and the most independent release.
* Neutral, because the source-spec addresses a whole repository just as easily as a subtree of one.
* Bad, because a convention shared by all three is changed three times, in three reviews, with three chances to diverge.
* Bad, because the cross-repository drift check would be set up and maintained three times.
* Bad, because it multiplies repository administration ahead of any demonstrated need for the templates to move apart.

## More Information

**What this settles for `cpt-frontx-adr-template-territory-traceability`**: that decision deferred whether template territory would eventually carry an artifact tree of its own, pending the template split. This decision is that split, and it settles **where** template territory lives: in `constructorfabric/gears-frontx-templates`. It does **not** settle whether that repository authors an artifact tree — that is now the templates repository's own decision, made under its own governance, and no longer a deferral this repository holds open. Within this repository the question is closed by absence: no template territory remains here, so the residue-marker rule retires along with the directories it applied to.

The externalization this decision realizes is `cpt-frontx-adr-template-acquisition-and-location`; the subtree addressing that lets one repository hold a family is `cpt-frontx-adr-source-spec-syntax`; the manifest that identifies a template is `cpt-frontx-adr-template-manifest-contract`. These are non-binding pointers and do not form part of this decision's durable identity.

Applicability of the remaining checklist categories: **REL** — Not applicable, because no runtime behaviour changes and no failure mode is introduced; resolution works exactly as it did, against a different host repository. **PERF** — Not applicable, because no latency or throughput budget is bound to where a source repository lives. **SEC** — Not applicable, because no secret material or authentication surface is introduced; the templates repository is public and read the same way as any other source. **DATA** — Not applicable, because no schema is fixed here. **INT** — addressed: the integration surface between the two repositories is the published package versions a template pins and the source-spec a consumer resolves; the cross-repository drift check is what keeps the pinning side honest. **OPS** — addressed: release sequencing is now ordered across two repositories, ecosystem first and templates second, and the drift check needs an ecosystem checkout to compare against. **MAINT** — addressed: each repository keeps one subject, one guard set and one release pipeline, at the cost of ordered cross-repository changes. **COMPL** — Not applicable. **UX** — addressed for the contributor: a change that spans the boundary needs both repositories and the sibling-checkout convention, which is the main cost this decision imposes on daily work. **BIZ** — Not applicable, because product requirements live in the PRD and are cited here by ID.

## Traceability

- **PRD**: [PRD.md](../PRD.md)
- **DESIGN**: [DESIGN.md](../DESIGN.md)

This decision directly addresses the following requirements and design elements:

* `cpt-frontx-adr-template-acquisition-and-location` — That decision externalized templates and made the CLI resolve them by source-spec; this decision is its physical realization, moving the templates to the external repository the mechanism already assumed.
* `cpt-frontx-adr-source-spec-syntax` — The subtree form of a reference is what lets one repository hold the whole template family, and it is the form consumers now use to address each template.
* `cpt-frontx-constraint-cli-template-independence` — The CLI's zero-template-content constraint is unaffected and stays enforced here; this decision removes the last way a test could reach a real template without going through the resolver.
* `cpt-frontx-principle-template-agnostic-tooling` — The tooling bundles no template or solution content; separating the repositories draws the same line through the repository layout, so the decoupling holds in the directory structure as well as in the code.
* `cpt-frontx-principle-per-concern-versioning` — Templates now version and release on their own line, in their own repository, rather than sharing this repository's branch and release train.
* `cpt-frontx-adr-template-territory-traceability` — That decision put template territory outside the ecosystem artifact universe and deferred where it would eventually live; this decision settles that it lives in its own repository, and leaves the artifact-tree question to that repository.
* `cpt-frontx-nfr-evolvability` — Each repository can now evolve on its own cadence, and the ecosystem repository stops carrying guards and pipeline steps that belong to content it no longer holds.
