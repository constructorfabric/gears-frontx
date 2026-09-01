---
name: frontx-template-inbox-add-inbox-screen
description: "Add a screen to the helpdesk application this template establishes - a new screen directory, a route, a rail button, wired to the app's existing API service and chrome."
---

# Add a Screen to the Inbox App (template-inbox)

**Precondition:** this template has been applied, so the project *is* the app -
`src/app/`, `src/api/` and `src/screens/` all exist. This skill adds a screen
inside that app. It does not create a package and it does not apply a template.

## When to use

The project wants another section: a second directory of conversations, a queue,
a report over the same data. Check the `inbox-scope-inventory` guideline first -
several plausible-sounding screens are deliberately not part of this product.

## What the app already gives you

- **A service and a dataset per domain**: `InboxApiService` (six reads, one
  write) behind the chat and contacts screens, `MailApiService` (three reads)
  behind the mail screen, and `DashboardApiService` (one read, the whole
  dashboard snapshot together) behind the dashboard, each read through
  `useApiQuery`. A screen whose domain does not overlap with any of the three
  gets its own sibling service the same way mail and the dashboard did. See
  the `inbox-data-contract` guideline.
- **Chrome**: the icon rail, hash routing, the theme, the copy catalogue, the
  presence avatar and the relative-time formatters, in `src/app/` and
  `src/shared/`. See the `inbox-chrome-contract` guideline.
- **A composition to copy**: `src/screens/inbox/` is the nearest existing screen
  and the one to reuse the vocabulary of. The `inbox-screen-inventory` reference
  artifact in this bundle maps each pane and each part of both shipped screens
  to the kit component that renders it.

## Steps

1. **Read the three guidelines in this bundle before writing anything.** Scope
   first: if the request is on the not-to-build list, say so and stop.

2. **Add the screen directory** at `src/screens/{screen}/`, with the screen
   component and any parts of its own. The screen renders its panes as siblings
   - the rail and the app frame are already around it, so it needs no wrapper of
   its own. It takes `t` as a prop, and takes any route input (an id, a filter)
   as a prop too, rather than reading the URL itself.

3. **Compose from `@gears-frontx/ui-kit` and its semantic tokens.** Consult the
   installed kit's `llms.txt` for the inventory and the reference artifact in
   this bundle for what this app already uses for each part. Hand-rolling a
   look-alike of a kit component is a defect, not a style choice.

   If `.frontx/ai/@gears-frontx/template-design-guardrails/` exists in the
   project, that bundle's `generate-interface` skill and its design contract
   govern how the screen is generated - follow them, and load the contract once
   for the whole screen rather than re-reading it per file. If it is not
   installed, state in the plan that the screen is being generated without a
   design contract.

   Layout on kit tokens: `src/styles/workspace.module.css` for a screen that
   reuses the existing pane/header/sidebar shapes, or - only when the screen's
   own grid and type scale are specific enough that folding them into the
   shared file would add classes nothing else reads - its own CSS module the
   way `src/styles/dashboard.module.css` does for the dashboard. Either way:
   kit tokens only, no raw colours, no CSS framework.

4. **Give it a route** in `src/app/routing.ts`: a variant in the `Route` union,
   a branch in `parseRoute`, and a `{screen}Route` constant or builder. Extend
   `routing.test.ts` in the same edit - the parser is the one place a wrong
   address turns into a wrong screen silently.

5. **Render it** from `src/app/App.tsx`, on that route.

6. **Put it in the rail** in `src/app/IconRail.tsx`: one `Button` with a
   `lucide-react` icon, `aria-label`, `aria-current` when active, and an
   `onClick` that navigates. Extend `sectionOf` so the button lights up for
   every route that belongs to the section, including sub-routes.

7. **Add its copy** to `src/i18n/en.json`, including the rail button's label.

8. **Check.**

   ```bash
   npm run type-check
   npm run lint
   npm run test:unit
   npm run build
   ```

   Then `npm run dev`, open the new screen from the rail, reload on its own
   address to confirm the route resolves, toggle the theme, and confirm the
   console is clean.

## Boundaries

- No global store. Screen state is local React state; server state comes through
  `useApiQuery` against the app's own service.
- No new service for a screen whose domain already overlaps with `InboxApiService`, `MailApiService` or `DashboardApiService` - read from the one that already owns it. No fixture files, ever, for any service.
- No router dependency. A handful of routes and a parser are the whole
  mechanism; if a screen genuinely needs nested layouts or loaders, say so and
  let the project decide to adopt a router, rather than adding one inside a
  screen.
- No CSS framework and no second component library.
