import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  keyboardEvent as keyDownEvent,
  UTC,
} from "../../../__test-utils__/fixtures";
import {
  calendarDate,
  fromViewerDateTime,
  parseLocalTime,
  utcInstant,
} from "../../../core/model";
import type { CalendarDate, CalendarEvent } from "../../../core/model";
import { useSearchResultsController } from "../use-search-results-controller";

type ControllerOptions = Parameters<typeof useSearchResultsController>[0];

const NOW = utcInstant("2026-08-24T08:00:00.000Z");

const EVENTS: readonly CalendarEvent[] = [
  {
    allDay: false,
    colorFamily: "turquoise",
    end: fromViewerDateTime({
      date: calendarDate("2026-08-24"),
      time: "10:00",
      timeZone: UTC,
    }),
    endDate: calendarDate("2026-08-24"),
    endTime: parseLocalTime("10:00"),
    id: "chemistry",
    start: fromViewerDateTime({
      date: calendarDate("2026-08-24"),
      time: "09:00",
      timeZone: UTC,
    }),
    startDate: calendarDate("2026-08-24"),
    startTime: parseLocalTime("09:00"),
    timeZone: UTC,
    title: "Introduction to Chemistry",
  },
  {
    allDay: false,
    colorFamily: "purple",
    end: fromViewerDateTime({
      date: calendarDate("2026-08-26"),
      time: "14:00",
      timeZone: UTC,
    }),
    endDate: calendarDate("2026-08-26"),
    endTime: parseLocalTime("14:00"),
    id: "history",
    location: "Café Wien",
    start: fromViewerDateTime({
      date: calendarDate("2026-08-26"),
      time: "13:00",
      timeZone: UTC,
    }),
    startDate: calendarDate("2026-08-26"),
    startTime: parseLocalTime("13:00"),
    timeZone: UTC,
    title: "Modern History",
  },
];

const renderController = (overrides: Partial<ControllerOptions> = {}) => {
  const onReveal = vi.fn<(eventId: string, date: CalendarDate) => void>();
  const onDismiss = vi.fn<() => void>();

  const options: ControllerOptions = {
    events: EVENTS,
    now: NOW,
    onDismiss,
    onReveal,
    query: "st",
    timeZone: UTC,
    ...overrides,
  };

  return renderHook(
    (currentOptions: ControllerOptions) =>
      useSearchResultsController(currentOptions),
    { initialProps: options }
  );
};

describe(useSearchResultsController, () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("reports too-short and empty states deterministically", () => {
    vi.useFakeTimers();

    const tooShort = renderController({ query: "s" });

    expect(tooShort.result.current.state).toBe("too-short");

    const empty = renderController({ query: "zzzz" });
    act(() => {
      vi.advanceTimersByTime(250);
    });

    expect(empty.result.current.state).toBe("empty");
  });

  it("debounces query changes while preserving the previous grouped result set", () => {
    vi.useFakeTimers();
    const { result, rerender } = renderController({ query: "chem" });
    act(() => {
      vi.advanceTimersByTime(250);
    });

    expect(result.current.groups[0]?.rows[0]?.event.id).toBe("chemistry");

    rerender({
      events: EVENTS,
      now: NOW,
      onDismiss: vi.fn<() => void>(),
      onReveal: vi.fn<(eventId: string, date: CalendarDate) => void>(),
      query: "history",
      timeZone: UTC,
    });

    expect(result.current.groups[0]?.rows[0]?.event.id).toBe("chemistry");

    act(() => {
      vi.advanceTimersByTime(250);
    });

    expect(result.current.groups[0]?.rows[0]?.event.id).toBe("history");
  });

  it("moves the roving focus index and clamps Home and End", () => {
    vi.useFakeTimers();
    const { result } = renderController({ query: "st" });
    act(() => {
      vi.advanceTimersByTime(250);
    });

    expect(result.current.resultCount).toBe(2);
    expect(result.current.focusedIndex).toBe(0);

    act(() => {
      result.current.handleRowKeyDown(keyDownEvent("ArrowDown"), 0);
    });

    expect(result.current.focusedIndex).toBe(1);

    act(() => {
      result.current.handleRowKeyDown(keyDownEvent("Home"), 1);
      result.current.handleRowKeyDown(keyDownEvent("End"), 0);
    });

    expect(result.current.focusedIndex).toBe(1);
  });

  it("reveals by focus index and ignores a missing row", () => {
    const onReveal = vi.fn<(eventId: string, date: CalendarDate) => void>();
    const { result } = renderController({ onReveal, query: "chem" });

    act(() => {
      result.current.revealRow(0);
      result.current.revealRow(99);
    });

    expect(onReveal).toHaveBeenCalledExactlyOnceWith("chemistry", "2026-08-24");
  });

  it("uses the injected instant and viewer zone when grouping results", () => {
    const { result } = renderController({
      now: utcInstant("2026-08-26T00:00:00.000Z"),
      query: "history",
    });

    expect(result.current.todayDate).toBe("2026-08-26");
    expect(result.current.currentInstant).toBe("2026-08-26T00:00:00.000Z");
  });

  it("focuses the registered row when the roving focus index advances", () => {
    vi.useFakeTimers();
    const { result } = renderController({ query: "st" });
    act(() => {
      vi.advanceTimersByTime(200);
    });

    const secondRow = document.createElement("button");
    const secondRowFocus = vi.spyOn(secondRow, "focus");
    act(() => {
      result.current.setRowRef(1, secondRow);
      result.current.handleRowKeyDown(keyDownEvent("ArrowDown"), 0);
    });

    expect(result.current.focusedIndex).toBe(1);
    expect(secondRowFocus).toHaveBeenCalledOnce();
  });

  it("clears a pending query debounce on unmount", () => {
    vi.useFakeTimers();
    const { unmount } = renderController({ query: "chem" });

    expect(vi.getTimerCount()).toBe(1);

    unmount();

    expect(vi.getTimerCount()).toBe(0);
  });
});
