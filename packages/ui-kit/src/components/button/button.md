# Button

An action button. Wraps the Base UI Button primitive: render-prop
polymorphism, correct disabled/focus behavior, `type="button"` by default
(pass `type="submit"` explicitly for form submission).

## When to use

- Any click-triggered action: submit, delete, open a dialog, toggle a panel.
- Navigation styled as a button: `<Button render={<a href="..." />}>` so the
  element is a real link (crawlable, cmd-clickable).

## When not to use

- Plain in-text navigation — use the consumer app's link component, not
  `variant="link"`; that variant exists for actions that visually read as
  links.
- Toggling on/off state — use `switch` or `checkbox` (planned) instead.

## Props (kit level)

| Prop | Type | Default |
|------|------|---------|
| `variant` | `default` \| `destructive` \| `outline` \| `secondary` \| `ghost` \| `link` | `default` |
| `size` | `default` \| `sm` \| `lg` \| `icon` | `default` |
| `render` | `ReactElement` — replaces the root element, button semantics are applied to it | — |
| `focusableWhenDisabled` | `boolean` — keep the button in tab order when disabled | `false` |
| `className` | `string` — merged after variant classes | — |

All other props are native `<button>` props (`onClick`, `disabled`, `type`,
`aria-*`, ...) and are forwarded as-is.

## Examples

```tsx
import { Button } from '@gears-frontx/ui-kit';

// Primary action
<Button onClick={save}>Save</Button>

// Dangerous action
<Button variant="destructive" onClick={remove}>Delete</Button>

// Secondary action next to a primary one
<Button variant="outline" onClick={cancel}>Cancel</Button>

// Icon-only: always label it
<Button size="icon" aria-label="Close">✕</Button>

// Real link that looks like a button
<Button render={<a href="/reports" />} variant="outline">Open reports</Button>

// Form submit (explicit type)
<Button type="submit">Create account</Button>
```

## Anti-patterns

- Do not restyle via inline `style` or ad-hoc CSS — brand changes belong in
  the theme tokens (`theme.css` CSS variables).
- Do not use `size="icon"` without `aria-label`.
- Do not emulate disabled with CSS/`onClick` guards — pass `disabled`
  (add `focusableWhenDisabled` if it must stay discoverable by keyboard).
