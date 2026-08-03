# Checkbox

An on/off tick box. Wraps the Base UI Checkbox primitive: renders a
`role="checkbox"` button with a hidden native input for forms, toggles via
mouse and keyboard, exposes state through `data-checked`/`data-unchecked`.

## When to use

- Opting in/out of independent options (multiple can be on at once).
- Accepting terms, selecting rows, toggling settings that apply on submit.

## When not to use

- An immediate on/off with instant effect — use `switch`.
- Mutually exclusive options — use `radio-group`.

## Props (kit level)

| Prop | Type | Default |
|------|------|---------|
| `checked` / `defaultChecked` | controlled / uncontrolled state | `false` |
| `onCheckedChange` | `(checked: boolean, eventDetails) => void` | — |
| `name` / `value` | form submission via the hidden native input | — |
| `className` | `string` — merged after the kit class | — |

Other props follow Base UI Checkbox.Root (`disabled`, `required`,
`readOnly`, ...). `aria-invalid` switches the border and ring to the
destructive color. `indeterminate` renders a minus mark in an unfilled box
(`aria-checked="mixed"`) — use it for "some children selected" parents.

## Examples

```tsx
import { Checkbox, Label } from '@gears-frontx/ui-kit';

// Labelled checkbox — nesting gives one click target
<Label>
  <Checkbox name="terms" required /> I agree to the terms
</Label>

// Controlled
<Checkbox checked={selected} onCheckedChange={setSelected} />

// Disabled
<Label data-disabled="">
  <Checkbox disabled defaultChecked /> Locked option
</Label>
```

## Anti-patterns

- Do not render a checkbox without a visible label — `aria-label` alone is
  a last resort for dense tables.
- Do not use it as an instant toggle for a running process — that is
  `switch` semantics.
