// @cpt-dod:cpt-frontx-calendar-kit-dod-week-grid-host-data-boundary:p1
// @cpt-dod:cpt-frontx-calendar-kit-dod-week-grid-mode-callbacks:p1
// @cpt-dod:cpt-frontx-calendar-kit-dod-week-grid-slots:p1
type Brand<Value, Name extends string> = Value & {
  readonly __brand: Name;
};

/** `YYYY-MM-DD` viewer day; create with `calendarDate()`. */
export type CalendarDate = Brand<string, "CalendarDate">;

/** 24-hour `HH:mm`; create with `parseLocalTime()`. */
export type LocalTime = Brand<string, "LocalTime">;

/** ISO-8601 UTC instant; create with `utcInstant()`. */
export type UtcInstant = Brand<string, "UtcInstant">;

/** Known IANA zone id; create with `parseIanaTimeZone()`. */
export type IanaTimeZone = Brand<string, "IanaTimeZone">;

export type CalendarLocale = string;

/** Host translator. Returning the id, `""` or `undefined` falls through to the next layer. */
export type CalendarTranslate = (
  key: string,
  values?: Readonly<Record<string, string | number>>
) => string;

export type CalendarDirection = "ltr" | "rtl";

export type CalendarView = "day" | "week" | "month" | "agenda";

export type CalendarColorFamily =
  | "turquoise"
  | "purple"
  | "orange"
  | (string & Record<never, never>);

export interface CalendarAttendee {
  /** Stable id, used as the React key. */
  readonly id: string;
  /** Name shown next to the avatar; its initials fill the avatar. */
  readonly displayName: string;
  /** Shown under the name in the expanded invitee list. */
  readonly email?: string | null;
  /** RSVP state. `null` and `needs-action` both group under "awaiting". */
  readonly response?:
    | "accepted"
    | "declined"
    | "tentative"
    | "needs-action"
    | null;
}

export interface CalendarRsvp {
  /** Total invited. */
  readonly invited: number;
  /** Accepted. */
  readonly yes: number;
  /** Declined. */
  readonly no: number;
  /** No answer yet. */
  readonly awaiting: number;
  /** Tentative. */
  readonly maybe: number;
}

export type CalendarConflictDimension =
  | "program/section"
  | "instructor"
  | "student"
  | "classroom"
  | (string & Record<never, never>);

export interface CalendarConflict {
  /** Stable id, used as the React key. */
  readonly id: string;
  /** What collides, for example `classroom`. Rendered as the conflict's first label. */
  readonly dimension: CalendarConflictDimension;
  /** The colliding thing, for example the room name. */
  readonly label: string;
  /** Optional longer explanation shown under the label. */
  readonly message?: string;
  /** `error` uses the conflict colour, `warning` the warning colour. Omitted means warning. */
  readonly severity?: "warning" | "error";
}

export interface CalendarEventBase<Payload = unknown> {
  /** Stable id. Used for selection, `data-event-id`, and as the React key. */
  readonly id: string;
  /** Card text and detail heading; empty shows the translatable "(untitled)" and "Event details". */
  readonly title: string;
  /** The calendar this event belongs to; matches `CalendarRef.id`. */
  readonly calendarId?: string | null;
  /** Display name of the calendar, for hosts that render it in a slot. */
  readonly calendarName?: string | null;
  /** Palette for the card, bar and chip. */
  readonly colorFamily: CalendarColorFamily;
  /** Scheduling zone; `startDate`/`startTime` are wall-clock values in it. */
  readonly timeZone: IanaTimeZone;
  /** Short type label ("Lecture", "Exam") shown in the card's default metadata row. */
  readonly eventType?: string | null;
  /** Plain text shown in the detail panel. */
  readonly description?: string | null;
  /** Shown in the card metadata and the detail panel. */
  readonly location?: string | null;
  /** Organizer name, shown in the card metadata and the detail panel. */
  readonly organizer?: string | null;
  /** Shown under the organizer in the detail panel. */
  readonly organizerEmail?: string | null;
  /** Invitees shown as avatars and, in the expanded detail, grouped by response. */
  readonly attendees?: readonly CalendarAttendee[];
  /** Id of the conferencing provider the host offers in the create form. */
  readonly conferencingProviderId?: string | null;
  /** Host room id, carried through for host slots. */
  readonly roomId?: string | null;
  /** Meeting link. Join and Copy appear only for `http(s)` URLs; anything else is plain text. */
  readonly joinUrl?: string | null;
  /** RRULE body without `RRULE:`, e.g. `FREQ=WEEKLY;BYDAY=MO,WE`; summarized in the detail. */
  readonly recurrenceRule?: string | null;
  /** Id shared by all occurrences of a recurring series, carried through for the host. */
  readonly seriesId?: string | null;
  /** Id of this occurrence within its series, carried through for the host. */
  readonly occurrenceId?: string;
  /** `busy` is inert (no selection, no drag); the detail shows only its time. */
  readonly access?: "full" | "busy";
  /** `false` renders the event as unavailable and ignores activation. Default `true`. */
  readonly available?: boolean;
  /** Aggregate RSVP counts for the detail panel. */
  readonly rsvp?: CalendarRsvp | null;
  /** Shown on the card and in the detail; the card's `conflicts` prop overrides them. */
  readonly conflicts?: readonly CalendarConflict[];
  /** Host data carried through to every render slot untouched. */
  readonly metadata?: Payload;
}

