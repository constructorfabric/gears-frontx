# Concepts

The kit's data model is small, serializable and deliberately strict. Everything a component shows comes from these types; everything it reports back is one of them.

## Who owns what

| The host owns | The kit owns |
| --- | --- |
| Fetching, caching and saving events | Laying events out and drawing them |
| Deciding what is available, busy or conflicting | Showing those decisions |
| Which date, view, event and draft are current | Keyboard, focus, selection gestures and announcements |
| Permissions: who may edit, delete or move | Hiding controls when the host leaves a callback out |
| Language choice and translations | Stable message ids and English fallback text |
| Loading, error and empty screens | The ordinary surface, even with zero events |

Two rules follow from this and explain most of the API:

- **Nothing changes until the host says so.** A drag produces a `CalendarMoveRequest` with `confirm` and `cancel`; a submit calls `onSubmit` and waits for its result; a toolbar click calls `onNext`. The kit never mutates your events.
- **Leave a callback out to turn the feature off.** No `onEdit` means no edit button; no `onCreateCalendar` means no create button.

## Values: dates, times, instants and zones

Four branded string types carry every temporal value. The brand means a plain `string` is not accepted by accident; the parse functions validate and throw a `RangeError` on bad input.

| Type | Shape | Create with | Meaning |
| --- | --- | --- | --- |
| `CalendarDate` | `2026-09-23` | `calendarDate()` | A day on the viewer's calendar |
| `LocalTime` | `14:30` | `parseLocalTime()` | A wall-clock time |
| `UtcInstant` | `2026-09-23T11:30:00.000Z` | `utcInstant()` | A moment in absolute time |
| `IanaTimeZone` | `Europe/Istanbul` | `parseIanaTimeZone()` | A validated time-zone id |

Convert between them with `fromViewerDateTime({ date, time, timeZone })` (wall clock to instant) and `toViewerDateTime(instant, timeZone)` (instant to wall clock). `addCalendarDays` and `addCalendarMonths` step dates without touching time zones.

### Two time zones

- The **event's zone** (`event.timeZone`) is where the event was scheduled. Its `startDate`/`startTime` are wall-clock values in that zone.
- The **viewer's zone** (the `timeZone` prop or provider value) is where the user is. Every grid, label and "today" is computed in it.

A 09:00 London meeting shown to a viewer in Istanbul appears at 11:00. The grid places timed events by their `start`/`end` instants, so the two zones never have to agree.

### Daylight saving

Slots follow elapsed time. On the day clocks go forward the grid has one slot fewer; on the day they go back, one more. Ambiguous wall-clock times are resolved by `LocalTimeDisambiguation`: `compatible` (the default) takes the earlier of two repeated times and moves forward over a skipped one; `reject` throws instead.

## Events

An event is one of two shapes, told apart by `allDay`:

- **Timed**: `startDate`, `startTime`, `endDate`, `endTime` in the event's zone, plus `start` and `end` instants. `endTime` may be `null` while unknown.
- **All-day**: `startDate` and an **exclusive** `endDate`. A one-day event on 24 September has `endDate: "2026-09-25"`. Both time fields are `null`.

