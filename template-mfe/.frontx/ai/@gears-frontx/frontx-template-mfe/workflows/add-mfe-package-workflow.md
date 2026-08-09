# Workflow: Add an MFE Package (template-mfe)

Ordered execution procedure for the `add-mfe-package` skill in this same bundle. Use
this workflow when actually performing the addition (not just reasoning about it);
each step names the concrete command or file template-mfe ships.

## Preconditions

- An applied `template-shell` is already in the project (root `package.json`,
  `src-app/app/`, build/test/manifest pipeline) — `template-mfe` adds MFE packages
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
   - Update `src/screens/home/i18n/*.json` (or rename the directory) with real copy
     for every locale the template ships.
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
   - `type-check` and `test:unit` require the ecosystem packages to be built
     first - run this once per clone, before either, whether you invoke them at
     the project root or inside the new package:
     ```bash
     npm run build:packages
     ```
     An MFE package's `tsconfig.json` carries no `@gears-frontx/*` path mapping,
     so `tsc` (and `vitest`) resolve those imports through `node_modules` to each
     package's built entry under `packages/*/dist`. The shell's
     `tsconfig.app.json` maps them to `packages/*/src` instead, which is why the
     shell type-checks on a fresh clone while an MFE reports `TS2307: Cannot find
     module '@gears-frontx/react'` for every ecosystem import. Steps 2-6 are
     unaffected: `vite build` externalizes the ecosystem packages, so
     `npm run build:mfes` needs no `dist`.

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
