# Workflow: Add an MFE Package (template-mfe)

Ordered execution procedure for the `add-mfe-package` skill in this same bundle. Use
this workflow when actually performing the addition (not just reasoning about it);
each step names the concrete command or file template-mfe ships.

## Preconditions

- An applied `template-shell` is already in the project (root `package.json`,
  `src-app/app/`, build/test/manifest pipeline) - `template-mfe` adds MFE packages
  into that shell and does not scaffold a repository on its own.
- The screenset/screen the new MFE will contribute to is already decided.

## Read first

Step 0 has to have run before any of this: both `node_modules/@gears-frontx/` and
`packages/*/dist` are produced there, and neither exists on a fresh clone.

Before reading any `dist/*.d.ts` under `node_modules/@gears-frontx/`, read the
`ecosystem-api-quick-reference` reference artifact in this same bundle - it carries the
signatures screens actually need (`createSlice`/`registerSlice`, `eventBus`,
`useAppSelector`, `useApiQuery`/`useApiMutation` with `queryCache`, the endpoint-descriptor
and mock shapes, the bridge's theme/language properties, and the augmentation-target
table), verified against those same declarations.

## One package per run

Step 0 runs once per clone. Steps 1-7 realize a single package. When realizing multiple
packages, complete this workflow - through a green TIER 1 of step 6 - for the current
package before starting the
next package's copy step (step 2). Interleaving two packages' authoring defers every
failure into one mixed debug block, which past runs paid for and per-unit gates repeatedly
avoided: once the first package validates, the second is strictly cheaper, because it
transfers a pattern already proven against the gates.

Tier 1 is the whole per-unit gate; tier 2 runs ONCE, after the last package, and closes
the run. Do not run tier 2 per package. Timing runs measured the repo-wide quartet at
10-11 minutes of npm time for a two-package scaffold - 28% of the whole run - and every
failure it ever caught per unit was local to the new package (a TS2322 in its own
`mocks.ts`, for instance), which tier 1 catches in under a minute.

## Steps

0. **Install and build the project's outputs - before reading or authoring anything**
   ```bash
   npm install              # populates node_modules, @gears-frontx/* included
   npm run build:package    # tsup, produces dist-lib
   npm run build:packages   # produces packages/*/dist
   ```
   Run all three before the first grep, the first `.d.ts` read, and the first line of
   authoring - on a fresh clone, and again after any pull that touched `packages/`. The
   ecosystem's types are read from `packages/*/dist` and from `node_modules`, and both
   exist only after these commands finish. A probe sent before them searches empty
   directories and comes back empty, which reads as "that symbol does not exist" and
   sends the run off renaming correct imports: one measured run spent 2m50s of wall time
   on 31 such probes to buy 26s of machine work, then had to undo the renames. Treat an
   empty result from a tree that has not been built as no answer at all.

   This is the one home for that rule; every later step points back here rather than
   restating it.

   `build:mfes` needs `dist-lib`: every MFE's `vite.config.ts` imports `frontxMfGts` from
   `@gears-frontx/frontx-template-shell/build/mf-gts`, which the root package exports as
   `./dist-lib/build/mf-gts.js`, so without `build:package` the build dies while loading
   the first MFE's Vite config with `ERR_MODULE_NOT_FOUND ... dist-lib/build/mf-gts.js`.
   `type-check` and `test:unit` need `packages/*/dist`: an MFE package's `tsconfig.json`
   carries no `@gears-frontx/*` path mapping, so `tsc` (and `vitest`) resolve those
   imports through `node_modules` to each package's built entry there. The shell's
   `tsconfig.app.json` maps them to `packages/*/src` instead, which is why the shell
   type-checks on a fresh clone while an MFE reports `TS2307: Cannot find module
   '@gears-frontx/react'` for every ecosystem import. Run the two build commands as one
   prerequisite - the shell's own `build` script orders them exactly this way, ahead of
   `build:mfes`.

1. **Choose a name and port**
   - Name: `{screenset}-mfe` (kebab-case), placed at `src-app/mfe_packages/{screenset}-mfe/`.
   - Port: next free `30N0` slot after the reserved `3001` (`demo-mfe`).

2. **Copy the scaffold, without `node_modules`**
   Do not copy or rename workspace packages while an `npm install` is running - finish
   or await the install first. npm scans the workspaces at start, and a tree caught
   mid-copy still carrying the skeleton's name produces duplicate-workspace failures
   (`EDUPLICATEWORKSPACE`).
   ```bash
   rsync -a --exclude node_modules src-app/mfe_packages/_blank-mfe/ src-app/mfe_packages/{screenset}-mfe/
   ```
   Where `rsync` is unavailable, copy and then delete the copied `node_modules`:
   ```bash
   cp -r src-app/mfe_packages/_blank-mfe src-app/mfe_packages/{screenset}-mfe
   rm -rf src-app/mfe_packages/{screenset}-mfe/node_modules
   ```
   A copied `node_modules` carries `_blank-mfe`'s own resolution state into the new
   package, where it shadows the workspace install. An MFE resolves `@gears-frontx/*`
   through `node_modules` rather than through path mapping (step 0), so `tsc` then
   type-checks the new package against the skeleton's tree and reports resolution
   errors that no edit to the new package's own files can clear.

