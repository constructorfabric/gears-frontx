# RadioGroup

A set of mutually exclusive options. Wraps the Base UI RadioGroup/Radio
primitives: `role="radiogroup"` container, `role="radio"` items with a
hidden native input, arrow-key navigation between items, state via
`data-checked`/`data-unchecked`.

## When to use

- Choosing exactly one of 2–6 visible options: plan tier, delivery method,
  sort order.

## When not to use

- More than ~6 options or constrained space — use `select`.
- Independent on/off options — use `checkbox`.
- Instant toggles — use `switch`.

## Props (kit level)

`RadioGroup`:

| Prop | Type | Default |
|------|------|---------|
| `value` / `defaultValue` | controlled / uncontrolled selected value | — |
| `onValueChange` | `(value, eventDetails) => void` | — |
| `name` | form submission via the hidden native input | — |
| `disabled` | disables the whole group | `false` |
| `className` | `string` — merged after the kit class | — |

`RadioGroupItem`: `value` (required), `disabled`, `className`; other props
follow Base UI Radio.Root. `aria-invalid` on an item switches its border
and ring to the destructive color.

## Examples

```tsx
import { Label, RadioGroup, RadioGroupItem } from '@gears-frontx/ui-kit';

<RadioGroup value={tier} onValueChange={setTier} aria-label="Plan tier">
  <Label>
    <RadioGroupItem value="free" /> Free
  </Label>
  <Label>
    <RadioGroupItem value="pro" /> Pro
  </Label>
  <Label>
    <RadioGroupItem value="enterprise" disabled /> Enterprise (contact us)
  </Label>
</RadioGroup>
```

## Anti-patterns

- Do not use radio items outside a `RadioGroup` — keyboard navigation and
  the single-selection contract live on the group.
- Do not preselect nothing when a default makes sense — an all-unchecked
  radio group is hard to keyboard-focus predictably.
- Do not use it for yes/no — a single `checkbox` or `switch` reads better.
