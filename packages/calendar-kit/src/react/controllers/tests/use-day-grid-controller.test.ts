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
  fromViewerDateTime,
  parseIanaTimeZone,
  parseLocalTime,
  toViewerDateTime,
  utcInstant,
} from "../../../core/model";
import type { CalendarQuickCreatePayload } from "../../slots";
import { useDayGridController } from "../use-day-grid-controller";

const DATE = calendarDate("2026-08-24");

const AUCKLAND = parseIanaTimeZone("Pacific/Auckland");
const LOS_ANGELES = parseIanaTimeZone("America/Los_Angeles");
const KIRITIMATI = parseIanaTimeZone("Pacific/Kiritimati");

const createAllDayEvent = (
  startDate: string,
  endDate: string,
  timeZone = KIRITIMATI
): CalendarEvent => ({
  allDay: true,
  attendees: [],
  calendarId: null,
  colorFamily: "turquoise",
  conferencingProviderId: null,
  description: "",
  endDate: calendarDate(endDate),
  endTime: null,
  id: `all-day-${startDate}`,
  location: null,
  recurrenceRule: null,
  startDate: calendarDate(startDate),
  startTime: null,
  timeZone,
  title: "All day",
});

const requiredPayload = (
  payload: CalendarQuickCreatePayload | undefined
): CalendarQuickCreatePayload => {
  if (payload === undefined) {
    throw new Error("Expected a quick-create payload");
  }

  return payload;
};

const renderDayFixture = () => {
  const onEventSelect =
    vi.fn<
      (event: CalendarEvent, context: CalendarEventRenderContext) => void
    >();
  const hook = renderHook(() =>
    useDayGridController({
      date: calendarDate("2026-08-24"),
      events: [
        {
          allDay: true,
          attendees: [],
          calendarId: null,
          colorFamily: "turquoise",
          conferencingProviderId: null,
          description: "",
          endDate: calendarDate("2026-08-26"),
          endTime: null,
          id: "all-day",
          location: null,
          recurrenceRule: null,
          startDate: calendarDate("2026-08-23"),
          startTime: null,
          timeZone: UTC,
          title: "All day",
        },
        {
          allDay: false,
          attendees: [],
          calendarId: null,
          colorFamily: "turquoise",
          conferencingProviderId: null,
          description: "",
          end: utcInstant("2026-08-24T10:00:00.000Z"),
          endDate: calendarDate("2026-08-24"),
          endTime: parseLocalTime("10:00"),
          id: "timed",
          location: null,
          recurrenceRule: null,
          start: utcInstant("2026-08-24T09:00:00.000Z"),
          startDate: calendarDate("2026-08-24"),
          startTime: parseLocalTime("09:00"),
          timeZone: UTC,
          title: "Timed",
        },
      ],
      onEventSelect,
      selectedEventId: "timed",
      timeZone: UTC,
    })
  );

  return { ...hook, onEventSelect };
};

