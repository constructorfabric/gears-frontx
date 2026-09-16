# Tabs

Switch between panels that share the same screen space, one visible at a
time. Wraps the Base UI Tabs primitives (`Root`/`List`/`Tab`/`Panel` —
this kit renders them as `Tabs`/`TabsList`/`TabsTrigger`/`TabsContent` to
match the names generated code and shadcn docs expect); keyboard
navigation between tabs, `role="tablist"`/`role="tab"`/`role="tabpanel"`
wiring, and mounting only the active panel (by default) come from Base
UI. No portal — every part renders in place.

Composition: `Tabs` (root, holds the selected value) → `TabsList` (→ one
`TabsTrigger` per tab) → one `TabsContent` per tab, matched to its trigger
by `value`.

## When to use

- Grouping related views that don't need to be compared side by side —
  settings sections, a form split into steps shown one at a time.
- Switching between differently-shaped content behind a shared header,
  where only one need be visible or interactive at once.

## When not to use

- Sequential, gated steps with validation between them (a wizard) — tabs
  imply free jumping between all of them; build a stepper instead.
- Content the user needs to compare at a glance — tabs hide every panel
  but one.
- A small number of mutually exclusive actions, not content panels — use
  `dropdown-menu` or a `button` group instead.

## Props (kit level)

`Tabs` (root):

| Prop | Type | Default |
|------|------|---------|
| `value` / `defaultValue` | controlled / uncontrolled selected tab | — (defaults to the first enabled tab; see Anti-patterns for an SSR caveat) |
| `onValueChange` | `(value, eventDetails) => void` | — |
| `orientation` | `horizontal` \| `vertical` | `horizontal` |
| `className` | `string` — merged after the kit class | — |

`TabsList`:

| Prop | Type | Default |
|------|------|---------|
| `variant` | `default` \| `line` - `line` is the drawn model: a flat row whose active tab carries a full-width 3px `--primary` indicator below it. `default` is a trackless list where the active tab gets its own raised background (`--surface-elevated`) instead. A bordered segmented-control look is not a Tabs variant; that styling belongs to `toggle-group` | `default` |
| `size` | `sm` \| `default` - a 12/16 or a 14/20 label, which makes the `line` list 38 or 42 px tall overall; nothing else moves between the two | `default` |
| `className` | `string` — merged after the kit class | — |

`TabsTrigger`: `value` (required, matches a `TabsContent`), `disabled`;
other props follow Base UI `Tabs.Tab`. Renders a native `<button>`.

`TabsContent`: `value` (required, matches a `TabsTrigger`), `keepMounted`
(keep the panel in the DOM while inactive instead of unmounting it —
`false` by default); other props follow Base UI `Tabs.Panel`.

Set `orientation="vertical"` on `Tabs` for a sidebar-style layout (list on
the side, panel beside it instead of below it) — every part reads its own
`data-orientation`, so no other prop changes.

## Examples

```tsx
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@gears-frontx/ui-kit';

<Tabs defaultValue="account">
  <TabsList>
    <TabsTrigger value="account">Account</TabsTrigger>
    <TabsTrigger value="password">Password</TabsTrigger>
  </TabsList>
  <TabsContent value="account">
    <p>Update your account details here.</p>
  </TabsContent>
  <TabsContent value="password">
    <p>Change your password here.</p>
  </TabsContent>
</Tabs>;
```

A flat, underlined list (`variant="line"`), vertical, sized to a sidebar:

```tsx
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@gears-frontx/ui-kit';

<Tabs defaultValue="general" orientation="vertical">
  <TabsList variant="line">
    <TabsTrigger value="general">General</TabsTrigger>
    <TabsTrigger value="billing">Billing</TabsTrigger>
    <TabsTrigger value="team" disabled>
      Team (soon)
    </TabsTrigger>
  </TabsList>
  <TabsContent value="general">
    <p>General settings.</p>
  </TabsContent>
  <TabsContent value="billing">
    <p>Billing settings.</p>
  </TabsContent>
  <TabsContent value="team">
    <p>Team settings.</p>
  </TabsContent>
</Tabs>;
```

## Anti-patterns

- Do not give two `TabsTrigger`/`TabsContent` pairs the same `value` —
  Base UI matches a panel to its tab by exact `value` equality, and a
  duplicate leaves one panel unreachable.
- Do not rely on inactive panels keeping component state (scroll
  position, uncommitted form input) unless you pass `keepMounted` — by
  default an inactive panel unmounts, and remounts from scratch when
  reselected.
- Do not reach for `variant="line"` expecting an animated highlight that
  slides between tabs — the underline is a per-tab crossfade, not a
  single element in motion.
- Do not omit `defaultValue`/`value` and leave the first `TabsTrigger`
  disabled — Base UI falls back to the next enabled tab client-side, but
  it can't do that during server-side rendering (it doesn't yet know
  which tabs are disabled while pre-rendering), so the server- and
  client-rendered output disagree. Set `defaultValue`/`value` explicitly
  to an enabled tab's value whenever the first one might be disabled.
- Do not expect an icon placed inside a `TabsTrigger` to be auto-sized —
  unlike some shadcn components, this kit has no `data-icon`/generic
  `svg` sizing convention yet; size your own icon via `className`.