The exclusive end is the most common source of off-by-one bugs; see [Troubleshooting](troubleshooting.md#an-all-day-event-shows-one-day-short).

`metadata` is yours. Type it through the `Payload` generic (`CalendarEvent<MyMetadata>`) and it reaches every render slot untouched.

<!-- generated:props CalendarEventBase -->

| Prop | Type | Required | Description |
| --- | --- | --- | --- |
| `colorFamily` | `CalendarColorFamily` | yes | Palette for the card, bar and chip. |
| `id` | `string` | yes | Stable id. Used for selection, `data-event-id`, and as the React key. |
| `timeZone` | `IanaTimeZone` | yes | Scheduling zone; `startDate`/`startTime` are wall-clock values in it. |
| `title` | `string` | yes | Card text and detail heading; empty shows the translatable "(untitled)" and "Event details". |
| `access` | `"full" \| "busy"` |  | `busy` is inert (no selection, no drag); the detail shows only its time. |
| `attendees` | `readonly CalendarAttendee[]` |  | Invitees shown as avatars and, in the expanded detail, grouped by response. |
| `available` | `boolean` |  | `false` renders the event as unavailable and ignores activation. Default `true`. |
| `calendarId` | `string` |  | The calendar this event belongs to; matches `CalendarRef.id`. |
| `calendarName` | `string` |  | Display name of the calendar, for hosts that render it in a slot. |
| `conferencingProviderId` | `string` |  | Id of the conferencing provider the host offers in the create form. |
| `conflicts` | `readonly CalendarConflict[]` |  | Shown on the card and in the detail; the card's `conflicts` prop overrides them. |
| `description` | `string` |  | Plain text shown in the detail panel. |
| `eventType` | `string` |  | Short type label ("Lecture", "Exam") shown in the card's default metadata row. |
| `joinUrl` | `string` |  | Meeting link. Join and Copy appear only for `http(s)` URLs; anything else is plain text. |
| `location` | `string` |  | Shown in the card metadata and the detail panel. |
| `metadata` | `NonNullable<Payload>` |  | Host data carried through to every render slot untouched. |
| `occurrenceId` | `string` |  | Id of this occurrence within its series, carried through for the host. |
| `organizer` | `string` |  | Organizer name, shown in the card metadata and the detail panel. |
| `organizerEmail` | `string` |  | Shown under the organizer in the detail panel. |
| `recurrenceRule` | `string` |  | RRULE body without `RRULE:`, e.g. `FREQ=WEEKLY;BYDAY=MO,WE`; summarized in the detail. |
| `roomId` | `string` |  | Host room id, carried through for host slots. |
| `rsvp` | `CalendarRsvp` |  | Aggregate RSVP counts for the detail panel. |
| `seriesId` | `string` |  | Id shared by all occurrences of a recurring series, carried through for the host. |

<!-- /generated -->

### Availability, access and conflicts

- `available: false` draws the event as unavailable and ignores activation. On a time grid the slots it covers are also marked unavailable, and `renderUnavailable` draws in them.
- `access: "busy"` is for events the viewer may not see: the event is inert and the detail shows only its time.
- `conflicts` are computed by the host (a room double-booked, an instructor in two places). The kit only names them: each conflict has a `dimension` (what collides) and a `label` (the colliding thing). Unknown dimensions are shown as given.

## Layout vocabulary

| Term | Type | Meaning |
| --- | --- | --- |
| Slot | `CalendarCell` | One row of a time grid in one day column: its date, local times and UTC instants |
| Visible hours | `CalendarTimeWindow` | The part of the day a time grid shows, for example 06:00–23:00 |
| Slot length | `CalendarSlotMinutes` | 15, 20, 30 or 60 minutes |
| Working hours | `CalendarTimeWindow` | The shaded business part of the day; also the initial scroll position |
| Segment | `CalendarEventSegment` | The part of an event on one viewer day; multi-day events produce one per day |
| Geometry | `CalendarEventGeometry` | Pixel position and size of a timed segment in its day column |
| Selection range | `CalendarSelectionRange` | An ordered run of slots, painted on a time grid or availability grid |
| Date range | `CalendarDateRange` | Whole days picked on the month grid, both ends inclusive |

`CalendarTimeWindow.end` is exclusive, and `00:00` as an end means the end of the day. Visible hours must start and end on a slot boundary, or the grid throws a `RangeError`.

<!-- generated:props CalendarCell -->

| Prop | Type | Required | Description |
| --- | --- | --- | --- |
| `date` | `CalendarDate` | yes | Viewer-local date of the slot. |
| `end` | `UtcInstant` | yes | Absolute end of the slot (exclusive). |
| `endTime` | `LocalTime` | yes | Viewer-local end time of the slot. |
| `start` | `UtcInstant` | yes | Absolute start of the slot. |
| `startTime` | `LocalTime` | yes | Viewer-local start time of the slot. |

<!-- /generated -->

## Interaction modes

Time grids take an `interactionMode`:

| Mode | Empty slot | Drag over empty slots | Drag an event |
| --- | --- | --- | --- |
| `quick-create` (default) | `onQuickCreate` | nothing | nothing |
| `paint-and-move` | nothing | `onPaintSelect` with the range | `onMoveRequest`; host must `confirm` or `cancel` |
| `read-only` | nothing | nothing | nothing |

In every mode an available event still opens through `onEventSelect`. `DayGrid` supports `quick-create` and `read-only`.

## Drafts

`CreateEventPopover` edits a `CreateEventDraft`, which mirrors the event shape without instants: a timed draft has `startTime`/`endTime`, an all-day draft has neither. A timed draft's `endDate: null` means "same day as the start". `recurrenceRule` holds the RRULE body the Repeat field builds.

<!-- generated:props CreateEventDraftBase -->

| Prop | Type | Required | Description |
| --- | --- | --- | --- |
| `calendarId` | `string \| null` | yes | Selected calendar, or `null` when none is picked. |
| `endDate` | `CalendarDate \| null` | yes | End date. `null` on a timed draft means the same day as `startDate`. |
| `startDate` | `CalendarDate` | yes | Start date in the draft's zone. |
| `timeZone` | `IanaTimeZone` | yes | Zone the draft's dates and times are in. |
| `title` | `string` | yes | Event title. Whitespace-only is a validation error. |
| `attendeeIds` | `readonly string[]` |  | Ids of the selected people. |
| `conferencingProviderId` | `string` |  | Selected conferencing provider. |
| `description` | `string` |  | Free text. |
| `eventTypeId` | `string` |  | Host event-type id. |
| `location` | `string` |  | Selected or typed location. |
| `recurrenceRule` | `string` |  | RRULE body built by the Repeat field, or `null` for a one-off event. |

<!-- /generated -->

`onSubmit` resolves to a `CreateEventResult`. Return `{ error: { kind, message } }` to keep the form open with that message; return nothing or `{ eventId }` to close it. A thrown error is shown as a `transport` error.

## The reference instant

Components that care about "now" (the now line, today markers, past styling, the time-zone offset label) accept `now?: UtcInstant`. Omit it and they follow the wall clock and keep updating on their own. Pass it to freeze time in tests, screenshots or a "view as of" feature.
