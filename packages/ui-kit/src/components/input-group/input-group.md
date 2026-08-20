# InputGroup

Composes an `Input`/`Textarea` with icon, text, and button addons into one
visually unified field — the group draws the border/background/focus ring,
the wrapped control draws none of its own. No Base UI primitive backs it —
pure styling composition over `Input`/`Textarea`/`Button`.

## When to use

- A field with a fixed prefix/suffix (`$`, `.com`, a unit).
- A field with an attached action that shares the field's own border (a
  clear button, a copy button, a password reveal toggle).

## When not to use

- A single leading icon or one small trailing action — `Input`'s own
  `icon`/`end` slots are simpler and don't need the extra parts here.
- Joining independent, differently-sized controls (not one logical field) —
  use `ButtonGroup` instead.

## Parts

| Part | Renders | Notes |
|------|---------|-------|
| `InputGroup` | `<div role="group">` | Draws the field chrome |
| `InputGroupAddon` | `<div role="group">` | Icon/text/button cluster; click focuses the field |
| `InputGroupButton` | `Button` | Compact (`sm`) ghost button by default |
| `InputGroupText` | `<span>` | Static label/icon, not clickable |
| `InputGroupInput` | `Input` | Border/background stripped — the group draws them |
| `InputGroupTextarea` | `Textarea` | Same stripping, plus `resize: none` |

## Props (kit level)

`InputGroupAddon`:

| Prop | Type | Default |
|------|------|---------|
| `align` | `inline-start` \| `inline-end` \| `block-start` \| `block-end` | `inline-start` |

`InputGroupButton` accepts every `Button` prop except `size` (restricted to
`default` \| `sm`, defaulting to `sm`) — see the Implementation note below
for why. `InputGroupInput`/`InputGroupTextarea` forward every `Input`/
`Textarea` prop unchanged.

## Implementation note

Upstream offers `InputGroupButton` sizes `xs`/`sm`/`icon-xs`/`icon-sm`; this
kit's control-height scale (`--control-height-sm/md/lg`, theme.css) has no
step below `sm` (32px), and "icon-only" is a state `Button` derives from its
own `icon` prop (no `children`), not a distinct size — see button.tsx. So
`InputGroupButton` offers `default`/`sm` only, `sm` by default, and a
compact icon-only action is `<InputGroupButton icon={<XIcon />} aria-label="Clear" />`,
not a `size="icon-sm"` that doesn't exist in this kit.

## Examples

```tsx
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
  InputGroupTextarea,
} from '@gears-frontx/ui-kit';

// Prefixed amount field
<InputGroup>
  <InputGroupAddon>
    <InputGroupText>$</InputGroupText>
  </InputGroupAddon>
  <InputGroupInput type="number" placeholder="0.00" aria-label="Amount" />
</InputGroup>

// Search field with a trailing clear button
<InputGroup>
  <InputGroupInput placeholder="Search" aria-label="Search" />
  <InputGroupAddon align="inline-end">
    <InputGroupButton icon={<XIcon />} aria-label="Clear" onClick={clear} />
  </InputGroupAddon>
</InputGroup>

// Multi-line field with a helper row underneath
<InputGroup>
  <InputGroupTextarea placeholder="Notes" aria-label="Notes" />
  <InputGroupAddon align="block-end">
    <InputGroupText>Markdown supported</InputGroupText>
  </InputGroupAddon>
</InputGroup>
```

## Anti-patterns

- Do not put more than one focusable field inside a single `InputGroup` —
  it is one logical field with one set of addons, not a mini form.
- Do not rely on `InputGroupAddon`'s click-to-focus for anything other than
  padding around static content — a button inside the addon keeps its own
  click handling; the addon's own `onClick` only forwards, it does not
  suppress the button's.
