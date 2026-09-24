import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  instant,
  keyboardEvent as keyDownEvent,
  UTC,
} from "../../../__test-utils__/fixtures";
import {
  addCalendarDays,
  calendarDate,
  fromViewerDateTime,
  parseIanaTimeZone,
  parseLocalTime,
} from "../../../core/model";
import type {
  CalendarDate,
  CalendarEvent,
  CalendarEventRenderContext,
} from "../../../core/model";
import { useMonthGridController } from "../use-month-grid-controller";

type TimedCalendarEvent = Extract<CalendarEvent, { readonly allDay: false }>;

type AllDayCalendarEvent = Extract<CalendarEvent, { readonly allDay: true }>;

type TimedTestEvent = TimedCalendarEvent & { readonly available?: boolean };

type AllDayTestEvent = AllDayCalendarEvent & { readonly available?: boolean };

const eventFixture = (
  input: Pick<TimedCalendarEvent, "id" | "start" | "end"> &
    Partial<TimedCalendarEvent> & { readonly available?: boolean }
): TimedTestEvent => ({
  allDay: false,
  attendees: [],
  calendarId: null,
  colorFamily: "turquoise",
  conferencingProviderId: null,
  description: "",
  endDate: calendarDate(input.end.slice(0, 10)),
  endTime: parseLocalTime(input.end.slice(11, 16)),
  location: null,
  recurrenceRule: null,
  startDate: calendarDate(input.start.slice(0, 10)),
  startTime: parseLocalTime(input.start.slice(11, 16)),
  timeZone: UTC,
  title: input.id,
  ...input,
});

const allDayEventFixture = ({
  id,
  startDate,
  endDate,
  title = id,
  colorFamily = "turquoise",
}: {
  readonly id: string;
  readonly startDate: CalendarDate;
  readonly endDate: CalendarDate;
  readonly title?: string;
  readonly colorFamily?: AllDayCalendarEvent["colorFamily"];
}): AllDayTestEvent => ({
  allDay: true,
  attendees: [],
  calendarId: null,
  colorFamily,
  conferencingProviderId: null,
  description: "",
  endDate,
  endTime: null,
  id,
  location: null,
  recurrenceRule: null,
  startDate,
  startTime: null,
  timeZone: UTC,
  title,
});

