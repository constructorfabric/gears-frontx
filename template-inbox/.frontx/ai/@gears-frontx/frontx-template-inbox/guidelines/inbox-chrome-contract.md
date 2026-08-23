# Guideline: The App's Chrome, and What a New Screen Plugs Into

This application owns its whole document. There is no host to ask for anything,
so every mechanism below is a module in `src/app/` that a screen simply calls.
Reuse them; do not write a second copy of any of them.

## The icon rail is the navigation

`src/app/IconRail.tsx` is the app's fixed 64px left edge: the product mark at
the top, one button per section, a flexible spacer, then the theme toggle and
the profile-menu popover at the bottom. Adding a section means adding a button
there and a branch in `src/app/App.tsx` - there is no manifest, no extension
declaration and no id taxonomy.

The rail never collapses. It is the edge the rest of the layout is measured
from; the folder and filter columns beside it are the ones that collapse.

The dashboard is the one screen with no folder/filter column at all - it is a
single full-width, scrollable pane straight after the rail. Not every screen
needs a secondary sidebar; add one only when the screen actually has a
folder/filter concept to hold, the way chat and mail do.

## Routing is the URL fragment

`src/app/routing.ts` owns five routes and the parser for them:

| Route | Screen |
|---|---|
| `#/dashboard` | the dashboard - the default for any unrecognised address, including a stale `#/inbox` link |
| `#/chat` | the chat screen |
| `#/mail` | the mail screen |
| `#/contacts` | the contacts directory |
| `#/contacts/{id}` | one contact's page |

Two properties are load-bearing:

- **A section's own sub-state that a visitor could want to return to belongs in
  the route, not in screen state.** A contact's page is a route for exactly that
  reason: "View contact" in a thread is `navigate(contactRoute(id))`, and the
  address it produces reloads, bookmarks and shares.
- **The fragment, not the path.** A fragment needs no server rewrite, so the
  built `index.html` deep-links correctly from any static host. Adding a route
  means extending `parseRoute` and its test, not adding a router.

## Theme is one attribute

`src/app/theme.ts` sets `data-theme` on the document root and mirrors it to
`localStorage`; `@gears-frontx/ui-kit/theme.css` repaints every token from that
attribute. The app is dark-first, and `index.html` already ships
`data-theme="dark"` so the first paint is dark before any script runs -
`applyStoredTheme()` in `src/main.tsx` then corrects it for a visitor who chose
light, before the first render.

A screen never reads or writes the theme. `useTheme` exists for the one toggle
in the rail.

## Copy

`src/app/i18n.ts` exports `t`, reading `src/i18n/en.json`. Screens take `t` as a
prop rather than importing it, which is what keeps them renderable in a test
with `t = (key) => key`. Add a screen's strings to that one file.

## Kit overlays need nothing

Select, Popover, Dialog, DropdownMenu, Tooltip and Sheet portal to `<body>`,
which is this app's own document. Pass no `container`.

## Styles

Kit component CSS travels with each component the bundler pulls in; there is
nothing to import. The app's own layout lives in
`src/styles/workspace.module.css`, written entirely in kit tokens - no raw
colour, no raw metric, no CSS framework. `src/styles/app.css` is the document
frame alone (full height, no page scroll) and should not grow. The dashboard
is the one screen with a CSS module of its own, `src/styles/dashboard.module.css`
- its grid composition and its KPI/hero/chip type scale are specific enough to
that one screen that folding them into the shared file would only add classes
nothing else reads. A future screen with a similarly self-contained layout can
follow the same split; a screen that reuses the existing pane/header/sidebar
shapes should keep reading `workspace.module.css` instead of starting a new
file.

## Differences from the reference product, all intentional

A screen added later should match these, not try to correct them.

1. The rail's mark is a neutral helpdesk glyph, not the reference's brand.
2. Only the sections this app ships appear in the rail; the out-of-scope ones
   are absent (see the `inbox-scope-inventory` guideline).
3. The palette is the kit's tokens, not the reference's own.
4. The rail's out-of-scope bottom controls - command palette, messenger
   settings, settings, theme customiser - are absent; the theme toggle and the
   profile menu are the whole bottom cluster.
5. Profile, Settings and Log out in the profile menu are inert, as they are in
   the reference.
6. The panes collapse for tablet and phone widths; the rail keeps its shape at
   every width, which is also what the reference does.
