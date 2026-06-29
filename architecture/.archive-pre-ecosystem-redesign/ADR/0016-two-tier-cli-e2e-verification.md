---
status: accepted
date: 2026-03-10
---

# Two-Tier CLI E2E Verification Strategy

<!-- toc -->

- [Context and Problem Statement](#context-and-problem-statement)
- [Decision Drivers](#decision-drivers)
- [Considered Options](#considered-options)
- [Decision Outcome](#decision-outcome)
  - [Consequences](#consequences)
  - [Confirmation](#confirmation)
- [Pros and Cons of the Options](#pros-and-cons-of-the-options)
  - [Two-tier: required PR gate + non-required nightly](#two-tier-required-pr-gate--non-required-nightly)
  - [Single required workflow with full coverage](#single-required-workflow-with-full-coverage)
  - [No required CLI e2e gate](#no-required-cli-e2e-gate)
- [More Information](#more-information)
- [Traceability](#traceability)

<!-- /toc -->

**ID**: `cpt-frontx-adr-two-tier-cli-e2e-verification`

## Context and Problem Statement

The CLI package generates complete FrontX projects, but existing CI only validated the CLI package build itself — not the generated project. A freshly scaffolded app could fail during `npm install`, `npm run build`, or `npm run type-check` without triggering any required PR check. The generated project now includes MFE bootstrap and manifest-generation scripts, making a package-level build check insufficient. The CI must prove the real scaffold path works, but running every CLI scenario as a required PR gate would increase merge latency unacceptably.

## Decision Drivers

* The generated project is the CLI's primary deliverable — its correctness must be gated
* PR merge latency must stay acceptable for contributors
* Broader CLI regression coverage (custom UIKit, layer scaffolds, migrate, invalid names) should not block merges
* Failures must be diagnosable without SSH access to CI runners

## Considered Options

* Two-tier: required PR gate (critical path only) + non-required nightly (broad coverage)
* Single required workflow with full coverage
* No required CLI e2e gate (rely on manual testing)

## Decision Outcome

Chosen option: "Two-tier: required PR gate + non-required nightly", because the required PR gate runs only the critical default scaffold path (create, install, build, type-check, validate, scaffold layout, ai sync) on a single matrix entry (ubuntu-latest, Node 24.14.x), keeping latency manageable. The nightly/manual workflow covers broader scenarios — `--uikit none`, layer scaffolds (`sdk`, `framework`, `react`), `migrate --list`, `migrate --status`, invalid-name rejection, and `ai sync --diff` idempotency — without blocking merges.

Both tiers share the same scripted e2e harness (`packages/cli/scripts/e2e-lib.mjs`) so that local and CI execution follow identical flows. Step-level logs and JSON summaries are uploaded as CI artifacts for diagnosis.

### Consequences

* Good, because the critical scaffold path is protected by a required PR check, broader regressions are caught nightly without blocking merges, and the shared harness enables local reproduction
* Bad, because nightly failures are not immediately visible to PR authors, and a two-workflow setup adds maintenance surface

### Confirmation

`.github/workflows/cli-pr.yml` exists with required job `cli-pr-e2e` on ubuntu-latest + Node 24.14.x. `.github/workflows/cli-nightly.yml` exists with `schedule` and `workflow_dispatch` triggers. Both workflows invoke scripts from `packages/cli/scripts/e2e-*.mjs` and upload artifacts unconditionally.

## Pros and Cons of the Options

### Two-tier: required PR gate + non-required nightly

* Good, because PR latency is bounded to a single critical scenario while broad coverage runs on schedule
* Good, because the same harness scripts can run locally with `npm run test:e2e:pr`
* Bad, because nightly regressions may not be noticed until the next morning

### Single required workflow with full coverage

* Good, because all regressions block the PR immediately
* Bad, because merge latency increases significantly (multiple scaffolds, npm installs, builds)
* Bad, because flaky edge-case scenarios would block unrelated PRs

### No required CLI e2e gate

* Good, because no additional CI cost or latency
* Bad, because scaffold regressions reach main undetected — the primary CLI deliverable has no automated gate

## More Information

- Related: ADR 0015 (CLI Template-Based Code Generation) — the template system whose output this verification validates
- The PR workflow pins Node 24.14.x because generated projects declare `engines.node >=24.14.0`

## Traceability

- **PRD**: [PRD.md](../PRD.md)
- **DESIGN**: [DESIGN.md](../DESIGN.md)

This decision directly addresses:

* `cpt-frontx-fr-cli-e2e-verification` — required PR gate and nightly coverage for CLI scaffold path
* `cpt-frontx-component-cli` — CLI package scope
