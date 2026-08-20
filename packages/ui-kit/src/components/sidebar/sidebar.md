# Sidebar

A composable application-shell sidebar: an expand/collapse state machine
(`SidebarProvider` + `useSidebar`) plus ~20 layout parts composed under it.
Persists its desktop open state in a cookie, toggles on Cmd/Ctrl+B, and
switches to a slide-in `Sheet` on mobile automatically. Built entirely from
other kit parts — `Sheet`, `Button`, `Input`, `Separator`, `Skeleton`,
`Tooltip` — plus an internal `useIsMobile` hook (not exported; if a
consumer needs the same breakpoint elsewhere, write their own).

## When to use

- A persistent app-shell navigation panel: sections, nav links, a search
  field, a user menu in the footer — the layout shadcn's own dashboard
  blocks are built around.

## When not to use

- A transient, dismiss-on-action panel (filters, a form, item details) —
  use `Sheet` or `Drawer` directly; Sidebar's whole design is a
  persistent, cookie-remembered part of the shell, not a one-off overlay.
- A dropdown-style nav menu — use `NavigationMenu` or `DropdownMenu`.

## Setup

Wrap the whole shell in `SidebarProvider`, with `Sidebar` and
`SidebarInset` as siblings inside it — NOT `Sidebar` wrapping
`SidebarInset`:

```tsx
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from '@gears-frontx/ui-kit';

function AppShell() {
  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader>Acme Inc</SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Platform</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton isActive>
                    <HomeIcon />
                    <span>Home</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>v1.0</SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <SidebarTrigger />
        {/* page content */}
      </SidebarInset>
    </SidebarProvider>
  );
}
```

`SidebarMenuButton`/`SidebarMenuSubButton` expect children shaped as
`<Icon /><span>Label</span>` — the trailing `<span>` is what truncates
with an ellipsis and what disappears when the sidebar collapses to its
icon rail. An icon-only button (no label span) works too; a bare text
node does not truncate.

## Props

### SidebarProvider

| Prop | Type | Default |
|------|------|---------|
| `defaultOpen` | `boolean` | `true` |
| `open` | `boolean` — controlled desktop open state | — |
| `onOpenChange` | `(open: boolean) => void` | — |

### Sidebar

| Prop | Type | Default |
|------|------|---------|
| `side` | `left` \| `right` | `left` |
| `variant` | `sidebar` \| `floating` \| `inset` | `sidebar` |
| `collapsible` | `offcanvas` \| `icon` \| `none` | `offcanvas` |

`variant="inset"` also affects `SidebarInset`'s own rendering (it grows a
margin/radius/shadow to read as a floating card) — see `useSidebar`'s
`state` for driving conditional UI elsewhere in the shell.

### SidebarTrigger

| Prop | Type | Default |
|------|------|---------|
| `label` | `string` — accessible name for the icon-only button | `'Toggle Sidebar'` |

All other props are `Button` props (this IS a `Button`, `variant="ghost"
size="sm"`, with a fixed icon slot).

### SidebarMenuButton

| Prop | Type | Default |
|------|------|---------|
| `variant` | `default` \| `outline` | `default` |
| `size` | `default` \| `sm` \| `lg` | `default` |
| `isActive` | `boolean` — accent fill, reflected as `data-active` | `false` |
| `tooltip` | `string \| TooltipContentProps` — see below | — |
| `render` | `ReactElement` — polymorphism, e.g. render as a link | — |

`tooltip` only ever shows while the sidebar is desktop-collapsed to its
icon rail (`useSidebar().state === 'collapsed'` and not mobile) — pass it
on every icon-only nav item so the label is still reachable when
collapsed; it is simply never mounted otherwise, expanded or on mobile,
where the label is already visible next to the icon.

### SidebarMenuSubButton

| Prop | Type | Default |
|------|------|---------|
| `size` | `sm` \| `md` | `md` |
| `isActive` | `boolean` | `false` |
| `render` | `ReactElement` | — |

### SidebarMenuAction

| Prop | Type | Default |
|------|------|---------|
| `showOnHover` | `boolean` — paint only on item hover/focus-within (or `aria-expanded`) instead of always-visible | `false` |

### SidebarMenuSkeleton

| Prop | Type | Default |
|------|------|---------|
| `showIcon` | `boolean` | `false` |

Every other exported part (`SidebarContent`, `SidebarGroup`,
`SidebarGroupContent`, `SidebarGroupAction`, `SidebarGroupLabel`,
`SidebarHeader`, `SidebarFooter`, `SidebarInput`, `SidebarInset`,
`SidebarMenu`, `SidebarMenuItem`, `SidebarMenuBadge`, `SidebarMenuSub`,
`SidebarMenuSubItem`, `SidebarRail`, `SidebarSeparator`) takes only its
native element's own props plus `className`; `SidebarGroupLabel` and
`SidebarGroupAction` additionally take `render` for polymorphism (same
`useRender`/`mergeProps` idiom as `Badge`).

