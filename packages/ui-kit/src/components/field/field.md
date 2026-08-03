# Field

A labelled form field. Wraps the Base UI Field primitives: `Field` (root)
associates its `FieldLabel`, `FieldDescription`, `FieldError`, and the
control inside it automatically — ids, `htmlFor`, and `aria-describedby`
are wired for you, and validation state flows to every part via
`data-invalid`/`data-disabled`.

Kit controls (`Input`, `Textarea`, and Base UI-based controls like
`Checkbox`, `Switch`, `RadioGroup`, `Select`) register themselves with the
surrounding Field — no extra props needed.

## When to use

- Every labelled control in a form. This is the default way to compose
  forms from the kit.

## When not to use

- Purely decorative text next to a control that is not its label or
  description.

## Props (kit level)

`Field` (root):

| Prop | Type | Default |
|------|------|---------|
| `name` | field name, also used by form-level validation | — |
| `disabled` | disables the control and dims the label | `false` |
| `invalid` | force the invalid state (external validation libraries) | — |
| `validate` | custom validation: `(value) => string \| string[] \| null` | — |
| `className` | `string` — merged after the kit class | — |

`FieldError` accepts `match`: `true` to always show (external validation),
or a native `ValidityState` key (`"valueMissing"`, `"typeMismatch"`, ...)
to show only for that failure. Without `match` it shows whenever the field
is invalid.

## Examples

```tsx
import { Field, FieldDescription, FieldError, FieldLabel, Input } from '@gears-frontx/ui-kit';

// Label + description + native validation
<Field name="email">
  <FieldLabel>Email</FieldLabel>
  <Input type="email" required placeholder="you@company.com" />
  <FieldDescription>We only use it for the invoice.</FieldDescription>
  <FieldError match="valueMissing">Email is required.</FieldError>
  <FieldError match="typeMismatch">That does not look like an email.</FieldError>
</Field>

// External validation (e.g. server errors)
<Field name="slug" invalid={Boolean(serverError)}>
  <FieldLabel>Slug</FieldLabel>
  <Input value={slug} onValueChange={setSlug} />
  <FieldError match={true}>{serverError}</FieldError>
</Field>
```

## Anti-patterns

- Do not wire `htmlFor`/`id`/`aria-describedby` by hand inside a Field —
  the point of the composition is that it does this for you.
- Do not put two controls in one Field — one field, one control.
- Do not render validation text outside `FieldError` — screen readers
  lose the association.
