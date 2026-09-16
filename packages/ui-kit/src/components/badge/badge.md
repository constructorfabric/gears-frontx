# Badge

A compact inline label — a faithful port of [shadcn/ui's base
Badge](https://ui.shadcn.com/docs/components/base/badge). Badge has no
Base UI primitive — it's a styled `span`, plus a `render` prop (via Base
UI's `useRender`/`mergeProps` utilities) for the one case that needs it:
rendering as a link.

Badge has two axes and one flag. `variant` is **paint only**, `size` is
**geometry only** (18 or 20 px tall), and `dot` adds the drawn 6px status
dot ahead of the label, in whatever tone the variant already paints the
label.

The `variant` axis carries two groups on one axis:

- **Upstream paint** — `default`, `secondary`, `destructive`, `outline`,
  `ghost`, `link`: the same six names and the same meaning as
  [Button](button.md)'s. `destructive` is a tint of `--destructive` under
  a `--destructive` label, the identical recipe Button carries.
- **Category** - `category`: a 1px ring and label in `--primary` over a
  tint of the same blue, the drawn chip for a category tag.
- **Tone** — `success`, `warning`, `danger`, `info`, `accent`: a soft
  tinted fill with the tone's own color as the label, matching the Studio
  design's Badge row. Its sixth specimen, Neutral, is `secondary` — that
  variant already paints the drawn pair exactly, so there is no separate
  `neutral` name.

Note that `destructive` and `danger` are both present on purpose: a tint
of `--destructive` under a `--destructive` label, and a `--danger-soft`
fill under a `--danger` label. Two names for one red, one per role.

A tone is still paint, not state: it colors a label, it does not track
one. Badge's five tones (`success`, `warning`, `danger`, `info`, `accent`)
are the semantic-ish colors available — pick the one that best matches the
status, but keep the label text itself explicit; color alone is not a
substitute for a state machine.

> **Accessibility of tones.** At Badge's label size WCAG 1.4.3 asks
> 4.5:1, and on the drawn status values three pairs do not reach it: light
> `success` (3.43:1), light `warning` (2.00:1) and dark `danger` (3.63:1),
> with light `danger` at 4.28:1. The kit ships the drawn values; the
> finding belongs with the designer, and `tokens.test.ts` pins the hexes so
> a correction has to happen in the design first. Where that matters,
> `secondary`, `info` and `accent` clear the floor in both themes. Color is
> not a substitute for text either way: keep the label itself explicit.

## When to use

- A short, static inline label: a count, a category tag, a plan name, a
  version number.
- A status label that benefits from color (running/failed/pending/beta) —
  pick the tone variant (`success`/`warning`/`danger`/`info`/`accent`)
  that matches the meaning, and still spell the status out in the label
  text; a tone is paint, not a live indicator.
- A clickable tag — pass `render={<a href="..." />}`. The kit's focus
  ring appears once the anchor receives keyboard focus, and hover
  feedback (background/underline) only applies once actually rendered as
  a link. Give it discernible text — a badge with no accessible name is
  unusable via keyboard or screen reader.

## When not to use

- A clickable action with its own visual weight — use `button`.
- Long or wrapping text — Badge is single-line (`white-space: nowrap`) and
  clips overflow.

## Props (kit level)

| Prop | Type | Default |
|------|------|---------|
| `variant` | `default` \| `secondary` \| `destructive` \| `outline` \| `ghost` \| `link` \| `category` \| `success` \| `warning` \| `danger` \| `info` \| `accent` | `default` |
| `size` | `xs` \| `default` - 18 or 20 px tall; `xs` holds a count and keeps a 20 px minimum width (10/14 label), `default` is the drawn box (12/16 label) | `default` |
| `dot` | `boolean` - renders a 6px round status dot ahead of the label, in the label's own tone | `false` |
| `render` | `ReactElement` — replaces the root `span`, e.g. with an `<a>` | — |
| `className` | `string` — merged after the variant class | — |

All other props are native `<span>` props (or the target element's props
when using `render`) and are forwarded as-is, including `aria-invalid`
(shows a destructive-tinted ring, independent of `variant`).

The ring, the invalid state and `outline`'s hairline are all drawn as inset
shadows rather than borders, so none of them changes the badge's height.

`xs` carries geometry only, like every other `size` value. The drawn compact
count badge is the neutral paint at that size, which is
`<Badge size="xs" variant="secondary">`.

`badgeVariants` (the underlying `cva` recipe) is also exported, for a
consumer that needs the class string without the component — e.g. styling
a link that must stay a real `<a>` outside of `render`.

## Examples

```tsx
import { Badge } from '@gears-frontx/ui-kit';

// Upstream paint
<Badge>default</Badge>
<Badge variant="secondary">secondary</Badge>
<Badge variant="destructive">destructive</Badge>
<Badge variant="outline">outline</Badge>
<Badge variant="ghost">ghost</Badge>
<Badge variant="link">link</Badge>

// Tone — soft fill, tone-colored label ("secondary" is this row's Neutral)
<Badge variant="success">success</Badge>
<Badge variant="warning">warning</Badge>
<Badge variant="danger">danger</Badge>
<Badge variant="info">info</Badge>
<Badge variant="accent">accent</Badge>

// Category chip
<Badge variant="category">Infrastructure</Badge>

// Size - geometry only, any variant
<Badge size="xs" variant="secondary">9</Badge>
<Badge size="default">20px</Badge>

// The drawn status dot, in the variant's own label tone
<Badge dot variant="success">Running</Badge>

// A badge that is actually a link — hover feedback only applies here
<Badge variant="outline" render={<a href="/plans/pro" />}>
  Pro plan
</Badge>
```

## Anti-patterns

- Do not let a tone carry meaning on its own — a tone paints, it does not
  announce. Always spell out the meaning in the label text itself.
- Do not nest interactive controls inside a Badge — it is a label, not a
  container.
- Do not expect hover feedback from a plain (non-`render`) badge — it only
  appears when the badge actually renders as a link via `render`.
