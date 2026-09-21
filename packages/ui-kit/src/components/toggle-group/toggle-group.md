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
| `spacing` | `number` - gap between items, in pixels; `0` also switches to the segmented look (see "Segmented geometry") | `undefined` |
| `iconOnly` | `boolean` - every item holds a glyph and nothing else: each squares up to the group's size step (32 at `sm`) and draws its glyph at 18; an item's own `iconOnly` applies where the group leaves it unset | `undefined` |
| `className` | `string` — merged after the kit class | — |

`ToggleGroupItem`: `value` (required — identifies the item), `variant`,
`size`, `iconOnly` (fall back to the group's when the group sets one),
`className`; other props follow Base UI Toggle (`disabled`, ...).

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

## Icon view switch

The drawn single-choice icon switch: one square 32 box per option, glyphs
at 18, no gap between them, a hairline strip around the whole thing, and
exactly one option chosen at a time. Every part of it is already a prop -
`spacing={0}` collapses the gap and joins the borders, `variant="outline"`
draws the hairline, `iconOnly` squares the items, and single selection is
what the group does unless `multiple` is set.

Each option carries its own accessible name: the label is not drawn, so it
lives in `aria-label` rather than in hidden text. The group needs a name of
its own too.

```tsx
import { ToggleGroup, ToggleGroupItem } from '@gears-frontx/ui-kit';
import { LayoutGridIcon, ListIcon, TableIcon } from 'lucide-react';

const [view, setView] = useState('list');

<ToggleGroup
  size="sm"
  spacing={0}
  variant="outline"
  iconOnly
  value={[view]}
  onValueChange={([next]) => next && setView(next)}
  aria-label="View"
>
  <ToggleGroupItem value="list" aria-label="List"><ListIcon /></ToggleGroupItem>
  <ToggleGroupItem value="grid" aria-label="Grid"><LayoutGridIcon /></ToggleGroupItem>
  <ToggleGroupItem value="table" aria-label="Table"><TableIcon /></ToggleGroupItem>
</ToggleGroup>;
```

`onValueChange` hands back an array even in single selection, and that
array is empty when the chosen option is pressed again. Guarding on
`next` is what keeps a view switch from ending up with nothing chosen; drop
the guard where deselecting is a real state.

## Segmented geometry

The drawn group at `spacing={0}` has no height, no padding, no border and
no fill of its own: the items carry everything. Adjoining items drop the
border they share, the group's own outer corners are the only rounded ones
(10px, or 8px when the group itself is sized `sm`), each item insets its
label by 8, and the selected one takes the `--secondary` fill `Toggle`
already paints for its pressed state.

Every `spacing={0}` group reaches that look, vertical ones on the block
axis instead of the inline one. Upstream reaches it
through arbitrary sibling selectors with no direct CSS Modules equivalent;
this port reaches the same geometry through plain structural selectors keyed
on `data-spacing`, the same idiom `ButtonGroup` already uses for its own
bordered strip (see button-group.module.css).

Leaving `spacing` unset renders exactly what this component always has - a
fixed `--space-1` gap between independently bordered items.
