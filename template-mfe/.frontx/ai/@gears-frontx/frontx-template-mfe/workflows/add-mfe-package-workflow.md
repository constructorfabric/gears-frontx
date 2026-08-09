# Workflow: Add an MFE Package (template-mfe)

Ordered execution procedure for the `add-mfe-package` skill in this same bundle. Use
this workflow when actually performing the addition (not just reasoning about it);
each step names the concrete command or file template-mfe ships.

## Preconditions

- An applied `template-shell` is already in the project (root `package.json`,
  `src-app/app/`, build/test/manifest pipeline) - `template-mfe` adds MFE packages
  into that shell and does not scaffold a repository on its own.
- The screenset/screen the new MFE will contribute to is already decided.

## Steps

1. **Choose a name and port**
   - Name: `{screenset}-mfe` (kebab-case), placed at `src-app/mfe_packages/{screenset}-mfe/`.
   - Port: next free `30N0` slot after the reserved `3001` (`demo-mfe`).

2. **Copy the scaffold, without `node_modules`**
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
   through `node_modules` rather than through path mapping (step 7), so `tsc` then
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
   - Author the screen's real copy in `src/screens/home/i18n/en.json` only (rename the
     directory alongside the screen), then propagate that one file over every other
     locale the skeleton ships:
     ```bash
     cd src-app/mfe_packages/{screenset}-mfe/src/screens/home/i18n   # or the renamed directory
     for f in *.json; do [ "$f" = en.json ] || cp en.json "$f"; done
     ```
     The skeleton ships one JSON per locale (36 files at this revision, `ar.json`
     through `zh-TW.json`), and every non-English one carries the English copy by
     design - real translations arrive later from translators, not from this workflow.
     Authoring per-locale content, or writing a generator script to produce it, is
     wasted work. The skeleton's `es.json` carries sample Spanish that the loop
     overwrites, which is intended. Keep the full file set rather than deleting the
     untranslated locales: `useScreenTranslations` falls back to `en` for a language
     with no file, but logs a `No translation module found` warning on every such
     load, which then shows up in step 8's console check.
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

6. **Regenerate manifests**
   ```bash
   npm run build:package    # prerequisite - see step 7
   npm run build:packages   # prerequisite - see step 7
   npm run build:mfes
   npm run generate:mfe-manifests
   ```

7. **Validate**
   ```bash
   npm run type-check   # the aggregate script - every leg, not type-check:app or type-check:mfe alone
   npm run lint         # eslint over the whole project
   npm run test:unit    # the project's whole suite, not only the new package's
   npm run arch:deps    # dependency-cruiser boundaries, shell-owned script
   ```
   - `npm run build:mfes` (step 6), `type-check`, and `test:unit` all require the
     project's build outputs to exist first - run this pair once per clone, before
     any of the three, whether you invoke them at the project root or inside the new
     package:
     ```bash
     npm run build:package    # tsup, produces dist-lib
     npm run build:packages   # produces packages/*/dist
     ```
     `build:mfes` needs `dist-lib`: every MFE's `vite.config.ts` imports
     `frontxMfGts` from `@gears-frontx/frontx-template-shell/build/mf-gts`, which the
     root package exports as `./dist-lib/build/mf-gts.js`, so without `build:package`
     the build dies while loading the first MFE's Vite config with
     `ERR_MODULE_NOT_FOUND ... dist-lib/build/mf-gts.js`. `type-check` and
     `test:unit` need `packages/*/dist`: an MFE package's `tsconfig.json` carries no
     `@gears-frontx/*` path mapping, so `tsc` (and `vitest`) resolve those imports
     through `node_modules` to each package's built entry there. The shell's
     `tsconfig.app.json` maps them to `packages/*/src` instead, which is why the
     shell type-checks on a fresh clone while an MFE reports `TS2307: Cannot find
     module '@gears-frontx/react'` for every ecosystem import. Run both commands as
     one prerequisite - the shell's own `build` script orders them exactly this way,
     ahead of `build:mfes`.

8. **Run and confirm**
   ```bash
   npm run dev:all
   ```
   - Open the app, confirm the new screen mounts, and confirm zero console errors.

## Rollback

If the addition is abandoned before being committed: delete
`src-app/mfe_packages/{screenset}-mfe/`, re-run `npm run generate:mfe-manifests` to
drop it from `public/generated-mfe-manifests.json`, and revert any workspace/script
edits made in step 3.
