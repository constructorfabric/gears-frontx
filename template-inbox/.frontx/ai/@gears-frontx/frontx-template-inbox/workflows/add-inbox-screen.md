# Workflow: Add a Screen to the Inbox App

Ordered execution procedure for the `add-inbox-screen` skill in this same
bundle. Use it when carrying the addition out; the skill remains the authority
on each step and on the boundaries.

## Preconditions

- This template is applied, so the project is the app: `src/app/`, `src/api/`
  and `src/screens/` exist and `npm run dev` runs it.
- The screen has been checked against the `inbox-scope-inventory` guideline and
  is not on the not-to-build list.
- `{screen}` below is the screen's kebab-case name, `{Screen}` its PascalCase
  form.

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
   - Props: `t`, plus whatever the route carries. No wrapper element of its own -
     the panes are siblings, and the app frame is already around them.
   - Read data with `useApiQuery` off `getInboxApi()`.
   - Layout classes go in `src/styles/workspace.module.css`.

3. **Add the route** in `src/app/routing.ts`:
   ```ts
   export type Route = … | { name: '{screen}' };
   export const {SCREEN}_ROUTE = '#/{screen}';
   ```
   plus the branch in `parseRoute`, and a case in `src/app/routing.test.ts`.

4. **Render it** in `src/app/App.tsx`, on `route.name === '{screen}'`.

5. **Add the rail button** in `src/app/IconRail.tsx`, and extend `sectionOf` so
   it stays active on the screen's sub-routes.

6. **Add the copy** to `src/i18n/en.json`, the rail label included.

7. **Check.**
   ```bash
   npm run type-check
   npm run lint
   npm run test:unit
   npm run build
   ```

8. **Run it.**
   ```bash
   npm run dev
   ```
   Open the screen from the rail; reload on its own address to confirm the route
   resolves from a cold load; toggle the theme; confirm the console is clean.

## Rollback

Delete `src/screens/{screen}/`, revert the route variant, its `parseRoute`
branch and its test case, the `App.tsx` branch, the rail button and `sectionOf`
entry, and drop the keys added to `src/i18n/en.json`.