describe(useMonthGridController, () => {
  it("builds the selected month range and row count", () => {
    const date = calendarDate("2025-03-01");
    const { result } = renderHook(() =>
      useMonthGridController({ date, events: [], timeZone: UTC })
    );

    expect(result.current.monthRange.start).toBe("2025-03-01");
    expect(result.current.monthRange.endExclusive).toBe("2025-04-01");
    expect(result.current.rows).toHaveLength(6);
  });

  it("builds complete Monday-start rows with real ISO week numbers", () => {
    const date = calendarDate("2025-03-01");
    const { result } = renderHook(() =>
      useMonthGridController({ date, events: [], timeZone: UTC })
    );

    expect(
      result.current.rows.map((row) => ({
        firstDate: row.cells[0]?.date,
        lastDate: row.cells[6]?.date,
        weekNumber: row.row.weekNumber,
        weekStart: row.row.weekStart,
      }))
    ).toStrictEqual([
      {
        firstDate: "2025-02-24",
        lastDate: "2025-03-02",
        weekNumber: 9,
        weekStart: "2025-02-24",
      },
      {
        firstDate: "2025-03-03",
        lastDate: "2025-03-09",
        weekNumber: 10,
        weekStart: "2025-03-03",
      },
      {
        firstDate: "2025-03-10",
        lastDate: "2025-03-16",
        weekNumber: 11,
        weekStart: "2025-03-10",
      },
      {
        firstDate: "2025-03-17",
        lastDate: "2025-03-23",
        weekNumber: 12,
        weekStart: "2025-03-17",
      },
      {
        firstDate: "2025-03-24",
        lastDate: "2025-03-30",
        weekNumber: 13,
        weekStart: "2025-03-24",
      },
      {
        firstDate: "2025-03-31",
        lastDate: "2025-04-06",
        weekNumber: 14,
        weekStart: "2025-03-31",
      },
    ]);
  });

  it("marks outside-month cells at both row edges", () => {
    const date = calendarDate("2025-03-01");
    const { result } = renderHook(() =>
      useMonthGridController({ date, events: [], timeZone: UTC })
    );

    expect(result.current.rows[0]?.cells[0]?.isOutsideMonth).toBeTruthy();
    expect(result.current.rows[0]?.cells[5]?.isOutsideMonth).toBeFalsy();
    expect(result.current.rows[5]?.cells[6]?.isOutsideMonth).toBeTruthy();
  });

  it("keeps five-row months and marks a Sunday-start month boundaries", () => {
    const { result } = renderHook(() =>
      useMonthGridController({
        date: calendarDate("2025-09-14"),
        events: [],
        timeZone: UTC,
      })
    );

    expect(result.current.rows).toHaveLength(5);

    expect(result.current.rows[0]?.cells[0]).toMatchObject({
      date: "2025-09-01",
      isOutsideMonth: false,
    });

    expect(result.current.rows[4]?.cells[2]).toMatchObject({
      date: "2025-10-01",
      isOutsideMonth: true,
    });
  });

  it("creates one row-local span fragment per crossed week with continuation edges", () => {
    const event = allDayEventFixture({
      endDate: calendarDate("2025-03-04"),
      id: "boundary",
      startDate: calendarDate("2025-02-27"),
      title: "Boundary span",
    });

    const { result } = renderHook(() =>
      useMonthGridController({
        date: calendarDate("2025-03-01"),
        events: [event],
        timeZone: UTC,
      })
    );

    const fragments = result.current.rows.flatMap((row) => row.allDaySpans);
    expect(fragments).toHaveLength(2);

    expect(
      fragments.map((span) => ({
        continuesAfter: span.continuesAfter,
        continuesBefore: span.continuesBefore,
        endColumn: span.endColumn,
        key: span.key,
        lane: span.lane,
        startColumn: span.startColumn,
      }))
    ).toStrictEqual([
      {
        continuesAfter: true,
        continuesBefore: false,
        endColumn: 7,
        key: "boundary:3-7",
        lane: 0,
        startColumn: 3,
      },
      {
        continuesAfter: false,
        continuesBefore: true,
        endColumn: 1,
        key: "boundary:0-1",
        lane: 0,
        startColumn: 0,
      },
    ]);
  });

  const renderCapacityFixture = () => {
    const date = calendarDate("2025-09-01");

    const events = [
      ...Array.from({ length: 3 }, (_, index) =>
        eventFixture({
          end: instant(date, `${String(10 + index).padStart(2, "0")}:00`),
          id: `monday-${index}`,
          start: instant(date, `${String(9 + index).padStart(2, "0")}:00`),
        })
      ),
      ...Array.from({ length: 5 }, (_, index) =>
        eventFixture({
          end: instant(
            calendarDate("2025-09-04"),
            `${String(10 + index).padStart(2, "0")}:00`
          ),
          id: `thursday-${index}`,
          start: instant(
            calendarDate("2025-09-04"),
            `${String(9 + index).padStart(2, "0")}:00`
          ),
        })
      ),
    ];

    return renderHook(() =>
      useMonthGridController({
        cellHeight: 135.2,
        date,
        events,
        timeZone: UTC,
      })
    );
  };

  it("computes R9 capacity for the measured Monday lane", () => {
    const { result } = renderCapacityFixture();
    const monday = result.current.rows[0]?.cells[0];

    expect(monday).toMatchObject({
      capacity: 3,
      eventCount: 3,
      hiddenCount: 0,
    });
    expect(Array.isArray(monday?.visibleTimedEvents)).toBeTruthy();
    expect(monday.visibleTimedEvents).toHaveLength(3);
  });

  it("computes both design overflow fixtures for the measured Thursday lane", () => {
    const { result } = renderCapacityFixture();
    const thursday = result.current.rows[0]?.cells[3];

    expect(thursday).toMatchObject({
      capacity: 3,
      eventCount: 5,
      hiddenCount: 3,
    });
    expect(thursday.visibleTimedEvents).toHaveLength(2);
    expect(thursday.visibleTimedEvents.length + thursday.hiddenCount).toBe(5);
  });

  it("caps all-day spans and counts omitted lanes", () => {
    const date = calendarDate("2025-09-01");

    const events = Array.from({ length: 4 }, (_, index) =>
      allDayEventFixture({
        endDate: addCalendarDays(date, 1),
        id: `all-day-overflow-${index}`,
        startDate: date,
      })
    );

    const { result } = renderHook(() =>
      useMonthGridController({
        cellHeight: 135.2,
        date,
        events,
        timeZone: UTC,
      })
    );

    const cell = result.current.rows[0]?.cells[0];
    expect(cell).toMatchObject({
      capacity: 3,
      eventCount: 4,
      hiddenCount: 2,
    });
    expect(cell.allDayEventIds).toHaveLength(2);
    expect(result.current.rows[0]?.allDaySpans).toHaveLength(2);
  });

  it("falls back to the cell when a focused event becomes hidden", () => {
    const date = calendarDate("2025-09-01");

    const events = Array.from({ length: 3 }, (_, index) =>
      eventFixture({
        end: instant(date, `${String(10 + index).padStart(2, "0")}:00`),
        id: `focused-overflow-${index}`,
        start: instant(date, `${String(9 + index).padStart(2, "0")}:00`),
      })
    );

    const { result } = renderHook(() =>
      useMonthGridController({
        cellHeight: 135.2,
        date,
        events,
        timeZone: UTC,
      })
    );

    act(() => {
      result.current.focusEvent(0, 0, "focused-overflow-2");
    });

    expect(result.current.focusedCell).toMatchObject({
      columnIndex: 0,
      eventId: "focused-overflow-2",
      rowIndex: 0,
    });

    act(() => {
      result.current.setMeasuredCellHeight(100);
    });

    expect(result.current.rows[0]?.cells[0]?.visibleTimedEvents).toHaveLength(
      1
    );
    expect(result.current.announcement?.eventId).toBeUndefined();
    expect(result.current.focusedCell).toStrictEqual({
      columnIndex: 0,
      rowIndex: 0,
    });
  });

  it("refreshes the focus announcement when current cell data changes", () => {
    const date = calendarDate("2025-09-01");

    const events = Array.from({ length: 4 }, (_, index) =>
      eventFixture({
        end: instant(date, `${String(10 + index).padStart(2, "0")}:00`),
        id: `announcement-${index}`,
        start: instant(date, `${String(9 + index).padStart(2, "0")}:00`),
      })
    );

    const emptyEvents: readonly CalendarEvent[] = [];

    const { result, rerender } = renderHook(
      ({
        currentDate,
        currentEvents,
      }: {
        readonly currentDate: CalendarDate;
        readonly currentEvents: readonly CalendarEvent[];
      }) =>
        useMonthGridController({
          cellHeight: 135.2,
          date: currentDate,
          events: currentEvents,
          timeZone: UTC,
        }),
      {
        initialProps: {
          currentDate: date,
          currentEvents: emptyEvents,
        },
      }
    );

    expect(result.current.announcement).toMatchObject({
      date,
      eventCount: 0,
      hiddenCount: 0,
    });

    rerender({ currentDate: date, currentEvents: events });

    expect(result.current.announcement).toMatchObject({
      date,
      eventCount: 4,
      hiddenCount: 2,
    });
  });

  it("degrades to zero visible chips when measured rows cannot fit one chip", () => {
    const date = calendarDate("2025-09-01");

    const events = Array.from({ length: 2 }, (_, index) =>
      eventFixture({
        end: instant(date, `${String(10 + index).padStart(2, "0")}:00`),
        id: `short-${index}`,
        start: instant(date, `${String(9 + index).padStart(2, "0")}:00`),
      })
    );

    const { result } = renderHook(() =>
      useMonthGridController({
        cellHeight: 50,
        date,
        events,
        timeZone: UTC,
      })
    );

    const cell = result.current.rows[0]?.cells[0];
    expect(cell).toMatchObject({ capacity: 0, hiddenCount: 2 });
    expect(cell.visibleTimedEvents).toHaveLength(0);
  });

  it("registers cell refs without letting their measurement drive capacity", () => {
    const date = calendarDate("2025-09-01");

    const events = Array.from({ length: 2 }, (_, index) =>
      eventFixture({
        end: instant(date, `${String(10 + index).padStart(2, "0")}:00`),
        id: `measured-${index}`,
        start: instant(date, `${String(9 + index).padStart(2, "0")}:00`),
      })
    );

    const { result } = renderHook(() =>
      useMonthGridController({
        date,
        events,
        timeZone: UTC,
      })
    );

    const measuredElement = document.createElement("div");
    Object.defineProperty(measuredElement, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ height: 69 }),
    });

    act(() => {
      result.current.setCellRef(0, 0, measuredElement);
    });

    expect(result.current.cellHeight).toBe(135.2);

    act(() => {
      result.current.setCellRef(0, 0, measuredElement);
    });
    act(() => {
      result.current.setCellRef(0, 0, null);
    });

    act(() => {
      result.current.setMeasuredCellHeight(0);
    });
    act(() => {
      result.current.setMeasuredCellHeight(69);
    });

    expect(result.current.cellHeight).toBe(69);
    expect(result.current.rows[0]?.cells[0]).toMatchObject({
      capacity: 1,
      hiddenCount: 2,
    });

    expect(result.current.rows[0]?.cells[0]?.visibleTimedEvents).toHaveLength(
      0
    );
  });

  it("ignores a malformed timed interval while preserving month cells", () => {
    const valid = eventFixture({
      end: instant(calendarDate("2025-09-01"), "10:00"),
      id: "valid",
      start: instant(calendarDate("2025-09-01"), "09:00"),
    });

    const malformed = { ...valid, id: "malformed" };
    Object.defineProperty(malformed, "start", { value: "not-an-instant" });

    const { result } = renderHook(() =>
      useMonthGridController({
        date: calendarDate("2025-09-01"),
        events: [malformed],
        timeZone: UTC,
      })
    );

    expect(result.current.rows).toHaveLength(5);
    expect(result.current.segments).toHaveLength(0);
  });

  it("moves focus right, left, and down in RTL", () => {
    const { result } = renderHook(() =>
      useMonthGridController({
        date: calendarDate("2025-09-01"),
        direction: "rtl",
        events: [],
        timeZone: UTC,
      })
    );

    act(() => {
      result.current.handleGridKeyDown(keyDownEvent("ArrowRight"), 0, 0);
    });

    expect(result.current.focusedCell).toMatchObject({
      columnIndex: 0,
      rowIndex: 0,
    });

    act(() => {
      result.current.handleGridKeyDown(keyDownEvent("ArrowLeft"), 0, 0);
    });

    expect(result.current.focusedCell).toMatchObject({
      columnIndex: 1,
      rowIndex: 0,
    });

    act(() => {
      result.current.handleGridKeyDown(keyDownEvent("ArrowDown"), 0, 1);
    });

    expect(result.current.focusedCell).toMatchObject({
      columnIndex: 1,
      rowIndex: 1,
    });
  });

  it("moves focus up and to the row edges in RTL", () => {
    const { result } = renderHook(() =>
      useMonthGridController({
        date: calendarDate("2025-09-01"),
        direction: "rtl",
        events: [],
        timeZone: UTC,
      })
    );

    act(() => {
      result.current.handleGridKeyDown(keyDownEvent("ArrowUp"), 1, 1);
    });

    expect(result.current.focusedCell).toMatchObject({
      columnIndex: 1,
      rowIndex: 0,
    });

    act(() => {
      result.current.handleGridKeyDown(keyDownEvent("Home"), 1, 1);
    });

    expect(result.current.focusedCell).toMatchObject({
      columnIndex: 0,
      rowIndex: 1,
    });

    act(() => {
      result.current.handleGridKeyDown(keyDownEvent("End"), 1, 0);
      result.current.handleGridKeyDown(keyDownEvent("Escape"), 0, 6);
    });

    expect(result.current.focusedCell).toMatchObject({
      columnIndex: 6,
      rowIndex: 1,
    });
  });

  it("activates available events and ignores unavailable events", () => {
    const onEventSelect =
      vi.fn<
        (event: CalendarEvent, context: CalendarEventRenderContext) => void
      >();

    const available = eventFixture({
      end: instant(calendarDate("2025-09-01"), "10:00"),
      id: "available",
      start: instant(calendarDate("2025-09-01"), "09:00"),
    });

    const unavailable = eventFixture({
      available: false,
      end: instant(calendarDate("2025-09-01"), "12:00"),
      id: "unavailable",
      start: instant(calendarDate("2025-09-01"), "11:00"),
    });

    const { result } = renderHook(() =>
      useMonthGridController({
        date: calendarDate("2025-09-01"),
        events: [available, unavailable],
        onEventSelect,
        timeZone: UTC,
      })
    );

    act(() => {
      result.current.handleGridKeyDown(
        keyDownEvent("Enter"),
        0,
        0,
        "available"
      );
    });
    act(() => {
      result.current.selectEvent("available");
    });
    act(() => {
      result.current.selectEvent("unavailable");
    });

    expect(onEventSelect).toHaveBeenCalledTimes(2);
    expect(onEventSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: "available" }),
      expect.objectContaining({
        event: expect.objectContaining({
          id: "available",
        }) as unknown,
      }),
      undefined
    );
  });

  it("preserves source date arithmetic in a non-UTC viewer timezone", () => {
    const timeZone = parseIanaTimeZone("America/New_York");
    const date = calendarDate("2025-09-01");

    const event = eventFixture({
      end: fromViewerDateTime({
        date: addCalendarDays(date, 1),
        time: "01:00",
        timeZone,
      }),
      id: "viewer-day",
      start: fromViewerDateTime({ date, time: "23:00", timeZone }),
    });

    const { result } = renderHook(() =>
      useMonthGridController({
        date,
        events: [event, event],
        timeZone,
      })
    );

    expect(result.current.rows[0]?.cells[0]?.date).toBe("2025-09-01");
    expect(result.current.rows[0]?.cells[0]?.eventCount).toBe(1);
    expect(result.current.segments).toHaveLength(4);

    act(() => {
      result.current.handleGridKeyDown(keyDownEvent("ArrowLeft"), 0, 1);
    });

    expect(result.current.focusedCell).toMatchObject({ columnIndex: 0 });

    act(() => {
      result.current.handleGridKeyDown(keyDownEvent("ArrowRight"), 0, 0);
    });

    expect(result.current.focusedCell).toMatchObject({ columnIndex: 1 });
  });

  it("exposes stable month row and cell keys", () => {
    const fiveWeek = renderHook(() =>
      useMonthGridController({
        date: calendarDate("2025-09-01"),
        events: [],
        timeZone: UTC,
      })
    );
    const sixWeek = renderHook(() =>
      useMonthGridController({
        date: calendarDate("2025-03-01"),
        events: [],
        timeZone: UTC,
      })
    );
    const firstCell = sixWeek.result.current.rows[0]?.cells[0]?.cell;

    if (firstCell === undefined) {
      throw new Error("Expected a first month cell");
    }

    expect(fiveWeek.result.current.rows[0]?.row.key).toBe(
      "month-week:2025-09-01"
    );
    expect(sixWeek.result.current.rows[0]?.row.key).toBe(
      "month-week:2025-02-24"
    );
    expect(sixWeek.result.current.getCellKey(firstCell)).toBe(
      "month:2025-02-24"
    );
  });

  it("preserves month selected/focused payloads and callbacks", () => {
    const onSelectedEventIdChange = vi.fn<(eventId: string | null) => void>();
    const onEventSelect =
      vi.fn<
        (event: CalendarEvent, context: CalendarEventRenderContext) => void
      >();
    const event = eventFixture({
      end: instant(calendarDate("2025-09-01"), "10:00"),
      id: "selected",
      start: instant(calendarDate("2025-09-01"), "09:00"),
    });

    const month = renderHook(
      (selectedEventId: string | null | undefined) =>
        useMonthGridController({
          date: calendarDate("2025-09-01"),
          events: [event],
          onEventSelect,
          onSelectedEventIdChange,
          selectedEventId,
          timeZone: UTC,
        }),
      { initialProps: undefined }
    );

    expect(month.result.current.selectedEventId).toBeNull();

    act(() => {
      month.result.current.focusEvent(0, 0, "selected");
      month.result.current.selectEvent("selected");
    });

    expect(month.result.current.focusedCell.eventId).toBe("selected");
    expect(onSelectedEventIdChange).toHaveBeenCalledWith("selected");
    expect(onEventSelect).toHaveBeenCalledWith(
      event,
      expect.objectContaining({ event }),
      undefined
    );

    month.rerender("selected");

    expect(month.result.current.selectedEvent?.id).toBe("selected");
  });
});
