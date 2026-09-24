import { describe, expect as assert, it } from "vitest";

import { instant, makeEvent, UTC } from "../../__test-utils__/fixtures";
import {
  allocateAllDaySpans,
  bucketSegmentsByMonthWeekRow,
  calculateDayColumnGeometry,
  calculateMonthCellCapacity,
  layoutTimedEvents,
  segmentAllDayEventAcrossViewerDates,
  segmentEventsAcrossViewerDates,
} from "../grid";
import type { GridEvent, ViewerDateEventSegment } from "../grid";
import {
  VIEWER_DAY_SEGMENT,
  addCalendarDays,
  calendarDate,
  parseIanaTimeZone,
} from "../model";

const DATES = [
  calendarDate("2026-08-24"),
  calendarDate("2026-08-25"),
  calendarDate("2026-08-26"),
  calendarDate("2026-08-27"),
  calendarDate("2026-08-28"),
  calendarDate("2026-08-29"),
  calendarDate("2026-08-30"),
  calendarDate("2026-08-31"),
] as const;

const segmentForOffset = (
  offset: number,
  length: number
): ViewerDateEventSegment["segment"] => {
  if (length === 1) {
    return null;
  }
  if (offset === 0) {
    return VIEWER_DAY_SEGMENT.start;
  }
  if (offset === length - 1) {
    return VIEWER_DAY_SEGMENT.end;
  }
  return VIEWER_DAY_SEGMENT.middle;
};

describe("calendar grid geometry", () => {
  it("uses elapsed milliseconds for a 23-hour DST day", () => {
    const date = calendarDate("2026-03-29");
    const zone = parseIanaTimeZone("Europe/Berlin");

    const geometry = calculateDayColumnGeometry({
      end: instant(date, "04:00", zone),
      start: instant(date, "01:00", zone),
      timeZone: zone,
      viewerDate: date,
    });

    assert(geometry.duration).toBe(23 * 60 * 60 * 1000);
    assert(geometry.startPercentOfDay).toBeCloseTo((1 / 23) * 100, 8);
    assert(geometry.endPercentOfDay).toBeCloseTo((3 / 23) * 100, 8);
  });

  it("reports a 25-hour DST day and exact full-day boundaries", () => {
    const date = calendarDate("2026-10-25");
    const zone = parseIanaTimeZone("Europe/Berlin");

    const geometry = calculateDayColumnGeometry({
      end: instant(addCalendarDays(date, 1), "00:00", zone),
      start: instant(date, "00:00", zone),
      timeZone: zone,
      viewerDate: date,
    });

    assert(geometry.duration).toBe(25 * 60 * 60 * 1000);
    assert(geometry.startPercentOfDay).toBe(0);
    assert(geometry.endPercentOfDay).toBe(100);
  });

  it.each([
    ["zero length", "09:00", "09:00"],
    ["inverted", "10:00", "09:00"],
  ])("rejects a %s clipped interval", (_name, startTime, endTime) => {
    const date = calendarDate("2026-08-24");
    assert(() =>
      calculateDayColumnGeometry({
        end: instant(date, endTime, UTC),
        start: instant(date, startTime, UTC),
        timeZone: UTC,
        viewerDate: date,
      })
    ).toThrow(RangeError);
  });
});