3. **Edit package metadata**
   - `src-app/mfe_packages/{screenset}-mfe/package.json`:
     - `name`: `@gears-frontx/{screenset}-mfe`
     - `dev`: `vite --port {port}`
     - `preview`: `vite preview --port {port}`
   - `src-app/mfe_packages/{screenset}-mfe/vite.config.ts`:
     - Module Federation `name`: `{screenset}Mfe` (camelCase)

4. **Rewrite `mfe.json` GTS IDs**
   - Replace the manifest ID, every entry ID, and every extension ID using
     template-mfe's ID taxonomy (`gts-id-conventions` guideline; worked examples in
     `gts-id-patterns-reference`).
   - Update `remoteEntry` to `http://localhost:{port}/assets/remoteEntry.js`.

5. **Implement the screen**
   - Rename/replace `src/screens/home/HomeScreen.tsx` with the real screen.
   - Author the screen's real copy in the ONE locale file whose name matches the
     language of the product phrase driving this run - `en.json` for an English phrase,
     `ru.json` for a Russian one (rename the i18n directory alongside the screen), then
     propagate that one file over every other locale the skeleton ships:
     ```bash
     cd src-app/mfe_packages/{screenset}-mfe/src/screens/home/i18n   # or the renamed directory
     SRC=en.json   # the locale the product speaks; ru.json for a Russian phrase, etc.
     for f in *.json; do [ "$f" = "$SRC" ] || cp "$SRC" "$f"; done
     ```
     A locale file carries the language its name declares. Authoring Russian copy into
     `en.json` renders correctly on screen and still fails review, because every later
     reader takes `en.json` as English. When the source locale is not `en.json`,
     `en.json` is simply another target of the loop.
     The skeleton ships one JSON per locale (36 files at this revision, `ar.json`
     through `zh-TW.json`). The source locale is the one the product speaks today, and
     every other file carries that same copy by design - real translations arrive later
     from translators, not from this workflow. Authoring per-locale content, or writing
     a generator script to produce it, is wasted work. The skeleton's `es.json` carries
     sample Spanish that the loop overwrites, which is intended. Keep the full file set
     rather than deleting the untranslated locales: `useScreenTranslations` falls back
     to `en` for a language with no file, but logs a `No translation module found`
     warning on every such load, which then shows up in step 7's console check.
   - Keep the screen's CLIENT-owned state inside the MFE, never in the host. For such
     state that its components share or that outlives one of them, use the package's flux
     layers - the mechanism this template ships: state shape and reducers go in
     `src/slices/`, registered through `registerSlice` in `init.ts`; every mutation is
     reached through an action in `src/actions/` that emits an event declared in
     `src/events/`; effects in `src/effects/` are the only place that dispatches. State
     that lives and dies with one component may stay in `useState` - an uncommitted input
     draft, a submit outcome only that component displays, the open/closed flag of a
     control it owns - as do bridge-delivered values (theme, language).
   - SERVER-owned data stays out of the slice: read and write it through the API service
     with `useApiQuery`/`useApiMutation`, which is what `demo-mfe`'s Profile screen does.
     A screen with both kinds uses both, each where it belongs. Keep or delete the four
     flux files as the screen's own state calls for, and say which in one sentence in the
     package's README, the screen's doc comment, or `init.ts` - see the skill's Boundaries
     for the full ruling.
   - Keep a `data-testid` on every interactive control the copy renames or adds, and on
     the screen's status/result region, following the scaffold's `screen-<control>`
     scheme. Browser verification in step 7 drives the screen through these ids: a screen
     renders inside a shadow root, selectors issued from outside it cannot pierce that
     boundary, and the ids are read from an eval running inside the root.
   - Keep `src/lifecycle.tsx` extending `ThemeAwareReactLifecycle`; keep `init.ts`'s
     plugin chain (`effects()`, `queryCacheShared()`, `mock()`) unless the new MFE has
     a documented reason to diverge.
   - Every file carrying a `declare module '@gears-frontx/*'` block - the events file
     under `src/events/`, the slice under `src/slices/` - must also carry a top-level
     `import` or `export`; without one TypeScript reads the file as a script and the
     block REPLACES the module instead of augmenting it, so every ecosystem import in
     the package fails with TS2305 "has no exported member". `_blank-mfe`'s
     `src/events/homeEvents.ts` keeps an `export {}` for exactly this.
   - Augment each interface on the package that declares it: `EventPayloadMap` on
     `@gears-frontx/react`, `RootState` on `@gears-frontx/state`. `@gears-frontx/react`
     re-declares `EventPayloadMap` but only re-exports `RootState`, so a `RootState`
     augmentation naming `@gears-frontx/react` merges into that re-export alias and
     reaches only part of the ecosystem: `useAppSelector` picks up the new state key
     while `getStore().getState()` still types it `unknown` and fails with TS2571.
     `_blank-mfe`'s `src/slices/homeSlice.ts` names `@gears-frontx/state` for exactly
     this.

