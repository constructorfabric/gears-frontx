# Empty

A placeholder for a list, table, or panel with nothing to show — "no
results", "no items yet", a first-run state. Empty has no Base UI
primitive: every part is a plain styled `div` with no interactive or
ARIA behavior of its own.

Composition: `Empty` (root) → `EmptyHeader` (→ `EmptyMedia`, `EmptyTitle`,
`EmptyDescription`, `EmptyDetail`) → `EmptyContent` (arbitrary content) and
`EmptyActions` (a row of buttons).

## When to use

- A table, list, or search result with zero rows.
- A first-run/onboarding panel before any data exists.

## When not to use

- A loading state — use `Skeleton` or `Spinner` while data is in flight;
  `Empty` is for the settled "there is genuinely nothing here" state.
- An error state with a retry action that isn't "no data" — a fetch
  failure reads better as its own message than as `Empty`, though nothing
  stops you from reusing the same parts for one.

## Props (kit level)

`EmptyMedia`:

| Prop | Type | Default |
|------|------|---------|
| `variant` | `'default' \| 'icon'` — `icon` draws a muted rounded square behind the icon; `default` stays transparent | `'default'` |
| `className` | `string` — merged after the variant class | — |

`Empty`, `EmptyHeader`, `EmptyTitle`, `EmptyDescription`, `EmptyDetail`,
`EmptyActions` and `EmptyContent` take no kit-specific props - every prop is
the underlying native element's props (`EmptyDescription` renders a `<div>`,
matching upstream, despite its own props type naming `<p>` - see
`empty.tsx`), forwarded as-is.

## Examples

```tsx
import {
  Button,
  Empty,
  EmptyActions,
  EmptyContent,
  EmptyDescription,
  EmptyDetail,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@gears-frontx/ui-kit';

<Empty>
  <EmptyHeader>
    <EmptyMedia variant="icon">
      <SearchIcon />
    </EmptyMedia>
    <EmptyTitle>No results</EmptyTitle>
    <EmptyDescription>Try a different search term or clear your filters.</EmptyDescription>
    <EmptyDetail>3 filters applied</EmptyDetail>
  </EmptyHeader>
  <EmptyActions>
    <Button onClick={createFirst}>New project</Button>
    <Button variant="outline" onClick={clearFilters}>Clear filters</Button>
  </EmptyActions>
</Empty>

// A bare illustration, no icon chrome
<Empty>
  <EmptyMedia>
    <img src="/empty-inbox.svg" alt="" width={96} height={96} />
  </EmptyMedia>
  <EmptyTitle>Inbox zero</EmptyTitle>
</Empty>
```

## Parts and their spacing

The root card is the drawn 512 wide, padded by the drawn 32, with a 24px
gap between its own children - so a placeholder set inside a wider
container caps out instead of stretching edge to edge. The title is the
drawn 18/24 (medium weight); the description is 14/20, the kit's own Body
role exactly.

`EmptyDetail` is a secondary line under the description - a count, a hint,
the query that came back empty. It goes last inside `EmptyHeader`: the
drawn 16 above it is the header's own 8 gap plus the part's own 8, so the
margin is scoped to that placement and a detail put elsewhere takes its
parent's spacing instead.

`EmptyActions` is the button row at the foot: 8 between buttons, centred,
wrapping. It carries no top margin of its own, because the root is already
a gap-spaced column at 24 - the drawn distance above the actions. Reach for
`EmptyContent` instead when the foot holds arbitrary content (a search
field, a form) rather than a strip of buttons; the two can also nest, with
the actions row last inside the content column.

The icon plate (`EmptyMedia variant="icon"`) is the drawn 48x48 square,
filled with `--secondary`, the role this kit paints a held or chosen
surface with, not `--muted`. The two carry the same value in dark, so the
difference shows in light today. In dark the plate also shares the card's
own colour - that is the drawn palette's own collapse, not a kit gap - so
the plate reads there by its icon alone.

## Anti-patterns

- Do not use `variant="icon"` for a full illustration/image — the muted
  48x48 plate is sized for a small glyph; drop to `variant="default"` (the
  default) for anything larger, or omit `EmptyMedia` entirely.
- Do not put form controls needing `Field`'s label/error wiring inside
  `EmptyContent` — it's for actions (buttons, links), not inputs.
- Do not add a top margin to `EmptyActions` to reach the drawn 24 - the
  root's own gap is already that distance, and a margin would stack on it.
