# FieldBackup

> **Backup component.** This is the kit's pre-port Field, kept under the
> `-backup` name because its shape diverged from upstream shadcn/ui: it is a
> 4-part wrapper over the Base UI Field primitive, where the upstream base
> field is a primitive-free 10-part form-layout system. The canonical
> [`Field`](field.md) is now that faithful port. Reach for `Field` in new
> code; `FieldBackup` stays available for the automatic id/`htmlFor`/
> `aria-describedby` wiring and native-validation display the Base UI
> primitive gives you for free.

A labelled form field. Wraps the Base UI Field primitives: `FieldBackup`
(root)
associates its `FieldBackupLabel`, `FieldBackupDescription`, `FieldBackupError`, and the
control inside it automatically — ids, `htmlFor`, and `aria-describedby`
are wired for you, and validation state flows to every part via
`data-invalid`/`data-disabled`.

Kit controls (`Input`, and Base UI-based controls like `Checkbox`, `Switch`,
`RadioGroup`, `Select`) register themselves with the surrounding
FieldBackup — no extra props needed. `Textarea` is a plain native
`<textarea>` passthrough (see textarea.md) and does NOT register with this
context; wire it up the same manual way the canonical `Field` requires.

## When to use

- Every labelled control in a form. This is the default way to compose
  forms from the kit.

## When not to use

- Purely decorative text next to a control that is not its label or
  description.

## Props (kit level)

`FieldBackup` (root):

| Prop | Type | Default |
|------|------|---------|
| `name` | field name, also used by form-level validation | — |
| `disabled` | disables the control and dims the label | `false` |
| `invalid` | force the invalid state (external validation libraries) | — |
| `validate` | custom validation: `(value) => string \| string[] \| null` | — |
| `className` | `string` — merged after the kit class | — |

`FieldBackupError` accepts `match`: `true` to always show (external validation),
or a native `ValidityState` key (`"valueMissing"`, `"typeMismatch"`, ...)
to show only for that failure. Without `match` it shows whenever the field
is invalid.

## Examples

```tsx
import { FieldBackup, FieldBackupDescription, FieldBackupError, FieldBackupLabel, Input } from '@gears-frontx/ui-kit';

// Label + description + native validation
<FieldBackup name="email">
  <FieldBackupLabel>Email</FieldBackupLabel>
  <Input type="email" required placeholder="you@company.com" />
  <FieldBackupDescription>We only use it for the invoice.</FieldBackupDescription>
  <FieldBackupError match="valueMissing">Email is required.</FieldBackupError>
  <FieldBackupError match="typeMismatch">That does not look like an email.</FieldBackupError>
</FieldBackup>

// External validation (e.g. server errors)
<FieldBackup name="slug" invalid={Boolean(serverError)}>
  <FieldBackupLabel>Slug</FieldBackupLabel>
  <Input value={slug} onValueChange={setSlug} />
  <FieldBackupError match={true}>{serverError}</FieldBackupError>
</FieldBackup>
```

## Anti-patterns

- Do not wire `htmlFor`/`id`/`aria-describedby` by hand inside a FieldBackup —
  the point of the composition is that it does this for you.
- Do not put two controls in one FieldBackup — one field, one control.
- Do not render validation text outside `FieldBackupError` — screen readers
  lose the association.
