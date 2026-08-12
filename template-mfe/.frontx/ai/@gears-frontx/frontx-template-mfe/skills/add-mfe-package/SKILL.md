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
7. **Verify** - run step 6 of the `add-mfe-package-workflow` in this bundle as it tiers
   the work: the scoped tier-1 commands per package, and the repo-wide tier-2 quartet plus
   `build:mfes`/`generate:mfe-manifests` once after the last one. Both tiers assume that
   workflow's step 0 - `npm install`, `build:package`, `build:packages` - already ran,
   before any of the authoring above. Then `npm run dev:all` and run that workflow's step
   7 in full - mount check, declared route, menu pathname, every registered theme, and the
   coverage file it names.

## Boundaries

- Do not add Redux/host-store imports inside the MFE; MFEs stay isolated and reach
  state only through `@gears-frontx/react`'s `createSlice`/`registerSlice` and through
  the bridge - shared properties in, events out.
- A screen's CLIENT-owned state stays INSIDE the MFE. Everything the user changes that no
  server owns - form outcomes, session/status flags, dialog open state, selection, a
  locally ordered or filtered view - belongs to the package that renders it and never to
  the host; that boundary is the non-negotiable part. The slice (registered via
  `registerSlice`), actions that emit events, and effects as the only dispatcher are the
  mechanism this template currently ships for that state - use them for client-owned state
  that outlives a single component or is shared across the screen's components. State that
  lives and dies with one component may stay in component-local `useState`: an uncommitted
  input draft, a submit outcome only that component displays, the open/closed flag of a
  control it owns. Bridge-delivered values (theme, language) stay component-local too.
- SERVER-owned state does NOT go in a slice. Data that is read from and written through
  an API service - the fetch/mutate/invalidate cycle - lives in the shared query cache,
  reached through `useApiQuery` and `useApiMutation`. That is the pattern demo-mfe's
  Profile screen ships, it is legitimate, and a screen following it is not bypassing the
  architecture: a slice mirroring server data would be a second copy of it, with its own
  staleness. A list is server-owned when a server returns it and client-owned when the
  user builds it, so the question is who owns the data, never what shape it has.
- A screen with both kinds uses both, each where it belongs: the query cache for what
  the API owns, the MFE's own state for what the user owns. Keeping the skeleton's
  `slices/`, `actions/`, `effects/`, and `events/` files and deleting them are both
  decisions - record whichever call is made in one sentence, in the package's README, the
  screen component's doc comment, or `init.ts` beside the registration that is now absent,
  naming who owns the screen's state and where it lives, so the next reader sees a
  decision rather than a missing layer.
- Fill those four files when the screen has client-owned state that its components share
  or that outlives them - they are the state layer for exactly that, not anchors to leave
  empty. An empty slice behind a screen that shares user-owned state across components -
  lifted into a parent's `useState` and passed down - means the layer was bypassed; an
  empty slice behind a screen whose client state lives and dies inside single components
  does not.
- Do not hand-edit `public/generated-mfe-manifests.json`; it is a generated artifact -
  always regenerate via `npm run generate:mfe-manifests`.
- This skill does not cover ecosystem-level MFE runtime concepts (registration,
  cardinality, mount strategies) - those are base-kit (`@gears-frontx/mfes`) fluency,
  already provided by the framework's base AI capabilities.