describe("calendar event segmentation", () => {
  it("clips timed events to viewer dates, marks continuation edges, and preserves input order", () => {
    const dates = DATES.slice(0, 3);

    const events = [
      {
        end: instant(calendarDate("2026-08-25"), "02:00", UTC),
        id: "multi",
        start: instant(calendarDate("2026-08-23"), "23:00", UTC),
      },
      {
        end: instant(calendarDate("2026-08-24"), "11:00", UTC),
        id: "single",
        start: instant(calendarDate("2026-08-24"), "10:00", UTC),
      },
      {
        end: instant(calendarDate("2026-09-10"), "11:00", UTC),
        id: "outside",
        start: instant(calendarDate("2026-09-10"), "10:00", UTC),
      },
    ] satisfies readonly GridEvent[];

    const segments = segmentEventsAcrossViewerDates(events, dates, UTC);

    assert(
      segments.map(({ key, event, date, segment }) => ({
        date,
        id: event.id,
        key,
        segment,
      }))
    ).toStrictEqual([
      {
        date: "2026-08-24",
        id: "multi",
        key: "multi:2026-08-24",
        segment: VIEWER_DAY_SEGMENT.middle,
      },
      {
        date: "2026-08-25",
        id: "multi",
        key: "multi:2026-08-25",
        segment: VIEWER_DAY_SEGMENT.end,
      },
      {
        date: "2026-08-24",
        id: "single",
        key: "single:2026-08-24",
        segment: null,
      },
    ]);
    assert(segments[0]?.start).toBe(
      instant(calendarDate("2026-08-24"), "00:00", UTC)
    );
    assert(segments[1]?.end).toBe(
      instant(calendarDate("2026-08-25"), "02:00", UTC)
    );
  });

  it("ignores zero-length, inverted, and exclusive-end intervals", () => {
    const date = calendarDate("2026-08-24");
    const start = instant(date, "00:00", UTC);

    const events = [
      { end: start, id: "zero", start },
      {
        end: instant(date, "11:00", UTC),
        id: "inverted",
        start: instant(date, "12:00", UTC),
      },
      {
        end: start,
        id: "before",
        start: instant(calendarDate("2026-08-23"), "22:00", UTC),
      },
    ] satisfies readonly GridEvent[];

    assert(segmentEventsAcrossViewerDates(events, [date], UTC)).toStrictEqual(
      []
    );
    assert(segmentEventsAcrossViewerDates(events, [], UTC)).toStrictEqual([]);
  });

  it("rejects malformed instants instead of manufacturing a segment", () => {
    const date = calendarDate("2026-08-24");

    const malformed = {
      end: instant(date, "10:00", UTC),
      id: "malformed",
      start: instant(date, "09:00", UTC),
    } satisfies GridEvent;
    Object.defineProperty(malformed, "start", { value: "not-an-instant" });

    assert(() =>
      segmentEventsAcrossViewerDates([malformed], [date], UTC)
    ).toThrow(RangeError);

    const malformedAllDay = {
      endDate: calendarDate("2026-08-25"),
      id: "malformed-all-day",
      startDate: calendarDate("2026-08-24"),
    };
    Object.defineProperty(malformedAllDay, "startDate", {
      value: "2026-02-30",
    });

    assert(() =>
      segmentAllDayEventAcrossViewerDates(malformedAllDay, [date], UTC)
    ).toThrow(RangeError);
  });

  it("segments all-day events by exclusive viewer dates, not elapsed instants", () => {
    const event = {
      endDate: calendarDate("2026-08-27"),
      id: "all-day",
      startDate: calendarDate("2026-08-24"),
    };

    const segments = segmentAllDayEventAcrossViewerDates(
      event,
      DATES.slice(0, 4),
      UTC
    );

    assert(
      segments.map(({ date, segment }) => ({ date, segment }))
    ).toStrictEqual([
      { date: "2026-08-24", segment: "start" },
      { date: "2026-08-25", segment: "middle" },
      { date: "2026-08-26", segment: "end" },
    ]);
    assert(
      segments.every(({ start, end }) => Date.parse(end) > Date.parse(start))
    ).toBeTruthy();
  });

  it("marks a one-day all-day event as neither a continuation nor a middle segment", () => {
    const segments = segmentAllDayEventAcrossViewerDates(
      { endDate: DATES[3], id: "one-day", startDate: DATES[2] },
      DATES,
      UTC
    );

    assert(segments).toHaveLength(1);
    assert(segments[0]?.segment).toBeNull();
  });
});

