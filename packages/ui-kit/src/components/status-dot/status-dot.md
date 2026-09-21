# StatusDot

An inline status indicator: a 6px round dot plus an optional 12/16 label,
both painted in the tone's own colour. No Base UI primitive and no
interactive behaviour - a pure styling translation over native spans, like
`Skeleton` and `Spinner`.

## When to use

- Reporting the state of a thing that is not an action: a job that is
  running, a connection that is live, a record that failed.
- Dense rows and table cells, where a `Badge`'s pill would be too much
  chrome for a one-word state.

## When not to use

- Use `Badge` with its own `dot` prop when the status needs a filled chip
  (its own background, its own box) or when it sits alone as a column's
  whole content; use `Marker` when the row is a full-width note with an
  icon, a border or a divider, not a single state word. StatusDot is the
  smallest of the three: text plus a dot, no box at all.
- A loading state that has no settled value yet - use `Spinner`.
- The only signal of a state. Colour alone is not an accessible
  distinction, which is why the label sits beside the dot; keep it, or
  name the dot with `aria-label`.

## Props (kit level)

| Prop | Type | Default |
|------|------|---------|
| `tone` | `'neutral' \| 'success' \| 'warning' \| 'danger' \| 'info'` - paints the dot and the label alike (`--muted-foreground` for neutral, `--success` / `--warning` / `--danger` / `--info` for the rest); the root also carries `data-tone` | `'neutral'` |
| `label` | `ReactNode` - the text beside the dot; omitted renders the dot on its own | - |
| `live` | `boolean` - the dot breathes on a 2s opacity cycle and the root carries `data-live`; off under `prefers-reduced-motion` | `false` |
| `render` | `ReactElement` - replaces the root `span`, e.g. with an `<li>` inside a status list | - |
| `className` | `string` - merged after the tone class | - |

All other props are native `<span>` props (or the target element's props
when using `render`) and are forwarded as-is. `children` is not accepted:
the text goes in `label`, so the component can tell a named status from a
bare dot.

## Accessibility

- With a `label`, the label is the announcement and nothing is added.
- Without one, the dot is hidden from assistive tech (`aria-hidden`) -
  a coloured shape announces nothing useful.
- Without one but with an `aria-label`/`aria-labelledby`, the root takes
  `role="img"` so that name actually reaches the accessibility tree (a
  bare `<span>` with an `aria-label` is ignored by most screen readers).

## Examples

```tsx
import { StatusDot } from '@gears-frontx/ui-kit';

<StatusDot tone="success" label="Running" />
<StatusDot tone="danger" label="Failed" />
<StatusDot tone="info" live label="Streaming" />

// Dot only, inside a cell whose column header already says "Status"
<StatusDot tone="warning" aria-label="Degraded" />

// As a list item inside a status list
<StatusDot tone="success" label="Running" render={<li />} />
```

## Anti-patterns

- Do not wrap it in a button or a link - a status is not an action.
  `render` is for the wrapping element only (an `<li>` in a list, for
  instance); reach for `Button` with an icon, or `Marker`'s `render` prop,
  when the row has to be clickable.
- Do not set a colour on it from outside: the tone owns both the dot and
  the label, and overriding `color` splits them from the token they are
  supposed to follow in both themes.
- Do not use `live` for a status that has settled - a dot that keeps
  moving next to "Completed" reads as unfinished work.