/** All-day events carry dates only, with an exclusive `endDate`; timed events add `start`/`end`. */
export type CalendarEvent<Payload = unknown> =
  | (CalendarEventBase<Payload> & {
      readonly allDay: true;
      readonly startDate: CalendarDate;
      readonly endDate: CalendarDate;
      readonly startTime: null;
      readonly endTime: null;
      readonly start?: never;
      readonly end?: never;
    })
  | (CalendarEventBase<Payload> & {
      readonly allDay: false;
      readonly startDate: CalendarDate;
      readonly endDate: CalendarDate;
      readonly startTime: LocalTime;
      readonly endTime: LocalTime | null;
      readonly start: UtcInstant;
      readonly end: UtcInstant;
    });

export interface CalendarAvailabilityCell extends CalendarCell {
  /** `false` blocks the cell: it cannot be painted and is drawn as unavailable. */
  readonly available: boolean;
}

export interface CalendarCellContext {
  /** The cell being rendered. */
  readonly cell: CalendarCell;
  /** Stable key of the cell within the grid. */
  readonly key: string;
  /** Accessible label the kit built for the cell. */
  readonly label: string;
  /** The cell holds the grid's single tab stop. */
  readonly isFocused: boolean;
  /** The cell is inside the current selection or paint range. */
  readonly isSelected: boolean;
  /** The host marked the cell unavailable. */
  readonly isUnavailable: boolean;
  /** The grid is in read-only mode. */
  readonly isReadOnly: boolean;
}

export interface CalendarGridColumn {
  /** Stable column key. */
  readonly key: string;
  /** Column header text. */
  readonly label: string;
}

export interface CalendarGridRow {
  /** Stable row key. */
  readonly key: string;
  /** The row's cells, one per column. */
  readonly cells: readonly CalendarCell[];
}

export interface CalendarDetailRenderContext<Payload = unknown> {
  /** The open event. */
  readonly event: CalendarEvent<Payload>;
  /** Closes the detail surface. It performs no backend operation. */
  readonly close: () => void;
  /** Present when the host passed `onEdit` and the event is editable. */
  readonly onEdit?: () => void;
  /** Present when the host passed `onDelete` and the event is editable. */
  readonly onDelete?: () => void;
}

export interface CalendarEventRenderContext<Payload = unknown> {
  /** The event being rendered. */
  readonly event: CalendarEvent<Payload>;
  /** The day segment being rendered; multi-day events render one per day. */
  readonly segment: CalendarEventSegment;
  /** Pixel placement inside the day column, for timed segments on the week and day grids. */
  readonly geometry?: CalendarEventGeometry;
  /** The event is the selected event. */
  readonly isSelected: boolean;
  /** The event has ended relative to `now`. */
  readonly isPast: boolean;
  /** The event can be activated: `available` is not `false` and `access` is not `busy`. */
  readonly isAvailable: boolean;
  /** The grid is in read-only mode. */
  readonly isReadOnly: boolean;
  /** The conflicts to show for this event. */
  readonly conflicts: readonly CalendarConflict[];
}

export interface CalendarRef {
  /** Stable calendar id. */
  readonly id: string;
  /** Display name. */
  readonly name: string;
  /** Palette for the calendar's swatch and its events. */
  readonly colorFamily: CalendarColorFamily;
}

export interface CalendarTimeZoneOption {
  /** The zone. */
  readonly id: IanaTimeZone;
  /** Display label, for example "London, Lisbon, Paris". */
  readonly label: string;
}

export interface CalendarWorldClock {
  /** The clock's zone. */
  readonly timeZoneId: IanaTimeZone;
  /** Display name of the place. */
  readonly city: string;
  /** Formatted local time. */
  readonly time: string;
  /** Formatted UTC offset, for example `GMT+3`. */
  readonly offset: string;
}

