import { describe, expect, it } from "vitest";

import { instant, UTC } from "../../__test-utils__/fixtures";
import { allocateAllDaySpans, bucketSegmentsByMonthWeekRow } from "../grid";
import type { GridEvent, ViewerDateEventSegment } from "../grid";
import { addCalendarDays, calendarDate } from "../model";
import type { CalendarDate } from "../model";

type LabeledEvent = GridEvent & { readonly label: string };

const makeLabeledSegment = (
  event: LabeledEvent,
  date: CalendarDate,
  key: string,
  segment: ViewerDateEventSegment["segment"]
): ViewerDateEventSegment<LabeledEvent> => ({
  date,
  end: event.end,
  event,
  key,
  segment,
  start: event.start,
});

describe("all-day span allocation", () => {
  it("preserves distinct duplicate-column policies and their output flags", () => {
    const firstEvent: LabeledEvent = {
      end: instant("2026-08-25", "00:00"),
      id: "duplicate",
      label: "first",
      start: instant("2026-08-24", "00:00"),
    };

    const duplicateEvent: LabeledEvent = {
      ...firstEvent,
      label: "duplicate",
    };

    const firstDate = calendarDate("2026-08-24");
    const secondDate = addCalendarDays(firstDate, 1);

    const dates = [firstDate, secondDate] as const;

    const duplicatedSegments = [
      makeLabeledSegment(firstEvent, firstDate, "duplicate:first", "start"),
      makeLabeledSegment(firstEvent, secondDate, "duplicate:last", "end"),
      makeLabeledSegment(
        duplicateEvent,
        secondDate,
        "duplicate:duplicate",
        "start"
      ),
    ] as const;

    const [span] = allocateAllDaySpans(duplicatedSegments, dates);
    const [fragment] = bucketSegmentsByMonthWeekRow(
      duplicatedSegments,
      calendarDate("2026-08-01"),
      UTC
    ).rows.flatMap(({ fragments }) => fragments);

    expect({
      continuesAfter: span?.continuesAfter,
      continuesBefore: span?.continuesBefore,
      eventLabel: span?.event.label,
    }).toMatchInlineSnapshot(`
      {
        "continuesAfter": false,
        "continuesBefore": false,
        "eventLabel": "first",
      }
    `);
    expect({
      continuesAfter: fragment?.continuesAfter,
      continuesBefore: fragment?.continuesBefore,
      eventLabel: fragment?.event.label,
    }).toMatchInlineSnapshot(`
      {
        "continuesAfter": false,
        "continuesBefore": false,
        "eventLabel": "first",
      }
    `);
    expect(span?.event).toBe(firstEvent);
    expect(fragment?.event).toBe(firstEvent);
  });
});
