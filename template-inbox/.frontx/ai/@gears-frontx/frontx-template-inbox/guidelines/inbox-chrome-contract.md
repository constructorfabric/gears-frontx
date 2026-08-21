# Guideline: Where Inbox Chrome May Live

A template contributes screens into the host's screen domain and edits no
shell-owned file. Everything below follows from that, and every mechanism named
here is already shipped in `src-app/mfe_packages/inbox-mfe/src/shared/`. Reuse
those modules; do not write a second copy of any of them.

## The menu is reached by declaration only

A screen appears in the host's left menu by adding one entry to `mfe.json`'s
`extensions[]`, targeting the fixed screen domain with a `presentation` block.
There is no menu file to edit. See the `navigation-contribution` and
`gts-id-conventions` guidelines in the `frontx-template-mfe` bundle for the
field-by-field contract and the ID taxonomy. This workspace's IDs live under
`frontx.inbox.*`.

The screen domain mounts exclusively: exactly one section is live at a time.

## The three host effects, and the modules that own them

| Effect | Module | Mechanism |
|---|---|---|
| Narrow the menu to its icon rail | `shared/workspaceChrome.ts` | `eventBus.emit('layout/menu/collapsed', { collapsed: true })` |
| Apply the workspace's own default theme, and toggle it | `shared/workspaceChrome.ts` | `eventBus.emit('theme/changed', { themeId })` |
| Jump from one screen to the other | `shared/crossScreenNavigation.ts` | `bridge.executeActionsChain` with the mount action, deferred one microtask |

Three properties of these are not guessable from the file names, and each is
load-bearing:

- **The menu collapse and the theme assertion fire once per page load, not once
  per mount.** Mounting the other screen unmounts this one; re-running either
  on mount would undo a choice the visitor made in between.
- **The cross-screen mount is deferred by `queueMicrotask`.** It unmounts the
  React tree that is running the click handler. Calling it synchronously tears
  the tree down mid-event.
- **The theme toggle depends on concrete names the shell owns** (`theme/changed`,
  and the theme ids `light` and `dark`). There is no abstraction to depend on
  instead: the child bridge exposes no way to set a shared property, and the
  shell registers no theme action. If the shell ever grows one, this is the
  coupling to replace.

Read the current theme from the host rather than mirroring it: `useHostTheme`
in `shared/workspaceRuntime.tsx` subscribes to the theme shared property, so a
change made anywhere else is reflected too.

## Kit overlays portal into the shadow root

Select, Popover, Dialog, DropdownMenu, Tooltip and Sheet portal to `<body>` by
default, which is the host document. This package's stylesheet lives in the
shadow root, so a popup built from its classes would render there unstyled.
Pass `container={useOverlayContainer()}` on every kit popup; `WorkspaceRoot`
provides the node.

## Styles

Kit component CSS arrives by style adoption and needs no import. The package's
own layout CSS is delivered by importing the stylesheet twice - once for its
class map, once with `?inline` for the text - and appending it in an
`initializeStyles` override; `shared/appendWorkspaceStyles.ts` is that override
and explains why a plain `import './x.css'` is not a substitute. Never deliver
Tailwind preflight into a shadow root.

## Differences from the reference product, all intentional

A screen added later should match these, not try to correct them.

1. The rail's brand mark is the host's own logo.
2. Only the workspace's own sections appear in the rail; the out-of-scope ones
   are absent (see the `inbox-scope-inventory` guideline).
3. The theme toggle and the profile menu sit at the bottom of the workspace's
   own left column rather than in the rail, because the host renders its menu,
   header and footer with no children slot and registers no slot for the
   sidebar, popup or overlay domains.
4. The host's collapsed menu is 56px against the reference's 64px rail.
5. A top header bar exists that the reference does not have.
6. The host's own user chip and this workspace's agent identity are two
   separate identities, shown in two places.
7. The mount area is inset by the host's screen padding rather than flush to
   the viewport edge.
8. The palette is the kit's tokens, not the reference's own.
9. Dark is applied after the remote mounts, so the first frame is light.
10. There are no URL routes: `presentation.route` is schema-required but the
    shell mounts by action, so the contact detail is in-screen state and
    "View contact" is a mount action rather than a link.
11. Inside the mount area the panes collapse for tablet and phone widths; the
    host's menu, header and footer keep their desktop shape at every width.
