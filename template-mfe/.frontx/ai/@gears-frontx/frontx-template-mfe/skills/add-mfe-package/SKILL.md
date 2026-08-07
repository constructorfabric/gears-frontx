---
name: frontx-template-mfe-add-mfe-package
description: "Scaffold a new microfrontend (MFE) package inside template-mfe — copy the _blank-mfe reference scaffold, assign a port and GTS identifiers that conform to this bundle's naming scheme, and register it with the shell's manifest pipeline."
---

# Add an MFE Package (template-mfe)

This skill is specific to **template-mfe**. It relies on template-mfe's concrete
scaffold (`src-app/mfe_packages/_blank-mfe/`) and manifest pipeline
(`scripts/generate-mfe-manifests.ts`, `public/generated-mfe-manifests.json`) — none of
which is base-kit (F15) content, which stays solution-agnostic.

**Precondition:** requires an applied `template-shell` (root `package.json`,
`src-app/app/`, and the build/test/manifest pipeline) already in the project —
`template-mfe` only adds MFE packages into that shell; it does not scaffold a
repository standalone.

## When to use

The Project Developer wants to add a new microfrontend screen to a project that
already has `template-shell` applied (a new screenset entry, a new isolated UI unit
to mount into an extension domain).

## What template-mfe provides

- A working, disposable MFE scaffold at `src-app/mfe_packages/_blank-mfe/`: Shadow DOM
  isolation, bridge communication (`ChildMfeBridge`), theme/language shared-property
  subscriptions, per-MFE i18n, and a Module Federation `vite.config.ts` already wired.
- An `mfe.json` manifest describing the MFE's Module Federation `manifest`, its
  `entries[]` (exposed modules + required shared properties), and its `extensions[]`
  (domain + presentation metadata for the screen it contributes).
- `npm run generate:mfe-manifests` (`scripts/generate-mfe-manifests.ts`), which reads
  every MFE package's built manifest and aggregates them into
  `public/generated-mfe-manifests.json` — the file every FrontX app instance (host or
  nested) reads at runtime to discover MFEs.
- `npm run dev:all` (`scripts/dev-all.ts`), which auto-discovers any package under
  `src-app/mfe_packages/*/package.json` by reading the port out of its `dev`/`preview`
  script — no manual wiring required once the package exists.
- Packages template-mfe ships as its own worked examples, and the scaffold itself,
  all declare `"templateExample": true` in their `mfe.json`. Both the manifest
  generation and `dev:all` leave those out, so a project runs the packages its
  developer added and nothing else; `FRONTX_INCLUDE_TEMPLATE_EXAMPLES=1` puts them
  back for anyone wanting to see the shipped examples run.

## Steps

1. **Copy the scaffold** — duplicate `src-app/mfe_packages/_blank-mfe/` to a new
   directory named after the screenset/screen being added
   (`src-app/mfe_packages/{name}-mfe/`).
2. **Pick a free port** — template-mfe's convention reserves `3001` for `demo-mfe`;
   pick the next free `30N0` slot (`3010`, `3020`, ...) and set it in both the `dev`
   (`vite --port {port}`) and `preview` (`vite preview --port {port}`) scripts of the
   copied package's `package.json`. `dev:all`'s port auto-discovery depends on the
   `preview`/`dev` script carrying `--port <N>` literally.
3. **Rename package identity** — update the copied `package.json` `name` and the
   Module Federation `name` in `vite.config.ts` (camelCase, must match across both).
4. **Drop the scaffold's `templateExample` flag** - `_blank-mfe/mfe.json` declares
   `"templateExample": true`, which is what keeps the scaffold itself out of the
   running application. Delete that line from the copy. A package that keeps it
   still builds and type-checks, and the only report of the skip is one line in
   the `generate:mfe-manifests` / `dev:all` output naming the packages left out -
   nothing fails, and the new screen is simply absent from the menu.
5. **Assign GTS IDs** — rewrite every placeholder ID in `mfe.json` following
   template-mfe's ID taxonomy (see the `gts-id-conventions` guideline and the
   `gts-id-patterns-reference` reference artifact in this same bundle): a manifest ID,
   one entry ID per exposed module, and one extension ID per screen contributed to a
   domain (typically `gts.frontx.mfes.ext.domain.v1~frontx.screensets.layout.screen.v1`
   for a screen-domain contribution).
6. **Implement the lifecycle** — `src/lifecycle.tsx` extends `ThemeAwareReactLifecycle`
   from `@gears-frontx/react`; the MFE's own `init.ts` builds its app instance with
   `createFrontX().use(effects()).use(queryCacheShared()).use(mock()).build()` so it
   joins the host's shared `QueryClient` without owning a second one.
7. **Regenerate manifests** — run `npm run generate:mfe-manifests` so the host's
   `public/generated-mfe-manifests.json` picks up the new package; this step is
   mandatory before the new MFE is discoverable at runtime.
8. **Verify** — `npm run type-check`, `npm run arch:deps` (dependency-cruiser
   boundaries, shell-owned script), then `npm run dev:all` and confirm the new screen
   mounts with zero console errors.

## Boundaries

- Do not add Redux/host-store imports inside the MFE; MFEs stay isolated and consume
  only bridge-provided shared properties and mock/local state.
- Do not hand-edit `public/generated-mfe-manifests.json`; it is a generated artifact —
  always regenerate via `npm run generate:mfe-manifests`.
- This skill does not cover ecosystem-level MFE runtime concepts (registration,
  cardinality, mount strategies) — those are base-kit (`@gears-frontx/mfes`) fluency,
  already provided by the framework's base AI capabilities.
