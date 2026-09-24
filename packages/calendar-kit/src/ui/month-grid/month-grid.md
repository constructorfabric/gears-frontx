# MonthGrid

`MonthGrid` renders a localized Monday-first month calendar. It builds complete week rows, dims outside-month days, marks today, preserves exclusive all-day end dates, and renders deterministic timed and all-day event lanes.

By default the week column labels each row `W1`…`Wn`, the week's index inside the displayed month; `weekNumbering="iso"` shows the ISO week-of-year the model already keeps. Each event renders as a one-line `09:00 Title` strip in a fixed 21px track behind the 3px family colour bar, and excess events collapse into the overflow chip. All-day lanes occupy those same model rows before timed strips, and month strips omit location, organizer, and other metadata rows. Ordinary dates keep the day number in an unfilled pill; today uses the red strong variant. A today cell and a first-of-month cell carry the cell’s full label (`September 16`); every other day carries just the day number.

## Usage

```tsx
<MonthGrid
  date={date}
  events={events}
  locale="en-US"
  timeZone={timeZone}
  direction="ltr"
  t={t}
  now={now}
  monthData={{ densityCap: 3, overflowByDate: {} }}
  onEventSelect={handleEventSelect}
  onOverflowSelect={({ date, anchorRect }) => openOverflow(date, anchorRect)}
/>
```

`now?: UtcInstant` is an optional controlled reference instant. It drives the today marker and timed-event past state; when omitted, the component follows the host wall clock.

`MonthGridData` is the typed density/overflow input. `densityCap` limits visible event cards and `overflowByDate` adds hidden counts supplied by the consumer. The component never accepts raw API response metadata.

## Props

<!-- generated:props MonthGridProps -->

| Prop | Type | Required | Description |
| --- | --- | --- | --- |
| `date` | `CalendarDate` | yes | Any day in the month to show. Weeks start on Monday. |
| `events` | `readonly CalendarEvent[]` | yes | Events to place. Days outside the month are shown dimmed and still receive their events. |
| `cellClassName` | `string` |  | Class added to every day cell. |
| `className` | `string` |  | Class added to the component root. |
| `columnHeaderClassName` | `string` |  | Class added to every weekday header. |
| `defaultSelectedDateRange` | `CalendarDateRange` |  | Initial date range when uncontrolled. |
| `defaultSelectedEventId` | `string` |  | Initial selected event when uncontrolled. |
| `monthData` | `MonthGridData` |  | Density cap and host-known hidden counts. |
| `now` | `UtcInstant` |  | Reference instant for the today marker and past styling. Omit to follow the wall clock. |
| `onEmptyCellSelect` | `(cell: CalendarCell) => void` |  | An empty part of a day was activated (in `selectionMode="none"`). |
| `onEventSelect` | `(event: CalendarEvent, context: CalendarEventRenderContext<unknown>, anchor?: HTMLElement…` |  | An available event was activated. `anchor` is the strip element. |
| `onOverflowSelect` | `(payload: { readonly date: CalendarDate; readonly anchorRect?: DOMRectReadOnly \| undefine…` |  | The overflow chip was activated. `anchorRect` is the chip's rectangle, for a popover. |
| `onSelectedDateRangeChange` | `(range: CalendarDateRange \| null) => void` |  | Called when a range is committed or cleared. |
| `onSelectedEventIdChange` | `(eventId: string \| null) => void` |  | Called when an event is selected or deselected. |
| `renderCell` | `(context: CalendarCellContext) => ReactNode` |  | Replaces the content of each day cell. |
| `renderEvent` | `CalendarEventRenderer` |  | Replaces the default one-line event strip. |
| `renderOverflow` | `(count: number, date: CalendarDate) => ReactNode` |  | Replaces the overflow chip content. Receives the hidden count. |
| `selectedDateRange` | `CalendarDateRange` |  | Controlled date range (both ends inclusive). |
| `selectedEventId` | `string` |  | Controlled selected event. |
| `selectionMode` | `MonthGridSelectionMode` |  | Default `none`. |
| `trailingGutter` | `boolean` |  | Repeat the week column on the trailing edge, hidden from assistive technology. |
| `weekNumberClassName` | `string` |  | Class added to the week column, its heading and the trailing copy. |
| `weekNumbering` | `MonthGridWeekNumbering` |  | How the week column is labelled. Default `month`. |