export interface CalendarCell {
  /** Viewer-local date of the slot. */
  readonly date: CalendarDate;
  /** Viewer-local start time of the slot. */
  readonly startTime: LocalTime;
  /** Viewer-local end time of the slot. */
  readonly endTime: LocalTime;
  /** Absolute start of the slot. */
  readonly start: UtcInstant;
  /** Absolute end of the slot (exclusive). */
  readonly end: UtcInstant;
}

export interface CalendarSelectionRange {
  /** Earliest cell of the range. */
  readonly start: CalendarCell;
  /** Latest cell of the range. */
  readonly end: CalendarCell;
  /** Every cell from `start` to `end` in time order. */
  readonly cells: readonly CalendarCell[];
}

export interface CalendarEventSegment {
  /** The event this segment belongs to. */
  readonly event: CalendarEvent;
  /** Viewer day this segment is on. */
  readonly date: CalendarDate;
  /** Segment start, clipped to the day. */
  readonly start: UtcInstant;
  /** Segment end, clipped to the day. */
  readonly end: UtcInstant;
  /** Position in a multi-day event; `null` for an event that fits in one day. */
  readonly segment: "start" | "middle" | "end" | null;
}

export interface CalendarEventGeometry {
  /** Offset from the top of the visible hours. */
  readonly top: number;
  /** Height in pixels. */
  readonly height: number;
  /** Offset from the column's start edge; overlapping events are placed side by side. */
  readonly insetInlineStart: number;
  /** Width of the event's lane. */
  readonly inlineSize: number;
  /** Stacking order among overlapping events; later lanes sit above earlier ones. */
  readonly zIndex: number;
}

/** Nothing moves until the host calls `confirm`; `cancel` restores the event and focus. */
export interface CalendarMoveRequest {
  /** The event being moved. */
  readonly event: CalendarEvent;
  /** Cell the drag started on. */
  readonly from: CalendarCell;
  /** Cell the event was dropped on. */
  readonly to: CalendarCell;
  /** Accept the move. The grid reports it through its committed state; the host persists it. */
  readonly confirm: () => void;
  /** Reject the move and return focus to the origin cell. */
  readonly cancel: () => void;
}

export type WeekGridInteractionMode =
  | "quick-create"
  | "paint-and-move"
  | "read-only";

export interface CreateEventDraftBase {
  /** Event title. Whitespace-only is a validation error. */
  readonly title: string;
  /** Start date in the draft's zone. */
  readonly startDate: CalendarDate;
  /** End date. `null` on a timed draft means the same day as `startDate`. */
  readonly endDate: CalendarDate | null;
  /** Zone the draft's dates and times are in. */
  readonly timeZone: IanaTimeZone;
  /** Selected calendar, or `null` when none is picked. */
  readonly calendarId: string | null;
  /** Host event-type id. */
  readonly eventTypeId?: string | null;
  /** Ids of the selected people. */
  readonly attendeeIds?: readonly string[];
  /** Selected or typed location. */
  readonly location?: string | null;
  /** Selected conferencing provider. */
  readonly conferencingProviderId?: string | null;
  /** RRULE body built by the Repeat field, or `null` for a one-off event. */
  readonly recurrenceRule?: string | null;
  /** Free text. */
  readonly description?: string | null;
}

export interface TimedCreateEventDraft extends CreateEventDraftBase {
  /** Discriminant. */
  readonly allDay: false;
  /** Start time. */
  readonly startTime: LocalTime;
  /** End time, or `null` while the user has not set one. */
  readonly endTime: LocalTime | null;
}

/** `endDate` is exclusive, as on `CalendarEvent`. */
export interface AllDayCreateEventDraft extends CreateEventDraftBase {
  /** Discriminant. */
  readonly allDay: true;
  /** Always `null`. */
  readonly startTime: null;
  /** Always `null`. */
  readonly endTime: null;
}

export type CreateEventDraft = TimedCreateEventDraft | AllDayCreateEventDraft;

/** `error` keeps the form open; nothing or `eventId` closes it; a throw reports a `transport` error. */
export interface CreateEventResult {
  /** Id of the created event. */
  readonly eventId?: string;
  /** Why the create failed. The form stays open and shows `message`. */
  readonly error?: {
    readonly kind: "field" | "form" | "denied" | "transport";
    readonly message: string;
  };
}

/** `start` inclusive, `end` exclusive. */
export interface UtcRange {
  /** Inclusive start. */
  readonly start: UtcInstant;
  /** Exclusive end. */
  readonly end: UtcInstant;
}

