# DropdownMenu

A menu of actions anchored to a trigger. Wraps the Base UI Menu
primitives; the popup is portalled, keyboard navigation (arrow keys,
typeahead, roving focus), and Escape/outside-press dismissal come from
Base UI.

Composition: `DropdownMenu` (root, holds open state) →
`DropdownMenuTrigger` → `DropdownMenuContent` (portals
`DropdownMenuGroup` / `DropdownMenuItem` / `DropdownMenuCheckboxItem` /
`DropdownMenuRadioGroup` + `DropdownMenuRadioItem` /
`DropdownMenuSeparator` / `DropdownMenuShortcut`). `DropdownMenuLabel`
requires a `DropdownMenuGroup` or `DropdownMenuRadioGroup` ancestor —
Base UI throws if it is used outside one (it looks up the group it
labels from context). Nest a submenu with `DropdownMenuSub` →
`DropdownMenuSubTrigger` → `DropdownMenuSubContent`.

## When to use

- A set of actions or options anchored to a trigger (row actions, a
  "more" button, an avatar menu).
- Mutually exclusive or independent toggles that live inside a menu
  (`DropdownMenuRadioItem`, `DropdownMenuCheckboxItem`).

## When not to use

- Picking one value from a list bound to a form field — use `select`.
- A focused task or confirmation that should block the page — use
  `dialog`.
- A single-line contextual hint — use `tooltip`.

## Props (kit level)

`DropdownMenu` (root): `open` / `defaultOpen`, `onOpenChange`, `modal`
(`true` default), `loopFocus`, `highlightItemOnHover` — see Base UI
Menu.Root.

`DropdownMenuContent` / `DropdownMenuSubContent`:

| Prop | Type | Default |
|------|------|---------|
| `side` | `top` \| `bottom` \| `left` \| `right` \| `inline-start` \| `inline-end` | `bottom` (Content), `right` (SubContent) |
| `align` | `start` \| `center` \| `end` | `start` |
| `sideOffset` / `alignOffset` | `number` | `4` / `0` (Content), `0` / `-3` (SubContent) |
| `container` | DOM node to portal the popup into; `DropdownMenuSubContent` inherits the nearest Content's unless given its own | `<body>` |
| `positionMethod` | `absolute` \| `fixed` — pass `fixed` when the trigger sits inside a `transform`/`filter` container (an animated panel), where absolute positioning resolves against the wrong box | `absolute` |
| `collisionBoundary` / `collisionPadding` | see Base UI Menu.Positioner — bound and pad the flip/shift collision logic | viewport / `5` |
| `className` | `string` — merged after the kit class | — |

`DropdownMenuContent` sizes its popup to the trigger's width
(`--anchor-width`, floored at a `min-width`); `DropdownMenuSubContent`
sizes to its own content instead, since a submenu's anchor is its own
(usually narrow) `DropdownMenuSubTrigger` item, not the top-level
trigger.

The popup portals to `<body>` by default, so if your theme lives on a
subtree (`data-theme` on a section instead of `<html>`), pass that
section as `container` or the popup renders with the root theme — same
contract as `Dialog` and `Select`.

`DropdownMenuItem`: `variant` — `default` | `destructive`, `disabled`,
`closeOnClick` (`true` by default — Base UI closes the menu on
selection).

`DropdownMenuCheckboxItem`: `checked` / `defaultChecked`,
`onCheckedChange`; `DropdownMenuRadioGroup` + `DropdownMenuRadioItem`:
`value` / `defaultValue`, `onValueChange` on the group, `value` on each
item — both leave `closeOnClick` at Base UI's default of `false` so the
menu stays open after a toggle.

`DropdownMenuRadioItem`:

| Prop | Type | Default |
|------|------|---------|
| `indicatorSide` | `'end'` \| `'start'` - start reserves a 32 px leading slot and fills the checked row | `'end'` |

`DropdownMenuTrigger` is an unstyled pass-through (native `<button>`
semantics) — compose it with `Button` via its `render` prop for a
styled trigger, same as `DialogTrigger`.

## Examples

```tsx
import {
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@gears-frontx/ui-kit';

<DropdownMenu>
  <DropdownMenuTrigger render={<Button variant="outline" />}>Options</DropdownMenuTrigger>
  <DropdownMenuContent>
    <DropdownMenuGroup>
      <DropdownMenuLabel>Account</DropdownMenuLabel>
      <DropdownMenuItem>
        Profile
        <DropdownMenuShortcut>⇧⌘P</DropdownMenuShortcut>
      </DropdownMenuItem>
    </DropdownMenuGroup>
    <DropdownMenuSeparator />
    <DropdownMenuCheckboxItem checked={showBookmarks} onCheckedChange={setShowBookmarks}>
      Show bookmarks
    </DropdownMenuCheckboxItem>
    <DropdownMenuSeparator />
    <DropdownMenuRadioGroup value={view} onValueChange={setView}>
      <DropdownMenuRadioItem value="list">List view</DropdownMenuRadioItem>
      <DropdownMenuRadioItem value="grid">Grid view</DropdownMenuRadioItem>
    </DropdownMenuRadioGroup>
    <DropdownMenuSeparator />
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>More tools</DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        <DropdownMenuItem>Extensions</DropdownMenuItem>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
    <DropdownMenuSeparator />
    <DropdownMenuItem variant="destructive" onClick={handleDelete}>
      Delete account
    </DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
```

## Anti-patterns

- Do not use `DropdownMenu` for page navigation between routes when a
  plain link list would do — reserve it for actions/options anchored to
  a trigger.
- Do not put `DropdownMenuCheckboxItem` / `DropdownMenuRadioItem`
  directly under `DropdownMenuContent` when they represent a bound
  single-select value elsewhere in the app — use `select` or
  `radio-group` for form state instead.
- Do not nest more than one level of `DropdownMenuSub` — deep submenu
  chains are hard to navigate with a mouse or keyboard.
