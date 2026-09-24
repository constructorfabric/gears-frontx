import "@gears-frontx/calendar-kit/theme.css";
import {
  calendarDate,
  CalendarLocalizationProvider,
  CalendarProvider,
  fromViewerDateTime,
  parseIanaTimeZone,
  parseLocalTime,
  utcInstant,
} from "@gears-frontx/calendar-kit";
import type {
  CalendarAvailabilityCell,
  CalendarColorFamily,
  CalendarDate,
  CalendarDirection,
  CalendarEvent,
  CalendarEventBase,
  CalendarTranslations,
  CalendarMissingTranslation,
  CalendarRef,
  CalendarResourceOption,
  CalendarTranslate,
  CalendarTimeZoneOption,
  IanaTimeZone,
  UtcInstant,
} from "@gears-frontx/calendar-kit";
import { lazy, StrictMode, Suspense, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";

export const DEMO_LOCALE = "en-US";

export const DEMO_TIME_ZONE: IanaTimeZone =
  parseIanaTimeZone("America/New_York");

export const DEMO_DATE: CalendarDate = calendarDate("2026-03-11");

export const DEMO_NOW: UtcInstant = utcInstant(new Date());

export const DEMO_STRINGS = {
  // The same words for every count, so one key is enough.
  "calendar.detail.rsvp.maybe": "{{count}} tentative",
  "calendar.detail.rsvp.no": "{{count}} declined",
  "calendar.detail.rsvp.yes": "{{count}} accepted",
} satisfies Record<string, string>;

export const DEMO_WEEK_TRANSLATIONS: CalendarTranslations = {
  "calendar.week.range": "Showing week of",
};

export const logDemo =
  (action: string) =>
  (...args: readonly unknown[]): void => {
    console.info(`[demo] ${action}`, ...args);
  };

export const demoOnMissingTranslation: CalendarMissingTranslation = (key) => {
  console.warn(`[demo] missing translation: ${key}`);
};

const interpolate = (
  template: string,
  values?: Readonly<Record<string, string | number>>
): string => {
  if (values === undefined) {
    return template;
  }

  let result = template;

  for (const [key, value] of Object.entries(values)) {
    result = result.replace(`{{${key}}}`, String(value));
  }

  return result;
};

const strings: Readonly<Record<string, string>> = DEMO_STRINGS;

// What react-i18next does for a host: the count picks the form, the base id stays the key.
export const demoTranslate: CalendarTranslate = (key, values) => {
  const { count } = values ?? {};
  const category =
    typeof count === "number" &&
    new Intl.PluralRules(DEMO_LOCALE).select(count) === "one"
      ? "_one"
      : "_other";
  const template = strings[`${key}${category}`] ?? strings[key];

  return template === undefined ? key : interpolate(template, values);
};

export interface DemoEventMetadata {
  readonly room?: string;
  readonly project?: string;
}

type EventExtras = Partial<
  Pick<
    CalendarEventBase<DemoEventMetadata>,
    | "calendarId"
    | "calendarName"
    | "location"
    | "description"
    | "organizer"
    | "attendees"
    | "conferencingProviderId"
    | "joinUrl"
    | "recurrenceRule"
    | "access"
    | "available"
    | "conflicts"
    | "metadata"
  >
>;

type ScreenId = "week" | "suite" | "sidebar";

interface ScreenEntry {
  readonly id: ScreenId;
  readonly label: string;
}

const SCREENS: readonly ScreenEntry[] = [
  { id: "week", label: "Week Grid & Shells" },
  { id: "suite", label: "Views & Availability" },
  { id: "sidebar", label: "Sidebar Widgets" },
];

type ThemeChoice = "light" | "dark" | "system";

export interface SegmentOption<T extends string | number> {
  readonly value: T;
  readonly label: string;
}

const THEME_OPTIONS: readonly SegmentOption<ThemeChoice>[] = [
  { label: "Light", value: "light" },
  { label: "Dark", value: "dark" },
  { label: "System", value: "system" },
];

const DIRECTION_OPTIONS: readonly SegmentOption<CalendarDirection>[] = [
  { label: "LTR", value: "ltr" },
  { label: "RTL", value: "rtl" },
];

const SCREEN_VIEWS = {
  sidebar: lazy(async () => await import("./examples/sidebar-suite")),
  suite: lazy(async () => await import("./examples/calendar-suite")),
  week: lazy(async () => await import("./examples/week-grid")),
} satisfies Record<ScreenId, unknown>;

const makeTimedEvent = (
  id: string,
  title: string,
  date: CalendarDate,
  start: string,
  end: string | null,
  colorFamily: CalendarColorFamily,
  extras: EventExtras = {}
): CalendarEvent<DemoEventMetadata> => {
  const startTime = parseLocalTime(start);

  const endTime = end === null ? null : parseLocalTime(end);

  const startInstant = fromViewerDateTime({
    date,
    time: start,
    timeZone: DEMO_TIME_ZONE,
  });

  const endInstant =
    end === null
      ? startInstant
      : fromViewerDateTime({ date, time: end, timeZone: DEMO_TIME_ZONE });

  return {
    allDay: false,
    colorFamily,
    end: endInstant,
    endDate: date,
    endTime,
    id,
    start: startInstant,
    startDate: date,
    startTime,
    timeZone: DEMO_TIME_ZONE,
    title,
    ...extras,
  };
};

const makeAllDayEvent = (
  id: string,
  title: string,
  date: CalendarDate,
  endDate: CalendarDate,
  colorFamily: CalendarColorFamily,
  extras: EventExtras = {}
): CalendarEvent<DemoEventMetadata> => ({
  allDay: true,
  colorFamily,
  endDate,
  endTime: null,
  id,
  startDate: date,
  startTime: null,
  timeZone: DEMO_TIME_ZONE,
  title,
  ...extras,
});

export const sampleEvents: readonly CalendarEvent<DemoEventMetadata>[] = [
  makeTimedEvent(
    "ev-standup",
    "Team Standup",
    calendarDate("2026-03-09"),
    "09:00",
    "09:30",
    "turquoise",
    {
      calendarId: "cal-work",
      calendarName: "Work",
    }
  ),
  makeTimedEvent(
    "ev-design-review",
    "Design Review",
    calendarDate("2026-03-09"),
    "14:00",
    "15:30",
    "purple",
    {
      calendarId: "cal-work",
      calendarName: "Work",
      conflicts: [
        {
          dimension: "classroom",
          id: "cf-room-a",
          label: "Room A-101",
          severity: "warning",
        },
      ],
      location: "Room A-101",
      metadata: { room: "A-101" },
    }
  ),
  makeAllDayEvent(
    "ev-allhands",
    "All-hands",
    calendarDate("2026-03-10"),
    calendarDate("2026-03-11"),
    "orange",
    {
      calendarId: "cal-company",
      calendarName: "Company",
    }
  ),
  makeTimedEvent(
    "ev-1on1",
    "1:1 with Sam",
    calendarDate("2026-03-10"),
    "11:00",
    "11:30",
    "turquoise",
    {
      calendarId: "cal-personal",
      calendarName: "Personal",
    }
  ),
  makeTimedEvent(
    "ev-sprint-planning",
    "Sprint Planning",
    calendarDate("2026-03-11"),
    "10:00",
    "12:00",
    "purple",
    {
      attendees: [
        { displayName: "Sam Rivera", id: "u-sam", response: "accepted" },
        { displayName: "Jordan Lee", id: "u-jordan", response: "tentative" },
        { displayName: "Priya Nair", id: "u-priya", response: "accepted" },
      ],
      calendarId: "cal-work",
      calendarName: "Work",
      conferencingProviderId: "prov-meet",
      conflicts: [
        {
          dimension: "instructor",
          id: "cf-instructor",
          label: "Priya Nair double-booked",
          severity: "error",
        },
      ],
      description: "Plan the next two-week sprint and review capacity.",
      joinUrl: "https://meet.example.com/sprint-planning",
      location: "Room B-204",
      metadata: { project: "Atlas" },
      organizer: "Priya Nair",
      recurrenceRule: "FREQ=WEEKLY;BYDAY=WE",
    }
  ),
  makeTimedEvent(
    "ev-lunch-learn",
    "Lunch & Learn",
    calendarDate("2026-03-11"),
    "12:30",
    "13:30",
    "orange",
    {
      calendarId: "cal-work",
      calendarName: "Work",
    }
  ),
  makeTimedEvent(
    "ev-client-call",
    "Client Call",
    calendarDate("2026-03-12"),
    "15:00",
    "16:00",
    "turquoise",
    {
      access: "busy",
      available: false,
      calendarId: "cal-client",
      calendarName: "Clients",
    }
  ),
  makeTimedEvent(
    "ev-focus-block",
    "Focus Block",
    calendarDate("2026-03-12"),
    "08:00",
    "10:00",
    "purple",
    {
      calendarId: "cal-personal",
      calendarName: "Personal",
    }
  ),
  makeTimedEvent(
    "ev-retro",
    "Retro",
    calendarDate("2026-03-13"),
    "16:00",
    "17:00",
    "orange",
    {
      calendarId: "cal-work",
      calendarName: "Work",
    }
  ),
];

export const sampleCalendars: readonly CalendarRef[] = [
  { colorFamily: "turquoise", id: "cal-work", name: "Work" },
  { colorFamily: "purple", id: "cal-personal", name: "Personal" },
  { colorFamily: "orange", id: "cal-company", name: "Company" },
  { colorFamily: "turquoise", id: "cal-client", name: "Clients" },
];

export const sampleTimeZoneOptions: readonly CalendarTimeZoneOption[] = [
  { id: parseIanaTimeZone("America/New_York"), label: "New York" },
  { id: parseIanaTimeZone("America/Los_Angeles"), label: "Los Angeles" },
  { id: parseIanaTimeZone("Europe/London"), label: "London" },
  { id: parseIanaTimeZone("Europe/Berlin"), label: "Berlin" },
  { id: parseIanaTimeZone("Asia/Tokyo"), label: "Tokyo" },
  { id: parseIanaTimeZone("Australia/Sydney"), label: "Sydney" },
];

export const samplePeople: readonly CalendarResourceOption[] = [
  { id: "u-sam", label: "Sam Rivera" },
  { id: "u-jordan", label: "Jordan Lee" },
  { id: "u-priya", label: "Priya Nair" },
];

export const sampleLocations: readonly CalendarResourceOption[] = [
  { id: "loc-a101", label: "Room A-101" },
  { id: "loc-b204", label: "Room B-204" },
];

export const sampleProviders: readonly CalendarResourceOption[] = [
  { id: "prov-meet", label: "Meet" },
  { id: "prov-zoom", label: "Zoom" },
];

export const sampleWorldClockIds: readonly IanaTimeZone[] = [
  parseIanaTimeZone("America/New_York"),
  parseIanaTimeZone("Europe/London"),
  parseIanaTimeZone("Asia/Tokyo"),
];

const AVAILABILITY_DATES: readonly CalendarDate[] = [
  calendarDate("2026-03-11"),
  calendarDate("2026-03-13"),
  calendarDate("2026-03-14"),
];

const AVAILABILITY_HOURS: readonly number[] = [
  8, 9, 10, 11, 12, 13, 14, 15, 16, 17,
];

const formatHour = (hour: number): string =>
  `${String(hour).padStart(2, "0")}:00`;

const makeAvailabilityCells = (): readonly CalendarAvailabilityCell[] =>
  AVAILABILITY_DATES.flatMap((date) =>
    AVAILABILITY_HOURS.map((hour): CalendarAvailabilityCell => {
      const startLocal = formatHour(hour);
      const endLocal = formatHour(hour + 1);

      return {
        available: hour !== 12 && hour < 16,
        date,
        end: fromViewerDateTime({
          date,
          time: endLocal,
          timeZone: DEMO_TIME_ZONE,
        }),
        endTime: parseLocalTime(endLocal),
        start: fromViewerDateTime({
          date,
          time: startLocal,
          timeZone: DEMO_TIME_ZONE,
        }),
        startTime: parseLocalTime(startLocal),
      };
    })
  );

export const sampleAvailabilityCells: readonly CalendarAvailabilityCell[] =
  makeAvailabilityCells();

export const DemoSection = (props: {
  readonly title: string;
  readonly hint?: string;
  readonly children: ReactNode;
}) => (
  <section className="demo-section">
    <h2>{props.title}</h2>
    {props.hint !== undefined && <p className="demo-hint">{props.hint}</p>}
    {props.children}
  </section>
);

export const SegmentedControl = <T extends string | number>(props: {
  readonly label: string;
  readonly options: readonly SegmentOption<T>[];
  readonly value: T;
  readonly onChange: (value: T) => void;
}) => (
  <div className="demo-control-group" role="group" aria-label={props.label}>
    <span className="demo-control-label">{props.label}</span>
    <div className="demo-segmented">
      {props.options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === props.value}
          onClick={() => {
            props.onChange(option.value);
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  </div>
);

const App = () => {
  const [theme, setTheme] = useState<ThemeChoice>("light");

  const [direction, setDirection] = useState<CalendarDirection>("ltr");

  const [screen, setScreen] = useState<ScreenId>("week");

  const ScreenView = SCREEN_VIEWS[screen];

  useEffect(() => {
    const root = document.documentElement;

    if (theme === "system") {
      delete root.dataset.theme;
    } else {
      root.dataset.theme = theme;
    }

    root.dir = direction;
  }, [theme, direction]);

  return (
    <CalendarProvider timeZone={DEMO_TIME_ZONE}>
      <CalendarLocalizationProvider
        direction={direction}
        locale={DEMO_LOCALE}
        onMissingTranslation={demoOnMissingTranslation}
        t={demoTranslate}
      >
        <div className="demo-app">
          <header className="demo-header">
            <div>
              <h1 className="demo-title">@gears-frontx/calendar-kit</h1>
              <p className="demo-subtitle">
                Installed-package demo — every import resolves through the
                package exports to dist/.
              </p>
            </div>
            <div className="demo-controls">
              <SegmentedControl
                label="Theme"
                options={THEME_OPTIONS}
                value={theme}
                onChange={setTheme}
              />
              <SegmentedControl
                label="Direction"
                options={DIRECTION_OPTIONS}
                value={direction}
                onChange={setDirection}
              />
            </div>
          </header>

          <nav className="demo-nav" aria-label="Demo screens">
            {SCREENS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                aria-current={entry.id === screen ? "page" : undefined}
                onClick={() => {
                  setScreen(entry.id);
                }}
              >
                {entry.label}
              </button>
            ))}
          </nav>

          <Suspense fallback={<p className="demo-hint">Loading screen…</p>}>
            <div className="demo-screen">
              <ScreenView direction={direction} />
            </div>
          </Suspense>
        </div>
      </CalendarLocalizationProvider>
    </CalendarProvider>
  );
};

const container = document.querySelector("#root");

if (container === null) {
  throw new Error("Root element #root is missing");
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
);
