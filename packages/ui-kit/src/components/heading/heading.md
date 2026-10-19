# Heading

A heading on the kit's type ramp: `typography` picks the ramp role, `render`
picks the element, so the document outline (h1 to h6) and the look stay
independent. No Base UI primitive; `render` comes from
`useRender`/`mergeProps`.

## When to use

- The title of a screen or of a section between kit components.
- A heading whose outline level differs from its look, such as an `h3`
  drawn on the heading-1 role.

## When not to use

- Inside a kit component that has its own title part: use `CardTitle`,
  `EmptyTitle`, `AlertTitle` (each takes `render` for the heading element),
  `DialogTitle` or `ItemTitle`.
- Running text, captions and meta lines: use `Text`.

## Props (kit level)

| Prop | Type | Default |
|------|------|---------|
| `typography` | `'display' \| 'heading-1' \| 'heading-2'` - the ramp role (`--text-<role>-size`, `-line-height`, `-weight`, `-tracking`) on the `--font-heading` family | `'heading-1'` |
| `render` | `ReactElement` or callback - the element, such as `<h1 />` | `h2` |
| `className` | `string` - merged after the role class | - |

All other props are native heading props, forwarded as they are. Margins
are zero: spacing belongs to the layout that places the heading. A larger
display step is branded by overriding the ramp tokens; the kit grows no
role above `display`.

The axis is named `typography`, like `CardTitle`'s: it picks ramp roles,
not a box size. `display` is the 26/32 page title role, `heading-1` the
20/28 role and `heading-2` the 16/24 role.

## Accessibility

- The element carries the outline level; pick it from the document
  structure, never from the look you want.

## Examples

```tsx
import { Heading } from '@gears-frontx/ui-kit';

<Heading typography="display" render={<h1 />}>Settings</Heading>
<Heading typography="heading-2">Members</Heading>
```

## Anti-patterns

- Do not choose `h1` to get a bigger heading: choose `typography` for the
  look and `render` for the level.
- Do not add margins through `className`: space headings with the layout's
  gap.