Also accepts the shared props `direction`, `locale`, `messages`, `t`, `timeZone`, `translations`; see [Internationalization](../../docs/i18n.md#per-component-overrides).
<!-- /generated -->

## Date range selection

Set `selectionMode="date-range"` to let the user pick whole days, as a term or exam window. The value is a `CalendarDateRange` whose `start` and `end` are both inclusive; use `selectedDateRange` with `onSelectedDateRangeChange`, or `defaultSelectedDateRange` for uncontrolled use.

- Pointer: drag from the first day to the last, or click the first day and then the last. The second click may be in another month after navigating.
- Keyboard: Enter or Space on a day sets the start, the arrow keys move the end, and Enter or Space commits. Escape abandons a range in progress.
- The grid is `aria-multiselectable`, every day carries `aria-selected`, and the live region announces the committed range. `renderCell` receives `isSelected` for the days in range.
- In this mode an empty day starts a range instead of calling `onEmptyCellSelect`; events and the overflow chip keep their own activation. Days the host marks as off stay host-drawn through `renderCell`.

## Week numbers, trailing column, and part classes

`weekNumbering="iso"` shows the ISO 8601 week of the year in the week column instead of the in-month `W1`…`Wn`. `trailingGutter` repeats that column on the trailing edge, hidden from assistive technology.

`cellClassName`, `columnHeaderClassName`, and `weekNumberClassName` add host classes to the day cells, the weekday headers, and the week column (including its heading and the trailing copy). They are the stable styling hooks for these parts; the kit's own CSS Module class names are internal.

## Accessibility and interaction

The root is an ARIA grid with week row headers and localized column labels. Day cells use roving `tabIndex`; Arrow keys move between rows and columns, Home/End move to row boundaries, and RTL mirrors horizontal movement. Enter/Space on an empty cell calls `onEmptyCellSelect` with its `CalendarCell`.

Event cards reuse `EventCard` and expose `data-event-id`, accessible names, selected/unavailable state, Enter/Space activation, and conflict content through `ConflictIndicator`. The overflow chip is a button that announces the hidden count and calls `onOverflowSelect` with the date and the chip's rectangle.

An empty event collection still renders the month cells, headers, overflow lanes, and independent focus/range announcements. The kit does not add loading, error, or empty-state shells, alerts, or status regions. Fetching and failure presentation remain host concerns.

## Slots and theming

Use `renderEvent`, `renderCell`, and `renderOverflow` for host-specific presentation without importing application or API types. Styling uses CSS Modules and `--cal-*` theme aliases; consumers can add `className` or override the calendar theme contract without changing component source.

## Messages

Translate these ids, or override them with `translations`; see [Internationalization](../../docs/i18n.md).

<!-- generated:messages calendar.month -->

| Translation ID | English | Values |
| --- | --- | --- |
| `calendar.month.dateRangeSelected` | Selected {{start}} to {{end}} | `start`, `end` |
| `calendar.month.eventCount_one` | {{count}} event | `count` |
| `calendar.month.eventCount_other` | {{count}} events | `count` |
| `calendar.month.focus` | Month view |  |
| `calendar.month.hidden` | +{{count}} hidden | `count` |
| `calendar.month.label` | Month grid |  |
| `calendar.month.range` | Month of |  |
| `calendar.month.week` | Week |  |
| `calendar.month.weekPrefix` | W{{week}} | `week` |
| `calendar.month.weeks` | Weeks |  |

<!-- /generated -->

## Related

- [MonthNavigator](../month-navigator/month-navigator.md)
- [EventCard](../event-card/event-card.md)
- [Customization](../../docs/customization.md)
- [Recipes](../../docs/recipes.md)
