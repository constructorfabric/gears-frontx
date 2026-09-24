import { fireEvent, render, waitFor, within } from "@testing-library/react";
import type { RunOptions } from "axe-core";
import { expect, describe, it } from "vitest";
import { axe } from "vitest-axe";
import * as axeMatchers from "vitest-axe/matchers";
import "vitest-axe/extend-expect";

import { UTC } from "../src/__test-utils__/fixtures";
import { createShadowHost } from "../src/__test-utils__/setup";
import {
  calendarDate,
  parseIanaTimeZone,
  parseLocalTime,
  utcInstant,
} from "../src/core/model";
import type {
  CalendarCell,
  CalendarConflict,
  CalendarEvent,
  CalendarGridColumn,
  CalendarGridRow,
  CalendarAvailabilityCell,
  CalendarRef,
  CreateEventDraft,
  CreateEventResult,
} from "../src/core/model";
import { englishTranslate as t } from "../src/i18n/english";
import { AgendaView } from "../src/ui/agenda-view/public";
import type { AgendaViewProps } from "../src/ui/agenda-view/public";
import { AvailabilityGrid } from "../src/ui/availability-grid/public";
import type { AvailabilityGridProps } from "../src/ui/availability-grid/public";
import { CalendarList } from "../src/ui/calendar-list/public";
import type { CalendarListProps } from "../src/ui/calendar-list/public";
import { CalendarSidePanel } from "../src/ui/calendar-side-panel/public";
import type { CalendarSidePanelProps } from "../src/ui/calendar-side-panel/public";
import { CalendarToolbar } from "../src/ui/calendar-toolbar/public";
import type { CalendarToolbarProps } from "../src/ui/calendar-toolbar/public";
import { ConflictIndicator } from "../src/ui/conflict-indicator/public";
import type { ConflictIndicatorProps } from "../src/ui/conflict-indicator/public";
import { CreateEventPopover } from "../src/ui/create-event/public";
import type { CreateEventPopoverProps } from "../src/ui/create-event/public";
import { DayGrid } from "../src/ui/day-grid/public";
import type { DayGridProps } from "../src/ui/day-grid/public";
import { EventCard } from "../src/ui/event-card/public";
import type { EventCardProps } from "../src/ui/event-card/public";
import { EventDetailPanel } from "../src/ui/event-detail-panel/public";
import type { EventDetailPanelProps } from "../src/ui/event-detail-panel/public";
import { CalendarGrid } from "../src/ui/grid/public";
import type { CalendarGridProps } from "../src/ui/grid/public";
import { MonthGrid } from "../src/ui/month-grid/public";
import type { MonthGridProps } from "../src/ui/month-grid/public";
import { MonthNavigator } from "../src/ui/month-navigator/public";
import type { MonthNavigatorProps } from "../src/ui/month-navigator/public";
import { SearchResults } from "../src/ui/search-results/public";
import type { SearchResultsProps } from "../src/ui/search-results/public";
import { TimeZoneList } from "../src/ui/time-zone-list/public";
import type { TimeZoneListProps } from "../src/ui/time-zone-list/public";
import { WeekGrid } from "../src/ui/week-grid/public";
import type { WeekGridProps } from "../src/ui/week-grid/public";
import { WorldClocks } from "../src/ui/world-clocks/public";
import type { WorldClocksProps } from "../src/ui/world-clocks/public";

const assert = expect;

expect.extend(axeMatchers);

// jsdom lacks getAnimations, which Base UI's ScrollArea calls.
const htmlElementConstructor = globalThis.HTMLElement;

if (!Object.hasOwn(htmlElementConstructor.prototype, "getAnimations")) {
  Object.defineProperty(htmlElementConstructor.prototype, "getAnimations", {
    configurable: true,
    value: () => [],
  });
}

const DATE = calendarDate("2026-08-24");

const WCAG_AA_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] as const;

const AXE_OPTIONS = {
  // jsdom cannot measure text contrast.
  rules: {
    "color-contrast": { enabled: false },
  },
  runOnly: {
    type: "tag",
    values: [...WCAG_AA_TAGS],
  },
} satisfies RunOptions;

