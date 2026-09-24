# DayGrid

`DayGrid` renders one viewer-local calendar day with an all-day lane, a real-hour timed grid, overlap-aware event placement, and a current-time marker.

The component is controlled by neutral calendar-kit data. Provide `t`, `locale`, `timeZone`, and `direction` from the host application; no application API or translation registry is accessed by the kit.

## Props

<!-- generated:props DayGridProps -->

| Prop | Type | Required | Description |
| --- | --- | --- | --- |
| `date` | `CalendarDate` | yes | The day to show. |
| `events` | `readonly CalendarEvent[]` | yes | Events to lay out. Only the ones overlapping `date` are drawn. |
| `cellClassName` | `string` |  | Class added to every time cell. |
| `className` | `string` |  | Class added to the component root. |
| `columnHeaderClassName` | `string` |  | Class added to the day header. |
| `defaultInteractionMode` | `"read-only" \| "quick-create"` |  | Initial mode when uncontrolled. |
| `defaultSelectedEventId` | `string` |  | Initial selected event when uncontrolled. |
| `gutterClassName` | `string` |  | Class added to every gutter label. |
| `interactionMode` | `"read-only" \| "quick-create"` |  | Controlled mode. `read-only` disables quick-create. Default `quick-create`. |
| `onEventSelect` | `(event: CalendarEvent, context: CalendarEventRenderContext<unknown>, anchor?: HTMLElement…` |  | An available event was activated. `anchor` is the card element. |
| `onInteractionModeChange` | `(mode: "read-only" \| "quick-create") => void` |  | Called when the grid asks to change mode. |
| `onQuickCreate` | `(payload: CalendarQuickCreatePayload) => void` |  | An empty slot was activated in `quick-create` mode. |
| `onSelectedEventIdChange` | `(eventId: string \| null) => void` |  | Called when an event is selected or deselected. |
| `renderCell` | `(context: CalendarCellContext) => ReactNode` |  | Replaces the content of each empty time cell. |
| `renderConflict` | `CalendarConflictRenderer` |  | Replaces how each conflict renders inside the default card. |
| `renderEvent` | `CalendarEventRenderer` |  | Replaces the default `EventCard`. |
| `selectedEventId` | `string` |  | Controlled selected event. |
| `slotMinutes` | `CalendarSlotMinutes` |  | Length of one row. Default `60`. |
| `trailingGutter` | `boolean` |  | Repeat the hour labels on the trailing edge, hidden from assistive technology. |
| `visibleHours` | `CalendarTimeWindow` |  | Visible part of the day, on slot boundaries. Default: the whole day. |
| `workingHours` | `CalendarTimeWindow` |  | Shaded business hours; also where the grid first scrolls to. Default 08:00–18:00. |

Also accepts the shared props `direction`, `locale`, `messages`, `t`, `timeZone`, `translations`; see [Internationalization](../../docs/i18n.md#per-component-overrides).
<!-- /generated -->

## Time axis

`visibleHours?: CalendarTimeWindow` limits the timed grid to part of the day, for example `{ start: "06:00", end: "23:00" }`. The end is exclusive, and `"00:00"` as the end means the end of the day. The default is the whole day.

`slotMinutes?: 15 | 20 | 30 | 60` sets the length of one row; the default is `60`. The gutter labels only rows that start on the hour. `visibleHours` must start and end on a slot boundary; otherwise the component throws a `RangeError`.

`workingHours?: CalendarTimeWindow` sets the shaded business part of the day; the default is 08:00–18:00. It is independent of `visibleHours` and also sets where the grid first scrolls to.

Events are clipped to the visible hours, and events wholly outside them are not rendered. The now line is hidden while the current time is outside them. Slots follow elapsed time, so a daylight-saving day has one slot fewer or more.

## Trailing gutter and part classes

`trailingGutter` repeats the hour labels on the trailing edge, as timetable views do. The copy is hidden from assistive technology, so the grid is announced once, and it follows `direction`.

`cellClassName`, `columnHeaderClassName`, and `gutterClassName` add host classes to the day cells, the day header, and every gutter label (hour rows, the all-day label, the header zone label, and the trailing copy). They are the stable styling hooks for these parts; the kit's own CSS Module class names are internal. Style by state (selected, unavailable) through `renderCell`, which receives it.

## Interaction

- `onEventSelect` receives an event, its render context, and the activated card element when an available event is clicked or activated with Enter/Space. Pass that element to `EventDetailPanel` as `anchorElement` to open the detail beside the card.
- `onQuickCreate` receives a serializable one-slot selection and the cell's `DOMRectReadOnly` anchor in quick-create mode.
- `read-only` mode keeps event selection available while disabling empty-cell creation.
- The timed grid exposes one roving tab stop and supports ArrowUp, ArrowDown, Home, and End. The grid boundary clamps focus rather than wrapping.

## Empty data

No events still produce the complete day surface: the all-day lane, the timed grid for the visible hours, and the now line remain rendered. The kit does not create loading, error, or empty-state shells, alerts, or status regions; a host that fetches data owns those concerns.

`renderEvent`, `renderConflict`, and `renderCell` provide host-owned presentation slots while the kit retains geometry and keyboard behaviour.

## Messages

Translate these ids, or override them with `translations`; see [Internationalization](../../docs/i18n.md).

<!-- generated:messages calendar.day -->

| Translation ID                 | English            | Values |
| ------------------------------ | ------------------ | ------ |
| `calendar.day.allDayEventsFor` | All-day events for |        |
| `calendar.day.currentTime`     | Current time       |        |
| `calendar.day.eventPrefix`     | Event              |        |
| `calendar.day.focus`           | Day view           |        |
| `calendar.day.noAllDayEvents`  | No all-day events  |        |
| `calendar.day.nonWorkingHour`  | non-working hour   |        |
| `calendar.day.range`           | Day range          |        |
| `calendar.day.to`              | to                 |        |
| `calendar.day.workingHour`     | working hour       |        |

<!-- /generated -->

## Related

- [WeekGrid](../week-grid/week-grid.md)
- [EventCard](../event-card/event-card.md)
- [Customization](../../docs/customization.md)
- [Recipes](../../docs/recipes.md)
