---
name: frontx-template-mfe-add-mfe-package
description: "Scaffold a new microfrontend (MFE) package inside template-mfe - copy the _blank-mfe reference scaffold, assign a port and GTS identifiers that conform to this bundle's naming scheme, and register it with the shell's manifest pipeline."
---

# Add an MFE Package (template-mfe)

This skill is specific to **template-mfe**. It relies on template-mfe's concrete
scaffold (`src-app/mfe_packages/_blank-mfe/`) and manifest pipeline
(`scripts/generate-mfe-manifests.ts`, `public/generated-mfe-manifests.json`) - none of
which is base-kit (F15) content, which stays solution-agnostic.

**Precondition:** requires an applied `template-shell` (root `package.json`,
`src-app/app/`, and the build/test/manifest pipeline) already in the project -
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
  `public/generated-mfe-manifests.json` - the file every FrontX app instance (host or
  nested) reads at runtime to discover MFEs.
- `npm run dev:all` (`scripts/dev-all.ts`), which auto-discovers any package under
  `src-app/mfe_packages/*/package.json` by reading the port out of its `dev`/`preview`
  script - no manual wiring required once the package exists.

## Steps

1. **Copy the scaffold** - duplicate `src-app/mfe_packages/_blank-mfe/` to a new
   directory named after the screenset/screen being added
   (`src-app/mfe_packages/{name}-mfe/`).
2. **Pick a free port** - template-mfe's convention reserves `3001` for `demo-mfe`;
   pick the next free `30N0` slot (`3010`, `3020`, ...) and set it in both the `dev`
   (`vite --port {port}`) and `preview` (`vite preview --port {port}`) scripts of the
   copied package's `package.json`. `dev:all`'s port auto-discovery depends on the
   `preview`/`dev` script carrying `--port <N>` literally.
3. **Rename package identity** - update the copied `package.json` `name` and the
   Module Federation `name` in `vite.config.ts` (camelCase, must match across both).
4. **Assign GTS IDs** - rewrite every placeholder ID in `mfe.json` following
   template-mfe's ID taxonomy (see the `gts-id-conventions` guideline and the
   `gts-id-patterns-reference` reference artifact in this same bundle): a manifest ID,
   one entry ID per exposed module, and one extension ID per screen contributed to a
   domain (typically `gts.frontx.mfes.ext.domain.v1~frontx.screensets.layout.screen.v1`
   for a screen-domain contribution).
5. **Implement the lifecycle** - `src/lifecycle.tsx` extends `ThemeAwareReactLifecycle`
   from `@gears-frontx/react`; the MFE's own `init.ts` builds its app instance with
   `createFrontX().use(effects()).use(queryCacheShared()).use(mock()).build()` so it
   joins the host's shared `QueryClient` without owning a second one.
6. **Regenerate manifests** - `npm run generate:mfe-manifests` makes the new package
   discoverable at runtime by rewriting the host's
   `public/generated-mfe-manifests.json`; it runs in the workflow's tier 2, once, after
   the last package.
7. **Verify** - run step 7 of the `add-mfe-package-workflow` in this bundle as it tiers
   the work: the scoped tier-1 commands per package, the repo-wide tier-2 quartet plus
   `build:mfes`/`generate:mfe-manifests` once after the last one, and the build
   prerequisite step 6 documents; then `npm run dev:all` and run that workflow's step 8
   in full - mount check, declared route, menu pathname, every registered theme, and the
   coverage file it names.

## Boundaries

- Do not add Redux/host-store imports inside the MFE; MFEs stay isolated and reach
  state only through `@gears-frontx/react`'s `createSlice`/`registerSlice` and through
  the bridge - shared properties in, events out.
- A screen's business state lives in the MFE's own state layers, not in the component.
  Everything user-visible behavior reads or writes - form outcomes, lists,
  session/status flags, dialog open state - belongs to the slice (registered via
  `registerSlice`), is reached through actions that emit events, and is dispatched
  only from effects. Component-local `useState` holds uncommitted input drafts and
  bridge-delivered values, and nothing else. This is the default architecture for a
  screen that has behavior, not one option among several; a purely presentational
  screen needs no flux.
- Fill the skeleton's `slices/`, `actions/`, `effects/`, and `events/` files for every
  screen that has behavior - they are the state layer, not anchors to leave empty. An
  empty slice behind a working screen means the architecture was bypassed.
- Do not hand-edit `public/generated-mfe-manifests.json`; it is a generated artifact -
  always regenerate via `npm run generate:mfe-manifests`.
- This skill does not cover ecosystem-level MFE runtime concepts (registration,
  cardinality, mount strategies) - those are base-kit (`@gears-frontx/mfes`) fluency,
  already provided by the framework's base AI capabilities.
