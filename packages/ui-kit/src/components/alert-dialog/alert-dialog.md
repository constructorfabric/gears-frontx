# AlertDialog

A modal overlay that interrupts the user with content they must explicitly
acknowledge — typically a destructive-action confirmation. Wraps the Base
UI AlertDialog primitives (which reuse Dialog's own Popup/Backdrop/Portal/
Title/Description under the hood); focus trapping, page-scroll locking, and
Escape dismissal come from Base UI. Unlike `Dialog`, an alert dialog does
**not** close on outside press — the whole point is that the user must
make an explicit choice via `AlertDialogAction` or `AlertDialogCancel`, not
dismiss it by clicking away.

Composition: `AlertDialog` (root, holds open state) → `AlertDialogTrigger`
→ `AlertDialogContent` (portals `AlertDialogHeader` — optionally with
`AlertDialogMedia` — `AlertDialogTitle`, `AlertDialogDescription`, and
`AlertDialogFooter` with `AlertDialogCancel` / `AlertDialogAction`).

## When to use

- A destructive or otherwise consequential action that needs an explicit
  confirm/cancel choice before it proceeds (delete, discard unsaved
  changes, an irreversible state change).

## When not to use

- Content the user can dismiss by clicking away — use `dialog`.
- A passive notification — use `toast`.
- A menu of actions — use `dropdown-menu`.

## Props (kit level)

`AlertDialog` (root): `open` / `defaultOpen`, `onOpenChange`,
`onOpenChangeComplete` — see Base UI AlertDialog.Root. Always modal; there
is no `modal={false}` escape hatch (unlike `Dialog`).

`AlertDialogContent`:

| Prop | Type | Default |
|------|------|---------|
| `size` | `'default' \| 'sm'` — `sm` narrows the max width and stacks `AlertDialogCancel`/`AlertDialogAction` into two equal columns instead of a row | `'default'` |
| `showBackdrop` | `boolean` — renders the dimming backdrop | `true` |
| `container` | DOM node to portal the popup into | `<body>` |
| `initialFocus` / `finalFocus` | `boolean \| RefObject \| function` — see Base UI Dialog.Popup | default focus behavior |
| `className` | `string` — merged after the kit class | — |

The popup portals to `<body>` by default, so if your theme lives on a
subtree (`data-theme` on a section instead of `<html>`), pass that section
as `container` or the popup renders with the root theme — same contract as
`Dialog`.

`AlertDialogAction` is a plain kit `Button` (any `variant`/`size`) — it
does **not** close the dialog on its own; wire `onClick` to perform the
action and close it yourself (`onOpenChange`, or an `actionsRef`).
`AlertDialogCancel` is a Base UI `AlertDialog.Close` rendered as a `Button`
(`outline` variant by default) — clicking it always closes the dialog.

## Examples

```tsx
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Button,
} from '@gears-frontx/ui-kit';

<AlertDialog>
  <AlertDialogTrigger render={<Button variant="destructive">Delete account</Button>} />
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
      <AlertDialogDescription>
        This action cannot be undone. This will permanently delete your account.
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancel</AlertDialogCancel>
      <AlertDialogAction variant="destructive" onClick={handleDelete}>
        Continue
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>;
```

## Anti-patterns

- Do not rely on outside click or a backdrop click to close an alert
  dialog — Base UI deliberately does not wire that; the user must choose
  `AlertDialogAction` or `AlertDialogCancel`.
- Do not omit `AlertDialogTitle` — Base UI's accessibility tree needs it
  even if visually hidden via `className`.
- Do not use `AlertDialog` for a dismissible, non-blocking notice — use
  `dialog` (with a close button or outside-press dismissal) or `toast`.
