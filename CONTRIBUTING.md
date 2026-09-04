# Contributing to Gears FrontX

> **TARGET AUDIENCE:** Humans and agents
> **PURPOSE:** Contribution guidelines and workflow for developers

## Branching Model (Gitflow)

| Branch | Lifecycle | Purpose | Publishes to |
|--------|-----------|---------|-------------|
| `main` | permanent | Current stable major | `latest` npm dist-tag |
| `develop` | permanent | Active development | `alpha` npm dist-tag |
| `release/X.Y.Z` | short-lived | Release preparation (from develop → main) | `next` npm dist-tag |
| `release/vN` | long-lived | Maintenance line for major version N | `vN` npm dist-tag (e.g. `v1`) |
| `feature/*` | short-lived | Feature branches (from develop) | — |
| `hotfix/*` | short-lived | Hotfix branches (from main → main + develop) | — |

### Standard Workflow

1. Create a `feature/*` branch from `develop`
2. Make changes, commit (signed off - see [Commit Requirements](#commit-requirements)), push, open PR targeting `develop`
3. After review and merge, CI publishes alpha versions
4. When ready for release, create `release/X.Y.Z` from `develop`
5. Finalize version bumps, merge `release/X.Y.Z` into `main`
6. CI publishes stable versions, merge back to `develop`

### Resolving Conflicts with `develop`

**For any branch with a PR targeting `develop` (`feature/*`, `fix/*`, or otherwise), always rebase onto `develop`; never merge `develop` into your branch.** If your branch falls behind canonical `develop` and needs conflicts resolved, rebase onto it:

```bash
git fetch origin develop
git rebase origin/develop
# for each conflicted commit: resolve conflicts, then stage every resolved path
git add -- path/to/resolved-file
# substitute every actual resolved path before continuing
git rebase --continue
# repeat resolve/add/continue until the rebase completes
git push --force-with-lease
```

To abandon the rebase and return to the previous branch state instead, run `git rebase --abort`. In a fork-based setup, replace `origin` with the remote that tracks `constructorfabric/gears-frontx`.

A merge from `develop` into a work branch makes the merge commit and any conflict-resolution combined diff durable in branch history, which is hard to review.

### Previous-Major Maintenance

When a new major is released, the previous major gets a long-lived `release/vN` branch:

1. When cutting major v2, create `release/v1` from the last v1 commit on `main`
2. To fix a bug in v1: branch `hotfix/*` from `release/v1`
3. PR targets `release/v1` → merge → CI publishes with `--tag v1`
4. If the fix also applies to v2, cherry-pick to `develop` or `main`

Users install old majors explicitly: `npm install @gears-frontx/react@v1`

## Commit Requirements

**Sign off every commit (DCO).** Each commit must carry a `Signed-off-by` line certifying the [Developer Certificate of Origin](https://developercertificate.org/). Pass `-s` when committing:

```bash
git commit -s -m "feat: describe the change"
```

To add a missing sign-off to the latest commit, run `git commit --amend -s --no-edit`. To sign off a range of commits, run `git rebase --signoff <base>` (e.g. `git rebase --signoff HEAD~3` to cover the last three), then push with `--force-with-lease`. Note that `git rebase --signoff` appends the trailer even when a `Signed-off-by` already exists earlier in the message (it only skips when an identical sign-off is last), so rebasing over already-signed commits that end in `Co-Authored-By` adds a duplicate line - pick a `<base>` that spans only the commits missing the trailer.

This is enforced locally by a `commit-msg` hook (`require-signoff` in [`.pre-commit-config.yaml`](.pre-commit-config.yaml)); commits without the trailer are rejected before they're made. The hook is installed automatically by `npm install` (via the `prepare` script) — if commits aren't being checked, run `npx prek install`.

## Versioning

The project is **pre-1.0** — backward compatibility is not guaranteed.

| Version format | Channel | Branch | Meaning |
|---------------|---------|--------|---------|
| `0.y.z-alpha.N` | `alpha` | `develop` | Development snapshot |
| `0.y.z-rc.N` | `next` | `release/X.Y.Z` | Release candidate |
| `0.y.z` | `latest` | `main` | Stable release |
| `N.y.z` | `vN` | `release/vN` | Previous major maintenance |

- **Minor bump** (`0.1.x` → `0.2.x`) — may contain breaking changes
- **Patch bump** (`0.1.0` → `0.1.1`) — non-breaking fixes/features
- **Alpha increment** (`alpha.0` → `alpha.1`) — each merge to develop

A PR that changes non-documentation source under `src/`, or the dependency fields of `package.json`, for a governed package (the non-private `@gears-frontx`-scoped packages under [`packages/`](packages)) must bump that package's own `version` in the same PR — and update every exact pin on it (see `policy:ecosystem-pin-drift`). CI (`policy:version-bump-on-change`, pull requests only) compares the version at the PR's merge base against the version at its head, so a bump that is later reverted within the same PR does not count. Packages the PR itself adds or removes are exempt, as are private packages (the [`internal/`](internal) config and test-support workspaces), which are consumed in-tree rather than published.

Templates pin these same packages, but their pins are governed in the templates repository. See [Templates](#templates) below.

## Publishing

Publishing is automated via CI/CD. On push to a publishing branch, CI detects version changes and publishes affected packages.

### Branch-to-Channel Mapping

| Branch | Dist-tag | Trigger |
|--------|----------|---------|
| `develop` | `alpha` | Every merge |
| `release/X.Y.Z` | `next` | RC prep merges |
| `main` | `latest` | Release merges |
| `release/vN` | `vN` | Maintenance patches |

### Publish Order

Packages are published in dependency order:
1. L1 SDK: `@gears-frontx/state`, `@gears-frontx/mfes`, `@gears-frontx/api`, `@gears-frontx/i18n`
2. L2 Framework: `@gears-frontx/framework`
3. L3 React: `@gears-frontx/react`
4. Standalone: `@gears-frontx/studio`, `@gears-frontx/cli`

Each package is versioned independently within a single major version.

## Package Scope

- npm scope: `@gears-frontx/*`
- CLI binary: `frontx`
- Config file: `frontx.config.json`

## Development Setup

```bash
git clone https://github.com/constructorfabric/gears-frontx.git
cd gears-frontx
npm ci
npm run build:packages
npm run dev
```

## Building

```bash
# Build all packages in layer order
npm run build:packages

# Build specific layer
npm run build:packages:sdk
npm run build:packages:framework
npm run build:packages:react
npm run build:packages:studio
npm run build:packages:cli
```

## Templates

Templates are not in this repository. They live in [`constructorfabric/gears-frontx-templates`](https://github.com/constructorfabric/gears-frontx-templates), one top-level directory per template, and a consumer addresses one by the subtree form of a source-spec:

```bash
frontx install github:constructorfabric/gears-frontx-templates//template-shell@<ref>
```

Everything that existed only to serve them moved with them: manifest validation, the lockfile and token-format guards, the guideline-index generation, the composition and publish jobs, and the dev loop that linked a template against local `packages/*` builds. That dev loop is documented in the templates repository's own `CONTRIBUTING.md`; read it there rather than here, so there is one copy to keep true.

Two consequences land on work done in this repository:

- **Pin drift surfaces on the other side.** The check comparing `packages/*` against what the shell template pins and mirrors runs in the templates repository, against a checkout of this one — found as a sibling directory named by the `FRONTX_ECOSYSTEM_DIR` convention, falling back to the package registry when no checkout is present. A pin that goes stale because of a change here goes red there, not on your PR. What remains here is `policy:ecosystem-pin-drift`, which covers exact pins between `packages/*` only.
- **Changes spanning both repositories are ordered.** The ecosystem packages publish first; the templates repository then re-pins to the published versions and publishes after. That is two PRs in that order, and the second cannot be prepared until the first has published.

The rationale and the full list of what moved are in [ADR-0034](architecture/ADR/0034-template-repository-separation.md).

## Validation

```bash
# Repo-wide type checking (host app + workspace packages + nested MFEs)
npm run type-check:all

# Host app only (`tsconfig.json`; nested MFEs and package test tsconfigs run separately)
npm run type-check

# Linting
npm run lint

# Architecture checks
npm run arch:check
npm run arch:deps
```

### Unit tests

Run the full suite from the repo root with the monorepo fan-out runner ([`scripts/run-monorepo-unit-tests.mjs`](scripts/run-monorepo-unit-tests.mjs)):

```bash
npm run test:unit
npm run test:unit:watch
```

Every workspace that defines `test:unit`, plus the repo-root `scripts/` toolchain as the `repo-scripts` project, is exercised by that command. To narrow a run, pass the project name or a path to the runner: `npm run test:unit -- --project=cli`, or `npm run test:unit -- packages/cli/src/__tests__/resolver.test.ts` for a single file.

`scripts/` is not an npm workspace, so the runner cannot discover it from `package.json#workspaces` the way it finds everything else; it is registered explicitly in [`scripts/test-runner/discovery.mjs`](scripts/test-runner/discovery.mjs) and tested through [`vitest.scripts.config.mjs`](vitest.scripts.config.mjs). A new test file under `scripts/` needs no wiring, but a new *root-level* directory of tests does.

**Internal scripts (do not call directly):** Root [`package.json`](package.json) defines `_test:unit:host` and `_test:unit:host:watch` for the `repo-scripts` project; they exist so the monorepo runner can invoke Vitest where there is no workspace package. Agents and CI should use `npm run test:unit` / `test:unit:watch` instead.

## License

Apache-2.0
