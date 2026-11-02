# Grid

## When to use

Use `Grid` for an ordered group of blocks whose widths follow size classes. Use one `Grid` per group. Each `GridItem` declares a unique `layoutId`, a size class, and an optional height class. The solver keeps DOM, focus, and segment order equal to input order.

## When not to use

Use a plain CSS grid when callers already know exact spans or need manual placement. Grid does not render dashboard data or support drag and resize editing.

## Props

| Component | Prop | Meaning |
| --- | --- | --- |
| Grid | `config` | Immutable `GridConfig`. Defaults to `defaultGridConfig`. |
| Grid | `flexible` | `false` (default): every item takes its size class's preferred span. `true`: spans may move inside each class's range to fill rows. |
| Grid | `className`, div props | Applied to the named container wrapper. |
| GridItem | `layoutId` | Required placement identity, unique within this Grid. Separate from HTML `id`. |
| GridItem | `size` | `small`, `medium`, or `large`. |
| GridItem | `height` | `low` (default, one row track) or `high` (two row tracks). |
| GridItem | `className`, div props | Applied to the item. Caller style is preserved; placement variables win on conflict. |

`Grid` accepts direct `GridItem` elements, arrays, and empty conditional entries (`null`, `undefined`, booleans). Fragments, wrappers, portals, and text throw. Keep a stable `layoutId` when content changes. Configs are treated as immutable: replace the config object to recalculate placements. The solver is pure and runs during rendering, so the server and client get the same layout.

## Layout and styling

The default config has 12 columns and four container steps: base 0px, sm 480px, md 768px, lg 1200px. Each size class has a preferred span per step, and with the default config every span is 12, 6 or 3 columns:

| Size | base | sm | md | lg |
| --- | --- | --- | --- | --- |
| `small` | 6 | 6 | 3 | 3 |
| `medium` | 12 | 6 | 6 | 6 |
| `large` | 12 | 12 | 12 | 12 |

By default a Grid places exactly these spans; a row they do not fill keeps its hole at the inline end, so `medium` + `small` at lg is 6 + 3 with three empty columns. A `flexible` Grid lets each span move inside its class's range in `defaultGridConfig` (at lg `small` 2..4, `medium` 4..8, `large` 7..12) to fill rows, so the same pair becomes 8 + 4. Flexible is set per Grid, that is per group. In both modes the solver minimizes internal holes, final holes, width deviation, and band count in that order, never reorders items, and leaves empty columns at the inline end.

Heights are fixed. Row tracks have the size of the config's `rowHeight`, a positive length in px, rem or em (`10rem` in the default config): a `low` item is one track, a `high` item is two tracks and the row gap between them, so a high item is exactly as tall as two stacked lows with their gap. A two-track band holds high items and pairs of adjacent lows stacked in one column beside them; a low never stretches over two tracks, and a low that finds no partner beside a high goes to the next band. With the default config a high `medium` takes two smalls stacked beside it from sm on, and four smalls as two stacks at md and lg (`6 + 3 + 3`). Content taller than its item scrolls inside the item and never overlaps a neighbour. The item is a scroll container, so it also clips what a child draws outside its own box (an outer shadow or outline). The default kit Card draws neither and its focus ring is inset; the `panel` Card's outer shadow and the forced-colors focus outline of an interactive Card are clipped at the item edge. Browsers that make scroll containers keyboard focusable let keyboard users scroll an overflowing item; content that must stay reachable everywhere should fit or carry its own focusable control. An item is a one-column grid, so a single child (a Card) fills it. The track size and the spans of the default config are not final; the config is the single place to change them (`rowHeight` for the track), and `--fx-grid-row-height` overrides the track at runtime. Direction follows CSS grid lines, so `dir="rtl"` mirrors the layout without changing DOM order.

The wrapper is the named inline-size container. Size containment gives it no width of its own content, so it needs a width from outside: a block in normal flow or a stretched flex or grid child gets one; inside a shrink-to-fit box (an inline-block, a float, a `max-content` track, a flex item that does not grow) give the Grid a width. The grid element carries `data-fx-grid="<config.name>"`; each item carries `data-fx-grid-item`. The default generated CSS ships with the component. For a custom config, write it as JSON or as an ES module (`.mjs`) with the config as its default export, then run the command the package installs:

```sh
frontx-ui-grid-css ./grid-config.json ./grid-steps.css
```

Import the generated CSS once and pass that same config object to `Grid`. Give a custom config its own `name`: `default` belongs to `defaultGridConfig` and its shipped CSS, and Grid throws for any other config under that name. `defaultGridConfig` is frozen; copy it to start a custom config. CSS selectors are scoped by config name, so two configs can coexist. A custom stylesheet is needed for each custom config. The generated CSS and the passed config must use the same name and steps. The CSS has no viewport queries and resizing does not run JavaScript. For Shadow DOM, include the kit component CSS and generated CSS inside the shadow root.

`--fx-grid-gap` overrides the configured spacing token at every step, and `--fx-grid-row-height` the configured row track. `--fx-grid-columns` is set by Grid. A flexible Grid's grid element also carries `data-fx-grid-flexible`. The item variables `--fx-grid-col-<step>` and `--fx-grid-row-<step>` are set by Grid for every step. Print uses block flow and a token gap. Nested Grids query their nearest `fx-grid` wrapper.

## Accessibility

Grid adds no role or focus behavior. Put meaningful content inside each item. DOM and focus order remain the input order. A paired stack reads as the first low followed by the second low.

## Example

```tsx
<Grid>
  <GridItem layoutId="summary" size="medium" height="high">Summary</GridItem>
  <GridItem layoutId="trend" size="small">Trend</GridItem>
  <GridItem layoutId="alerts" size="small">Alerts</GridItem>
</Grid>
```
