---
name: frontx-template-inbox-add-inbox-screen
description: "Add a screen to the helpdesk inbox workspace this template contributes - a new lifecycle module, a new entry and extension in the package's mfe.json, a new screen directory, wired to the workspace's existing service and chrome."
---

# Add a Screen to the Inbox Workspace (template-inbox)

**Precondition:** the project already has `template-shell` applied (the host and
its build pipeline), `template-mfe` applied (the microfrontend ground), and this
template applied (`src-app/mfe_packages/inbox-mfe/`). This skill adds a screen
inside that package; it does not create a package and it does not apply a
template.

## When to use

The project wants another screen in the helpdesk workspace: a second directory
of conversations, a queue, a report over the same data. Check the
`inbox-scope-inventory` guideline first - several plausible-sounding screens are
deliberately not part of this product.

Adding a microfrontend package rather than a screen inside this one is the
`add-mfe-package` skill in the `frontx-template-mfe` bundle.

## What the workspace already gives you

- **A service and a dataset**: one `InboxApiService` with six reads and one
  write, and every conversation, message and contact behind it. See the
  `inbox-data-contract` guideline.
- **Chrome**: the left column's footer with its theme toggle and profile menu,
  the presence avatar, the relative-time formatters, the overlay container and
  the workspace root, all in `src/shared/`. See the `inbox-chrome-contract`
  guideline.
- **A composition to copy**: `src/screens/inbox/` is the nearest existing screen
  in this workspace and the one to reuse the vocabulary of. The
  `inbox-screen-inventory` reference artifact in this bundle maps each pane and
  each part of both shipped screens to the kit component that renders it.

## Steps

1. **Read the three guidelines in this bundle before writing anything.** Scope
   first: if the request is on the not-to-build list, say so and stop.

2. **Add the screen directory** at `src/screens/{screen}/`, with the screen
   component and any parts of its own. Wrap the whole screen in `WorkspaceRoot`
   and put its left column's footer in `WorkspaceSidebarFooter`, so the theme
   toggle, the profile menu and the host effects behave the same on every
   screen.

3. **Compose from `@gears-frontx/ui-kit` and its semantic tokens.** Consult the
   installed kit's `llms.txt` for the inventory and the reference artifact in
   this bundle for what this workspace already uses for each part.
   Hand-rolling a look-alike of a kit component is a defect, not a style
   choice. Layout goes in the package's own CSS module on kit tokens; no raw
   colors, no Tailwind classes, no second stylesheet.

   If `.frontx/ai/@gears-frontx/template-design-guardrails/` exists in the
   project, that bundle's `generate-interface` skill and its design contract
   govern how the screen is generated - follow them, and load the contract once
   for the whole screen rather than re-reading it per file. If it is not
   installed, state in the plan that the screen is being generated without a
   design contract.

4. **Add the lifecycle module** at `src/lifecycle-{screen}.tsx`, extending
   `ThemeAwareReactLifecycle`, overriding `initializeStyles` with
   `appendWorkspaceStyles`, and rendering the screen from `renderContent`. Copy
   `src/lifecycle-inbox.tsx`; it is nineteen lines.

5. **Expose it** in `vite.config.ts` under `exposes` as
   `'./lifecycle-{screen}': './src/lifecycle-{screen}.tsx'`.

6. **Declare it** in `mfe.json`: one entry whose `exposedModule` is that key,
   and one extension on the fixed screen domain with a `presentation` block.
   Author both IDs under the `frontx.inbox.*` namespace, following the
   `gts-id-conventions` guideline in the `frontx-template-mfe` bundle. Give
   `presentation.order` a value that puts the screen where it belongs relative
   to Inbox (10) and Contacts (20).

7. **Add its copy** to `src/i18n/en.json`. The package ships English only and
   the hook falls back to it, so one file is the whole job.

8. **Regenerate manifests and check**, scoped to this package while iterating:

   ```bash
   npm run type-check --workspace=@gears-frontx/inbox-mfe
   npm run test:unit --workspace=@gears-frontx/inbox-mfe
   npm run build --workspace=@gears-frontx/inbox-mfe
   npm run generate:mfe-manifests
   ```

   Then once, at the end: `npm run type-check`, `npm run test:unit`,
   `npm run lint`, and `npm run dev:all` with the new screen mounted and the
   console clean.

## Boundaries

- No Redux and no host store. Screen state is local React state; server state
  comes through `useApiQuery` against this package's own service.
- No second API service, and no fixture files.
- No edits to any shell-owned file. If a screen seems to need one, it is asking
  for a host extension point that does not exist; say so rather than working
  around it.