/** An `end` of `00:00` means the end of the day. */
export interface CalendarTimeWindow {
  /** Inclusive start time. */
  readonly start: LocalTime;
  /** Exclusive end time; `00:00` means the end of the day. */
  readonly end: LocalTime;
}

export type CalendarSlotMinutes = 15 | 20 | 30 | 60;

/** Both ends inclusive. */
export interface CalendarDateRange {
  /** First day. */
  readonly start: CalendarDate;
  /** Last day (inclusive). */
  readonly end: CalendarDate;
}

/** `endExclusive` is not included. */
export interface ViewerDateRange {
  /** First day. */
  readonly start: CalendarDate;
  /** Day after the last day. */
  readonly endExclusive: CalendarDate;
  /** Zone the days are counted in. */
  readonly timeZone: IanaTimeZone;
}

export interface ViewerDateTime {
  /** The instant. */
  readonly source: UtcInstant;
  /** The zone it is viewed in. */
  readonly timeZone: IanaTimeZone;
  /** Local date. */
  readonly date: CalendarDate;
  /** Local time. */
  readonly time: LocalTime;
  /** UTC offset in minutes at that instant. */
  readonly offsetMinutes: number;
}

export interface LocalDateTimeInput {
  /** Local date. */
  readonly date: CalendarDate;
  /** Local time. */
  readonly time: LocalTime | string;
  /** Zone the wall-clock values are in. */
  readonly timeZone: IanaTimeZone;
  /** How to resolve a skipped or repeated local time. Default `compatible`. */
  readonly disambiguation?: LocalTimeDisambiguation;
}

export interface ViewerDaySegment {
  /** Viewer day. */
  readonly date: CalendarDate;
  /** Start, clipped to the day. */
  readonly start: UtcInstant;
  /** End, clipped to the day. */
  readonly end: UtcInstant;
  /** Position in a multi-day range; `null` when the range fits in one day. */
  readonly segment: ViewerDaySegmentKind | null;
}

export interface ViewerDateTimeFormatOptions {
  readonly dateStyle?: Intl.DateTimeFormatOptions["dateStyle"];
  readonly timeStyle?: Intl.DateTimeFormatOptions["timeStyle"];
  readonly hour12?: boolean;
  readonly weekday?: Intl.DateTimeFormatOptions["weekday"];
  readonly year?: Intl.DateTimeFormatOptions["year"];
  readonly month?: Intl.DateTimeFormatOptions["month"];
  readonly day?: Intl.DateTimeFormatOptions["day"];
}

export interface LocalDateTimeParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
  readonly millisecond: number;
}

export interface ZonedDateParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
}

export type LocalTimeDisambiguation =
  | "compatible"
  | "earlier"
  | "later"
  | "reject";

export type Weekday =
  | "sunday"
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday";

export type ViewerDaySegmentKind = "start" | "middle" | "end";

export {
  LOCAL_TIME_DISAMBIGUATION,
  VIEWER_DAY_SEGMENT,
  WEEKDAY,
  calendarDate,
  datePartsInZone,
  invalidTemporalValue,
  localDateTimeParts,
  parseIanaTimeZone,
  parseLocalTime,
  resolveDaySegment,
  utcInstant,
} from "./validation";

export {
  AGENDA_WINDOW_DAYS,
  DEFAULT_SLOT_MINUTES,
  DEFAULT_WORKING_HOURS,
  FULL_DAY_TIME_WINDOW,
  addCalendarDays,
  addCalendarMonths,
  assertTimeWindow,
  buildDayRange,
  buildDayWindow,
  buildMonthRange,
  buildSlotStarts,
  buildTimeWindowRange,
  buildWeekRange,
  compareUtcInstants,
  countWindowSlots,
  fromViewerDateTime,
  isDateInRange,
  isWithinTimeWindow,
  orderDateRange,
  splitUtcRangeByViewerDay,
  toUtcRange,
  toViewerDateTime,
} from "./temporal";

export {
  RELATIVE_HINT_NOW,
  formatDuration,
  formatRelativeHint,
  formatViewerDate,
  formatViewerDateTime,
  formatViewerDayNumber,
  formatViewerMonthYear,
  formatViewerTime,
  formatViewerTimeZoneOffset,
  formatViewerWeekdayShort,
} from "./format";
export {
  TIME_INPUT,
  formatTimeOfDay,
  localTimeFromMinutes,
  minutesFromLocalTime,
  parseTimeInput,
  timeOfDayIncrements,
  usesTwelveHourClock,
} from "./time-input";

export type {
  ParseTimeInputOptions,
  TimeInputKind,
  TimeInputResult,
  TimeOfDayIncrementOptions,
} from "./time-input";
