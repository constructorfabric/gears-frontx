# NativeSelect

A real `<select>`, styled to match the kit's field chrome. No Base UI
primitive backs it (there is no Base UI NativeSelect) — this is pure
styling translation over native markup, the same shape as `Table`.

## When to use

- A choice list where the platform's own native picker (OS-drawn options,
  keyboard-typeahead, mobile wheel picker) is preferable to a custom popup —
  long lists, forms optimized for mobile, or anywhere `Select`'s Base UI
  popup would be overkill.
- Progressive-enhancement contexts (no-JS forms, SSR fallbacks) where a
  real `<select>` must keep working without a popup primitive.

## When not to use

- Custom item content (icons, descriptions, groups with rich styling) —
  `<option>` cannot render arbitrary markup; use `Select` instead.

## Props (kit level)

| Prop | Type | Default |
|------|------|---------|
| `size` | `default` \| `sm` | `default` |
| `className` | `string` — merged onto the wrapper | — |

All other props are native `<select>` props (`value`, `onChange`,
`disabled`, `aria-*`, ...) and are forwarded to the `<select>` itself.

`NativeSelectOption` and `NativeSelectOptGroup` are thin styled wrappers
around `<option>`/`<optgroup>` — forward every native prop unchanged.

## Examples

```tsx
import { NativeSelect, NativeSelectOptGroup, NativeSelectOption } from '@gears-frontx/ui-kit';

<NativeSelect aria-label="Region" defaultValue="eu">
  <NativeSelectOption value="eu">Europe</NativeSelectOption>
  <NativeSelectOption value="us">Americas</NativeSelectOption>
</NativeSelect>

// Grouped options
<NativeSelect aria-label="Timezone">
  <NativeSelectOptGroup label="Europe">
    <NativeSelectOption value="cet">Central European Time</NativeSelectOption>
  </NativeSelectOptGroup>
</NativeSelect>

// Compact size, disabled
<NativeSelect size="sm" disabled aria-label="Region">
  <NativeSelectOption value="eu">Europe</NativeSelectOption>
</NativeSelect>
```

## Anti-patterns

- Do not reach for this when item content needs more than plain text —
  `Select` is the composable, richly-stylable alternative.
- Do not restyle `<option>`/`<optgroup>` fill/text via the kit's own theme
  tokens — most engines render native popup chrome with OS colors
  regardless of author CSS, which is why this component uses the
  `Canvas`/`CanvasText` system keywords instead (see native-select.module.css).
