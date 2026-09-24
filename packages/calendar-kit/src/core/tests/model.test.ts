import { describe, expect as assert, it } from "vitest";

import { timedEvent, UTC } from "../../__test-utils__/fixtures";
import {
  addCalendarDays,
  calendarDate,
  fromViewerDateTime,
  parseIanaTimeZone,
  parseLocalTime,
  utcInstant,
} from "../model";
import type {
  CalendarConflict,
  CalendarEvent,
  CalendarSelectionRange,
} from "../model";

interface CourseMetadata {
  readonly courseCode: string;
  readonly classroom: string;
}

const buildCell = (
  date: ReturnType<typeof calendarDate>,
  startTime: string,
  endTime: string
) =>
  ({
    date,
    end: utcInstant(`${date}T${endTime}:00.000Z`),
    endTime: parseLocalTime(endTime),
    start: utcInstant(`${date}T${startTime}:00.000Z`),
    startTime: parseLocalTime(startTime),
  }) as const;

describe("calendar core model", () => {
  it("keeps branded temporal values canonical and viewer-local", () => {
    const date = calendarDate("2026-08-24");
    const nextDate = addCalendarDays(date, 1);
    const zone = parseIanaTimeZone("Europe/Berlin");
    const instant = fromViewerDateTime({
      date,
      time: parseLocalTime("09:30"),
      timeZone: zone,
    });

    assert(date).toBe("2026-08-24");
    assert(nextDate).toBe("2026-08-25");
    assert(parseLocalTime("09:30")).toBe("09:30");
    assert(zone).toBe("Europe/Berlin");
    assert(instant).toMatch(/^2026-08-24T07:30:00\.000Z$/u);
  });

  it("keeps all-day end dates exclusive and timed end dates nullable only where the contract permits", () => {
    const allDay: CalendarEvent = {
      allDay: true,
      colorFamily: "purple",
      endDate: calendarDate("2026-08-27"),
      endTime: null,
      id: "all-day",
      startDate: calendarDate("2026-08-24"),
      startTime: null,
      timeZone: UTC,
      title: "Conference",
    };

    const timed = timedEvent({ endTime: null });

    assert(allDay.endDate).toBe("2026-08-27");
    assert(allDay.startTime).toBeNull();
    assert(allDay.endTime).toBeNull();
    assert(timed.endTime).toBeNull();
  });

  it("keeps selection ranges serializable and ordered by their cells", () => {
    const start = buildCell(calendarDate("2026-08-24"), "09:00", "10:00");
    const end = buildCell(calendarDate("2026-08-24"), "10:00", "11:00");

    const range: CalendarSelectionRange = { cells: [start, end], end, start };

    assert(range.cells[0]?.start).toBe(range.start.start);
    assert(range.cells.at(-1)?.end).toBe(range.end.end);
    assert(Date.parse(range.cells[0].start)).toBeLessThan(
      Date.parse(range.cells[1].start)
    );
  });
});

describe("calendar core model contracts", () => {
  it("keeps product metadata and conflict dimensions opaque to the neutral event model", () => {
    const zone = parseIanaTimeZone("UTC");

    const conflict: CalendarConflict = {
      dimension: "classroom",
      id: "conflict-1",
      label: "Classroom conflict",
      severity: "warning",
    };

    const event: CalendarEvent<CourseMetadata> = {
      allDay: false,
      colorFamily: "turquoise",
      conflicts: [conflict],
      end: utcInstant("2026-08-24T10:00:00.000Z"),
      endDate: calendarDate("2026-08-24"),
      endTime: parseLocalTime("10:00"),
      id: "course-1",
      metadata: { classroom: "A-12", courseCode: "CS-101" },
      start: utcInstant("2026-08-24T09:00:00.000Z"),
      startDate: calendarDate("2026-08-24"),
      startTime: parseLocalTime("09:00"),
      timeZone: zone,
      title: "Algorithms",
    };

    assert(event.metadata).toStrictEqual({
      classroom: "A-12",
      courseCode: "CS-101",
    });
    assert(event.conflicts?.[0]).toStrictEqual(conflict);
  });

  it("represents an exclusive all-day span and an ordered serializable selection", () => {
    const date = calendarDate("2026-08-24");
    const start = buildCell(date, "09:00", "10:00");
    const end = buildCell(date, "10:00", "11:00");

    const selection: CalendarSelectionRange = {
      cells: [start, end],
      end,
      start,
    };

    const allDay: CalendarEvent = {
      allDay: true,
      colorFamily: "purple",
      endDate: calendarDate("2026-08-27"),
      endTime: null,
      id: "holiday",
      startDate: date,
      startTime: null,
      timeZone: parseIanaTimeZone("UTC"),
      title: "Holiday",
    };

    assert(allDay.endDate).toBe("2026-08-27");
    assert(selection.cells).toStrictEqual([selection.start, selection.end]);
    assert(structuredClone(selection)).toMatchObject({
      end: { date: "2026-08-24", startTime: "10:00" },
      start: { date: "2026-08-24", startTime: "09:00" },
    });
  });
});
