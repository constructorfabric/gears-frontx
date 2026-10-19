# Button

An action button. Wraps the Base UI Button primitive: render-prop
polymorphism, correct disabled/focus behavior, `type="button"` by default
(pass `type="submit"` explicitly for form submission).

## When to use

- Any click-triggered action: submit, delete, open a dialog, toggle a panel.
- An action that also navigates (e.g. "Open reports"):
  `<Button render={<a href="..." />} nativeButton={false}>`. It is announced
  as a button (`role="button"`), while the real anchor underneath keeps
  cmd-click/middle-click and crawlability. Not a substitute for a link: for
  plain navigation use the consumer app's link component.

## When not to use

- Plain in-text navigation: use `Link` (it takes the app's router link
  through `render`), not `variant="link"`; that variant exists for actions
  that visually read as links, and it carries a control's height and
  padding into the line.
- Navigation that looks like a button (a "Get started" link, a call to
  action): use the consumer app's link component with
  `buttonVariants({ variant, size })` as its class, so the element keeps
  the link role. `render={<a />}` on `Button` keeps the button role, so a
  screen reader announces the link as a button.
- Toggling on/off state — use `switch` or `checkbox` instead.

## Props (kit level)

| Prop | Type | Default |
|------|------|---------|
| `variant` | `default` \| `destructive` \| `outline` \| `secondary` \| `ghost` \| `link` \| `navigation` \| `avatar` \| `utility` - `destructive` is a tint of `--destructive` under a `--destructive` label; `navigation` is a card-filled row with a hairline whose current location is marked by a `data-current` attribute; `avatar` has no box of its own and wears a `--primary` ring while hovered or while it owns an open popup; `utility` is a borderless action with an 18px glyph | `default` |
| `size` | `default` \| `sm` \| `lg` (the F-mockups' md/sm/lg scale; `default` is md) | `default` |
| `icon` | `ReactNode` — leading icon slot, marked decorative (`aria-hidden`); the ONLY right place for a button icon | — |
| `end` | `ReactNode` — trailing slot after the label (a chevron, a sort arrow), same sizing, spacing and `loading` handling as `icon`, but not marked decorative: its content is part of the accessible name, so a count is announced, and a glyph hides itself with `aria-hidden` (lucide icons carry it by default) | — |
| `loading` | `boolean` — centered spinner, disables the button, sets `aria-busy`; content keeps its space and the button keeps its accessible name | `false` |
| `render` | `ReactElement` — replaces the root element, button semantics are applied to it | — |
| `nativeButton` | `boolean` — set to `false` whenever `render` is not a native `<button>` | `true` |
| `focusableWhenDisabled` | `boolean` — keep the button in tab order when disabled | `false` |
| `className` | `string` — merged after variant classes | — |

All other props are native `<button>` props (`onClick`, `disabled`, `type`,
`aria-*`, ...) and are forwarded as-is, including `data-current`, which the
`navigation` variant reads for its current-location state.

## Custom colors

Variant colors are consumed through CSS custom properties, so a one-off
brand/status button is a consumer class away — no new variant needed:

| Property | Drives |
|----------|--------|
| `--button-bg` / `--button-fg` | fill / text at rest |
| `--button-bg-hover` / `--button-fg-hover` | fill / text on hover |
| `--button-border` | border color on every variant (transparent by default outside `outline`) |

```css
.buy { --button-bg: var(--success); --button-bg-hover: color-mix(in oklab, var(--success) 90%, var(--foreground) 10%); --button-fg: var(--primary-foreground); }
```

```tsx
<Button className={styles.buy}>Buy now</Button>
```

Setting only `--button-bg` keeps the button that color in EVERY state
(hover falls back to your rest color, never back to the variant's token);
add `--button-bg-hover` to restore hover feedback. Contrast is yours to
keep once you override: check your pairs against WCAG like the kit does
for its own variants, and give the focus ring the same care via
`--button-focus-ring` (see Anti-patterns) — it is drawn outside the button
as an `outline`, so only one tone is needed; it only ever borders the page
background, never your custom fill.

These properties are inherited custom properties and `.button` never resets
them, so where you set them matters: on the button's own class (`.buy`
above) it recolors that one button; on a container it themes every Button
underneath, including ones you didn't mean to touch — a clear button
sitting in an Input's `end` slot inside that container, for instance. Use
container-level scoping deliberately, or scope to the button itself to
avoid the surprise.

Icon-only is derived, not a size: `icon` with no children and no `end`
renders a square button of the current `size`. There is no `size="icon"`.

`end` is the same slot on the other side of the label, for what follows it:
a chevron on a button that opens a menu, an arrow that shows a sort
direction, a count. Unlike `icon` it is not marked decorative: its content
joins the accessible name, so a count (`<Button end={3}>Filters</Button>`)
is read out with the label. A glyph is hidden from assistive tech by its
own `aria-hidden="true"`, which lucide icons carry by default; pass it
yourself on a hand-written svg. It holds no control of its own (a button
inside a button is invalid HTML); a clear button next to a text field is
Input's `end`, not this one.

`loading` keeps the button focusable instead of setting the native
`disabled` attribute (so `aria-busy` has somewhere to be announced to,
rather than blurring on a button the user just clicked) — clicks are still
suppressed, but only at the layer React's own `onClick` sits on. A raw DOM
listener attached via `ref`/`addEventListener` is not suppressed the same
way and WILL still fire while `loading` is true; wire button activation
through `onClick`, not a manual listener, if you need it to respect
`loading`.

## Examples

```tsx
import { Button, buttonVariants } from '@gears-frontx/ui-kit';

// Primary action
<Button onClick={save}>Save</Button>

// Dangerous action
<Button variant="destructive" onClick={remove}>Delete</Button>

// Secondary action next to a primary one
<Button variant="outline" onClick={cancel}>Cancel</Button>

// Icon next to the label goes in the icon slot, never in children
<Button icon={<PlusIcon />} onClick={create}>New project</Button>

// A trailing glyph after the label goes in the end slot
<Button variant="outline" end={<ChevronDownIcon />}>Sort by</Button>

// Icon-only (icon slot + no children): always label it
<Button icon={<CrossIcon />} aria-label="Close" />

// Async action: loading disables and spins, width does not jump
<Button loading={saving} onClick={save}>Save</Button>

// Button-semantic action over a real anchor (announced as a button,
// cmd-clickable) — not for plain navigation
<Button render={<a href="/reports" />} nativeButton={false} variant="outline">
  Open reports
</Button>

// Navigation drawn as a button: the app's link component (here a plain
// anchor) wears the button classes and keeps the link role
<a href="/docs" className={buttonVariants({ size: 'lg' })}>
  Get started
</a>

// Form submit (explicit type)
<Button type="submit">Create account</Button>
```

## Anti-patterns

- Do not restyle via inline `style` or ad-hoc CSS rules against the kit's
  classes — kit-wide brand changes belong in the theme tokens (`theme.css`
  CSS variables), one-off button colors in the `--button-*` properties
  above. If you rebrand the focus ring specifically via
  `--button-focus-ring`, check your color against WCAG 1.4.11's 3:1 floor
  on `--background` — the only surface the ring touches, since it is drawn
  outside the button as an `outline` rather than on its edge.
- Do not put an icon in `children` next to text — it lands in the `icon`
  slot, which is what sizes it, spaces it, hides it during `loading`, and
  keeps it out of the accessible name.
- Do not put a trailing chevron in `children` — it lands in the `end` slot,
  which sizes and spaces it and hides it during `loading`. A hand-written svg
  in `end` needs its own `aria-hidden="true"`: the slot does not mark it
  decorative, because a count in `end` is meant to be announced.
- Do not render a button with an icon slot and no children without
  `aria-label` — the icon is decorative and carries no name, and `end` only
  names the button if it holds text that is announced (a glyph is
  `aria-hidden`). It is squared icon-only only when `end` is absent too.
- Do not emulate `loading` by swapping children for a spinner — the button
  loses its accessible name and jumps in width; pass `loading`.
- Do not emulate disabled with CSS/`onClick` guards — pass `disabled`
  (add `focusableWhenDisabled` if it must stay discoverable by keyboard).
