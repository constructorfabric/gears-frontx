# BadgeBackup

> **Backup component.** This is the kit's pre-port Badge, kept under the
> `-backup` name because its API diverged from upstream shadcn/ui. The
> canonical [`Badge`](badge.md) is now a faithful port of the shadcn base
> badge (variants `default|secondary|destructive|outline|ghost|link`). Reach
> for `Badge` in new code; `BadgeBackup` exists so the semantic-intent
> variant set and the dot/icon slots stay available and reviewable.

A status label: an intent-colored caption with an optional status dot or
icon, as a soft pill or a bare label. BadgeBackup has no Base UI primitive —
it's a styled `span`, plus a `render` prop (via Base UI's
`useRender`/`mergeProps` utilities) for the one case that needs it: rendering
as a link.

BadgeBackup speaks **semantic intent only** (per the Studio design): you say
what kind of state you're marking (`success`, `warning`, `info`, `danger`,
`muted`), never how to paint it. The prop is the kit-wide `variant` — like
every other component — but its values are states, not paint jobs: there is
no `primary`/`outline`/`ghost` here, and picking `warning` because you want
orange is a misuse, not a style choice.

## When to use

- A status attached to an entity in a list, table cell, or page header:
  `running` → `success`, `failed` → `danger`, `pending` → `warning`,
  `beta`/`new` → `info`, anything neutral (`draft`, `archived`, a count,
  a category) → `muted`.
- `shape="pill"` (default) on busy surfaces where the label needs its own
  soft fill; `shape="plain"` inline with text or in dense tables where a
  fill would be noise. Add `dot` when the state deserves a colored marker,
  or pass `icon` for a more specific one — neither renders by default.
- A clickable status filter — pass `render={<a href="..." />}`. The pill's
  fill deepens on hover and the plain shape underlines, but only when actually
  rendered as a link; a plain badge stays visually inert and never looks
  clickable when it isn't. The kit's focus ring appears automatically once
  the anchor receives keyboard focus. Give it discernible text — a badge
  with no accessible name is unusable via keyboard or screen reader.

## When not to use

- A clickable action with its own visual weight — use `button`.
- Long or wrapping text — BadgeBackup is single-line (`white-space: nowrap`) and
  clips overflow.
- Prose-colored emphasis or arbitrary brand colors — intents are the whole
  vocabulary; recoloring a badge via CSS breaks the semantic contract.

## Props (kit level)

| Prop | Type | Default |
|------|------|---------|
| `variant` | `success` \| `warning` \| `info` \| `danger` \| `muted` | `muted` |
| `shape` | `pill` \| `plain` | `pill` |
| `dot` | `boolean` — show the status dot in the variant's accent color; ignored when `icon` is set | `false` |
| `icon` | `ReactNode` — leading icon, decorative (`aria-hidden`), 12px, accent-colored; replaces the dot | — |
| `render` | `ReactElement` — replaces the root `span`, e.g. with an `<a>` | — |
| `className` | `string` — merged after the variant/shape classes | — |

All other props are native `<span>` props (or the target element's props
when using `render`) and are forwarded as-is, including `aria-invalid`
(shows a destructive-tinted border and ring, independent of `variant`).

## Examples

```tsx
import { BadgeBackup } from '@gears-frontx/ui-kit';

// Status labels (pill is the default shape)
<BadgeBackup variant="success">Running</BadgeBackup>
<BadgeBackup variant="danger">Failed</BadgeBackup>
<BadgeBackup variant="warning">Degraded</BadgeBackup>
<BadgeBackup variant="info">Beta</BadgeBackup>
<BadgeBackup>Draft</BadgeBackup>  // muted is the default variant

// Status dot is opt-in
<BadgeBackup variant="success" dot>Running</BadgeBackup>

// Bare label for dense/inline placements (dot optional there too)
<BadgeBackup variant="success" shape="plain" dot>Online</BadgeBackup>

// A custom marker instead of the dot
<BadgeBackup variant="info" icon={<BetaIcon />}>Beta</BadgeBackup>

// A badge that is actually a link — hover feedback only applies here
<BadgeBackup variant="info" render={<a href="/filters/open" />}>
  3 open
</BadgeBackup>
```

## Anti-patterns

- Do not pick a variant for its color ("warning looks nice and orange") —
  intents are semantics; if no state maps, use `muted`.
- Do not recolor a badge via `className`/`style` — the intent palette and
  its contrast math live in the kit; brand changes belong in theme tokens.
- Do not expect hover feedback from a plain (non-`render`) badge — it only
  appears when the badge actually renders as a link via `render`.
- Do not nest interactive controls inside a BadgeBackup — it is a label, not a
  container.
- Do not pass both `icon` and `dot` expecting both to render — `icon`
  replaces the dot by design.
- Do not drop an icon into BadgeBackup's children (`<BadgeBackup><Icon />label</BadgeBackup>`)
  — the kit no longer sizes a bare svg child; use the `icon` prop, which is
  sized and accent-colored automatically.
