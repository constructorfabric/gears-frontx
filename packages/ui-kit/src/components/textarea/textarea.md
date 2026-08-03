# Textarea

A multi-line text field. A styled native `<textarea>` — no primitive is
needed. Grows with its content in browsers that support `field-sizing`;
elsewhere it keeps the native resize handle.

## When to use

- Multi-line free text: descriptions, comments, messages.

## When not to use

- Single-line values — use `input`.
- Rich text — out of the kit's scope; bring an editor and style it with
  theme tokens.

## Props (kit level)

| Prop | Type | Default |
|------|------|---------|
| `className` | `string` — merged after the kit class | — |

All other props are native `<textarea>` props (`value`, `onChange`,
`placeholder`, `disabled`, `rows`, `aria-invalid`, ...) and are forwarded
as-is. `aria-invalid` switches the border and ring to the destructive color.

## Examples

```tsx
import { Textarea } from '@gears-frontx/ui-kit';

// Uncontrolled
<Textarea placeholder="Describe the issue…" />

// Controlled
<Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />

// Fixed starting height via rows
<Textarea rows={6} defaultValue={draft} />

// Invalid state
<Textarea aria-invalid={true} defaultValue={tooLong} />
```

## Anti-patterns

- Do not fix the height with inline styles — pass `rows` or set a
  `max-height` in the consumer layout; the field sizes itself to content.
- Do not use it for single-line values just to get a bigger hit target —
  use `input`; sizing belongs to layout.
