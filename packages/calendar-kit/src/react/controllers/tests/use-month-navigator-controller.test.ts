import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  keyboardEvent as keyDownEvent,
  UTC,
} from "../../../__test-utils__/fixtures";
import {
  calendarDate,
  fromViewerDateTime,
  parseIanaTimeZone,
  parseLocalTime,
} from "../../../core/model";
import type { CalendarDate, CalendarEvent } from "../../../core/model";
import { useMonthNavigatorController } from "../use-month-navigator-controller";

type ControllerOptions = Parameters<typeof useMonthNavigatorController>[0];

const AUCKLAND = parseIanaTimeZone("Pacific/Auckland");

const DATE = calendarDate("2026-08-24");

const timedEvent = (
  id: string,
  startDate: string,
  startTime: string,
  endDate: string,
  endTime: string
): CalendarEvent => {
  const start = calendarDate(startDate);
  const end = calendarDate(endDate);

  return {
    allDay: false,
    colorFamily: "turquoise",
    end: fromViewerDateTime({ date: end, time: endTime, timeZone: UTC }),
    endDate: end,
    endTime: parseLocalTime(endTime),
    id,
    start: fromViewerDateTime({ date: start, time: startTime, timeZone: UTC }),
    startDate: start,
    startTime: parseLocalTime(startTime),
    timeZone: UTC,
    title: id,
  };
};

const allDayEvent = (
  id: string,
  startDate: string,
  endDate: string
): CalendarEvent => ({
  allDay: true,
  colorFamily: "purple",
  endDate: calendarDate(endDate),
  endTime: null,
  id,
  startDate: calendarDate(startDate),
  startTime: null,
  timeZone: UTC,
  title: id,
});

const renderController = (overrides: Partial<ControllerOptions> = {}) => {
  const onSelectDate = vi.fn<(date: CalendarDate) => void>();

  const options: ControllerOptions = {
    events: [],
    locale: "en-US",
    onSelectDate,
    selectedDate: DATE,
    timeZone: UTC,
    ...overrides,
  };

  return renderHook(() => useMonthNavigatorController(options));
};

describe(useMonthNavigatorController, () => {
  it("builds complete week rows for the selected month", () => {
    const { result } = renderController();

    expect(result.current.monthStart).toBe("2026-08-01");
    expect(result.current.monthEndExclusive).toBe("2026-09-01");
    expect(result.current.weeks.length).toBeGreaterThan(0);

    for (const week of result.current.weeks) {
      expect(week.dates).toHaveLength(7);
    }
  });

  it("marks all-day dates before the exclusive end and timed viewer-day segments", () => {
    const { result } = renderController({
      events: [
        allDayEvent("exam", "2026-08-10", "2026-08-13"),
        timedEvent("overnight", "2026-08-20", "23:00", "2026-08-21", "01:00"),
      ],
    });

    const datesWithEvents = [...result.current.datesWithEvents];
    Array.prototype.sort.call(datesWithEvents);
    expect(datesWithEvents).toStrictEqual([
      "2026-08-10",
      "2026-08-11",
      "2026-08-12",
      "2026-08-20",
      "2026-08-21",
    ]);
  });

  it("resolves timed event dots in the viewer zone rather than the event zone", () => {
    const { result } = renderController({
      events: [
        timedEvent("late", "2026-08-10", "23:00", "2026-08-10", "23:30"),
      ],
      timeZone: AUCKLAND,
    });

    expect([...result.current.datesWithEvents]).toStrictEqual(["2026-08-11"]);
  });

  it("follows a controlled selected-date change and resets the visible month", () => {
    const { result, rerender } = renderHook(
      (options: ControllerOptions) => useMonthNavigatorController(options),
      {
        initialProps: {
          events: [],
          locale: "en-US",
          onSelectDate: vi.fn<(date: CalendarDate) => void>(),
          selectedDate: DATE,
          timeZone: UTC,
        },
      }
    );

    rerender({
      events: [],
      locale: "en-US",
      onSelectDate: vi.fn<(date: CalendarDate) => void>(),
      selectedDate: calendarDate("2026-11-03"),
      timeZone: UTC,
    });

    expect(result.current.titleMonth).toBe("November");
    expect(result.current.focusedDate).toBe("2026-11-03");
    expect(result.current.monthStart).toBe("2026-11-01");
  });

  it("moves focus by day and to the focused week edges", () => {
    const { result } = renderController();

    act(() => {
      result.current.handleDayKeyDown(keyDownEvent("ArrowRight"), DATE);
    });

    expect(result.current.focusedDate).toBe("2026-08-25");

    act(() => {
      result.current.handleDayKeyDown(
        keyDownEvent("Home"),
        calendarDate("2026-08-26")
      );
    });

    expect(result.current.focusedDate).toBe("2026-08-24");

    act(() => {
      result.current.handleDayKeyDown(
        keyDownEvent("End"),
        calendarDate("2026-08-26")
      );
    });

    expect(result.current.focusedDate).toBe("2026-08-30");
  });

  it("changes the focused month with PageUp and PageDown and selects on Space", () => {
    const onSelectDate = vi.fn<(date: CalendarDate) => void>();

    const { result } = renderHook(() =>
      useMonthNavigatorController({
        events: [],
        locale: "en-US",
        onSelectDate,
        selectedDate: DATE,
        timeZone: UTC,
      })
    );

    act(() => {
      result.current.handleDayKeyDown(keyDownEvent("PageDown"), DATE);
    });

    expect(result.current.focusedDate).toBe("2026-09-24");
    expect(result.current.titleMonth).toBe("September");

    act(() => {
      result.current.handleDayKeyDown(
        keyDownEvent(" "),
        result.current.focusedDate
      );
    });

    expect(onSelectDate).toHaveBeenCalledWith("2026-09-24");

    act(() => {
      result.current.handleDayKeyDown(
        keyDownEvent("PageUp"),
        result.current.focusedDate
      );
    });

    expect(result.current.focusedDate).toBe("2026-08-24");
  });

  it("reports a selected date and updates the focused date", () => {
    const onSelectDate = vi.fn<(date: CalendarDate) => void>();
    const { result } = renderController({ onSelectDate });

    act(() => {
      result.current.selectDate(calendarDate("2026-08-05"));
    });

    expect(onSelectDate).toHaveBeenCalledWith("2026-08-05");
    expect(result.current.focusedDate).toBe("2026-08-05");
  });
});