const pendingSubmit = async (): Promise<CreateEventResult> => {
  await Promise.race([]);

  throw new Error("unreachable");
};

const failingSubmit = async (): Promise<CreateEventResult> =>
  await Promise.resolve({
    error: { kind: "form", message: "Cannot save event" },
  });

const CONFLICT: CalendarConflict = {
  dimension: "classroom",
  id: "conflict-1",
  label: "Room B12",
  message: "Double-booked with Biology",
  severity: "warning",
};

const EVENT = {
  allDay: false,
  available: true,
  colorFamily: "purple",
  conflicts: [CONFLICT],
  end: utcInstant("2026-08-24T10:00:00.000Z"),
  endDate: DATE,
  endTime: parseLocalTime("10:00"),
  id: "event-1",
  start: utcInstant("2026-08-24T09:00:00.000Z"),
  startDate: DATE,
  startTime: parseLocalTime("09:00"),
  timeZone: UTC,
  title: "Chemistry",
} satisfies CalendarEvent;

const UNAVAILABLE_EVENT = {
  ...EVENT,
  available: false,
  id: "event-unavailable",
} satisfies CalendarEvent;

const BUSY_EVENT = {
  ...EVENT,
  access: "busy",
  id: "event-busy",
} satisfies CalendarEvent;

const FIRST_CELL: CalendarCell = {
  date: DATE,
  end: utcInstant("2026-08-24T10:00:00.000Z"),
  endTime: parseLocalTime("10:00"),
  start: utcInstant("2026-08-24T09:00:00.000Z"),
  startTime: parseLocalTime("09:00"),
};

const SECOND_CELL: CalendarCell = {
  ...FIRST_CELL,
  end: utcInstant("2026-08-24T11:00:00.000Z"),
  endTime: parseLocalTime("11:00"),
  start: utcInstant("2026-08-24T10:00:00.000Z"),
  startTime: parseLocalTime("10:00"),
};

const GRID_COLUMNS: readonly CalendarGridColumn[] = [
  { key: "time", label: "Time" },
  { key: "monday", label: "Monday" },
];

const GRID_ROWS: readonly CalendarGridRow[] = [
  { cells: [FIRST_CELL, SECOND_CELL], key: "morning" },
];

const expectNoAxeViolations = async (element: HTMLElement): Promise<void> => {
  const results = await axe(element, AXE_OPTIONS);

  assert(results.violations).toHaveLength(0);
};

const weekProps = (overrides: Partial<WeekGridProps> = {}): WeekGridProps => ({
  date: DATE,
  direction: "ltr",
  events: [],
  locale: "en-US",
  t,
  timeZone: UTC,
  visibleDays: 5,
  ...overrides,
});

const gridProps = (
  overrides: Partial<CalendarGridProps> = {}
): CalendarGridProps => ({
  columns: GRID_COLUMNS,
  direction: "ltr",
  getCellKey: (cell) => `${cell.date}:${cell.startTime}`,
  getCellLabel: (cell) => `${cell.date} ${cell.startTime}`,
  renderCell: (context) => <span>{context.label}</span>,
  rows: GRID_ROWS,
  t,
  ...overrides,
});

const cardProps = (
  overrides: Partial<EventCardProps> = {}
): EventCardProps => ({
  direction: "ltr",
  event: EVENT,
  locale: "en-US",
  t,
  timeZone: UTC,
  ...overrides,
});

const panelProps = (
  overrides: Partial<EventDetailPanelProps> = {}
): EventDetailPanelProps => ({
  direction: "ltr",
  event: EVENT,
  locale: "en-US",
  onClose: () => {},
  open: true,
  t,
  timeZone: UTC,
  ...overrides,
});

const AVAILABILITY_CELLS: readonly CalendarAvailabilityCell[] = [
  { ...FIRST_CELL, available: true },
  { ...SECOND_CELL, available: false },
];

const CALENDARS: readonly CalendarRef[] = [
  { colorFamily: "purple", id: "calendar-1", name: "Teaching" },
  { colorFamily: "orange", id: "calendar-2", name: "Exams" },
];

const CREATE_DRAFT: CreateEventDraft = {
  allDay: false,
  calendarId: "calendar-1",
  endDate: DATE,
  endTime: parseLocalTime("10:00"),
  startDate: DATE,
  startTime: parseLocalTime("09:00"),
  timeZone: UTC,
  title: "Planning session",
};

