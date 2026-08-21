# Workflow: Add a Screen to the Inbox Workspace

Ordered execution procedure for the `add-inbox-screen` skill in this same
bundle. Use it when carrying the addition out; the skill remains the authority
on each step and on the boundaries.

## Preconditions

- `template-shell`, `template-mfe` and this template are all applied, so
  `src-app/mfe_packages/inbox-mfe/` exists.
- The screen has been checked against the `inbox-scope-inventory` guideline and
  is not on the not-to-build list.
- `{screen}` below is the screen's kebab-case name.

## Steps

1. **Load the contracts, once.**
   - `guidelines/inbox-scope-inventory.md`, `guidelines/inbox-chrome-contract.md`
     and `guidelines/inbox-data-contract.md` in this bundle.
   - `reference-artifacts/inbox-screen-inventory.json` in this bundle, for what
     the shipped screens use for each part.
   - The installed kit's `llms.txt`, for the component inventory.
   - If `.frontx/ai/@gears-frontx/template-design-guardrails/` exists, its
     design contract as well.

2. **Write the screen.**
   - `src/screens/{screen}/{Screen}Screen.tsx`, plus any parts of its own in the
     same directory.
   - Wrap it in `WorkspaceRoot`; put the left column's footer in
     `WorkspaceSidebarFooter`.
   - Read data with `useApiQuery` off `apiRegistry.getService(InboxApiService)`.
   - Layout classes go in `src/styles/workspace.module.css`.

3. **Write the lifecycle**, copying `src/lifecycle-inbox.tsx`:
   ```
   src/lifecycle-{screen}.tsx
   ```

4. **Expose the lifecycle** in `vite.config.ts`:
   ```ts
   exposes: {
     './lifecycle-inbox': './src/lifecycle-inbox.tsx',
     './lifecycle-contacts': './src/lifecycle-contacts.tsx',
     './lifecycle-{screen}': './src/lifecycle-{screen}.tsx',
   }
   ```

5. **Declare the entry and the extension** in `mfe.json`, copying the shape of
   the two already there:
   - entry id `gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~frontx.inbox.mfe.{screen}.v1`
   - extension id `gts.frontx.mfes.ext.extension.v1~frontx.screensets.layout.screen.v1~frontx.inbox.screens.{screen}.v1`
   - `domain` is the fixed screen domain, verbatim from the existing entries.
   - `presentation`: `label`, `icon` (an Iconify name), `route`, `order`.

6. **Add the copy** to `src/i18n/en.json`.

7. **Check the package while iterating.**
   ```bash
   npm run type-check --workspace=@gears-frontx/inbox-mfe
   npm run test:unit --workspace=@gears-frontx/inbox-mfe
   npm run build --workspace=@gears-frontx/inbox-mfe
   npm run generate:mfe-manifests
   ```

8. **Run the full gate once, at the end.**
   ```bash
   npm run type-check
   npm run test:unit
   npm run lint
   npm run dev:all
   ```
   Open the app, mount the new screen from the menu, and confirm the console is
   clean.

## Rollback

Delete `src/screens/{screen}/` and `src/lifecycle-{screen}.tsx`, remove the
`exposes` key and the entry and extension from `mfe.json`, drop the keys added
to `src/i18n/en.json`, then re-run `npm run generate:mfe-manifests` so the
aggregate no longer offers the screen.