describe(useDayGridController, () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-24T13:30:00.000Z"));
  });

  it("builds day ranges, segments, and geometry", () => {
    const { result } = renderDayFixture();

    expect(result.current.utcDayRange).toStrictEqual({
      end: "2026-08-25T00:00:00.000Z",
      start: "2026-08-24T00:00:00.000Z",
    });
    expect(result.current.slotStarts).toHaveLength(24);
    expect(result.current.allDaySegments[0]?.segment).toBe(
      VIEWER_DAY_SEGMENT.middle
    );
    expect(result.current.timedEvents[0]?.segment.event.id).toBe("timed");
    expect(result.current.timedEvents[0]?.geometry.width).toBe(98);
  });

  it("reports day state and selects an event", () => {
    const { result, onEventSelect } = renderDayFixture();

    expect(result.current.hasEvents).toBeTruthy();
    expect(result.current.isWorkingDay).toBeTruthy();
    expect(result.current.nowPercent).toBe(56.25);
    expect(result.current.selectedEventId).toBe("timed");

    act(() => {
      result.current.selectEvent("all-day");
    });

    expect(onEventSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: "all-day" }),
      expect.objectContaining({
        event: expect.objectContaining({
          id: "all-day",
        }) as unknown,
      }),
      undefined
    );
  });

  it("keeps all-day events on their authored date across viewer time zones", () => {
    const event = createAllDayEvent("2026-08-26", "2026-08-27");

    for (const timeZone of [UTC, AUCKLAND, LOS_ANGELES]) {
      const { result } = renderHook(() =>
        useDayGridController({
          date: calendarDate("2026-08-26"),
          events: [event],
          timeZone,
        })
      );

      expect(
        result.current.allDaySegments.map((segment) => segment.event.id)
      ).toStrictEqual([event.id]);
    }
  });

  it("treats all-day endDate as an exclusive boundary", () => {
    const event = createAllDayEvent("2026-08-26", "2026-08-28");

    const segments = ["2026-08-26", "2026-08-27", "2026-08-28"].map((date) => {
      const { result } = renderHook(() =>
        useDayGridController({
          date: calendarDate(date),
          events: [event],
          timeZone: UTC,
        })
      );

      return result.current.allDaySegments;
    });

    expect(
      segments.map((daySegments) =>
        daySegments.map((segment) => segment.segment)
      )
    ).toStrictEqual([[VIEWER_DAY_SEGMENT.start], [VIEWER_DAY_SEGMENT.end], []]);
  });

  it("ignores missing events and malformed timed intervals without breaking the day model", () => {
    const malformed: CalendarEvent = {
      allDay: false,
      colorFamily: "turquoise",
      end: utcInstant("2026-08-24T10:00:00.000Z"),
      endDate: DATE,
      endTime: parseLocalTime("10:00"),
      id: "malformed",
      start: utcInstant("2026-08-24T09:00:00.000Z"),
      startDate: DATE,
      startTime: parseLocalTime("09:00"),
      timeZone: UTC,
      title: "Malformed",
    };
    Object.defineProperty(malformed, "start", { value: "not-an-instant" });

    const { result } = renderHook(() =>
      useDayGridController({ date: DATE, events: [malformed], timeZone: UTC })
    );

    act(() => {
      result.current.selectEvent("missing");
    });

    expect(result.current.timedEvents).toHaveLength(0);
    expect(result.current.selectedEventId).toBeNull();
  });

  it("refreshes the current instant after the clock advances", () => {
    vi.setSystemTime(new Date("2026-08-24T09:00:00.000Z"));

    const { result } = renderHook(() =>
      useDayGridController({ date: DATE, events: [], timeZone: UTC })
    );

    expect(result.current.currentInstant).toBe("2026-08-24T09:00:00.000Z");

    act(() => {
      vi.advanceTimersByTime(30_000);
    });

    expect(result.current.currentInstant).toBe("2026-08-24T09:00:30.000Z");
  });

  it("moves focus through registered grid cells with keyboard handlers", () => {
    const { result } = renderHook(() =>
      useDayGridController({
        date: calendarDate("2026-08-24"),
        events: [],
        timeZone: UTC,
      })
    );

    const hourEight = document.createElement("div");
    const hourNine = document.createElement("div");
    hourEight.tabIndex = 0;
    hourNine.tabIndex = 0;
    document.body.append(hourEight, hourNine);

    act(() => {
      result.current.setCellRef(8, hourEight);
      result.current.setCellRef(9, hourNine);
      result.current.handleCellKeyDown(keyDownEvent("ArrowDown"), 8);
    });

    expect(result.current.focusedCellIndex).toBe(9);
    expect(document.activeElement).toBe(hourNine);
    hourEight.remove();
    hourNine.remove();
  });

  it("clips a spanning event to the viewer day and reports its boundaries", () => {
    const clipped: CalendarEvent = {
      allDay: false,
      attendees: [],
      calendarId: null,
      colorFamily: "turquoise",
      conferencingProviderId: null,
      description: "",
      end: utcInstant("2026-08-25T02:00:00.000Z"),
      endDate: calendarDate("2026-08-25"),
      endTime: parseLocalTime("02:00"),
      id: "clipped",
      location: null,
      recurrenceRule: null,
      start: utcInstant("2026-08-23T23:00:00.000Z"),
      startDate: calendarDate("2026-08-23"),
      startTime: parseLocalTime("23:00"),
      timeZone: UTC,
      title: "Clipped",
    };

    const { result } = renderHook(() =>
      useDayGridController({
        date: DATE,
        events: [clipped],
        now: utcInstant("2026-08-24T12:00:00.000Z"),
        timeZone: UTC,
      })
    );

    expect(result.current.timedEvents[0]?.segment).toMatchObject({
      date: DATE,
      start: utcInstant("2026-08-24T00:00:00.000Z"),
    });
    expect(result.current.timedEvents[0]?.segment.end).toBe(
      utcInstant("2026-08-25T00:00:00.000Z")
    );
  });

  it("starts a viewer day at its first hour boundary", () => {
    const { result } = renderHook(() =>
      useDayGridController({
        date: calendarDate("2025-09-04"),
        events: [],
        now: utcInstant("2025-09-04T12:00:00.000Z"),
        timeZone: UTC,
      })
    );

    expect(result.current.slotStarts[0]).toBe(
      utcInstant("2025-09-04T00:00:00.000Z")
    );
  });

  it("keeps controlled day selection authoritative across rerenders", () => {
    const onSelectedEventIdChange = vi.fn<(eventId: string | null) => void>();

    const event: CalendarEvent = {
      allDay: false,
      attendees: [],
      calendarId: null,
      colorFamily: "turquoise",
      conferencingProviderId: null,
      description: "",
      end: utcInstant("2026-08-24T10:00:00.000Z"),
      endDate: DATE,
      endTime: parseLocalTime("10:00"),
      id: "selected",
      location: null,
      recurrenceRule: null,
      start: utcInstant("2026-08-24T09:00:00.000Z"),
      startDate: DATE,
      startTime: parseLocalTime("09:00"),
      timeZone: UTC,
      title: "Selected",
    };

    const day = renderHook(
      (selectedEventId: string | null | undefined) =>
        useDayGridController({
          date: DATE,
          events: [event],
          now: utcInstant("2026-08-24T12:00:00.000Z"),
          onSelectedEventIdChange,
          selectedEventId,
          timeZone: UTC,
        }),
      { initialProps: "other" }
    );

    act(() => {
      day.result.current.selectEvent("selected");
    });

    expect(onSelectedEventIdChange).toHaveBeenCalledWith("selected");
    expect(day.result.current.selectedEventId).toBe("other");

    day.rerender("selected");

    expect(day.result.current.selectedEventId).toBe("selected");
  });

  it("reports an empty day's initial public state across reads", () => {
    const emptyEvents: readonly CalendarEvent[] = [];

    const { result, rerender } = renderHook(() =>
      useDayGridController({
        date: DATE,
        events: emptyEvents,
        now: utcInstant("2026-08-24T12:00:00.000Z"),
        timeZone: UTC,
      })
    );

    expect(result.current.focusedCellIndex).toBe(8);
    expect(result.current.hasEvents).toBeFalsy();
    expect(result.current.timedEvents).toHaveLength(0);

    rerender();

    expect(result.current.focusedCellIndex).toBe(8);
    expect(result.current.hasEvents).toBeFalsy();
  });

  it("emits one quick-create payload carrying the anchor rectangle", () => {
    const onEventSelect = vi.fn<() => void>();
    const onQuickCreate =
      vi.fn<(payload: CalendarQuickCreatePayload) => void>();

    const occupied: CalendarEvent = {
      allDay: false,
      attendees: [],
      calendarId: null,
      colorFamily: "turquoise",
      conferencingProviderId: null,
      description: "",
      end: utcInstant("2026-08-24T10:00:00.000Z"),
      endDate: DATE,
      endTime: parseLocalTime("10:00"),
      id: "occupied",
      location: null,
      recurrenceRule: null,
      start: utcInstant("2026-08-24T09:00:00.000Z"),
      startDate: DATE,
      startTime: parseLocalTime("09:00"),
      timeZone: UTC,
      title: "Occupied",
    };

    const { result } = renderHook(() =>
      useDayGridController({
        date: DATE,
        events: [occupied],
        now: utcInstant("2026-08-24T12:00:00.000Z"),
        onEventSelect,
        onQuickCreate,
        timeZone: UTC,
      })
    );

    const anchor = document.createElement("div");
    const anchorRect = new DOMRect(10, 0, 10, 10);

    act(() => {
      result.current.selectEmptyCell(8, anchor, anchorRect);
      result.current.selectEmptyCell(9, anchor, anchorRect);
      result.current.selectEvent("occupied");
    });

    expect(onQuickCreate).toHaveBeenCalledOnce();

    expect(requiredPayload(onQuickCreate.mock.calls[0]?.[0]).anchorRect).toBe(
      anchorRect
    );
    expect(onEventSelect).toHaveBeenCalledOnce();
  });
});

