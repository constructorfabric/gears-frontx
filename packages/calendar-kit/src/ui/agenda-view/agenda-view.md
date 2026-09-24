# AgendaView

`AgendaView` renders a thirty-day, viewer-local agenda as grouped day sections. Each day contains an all-day lane and an event-bounded timed axis; the current day also keeps a real hour row for the now line when its events do not cover the current hour.

Each hour row and the all-day lane keep the same anatomy: the row's own gutter carries the axis label (the hour, or the translated all-day label), and every event is one slot laid out as three columns - the event's own time gutter, its colour bar, and its body. A timed slot prints its start over its end in that gutter, an all-day slot prints the all-day label there, and the body carries the title over icon/value metadata rows (duration, organizer, attendee count). A metadata row is rendered only when its value exists, so an event with no attendees gets no attendee row.

## Usage

Pass neutral `CalendarEvent` values together with the host's `t`, `locale`, `timeZone`, and `direction` props; the view needs no data source or translation registry of its own. `renderEvent` can replace the default event content while preserving the agenda's selection and keyboard behaviour.

## Props

<!-- generated:props AgendaViewProps -->

| Prop | Type | Required | Description |
| --- | --- | --- | --- |
| `date` | `CalendarDate` | yes | First day of the 30-day window. |
| `events` | `readonly CalendarEvent[]` | yes | Events to list. Days without events still render. |
| `className` | `string` |  | Class added to the component root. |
| `defaultSelectedEventId` | `string` |  | Initial selected event when uncontrolled. |
| `onEventSelect` | `(event: CalendarEvent, context: CalendarEventRenderContext<unknown>, anchor?: HTMLElement…` |  | An available event was activated. `anchor` is the row element. |
| `onSelectedEventIdChange` | `(eventId: string \| null) => void` |  | Called when an event is selected or deselected. |
| `renderDayHeader` | `(date: CalendarDate) => ReactNode` |  | Replaces a day's heading. |
| `renderEvent` | `CalendarEventRenderer` |  | Replaces the body of an event row; the time gutter and colour bar stay. |
| `selectedEventId` | `string` |  | Controlled selected event. |

Also accepts the shared props `direction`, `locale`, `messages`, `t`, `timeZone`, `translations`; see [Internationalization](../../docs/i18n.md#per-component-overrides).
<!-- /generated -->

## Accessibility and empty data

- The root is an accessible region with one polite atomic status for the visible date range and each day count.
- An empty event collection still renders the rolling day rows and their all-day/timed lanes. No loading, error, or empty-state shell, alert, or additional status region is created.
- Events render as native buttons, carry the public `data-event-id` hook, and expose selected/unavailable state through `aria-pressed`, `aria-disabled`, and CSS Module classes.
- The slot's time gutter stamps carry `data-slot-time`, and each metadata row carries `data-agenda-metadata` naming the fact it holds (`timing`, `organizer`, `attendees`). Metadata icons are decorative (`aria-hidden`).
- Event rows share one roving tab stop. Arrow Up/Down, Home, and End move focus across the flat event sequence; Enter and Space select available events.

Relative hints, attendee counts, durations, viewer-zone offsets, and the current-time line are formatted from the supplied locale and time zone. Fetching and failure presentation remain host concerns.

## Messages

Translate these ids, or override them with `translations`; see [Internationalization](../../docs/i18n.md).

<!-- generated:messages calendar.agenda -->

| Translation ID | English | Values |
| --- | --- | --- |
| `calendar.agenda.allDay` | All day |  |
| `calendar.agenda.attendees` | Attendees |  |
| `calendar.agenda.emptyDay` | No events |  |
| `calendar.agenda.eventCount_one` | {{count}} event | `count` |
| `calendar.agenda.eventCount_other` | {{count}} events | `count` |
| `calendar.agenda.focus` | Agenda view |  |
| `calendar.agenda.now` | Now |  |
| `calendar.agenda.range` | {{startDay}} {{startMonth}} – {{endDay}} {{endMonth}} | `startDay`, `startMonth`, `endDay`, `endMonth` |
| `calendar.agenda.rangeCrossYear` | {{startDay}} {{startMonth}} {{startYear}} – {{endDay}} {{endMonth}} {{endYear}} | `startDay`, `startMonth`, `startYear`, `endDay`, `endMonth`, `endYear` |
| `calendar.agenda.startsIn` | Starts {{duration}} | `duration` |
| `calendar.agenda.today` | Today |  |
| `calendar.agenda.tomorrow` | Tomorrow |  |
| `calendar.agenda.viewName` | Agenda view |  |

<!-- /generated -->

## Related

- [CalendarToolbar](../calendar-toolbar/calendar-toolbar.md)
- [EventDetailPanel](../event-detail-panel/event-detail-panel.md)
- [Customization](../../docs/customization.md)
- [Recipes](../../docs/recipes.md)