describe("all-day and month allocation", () => {
  it("assigns deterministic non-overlapping lanes regardless of input order", () => {
    const eventSegments = (
      id: string,
      startColumn: number,
      endColumn: number
    ) => {
      const event: GridEvent = {
        allDay: true,
        end: instant(DATES[endColumn], "00:00", UTC),
        id,
        start: instant(DATES[startColumn], "00:00", UTC),
      };

      return Array.from({ length: endColumn - startColumn }, (_, offset) => ({
        date: DATES[startColumn + offset],
        end: event.end,
        event,
        key: `${id}:${DATES[startColumn + offset]}`,
        segment: segmentForOffset(offset, endColumn - startColumn),
        start: event.start,
      })) satisfies readonly ViewerDateEventSegment[];
    };

    const wide = eventSegments("wide", 0, 7);
    const short = eventSegments("short", 2, 4);
    const later = eventSegments("later", 4, 5);

    const first = allocateAllDaySpans([...wide, ...short, ...later], DATES);
    const second = allocateAllDaySpans([...later, ...wide, ...short], DATES);

    const firstLanes = new Map(
      first.map(({ event, lane }) => [event.id, lane])
    );
    const secondLanes = new Map(
      second.map(({ event, lane }) => [event.id, lane])
    );

    assert(firstLanes).toStrictEqual(secondLanes);
    assert(firstLanes).toStrictEqual(
      new Map([
        ["wide", 0],
        ["short", 1],
        ["later", 1],
      ])
    );
  });

  it("splits non-contiguous all-day segments instead of bridging a gap", () => {
    const event: GridEvent = {
      allDay: true,
      end: instant(DATES[3], "12:00", UTC),
      id: "gap",
      start: instant(DATES[0], "00:00", UTC),
    };

    const segments = [
      {
        date: DATES[0],
        end: event.end,
        event,
        key: "gap:0",
        segment: "start" as const,
        start: event.start,
      },
      {
        date: DATES[2],
        end: event.end,
        event,
        key: "gap:2",
        segment: "end" as const,
        start: event.start,
      },
      {
        date: calendarDate("2026-09-10"),
        end: event.end,
        event,
        key: "gap:outside",
        segment: null,
        start: event.start,
      },
    ];

    assert(
      allocateAllDaySpans(segments, DATES.slice(0, 3)).map(
        ({ key, startColumn, endColumn }) => ({ endColumn, key, startColumn })
      )
    ).toStrictEqual([
      { endColumn: 1, key: "gap:0-1", startColumn: 0 },
      { endColumn: 3, key: "gap:2-3", startColumn: 2 },
    ]);
  });

  it("computes month capacity and reserves one visible chip for overflow", () => {
    assert(
      calculateMonthCellCapacity({ cellHeight: 135.2, eventCount: 3 })
    ).toStrictEqual({
      capacity: 3,
      hiddenCount: 0,
      visibleCount: 3,
    });
    assert(
      calculateMonthCellCapacity({ cellHeight: 135.2, eventCount: 5 })
    ).toStrictEqual({
      capacity: 3,
      hiddenCount: 3,
      visibleCount: 2,
    });
    assert(
      calculateMonthCellCapacity({ cellHeight: 135.2, eventCount: 0 })
    ).toStrictEqual({
      capacity: 3,
      hiddenCount: 0,
      visibleCount: 0,
    });
    assert(
      calculateMonthCellCapacity({ cellHeight: 20, eventCount: 1 })
    ).toStrictEqual({
      capacity: 0,
      hiddenCount: 1,
      visibleCount: 0,
    });
    assert(() =>
      calculateMonthCellCapacity({ cellHeight: 0, eventCount: 1 })
    ).toThrow(RangeError);
    assert(() =>
      calculateMonthCellCapacity({ cellHeight: 100, eventCount: -1 })
    ).toThrow(RangeError);
    assert(() =>
      calculateMonthCellCapacity({ cellHeight: Number.NaN, eventCount: 1 })
    ).toThrow(RangeError);
    assert(() =>
      calculateMonthCellCapacity({ cellHeight: 100, eventCount: 1.5 })
    ).toThrow(RangeError);
  });

  it("returns complete Monday month rows with row-local continuation flags", () => {
    const displayDates = Array.from({ length: 42 }, (_, index) =>
      addCalendarDays(calendarDate("2026-08-24"), index)
    );

    const event: GridEvent = {
      allDay: true,
      end: instant(calendarDate("2026-09-10"), "00:00", UTC),
      id: "month-span",
      start: instant(calendarDate("2026-08-27"), "00:00", UTC),
    };

    const outside = makeEvent("outside", {
      startDate: calendarDate("2026-10-05"),
    });
    const segments = segmentEventsAcrossViewerDates(
      [event, outside],
      displayDates,
      UTC
    );
    const rows = bucketSegmentsByMonthWeekRow(
      segments,
      calendarDate("2026-09-01"),
      UTC
    );

    assert(rows.monthStart).toBe("2026-09-01");
    assert(rows.monthEndExclusive).toBe("2026-10-01");
    assert(rows.rows).toHaveLength(5);
    assert(rows.rows.every((row) => row.dates.length === 7)).toBeTruthy();
    assert(
      rows.rows
        .flatMap((row) => row.fragments)
        .map(({ rowIndex, continuesBefore, continuesAfter }) => ({
          continuesAfter,
          continuesBefore,
          rowIndex,
        }))
    ).toStrictEqual([
      { continuesAfter: true, continuesBefore: false, rowIndex: 0 },
      { continuesAfter: false, continuesBefore: true, rowIndex: 1 },
    ]);
    assert(
      rows.rows.every((row) =>
        row.fragments.every((fragment) => fragment.event.id === "month-span")
      )
    ).toBeTruthy();
  });

  it("allocates all-day spans by contiguous visible dates with continuation flags", () => {
    const source = makeEvent("all-day");

    const segments = segmentAllDayEventAcrossViewerDates(
      {
        endDate: DATES[5],
        id: source.id,
        startDate: DATES[1],
      },
      DATES.slice(0, 7),
      UTC
    );

    const spans = allocateAllDaySpans(segments, DATES.slice(0, 7));

    const [span] = spans;

    if (span === undefined) {
      throw new Error("expected an all-day span");
    }

    assert(span.event.id).toBe("all-day");
    assert({ ...span, event: undefined }).toStrictEqual({
      continuesAfter: false,
      continuesBefore: false,
      endColumn: 5,
      event: undefined,
      key: "all-day:1-5",
      lane: 0,
      startColumn: 1,
    });
    assert(
      segmentAllDayEventAcrossViewerDates(
        { endDate: DATES[3], id: "empty", startDate: DATES[3] },
        DATES,
        UTC
      )
    ).toStrictEqual([]);
  });

  it("sorts equal-start spans by width and then by event id before assigning lanes", () => {
    const wide = segmentAllDayEventAcrossViewerDates(
      { endDate: DATES[3], id: "wide", startDate: DATES[0] },
      DATES,
      UTC
    );

    const alpha = segmentAllDayEventAcrossViewerDates(
      { endDate: DATES[2], id: "alpha", startDate: DATES[0] },
      DATES,
      UTC
    );

    const beta = segmentAllDayEventAcrossViewerDates(
      { endDate: DATES[2], id: "beta", startDate: DATES[0] },
      DATES,
      UTC
    );

    const spans = allocateAllDaySpans([...beta, ...wide, ...alpha], DATES);

    assert(
      new Map(spans.map(({ event: spanEvent, lane }) => [spanEvent.id, lane]))
    ).toStrictEqual(
      new Map([
        ["wide", 0],
        ["alpha", 1],
        ["beta", 2],
      ])
    );
  });

  it("tracks month fragments across row edges and splits non-contiguous row runs", () => {
    const monthDate = calendarDate("2026-09-01");
    const displayDates = Array.from({ length: 42 }, (_, index) =>
      addCalendarDays(calendarDate("2026-08-24"), index)
    );

    const edgeEvent = {
      end: instant(calendarDate("2026-09-08"), "10:00"),
      id: "edge",
      start: instant(calendarDate("2026-09-06"), "09:00"),
    };

    const mondayEvent = makeEvent("monday", {
      startDate: calendarDate("2026-09-07"),
    });

    const edgeRows = bucketSegmentsByMonthWeekRow(
      segmentEventsAcrossViewerDates(
        [edgeEvent, mondayEvent],
        displayDates,
        UTC
      ),
      monthDate,
      UTC
    );

    const edgeFragments = edgeRows.rows
      .flatMap((row) => row.fragments)
      .filter((fragment) => fragment.event.id === "edge");
    const mondayFragment = edgeRows.rows
      .flatMap((row) => row.fragments)
      .find((fragment) => fragment.event.id === "monday");

    assert(edgeFragments).toStrictEqual([
      assert.objectContaining({
        continuesAfter: true,
        rowIndex: 0,
        startColumn: 6,
      }),
      assert.objectContaining({
        continuesBefore: true,
        rowIndex: 1,
        startColumn: 0,
      }),
    ]);
    assert(mondayFragment).toStrictEqual(
      assert.objectContaining({
        continuesBefore: false,
        rowIndex: 1,
        startColumn: 0,
      })
    );

    const fragmentEvent = makeEvent("fragment");

    const disjointSegments = [
      {
        date: calendarDate("2026-08-31"),
        end: fragmentEvent.end,
        event: fragmentEvent,
        key: "fragment:aug31",
        segment: null,
        start: fragmentEvent.start,
      },
      {
        date: calendarDate("2026-09-02"),
        end: fragmentEvent.end,
        event: fragmentEvent,
        key: "fragment:sep2",
        segment: null,
        start: fragmentEvent.start,
      },
    ] satisfies readonly ViewerDateEventSegment[];

    const disjointRows = bucketSegmentsByMonthWeekRow(
      disjointSegments,
      monthDate,
      UTC
    );

    assert(
      disjointRows.rows[0]?.fragments.map(({ startColumn, endColumn }) => ({
        endColumn,
        startColumn,
      }))
    ).toStrictEqual([
      { endColumn: 1, startColumn: 0 },
      { endColumn: 3, startColumn: 2 },
    ]);
  });
});

describe("timed overlap layout", () => {
  it("produces stable, non-negative overlap geometry and z ordering", () => {
    const events = [
      {
        end: instant(DATES[0], "11:00", UTC),
        id: "first",
        start: instant(DATES[0], "09:00", UTC),
      },
      {
        end: instant(DATES[0], "12:00", UTC),
        id: "second",
        start: instant(DATES[0], "10:00", UTC),
      },
      {
        end: instant(DATES[0], "14:00", UTC),
        id: "third",
        start: instant(DATES[0], "13:00", UTC),
      },
    ];

    const geometry = layoutTimedEvents(events);
    assert(geometry.map(({ id }) => id)).toStrictEqual([
      "first",
      "second",
      "third",
    ]);
    assert(geometry[0]?.width).toBeGreaterThanOrEqual(4);
    assert(
      geometry.every(
        ({ left, width }) => left >= 0 && width > 0 && left + width <= 98
      )
    ).toBeTruthy();
    assert(geometry[0]?.groupIndex).toBe(0);
    assert(geometry[2]?.groupIndex).toBe(1);
  });
});
