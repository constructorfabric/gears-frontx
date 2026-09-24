import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  keyboardEvent as keyDownEvent,
  UTC,
} from "../../../__test-utils__/fixtures";
import type {
  CalendarEvent,
  CalendarEventRenderContext,
} from "../../../core/model";
import {
  VIEWER_DAY_SEGMENT,
  calendarDate,
  parseLocalTime,
  utcInstant,
} from "../../../core/model";
import { useAgendaViewController } from "../use-agenda-view-controller";

const NOW = utcInstant("2026-08-24T09:58:00.000Z");

const timedEvent = (
  id: string,
  title: string,
  start: string,
  end: string,
  options: {
    readonly attendees?: number;
    readonly available?: boolean;
    readonly colorFamily?: CalendarEvent["colorFamily"];
    readonly organizer?: string | null;
  } = {}
): CalendarEvent => {
  const { attendees = 0, available, colorFamily = "turquoise" } = options;

  const common = {
    attendees: Array.from({ length: attendees }, (_, index) => ({
      displayName: `Person ${index}`,
      id: `${id}-person-${index}`,
    })),
    available,
    calendarId: null,
    colorFamily,
    conferencingProviderId: null,
    description: "",
    id,
    location: null,
    organizer: options.organizer ?? null,
    recurrenceRule: null,
    timeZone: UTC,
    title,
  };

  return {
    ...common,
    allDay: false,
    end: utcInstant(end),
    endDate: calendarDate(end.slice(0, 10)),
    endTime: parseLocalTime(end.slice(11, 16)),
    start: utcInstant(start),
    startDate: calendarDate(start.slice(0, 10)),
    startTime: parseLocalTime(start.slice(11, 16)),
  };
};

const allDayEvent = (
  id: string,
  title: string,
  startDate: string,
  endDate: string,
  options: {
    readonly available?: boolean;
    readonly colorFamily?: CalendarEvent["colorFamily"];
  } = {}
): CalendarEvent => ({
  allDay: true,
  attendees: [],
  available: options.available,
  calendarId: null,
  colorFamily: options.colorFamily ?? "turquoise",
  conferencingProviderId: null,
  description: "",
  endDate: calendarDate(endDate),
  endTime: null,
  id,
  location: null,
  organizer: null,
  recurrenceRule: null,
  startDate: calendarDate(startDate),
  startTime: null,
  timeZone: UTC,
  title,
});

const groupFor = (
  groups: ReturnType<typeof useAgendaViewController>["dayGroups"],
  date: string
) => {
  const group = groups.find((candidate) => candidate.date === date);

  if (!group) {
    throw new Error(`Missing group ${date}`);
  }

  return group;
};

