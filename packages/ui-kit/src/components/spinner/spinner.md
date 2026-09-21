# Spinner

A spinning loading indicator — lucide's `loader-circle` icon rotating
continuously via CSS. No Base UI primitive and no variant axis.

Two shapes. Bare, it is that icon and nothing else, at the kit's small icon
step. Given a `label` or a `description`, it becomes the drawn loading
block: the glyph centred in a 36 indicator box with its text beneath it.

## When to use

- A standalone loading indicator next to text ("Saving...") or inside a
  container that has no button of its own to carry `loading`.
- Building a custom loading affordance where `Button`'s own built-in
  `loading` prop (see `button.md`) doesn't apply — e.g. a loading state
  inside a `Card` or a table cell.

## When not to use

- Inside a `Button` — use `Button`'s `loading` prop instead; it already
  centers a spinner, sets `aria-busy`, and keeps the button's label in the
  accessibility tree. Reaching for this component there duplicates that
  wiring by hand.

## Props (kit level)

| Prop | Type | Default |
|------|------|---------|
| `label` | `ReactNode` - the state, written under the indicator in the drawn monospace micro type; its presence is what composes the block | - |
| `description` | `ReactNode` - a second line under the label: what is being waited on, or how long it usually takes | - |
| `compact` | `boolean` - the drawn tighter block, a 28 indicator around a 14 glyph instead of 36 around 18; on a bare spinner it takes the glyph to that same 14 | `false` |

Every other prop is the indicator `<svg>`'s, `className` included, at both
shapes - the layout block the kit adds around it is the kit's own, not a
second element to configure. Wrap the component yourself to place the
whole block.

Two attributes carry a default that a consumer can still override by
passing their own, on the bare shape:

| Attribute | Default | Override for |
|-----------|---------|--------------|
| `role` | `status` | A different live-region role, if the surrounding markup already announces the loading state. |
| `aria-label` | `Loading` (upstream's own hardcoded string) | A localized or more specific label ("Saving changes"). |

With a `label` or a `description`, those two move: the block becomes the
live region (`role="status"`) and the glyph turns decorative
(`aria-hidden`), so the announcement is the text a reader can also see
rather than a second hardcoded "Loading". A `role` (and `aria-live` /
`aria-atomic`) a consumer passes lands on the block there too, so a
labelled Spinner nested in another live region can pass `role={undefined}`
or `role="presentation"` to opt out of a duplicate announcement.

## Examples

```tsx
import { Spinner } from '@gears-frontx/ui-kit';

// Standalone, with its default "Loading" label
<Spinner />

// Inline next to text, with a specific label
<p style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
  <Spinner aria-label="Saving changes" />
  Saving changes...
</p>

// The composed block: label, and a second line under it
<Spinner label="Saving" description="This can take a minute" />

// Compact, for a panel that cannot give up 36px
<Spinner compact label="Loading" />
```

## Anti-patterns

- Do not use this inside `Button` — use `loading` there (see `button.md`);
  `Button`'s own spinner is a separate, simpler CSS-only implementation
  already wired to `aria-busy`.
- Do not drop the `aria-label` via an empty override (`aria-label=""`) —
  a spinner with no accessible name announces nothing to assistive tech;
  either keep the default or supply a real label.
- Do not pass both a `label` and an `aria-label` expecting the second to
  win - with a label the glyph is decorative and the visible text is the
  announcement, which is the point of composing the block at all.
