# AvailabilityGrid

`AvailabilityGrid` renders host-owned availability cells and exposes paint interactions as an ordered, serializable `CalendarSelectionRange`.

```tsx
<AvailabilityGrid
  date={date}
  cells={cells}
  locale="en-US"
  timeZone={timeZone}
  direction="ltr"
  t={t}
  onPaintSelect={(range) => setDraftRange(range)}
/>
```

The host supplies each `CalendarAvailabilityCell`; the kit does not fetch or interpret Schedule data. Available cells can be painted with pointer or keyboard input. Blocked cells remain navigable but cannot start, extend, or commit a selection. Set `interactionMode="read-only"` to preserve navigation while disabling selection.

`selectedRange` and `onSelectedRangeChange` form the controlled contract. Use `defaultSelectedRange` for uncontrolled usage. `renderCell` receives the standard `CalendarCellContext` plus `available`.

An empty `cells` collection still renders the ordinary grid structure with no rows. The kit does not create loading, error, or empty-state shells, alerts, or status regions; wizard and fetch-state presentation remains host-owned.

The component is intentionally independent of wizard orchestration: a planning wizard owns its steps, permissions, persistence, and any confirmation UI, and may use `onPaintSelect` to map the returned range into its own request model. No Schedule imports are required.

The root accepts `className`; styles use the calendar theme aliases and include focus-visible, dark-theme, reduced-motion, and forced-colors support.

## Props

<!-- generated:props AvailabilityGridProps -->

| Prop | Type | Required | Description |
| --- | --- | --- | --- |
| `cells` | `readonly CalendarAvailabilityCell[]` | yes | Host availability decisions, one per slot. |
| `date` | `CalendarDate` | yes | Day the cells belong to, used for the grid's label. |
| `className` | `string` |  | Class added to the component root. |
| `defaultSelectedRange` | `CalendarSelectionRange` |  | Initial painted range when uncontrolled. |
| `interactionMode` | `"paint" \| "read-only"` |  | `read-only` keeps navigation but disables painting. Default `paint`. |
| `onPaintSelect` | `(range: CalendarSelectionRange) => void` |  | Called once when a paint gesture is committed. |
| `onSelectedRangeChange` | `(range: CalendarSelectionRange \| null) => void` |  | Called when the painted range changes or clears. |
| `renderCell` | `(context: CalendarCellContext & { readonly available: boolean; }) => ReactNode` |  | Replaces cell content. The context adds the cell's `available` flag. |
| `selectedRange` | `CalendarSelectionRange` |  | Controlled painted range. |

Also accepts the shared props `direction`, `locale`, `messages`, `t`, `timeZone`, `translations`; see [Internationalization](../../docs/i18n.md#per-component-overrides).
<!-- /generated -->

## Messages

Translate these ids, or override them with `translations`; see [Internationalization](../../docs/i18n.md).

<!-- generated:messages calendar.availability -->

| Translation ID                | English      | Values |
| ----------------------------- | ------------ | ------ |
| `calendar.availability.label` | Availability |        |

<!-- /generated -->

## Related

- [WeekGrid](../week-grid/week-grid.md)
- [Customization](../../docs/customization.md)
- [Recipes](../../docs/recipes.md)
