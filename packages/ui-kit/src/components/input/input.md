# Input

A single-line text field. Wraps the Base UI Input primitive: a native
`<input>` that automatically wires itself to `Field` (label, description,
error, validation state) when rendered inside one.

## When to use

- Any single-line free-text value: names, emails, search queries, numbers,
  file uploads (`type="file"`).
- Inside a `Field` to get label association and validation display for
  free.

## When not to use

- Multi-line text — use `textarea`.
- Picking from a fixed set of options — use `select`, `radio-group`, or
  `checkbox`.

## Props (kit level)

| Prop | Type | Default |
|------|------|---------|
| `value` / `defaultValue` | controlled / uncontrolled value | — |
| `onValueChange` | `(value: string, eventDetails) => void` — fires on every change | — |
| `icon` | `ReactNode` — leading icon slot, decorative (`aria-hidden`, no pointer events); pair with the right native `type` for semantics | — |
| `end` | `ReactNode` — trailing slot for live content (icon-button, adornment); rendered after the input, sized for an icon or a compact `size="sm"` icon-only Button | — |
| `className` | `string` — merged after the kit class | — |

All other props are native `<input>` props (`type`, `placeholder`,
`disabled`, `required`, `aria-invalid`, ...) and are forwarded as-is.
`aria-invalid` switches the border and ring to the destructive color.

Icons are explicit: `icon` draws a leading icon inside the field (via a
presentational wrapper the component adds only when a slot is present),
`end` overlays trailing content such as a clear button. Semantics still
come from the native `type` — a search field is `type="search"` (searchbox
role) plus a magnifier passed to `icon`; nothing renders automatically.
A disabled input dims its `icon` and `end` slots too (0.42 opacity) — a
clear button left in `end` doesn't stay visually live just because it isn't
the native control. That dimming fires regardless of *why* the input is
disabled (the direct `disabled` prop or a `<Field disabled>` ancestor both
land on the real `<input>`). Removing `end`'s tab stop is a separate fix
and only covers the direct prop: passing `disabled` straight to `Input`
also sets `inert` on the `end` wrapper, which drops it from the tab order
and blocks activation — the actual fix for a keyboard user, since dimming
alone (`pointer-events: none`) only disarms the mouse. A field disabled
through `<Field disabled>`'s context still dims `end`, but Input has no way
to observe that context-driven disable from its own props, so it cannot set
`inert` for that path — an interactive `end` slot under a `Field`-disabled
input stays dim yet still tabbable and clickable via keyboard activation.
Consumers composing `end` from a `Field` should disable their own
interactive `end` content directly rather than relying on this.

## Examples

```tsx
import { Input } from '@gears-frontx/ui-kit';

// Uncontrolled with placeholder
<Input placeholder="Project name" />

// Search field: the native type brings the searchbox role, the icon slot
// brings the magnifier, and `end` can hold a clear button
<Input
  type="search"
  placeholder="Search projects…"
  icon={<MagnifierIcon />}
  end={<Button variant="ghost" size="sm" icon={<CrossIcon />} aria-label="Clear" />}
/>

// Controlled
<Input value={email} onValueChange={setEmail} type="email" />

// Invalid state (set automatically when used inside a Field with an error)
<Input aria-invalid={true} defaultValue="not-an-email" />

// Disabled
<Input disabled value="read only for now" />
```

## Anti-patterns

- Do not use `onChange` + `event.target.value` when `onValueChange` is
  enough — it hands you the string directly.
- Do not restyle via inline `style` — sizing/spacing tweaks belong to layout
  containers, colors to theme tokens.
- Do not build a labelled input by hand — the `Field` composition handles
  label/error/description wiring.
- Do not put an interactive control in `icon` — that slot is aria-hidden
  and pointer-transparent; live content goes in `end`.