const dayProps = (overrides: Partial<DayGridProps> = {}): DayGridProps => ({
  date: DATE,
  direction: "ltr",
  events: [],
  locale: "en-US",
  t,
  timeZone: UTC,
  ...overrides,
});

const monthProps = (
  overrides: Partial<MonthGridProps> = {}
): MonthGridProps => ({
  date: DATE,
  direction: "ltr",
  events: [],
  locale: "en-US",
  t,
  timeZone: UTC,
  ...overrides,
});

const agendaProps = (
  overrides: Partial<AgendaViewProps> = {}
): AgendaViewProps => ({
  date: DATE,
  direction: "ltr",
  events: [],
  locale: "en-US",
  t,
  timeZone: UTC,
  ...overrides,
});

const toolbarProps = (
  overrides: Partial<CalendarToolbarProps> = {}
): CalendarToolbarProps => ({
  currentDate: DATE,
  direction: "ltr",
  locale: "en-US",
  onNext: () => {},
  onPrevious: () => {},
  onToday: () => {},
  onViewChange: () => {},
  t,
  ...overrides,
});

const createEventProps = (
  overrides: Partial<CreateEventPopoverProps> = {}
): CreateEventPopoverProps => ({
  calendars: CALENDARS,
  conferencingProviders: [{ id: "meet", label: "Constructor Meet" }],
  defaultDraft: CREATE_DRAFT,
  defaultOpen: true,
  direction: "ltr",
  locale: "en-US",
  locations: [{ id: "room-1", label: "Science Hall" }],
  onCancel: () => {},
  onSubmit: () => {},
  people: [{ id: "person-1", label: "Ada Lovelace" }],
  t,
  timeZone: UTC,
  ...overrides,
});

const monthNavigatorProps = (
  overrides: Partial<MonthNavigatorProps> = {}
): MonthNavigatorProps => ({
  direction: "ltr",
  events: [EVENT],
  locale: "en-US",
  onSelectDate: () => {},
  t,
  timeZone: UTC,
  ...overrides,
});

const timeZoneListProps = (
  overrides: Partial<TimeZoneListProps> = {}
): TimeZoneListProps => ({
  direction: "ltr",
  onSelectionChange: () => {},
  options: [
    { id: parseIanaTimeZone("Europe/London"), label: "London" },
    { id: parseIanaTimeZone("Europe/Berlin"), label: "Berlin" },
  ],
  referenceInstant: utcInstant("2026-08-24T12:00:00.000Z"),
  t,
  ...overrides,
});

const worldClocksProps = (
  overrides: Partial<WorldClocksProps> = {}
): WorldClocksProps => ({
  availableTimeZoneIds: [
    parseIanaTimeZone("Europe/Berlin"),
    parseIanaTimeZone("Asia/Singapore"),
  ],
  direction: "ltr",
  now: utcInstant("2026-08-24T12:00:00.000Z"),
  onChange: () => {},
  t,
  timeZoneIds: [parseIanaTimeZone("Europe/Berlin")],
  ...overrides,
});

const calendarListProps = (
  overrides: Partial<CalendarListProps> = {}
): CalendarListProps => ({
  calendars: CALENDARS,
  direction: "ltr",
  hiddenCalendarIds: [],
  onHiddenCalendarIdsChange: () => {},
  t,
  ...overrides,
});

const searchResultsProps = (
  overrides: Partial<SearchResultsProps> = {}
): SearchResultsProps => ({
  direction: "ltr",
  events: [EVENT],
  locale: "en-US",
  now: utcInstant("2026-08-24T08:00:00.000Z"),
  onDismiss: () => {},
  onReveal: () => {},
  query: "Chemistry",
  t,
  timeZone: UTC,
  ...overrides,
});

const availabilityProps = (
  overrides: Partial<AvailabilityGridProps> = {}
): AvailabilityGridProps => ({
  cells: AVAILABILITY_CELLS,
  date: DATE,
  direction: "ltr",
  locale: "en-US",
  renderCell: (context) => <span>{context.label}</span>,
  t,
  timeZone: UTC,
  ...overrides,
});

