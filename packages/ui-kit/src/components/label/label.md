# Label

A caption for a form control. A styled native `<label>` — associate it with
a control via `htmlFor`, or by nesting the control inside it.

## When to use

- Naming any form control: `input`, `textarea`, `select`, `checkbox`,
  `switch`, `radio-group` items.
- Inline labels next to a checkbox/switch (nest the control, get the click
  target for free).

## When not to use

- Headings or free-standing text — labels are for controls; use regular
  markup styled by the consumer app.
- Inside a form, prefer the `Field` composition — it wires the label,
  control, description, and error together automatically.

## Props (kit level)

| Prop | Type | Default |
|------|------|---------|
| `className` | `string` — merged after the kit class | — |

All other props are native `<label>` props (`htmlFor`, ...) and are
forwarded as-is. A `data-disabled` attribute dims the label (set
automatically inside a Field whose control is disabled).

## Examples

```tsx
import { Input, Label } from '@gears-frontx/ui-kit';

// Explicit association
<Label htmlFor="email">Email</Label>
<Input id="email" type="email" />

// Nested control (single click target)
<Label>
  <input type="checkbox" /> Remember me
</Label>
```

## Anti-patterns

- Do not render a label without associating it with a control — screen
  readers get nothing from an orphan label.
- Do not use placeholders instead of labels — placeholders disappear on
  input.
