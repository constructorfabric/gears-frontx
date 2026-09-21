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

`TabsList` renders the indicator itself: one bar per list that travels to
the active tab over 240 ms, positioned from the geometry Base UI measures
at runtime. There is no indicator part to place, because every list has
exactly one.

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
| `variant` | `default` \| `line` - `line` is a trackless row with one 3px `--primary` bar travelling under the active tab. `default` is the filled track: a `--muted` strip at a 10px corner insetting its triggers by 3, whose active tab takes `--secondary` with a 1px `--border` hairline and no bar. A bordered segmented-control look is not a Tabs variant; that styling belongs to `toggle-group` | `default` |
| `size` | `sm` \| `default` - a 12/16 or a 14/20 label; nothing else moves between the two | `default` |
| `className` | `string` — merged after the kit class | — |

`TabsTrigger`: `value` (required, matches a `TabsContent`), `disabled`;
other props follow Base UI `Tabs.Tab`. Renders a native `<button>`.

`TabsContent`: `value` (required, matches a `TabsTrigger`), `keepMounted`
(keep the panel in the DOM while inactive instead of unmounting it —
`false` by default); other props follow Base UI `Tabs.Panel`.

| Prop | Type | Default |
|------|------|---------|
| `animate` | `boolean` - replay the enter animation each time this panel becomes the active one: a fade up over 4px, on the list's own 240 ms step. Under `prefers-reduced-motion` the panel still fades but does not travel | `true` |

Switching tabs therefore moves two things together: the indicator travels
to the new trigger while its panel arrives. Opt out per panel with
`animate={false}` where the content animates itself, or must not move at
all.

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
- Do not omit `defaultValue`/`value` and leave the first `TabsTrigger`
  disabled — Base UI falls back to the next enabled tab client-side, but
  it can't do that during server-side rendering (it doesn't yet know
  which tabs are disabled while pre-rendering), so the server- and
  client-rendered output disagree. Set `defaultValue`/`value` explicitly
  to an enabled tab's value whenever the first one might be disabled.
- Do not size an icon inside a `TabsTrigger` yourself: the trigger draws
  every direct `svg` child at the drawn 16px box.
- Do not add a wrapper keyed on the active value to replay an enter
  animation - `TabsContent` already animates on becoming active, and a
  keyed wrapper on top of it remounts the content twice as often as the
  panel does.
