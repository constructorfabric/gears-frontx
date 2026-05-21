---
status: accepted
date: 2026-01-04
---

# Automated Layer-Ordered NPM Publishing


<!-- toc -->

- [Context and Problem Statement](#context-and-problem-statement)
- [Decision Drivers](#decision-drivers)
- [Considered Options](#considered-options)
- [Decision Outcome](#decision-outcome)
  - [Consequences](#consequences)
  - [Confirmation](#confirmation)
- [Pros and Cons of the Options](#pros-and-cons-of-the-options)
  - [Custom GitHub Actions workflow with explicit layer order](#custom-github-actions-workflow-with-explicit-layer-order)
  - [Changesets](#changesets)
  - [Lerna](#lerna)
  - [Manual publishing](#manual-publishing)
- [More Information](#more-information)
- [Traceability](#traceability)

<!-- /toc -->

**ID**: `cpt-frontx-adr-automated-layer-ordered-publishing`
## Context and Problem Statement

FrontX's monorepo has 9 packages arranged in a layered architecture where higher layers depend on the published versions of lower layers. Manual publishing is error-prone because publishing in the wrong order breaks installs. Managing 9 packages individually — each requiring version checks and NPM credentials — is tedious and does not scale.

## Decision Drivers

* Publishing order must match dependency graph to guarantee resolution
* Re-running the workflow must be safe — idempotency is required
* Transient NPM registry failures must not abort the entire publish run
* Solution complexity must match the monorepo's size — avoid heavy tooling

## Considered Options

* Custom GitHub Actions workflow with explicit layer order
* Changesets
* Lerna
* Manual publishing

## Decision Outcome

Chosen option: "Custom GitHub Actions workflow with explicit layer order", because sequential publishing in explicit dependency layer order guarantees resolution, version diff detection is simple and reliable, and NPM registry idempotency checks make re-runs safe. A single workflow file is easy to maintain and matches FrontX's simplicity principles.

### Consequences

* Good, because publishing is hands-free, layer order is guaranteed, the workflow is idempotent, and transient failures are retried with exponential backoff (5 s, 10 s, 20 s)
* Bad, because a custom workflow requires ongoing maintenance, and sequential layer publishing is slower than parallel

### Confirmation

`.github/workflows/publish.yml` implements the workflow. The layer order declared in the workflow (SDK → Framework → React → Studio → CLI) matches the build order defined in root `package.json` scripts.

## Pros and Cons of the Options

### Custom GitHub Actions workflow with explicit layer order

* Good, because it is purpose-built for FrontX's exact layer count and dependency graph
* Bad, because it is custom code that must be maintained as the layer structure evolves

### Changesets

* Good, because it is a widely adopted monorepo versioning and publishing tool with rich features
* Bad, because it adds complexity and ceremony that exceeds the needs of a 9-package monorepo

### Lerna

* Good, because it has native monorepo publish support
* Bad, because it relies on deprecated patterns and introduces unnecessary abstraction

### Manual publishing

* Good, because no tooling is required
* Bad, because it is error-prone, depends on human discipline for correct order, and does not scale

## More Information

- GitHub Actions documentation: https://docs.github.com/en/actions
- Related workflow: `.github/workflows/publish.yml`

## Traceability

- **PRD**: [PRD.md](../PRD.md)
- **DESIGN**: [DESIGN.md](../DESIGN.md)

This decision directly addresses:

* `cpt-frontx-fr-pub-ci` — CI-driven publishing trigger on PR merge to main
* `cpt-frontx-fr-pub-versions` — version change detection via git diff
* `cpt-frontx-fr-pub-metadata` — NPM registry idempotency check before publish
* `cpt-frontx-component-cli` — CLI package as the outermost publishing layer
