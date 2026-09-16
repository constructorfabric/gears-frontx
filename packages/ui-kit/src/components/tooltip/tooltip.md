# Tooltip

A visual-only hint that appears when its trigger is hovered or focused.
Wraps the Base UI Tooltip primitives; the popup is portalled, and
open/close timing, hover/focus interaction, and Escape/outside-press
dismissal come from Base UI. Base UI disables tooltips on touch devices
entirely (no reliable touch affordance exists) and does **not** wire an
ARIA `role`/`aria-describedby` link from the trigger to the popup — its
own docs are explicit that a tooltip is a supplementary visual label,
not an accessible description. Give the trigger an accessible name
(`aria-label`, or visible text) that **closely matches the tooltip's
content** — Base UI's own guidance warns that a mismatched label leaves
screen-reader users with a different message than sighted users get from
the tooltip, not a consistent one.

Composition: `Tooltip` (root, holds open state) → `TooltipTrigger` →
`TooltipContent` (portals a caret plus your content). Optionally wrap a
subtree in `TooltipProvider` to share delay/grouping across many
tooltips.

## When to use

- A short, supplementary label for an icon-only control or truncated
  text — information a sighted mouse/keyboard user can miss without
  losing access to the feature.

## When not to use

- Content essential to using the page — inline text or `dialog` is
  reachable by touch and screen-reader users; a tooltip is not.
- An info icon whose only job is to reveal more text — Base UI's own
  guidance is to use a `Popover` with `openOnHover` instead (not in the
  kit's MVP scope), since a tooltip's trigger must have a purpose of its
  own besides opening the popup.
- A menu of actions anchored to a trigger — use `dropdown-menu`.

## Props (kit level)

`Tooltip` (root): `open` / `defaultOpen`, `onOpenChange`, `disabled`,
`trackCursorAxis`, `handle` (for a trigger placed outside the root, see
Base UI's detached-trigger pattern) — see Base UI Tooltip.Root.

`TooltipTrigger`: `delay` (ms before opening on hover, Base UI default
`600`), `closeDelay` (ms before closing, default `0`), `disabled`
(suppresses the tooltip only — it does not add the native `disabled`
attribute to the underlying `<button>`, which stays clickable and
focusable), `closeOnClick` (`true` default). Renders a native `<button>`.

`delay` is measured as hover intent — the timer runs from pointer
movement over the trigger, not from entry, so sweeping the cursor across
a toolbar without pausing won't open any of its tooltips. (In tests,
dispatch a `mousemove` after `mouseenter` to arm it — a bare `mouseenter`
alone never starts the timer for a non-zero delay.)

`TooltipContent`:

| Prop | Type | Default |
|------|------|---------|
| `side` | `top` \| `bottom` \| `left` \| `right` \| `inline-start` \| `inline-end` | `top` |
| `align` | `start` \| `center` \| `end` | `center` |
| `sideOffset` / `alignOffset` | `number` | `4` / `0` |
| `container` | DOM node to portal the popup into | `<body>` |
| `positionMethod` | `absolute` \| `fixed` — pass `fixed` when the trigger sits inside a `transform`/`filter` container, where absolute positioning resolves against the wrong box | `absolute` |
| `collisionBoundary` / `collisionPadding` | see Base UI Tooltip.Positioner — bound and pad the flip/shift collision logic | viewport / `5` |
| `className` | `string` — merged after the kit class | — |

The popup portals to `<body>` by default, so if your theme lives on a
subtree (`data-theme` on a section instead of `<html>`), pass that
section as `container` or the popup renders with the root theme — same
contract as `Dialog`, `Select`, and `DropdownMenu`.

`TooltipContent` always renders a small caret against the popup edge
(Base UI's `Tooltip.Arrow`) — there's no prop to hide it, matching the
source this component is translated from.

### TooltipProvider (optional)

Mount `TooltipProvider` once around a group of tooltips (e.g. a toolbar)
to share open/close delay and grouping: once one tooltip in the group
opens, adjacent ones open instantly while hovering within `timeout`
(default `400`ms) of each other. It renders no DOM element itself.

Inside a provider, `delay` is the drawn `0`: the first tooltip opens on
hover with no wait, and the rest of the group follows it. Outside one,
Base UI's per-trigger default (`600`ms) applies. Pass `delay` explicitly
on `TooltipProvider` (or on individual `TooltipTrigger`s) to slow it back
down.

A lone `Tooltip` works standalone without a `TooltipProvider` — grouping
is the only thing wrapping one adds.

## Examples

```tsx
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@gears-frontx/ui-kit';

<Tooltip>
  <TooltipTrigger>Add to favorites</TooltipTrigger>
  <TooltipContent>Add to favorites</TooltipContent>
</Tooltip>;

// A toolbar of icon-only buttons (replace the text with your own icons):
// instant, grouped tooltips once the first one in the group has opened.
<TooltipProvider>
  <Tooltip>
    <TooltipTrigger aria-label="Bold">B</TooltipTrigger>
    <TooltipContent>Bold</TooltipContent>
  </Tooltip>
  <Tooltip>
    <TooltipTrigger aria-label="Italic">I</TooltipTrigger>
    <TooltipContent>Italic</TooltipContent>
  </Tooltip>
</TooltipProvider>;
```

## Anti-patterns

- Do not put content in a tooltip that a touch or screen-reader user
  needs to complete the task — they cannot reach it. Repeat critical
  information inline or use `dialog`/a visible label instead.
- Do not rely on the tooltip to name the trigger for assistive
  technology — give the trigger its own `aria-label` (or visible text).
- Do not wrap a single, standalone tooltip in `TooltipProvider` expecting
  a behavior change — grouping only matters with more than one tooltip
  sharing a provider.
