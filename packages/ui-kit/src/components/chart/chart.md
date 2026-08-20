# Chart

A themeable wrapper around [Recharts](https://recharts.org), faithfully
porting [shadcn/ui's base Chart](https://ui.shadcn.com/docs/components/base/chart):
`ChartContainer` (Recharts `ResponsiveContainer` + per-instance color
injection), `ChartTooltip`/`ChartTooltipContent`, `ChartLegend`/
`ChartLegendContent`, and the `ChartConfig` type. Chart draws no chart type
itself — bars, lines, areas, pies, etc. are Recharts components a consumer
composes as `ChartContainer`'s children, same as upstream.

There is no variant or size axis — upstream ships none either. Every part
is a single visual treatment; all styling is either fixed (grid/flex
layout, spacing, text roles) or supplied per-instance by the consumer's own
`ChartConfig`.

## Composition

```tsx
<ChartContainer config={chartConfig}>
  <BarChart data={data}>
    <CartesianGrid vertical={false} />
    <XAxis dataKey="month" />
    <Bar dataKey="desktop" fill="var(--color-desktop)" radius={4} />
    <ChartTooltip content={<ChartTooltipContent />} />
    <ChartLegend content={<ChartLegendContent />} />
  </BarChart>
</ChartContainer>
```

`ChartContainer` provides the `ChartConfig` to `ChartTooltipContent`/
`ChartLegendContent` via context — both throw if rendered outside one.
`ChartTooltip`/`ChartLegend` are plain re-exports of Recharts'
`Tooltip`/`Legend`; pass the kit's `*Content` components as their
`content` prop for themed rendering, or omit `content` for Recharts'
own default.

## Series colors: `ChartConfig`, not `--chart-*` tokens

```ts
type ChartConfig = Record<
  string,
  { label?: ReactNode; icon?: ComponentType } & (
    | { color?: string }
    | { theme: { light: string; dark: string } }
  )
>;
```

Every series gets its color from `ChartConfig` — either a flat `color`
(one value for both themes) or a `theme` map with independent
`light`/`dark` values. `ChartContainer` reads this config and injects a
`--color-<key>` custom property per entry, scoped to that chart instance;
a series then paints itself with `fill="var(--color-<key>)"` /
`stroke="var(--color-<key>)"` on its own Recharts element:

```ts
const chartConfig = {
  desktop: { label: 'Desktop', color: 'var(--primary)' },
  mobile: { label: 'Mobile', theme: { light: '#e11d48', dark: '#fb7185' } },
} satisfies ChartConfig;
```

**This kit does not ship `--chart-1` through `--chart-5`.** Upstream's own
docs use those as example *values* for `ChartConfig`'s `color` field
(`color: "var(--chart-1)"`) — a convenience palette, not part of the
mechanism itself, which only ever reads whatever string `ChartConfig`
supplies. `theme.css` is frozen for this port and defines no such tokens,
so they are not available as a shorthand today. A consumer can reference
any existing kit token (`var(--primary)`, `var(--info)`, ...), a literal
color, or its own palette. **Open integrator decision:** if a fixed,
theme-aware chart palette (`--chart-1`..`--chart-5`) is wanted as a kit
default, it needs a `theme.css` addition — out of scope for this port.

### Dark mode

`ChartConfig['theme']` keys are exactly `light`/`dark`, matching upstream.
What differs is the selector `ChartStyle` compiles them to: upstream emits
a single `.dark [data-chart=id] { ... }` block (a Tailwind dark-mode
class this kit doesn't have); this port emits the kit's own dual dark
mechanism instead — `[data-theme='dark'] [data-chart=id]` plus a
`prefers-color-scheme` fallback guarded by `:not([data-theme='light'])`,
mirroring `theme.css`'s own light/dark selectors. Nothing about the public
API changes — only the CSS text `ChartStyle` generates internally.

## Props (kit level)

`ChartContainer`:

| Prop | Type | Default |
|------|------|---------|
| `config` | `ChartConfig` — **required** | — |
| `children` | Recharts chart element(s) — **required** | — |
| `id` | `string` — seeds the `data-chart` scoping id | generated |
| `initialDimension` | `{ width: number; height: number }` — size Recharts assumes before its first real measurement | `{ width: 320, height: 200 }` |
| `className` | `string` — merged after the kit class | — |

`ChartTooltipContent` (all optional): `indicator` (`'dot'` \| `'line'` \|
`'dashed'`, default `'dot'`), `hideLabel`, `hideIndicator`, `label`,
`labelFormatter`, `labelClassName`, `formatter`, `color` (overrides every
row's indicator color), `nameKey`, `labelKey`, plus Recharts' own
`Tooltip`/`DefaultTooltipContent` props (forwarded, not re-documented
here — see Recharts' docs).

`ChartLegendContent` (all optional): `hideIcon`, `nameKey`,
`verticalAlign` (`'top'` places the legend's padding above the chart
instead of below), plus Recharts' own `Legend` content props.

## Porting notes (what's not reproducible here)

Upstream styles twelve Recharts-rendered elements via
`[&_.recharts-*]` descendant selectors on `ChartContainer`'s root; **five
are omitted** in this port because they target an attribute *value*
Recharts hardcodes on its own default-rendered elements —
`[stroke='#ccc']` (default cartesian/polar grid lines, reference lines)
and `[stroke='#fff']` (default dot/sector strokes). Writing that selector
needs the literal hex `#ccc`/`#fff` in `chart.module.css`, and this kit's
`tokens.test.ts` raw-color guard rejects any hex literal anywhere in a
component's module CSS — including inside a selector, not just a
declared value — and that test is frozen for this port. The other seven
rules (axis-tick text color, tooltip-cursor stroke, `outline-hidden` on
layer/sector/surface, radial-bar/tooltip-cursor fill) carry no hex
literal and are ported as-is.

Practical effect: a chart that never sets an explicit `stroke` on its
`CartesianGrid`/`ReferenceLine` (Recharts' own default is `#ccc`) or lets
Recharts draw its default white dot/sector outline (`#fff`) keeps that
literal gray/white instead of picking up `--border`/transparent. Every
example below sets its own `stroke`/styling, so this gap doesn't surface
there — it would only show on a chart that leans on Recharts' undocumented
stock colors.

## Examples

```tsx
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@gears-frontx/ui-kit';
import { Bar, BarChart, CartesianGrid, XAxis } from 'recharts';

const chartConfig = {
  desktop: { label: 'Desktop', color: 'var(--primary)' },
  mobile: { label: 'Mobile', color: 'var(--info)' },
} satisfies ChartConfig;

const data = [
  { month: 'Jan', desktop: 186, mobile: 80 },
  { month: 'Feb', desktop: 305, mobile: 200 },
];

<ChartContainer config={chartConfig}>
  <BarChart data={data}>
    <CartesianGrid vertical={false} />
    <XAxis dataKey="month" tickLine={false} axisLine={false} />
    <ChartTooltip content={<ChartTooltipContent />} />
    <Bar dataKey="desktop" fill="var(--color-desktop)" radius={4} />
    <Bar dataKey="mobile" fill="var(--color-mobile)" radius={4} />
    <ChartLegend content={<ChartLegendContent />} />
  </BarChart>
</ChartContainer>;
```

## Anti-patterns

- Do not render `ChartTooltipContent`/`ChartLegendContent` outside a
  `ChartContainer` — both call a hook that throws without its context.
- Do not hardcode a series color inline on the Recharts element and skip
  `ChartConfig` — the config is also what the tooltip/legend read back to
  resolve each series' label and (for the legend's fallback swatch) color.
- Do not reach for `--chart-1`..`--chart-5` — they don't exist in this
  kit; use `ChartConfig`'s `color`/`theme` with an existing token or a
  literal value instead (see "Series colors" above).
