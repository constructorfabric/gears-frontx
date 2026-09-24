import {
  fireEvent,
  render,
  renderHook,
  screen,
  within,
} from "@testing-library/react";
import { describe, expect as assert, it, vi } from "vitest";

import {
  instant,
  timedEvent as fixtureTimedEvent,
  englishMessage,
  UTC,
} from "../../../__test-utils__/fixtures";
import type {
  CalendarCell,
  CalendarDate,
  CalendarEvent,
  CalendarEventRenderContext,
} from "../../../core/model";
import { calendarDate, parseLocalTime } from "../../../core/model";
import type { CalendarTranslate } from "../../../i18n/calendar-localization";
import { englishTranslate as t } from "../../../i18n/english";
import { useMonthGridController } from "../../../react/public";
import { DayGrid } from "../../day-grid/day-grid";
import { MonthGrid } from "../month-grid";
import type { MonthGridProps } from "../month-grid";
import {
  buildLiveAnnouncement,
  MONTH_ANNOUNCEMENT_KIND,
} from "../month-grid-format";

import eventCardStyles from "../../event-card/event-card.module.css";
import tagStyles from "../../primitives/tag/tag.module.css";
import styles from "../month-grid.module.css";
import monthGridStyles from "../month-grid.module.css?raw";

type TestEvent = CalendarEvent;

const announcementMessages = englishMessage("en-US");

const eventFixture = ({
  id,
  title = id,
  colorFamily = "turquoise",
  start,
  end,
  allDay = false,
  available,
}: {
  readonly id: string;
  readonly title?: string;
  readonly colorFamily?: CalendarEvent["colorFamily"];
  readonly start: ReturnType<typeof instant>;
  readonly end: ReturnType<typeof instant>;
  readonly allDay?: boolean;
  readonly available?: boolean;
}): TestEvent => {
  const common = {
    attendees: [],
    available,
    calendarId: null,
    colorFamily,
    conferencingProviderId: null,
    description: "",
    id,
    location: null,
    recurrenceRule: null,
    timeZone: UTC,
    title,
  };

  if (allDay) {
    return {
      ...common,
      allDay: true,
      endDate: calendarDate(end.slice(0, 10)),
      endTime: null,
      startDate: calendarDate(start.slice(0, 10)),
      startTime: null,
    };
  }

  return fixtureTimedEvent({
    available,
    colorFamily,
    end,
    endDate: calendarDate(end.slice(0, 10)),
    endTime: parseLocalTime(end.slice(11, 16)),
    id,
    start,
    startDate: calendarDate(start.slice(0, 10)),
    startTime: parseLocalTime(start.slice(11, 16)),
    title,
  });
};

const renderMonth = (props: Partial<MonthGridProps> = {}) => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2025-09-10T12:00:00.000Z"));

  return render(
    <MonthGrid
      date={calendarDate("2025-09-01")}
      events={[]}
      locale="en-US"
      timeZone={UTC}
      t={t}
      direction="ltr"
      {...props}
    />
  );
};

(() => {
  const style = document.createElement("style");
  style.textContent = monthGridStyles.replaceAll(
    ".eventSlot",
    `.${styles.eventSlot}`
  );
  document.head.append(style);
})();

const expectRenderedTimeBeforeTitle = (
  strip: HTMLElement,
  expectedTime: string,
  expectedTitle: string
): void => {
  const time = within(strip).getByText(expectedTime);
  const timeRow = strip.querySelector<HTMLElement>(
    '[data-event-card-time="true"]'
  );
  const titleRow = strip.querySelector<HTMLElement>(
    '[data-event-card-title="true"]'
  );

  if (timeRow === null || titleRow === null) {
    throw new Error("Month strip EventCard rows are missing their data hooks");
  }

  assert(time.textContent).toBe(expectedTime);
  assert(titleRow).toHaveTextContent(expectedTitle);
  const timeOrder = Math.trunc(Number(getComputedStyle(timeRow).order || "0"));
  const titleOrder = Math.trunc(
    Number(getComputedStyle(titleRow).order || "0")
  );

  assert(timeOrder).toBeLessThan(titleOrder);
};