## `useSidebar()`

```ts
const { state, open, setOpen, openMobile, setOpenMobile, isMobile, toggleSidebar } = useSidebar();
```

`state` is `'expanded' | 'collapsed'`, derived from `open`. Throws outside
a `SidebarProvider` — there is no sensible default a bare consumer of the
hook could fall back to.

## Custom width

Override `--sidebar-width` / `--sidebar-width-icon` via `style` on
`SidebarProvider` — every desktop/mobile size below reads from these two,
inherited down to `Sidebar`/`SidebarInset` the same way `Card` shares
`--card-spacing` with its own parts:

```tsx
<SidebarProvider style={{ '--sidebar-width': '20rem' }}>
```

## Not reproduced from upstream

- **Cookie read happens client-side, not via SSR.** Upstream's own model
  reads the `sidebar_state` cookie in a Next.js Server Component and hands
  the result down as `defaultOpen`, so the very first HTML byte already
  reflects the persisted state. This kit owns no server-rendering step of
  its own, so `SidebarProvider` reads `document.cookie` itself, in a lazy
  `useState` initializer, guarded for a framework that renders it once
  server-side first (`typeof document === 'undefined'`). The write path
  (toggling persists a 7-day cookie) is unchanged.
- **`SidebarMenuButton`'s tooltip mounts conditionally instead of using a
  `hidden` attribute.** Upstream always mounts `TooltipContent` and flips
  a `hidden` attribute on it depending on collapse state — correct only if
  something declares `[hidden] { display: none }` for that popup, and this
  kit's own `tooltip.module.css` (an existing component directory this
  port must not edit) declares no such rule, so the popup's own
  `display: inline-flex` would out-cascade the UA's `[hidden]` default.
  This port instead only renders the `<Tooltip>` wrapper at all when the
  sidebar is desktop-collapsed — same visible result, no reliance on a
  rule that doesn't exist.
- **`SidebarMenuButton`/`SidebarMenuSubButton`'s variant/size visuals are
  this port's own design.** In the fetched upstream file
  (`apps/v4/registry/bases/base/ui/sidebar.tsx`), both axes resolve to
  bare marker classes (e.g. `"cn-sidebar-menu-button-size-sm"`) with no
  Tailwind utility string attached — unlike every other part in the same
  file, whose layout/spacing/color IS spelled out inline as real utility
  classes translated 1:1 into this module's CSS. The actual paddings,
  heights and colors for those two axes live in a shared stylesheet
  outside that one file's path, which was not fetched. `sidebar.module.css`
  designs them instead from each part's documented role, sized off the
  kit's own `--control-height-*`/`--space-*` scale and painted with the
  `--sidebar-accent`/`--sidebar-accent-foreground` pair `theme.css`
  already reserves for this purpose.
- **`SidebarInset`'s `variant="inset"` margin does not retract once the
  sidebar collapses.** Upstream also removes the inset card's left margin
  specifically while a desktop `variant="inset"` sidebar is collapsed (a
  `peer-data-[state=collapsed]` pairing), so the card edge meets the
  now-narrower icon rail flush. This port keeps the simpler, constant
  margin/radius/shadow treatment at every state — a decorative refinement
  judged not worth the extra `:has()` combinatorics for a purely cosmetic
  gap.
- **No RTL icon flip on `SidebarTrigger`.** Upstream mirrors its trigger
  icon horizontally under a dir="rtl" ancestor. This kit has no bundled
  RTL-detection utility that a self-contained Sidebar could depend on
  without adding a new cross-component coupling (a separate `direction`
  component exists in the kit, but wiring it in is a decision for that
  component's own consumers, not implicit here) — left unflipped.
- **`useIsMobile` starts `false`, not upstream's tri-state
  `undefined`.** See `use-mobile.ts`'s own comment: collapsing the "not
  measured yet" state into "assume desktop" removes a null-check every
  caller of the hook would otherwise carry, at the cost of the same
  one-frame flash-of-desktop-layout upstream's own `hidden md:block` CSS
  already exists to paper over (kept here too, on `.root`).

## Anti-patterns

- Do not nest `SidebarInset` inside `Sidebar` — they are siblings under
  `SidebarProvider`; `SidebarInset` is the MAIN content area, not part of
  the sidebar panel.
- Do not read/write the `sidebar_state` cookie directly — go through
  `SidebarProvider`'s `open`/`onOpenChange` if external state needs to
  observe or drive it; the cookie write is an implementation detail of
  `setOpen`, not a public contract.
- Do not put a bare text node in `SidebarMenuButton` — wrap it in `<span>`
  so it gets truncation and disappears correctly when the sidebar
  collapses to its icon rail.
- Do not call `useSidebar()` outside a `SidebarProvider` — it throws by
  design; there is no sensible default state.
