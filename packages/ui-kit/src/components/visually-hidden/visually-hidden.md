# VisuallyHidden

Text a screen reader reads and the screen does not show. A `span` by default, with `render`. The same declarations the kit repeats
inside several component modules, as the one public copy; the `sr-only` class
in `utilities.css` is the same rule for markup that is not React.

## When to use

- The name of an icon-only link or of a custom control without a label prop.
- A table caption the surrounding heading already shows.
- A live-region announcement.

## When not to use

- An icon-only `Button`: give it `icon` and `aria-label`.
- Text hidden from everyone: do not render it.
- A status dot without a label: give `StatusDot` an `aria-label`.

## Props (kit level)

| Prop | Type | Default |
|------|------|---------|
| `render` | `ReactElement` or callback - the element, such as `<caption />` | `span` |
| `className` | `string` - merged after the kit class | - |

## Accessibility

- The box is absolutely positioned, 1x1px, clipped with
  `clip-path: inset(50%)`, with no padding or border and no wrapping; its
  text stays in the accessibility tree.

## Examples

```tsx
import { VisuallyHidden } from '@gears-frontx/ui-kit';

<a href="/docs"><ExternalLink aria-hidden="true" /><VisuallyHidden>Open the docs</VisuallyHidden></a>
<VisuallyHidden render={<caption />}>Members</VisuallyHidden>
<span className="sr-only">Opens in a new tab</span>
```

## Anti-patterns

- Do not hide a visible label: sighted users need it too.
