# CalendarGrid

`CalendarGrid` is the low-level semantic grid used by calendar view families. It receives host-owned columns, rows, cell keys, labels and render slots; it does not know a backend or application model.

## Usage

```tsx
import { CalendarGrid } from "@gears-frontx/calendar-kit/grid";

<CalendarGrid
  columns={columns}
  rows={rows}
  t={t}
  direction="ltr"
  getCellKey={(cell) => `${cell.date}:${cell.startTime}`}
  getCellLabel={(cell) => `${cell.date} ${cell.startTime}`}
  renderCell={(context) => context.label}
/>;
```

## Props

<!-- generated:props CalendarGridProps -->

| Prop | Type | Required | Description |
| --- | --- | --- | --- |
| `columns` | `readonly CalendarGridColumn[]` | yes | Column headers, in visual order. |
| `getCellKey` | `(cell: CalendarCell) => string` | yes | Stable key for a cell; must be unique across the grid. |
| `getCellLabel` | `(cell: CalendarCell, context: CalendarCellContext) => string` | yes | Accessible name of a cell. |
| `renderCell` | `(context: CalendarCellContext) => ReactNode` | yes | Cell content. |
| `rows` | `readonly CalendarGridRow[]` | yes | Rows of cells. Every row should have one cell per column. |
| `activeCellKey` | `string` |  | Controlled key of the cell holding the tab stop. |
| `className` | `string` |  | Class added to the component root. |
| `defaultActiveCellKey` | `string` |  | Initial active cell when uncontrolled. |
| `isCellNavigable` | `(cell: CalendarCell) => boolean` |  | Return `false` to let arrow keys skip a cell. |
| `onActiveCellChange` | `(cell: CalendarCell) => void` |  | Called with the domain cell when focus moves. |
| `onCellKeyDown` | `CalendarGridCellKeyDownHandler` |  | Runs before built-in navigation; call `preventDefault()` to consume the key. |
| `renderHeader` | `(column: CalendarGridColumn) => ReactNode` |  | Replaces a column header's content. |

Also accepts the shared props `direction`, `locale`, `messages`, `t`, `timeZone`, `translations`; see [Internationalization](../../docs/i18n.md#per-component-overrides).
<!-- /generated -->

## Accessibility

The root uses `role="grid"`, publishes `aria-colcount` and `aria-rowcount`, and renders column headers and cells with row/column indexes. Cells use a single roving `tabIndex` stop. Arrow keys, Home and End move focus; `direction="rtl"` reverses the horizontal arrows. `activeCellKey` is controlled focus, while `defaultActiveCellKey` starts an uncontrolled focus state. `onCellKeyDown` runs before built-in navigation and can consume a key by calling `preventDefault()`. An empty `rows` collection produces the same grid structure without data rows.

The grid renders only the supplied rows and cell content. It does not own loading, error, or empty-state UI, alerts, or status regions. Every root accepts `className`.

## Contract

- `getCellLabel` receives both the domain `CalendarCell` and its `CalendarCellContext`.
- `renderCell` receives the complete `CalendarCellContext`.
- `onActiveCellChange` returns the domain cell, never a DOM element.
- The component only renders host-provided content and callbacks.

`data-cell-key` is an internal DOM attribute used by composed view families to resolve a rendered cell back to its domain key. It is not a public DOM hook; consumers should rely on roles, accessible names, `className`, and the documented event `data-event-id` hook.

## Messages

Translate these ids, or override them with `translations`; see [Internationalization](../../docs/i18n.md).

<!-- generated:messages calendar.grid -->

| Translation ID        | English       | Values |
| --------------------- | ------------- | ------ |
| `calendar.grid.label` | Calendar grid |        |

<!-- /generated -->

## Related

- [WeekGrid](../week-grid/week-grid.md)
- [MonthGrid](../month-grid/month-grid.md)
- [Customization](../../docs/customization.md)
- [Recipes](../../docs/recipes.md)
