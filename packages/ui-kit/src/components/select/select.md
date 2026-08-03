# Select

A dropdown for picking one value from a list. Wraps the Base UI Select
primitives; the popup is portalled, keyboard navigation, typeahead, and
form submission (hidden native input on the root) come from Base UI.

Composition: `Select` (root, holds the value) → `SelectTrigger` (+
`SelectValue` for the current label) → `SelectContent` → `SelectGroup` /
`SelectLabel` / `SelectItem` / `SelectSeparator`.

## When to use

- Picking one option from ~7 or more, or when space is tight.
- Option lists with groups and separators.

## When not to use

- 2–6 always-visible options — use `radio-group`.
- Multi-select or search over options — out of MVP scope; compose from
  primitives in the consumer app.

## Props (kit level)

`Select` (root): `value` / `defaultValue`, `onValueChange`, `name`,
`disabled`, `required` — see Base UI Select.Root. Always pass `items`
(`{ value, label }[]`) as well: without it the closed trigger renders the
raw value instead of the label until the popup has been opened once.

`SelectTrigger`:

| Prop | Type | Default |
|------|------|---------|
| `size` | `default` \| `sm` | `default` |
| `className` | `string` — merged after the kit class | — |

`SelectValue`: renders the selected item's label; pass `placeholder` via
the root's `items`/children contract (see example). `SelectContent`
accepts positioning props (`side`, `sideOffset`, `align`, `alignOffset`,
`alignItemWithTrigger`) and `container` — the popup portals to `<body>`
by default, so if your theme lives on a subtree (`data-theme` on a
section instead of `<html>`), pass that section as `container` or the
popup renders with the root theme. `SelectItem` takes `value` (required) and
`disabled`. `aria-invalid` on the trigger switches its border and ring to
the destructive color.

## Examples

```tsx
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@gears-frontx/ui-kit';

const REGIONS = [
  { value: 'eu-central', label: 'Frankfurt' },
  { value: 'eu-west', label: 'Dublin' },
  { value: 'us-east', label: 'Virginia' },
  { value: 'us-west', label: 'Oregon (soon)' },
];

<Select value={region} onValueChange={setRegion} items={REGIONS}>
  <SelectTrigger aria-label="Region">
    <SelectValue placeholder="Pick a region" />
  </SelectTrigger>
  <SelectContent>
    <SelectGroup>
      <SelectLabel>Europe</SelectLabel>
      <SelectItem value="eu-central">Frankfurt</SelectItem>
      <SelectItem value="eu-west">Dublin</SelectItem>
    </SelectGroup>
    <SelectSeparator />
    <SelectGroup>
      <SelectLabel>Americas</SelectLabel>
      <SelectItem value="us-east">Virginia</SelectItem>
      <SelectItem value="us-west" disabled>
        Oregon (soon)
      </SelectItem>
    </SelectGroup>
  </SelectContent>
</Select>
```

## Anti-patterns

- Do not put items directly under `SelectContent` without a `SelectGroup`
  — the group carries the list padding.
- Do not use a select for navigation — that is a menu/link pattern.
- Do not omit a placeholder or default value — an empty trigger gives the
  user (and the agent) nothing to read.
