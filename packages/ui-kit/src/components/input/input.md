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
| `className` | `string` — merged after the kit class | — |

All other props are native `<input>` props (`type`, `placeholder`,
`disabled`, `required`, `aria-invalid`, ...) and are forwarded as-is.
`aria-invalid` switches the border and ring to the destructive color.

## Examples

```tsx
import { Input } from '@gears-frontx/ui-kit';

// Uncontrolled with placeholder
<Input placeholder="Search projects…" />

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
