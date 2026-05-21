---
status: accepted
date: 2026-03-27
---

# Channel-Aware Version Locking via Build-Time Injection

**ID**: `cpt-frontx-adr-channel-aware-version-locking`

<!-- toc -->

- [Context and Problem Statement](#context-and-problem-statement)
- [Decision Drivers](#decision-drivers)
- [Considered Options](#considered-options)
- [Decision Outcome](#decision-outcome)
  - [Consequences](#consequences)
  - [Confirmation](#confirmation)
- [Pros and Cons of the Options](#pros-and-cons-of-the-options)
  - [Build-time version injection via generate-versions.ts](#build-time-version-injection-via-generate-versionsts)
  - [Hardcoded version strings in generator source](#hardcoded-version-strings-in-generator-source)
  - [Runtime NPM registry lookup during scaffolding](#runtime-npm-registry-lookup-during-scaffolding)

<!-- /toc -->

## Context and Problem Statement

The `@gears-frontx/cli` scaffolds new projects with dependency versions for all `@gears-frontx/*` packages. Previously, these versions were hardcoded to the `alpha` dist-tag. With the introduction of gitflow (develop→alpha, main→latest, release→rc), the CLI must emit dependency versions that match its own publication channel. How should the CLI know which exact versions to inject into scaffolded `package.json` files?

## Decision Drivers

* Versions in scaffolded projects must match the CLI's own publication channel (alpha CLI → alpha deps, latest CLI → latest deps)
* No manual version pinning — versions must stay in sync automatically across all packages
* The solution must work without network access during scaffolding (offline-capable)
* Minimal build pipeline complexity — ideally a single pre-build step

## Considered Options

* Build-time version injection via `generate-versions.ts`
* Hardcoded version strings in generator source
* Runtime NPM registry lookup during scaffolding

## Decision Outcome

Chosen option: "Build-time version injection via `generate-versions.ts`", because it is the only option that automatically aligns scaffolded dependency versions with the CLI's publication channel without requiring network access or manual updates.

### Consequences

* Good, because versions are always in sync — the generated file reflects the exact monorepo state at build time
* Good, because alpha CLI naturally produces alpha versions, latest CLI produces latest versions
* Good, because scaffolding works offline — versions are baked into the CLI binary
* Good, because the single `generate-versions.ts` script is simple and auditable
* Bad, because `src/generated/versions.ts` must be gitignored since it is a build artifact
* Bad, because CLI build script must run `generate-versions` before `tsup` (additional build step)

### Confirmation

Verify by building the CLI from the develop branch and inspecting `packages/cli/src/generated/versions.ts` — all versions should contain `-alpha`. Build from main and verify versions are stable releases. Run `frontx create project` and confirm the generated `package.json` contains matching versions.

## Pros and Cons of the Options

### Build-time version injection via generate-versions.ts

A `generate-versions.ts` script reads all `packages/*/package.json` files, extracts `name` and `version`, and writes a TypeScript constants file at `src/generated/versions.ts`. CLI generators import these constants instead of hardcoded strings. The CLI build script runs this generation step before `tsup`.

* Good, because zero manual maintenance — versions derived from monorepo source of truth
* Good, because channel alignment is automatic — develop branch has alpha versions, main has stable
* Good, because offline-capable — no registry queries at scaffold time
* Good, because type-safe — generators get compile-time errors if a package is removed
* Bad, because adds a build step to the CLI package
* Bad, because generated file must be gitignored

### Hardcoded version strings in generator source

Keep version strings directly in the generator TypeScript files, updated manually when versions change.

* Good, because simple and obvious — no build machinery
* Bad, because manual updates are error-prone and easily forgotten
* Bad, because no channel awareness — a single set of hardcoded versions cannot represent both alpha and stable
* Bad, because version drift between packages and generators is invisible until a user reports it

### Runtime NPM registry lookup during scaffolding

The CLI queries the NPM registry at scaffold time to determine the latest version for each `@gears-frontx/*` package.

* Good, because always returns the freshest version available
* Bad, because requires network access — breaks offline scaffolding
* Bad, because slow — adds latency to project creation (one HTTP call per package)
* Bad, because fragile — NPM outages or rate limits cause scaffolding failures
* Bad, because channel selection is ambiguous — which dist-tag should the CLI query?
