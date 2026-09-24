# WeekGrid

`WeekGrid` renders a host-supplied five- or seven-day week with all-day spans, timed event geometry, overlap lanes, the current-time marker and an accessible low-level `CalendarGrid` surface.

## Usage

```tsx
import { WeekGrid } from "@gears-frontx/calendar-kit/week-grid";

<WeekGrid
  date={weekDate}
  events={events}
  visibleDays={5}
  interactionMode="quick-create"
  locale="en-US"
  timeZone={viewerTimeZone}
  direction="ltr"
  t={t}
  now={now}
  onQuickCreate={({ range, anchorRect }) => openCreate(range, anchorRect)}
  renderEvent={(context) => context.event.title}
/>;
```

## Props

<!-- generated:props WeekGridProps -->

| Prop | Type | Required | Description |
| --- | --- | --- | --- |
| `date` | `CalendarDate` | yes | Any day in the week to show. The week starts on Monday. |
| `events` | `readonly CalendarEvent<Payload>[]` | yes | Events to lay out. Only the ones overlapping the visible week are drawn. |
| `cellClassName` | `string` |  | Class added to every day cell. |
| `className` | `string` |  | Class added to the component root. |
| `columnHeaderClassName` | `string` |  | Class added to every day header. |
| `defaultInteractionMode` | `WeekGridInteractionMode` |  | Initial interaction mode when uncontrolled. |
| `defaultSelectedEventId` | `string` |  | Initial selected event when uncontrolled. |
| `gutterClassName` | `string` |  | Class on every gutter label: hours, all-day, zone and the trailing copy. |
| `interactionMode` | `WeekGridInteractionMode` |  | Controlled interaction mode. Default `quick-create`. |
| `now` | `UtcInstant` |  | Reference instant for the now line and past styling. Default: the wall clock, per minute. |
| `onEventSelect` | `(event: CalendarEvent<Payload>, context: CalendarEventRenderContext<Payload>, anchor?: HT…` |  | An available event was activated; `anchor` is the card, for a detail popover. |
| `onInteractionModeChange` | `(mode: WeekGridInteractionMode) => void` |  | Called when the grid asks to change mode. |
| `onMoveRequest` | `(request: CalendarMoveRequest) => void` |  | An event was dropped on a new slot in `paint-and-move` mode. Call `confirm` or `cancel`. |
| `onPaintSelect` | `(range: CalendarSelectionRange) => void` |  | A range was painted in `paint-and-move` mode. |
| `onQuickCreate` | `(payload: CalendarQuickCreatePayload) => void` |  | An empty slot was activated in `quick-create` mode. |
| `onSelectedEventIdChange` | `(eventId: string \| null) => void` |  | Called when an event is selected or deselected. |
| `renderCell` | `(context: CalendarCellContext) => ReactNode` |  | Replaces the content of each empty time cell. |
| `renderConflict` | `CalendarConflictRenderer` |  | Replaces how each conflict renders inside the default card. |
| `renderDetail` | `CalendarDetailRenderer<Payload>` |  | Renders an inline detail for the selected event. Receives `close`. |
| `renderEvent` | `CalendarEventRenderer<Payload>` |  | Replaces the default `EventCard` for timed and all-day events. |
| `renderUnavailable` | `(cell: CalendarCell) => ReactNode` |  | Drawn in cells covered by an unavailable or busy timed event. |
| `selectedEventId` | `string` |  | Controlled selected event. |
| `slotMinutes` | `CalendarSlotMinutes` |  | Length of one row. Default `60`. |
| `trailingGutter` | `boolean` |  | Repeat the hour labels on the trailing edge. The copy is hidden from assistive technology. |
| `visibleDays` | `5 \| 7` |  | `5` shows Monday–Friday, `7` the whole week. Default `5`. |
| `visibleHours` | `CalendarTimeWindow` |  | Visible hours, e.g. `{ start: "06:00", end: "23:00" }`, on slot boundaries. Default: all. |
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

## Interaction modes

- `quick-create` activates an empty timed cell by click or Enter/Space and emits `onQuickCreate`. Available events emit `onEventSelect(event, context, anchor)`, where `anchor` is the activated card element.
- `paint-and-move` paints an ordered range through pointer gestures and emits `onPaintSelect`. Dragging an available event emits `onMoveRequest`; the host must call `confirm` or `cancel` on the request. No move is committed by the component before confirmation.
- `read-only` preserves the rendered surface and event viewing, but emits none of the create, paint or move callbacks. Unavailable and `access="busy"` events are never activated.

`now?: UtcInstant` optionally controls the reference instant for the current-time marker and past-event state; when omitted, the component follows the host wall clock.

`interactionMode` and `selectedEventId` support controlled values with change callbacks. `defaultInteractionMode` and `defaultSelectedEventId` provide uncontrolled initial values.

## Slots and states

`renderEvent`, `renderConflict` and `renderDetail` replace host-specific event, conflict and detail content. Event contexts retain opaque `metadata`; conflict contexts retain the event and host-supplied dimension label. The default event uses `EventCard`; a custom event renders inside a button, and conflicts use `ConflictIndicator`. Loading, error, and empty-state presentation remains outside the kit: the supplied events render directly into the ordinary grid, including when the collection is empty. The custom detail slot receives `close`, which dismisses the composed detail surface without performing a backend operation.

## Accessibility and styling

The component composes `CalendarGrid` with semantic grid dimensions, one roving tab stop, keyboard movement and RTL-aware horizontal navigation. Its scroll surface is a plain scroll container owned by the component. Event cards remain keyboard-actionable, expose `data-event-id`, selected/unavailable states and focus rings. Import `@gears-frontx/calendar-kit/theme.css` once in the host; component styles use the documented `--cal-*` aliases only. Every root accepts `className`.

## Messages

Translate these ids, or override them with `translations`; see [Internationalization](../../docs/i18n.md).

<!-- generated:messages calendar.week -->

| Translation ID                 | English          | Values |
| ------------------------------ | ---------------- | ------ |
| `calendar.week.allDay`         | All-day events   |        |
| `calendar.week.currentTime`    | Current time     |        |
| `calendar.week.focus`          | Week view        |        |
| `calendar.week.nonWorkingHour` | non-working hour |        |
| `calendar.week.range`          | Week of          |        |
| `calendar.week.timeZone`       | Time zone        |        |
| `calendar.week.workingHour`    | working hour     |        |

<!-- /generated -->

## Related

- [DayGrid](../day-grid/day-grid.md)
- [EventCard](../event-card/event-card.md)
- [EventDetailPanel](../event-detail-panel/event-detail-panel.md)
- [CreateEventPopover](../create-event/create-event.md)
- [Customization](../../docs/customization.md)
- [Recipes](../../docs/recipes.md)
