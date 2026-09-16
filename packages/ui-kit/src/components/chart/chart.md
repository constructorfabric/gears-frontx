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

## Series colors: `ChartConfig`, with the `--chart-*` palette behind it

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

The kit publishes a five-step series palette, `--chart-1` through
`--chart-5`, with its own light and dark value per step, plus four
categorical hues (`--chart-category-blue|purple|brown|teal`) that carry one
value in both themes. A `ChartConfig` entry that names neither `color` nor
`theme` falls back to the palette step at its own position in the config,
wrapping to `--chart-1` after the fifth entry, so a chart is legible before
anyone brands it. An explicit `color` or `theme` always wins, and it wins
without shifting the fallback for the entries around it: each entry's step
follows its own index, not its position among the uncoloured ones.

A consumer can still reference any other kit token (`var(--primary)`,
`var(--info)`, ...), a literal colour, or their own palette.
`--color-<key>` is unchanged: it is the per-instance custom property
`ChartStyle` writes for each series, which the palette steps are one
possible value for.

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

## Porting notes

All twelve of the `[&_.recharts-*]` descendant rules upstream applies to
`ChartContainer`'s root are ported, including the five that retint
Recharts' own stock-coloured elements: `[stroke='#ccc']` (default
cartesian/polar grid lines and reference lines) picks up `--border`, and
`[stroke='#fff']` (default dot and sector outlines, drawn for a white
page) goes transparent. So a chart that leaves `CartesianGrid`/
`ReferenceLine` unstyled reads correctly in dark mode instead of showing
Recharts' light-page grey.

`id` is normalized to `[A-Za-z0-9_-]` before it reaches either the
`data-chart` attribute or the per-instance `<style>` block, and a
`ChartConfig` colour containing anything that could end a declaration or
the style element (`;`, `{}`, `<>`, `\`, a comment marker) is dropped
rather than injected. Both are consumer strings landing verbatim in a
stylesheet; keep ids and config keys to plain identifiers and colours to
plain colour syntax and neither rule is noticeable. If you render
`ChartStyle` yourself instead of using `ChartContainer`, put the same
normalized id on your own `data-chart` attribute or the selector will not
match it.

`ChartStyle` renders its per-instance CSS as the `<style>` element's JSX
children (`<style>{css}</style>`) rather than through
`dangerouslySetInnerHTML`, which is what upstream and most React chart
implementations use. Children get React's own server-side `</style`
escaping (so the string can't break out of the tag in SSR output) and are
rendered client-side as an inert Text node — a stronger guarantee than
`dangerouslySetInnerHTML` offers, for the same runtime-built string.

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
- Do not paint a series in `--muted-foreground`: it is the chart's own
  chrome colour (grid, axis, legend), so a series wearing it disappears
  into the chart's furniture. The published palette deliberately excludes
  it (see "Series colors" above).