const expectAttribute = (
  element: Element | null,
  name: string,
  value: string
): void => {
  assert(element?.getAttribute(name)).toBe(value);
};

const monthCell = (rowIndex: number, columnIndex: number): HTMLElement => {
  const cells = within(screen.getByRole("grid")).getAllByRole("gridcell");
  const cell = cells[rowIndex * 7 + columnIndex];

  if (cell === undefined) {
    throw new Error(`Missing month grid cell at ${rowIndex}-${columnIndex}`);
  }

  return cell;
};

const monthOverflow = (hiddenCount: string): HTMLElement =>
  screen.getByRole("button", { name: `+${hiddenCount} hidden` });

const dayNumberOf = (
  rowIndex: number,
  columnIndex: number
): string | undefined => {
  const cell = monthCell(rowIndex, columnIndex);

  return within(cell).getByText(/^\p{N}+$/u).textContent ?? undefined;
};

describe(MonthGrid, () => {
  it("renders five- and six-week months at their true row counts", () => {
    const { unmount } = renderMonth({ date: calendarDate("2025-09-01") });
    assert(screen.getAllByRole("row")).toHaveLength(6);
    assert(screen.getAllByRole("row").length - 1).toBe(5);
    unmount();

    renderMonth({ date: calendarDate("2025-03-01") });
    assert(screen.getAllByRole("row")).toHaveLength(7);
    assert(screen.getAllByRole("row").length - 1).toBe(6);
  });

  it("renders seven columns, complete semantic rows, and month-relative week labels", () => {
    renderMonth({ date: calendarDate("2025-03-01") });

    const grid = screen.getByRole("grid");
    expectAttribute(grid, "aria-colcount", "8");
    expectAttribute(grid, "aria-rowcount", "7");
    assert(within(grid).getAllByRole("columnheader")).toHaveLength(8);
    assert(within(grid).getAllByRole("row")).toHaveLength(7);
    assert(within(grid).getAllByRole("rowheader")).toHaveLength(6);
    within(grid).getByText("W1");
    within(grid).getByText("W6");
    within(grid).getByRole("rowheader", { name: "Week 6" });
    assert(within(grid).getAllByRole("gridcell")).toHaveLength(42);
    within(grid).getByText("WEEKS");
  });

  it("localizes week, day, and overflow numbers for the active locale", () => {
    const date = calendarDate("2025-09-04");

    const events = Array.from({ length: 5 }, (_, index) =>
      eventFixture({
        end: instant(date, `${String(10 + index).padStart(2, "0")}:00`),
        id: `localized-overflow-${index}`,
        start: instant(date, `${String(9 + index).padStart(2, "0")}:00`),
      })
    );

    renderMonth({
      events,
      locale: "ar-EG",
      monthData: { densityCap: 2, overflowByDate: { "2025-09-04": 3 } },
      t: undefined,
    });

    const grid = screen.getByRole("grid");
    const localizedWeekNumber = new Intl.NumberFormat("ar-EG").format(1);
    const localizedDayNumber = new Intl.NumberFormat("ar-EG").format(2);
    const localizedHiddenCount = new Intl.NumberFormat("ar-EG").format(3);

    const [weekHeader] = within(grid).getAllByRole("rowheader");
    assert(weekHeader.textContent).toBe(`W${localizedWeekNumber}`);
    assert(weekHeader.getAttribute("aria-label")).toBe(
      `Week ${localizedWeekNumber}`
    );
    assert(
      within(monthCell(0, 1)).getByText(localizedDayNumber)
    ).toBeInTheDocument();
    assert(monthOverflow(localizedHiddenCount).textContent).toContain(
      `+${localizedHiddenCount} hidden`
    );
  });

  it("marks today, first-of-month, and leading/trailing date cells", () => {
    renderMonth({
      date: calendarDate("2025-09-01"),
    });

    const first = monthCell(0, 0);
    const today = monthCell(1, 2);
    const leading = monthCell(0, 0);
    const trailing = monthCell(4, 6);
    assert(first.textContent).toContain("September 1");
    assert(today).toHaveAttribute("data-today", "true");
    assert(leading.dataset.outsideMonth).toBe("false");
    assert(trailing.dataset.outsideMonth).toBe("true");
    assert(within(trailing).getByText("5")).toBeInTheDocument();
  });

  it("places timed chips with start time and row-local all-day spans", () => {
    const timed = eventFixture({
      colorFamily: "purple",
      end: instant(calendarDate("2025-09-04"), "10:00"),
      id: "timed",
      start: instant(calendarDate("2025-09-04"), "09:00"),
      title: "Timed lecture",
    });

    const span = eventFixture({
      allDay: true,
      colorFamily: "orange",
      end: instant(calendarDate("2025-09-10"), "00:00"),
      id: "span",
      start: instant(calendarDate("2025-09-04"), "00:00"),
      title: "Boundary span",
    });

    const middleSpan = eventFixture({
      allDay: true,
      end: instant(calendarDate("2025-09-10"), "00:00"),
      id: "middle-span",
      start: instant(calendarDate("2025-08-30"), "00:00"),
    });

    const singleSpan = eventFixture({
      allDay: true,
      end: instant(calendarDate("2025-09-11"), "00:00"),
      id: "single-span",
      start: instant(calendarDate("2025-09-10"), "00:00"),
    });

    renderMonth({ events: [timed, span, middleSpan, singleSpan] });

    const timedChip = screen.getByRole("button", { name: /Timed lecture/u });
    assert(timedChip.closest(`[role="presentation"]`)).not.toBeNull();
    assert(timedChip).toHaveTextContent("09:00");
    assert(timedChip.dataset.colorFamily).toBe("purple");
    fireEvent.keyDown(timedChip, { key: "Enter" });

    const spanChips = screen.getAllByRole("button", { name: /Boundary span/u });
    fireEvent.click(spanChips[0]);
    fireEvent.focus(spanChips[0]);
    fireEvent.keyDown(spanChips[0], { key: "Enter" });

    assert(spanChips).toHaveLength(2);
    assert(spanChips[0]?.getAttribute("aria-colspan")).toBe("4");
    assert(spanChips[1]?.getAttribute("aria-colspan")).toBe("2");
    assert(spanChips[0]?.dataset.continuesAfter).toBe("true");
    assert(spanChips[1]?.dataset.continuesBefore).toBe("true");
    assert(spanChips[0]?.getAttribute("style")).toContain("grid-column: 4 / 8");
    assert(spanChips[1]?.getAttribute("style")).toContain("grid-column: 1 / 3");
    const middleChips = screen.getAllByRole("button", { name: /middle-span/u });
    assert(middleChips).toHaveLength(2);
    assert(middleChips[0]?.dataset.continuesBefore).toBe("true");
    assert(middleChips[0]?.dataset.continuesAfter).toBe("true");
    const singleChip = screen.getByRole("button", { name: /single-span/u });
    assert(singleChip.dataset.continuesBefore).toBeUndefined();
    assert(singleChip.dataset.continuesAfter).toBeUndefined();
  });

  it("matches day-grid 24-hour start time for the same timed event", () => {
    const timed = eventFixture({
      end: instant(calendarDate("2025-09-04"), "10:00"),
      id: "parity",
      start: instant(calendarDate("2025-09-04"), "09:00"),
      title: "Parity lecture",
    });

    render(
      <div>
        <DayGrid
          date={calendarDate("2025-09-04")}
          events={[timed]}
          locale="en-US"
          t={t}
          direction="ltr"
          timeZone={UTC}
        />
        <MonthGrid
          date={calendarDate("2025-09-01")}
          events={[timed]}
          locale="en-US"
          t={t}
          direction="ltr"
          timeZone={UTC}
        />
      </div>
    );

    const grids = screen.getAllByRole("grid");
    const dayGrid = grids.find(
      (grid) =>
        grid.getAttribute("aria-label")?.includes("September 4") ?? false
    );
    const monthGrid = grids.find(
      (grid) => grid.getAttribute("aria-label") === "Month grid"
    );

    if (dayGrid === undefined || monthGrid === undefined) {
      throw new Error("Expected day and month grids");
    }

    const dayRegion = screen.getByRole("region", {
      name: /September 4/iu,
    });
    const dayButton = within(dayRegion).getByRole("button", {
      name: /Parity lecture/u,
    });
    const monthButton = within(monthGrid).getByRole("button", {
      name: /Parity lecture/u,
    });

    if (dayButton === undefined || monthButton === undefined) {
      throw new Error("Expected parity event in both calendar views");
    }

    const dayTime = within(dayButton)
      .getByText(/^\d{1,2}:\d{2} – \d{1,2}:\d{2}$/u)
      .textContent?.split("–")[0]
      ?.trim();
    const monthTime = within(monthButton).getByText("09:00", {
      exact: true,
    }).textContent;

    assert(monthTime).toBe(dayTime?.split("–")[0]?.trim());
    assert(monthTime).toBe("09:00");
  });

  it("renders overflow totals and announces hidden count", () => {
    const date = calendarDate("2025-09-04");

    const events = Array.from({ length: 5 }, (_, index) =>
      eventFixture({
        end: instant(date, `${String(10 + index).padStart(2, "0")}:00`),
        id: `overflow-${index}`,
        start: instant(date, `${String(9 + index).padStart(2, "0")}:00`),
        title: `Overflow ${index}`,
      })
    );

    renderMonth({
      events,
      monthData: { densityCap: 2, overflowByDate: { "2025-09-04": 3 } },
    });

    const cell = monthCell(0, 3);
    assert(
      within(cell)
        .getAllByRole("button")
        .filter(
          (button) =>
            !(button.getAttribute("aria-label")?.includes("hidden") ?? false)
        )
    ).toHaveLength(2);
    within(cell).getByText("+3 hidden");
    assert(cell.dataset.eventCount).toBe("5");
    assert(screen.getByRole("status").textContent).toContain("+3 hidden");
  });

  it("uses the translated whole phrase for a cell event count", () => {
    const date = calendarDate("2025-09-04");

    const event = eventFixture({
      end: instant(date, "10:00"),
      id: "singular-event",
      start: instant(date, "09:00"),
    });

    renderMonth({ events: [event] });

    assert(monthCell(0, 3).getAttribute("aria-label")).toContain("1 event");
  });

  it("keeps one roving tab stop, supports RTL axes, and activates chips", () => {
    const onEventSelect =
      vi.fn<
        (event: CalendarEvent, context: CalendarEventRenderContext) => void
      >();

    const event = eventFixture({
      end: instant(calendarDate("2025-09-01"), "10:00"),
      id: "focus-event",
      start: instant(calendarDate("2025-09-01"), "09:00"),
      title: "Focusable event",
    });

    renderMonth({ direction: "rtl", events: [event], onEventSelect });

    const grid = screen.getByRole("grid");
    assert(
      within(grid)
        .getAllByRole("gridcell")
        .filter((cell) => cell.getAttribute("tabindex") === "0")
    ).toHaveLength(1);
    const firstCell = monthCell(0, 0);
    fireEvent.keyDown(firstCell, { key: "ArrowRight" });
    assert(monthCell(0, 0).getAttribute("tabindex")).toBe("0");
    fireEvent.keyDown(firstCell, { key: "ArrowLeft" });
    assert(monthCell(0, 1).getAttribute("tabindex")).toBe("0");

    const eventChip = screen.getByRole("button", { name: /Focusable event/u });
    fireEvent.focus(eventChip);
    assert(eventChip.getAttribute("tabindex")).toBe("0");
    assert(monthCell(0, 0).getAttribute("tabindex")).toBe("-1");
    fireEvent.click(eventChip);
    assert(onEventSelect).toHaveBeenCalledOnce();
    const [selectedEvent, selectedContext] = onEventSelect.mock.calls[0] ?? [];
    assert(selectedEvent?.id).toBe("focus-event");
    assert(selectedContext?.event.id).toBe("focus-event");
  });

  it("exposes the ordinary grid with live focus announcements and no status shells", () => {
    const { rerender } = renderMonth({});

    assert(screen.getByRole("grid")).toBeInTheDocument();

    rerender(
      <MonthGrid
        date={calendarDate("2025-09-01")}
        events={[]}
        locale="en-US"
        timeZone={UTC}
        t={t}
        direction="ltr"
      />
    );

    assert(screen.getByRole("grid")).toBeInTheDocument();
    assert(
      screen.getByRole("status", { name: /Month view/u })
    ).toBeInTheDocument();
    assert(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("renders the ordinary grid with no alert region", () => {
    renderMonth({});

    assert(screen.getByRole("grid")).toBeInTheDocument();
    assert(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("covers range, focus, and overflow announcement branches", () => {
    const { result } = renderHook(() =>
      useMonthGridController({
        date: calendarDate("2025-09-01"),
        events: [],
        timeZone: UTC,
      })
    );

    assert(
      buildLiveAnnouncement(
        null,
        result.current.monthRange,
        result.current.rows,
        "en-US",
        UTC,
        announcementMessages
      )
    ).toBe("");

    assert(
      buildLiveAnnouncement(
        { kind: MONTH_ANNOUNCEMENT_KIND.range },
        result.current.monthRange,
        result.current.rows,
        "en-US",
        UTC,
        announcementMessages
      )
    ).toContain("Month of");

    assert(
      buildLiveAnnouncement(
        {
          date: calendarDate("2025-09-01"),
          eventCount: 2,
          kind: MONTH_ANNOUNCEMENT_KIND.focus,
        },
        result.current.monthRange,
        result.current.rows,
        "en-US",
        UTC,
        announcementMessages
      )
    ).toContain("Month view");

    assert(
      buildLiveAnnouncement(
        { hiddenCount: 3, kind: MONTH_ANNOUNCEMENT_KIND.overflow },
        result.current.monthRange,
        result.current.rows,
        "en-US",
        UTC,
        announcementMessages
      )
    ).toContain("+3 hidden");

    assert(
      buildLiveAnnouncement(
        { kind: MONTH_ANNOUNCEMENT_KIND.overflow },
        result.current.monthRange,
        result.current.rows,
        "en-US",
        UTC,
        announcementMessages
      )
    ).toContain("+0 hidden");

    assert(
      buildLiveAnnouncement(
        { kind: MONTH_ANNOUNCEMENT_KIND.focus },
        result.current.monthRange,
        result.current.rows,
        "en-US",
        UTC,
        announcementMessages
      )
    ).toContain("Month view");

    assert(
      buildLiveAnnouncement(
        {
          date: calendarDate("2025-09-01"),
          eventCount: 0,
          hiddenCount: 2,
          kind: MONTH_ANNOUNCEMENT_KIND.focus,
        },
        result.current.monthRange,
        result.current.rows,
        "en-US",
        UTC,
        announcementMessages
      )
    ).toContain("+2 hidden");
  });

  it("uses the translated hidden-count template and locale number", () => {
    const { result } = renderHook(() =>
      useMonthGridController({
        date: calendarDate("2025-09-01"),
        events: [],
        timeZone: UTC,
      })
    );

    const translated = englishMessage("ar-EG");

    const customT: CalendarTranslate = (id, values) =>
      translated(id, values).replace("hidden", "hidden items");

    assert(
      buildLiveAnnouncement(
        { hiddenCount: 3, kind: MONTH_ANNOUNCEMENT_KIND.overflow },
        result.current.monthRange,
        result.current.rows,
        "ar-EG",
        UTC,
        customT
      )
    ).toBe("+٣ hidden items");
  });

  it("supports six-week fragment boundaries and source-date labels", () => {
    const span = eventFixture({
      allDay: true,
      end: instant(calendarDate("2025-03-04"), "12:00"),
      id: "six-week-span",
      start: instant(calendarDate("2025-02-27"), "00:00"),
      title: "Six week span",
    });

    renderMonth({ date: calendarDate("2025-03-01"), events: [span] });

    const chips = screen.getAllByRole("button", { name: /Six week span/u });
    assert(chips).toHaveLength(2);
    assert(
      chips.map((chip) => chip.getAttribute("aria-rowindex"))
    ).toStrictEqual(["2", "3"]);
    assert(dayNumberOf(0, 0)).toBe("24");
    assert(dayNumberOf(5, 6)).toBe("6");
  });

  it("keeps event date segmentation stable across a viewer-day boundary", () => {
    const event = eventFixture({
      end: instant(calendarDate("2025-10-01"), "01:00"),
      id: "viewer-boundary",
      start: instant(calendarDate("2025-09-30"), "23:00"),
    });

    renderMonth({ events: [event] });

    assert(monthCell(4, 1).dataset.eventCount).toBe("1");
    assert(monthCell(4, 2).dataset.eventCount).toBe("1");
  });

  it("moves the roving tab stop when opening an empty month cell", () => {
    const onEmptyCellSelect = vi.fn<(cell: CalendarCell) => void>();
    renderMonth({
      onEmptyCellSelect,
    });

    const cell = monthCell(0, 1);
    fireEvent.click(cell);

    assert(onEmptyCellSelect).toHaveBeenCalledWith(
      assert.objectContaining({ date: calendarDate("2025-09-02") })
    );
    assert(monthCell(0, 0).getAttribute("tabindex")).toBe("-1");
    assert(cell.getAttribute("tabindex")).toBe("0");
    assert(document.activeElement).toBe(cell);
  });

  it("keeps one tab stop when a focused event becomes hidden", () => {
    const date = calendarDate("2025-09-01");

    const events = Array.from({ length: 3 }, (_, index) =>
      eventFixture({
        end: instant(date, `${String(10 + index).padStart(2, "0")}:00`),
        id: `focused-month-${index}`,
        start: instant(date, `${String(9 + index).padStart(2, "0")}:00`),
      })
    );

    const extraEvent = eventFixture({
      end: instant(date, "13:00"),
      id: "focused-month-extra",
      start: instant(date, "12:00"),
    });

    const { rerender } = renderMonth({
      date,
      events,
      monthData: { densityCap: 3, overflowByDate: {} },
    });
    const focusedEvent = screen.getByRole("button", {
      name: /focused-month-2/u,
    });

    fireEvent.focus(focusedEvent);
    assert(focusedEvent.getAttribute("tabindex")).toBe("0");

    rerender(
      <MonthGrid
        date={date}
        events={[...events, extraEvent]}
        locale="en-US"
        timeZone={UTC}
        t={t}
        direction="ltr"
        monthData={{ densityCap: 3, overflowByDate: { "2025-09-01": 1 } }}
      />
    );

    const grid = screen.getByRole("grid");
    assert(
      within(grid)
        .getAllByRole("gridcell")
        .filter((cell) => cell.getAttribute("tabindex") === "0")
    ).toHaveLength(1);
    assert(monthCell(0, 0).getAttribute("tabindex")).toBe("0");
  });

  it("keeps overflow activation out of empty-cell creation", () => {
    const onOverflowSelect =
      vi.fn<
        (payload: {
          readonly date: CalendarDate;
          readonly anchorRect?: DOMRectReadOnly;
        }) => void
      >();
    const onEmptyCellSelect = vi.fn<(cell: CalendarCell) => void>();
    const date = calendarDate("2025-09-04");

    const events = Array.from({ length: 5 }, (_, index) =>
      eventFixture({
        end: instant(date, `${String(10 + index).padStart(2, "0")}:00`),
        id: `overflow-control-${index}`,
        start: instant(date, `${String(9 + index).padStart(2, "0")}:00`),
      })
    );

    renderMonth({
      events,
      monthData: { densityCap: 2, overflowByDate: { "2025-09-04": 3 } },
      onEmptyCellSelect,
      onOverflowSelect,
    });

    const overflow = monthOverflow("3");
    assert(overflow.getAttribute("type")).toBe("button");

    fireEvent.click(overflow);
    assert(onOverflowSelect).toHaveBeenCalledOnce();
    const [overflowPayload] = onOverflowSelect.mock.calls[0] ?? [];
    assert(overflowPayload?.date).toBe(date);
    assert(overflowPayload?.anchorRect).toStrictEqual(assert.anything());
    fireEvent.keyDown(overflow, { key: "Enter" });

    assert(onEmptyCellSelect).not.toHaveBeenCalled();
  });

  it("opens an empty month cell from the existing keyboard interaction", () => {
    const onEmptyCellSelect = vi.fn<(cell: CalendarCell) => void>();
    renderMonth({
      onEmptyCellSelect,
    });

    const cell = monthCell(0, 0);
    fireEvent.keyDown(cell, { key: "Enter" });

    assert(onEmptyCellSelect).toHaveBeenCalledWith(
      assert.objectContaining({ date: calendarDate("2025-09-01") })
    );
  });

  it("keeps existing event activation separate from empty-cell creation", () => {
    const onEmptyCellSelect = vi.fn<(cell: CalendarCell) => void>();

    const event = eventFixture({
      end: instant(calendarDate("2025-09-01"), "10:00"),
      id: "existing",
      start: instant(calendarDate("2025-09-01"), "09:00"),
      title: "Existing event",
    });

    renderMonth({
      events: [event],
      onEmptyCellSelect: (cell) => {
        onEmptyCellSelect(cell);
      },
    });

    const eventButton = screen.getByRole("button", { name: /Existing event/u });
    fireEvent.click(eventButton);
    fireEvent.keyDown(eventButton, { key: "Enter" });

    assert(onEmptyCellSelect).not.toHaveBeenCalled();
  });
});

describe("MonthGrid strip layout", () => {
  it("keeps event metadata out of one-line month strips", () => {
    const date = calendarDate("2025-09-04");

    const event = {
      ...eventFixture({
        end: instant(date, "13:00"),
        id: "month-metadata",
        start: instant(date, "12:00"),
        title: "Design review",
      }),
      location: "Room 42",
      organizer: "Dr. Smith",
    } satisfies CalendarEvent;

    renderMonth({ events: [event] });

    const strip = screen.getByRole("button", { name: /Design review/u });
    assert(strip).not.toHaveTextContent("Room 42");
    assert(strip).not.toHaveTextContent("Dr. Smith");
  });

  it("places timed rows after visible all-day lanes within capacity", () => {
    const date = calendarDate("2025-09-04");
    const allDay = eventFixture({
      allDay: true,
      end: instant(calendarDate("2025-09-05"), "00:00"),
      id: "month-all-day",
      start: instant(date, "00:00"),
      title: "All-day band",
    });
    const timedEvents = Array.from({ length: 4 }, (_, index) =>
      eventFixture({
        end: instant(date, `${String(11 + index).padStart(2, "0")}:00`),
        id: `month-timed-${index + 1}`,
        start: instant(date, `${String(10 + index).padStart(2, "0")}:00`),
      })
    );

    const events = [allDay, ...timedEvents];

    const { result } = renderHook(() =>
      useMonthGridController({
        cellHeight: 135.2,
        date: calendarDate("2025-09-01"),
        events,
        timeZone: UTC,
      })
    );
    const controllerCell = result.current.rows[0]?.cells[3];

    assert(controllerCell).toMatchObject({
      allDayEventIds: ["month-all-day"],
      capacity: 3,
      eventCount: 5,
      hiddenCount: 3,
    });
    assert(controllerCell?.visibleTimedEvents).toHaveLength(1);

    renderMonth({ events });

    const cell = monthCell(0, 3);
    const timedEventsElement = cell.querySelector<HTMLElement>(
      '[style*="--cal-month-all-day-row-count"]'
    );

    assert(cell).toHaveAttribute("data-all-day-row-count", "1");
    within(cell).getByText("+3 hidden");
    assert(timedEventsElement).not.toBeNull();
    assert(
      timedEventsElement?.style.getPropertyValue(
        "--cal-month-all-day-row-count"
      )
    ).toBe("1");
  });

  it("uses the no-fill regular Tag for ordinary dates and the red pill Tag with the full date for today", () => {
    renderMonth({ date: calendarDate("2025-09-01") });

    const ordinary = within(monthCell(0, 1)).getByText("2", { exact: true });
    const firstOfMonth = within(monthCell(0, 0))
      .getAllByText("September 1", { exact: true })
      .at(-1);
    const today = within(monthCell(1, 2))
      .getAllByText("September 10", { exact: true })
      .at(-1);

    assert(ordinary).toHaveClass(
      styles.dayNumber,
      styles.dayNumberNoFill,
      tagStyles.variantRegular
    );
    assert(ordinary).not.toHaveClass(tagStyles.variantStrong);
    assert(today).toHaveClass(
      styles.dayNumber,
      tagStyles.variantStrong,
      tagStyles.colorRed
    );
    assert(today).not.toHaveClass(styles.dayNumberNoFill);
    assert(today).toHaveClass(styles.dayNumberToday);
    assert(today?.textContent).toBe("September 10");
    assert(firstOfMonth?.textContent).toBe("September 1");
    assert(ordinary?.textContent).toBe("2");
  });

  it("uses the injected now for today and past event rendering", () => {
    const past = eventFixture({
      end: instant(calendarDate("2025-09-09"), "10:00"),
      id: "past-event",
      start: instant(calendarDate("2025-09-09"), "09:00"),
    });

    renderMonth({
      date: calendarDate("2025-09-01"),
      events: [past],
      now: instant(calendarDate("2025-09-10"), "12:00"),
    });

    assert(monthCell(1, 2)).toHaveAttribute("data-today", "true");
    assert(screen.getByRole("button", { name: /past-event/u })).toHaveClass(
      eventCardStyles.past
    );
  });

  it("renders the time before the title even when the colour bar is present", () => {
    const event = eventFixture({
      end: instant(calendarDate("2025-09-11"), "10:00"),
      id: "strip-order",
      start: instant(calendarDate("2025-09-11"), "09:00"),
      title: "Introduction to",
    });

    renderMonth({ events: [event] });

    const strip = screen.getByRole("button", { name: /Introduction to/u });
    expectRenderedTimeBeforeTitle(strip, "09:00", "Introduction to");
    assert(strip).toBeInTheDocument();
  });

  it("keeps the time-first strip order when the host supplies an event renderer", () => {
    const event = eventFixture({
      end: instant(calendarDate("2025-09-11"), "10:00"),
      id: "strip-order-host-renderer",
      start: instant(calendarDate("2025-09-11"), "09:00"),
      title: "Host title",
    });

    renderMonth({
      events: [event],
      renderEvent: (context) => <span>{context.event.title}</span>,
    });

    const strip = screen.getByRole("button", { name: /Host title/u });

    expectRenderedTimeBeforeTitle(strip, "09:00", "Host title");
    assert(strip).toBeInTheDocument();
  });
});

const NO_MONTH_EVENTS: readonly CalendarEvent[] = [];

describe("MonthGrid ordinary grid rendering", () => {
  it("keeps the month canvas rendered for empty input with no special regions", () => {
    const { rerender } = renderMonth({ events: NO_MONTH_EVENTS });

    assert(screen.getByRole("grid")).toBeVisible();
    assert(screen.queryByRole("alert")).not.toBeInTheDocument();

    rerender(
      <MonthGrid
        date={calendarDate("2025-09-01")}
        events={NO_MONTH_EVENTS}
        locale="en-US"
        timeZone={UTC}
        t={t}
        direction="ltr"
      />
    );

    assert(screen.getByRole("grid")).toBeVisible();
    assert(screen.queryByRole("alert")).not.toBeInTheDocument();
    assert(
      screen.queryByRole("status", { name: "No events in month" })
    ).not.toBeInTheDocument();
  });
});