const NEW_YORK = parseIanaTimeZone("America/New_York");

const dstAfternoonEvent = (date: string): CalendarEvent => {
  const startDate = calendarDate(date);

  return {
    allDay: false,
    attendees: [],
    calendarId: null,
    colorFamily: "turquoise",
    conferencingProviderId: null,
    description: "",
    end: fromViewerDateTime({
      date: startDate,
      time: "16:00",
      timeZone: NEW_YORK,
    }),
    endDate: startDate,
    endTime: parseLocalTime("16:00"),
    id: `event-${date}`,
    location: null,
    recurrenceRule: null,
    start: fromViewerDateTime({
      date: startDate,
      time: "15:00",
      timeZone: NEW_YORK,
    }),
    startDate,
    startTime: parseLocalTime("15:00"),
    timeZone: NEW_YORK,
    title: "Afternoon event",
  };
};

describe("day-grid rows across a DST transition", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-24T13:30:00.000Z"));
  });

  it.each([
    { date: "2026-03-08", repeatedOneAmRows: 1, rowCount: 23 },
    { date: "2026-11-01", repeatedOneAmRows: 2, rowCount: 25 },
  ])(
    "aligns real-hour rows and events on $date",
    ({ date, rowCount, repeatedOneAmRows }) => {
      const { result } = renderHook(() =>
        useDayGridController({
          date: calendarDate(date),
          events: [dstAfternoonEvent(date)],
          timeZone: NEW_YORK,
        })
      );

      expect(result.current.slotStarts).toHaveLength(rowCount);
      expect(
        result.current.slotStarts.filter(
          (instant) => toViewerDateTime(instant, NEW_YORK).time === "01:00"
        )
      ).toHaveLength(repeatedOneAmRows);

      const rowIndex = result.current.slotStarts.findIndex(
        (instant) => toViewerDateTime(instant, NEW_YORK).time === "15:00"
      );

      const [placement] = result.current.timedEvents;

      if (placement === undefined) {
        throw new Error("Expected a timed event placement");
      }

      expect(rowIndex).toBeGreaterThanOrEqual(0);
      expect(placement.segment.segment).toBeNull();
      expect(placement.topPercent).toBeCloseTo((rowIndex / rowCount) * 100, 8);
    }
  );

  it("reports 23- and 25-hour day durations for DST days", () => {
    for (const { date, hours } of [
      { date: "2025-03-09", hours: 23 },
      { date: "2025-11-02", hours: 25 },
    ]) {
      const { result } = renderHook(() =>
        useDayGridController({
          date: calendarDate(date),
          events: [],
          now: utcInstant("2025-09-10T12:00:00.000Z"),
          timeZone: NEW_YORK,
        })
      );

      expect(result.current.slotStarts).toHaveLength(hours);
      expect(result.current.axisDuration).toBe(hours * 60 * 60 * 1000);
    }
  });

  it("measures a clipped event height against the elapsed DST day", () => {
    const { result } = renderHook(() =>
      useDayGridController({
        date: calendarDate("2025-03-09"),
        events: [dstAfternoonEvent("2025-03-09")],
        now: utcInstant("2025-03-09T17:30:00.000Z"),
        timeZone: NEW_YORK,
      })
    );

    const [placement] = result.current.timedEvents;

    if (placement === undefined) {
      throw new Error("Expected a timed event placement");
    }

    expect(placement.heightPercent).toBeCloseTo(100 / 23, 8);
  });
});