const sidePanelProps = (
  overrides: Partial<CalendarSidePanelProps> = {}
): CalendarSidePanelProps => ({
  calendars: CALENDARS,
  direction: "ltr",
  events: [EVENT],
  hiddenCalendarIds: [],
  id: "calendar-side-panel",
  locale: "en-US",
  onClose: () => {},
  onHiddenCalendarIdsChange: () => {},
  onRevealEvent: () => {},
  onSelectedTimeZoneIdChange: () => {},
  onWorldClockTimeZoneIdsChange: () => {},
  open: true,
  selectedDate: DATE,
  selectedTimeZoneId: null,
  t,
  timeZone: UTC,
  worldClockTimeZoneIds: [],
  ...overrides,
});

describe("integrated WCAG 2.1 AA gate: week-grid & event surfaces", () => {
  it("checks WeekGrid with events and conflicts", async () => {
    const { container } = render(
      <WeekGrid {...weekProps({ events: [EVENT] })} />
    );

    assert(within(container).getByRole("grid")).toBeInTheDocument();
    assert(
      within(container).getByRole("button", { name: /Chemistry/u })
    ).toBeInTheDocument();
    assert(within(container).getByText("Room B12")).toBeInTheDocument();

    await expectNoAxeViolations(container);
  });

  it("checks WeekGrid renders the ordinary grid without alerts", async () => {
    const { container } = render(
      <WeekGrid
        {...weekProps({
          events: [EVENT],
        })}
      />
    );

    assert(within(container).getByRole("grid")).toBeInTheDocument();
    assert(within(container).queryByRole("alert")).not.toBeInTheDocument();

    await expectNoAxeViolations(container);
  });

  it("checks WeekGrid empty events", async () => {
    const { container } = render(<WeekGrid {...weekProps({ events: [] })} />);

    assert(within(container).getByRole("grid")).toBeInTheDocument();

    await expectNoAxeViolations(container);
  });

  it("checks WeekGrid read-only mode", async () => {
    const { container } = render(
      <WeekGrid
        {...weekProps({ events: [EVENT], interactionMode: "read-only" })}
      />
    );

    assert(within(container).getByRole("grid")).toBeInTheDocument();
    assert(
      within(container).getByRole("button", { name: /Chemistry/u })
    ).toBeInTheDocument();

    await expectNoAxeViolations(container);
  });

  it("checks WeekGrid quick-create mode", async () => {
    const { container } = render(
      <WeekGrid
        {...weekProps({ events: [EVENT], interactionMode: "quick-create" })}
      />
    );

    assert(within(container).getByRole("grid")).toBeInTheDocument();
    assert(
      within(container).getByRole("button", { name: /Chemistry/u })
    ).toBeInTheDocument();

    await expectNoAxeViolations(container);
  });

  it("checks CalendarGrid semantics", async () => {
    const rendered = render(<CalendarGrid {...gridProps()} />);
    const grid = within(rendered.container).getByRole("grid");

    assert(grid).toBeInTheDocument();
    assert(within(grid).getAllByRole("gridcell")).toHaveLength(2);
    assert(grid.querySelectorAll('[tabindex="0"]')).toHaveLength(1);
    assert(grid).not.toHaveAttribute("aria-busy", "true");

    await expectNoAxeViolations(rendered.container);
  });

  it("checks EventCard in its default state", async () => {
    const { container } = render(<EventCard {...cardProps()} />);

    assert(
      within(container).getByRole("button", { name: /Chemistry/u })
    ).toBeInTheDocument();

    await expectNoAxeViolations(container);
  });

  it("checks EventCard selected state", async () => {
    const { container } = render(
      <EventCard {...cardProps({ selected: true })} />
    );

    assert(
      within(container).getByRole("button", { name: /Chemistry/u })
    ).toHaveAttribute("aria-pressed", "true");

    await expectNoAxeViolations(container);
  });

  it("checks EventCard unavailable state", async () => {
    const { container } = render(
      <EventCard
        {...cardProps({ available: false, event: UNAVAILABLE_EVENT })}
      />
    );

    assert(
      within(container).getByRole("button", { name: /Chemistry/u })
    ).toHaveAttribute("aria-disabled", "true");

    await expectNoAxeViolations(container);
  });

  it("checks EventCard busy-access state", async () => {
    const { container } = render(
      <EventCard {...cardProps({ event: BUSY_EVENT })} />
    );

    assert(
      within(container).getByRole("button", { name: /Chemistry/u })
    ).toHaveAttribute("aria-disabled", "true");

    await expectNoAxeViolations(container);
  });

  it("checks ConflictIndicator list state", async () => {
    const props: ConflictIndicatorProps = {
      conflicts: [CONFLICT],
      direction: "ltr",
      t,
    };

    const { container } = render(<ConflictIndicator {...props} />);

    assert(within(container).getByRole("list")).toBeInTheDocument();
    assert(within(container).getByRole("listitem")).toHaveTextContent(
      "Room B12"
    );

    await expectNoAxeViolations(container);
  });

  it("checks ConflictIndicator compact state", async () => {
    const props: ConflictIndicatorProps = {
      compact: true,
      conflicts: [CONFLICT],
      direction: "ltr",
      t,
    };

    const { container } = render(<ConflictIndicator {...props} />);

    assert(
      within(container).getByRole("img", { name: "classroom: Room B12" })
    ).toBeInTheDocument();

    await expectNoAxeViolations(container);
  });

  it("checks EventDetailPanel with conflicts inside an attached shadow root", async () => {
    const { host, root } = createShadowHost();
    const container = document.createElement("div");
    root.append(container);

    try {
      render(<EventDetailPanel {...panelProps({ container })} />, {
        container,
      });
      const dialog = within(container).getByRole("dialog", {
        name: "Chemistry",
      });

      assert(dialog.getRootNode()).toBe(root);
      assert(within(dialog).getByText("Room B12")).toBeInTheDocument();
      await expectNoAxeViolations(container);
    } finally {
      host.remove();
    }
  });
});

