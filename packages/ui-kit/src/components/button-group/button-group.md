# ButtonGroup

Visually joins a row (or column) of controls into one strip — adjoining
corners round only on the outer edge, adjoining borders don't double up.
Works on ANY direct child (`Button`, `Input`, a `Select` trigger, plain
text), not just buttons, despite the name — matching upstream.

## When to use

- A segmented control (view toggle, alignment picker).
- A split button (primary action + a caret-only dropdown trigger).
- An input with an attached action (`Input` + `Button` side by side) where
  `InputGroup`'s icon-slot model doesn't fit — e.g. the attached control
  needs its own independent width or a popup trigger.

## When not to use

- A single input's own leading/trailing icon or icon-button — use `Input`'s
  `icon`/`end` slots, or `InputGroup` for a richer multi-part field.

## Parts

| Part | Renders | Notes |
|------|---------|-------|
| `ButtonGroup` | `<div role="group">` | The joining container |
| `ButtonGroupText` | `<div>` (or `render`) | A static label between controls |
| `ButtonGroupSeparator` | `Separator` | A thin divider between controls, `vertical` by default |

## Props (kit level)

`ButtonGroup`:

| Prop | Type | Default |
|------|------|---------|
| `orientation` | `horizontal` \| `vertical` | `horizontal` |
| `className` | `string` | — |

`ButtonGroupText` accepts a `render` prop (`useRender.ComponentProps<'div'>`)
to render through a different element (e.g. a `<label>` next to an
adjoining input) while keeping the group's typography.

`ButtonGroupSeparator` forwards every `Separator` prop; `orientation`
defaults to `vertical` here specifically because a divider INSIDE a
horizontal group is a vertical stroke (and vice versa) — the opposite of
`Separator`'s own `horizontal` default.

## Examples

```tsx
import { Button, ButtonGroup, ButtonGroupSeparator, ButtonGroupText } from '@gears-frontx/ui-kit';

// Segmented control
<ButtonGroup>
  <Button variant="outline">Left</Button>
  <Button variant="outline">Center</Button>
  <Button variant="outline">Right</Button>
</ButtonGroup>

// Split button
<ButtonGroup>
  <Button>Save</Button>
  <Button aria-label="More save options" icon={<CaretDownIcon />} />
</ButtonGroup>

// Vertical, with a divider and a static label
<ButtonGroup orientation="vertical">
  <ButtonGroupText>Sort</ButtonGroupText>
  <ButtonGroupSeparator />
  <Button variant="outline">Newest first</Button>
  <Button variant="outline">Oldest first</Button>
</ButtonGroup>

// An input attached to an action button
<ButtonGroup>
  <Input placeholder="Amount" />
  <Button variant="outline">Max</Button>
</ButtonGroup>
```

## Anti-patterns

- Do not nest a `ButtonGroup` more than one level deep expecting the join
  styling to compose automatically — the corner/border rules target DIRECT
  children only, by design (so an arbitrarily deep tree of unrelated
  wrappers never accidentally gets joined).
- Do not rely on `ButtonGroup` for keyboard roving-tabindex behavior — it is
  a pure visual/structural join (`role="group"` only), not a Base UI
  toolbar/radio-group primitive; each child keeps its own native tab stop.
