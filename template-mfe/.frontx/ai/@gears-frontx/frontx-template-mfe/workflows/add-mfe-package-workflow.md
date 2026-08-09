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

2. **Copy the scaffold**
   ```bash
   cp -r src-app/mfe_packages/_blank-mfe src-app/mfe_packages/{screenset}-mfe
   ```

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
