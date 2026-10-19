# DescriptionList

Name and value pairs on real `dl`/`dt`/`dd`, so assistive technology keeps each term with its value. `DescriptionListItem` is the `div` grouping HTML allows inside `dl`.

## When to use

- The facts of a record in a detail panel.
- A short aside of requirements and values.

## When not to use

- A form row with an input: use `Field`.
- Rows the user acts on or navigates: use `Item`.
- Data compared across many records: use `Table`.

## Props (kit level)

| Part | Prop | Type | Default |
|------|------|------|---------|
| `DescriptionList` | `orientation` | `'vertical' \| 'horizontal'` - term above value, or a two-column grid whose term column takes the widest term | `'vertical'` |
| | `size` | `'default' \| 'sm'` - row gap and the value's role (body or meta) | `'default'` |
| `DescriptionListDetails` | `typography` | `'body' \| 'mono'` - the value's ramp role; `mono` sets `--font-mono` | `'body'` |

No part takes `render`: the elements are the point of the component. Terms use the label role on `--muted-foreground`.

## Accessibility

- Real description list semantics; horizontal items sit on a subgrid, so every term lines up in one column.

## Layout

The horizontal term column is as wide as the longest term and does not shrink, so it suits short terms (Owner, Path, Updated). In a panel narrower than the longest term, use the vertical orientation.

## Examples

```tsx
import { DescriptionListDetails, DescriptionListItem, DescriptionList, DescriptionListTerm } from '@gears-frontx/ui-kit';

<DescriptionList orientation="horizontal">
  <DescriptionListItem>
    <DescriptionListTerm>Owner</DescriptionListTerm>
    <DescriptionListDetails>Platform team</DescriptionListDetails>
  </DescriptionListItem>
  <DescriptionListItem>
    <DescriptionListTerm>Path</DescriptionListTerm>
    <DescriptionListDetails typography="mono">src/app/main.tsx</DescriptionListDetails>
  </DescriptionListItem>
</DescriptionList>
```

## Anti-patterns

- Do not build the pairs from `div`s and `span`s.
