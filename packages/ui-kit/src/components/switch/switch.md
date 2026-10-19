# Switch

An on/off toggle with immediate effect. Wraps the Base UI Switch primitive
(Root + Thumb): renders a `span` with `role="switch"` and a hidden native
input for forms, state via `data-checked`/`data-unchecked`.

## When to use

- Settings that apply the moment they change: enable notifications, dark
  mode, feature flags.

## When not to use

- Options that only apply on form submit — use `checkbox`.
- Mutually exclusive choices — use `radio-group`.

## Props (kit level)

| Prop | Type | Default |
|------|------|---------|
| `checked` / `defaultChecked` | controlled / uncontrolled state | `false` |
| `onCheckedChange` | `(checked: boolean, eventDetails) => void` | — |
| `size` | `default` \| `sm` | `default` |
| `name` / `value` | form submission via the hidden native input | — |
| `className` | `string` — merged after the kit class | — |

Other props follow Base UI Switch.Root (`disabled`, `readOnly`, ...).
`aria-invalid` switches the border and ring to the destructive color.

## Examples

```tsx
import { Label, Switch } from '@gears-frontx/ui-kit';

// Labelled toggle: nesting gives one click target, and aria-labelledby
// names the switch (a wrapping label does not name its role="switch" span)
<Label>
  <Switch checked={notify} onCheckedChange={setNotify} aria-labelledby="notify-label" />
  <span id="notify-label">Email notifications</span>
</Label>

// Compact rows
<Switch size="sm" defaultChecked aria-label="Enable rule" />

// Disabled
<Switch disabled aria-label="Locked setting" />
```

## Anti-patterns

- Do not use a switch when the change needs a confirm/submit step — that is
  `checkbox` semantics.
- Do not render one without a visible label or `aria-label`.
- Do not rely on a wrapping `Label` alone for the name: the switch is a
  `span` with `role="switch"`, which a wrapping label does not name (axe
  `aria-toggle-field-name`). Point `aria-labelledby` at the label text, or
  pass `aria-label`.