describe(useAgendaViewController, () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
  });

  it("clips a long timed event to the rolling window without losing continuation labels", () => {
    const { result } = renderHook(() =>
      useAgendaViewController({
        date: calendarDate("2026-08-15"),
        events: [
          timedEvent(
            "decade",
            "Decade",
            "2020-01-01T00:00:00.000Z",
            "2030-01-01T00:00:00.000Z"
          ),
        ],
        timeZone: UTC,
      })
    );

    const rows = result.current.eventRows;

    expect(rows).toHaveLength(30);
    expect(rows.every((row) => row.segment === "middle")).toBeTruthy();
    expect(rows[0]?.date).toBe("2026-08-15");
    expect(rows[29]?.date).toBe("2026-09-13");
  });

  const renderComplexAgenda = () =>
    renderHook(() =>
      useAgendaViewController({
        date: calendarDate("2026-08-02"),
        events: [
          timedEvent(
            "late",
            "Late",
            "2026-08-02T09:30:00.000Z",
            "2026-08-02T10:00:00.000Z"
          ),
          timedEvent(
            "early",
            "Early",
            "2026-08-02T09:00:00.000Z",
            "2026-08-02T09:15:00.000Z"
          ),
          allDayEvent("all-day", "All day", "2026-08-02", "2026-08-04"),
        ],
        timeZone: UTC,
      })
    );

  it("builds every window date and orders event rows", () => {
    const { result } = renderComplexAgenda();

    expect(result.current.windowRange.start).toBe("2026-08-02");
    expect(result.current.windowRange.endExclusive).toBe("2026-09-01");
    expect(result.current.dayGroups).toHaveLength(30);
    expect(result.current.dayGroups[0]?.date).toBe("2026-08-02");
    expect(result.current.dayGroups.at(-1)?.date).toBe("2026-08-31");
  });

  it("bounds each event day axis to its events", () => {
    const { result } = renderComplexAgenda();
    const eventDay = groupFor(result.current.dayGroups, "2026-08-02");

    expect(eventDay.eventCount).toBe(3);
    expect(eventDay.allDayEvents.map((row) => row.event.id)).toStrictEqual([
      "all-day",
    ]);
    expect(
      eventDay.hourRows.map((row) => row.hourStart?.slice(11, 13))
    ).toStrictEqual(["09", "10"]);
    expect(
      eventDay.hourRows[0]?.events.map((row) => row.event.title)
    ).toStrictEqual(["Early", "Late"]);
    expect(eventDay.hourRows[1]?.events).toHaveLength(0);
  });

  it("keeps all-day-only days empty of timed rows", () => {
    const { result } = renderComplexAgenda();
    const allDayOnly = groupFor(result.current.dayGroups, "2026-08-03");

    expect(allDayOnly.allDayEvents).toHaveLength(1);
    expect(allDayOnly.allDayEvents[0]?.start).toBeNull();
    expect(allDayOnly.allDayEvents[0]?.end).toBeNull();
    expect(allDayOnly.hourRows).toStrictEqual([
      { events: [], hourStart: null },
    ]);
  });

  it("retains empty days and flat event-row indices", () => {
    const { result } = renderComplexAgenda();
    const emptyDay = groupFor(result.current.dayGroups, "2026-08-04");

    expect(emptyDay.hourRows).toStrictEqual([{ events: [], hourStart: null }]);
    expect(result.current.eventRows.map((row) => row.focusIndex)).toStrictEqual(
      [0, 1, 2, 3]
    );
    expect(result.current.hasEvents).toBeTruthy();
  });

  it("splits timed events by viewer day, clips to the rolling window, and keeps exclusive all-day ends", () => {
    const { result } = renderHook(() =>
      useAgendaViewController({
        date: calendarDate("2026-08-15"),
        events: [
          timedEvent(
            "from-july",
            "From July",
            "2026-07-31T23:30:00.000Z",
            "2026-08-01T01:30:00.000Z"
          ),
          timedEvent(
            "into-september",
            "Into September",
            "2026-08-31T23:30:00.000Z",
            "2026-09-01T01:30:00.000Z"
          ),
          allDayEvent("exclusive", "Exclusive", "2026-08-30", "2026-09-01"),
        ],
        timeZone: UTC,
      })
    );

    expect(result.current.eventRows.map((row) => row.key)).toStrictEqual([
      "exclusive:2026-08-30:start",
      "exclusive:2026-08-31:end",
      "into-september:2026-08-31:start",
      "into-september:2026-09-01:end",
    ]);
    expect(groupFor(result.current.dayGroups, "2026-09-01").eventCount).toBe(1);
    expect(
      groupFor(result.current.dayGroups, "2026-08-30").allDayEvents
    ).toHaveLength(1);
    expect(
      groupFor(result.current.dayGroups, "2026-08-31").allDayEvents
    ).toHaveLength(1);
    expect(groupFor(result.current.dayGroups, "2026-08-29").eventCount).toBe(0);
  });

  it("starts the rolling window at today", () => {
    const { result } = renderHook(() =>
      useAgendaViewController({
        date: calendarDate("2026-08-24"),
        events: [],
        timeZone: UTC,
      })
    );

    expect(result.current.dayGroups[0]?.date).toBe("2026-08-24");
    expect(result.current.dayGroups).toHaveLength(30);
  });

  it("keeps 30 days when today is the last day of the month", () => {
    const { result } = renderHook(() =>
      useAgendaViewController({
        date: calendarDate("2026-08-31"),
        events: [],
        timeZone: UTC,
      })
    );

    expect(result.current.dayGroups[0]?.date).toBe("2026-08-31");
    expect(result.current.dayGroups).toHaveLength(30);
    expect(result.current.dayGroups[29]?.date).toBe("2026-09-29");
  });

  it("keeps an empty day group after today", () => {
    const { result } = renderHook(() =>
      useAgendaViewController({
        date: calendarDate("2026-08-15"),
        events: [],
        timeZone: UTC,
      })
    );

    const emptyDay = groupFor(result.current.dayGroups, "2026-08-25");
    expect(emptyDay.eventCount).toBe(0);
    expect(emptyDay.hourRows).toStrictEqual([{ events: [], hourStart: null }]);
  });

  it("starts a navigated window at its anchor date", () => {
    const { result } = renderHook(() =>
      useAgendaViewController({
        date: calendarDate("2026-07-15"),
        events: [],
        timeZone: UTC,
      })
    );

    expect(result.current.dayGroups[0]?.date).toBe("2026-07-15");
  });

  it("starts a future window at its anchor date", () => {
    const { result } = renderHook(() =>
      useAgendaViewController({
        date: calendarDate("2026-09-15"),
        events: [],
        timeZone: UTC,
      })
    );

    expect(result.current.dayGroups[0]?.date).toBe("2026-09-15");
  });

  it("keeps a full rolling window for a future anchor", () => {
    const { result } = renderHook(() =>
      useAgendaViewController({
        date: calendarDate("2026-09-15"),
        events: [],
        timeZone: UTC,
      })
    );

    expect(result.current.dayGroups[0]?.date).toBe("2026-09-15");
    expect(result.current.dayGroups).toHaveLength(30);
  });

  it("marks past and in-progress rows and describes the current-day now line", () => {
    const { result, rerender } = renderHook(
      ({ date }) =>
        useAgendaViewController({
          date,
          events: [
            timedEvent(
              "past",
              "Past",
              "2026-08-24T08:00:00.000Z",
              "2026-08-24T09:00:00.000Z"
            ),
            timedEvent(
              "now",
              "Now",
              "2026-08-24T09:00:00.000Z",
              "2026-08-24T10:00:00.000Z"
            ),
            timedEvent(
              "future",
              "Future",
              "2026-08-24T10:00:00.000Z",
              "2026-08-24T11:00:00.000Z"
            ),
          ],
          timeZone: UTC,
        }),
      { initialProps: { date: calendarDate("2026-08-24") } }
    );

    expect(
      result.current.eventRows.map((row) => [row.event.id, row.past, row.now])
    ).toStrictEqual([
      ["past", true, false],
      ["now", false, true],
      ["future", false, false],
    ]);
    const nowLine = result.current.dayGroups[0]?.nowLine;
    expect(nowLine?.hourRowIndex).toBe(1);
    expect(nowLine?.minutePercent).toBeCloseTo(96.6666666667, 8);

    rerender({ date: calendarDate("2026-09-24") });

    expect(
      result.current.dayGroups.every((group) => group.nowLine === null)
    ).toBeTruthy();
  });

  const renderSelectionAgenda = (
    onEventSelect: (
      event: CalendarEvent,
      context: CalendarEventRenderContext
    ) => void
  ) =>
    renderHook(() =>
      useAgendaViewController({
        date: calendarDate("2026-08-24"),
        events: [
          timedEvent(
            "available",
            "Available",
            "2026-08-24T09:00:00.000Z",
            "2026-08-24T10:00:00.000Z"
          ),
          timedEvent(
            "unavailable",
            "Unavailable",
            "2026-08-25T09:00:00.000Z",
            "2026-08-25T10:00:00.000Z",
            { available: false }
          ),
        ],
        onEventSelect,
        timeZone: UTC,
      })
    );

  it("focuses the last registered row and announces it", () => {
    const onEventSelect =
      vi.fn<
        (event: CalendarEvent, context: CalendarEventRenderContext) => void
      >();
    const { result } = renderSelectionAgenda(onEventSelect);
    const firstElement = document.createElement("div");
    const secondElement = document.createElement("div");
    const secondFocus = vi.spyOn(secondElement, "focus");

    act(() => {
      result.current.setRowRef(0, firstElement);
      result.current.setRowRef(1, secondElement);
      result.current.focusRow(100);
    });

    expect(result.current.focusedRowIndex).toBe(1);
    expect(secondFocus).toHaveBeenCalledOnce();
    expect(result.current.announcement).toStrictEqual({
      kind: "focus",
      rowIndex: 1,
    });
  });

  it("moves focus up from an unavailable row", () => {
    const onEventSelect =
      vi.fn<
        (event: CalendarEvent, context: CalendarEventRenderContext) => void
      >();
    const { result } = renderSelectionAgenda(onEventSelect);
    const firstElement = document.createElement("div");
    const secondElement = document.createElement("div");
    const secondFocus = vi.spyOn(secondElement, "focus");

    act(() => {
      result.current.setRowRef(0, firstElement);
      result.current.setRowRef(1, secondElement);
      result.current.focusRow(100);
    });
    const arrowUp = keyDownEvent("ArrowUp");
    const preventDefault = vi.spyOn(arrowUp, "preventDefault");

    act(() => {
      result.current.handleRowKeyDown(arrowUp, 1, "unavailable");
    });

    expect(preventDefault).toHaveBeenCalledOnce();
    expect(result.current.focusedRowIndex).toBe(0);
    void secondFocus;
  });

  it("selects available rows and announces the selected row", () => {
    const onEventSelect =
      vi.fn<
        (event: CalendarEvent, context: CalendarEventRenderContext) => void
      >();
    const { result } = renderSelectionAgenda(onEventSelect);
    const enter = keyDownEvent("Enter");

    act(() => {
      result.current.handleRowKeyDown(enter, 0, "available");
    });

    expect(onEventSelect).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ id: "available" }),
      expect.objectContaining({
        event: expect.objectContaining({
          id: "available",
        }) as unknown,
      }),
      enter.currentTarget
    );

    act(() => {
      result.current.selectEvent("unavailable");
      result.current.selectEvent("missing");
    });
    act(() => {
      result.current.announceRow(0);
    });

    expect(result.current.announcement).toStrictEqual({
      kind: "focus",
      rowIndex: 0,
    });
  });

  it("resets focus and announces a range when window or loaded row count changes", () => {
    const { result, rerender } = renderHook(
      ({ date, events }) =>
        useAgendaViewController({ date, events, timeZone: UTC }),
      {
        initialProps: {
          date: calendarDate("2026-08-24"),
          events: [
            timedEvent(
              "one",
              "One",
              "2026-08-24T09:00:00.000Z",
              "2026-08-24T10:00:00.000Z"
            ),
            timedEvent(
              "two",
              "Two",
              "2026-08-24T10:00:00.000Z",
              "2026-08-24T11:00:00.000Z"
            ),
          ],
        },
      }
    );

    act(() => {
      result.current.focusRow(1);
    });

    expect(result.current.focusedRowIndex).toBe(1);

    rerender({ date: calendarDate("2026-09-24"), events: [] });

    expect(result.current.focusedRowIndex).toBe(-1);
    expect(result.current.announcement).toStrictEqual({ kind: "range" });
  });

  it("exposes viewer-day segment kinds for multi-day rows", () => {
    const { result } = renderHook(() =>
      useAgendaViewController({
        date: calendarDate("2026-08-24"),
        events: [
          timedEvent(
            "multi",
            "Multi",
            "2026-08-24T23:00:00.000Z",
            "2026-08-26T01:00:00.000Z"
          ),
        ],
        timeZone: UTC,
      })
    );

    expect(result.current.eventRows.map((row) => row.segment)).toStrictEqual([
      VIEWER_DAY_SEGMENT.start,
      VIEWER_DAY_SEGMENT.middle,
      VIEWER_DAY_SEGMENT.end,
    ]);
  });

  it("keeps the agenda on a 30,000 ms cadence and cleans up its timer", () => {
    const cadenceNow = utcInstant("2026-08-24T13:59:40.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(new Date(cadenceNow));

    const { result, unmount } = renderHook(() =>
      useAgendaViewController({
        date: calendarDate("2026-08-24"),
        events: [],
        timeZone: UTC,
      })
    );

    expect(result.current.currentInstant).toBe(cadenceNow);
    expect(vi.getTimerCount()).toBe(1);

    act(() => {
      vi.advanceTimersByTime(29_999);
    });

    expect(result.current.currentInstant).toBe(cadenceNow);

    act(() => {
      vi.advanceTimersByTime(1);
    });

    expect(result.current.currentInstant).toBe("2026-08-24T14:00:10.000Z");

    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("returns controlled now unchanged and installs zero timers", () => {
    vi.useFakeTimers();

    const { result } = renderHook(() =>
      useAgendaViewController({
        date: calendarDate("2026-08-24"),
        events: [],
        now: NOW,
        timeZone: UTC,
      })
    );

    expect(result.current.currentInstant).toBe(NOW);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("preserves malformed-event catches in the agenda controller", () => {
    const malformed = timedEvent(
      "malformed",
      "Malformed",
      "2026-08-24T09:00:00.000Z",
      "2026-08-24T10:00:00.000Z"
    );
    Object.defineProperty(malformed, "start", { value: "not-an-instant" });

    const { result } = renderHook(() =>
      useAgendaViewController({
        date: calendarDate("2026-08-24"),
        events: [malformed],
        now: utcInstant("2026-08-24T09:30:00.000Z"),
        timeZone: UTC,
      })
    );

    expect(result.current.eventRows).toHaveLength(0);
    expect(result.current.dayGroups).toHaveLength(30);
  });
});