6. **Validate**

   Two tiers. TIER 1 runs per package and is the gate "One package per run" points at;
   TIER 2 runs once, after the last package.

   **Tier 1 - per unit, scoped to the new package.** Substitute the package's own name
   from step 3; these are the literal commands, run from the project root:
   ```bash
   npm run type-check --workspace=@gears-frontx/{screenset}-mfe    # tsc --noEmit against the package's tsconfig
   npx eslint src-app/mfe_packages/{screenset}-mfe --max-warnings 0
   npm run test:unit --workspace=@gears-frontx/{screenset}-mfe     # vitest --run --passWithNoTests=false, scoped
   npm run build --workspace=@gears-frontx/{screenset}-mfe         # vite build + Module Federation manifest enrichment
   ```
   Under a minute together against a warm tree, versus 10-11 minutes for tier 2,
   and it catches everything local to the unit: a type error anywhere in the package, a
   lint error, a failing test of its own. The package build type-checks nothing (Vite
   strips types through esbuild, and the build exits 0 with a `TS2322` sitting in the
   package) - it is there to prove the MFE bundles and that its shared-deps and manifest
   enrichment step completes, which no other tier-1 command exercises.

   Failures here name the package that caused them, which is the point of running them
   per unit rather than deferring to the aggregate.

   **Tier 2 - once, after the LAST package.** This is what proves cross-package integrity,
   and ITS numbers are the ones a report may quote; tier 1's are not a substitute:
   ```bash
   npm run type-check              # the aggregate script - every leg, not type-check:app or type-check:mfe alone
   npm run lint                    # eslint over the whole project
   npm run test:unit               # the project's whole suite, not only the new packages'
   npm run arch:deps               # dependency-cruiser boundaries, shell-owned script
   npm run build:mfes              # every MFE, against the final set of packages
   npm run generate:mfe-manifests  # aggregates into public/generated-mfe-manifests.json
   ```
   `generate:mfe-manifests` is what makes the new packages discoverable at runtime, so
   tier 2 is mandatory before step 7 even for a single-package run.

   - Drive interactive `@gears-frontx/ui-kit` components in tests with
     `@testing-library/user-event`, not `fireEvent`. The kit builds Select, Switch and
     their siblings on Base UI, whose pointer handling jsdom does not satisfy from a
     synthetic `fireEvent.click`: the control stays closed or unchanged and the
     assertion fails with nothing to point at. The skeleton ships
     `@testing-library/user-event` in devDependencies for this.
   - Both tiers require step 0's install and build outputs. A tier-1 run against a tree
     that never ran them reports `TS2307` for every ecosystem import, which is a missing
     prerequisite rather than a defect in the new package.

7. **Run and confirm**
   ```bash
   npm run dev:all
   ```
   - Open the app, confirm the new screen mounts, and confirm zero console errors.

   Then run the browser verification a realized screen gets during scaffolding. It is
   written out here rather than referenced, because a brownfield run - a screen added
   to an app that already exists - never loads the base kit's scaffolding skill and so
   would otherwise stop at the mount check:

   1. Start the servers in the background, record the PID, and stop them by that PID
      when verification ends - an orphaned dev server holds the port against the next
      run.
   2. Open the new screen's declared route as a hard navigation to the URL, not only as
      an in-app click, and confirm it mounts with zero console errors.
   3. Click the screen's menu entry and confirm `location.pathname` equals the route the
      extension declares - a screen reachable only by click, or mounting under a
      different path, passes a mount check and fails a user.
   4. Repeat that check under every theme registered in `src-app/app/main.tsx`
      (`app.themeRegistry.register(...)`), resetting to a clean page load between themes
      and capturing the screen in each - a token that resolves in one theme and not the
      next is invisible without per-theme capture.
   5. Record the outcome in `<project>/.frontx/verification-coverage.md`: one row per
      screen and theme, naming what was opened and what was observed. A screen with no
      row there counts as unverified regardless of what was on the display.

## Rollback

If the addition is abandoned before being committed: delete
`src-app/mfe_packages/{screenset}-mfe/`, re-run `npm run generate:mfe-manifests` to
drop it from `public/generated-mfe-manifests.json`, and revert any workspace/script
edits made in step 3.
