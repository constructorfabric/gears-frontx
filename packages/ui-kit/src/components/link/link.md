# Link

An inline anchor that inherits font size and line height from its line, so it never changes the line box. That is the difference from `buttonVariants({ variant: 'link' })`, which carries a control's height and padding.

## When to use

- A link inside a sentence or a short line.
- The application's router link, through `render`.
- A link to another site, with `external`.

## When not to use

- An action: use `Button`.
- A whole card or a whole row that navigates: use `Card` or `Item` with `render`.
- A trail of pages: use `Breadcrumb`.

## Props (kit level)

| Prop | Type | Default |
|------|------|---------|
| `variant` | `'default' \| 'muted' \| 'inherit'` - `--link-foreground`; `--muted-foreground` turning `--link-foreground` on hover; `currentColor` | `'default'` |
| `external` | `boolean` - `target="_blank"` and `rel="noopener noreferrer"` unless passed, plus an arrow icon with `aria-hidden` | `false` |
| `render` | `ReactElement` or callback - the router's link component | `a` |
| `className` | `string` | - |

Underlined at rest, so a link inside text never relies on colour alone; keyboard focus draws an outline on `--ring` at `--border-width-focus`. `linkVariants` is exported for a router component that cannot take `render`.

An icon placed directly in the link (the external arrow or the caller's own) takes a 1em square from the link text, sits on its baseline and keeps a 0.25em gap on the text side: before a trailing icon, after a leading icon that is followed by an element (wrap the text in a `span`). The rules carry no specificity, so a caller that sizes or spaces its icons itself keeps its own values.

## Accessibility

- With `external`, the wording that the link opens a new tab stays with the caller (visible text or a `VisuallyHidden` hint).
- Inside coloured text, `inherit` keeps the colour and the underline marks the link.

## Examples

```tsx
import { Link, Text } from '@gears-frontx/ui-kit';

<Text>Read the <Link href="/docs/setup">setup guide</Link> first.</Text>
<Link render={<RouterLink to="/settings" />}>Settings</Link>
<Link href="https://example.com" external>Example</Link>
```

## Anti-patterns

- Do not use the button's link variant inside text.
- Do not give a link an `onClick` with no destination: that is a `Button`.
