# Feature: Publishing Pipeline


<!-- toc -->

- [1. Feature Context](#1-feature-context)
  - [1.1 Overview](#11-overview)
  - [1.2 Purpose](#12-purpose)
  - [1.3 Actors](#13-actors)
  - [1.4 References](#14-references)
- [2. Actor Flows (CDSL)](#2-actor-flows-cdsl)
  - [Publish on PR Merge](#publish-on-pr-merge)
  - [Publish Single Package](#publish-single-package)
  - [Developer Version Bump](#developer-version-bump)
  - [Gitflow Channel Publishing](#gitflow-channel-publishing)
  - [Build-Time Version Injection](#build-time-version-injection)
- [3. Processes / Business Logic (CDSL)](#3-processes--business-logic-cdsl)
  - [Resolve Dist-Tag](#resolve-dist-tag)
  - [Publish with Retry](#publish-with-retry)
  - [Detect Version Changes](#detect-version-changes)
  - [Validate Package Metadata](#validate-package-metadata)
  - [Layer Sort Order](#layer-sort-order)
- [4. States (CDSL)](#4-states-cdsl)
  - [Workflow Run State](#workflow-run-state)
  - [Package Publish State](#package-publish-state)
- [5. Definitions of Done](#5-definitions-of-done)
  - [Package Metadata Contract](#package-metadata-contract)
  - [Version Alignment](#version-alignment)
  - [Automated CI Publish Workflow](#automated-ci-publish-workflow)
  - [Idempotent Registry Check](#idempotent-registry-check)
- [6. Acceptance Criteria](#6-acceptance-criteria)
- [Additional Context](#additional-context)
  - [Build Order vs. Publish Order](#build-order-vs-publish-order)
  - [Prerelease Dist-Tag Strategy](#prerelease-dist-tag-strategy)
  - [Fail-Fast vs. Continue-on-Error](#fail-fast-vs-continue-on-error)
  - [Architecture Enforcement Connection](#architecture-enforcement-connection)
  - [Non-Applicable Domains](#non-applicable-domains)

<!-- /toc -->

- [x] `p2` - **ID**: `cpt-frontx-featstatus-publishing-pipeline`

- [x] `p2` - `cpt-frontx-feature-publishing-pipeline`
---

## 1. Feature Context

### 1.1 Overview

Automated NPM package publishing pipeline for the FrontX monorepo. When a pull request that
bumps one or more `@gears-frontx/*` package versions is merged to `main`, the CI/CD system detects
which packages changed, builds them in strict layer order, verifies each version does not
already exist on the NPM registry, and publishes affected packages with an appropriate dist-tag.

**Problem**: Without automation, a developer must manually determine the correct build and
publish sequence, risk publishing packages out of order (breaking dependents), or
inadvertently re-publish an existing version.

**Primary value**: Zero-touch release — a version bump in a PR is the only manual act
required to ship a package.

**Key assumptions**: GitHub Actions has access to a valid `NPM_TOKEN` secret. All packages
live under `packages/` in the monorepo root and are built via `npm run build:packages`.

### 1.2 Purpose

Guarantee that every version bump merged to `main` results in a correct, idempotent, and
layer-ordered NPM publish with no human intervention after the PR merge.

Success criteria: A PR that bumps `@gears-frontx/state` from `0.3.0` to `0.4.0-alpha.0` triggers
exactly one publish of that version; subsequent re-runs of the same workflow skip it.

### 1.3 Actors

- `cpt-frontx-actor-ci-cd`
- `cpt-frontx-actor-build-system`
- `cpt-frontx-actor-developer`

### 1.4 References

- DECOMPOSITION: [feature #10 — Publishing Pipeline](../../DECOMPOSITION.md#210-publishing-pipeline--medium)
- DESIGN: [Layer Isolation principle](../../DESIGN.md#layer-isolation), [ESM-First constraint](../../DESIGN.md#esm-first-module-format)
- PRD: [PRD.md](../../PRD.md) — section 5.16 (Publishing)
- ADR: `cpt-frontx-adr-automated-layer-ordered-publishing`, `cpt-frontx-adr-esm-first-module-format`, `cpt-frontx-adr-channel-aware-version-locking`
- DESIGN: [Publishing Pipeline Architecture](../../DESIGN.md#38-publishing-pipeline-architecture)
- Workflow source: [`.github/workflows/publish-packages.yml`](../../../.github/workflows/publish-packages.yml)

---

## 2. Actor Flows (CDSL)

### Publish on PR Merge

- [x] `p1` - **ID**: `cpt-frontx-flow-publishing-pipeline-publish-on-merge`

**Actors**: `cpt-frontx-actor-ci-cd`, `cpt-frontx-actor-build-system`

**Trigger**: Push event on the `main` branch (GitHub Actions `push: branches: [main]`)

1. [x] `p1` - CI/CD checks out the full git history (`fetch-depth: 0`) to enable commit comparison — `inst-checkout`
2. [x] `p1` - CI/CD iterates over every directory under `packages/`; FOR EACH package directory, reads its `package.json` — `inst-iter-packages`
3. [x] `p1` - CI/CD diffs `HEAD` against `github.event.before` (the pre-push commit SHA) — `inst-diff-head`
4. [x] `p1` - IF `package.json` of the current directory appears in the diff AND the version value changed THEN the package is added to the candidate list with its `name`, `dir`, and `version` — `inst-detect-version-change`
5. [x] `p1` - IF no candidates found THEN CI/CD logs "No packages with version changes to publish" and exits with status 0 — `inst-no-changes-exit`
6. [x] `p1` - CI/CD sorts candidates by layer priority: L1 SDK packages (`state`, `screensets`, `api`, `i18n`) → L2 (`framework`) → L3 (`react`) → Studio → CLI — `inst-sort-by-layer`
7. [x] `p1` - CI/CD runs `npm ci` to install dependencies — `inst-install-deps`
8. [x] `p1` - CI/CD runs `npm run build:packages` to build all packages in layer order — `inst-build-packages`
9. [x] `p1` - FOR EACH package in the sorted candidate list, CI/CD runs the publish sub-flow using `cpt-frontx-flow-publishing-pipeline-publish-single-package` — `inst-publish-each`
10. [x] `p1` - CI/CD emits a job summary listing all published and skipped packages — `inst-summary`

---

### Publish Single Package

- [x] `p1` - **ID**: `cpt-frontx-flow-publishing-pipeline-publish-single-package`

**Actors**: `cpt-frontx-actor-ci-cd`

**Precondition**: Package has been built; `NODE_AUTH_TOKEN` env var is set from `NPM_TOKEN` secret.

1. [x] `p1` - CI/CD determines the dist-tag by applying `cpt-frontx-algo-publishing-pipeline-resolve-dist-tag` to the package version — `inst-resolve-tag`
2. [x] `p1` - CI/CD queries NPM registry: `npm view <name>@<version> version` — `inst-npm-view`
3. [x] `p1` - IF the version already exists on NPM THEN CI/CD logs "Skipping `<name>@<version>` — already exists on NPM" and continues to the next package — `inst-skip-existing`
4. [x] `p1` - CI/CD changes working directory to `packages/<dir>` — `inst-cd-pkg`
5. [x] `p1` - CI/CD calls `cpt-frontx-algo-publishing-pipeline-publish-with-retry` with the resolved dist-tag — `inst-call-retry-algo`
6. [x] `p1` - IF all retry attempts fail THEN CI/CD logs "FAILED: `<name>@<version>` publish failed after retries" and exits with status 1, stopping all further publishing — `inst-fail-fast`
7. [x] `p1` - IF publish succeeds THEN CI/CD logs "SUCCESS: Published `<name>@<version>`" and records the package in the published list — `inst-record-success`

---

### Developer Version Bump

- [x] `p2` - **ID**: `cpt-frontx-flow-publishing-pipeline-developer-version-bump`

**Actors**: `cpt-frontx-actor-developer`

**Purpose**: Describes the developer action that triggers the automated pipeline.

1. [x] `p2` - Developer updates `version` in one or more `packages/*/package.json` files — `inst-bump-version`
2. [x] `p2` - Developer ensures all bumped packages share the same version number (aligned versioning) — `inst-aligned-versions`
3. [x] `p2` - Developer opens a PR targeting `main`; CI (`main.yml`) validates architecture, types, and linting — `inst-pr-ci`
4. [x] `p2` - Developer merges the PR; GitHub triggers the publish workflow — `inst-merge-triggers`

---

### Gitflow Channel Publishing

- [x] `p2` - **ID**: `cpt-frontx-flow-publishing-pipeline-gitflow-channel-publish`

**Actors**: `cpt-frontx-actor-ci-cd`

**Trigger**: Push event on `develop`, `main`, `release/X.Y.Z`, or `release/vN` branch

1. [x] `p2` - CI/CD determines the source branch from `github.ref` — `inst-detect-branch`
2. [x] `p2` - CI/CD maps branch to dist-tag — `inst-branch-tag-map`:
   - `develop` → `alpha`
   - `main` → `latest` (with version-based fallback for safety)
   - `release/X.Y.Z` → `next` (short-lived RC branches)
   - `release/vN` → `vN` (long-lived maintenance branches, e.g. `release/v1` → `v1`)
3. [x] `p2` - CI/CD proceeds with existing publish-on-merge flow using the resolved dist-tag — `inst-delegate-publish`

---

### Build-Time Version Injection

- [x] `p2` - **ID**: `cpt-frontx-flow-publishing-pipeline-version-injection`

**Actors**: `cpt-frontx-actor-build-system`

**Trigger**: CLI build step (before `tsup`)

**ADR**: `cpt-frontx-adr-channel-aware-version-locking`

1. [x] `p2` - Build system runs `generate-versions.ts` script — `inst-run-gen-versions`
2. [x] `p2` - Script reads all `packages/*/package.json` files, extracts `name` and `version` — `inst-read-pkg-versions`
3. [x] `p2` - Script writes `src/generated/versions.ts` with exported constants mapping package names to version strings — `inst-write-versions-ts`
4. [x] `p2` - CLI generators import version constants from `src/generated/versions.ts` instead of hardcoded strings — `inst-import-versions`
5. [x] `p2` - `tsup` bundles the CLI with the generated version constants baked in — `inst-bundle-with-versions`

---

## 3. Processes / Business Logic (CDSL)

### Resolve Dist-Tag

- [x] `p1` - **ID**: `cpt-frontx-algo-publishing-pipeline-resolve-dist-tag`

Determines the NPM dist-tag for a given version string.

1. [x] `p1` - IF the version string contains `-alpha` THEN RETURN `"alpha"` — `inst-alpha-tag`
2. [x] `p1` - IF the version string contains `-beta` THEN RETURN `"beta"` — `inst-beta-tag`
3. [x] `p1` - IF the version string contains `-rc` THEN RETURN `"next"` — `inst-rc-tag`
4. [x] `p1` - RETURN `"latest"` — `inst-latest-tag`

---

### Publish with Retry

- [x] `p1` - **ID**: `cpt-frontx-algo-publishing-pipeline-publish-with-retry`

Attempts `npm publish --access public --tag <dist-tag>` with exponential backoff. Operates
inside the package directory (`packages/<dir>`). Maximum three attempts with delays of 5 s,
10 s, and 20 s between attempts.

1. [x] `p1` - Set `attempt = 1`, `delay = 5`, `max_attempts = 3` — `inst-init-retry`
2. [x] `p1` - TRY `npm publish --access public --tag <dist-tag>` — `inst-run-publish`
3. [x] `p1` - IF publish succeeds THEN RETURN success — `inst-publish-success`
4. [x] `p1` - CATCH publish failure: IF `attempt < max_attempts` THEN log "Attempt `<attempt>` failed. Retrying in `<delay>`s...", wait `delay` seconds, multiply `delay` by 2, increment `attempt`, and GOTO step 2 — `inst-retry-backoff`
5. [x] `p1` - IF `attempt == max_attempts` AND publish failed THEN log "All `<max_attempts>` attempts failed" and RETURN failure — `inst-exhausted`

---

### Detect Version Changes

- [x] `p1` - **ID**: `cpt-frontx-algo-publishing-pipeline-detect-version-changes`

Compares the current `HEAD` state against the pre-push commit to identify packages whose
`version` field changed.

1. [x] `p1` - Retrieve `BASE_COMMIT` from `github.event.before` — `inst-base-commit`
2. [x] `p1` - FOR EACH `packages/<dir>/package.json` file: check if the file path appears in `git diff <BASE_COMMIT> --name-only` — `inst-diff-check`
3. [x] `p1` - IF the file appears in the diff: read `OLD_VERSION` via `git show <BASE_COMMIT>:<path>`, read `NEW_VERSION` from the current file — `inst-read-versions`
4. [x] `p1` - IF `OLD_VERSION != NEW_VERSION` AND `NEW_VERSION` is non-empty THEN add the package to the candidate list — `inst-add-candidate`
5. [x] `p1` - RETURN the candidate list (may be empty) — `inst-return-candidates`

---

### Validate Package Metadata

- [x] `p2` - **ID**: `cpt-frontx-algo-publishing-pipeline-validate-metadata`

Each package's `package.json` must satisfy the publishing metadata contract before the
package is considered publishable. This validation is a pre-condition for a successful
`npm publish`; NPM itself enforces the `publishConfig` and `exports` presence.

Required fields for all packages:

- `author` set to `"Cyber Fabric"` or `"Cyber Fabric"`
- `license` set to `"Apache-2.0"`
- `publishConfig.access` set to `"public"`
- `files` array listing `"dist"` and at minimum a README
- `exports` map with at least a `"."` entry containing `import` and `require` conditions
- `type` field set to `"module"`
- `engines.node` set to `">=18.0.0"` or higher

1. [x] `p2` - FOR EACH required field: IF the field is absent or has an incorrect value THEN RETURN error identifying the missing field and the package — `inst-field-check`
2. [x] `p2` - IF all fields are present and valid THEN RETURN valid — `inst-metadata-valid`

---

### Layer Sort Order

- [x] `p1` - **ID**: `cpt-frontx-algo-publishing-pipeline-layer-sort`

Maps a package directory name to a numeric sort key that enforces the correct build and
publish order. Lower numbers publish first.

| Package `dir` | Sort key |
|--------------|---------|
| `state`, `screensets`, `api`, `i18n` | 1 (L1 SDK) |
| `framework` | 2 (L2) |
| `react` | 3 (L3) |
| `studio` | 4 (standalone, after react) |
| Any other directory (including `cli`) | 5 (tooling, always last) |

1. [x] `p1` - FOR EACH candidate package: assign its sort key using the table above — `inst-assign-key`
2. [x] `p1` - Sort the candidate list ascending by sort key — `inst-sort-asc`
3. [x] `p1` - RETURN the sorted list — `inst-return-sorted`

---

## 4. States (CDSL)

### Workflow Run State

- [x] `p1` - **ID**: `cpt-frontx-state-publishing-pipeline-workflow-run`

Describes the state of a single GitHub Actions publish workflow run from trigger to
completion.

1. [x] `p1` - **FROM** `IDLE` **TO** `DETECTING` **WHEN** push event fires on `main` — `inst-trigger`
2. [x] `p1` - **FROM** `DETECTING` **TO** `SKIPPED` **WHEN** no version changes are detected — `inst-no-changes`
3. [x] `p1` - **FROM** `DETECTING` **TO** `BUILDING` **WHEN** at least one version change is detected — `inst-has-changes`
4. [x] `p1` - **FROM** `BUILDING` **TO** `PUBLISHING` **WHEN** `npm run build:packages` completes successfully — `inst-build-done`
5. [x] `p1` - **FROM** `BUILDING` **TO** `FAILED` **WHEN** `npm run build:packages` exits with non-zero status — `inst-build-failed`
6. [x] `p1` - **FROM** `PUBLISHING` **TO** `SUCCEEDED` **WHEN** all candidate packages are either published or skipped (already exists) — `inst-all-done`
7. [x] `p1` - **FROM** `PUBLISHING` **TO** `FAILED` **WHEN** any `npm publish` attempt exhausts all retries — `inst-publish-failed`

---

### Package Publish State

- [x] `p1` - **ID**: `cpt-frontx-state-publishing-pipeline-package-publish`

Describes the publishing state of a single package within one workflow run.

1. [x] `p1` - **FROM** `PENDING` **TO** `CHECKING` **WHEN** the package's turn arrives in the sorted publish loop — `inst-pkg-checking`
2. [x] `p1` - **FROM** `CHECKING` **TO** `SKIPPED` **WHEN** `npm view <name>@<version>` returns a result (version already on NPM) — `inst-pkg-skip`
3. [x] `p1` - **FROM** `CHECKING` **TO** `PUBLISHING` **WHEN** `npm view <name>@<version>` returns "not found" — `inst-pkg-publish`
4. [x] `p1` - **FROM** `PUBLISHING` **TO** `RETRYING` **WHEN** a publish attempt fails and retry attempts remain — `inst-pkg-retry`
5. [x] `p1` - **FROM** `RETRYING` **TO** `PUBLISHED` **WHEN** a retry attempt succeeds — `inst-pkg-retry-success`
6. [x] `p1` - **FROM** `PUBLISHING` **TO** `PUBLISHED` **WHEN** the first publish attempt succeeds — `inst-pkg-published`
7. [x] `p1` - **FROM** `RETRYING` **TO** `FAILED` **WHEN** all retry attempts are exhausted — `inst-pkg-failed`

---

## 5. Definitions of Done

### Package Metadata Contract

- [x] `p1` - **ID**: `cpt-frontx-dod-publishing-pipeline-metadata-contract`

All `@gears-frontx/*` packages include the required NPM publishing metadata in their `package.json`.
Running `npm pack` on any package produces a tarball containing only `dist/` files plus any
documented extras (README, CLAUDE.md), with no source TypeScript files.

**Implementation details**:
- Each `packages/*/package.json` must contain: `author`, `license`, `repository`, `bugs`,
  `homepage`, `keywords`, `engines`, `sideEffects` (where applicable), `publishConfig`,
  `files`, `exports`
- `"type": "module"` in every package
- `"exports"` must expose both ESM (`import`) and CJS (`require`) conditions
- `"main"` points to `.cjs` entry, `"module"` points to `.js` entry
- `dist/` must contain `index.js` (ESM), `index.cjs` (CJS), `index.d.ts` (types)
- CLI package additionally exposes a `bin` entry pointing to the executable

**Implements**:
- `cpt-frontx-flow-publishing-pipeline-developer-version-bump`
- `cpt-frontx-algo-publishing-pipeline-validate-metadata`

**Covers (PRD)**:
- `cpt-frontx-fr-pub-metadata`
- `cpt-frontx-fr-pub-esm`
- `cpt-frontx-nfr-compat-node`
- `cpt-frontx-nfr-compat-typescript`
- `cpt-frontx-nfr-compat-esm`
- `cpt-frontx-nfr-perf-treeshake`

**Covers (DESIGN)**:
- `cpt-frontx-constraint-esm-first-module-format`
- `cpt-frontx-constraint-typescript-strict-mode`

---

### Version Alignment

- [x] `p1` - **ID**: `cpt-frontx-dod-publishing-pipeline-version-alignment`

All `@gears-frontx/*` packages that are published together carry the same version string. A PR that
bumps versions bumps them uniformly (e.g., all go from `0.3.0` to `0.4.0-alpha.0`).

**Implementation details**:
- No automated tooling enforces alignment at present; alignment is enforced by convention
  and verified by the developer before raising a PR
- The detect-changes job independently reads each package's version; any mis-aligned package
  will be detected and published at its own version — which serves as a visible signal that
  alignment was missed

**Implements**:
- `cpt-frontx-flow-publishing-pipeline-developer-version-bump`

**Covers (PRD)**:
- `cpt-frontx-fr-pub-versions`

---

### Automated CI Publish Workflow

- [x] `p1` - **ID**: `cpt-frontx-dod-publishing-pipeline-ci-workflow`

The GitHub Actions workflow at `.github/workflows/publish-packages.yml` correctly implements
version detection, layer-ordered building, NPM registry pre-check, publish with retry, and
fail-fast error handling. The workflow triggers on push to `main` only.

**Implementation details**:
- Three jobs: `detect-changes` → `publish` (conditional on `has_changes == true`) → `summary` (always runs)
- `detect-changes` outputs `packages` (JSON array) and `has_changes` (boolean)
- `publish` job: checks out code, sets up Node 25.x with `registry-url: https://registry.npmjs.org`, enables Corepack, installs deps, builds packages, then iterates the sorted candidate list
- `NODE_AUTH_TOKEN` set from `secrets.NPM_TOKEN`
- Fail-fast: any unrecoverable publish failure calls `exit 1` immediately, preventing subsequent packages from being processed
- `summary` job renders a Markdown table of published and skipped packages to `$GITHUB_STEP_SUMMARY`

**Implements**:
- `cpt-frontx-flow-publishing-pipeline-publish-on-merge`
- `cpt-frontx-flow-publishing-pipeline-publish-single-package`
- `cpt-frontx-algo-publishing-pipeline-detect-version-changes`
- `cpt-frontx-algo-publishing-pipeline-layer-sort`
- `cpt-frontx-algo-publishing-pipeline-resolve-dist-tag`
- `cpt-frontx-algo-publishing-pipeline-publish-with-retry`

**Covers (PRD)**:
- `cpt-frontx-fr-pub-ci`
- `cpt-frontx-fr-sdk-flat-packages` (flat package structure is the publish unit)
- `cpt-frontx-nfr-maint-arch-enforcement` (layer sort mirrors architectural layer order)

**Covers (DESIGN)**:
- `cpt-frontx-principle-layer-isolation` (L1 always published before L2, L2 before L3)
- `cpt-frontx-constraint-esm-first-module-format`
- `cpt-frontx-constraint-no-package-internals-imports`

---

### Idempotent Registry Check

- [x] `p1` - **ID**: `cpt-frontx-dod-publishing-pipeline-idempotent-check`

Re-running the workflow after a successful publish does not produce errors or duplicate
publishes. Packages whose version already exists on NPM are silently skipped.

**Implementation details**:
- `npm view <name>@<version> version` returns the version string if it exists, or exits
  non-zero if not found
- A successful `npm view` exit causes the loop to `continue` (skip), log the skip reason,
  and record the package in the `skipped` output
- The `summary` job reports skipped packages separately from published ones

**Implements**:
- `cpt-frontx-flow-publishing-pipeline-publish-single-package` (step 3)
- `cpt-frontx-state-publishing-pipeline-package-publish` (CHECKING → SKIPPED transition)

**Covers (PRD)**:
- `cpt-frontx-fr-pub-ci` (idempotency clause)

---

## 6. Acceptance Criteria

- [x] A PR that bumps the version of a single `@gears-frontx/*` package triggers exactly one successful `npm publish` for that package upon merge to `main`
- [x] A PR that bumps versions in multiple packages across layers publishes them in layer order: L1 SDK first, CLI last
- [x] If a version already exists on NPM, the workflow skips that package, logs the skip reason, and continues with remaining packages
- [x] If any `npm publish` command fails after three attempts, the workflow exits immediately and does not publish subsequent packages
- [x] A PR with no version changes in any `package.json` completes the workflow successfully with exit code 0 and no publish attempts
- [x] Prerelease versions (containing `-alpha`, `-beta`, `-rc`) are published with the correct dist-tag (`alpha`, `beta`, `next`); stable versions use `latest`
- [x] All published packages include `"type": "module"`, dual ESM/CJS `exports`, and complete metadata fields (`author`, `license`, `publishConfig`, `engines`)
- [x] TypeScript declarations (`index.d.ts`) are included in the published tarball
- [x] The `npm pack` output for any package contains only `dist/` files and documented extras — no raw `.ts` source files

---

## Additional Context

### Build Order vs. Publish Order

The `npm run build:packages` root script builds in strict layer order
(sdk → framework → react → studio → cli). The publish loop independently
re-sorts the detected candidates by the same layer priority. These two orderings are
intentionally redundant: the build order ensures artifacts are up-to-date, while the publish
sort order ensures consumers can always install a freshly published lower-layer package before
the higher-layer package that depends on it.

### Prerelease Dist-Tag Strategy

NPM treats a publish without an explicit `--tag` as `latest`, which would make unstable
alpha/beta versions the default install target. The `cpt-frontx-algo-publishing-pipeline-resolve-dist-tag`
algorithm prevents this by detecting version pre-release identifiers and mapping them to
explicit dist-tags. This preserves `latest` for stable releases only.

### Fail-Fast vs. Continue-on-Error

The current implementation is fail-fast: the first unrecoverable publish failure halts the
entire run. This is intentional. If a lower-layer package fails to publish, allowing
higher-layer packages to publish would produce an inconsistent registry state where consumers
see a new `@gears-frontx/framework` but cannot resolve its new `@gears-frontx/state` dependency. Fail-fast
and the fixed layer order together guarantee registry consistency.

### Architecture Enforcement Connection

The layer publish order directly mirrors the `cpt-frontx-principle-layer-isolation` design
principle. The same dependency direction (L1 → L2 → L3) that governs source imports also
governs the sequence in which packages land on NPM. This is not incidental — it is the
runtime expression of the architectural constraint, enforced mechanically by the CI workflow
rather than by convention alone.

### Non-Applicable Domains

- **SEC**: CI workflow uses platform-managed secrets; no application-layer auth
- **UX**: Build/publish infrastructure, no user interface
- **DATA**: No database persistence
- **INT**: No external service integrations beyond npm registry
- **COMPL**: No regulatory data handling
- **MAINT**: Build pipeline complexity managed through template-based generation
