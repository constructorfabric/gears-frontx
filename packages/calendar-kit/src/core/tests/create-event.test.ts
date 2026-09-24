import { describe, expect as assert, it } from "vitest";

import { timedDraft, UTC } from "../../__test-utils__/fixtures";
import { validateCreateEventDraft } from "../create-event";
import { calendarDate, parseLocalTime } from "../model";
import type {
  AllDayCreateEventDraft,
  CreateEventDraft,
  TimedCreateEventDraft,
} from "../model";

const START_DATE = calendarDate("2026-08-24");
const NEXT_DATE = calendarDate("2026-08-25");

const allDayDraft = (): AllDayCreateEventDraft => ({
  allDay: true,
  calendarId: "calendar-1",
  endDate: NEXT_DATE,
  endTime: null,
  startDate: START_DATE,
  startTime: null,
  timeZone: UTC,
  title: "Release day",
});

describe(validateCreateEventDraft, () => {
  it("accepts a complete timed draft without changing the supplied value", () => {
    const draft = timedDraft();
    const validation = validateCreateEventDraft(draft);

    assert(validation.valid).toBeTruthy();
    assert(validation.errors).toStrictEqual({});
    assert(draft).toStrictEqual(timedDraft());
  });

  it("rejects a whitespace-only title and reports the title field", () => {
    const draft: TimedCreateEventDraft = {
      ...timedDraft(),
      title: "  \n  ",
    };

    const validation = validateCreateEventDraft(draft);

    assert(validation.valid).toBeFalsy();
    assert(validation.errors.title).toBe("required");
  });

  it("rejects a timed range whose end precedes its start", () => {
    const draft: TimedCreateEventDraft = {
      ...timedDraft(),
      endTime: parseLocalTime("14:45"),
      startTime: parseLocalTime("15:00"),
    };

    const validation = validateCreateEventDraft(draft);

    assert(validation.valid).toBeFalsy();
    assert(validation.errors.endTime).toBe("before-start");
  });

  it("rejects a cross-date range whose end date precedes its start date", () => {
    const draft: TimedCreateEventDraft = {
      ...timedDraft(),
      endDate: START_DATE,
      startDate: NEXT_DATE,
    };

    const validation = validateCreateEventDraft(draft);

    assert(validation.valid).toBeFalsy();
    assert(validation.errors.endDate).toBe("before-start");
  });

  it("accepts an all-day draft with an exclusive next-day end and null clocks", () => {
    const draft = allDayDraft();
    const validation = validateCreateEventDraft(draft);

    assert(validation.valid).toBeTruthy();
    assert(validation.errors).toStrictEqual({});
    assert(draft.startTime).toBeNull();
    assert(draft.endTime).toBeNull();
  });

  it("rejects an all-day draft with an empty exclusive date span", () => {
    const draft: AllDayCreateEventDraft = {
      ...allDayDraft(),
      endDate: START_DATE,
    };

    const validation = validateCreateEventDraft(draft);

    assert(validation.valid).toBeFalsy();
    assert(validation.errors.endDate).toBe("before-start");
  });

  it("accepts a custom weekly recurrence rule and preserves optional draft data", () => {
    const draft: TimedCreateEventDraft = {
      ...timedDraft(),
      attendeeIds: ["person-1", "person-2"],
      conferencingProviderId: "meet",
      description: "Bring the release checklist.",
      location: "Science Hall 204",
      recurrenceRule: "FREQ=WEEKLY;BYDAY=MO,WE",
    };

    const validation = validateCreateEventDraft(draft);

    assert(validation.valid).toBeTruthy();
    assert(validation.errors).toStrictEqual({});
  });

  it("rejects malformed recurrence instead of silently submitting it", () => {
    const draft: CreateEventDraft = {
      ...timedDraft(),
      recurrenceRule: "WEEKLY ON MONDAY",
    };

    const validation = validateCreateEventDraft(draft);

    assert(validation.valid).toBeFalsy();
    assert(validation.errors.recurrenceRule).toBe("invalid");
  });
});
