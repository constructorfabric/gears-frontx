# Guideline: The `src-app/mfe_packages/*` Contract

template-shell discovers, builds, and aggregates MFE packages under
`src-app/mfe_packages/*` **by convention, not by name** — none of the shell's
scripts or configs reference a specific MFE package name (only glob/scan). This
is the concrete, code-verified shape every directory under that path must have
to be picked up. It is the same shape `template-mfe` ships (`demo-mfe`,
`_blank-mfe`, `widgets-fixture-a`, `widgets-fixture-b`); any other source of MFE
packages (hand-authored, generated, a different template) must match it too.

This guideline is a snapshot of what the shell-owned scanners actually check —
not a separate spec. If the scanners change, this file must be updated to match
(`scripts/lib/mfe-tools.ts`, `scripts/generate-mfe-manifests.ts`).

## Directory-level rules

- Must live directly under `src-app/mfe_packages/<name>/`.
- `<name>` must not start with `.` and must not be `shared` — both scanners
  exclude these (`shared` is reserved for cross-MFE helper code the isolation
  boundary still applies to; it is never itself an MFE).
- A package whose `mfe.json` declares `"templateExample": true` is excluded by
  both scanners as well. It is content a template ships to be read and copied -
  a worked example, or the scaffold new packages are copied from - and a project
  that registered it would offer screens nobody asked for. Setting
  `FRONTX_INCLUDE_TEMPLATE_EXAMPLES=1` puts those packages back into every
  scanner at once, for a run that means to watch the shipped examples work.
  A package copied from a flagged scaffold **must drop the flag**, or the copy
  is invisible to the shell for the same reason the scaffold is.

## Required files

1. **`package.json`** with a `preview` or `dev` script that carries a literal
   `--port <N>` flag (e.g. `"preview": "vite preview --port 3010"`).
   `scripts/lib/mfe-tools.ts`'s `getMFEPackages()` (used by `dev-all.ts` and
   `build-mfes.ts`) tries `preview` first, falls back to `dev`, and extracts the
   port with `/--port\s+(\d+)/` — a differently-spelled flag (`--port=3010`, no
   space) will not match and the package is silently skipped with a warning.
2. **`mfe.json`** at the package root. This is the actual discovery predicate
   `scripts/generate-mfe-manifests.ts`'s `discoverPackages()` checks for — a
   directory without it is invisible to manifest generation even if it has a
   valid `package.json`. Declares `manifest` (this package's own MF manifest
   ID), `entries[]` (exposed modules + required/optional shared properties +
   actions), and `extensions[]` (domain + presentation metadata per screen or
   widget the package contributes), plus the optional `templateExample` flag
   described above. See the `gts-id-conventions` guideline in the `template-mfe`
   AI bundle for the ID taxonomy these fields use.
3. **`vite.config.ts`** that runs `@module-federation/vite`'s `federation()`
   plugin, then `frontxMfGts()` (imported from
   `@gears-frontx/frontx-template-shell/build/mf-gts`) with `enforce: 'post'` so
   it runs after federation. Building without `frontxMfGts()` fails manifest
   generation with an explicit error naming the missing plugin.

## Build-output contract (produced by `vite build`, consumed by the shell)

- `dist/mf-manifest.json` — the raw Module Federation manifest, written by
  `@module-federation/vite` itself.
- `dist/mfe-manifest.json` — the **enriched** manifest `frontxMfGts()` writes in
  its `closeBundle` hook: `mfe.json` merged with `dist/mf-manifest.json`'s
  `metaData`/`exposes`, plus resolved shared-dependency versions and standalone
  ESM chunk paths. `scripts/generate-mfe-manifests.ts` reads **this** file, not
  `mf-manifest.json` directly, and throws if it is missing or was not built by
  a `frontxMfGts()`-configured pipeline.

## What the shell does with a conforming package

- `npm run dev:all` (`scripts/dev-all.ts`) builds every conforming package,
  starts its preview server on the port read from step 1, and runs the host.
- `npm run build:mfes` (`scripts/build-mfes.ts`) builds every conforming
  package with zero MFEs present, printing "skipping" and exiting 0 — the
  shell-only seed (no `template-mfe` applied) must stay green.
- `npm run generate:mfe-manifests` aggregates every package's
  `dist/mfe-manifest.json` into `public/generated-mfe-manifests.json`, the file
  every FrontX app instance (host or nested) reads at runtime to discover MFEs.
- `npm run type-check:mfe` (`scripts/run-mfe-type-checks.mjs`) type-checks every
  conforming package independently; it degrades to a no-op when none exist.

## Non-requirements

- No MFE package name is ever referenced by shell code, config, or scripts —
  every shell-side consumer of this directory (`dev-all.ts`, `build-mfes.ts`,
  `generate-mfe-manifests.ts`, `run-mfe-type-checks.mjs`, the `workspaces` glob,
  the `eslint.config.js`/`tsconfig.app.json`/`vitest.config.ts` overrides) reads
  it by glob/scan. Comments in `src-app/app/mfe/bootstrap.ts` may mention example
  MFE names for illustration only — that is documentation, not a dependency.
- The shell does not care how many packages exist under `src-app/mfe_packages/`,
  including zero.
