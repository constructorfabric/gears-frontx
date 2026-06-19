# Contributing to Gears FrontX

> **TARGET AUDIENCE:** Humans
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
2. Make changes, commit, push, open PR targeting `develop`
3. After review and merge, CI publishes alpha versions
4. When ready for release, create `release/X.Y.Z` from `develop`
5. Finalize version bumps, merge `release/X.Y.Z` into `main`
6. CI publishes stable versions, merge back to `develop`

### Previous-Major Maintenance

When a new major is released, the previous major gets a long-lived `release/vN` branch:

1. When cutting major v2, create `release/v1` from the last v1 commit on `main`
2. To fix a bug in v1: branch `hotfix/*` from `release/v1`
3. PR targets `release/v1` → merge → CI publishes with `--tag v1`
4. If the fix also applies to v2, cherry-pick to `develop` or `main`

Users install old majors explicitly: `npm install @cyberfabric/react@v1`

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
1. L1 SDK: `@cyberfabric/state`, `@cyberfabric/screensets`, `@cyberfabric/api`, `@cyberfabric/i18n`
2. L2 Framework: `@cyberfabric/framework`
3. L3 React: `@cyberfabric/react`
4. Standalone: `@cyberfabric/studio`, `@cyberfabric/cli`

Each package is versioned independently within a single major version.

## Package Scope

- npm scope: `@cyberfabric/*`
- CLI binary: `frontx`
- Config file: `frontx.config.json`

## Development Setup

```bash
git clone https://github.com/cyberfabric/frontx.git
cd frontx
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

The host app (`src/app`) and each workspace or nested MFE that defines `test:unit` is exercised by that command. For conventions, CI expectations, and narrowing runs to a single project or path, see [`.ai/project/targets/UNIT_TESTING.md`](.ai/project/targets/UNIT_TESTING.md).

**Internal scripts (do not call directly):** Root [`package.json`](package.json) defines `_test:unit:host` and `_test:unit:host:watch` for the host app only; they exist so the monorepo runner can invoke Vitest where there is no workspace package. Agents and CI should use `npm run test:unit` / `test:unit:watch` instead.

## License

Apache-2.0