describe("integrated WCAG 2.1 AA gate: panels & navigation surfaces", () => {
  it("checks CalendarGrid empty rows", async () => {
    const rendered = render(<CalendarGrid {...gridProps({ rows: [] })} />);

    assert(within(rendered.container).getByRole("grid")).toBeInTheDocument();
    assert(
      within(rendered.container).queryByRole("alert")
    ).not.toBeInTheDocument();
    await expectNoAxeViolations(rendered.container);
  });

  it("checks DayGrid normal and empty events", async () => {
    const rendered = render(<DayGrid {...dayProps({ events: [EVENT] })} />);

    assert(within(rendered.container).getByRole("grid")).toBeInTheDocument();
    await expectNoAxeViolations(rendered.container);

    rendered.rerender(<DayGrid {...dayProps({ events: [] })} />);
    assert(within(rendered.container).getByRole("grid")).toBeInTheDocument();
    assert(
      within(rendered.container).queryByRole("alert")
    ).not.toBeInTheDocument();
    await expectNoAxeViolations(rendered.container);
  });

  it("checks MonthGrid normal and empty events", async () => {
    const rendered = render(<MonthGrid {...monthProps({ events: [EVENT] })} />);

    assert(within(rendered.container).getByRole("grid")).toBeInTheDocument();
    await expectNoAxeViolations(rendered.container);

    rendered.rerender(<MonthGrid {...monthProps({ events: [] })} />);
    assert(within(rendered.container).getByRole("grid")).toBeInTheDocument();
    assert(
      within(rendered.container).queryByRole("alert")
    ).not.toBeInTheDocument();
    await expectNoAxeViolations(rendered.container);
  });

  it("checks AgendaView normal and empty events", async () => {
    const rendered = render(
      <AgendaView {...agendaProps({ events: [EVENT] })} />
    );

    assert(
      within(rendered.container).getByRole("region", {
        name: t("calendar.agenda.viewName"),
      })
    ).toBeInTheDocument();
    await expectNoAxeViolations(rendered.container);

    rendered.rerender(<AgendaView {...agendaProps({ events: [] })} />);
    assert(
      within(rendered.container).getByRole("region", {
        name: t("calendar.agenda.viewName"),
      })
    ).toBeInTheDocument();
    assert(
      within(rendered.container).queryByRole("alert")
    ).not.toBeInTheDocument();
    await expectNoAxeViolations(rendered.container);
  });

  it("checks CalendarToolbar default and alternate active-view states", async () => {
    const rendered = render(
      <CalendarToolbar {...toolbarProps({ activeView: "week" })} />
    );

    assert(
      within(rendered.container).getByRole("radiogroup")
    ).toBeInTheDocument();
    assert(within(rendered.container).getAllByRole("radio")).toHaveLength(4);
    await expectNoAxeViolations(rendered.container);

    rendered.rerender(
      <CalendarToolbar {...toolbarProps({ activeView: "agenda" })} />
    );

    assert(
      within(rendered.container).getByRole("radio", {
        name: t("calendar.toolbar.view.agenda"),
      })
    ).toHaveAttribute("aria-checked", "true");
    await expectNoAxeViolations(rendered.container);
  });

  it("checks CreateEventPopover compact and expanded sheet overlays", async () => {
    const rendered = render(<CreateEventPopover {...createEventProps()} />);

    assert(
      within(rendered.container).getByRole("dialog", {
        name: t("calendar.create_event.create_dialog"),
      })
    ).toBeInTheDocument();
    await expectNoAxeViolations(rendered.container);

    rendered.rerender(
      <CreateEventPopover {...createEventProps({ expanded: true })} />
    );

    assert(
      within(rendered.container).getByRole("dialog", {
        name: t("calendar.create_event.create_dialog"),
      })
    ).toBeInTheDocument();
    await expectNoAxeViolations(rendered.container);

    rendered.unmount();
    const loading = render(
      <CreateEventPopover {...createEventProps({ onSubmit: pendingSubmit })} />
    );

    fireEvent.click(
      within(loading.container).getByRole("button", {
        name: t("calendar.create_event.save"),
      })
    );
    await waitFor(() => {
      assert(
        within(loading.container).getByRole("button", {
          name: t("calendar.create_event.saving"),
        })
      ).toBeInTheDocument();
    });
    await expectNoAxeViolations(loading.container);

    loading.unmount();
    const error = render(
      <CreateEventPopover {...createEventProps({ onSubmit: failingSubmit })} />
    );

    fireEvent.click(
      within(error.container).getByRole("button", {
        name: t("calendar.create_event.save"),
      })
    );
    await waitFor(() => {
      assert(
        within(error.container).getByText("Cannot save event")
      ).toBeInTheDocument();
    });
    await expectNoAxeViolations(error.container);

    error.unmount();

    const empty = render(
      <CreateEventPopover
        {...createEventProps({
          calendars: [],
          conferencingProviders: [],
          locations: [],
          people: [],
        })}
      />
    );

    assert(
      within(empty.container).getByRole("dialog", {
        name: t("calendar.create_event.create_dialog"),
      })
    ).toBeInTheDocument();
    await expectNoAxeViolations(empty.container);
  });

  it("checks MonthNavigator normal and no-event states", async () => {
    const rendered = render(<MonthNavigator {...monthNavigatorProps()} />);

    assert(within(rendered.container).getByRole("grid")).toBeInTheDocument();
    assert(
      within(rendered.container).getAllByRole("gridcell")
    ).not.toHaveLength(0);
    await expectNoAxeViolations(rendered.container);

    rendered.rerender(
      <MonthNavigator {...monthNavigatorProps({ events: [] })} />
    );

    assert(within(rendered.container).getByRole("grid")).toBeInTheDocument();
    await expectNoAxeViolations(rendered.container);
  });

  it("checks TimeZoneList normal and empty states", async () => {
    const rendered = render(<TimeZoneList {...timeZoneListProps()} />);

    assert(
      within(rendered.container).getByRole("region", {
        name: t("calendar.panel.timeZones"),
      })
    ).toBeInTheDocument();
    assert(within(rendered.container).getAllByRole("button")).not.toHaveLength(
      0
    );
    await expectNoAxeViolations(rendered.container);

    rendered.rerender(<TimeZoneList {...timeZoneListProps({ options: [] })} />);
    assert(
      within(rendered.container).getByRole("region", {
        name: t("calendar.panel.timeZones"),
      })
    ).toBeInTheDocument();
    assert(within(rendered.container).queryAllByRole("button")).toHaveLength(0);
    await expectNoAxeViolations(rendered.container);
  });

  it("checks WorldClocks normal and empty states", async () => {
    const rendered = render(<WorldClocks {...worldClocksProps()} />);

    assert(
      within(rendered.container).getByRole("region", {
        name: t("calendar.panel.worldClocks"),
      })
    ).toBeInTheDocument();
    assert(within(rendered.container).getByText("Berlin")).toBeInTheDocument();
    await expectNoAxeViolations(rendered.container);

    rendered.rerender(
      <WorldClocks {...worldClocksProps({ timeZoneIds: [] })} />
    );

    assert(
      within(rendered.container).getByRole("region", {
        name: t("calendar.panel.worldClocks"),
      })
    ).toBeInTheDocument();
    assert(
      within(rendered.container).queryByText("Berlin")
    ).not.toBeInTheDocument();
    await expectNoAxeViolations(rendered.container);
  });

  it("checks SearchResults normal and no-match states", async () => {
    const rendered = render(<SearchResults {...searchResultsProps()} />);

    assert(
      within(rendered.container).getByRole("button", { name: /Chemistry/u })
    ).toBeInTheDocument();
    await expectNoAxeViolations(rendered.container);

    rendered.rerender(
      <SearchResults {...searchResultsProps({ query: "No match" })} />
    );
    await waitFor(() => {
      assert(
        within(rendered.container).queryByRole("button", { name: /Chemistry/u })
      ).not.toBeInTheDocument();
    });
    assert(
      within(rendered.container).queryByRole("alert")
    ).not.toBeInTheDocument();
    await expectNoAxeViolations(rendered.container);
  });

  it("checks AvailabilityGrid normal and zero cells", async () => {
    const rendered = render(<AvailabilityGrid {...availabilityProps()} />);

    assert(within(rendered.container).getByRole("grid")).toBeInTheDocument();
    assert(within(rendered.container).getAllByRole("gridcell")).toHaveLength(2);
    await expectNoAxeViolations(rendered.container);

    rendered.rerender(
      <AvailabilityGrid {...availabilityProps({ cells: [] })} />
    );

    assert(within(rendered.container).getByRole("grid")).toBeInTheDocument();
    assert(within(rendered.container).queryAllByRole("gridcell")).toHaveLength(
      0
    );

    assert(
      within(rendered.container).queryByRole("alert")
    ).not.toBeInTheDocument();
    await expectNoAxeViolations(rendered.container);
  });

  it("checks CalendarList normal and empty states", async () => {
    const rendered = render(<CalendarList {...calendarListProps()} />);

    assert(
      within(rendered.container).getByRole("region", {
        name: t("calendar.panel.calendars"),
      })
    ).toBeInTheDocument();
    assert(within(rendered.container).getAllByRole("checkbox")).toHaveLength(2);
    await expectNoAxeViolations(rendered.container);

    rendered.rerender(
      <CalendarList {...calendarListProps({ calendars: [] })} />
    );

    assert(
      within(rendered.container).getByRole("region", {
        name: t("calendar.panel.calendars"),
      })
    ).toBeInTheDocument();
    assert(within(rendered.container).queryAllByRole("checkbox")).toHaveLength(
      0
    );
    await expectNoAxeViolations(rendered.container);
  });

  it("checks CalendarSidePanel open and collapsed states", async () => {
    const rendered = render(<CalendarSidePanel {...sidePanelProps()} />);

    assert(
      within(rendered.container).getByRole("complementary", {
        name: t("calendar.panel.label"),
      })
    ).toBeInTheDocument();
    assert(
      within(rendered.container).getByRole("button", {
        name: t("calendar.panel.collapse"),
      })
    ).toBeInTheDocument();
    await expectNoAxeViolations(rendered.container);

    rendered.rerender(
      <CalendarSidePanel {...sidePanelProps({ open: false })} />
    );

    assert(
      within(rendered.container).getByRole("button", {
        name: t("calendar.panel.expand"),
      })
    ).toBeInTheDocument();
    await expectNoAxeViolations(rendered.container);
  });
});
