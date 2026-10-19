# Item

A single row in a list of similar things — a notification, a file, a
search result, a settings row. Unlike Card, Item is built for repetition:
`ItemGroup` spaces a run of them and gives the run `role="list"`.

Item's root is the one part in this file with real behavior: it is built
on Base UI's headless `useRender`/`mergeProps` utilities (not a stateful
primitive) so it can render as something other than a `<div>` — e.g. a
whole item as a link via `render={<a href="..." />}`. Every other part is
a plain styled element, same as Card.

Composition: `ItemGroup` (→ `Item`+, separated by optional
`ItemSeparator`) → `Item` (→ `ItemMedia`, `ItemContent` (→ `ItemTitle`,
`ItemDescription`), `ItemActions`, `ItemHeader`, `ItemFooter`).

## When to use

- A row in a list/table-like collection where each row shares the same
  shape (icon/avatar, title + description, trailing action).
- A single row that should itself be a navigation target — pass
  `render={<a href="..." />}` instead of wrapping a link around it.

## When not to use

- A one-off bounded panel of unrelated content — use `Card`.
- Genuinely tabular data (sortable columns, cell alignment) — use `table`.

## Props (kit level)

`Item`:

| Prop | Type | Default |
|------|------|---------|
| `variant` | `'default' \| 'outline' \| 'muted'` | `'default'` |
| `size` | `'default' \| 'sm' \| 'xs'` | `'default'` |
| `render` | `ReactElement \| ((props, state) => ReactElement)` — replaces the root element; `state` is `{ variant, size }` | — |
| `className` | `string` — merged after variant/size classes | — |

Rendered as a link (`render={<a href="..." />}`), the row keeps the
surrounding text colour and no underline, so it looks like the plain rows
beside it, and gets the same `--muted` hover fill as a link nested in a row.

`ItemTitle` stays on one line. A short title is as wide as its text; a long
one stops at the width of its column and ends with an ellipsis. Its text is
wrapped in a span that draws the ellipsis; an icon or badge passed beside
the text renders as it is.

`ItemMedia`:

| Prop | Type | Default |
|------|------|---------|
| `variant` | `'default' \| 'icon' \| 'image'` — `image` also shrinks to match the ancestor `Item`'s `size` | `'default'` |

`ItemDescription`:

| Prop | Type | Default |
|------|------|---------|
| `lineClamp` | `number \| 'none'` - lines shown before the text is cut with an ellipsis; `'none'` (or a number below 1) shows the full text | `2` |

The default writes no inline style, so a plain `<ItemDescription>` renders
the same markup as before. Another count travels inline as a private custom
property; `'none'` adds a class that drops the clamp. At every value a long
unbroken token (a URL, an identifier) wraps inside the description
(`overflow-wrap: anywhere`) instead of being cut at its edge, and the
item's media stays top-aligned. Use the prop rather than a `className` that
resets the clamp: such a class competes with the kit's at equal specificity,
so stylesheet order decides, and that order differs between the document and
a shadow root.

```tsx
<ItemDescription lineClamp={3}>{summary}</ItemDescription>
<ItemDescription lineClamp="none">{fullRuleText}</ItemDescription>
```

Every other part (`ItemContent`, `ItemTitle`, `ItemActions`, `ItemHeader`,
`ItemFooter`, `ItemGroup`) takes no
kit-specific props — native element props, forwarded as-is.
`ItemSeparator` takes the kit `Separator`'s own props (its `orientation`
is fixed to `'horizontal'`).

`Item` reflects neither `variant` nor `size` as a DOM attribute — no
`data-slot`/`data-variant`/`data-size`, per the kit-wide convention (see
`card.md`). Style off the exported classes if you need to target a
specific combination from outside the component.

## Examples

```tsx
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
  Button,
} from '@gears-frontx/ui-kit';

<ItemGroup>
  <Item>
    <ItemMedia variant="icon">
      <FileIcon />
    </ItemMedia>
    <ItemContent>
      <ItemTitle>Q3 report.pdf</ItemTitle>
      <ItemDescription>Uploaded 2 days ago, 1.2 MB</ItemDescription>
    </ItemContent>
    <ItemActions>
      <Button variant="ghost" size="sm">Download</Button>
    </ItemActions>
  </Item>
  <ItemSeparator />
  <Item variant="outline" size="sm" render={<a href="/files/2" />}>
    Notes.txt
  </Item>
</ItemGroup>
```

## Anti-patterns

- Do not wrap an `<a>` around an entire `Item` for row-level navigation —
  use `render={<a href="..." />}` on `Item` itself; a nested interactive
  wrapper doesn't get the row's own hover/focus treatment and risks
  interactive-in-interactive nesting once `ItemActions` has its own
  buttons.
- Do not expect `ItemGroup`'s spacing to react to a size set only via
  `className` — the shrink-to-smallest-size behavior reads the `Item`
  size *class* `Item` itself emits from its `size` prop, not an arbitrary
  consumer class.
- Do not put more than one `ItemContent` expecting both to grow — the
  second one goes fixed-width (`flex: none`), matching upstream: the
  pattern is a primary content block plus a fixed trailing block (e.g. a
  timestamp), not two equal columns.
