# ToggleGroup

A set of related toggle buttons that share pressed state. Wraps the Base
UI ToggleGroup/Toggle primitives: single- or multiple-selection, arrow-key
navigation between items, state via `data-pressed` on each item.

## When to use

- A small set of related options presented as buttons: text alignment
  (left/center/right), view mode (list/grid), a multi-select filter row.

## When not to use

- Mutually-exclusive options with more prose or more than ~6 choices —
  use `radio-group`.
- A single independent on/off control — use `toggle`.

## Props (kit level)

`ToggleGroup`:

| Prop | Type | Default |
|------|------|---------|
| `value` / `defaultValue` | controlled / uncontrolled array of pressed item values | — |
| `onValueChange` | `(values: string[], eventDetails) => void` | — |
| `multiple` | allow more than one item pressed at once | `false` |
| `orientation` | `horizontal` \| `vertical` | `horizontal` |
| `disabled` | disables every item in the group | `false` |
| `variant` | `default` \| `outline` — applied to every item unless an item overrides it | `default` |
| `size` | `default` \| `sm` \| `lg` — applied to every item unless an item overrides it | `default` |
| `spacing` | `number` - gap between items, in pixels; `0` also switches to the segmented look (see "Deviation from upstream") | `undefined` |
| `className` | `string` — merged after the kit class | — |

`ToggleGroupItem`: `value` (required — identifies the item), `variant`,
`size` (fall back to the group's when the group sets one), `className`;
other props follow Base UI Toggle (`disabled`, ...).

## Examples

```tsx
import { ToggleGroup, ToggleGroupItem } from '@gears-frontx/ui-kit';

// Single selection (the default)
<ToggleGroup value={align} onValueChange={([v]) => setAlign(v)} aria-label="Text alignment">
  <ToggleGroupItem value="left" aria-label="Align left"><AlignLeftIcon /></ToggleGroupItem>
  <ToggleGroupItem value="center" aria-label="Align center"><AlignCenterIcon /></ToggleGroupItem>
  <ToggleGroupItem value="right" aria-label="Align right"><AlignRightIcon /></ToggleGroupItem>
</ToggleGroup>

// Multiple selection
<ToggleGroup multiple defaultValue={['bold']} variant="outline" aria-label="Text formatting">
  <ToggleGroupItem value="bold" aria-label="Bold"><BoldIcon /></ToggleGroupItem>
  <ToggleGroupItem value="italic" aria-label="Italic"><ItalicIcon /></ToggleGroupItem>
</ToggleGroup>

// Vertical, large
<ToggleGroup orientation="vertical" size="lg" aria-label="View mode">
  <ToggleGroupItem value="list" aria-label="List view"><ListIcon /></ToggleGroupItem>
  <ToggleGroupItem value="grid" aria-label="Grid view"><GridIcon /></ToggleGroupItem>
</ToggleGroup>

// Segmented (spacing={0}) - a single bordered strip instead of
// independently bordered items; pair with variant="outline" for the
// border to actually show.
<ToggleGroup spacing={0} variant="outline" aria-label="View mode">
  <ToggleGroupItem value="list" aria-label="List view"><ListIcon /></ToggleGroupItem>
  <ToggleGroupItem value="grid" aria-label="Grid view"><GridIcon /></ToggleGroupItem>
</ToggleGroup>
```

## Anti-patterns

- Do not render a `ToggleGroupItem` outside a `ToggleGroup` — pressed
  state, arrow-key navigation, and single/multiple selection all live on
  the group; use standalone `Toggle` instead.
- Do not omit `aria-label`/`aria-labelledby` on the group — it groups
  buttons, but the group itself still needs a name for assistive tech.

## Deviation from upstream

Upstream's `spacing` prop is ported: a plain number sets the gap between
items in pixels, and `0` additionally collapses the group into a bordered
"segment" look, with adjoining items sharing borders and rounding only on
the group's own outer corners, matching the design spec's segmented
specimen. Upstream reaches the segment look through arbitrary sibling
selectors with no direct CSS Modules equivalent; this port reaches the
same geometry through plain structural selectors keyed on
`data-spacing`, the same join idiom `ButtonGroup` already uses for its own
bordered strip (see button-group.module.css). Leaving `spacing` unset
renders exactly what this component always has - a fixed `--space-1` gap
between independently bordered items - so no existing consumer's markup
changes.
