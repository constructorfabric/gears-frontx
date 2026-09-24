import { describe, expect as assert, it } from "vitest";

import { UTC } from "../../__test-utils__/fixtures";
import {
  buildSelectionRange,
  createInteractionState,
  transitionInteraction,
  validateInteractionEvent,
} from "../interactions";
import {
  addCalendarDays,
  calendarDate,
  fromViewerDateTime,
  parseIanaTimeZone,
  parseLocalTime,
  utcInstant,
} from "../model";
import type {
  CalendarCell,
  CalendarEvent,
  WeekGridInteractionMode,
} from "../model";

const cell = (
  date: string,
  startTime: string,
  endTime = `${String(Number(startTime.slice(0, 2)) + 1).padStart(2, "0")}:00`
): CalendarCell => {
  const startDate = calendarDate(date);

  const endDate =
    endTime <= startTime ? addCalendarDays(startDate, 1) : startDate;

  return {
    date: startDate,
    end: fromViewerDateTime({ date: endDate, time: endTime, timeZone: UTC }),
    endTime: parseLocalTime(endTime),
    start: fromViewerDateTime({
      date: startDate,
      time: startTime,
      timeZone: UTC,
    }),
    startTime: parseLocalTime(startTime),
  };
};

const first = cell("2026-08-24", "09:00");

const second = cell("2026-08-24", "10:00");

const third = cell("2026-08-24", "11:00");

const event: CalendarEvent = {
  allDay: false,
  colorFamily: "turquoise",
  end: first.end,
  endDate: first.date,
  endTime: first.endTime,
  id: "event-1",
  start: first.start,
  startDate: first.date,
  startTime: first.startTime,
  timeZone: UTC,
  title: "Move me",
};

describe("core interaction state machine", () => {
  it.each<WeekGridInteractionMode>([
    "quick-create",
    "paint-and-move",
    "read-only",
  ])(
    "creates a state for the %s mode without inferring permissions from events",
    (mode) => {
      const state = createInteractionState(mode);
      assert(state.mode).toBe(mode);
      assert(state.paint).toBeNull();
      assert(state.pendingMove).toBeNull();
    }
  );

  it("rejects an invalid interaction mode at the core boundary", () => {
    assert(() =>
      (() => {
        const value = { mode: "quick-create" as const };
        Object.defineProperty(value, "mode", { value: "edit-anything" });

        return createInteractionState(value.mode);
      })()
    ).toThrow(RangeError);
  });

  it("paints a range in chronological cell order even when pointer travel is reversed", () => {
    const state = createInteractionState("paint-and-move");
    const started = transitionInteraction(state, {
      cell: third,
      type: "paint-start",
    });
    const updated = transitionInteraction(started, {
      cell: first,
      type: "paint-update",
    });
    const finished = transitionInteraction(updated, { type: "paint-end" });

    assert(finished.paint).toStrictEqual({
      cells: [first, second, third],
      end: third,
      start: first,
    });
  });

  it("does not emit a paint result from read-only mode", () => {
    const state = createInteractionState("read-only");
    const started = transitionInteraction(state, {
      cell: first,
      type: "paint-start",
    });
    const finished = transitionInteraction(started, { type: "paint-end" });

    assert(finished.paint).toBeNull();
    assert(finished.pendingMove).toBeNull();
  });

  it("keeps a move pending until confirm and makes cancel discard it", () => {
    const state = createInteractionState("paint-and-move");
    const pending = transitionInteraction(state, {
      event,
      from: first,
      type: "move-start",
    });
    const requested = transitionInteraction(pending, {
      to: second,
      type: "move-target",
    });

    assert(requested.pendingMove).toStrictEqual({
      event,
      from: first,
      to: second,
    });
    assert(requested.committedMove).toBeNull();

    const canceled = transitionInteraction(requested, { type: "move-cancel" });

    assert(canceled.pendingMove).toBeNull();
    assert(canceled.committedMove).toBeNull();

    const pendingAgain = transitionInteraction(state, {
      event,
      from: first,
      type: "move-start",
    });
    const requestedAgain = transitionInteraction(pendingAgain, {
      to: second,
      type: "move-target",
    });
    const confirmed = transitionInteraction(requestedAgain, {
      type: "move-confirm",
    });

    assert(confirmed.pendingMove).toBeNull();
    assert(confirmed.committedMove).toStrictEqual({
      event,
      from: first,
      to: second,
    });
  });

  it("rejects move and paint actions in quick-create mode", () => {
    const state = createInteractionState("quick-create");
    const painted = transitionInteraction(state, {
      cell: first,
      type: "paint-start",
    });
    const moved = transitionInteraction(painted, {
      event,
      from: first,
      type: "move-start",
    });

    assert(painted.paint).toBeNull();
    assert(moved.pendingMove).toBeNull();
  });

  it("ignores malformed or missing targets instead of creating an inverted range", () => {
    const state = createInteractionState("paint-and-move");

    const malformedCell = { ...third };
    Object.defineProperty(malformedCell, "start", { value: "not-utc" });
    const malformed = transitionInteraction(state, {
      cell: malformedCell,
      type: "paint-update",
    });

    const missingTarget = transitionInteraction(
      transitionInteraction(state, { event, from: first, type: "move-start" }),
      { to: undefined, type: "move-target" }
    );

    assert(malformed.paint).toBeNull();
    assert(missingTarget.pendingMove).toBeNull();
  });
});

describe("additional calendar interaction contracts", () => {
  it("paints a chronological range, clears its anchor, and ignores inactive modes", () => {
    const started = transitionInteraction(
      createInteractionState("paint-and-move"),
      {
        cell: third,
        type: "paint-start",
      }
    );

    const updated = transitionInteraction(started, {
      cell: first,
      type: "paint-update",
    });
    const finished = transitionInteraction(updated, { type: "paint-end" });

    assert(finished.paint).toStrictEqual({
      cells: [first, second, third],
      end: third,
      start: first,
    });
    assert(finished.paintAnchor).toBeNull();
    assert(
      transitionInteraction(createInteractionState("paint-and-move"), {
        cell: first,
        type: "paint-update",
      })
    ).toStrictEqual(createInteractionState("paint-and-move"));
    assert(
      transitionInteraction(createInteractionState("quick-create"), {
        cell: first,
        type: "paint-start",
      }).paint
    ).toBeNull();
    assert(
      transitionInteraction(createInteractionState("read-only"), {
        type: "paint-end",
      }).paintAnchor
    ).toBeNull();
  });

  it("rejects malformed cells and preserves a valid single-cell selection", () => {
    assert(buildSelectionRange(first, first)).toStrictEqual({
      cells: [first],
      end: first,
      start: first,
    });
    const malformed = { ...first };
    Object.defineProperty(malformed, "start", { value: "not-an-instant" });
    assert(buildSelectionRange(malformed, third)).toBeNull();
    assert(buildSelectionRange(first, malformed)).toBeNull();
  });

  it("keeps move requests pending until confirmation and handles cancellation or no-op targets", () => {
    const initial = createInteractionState("paint-and-move");
    const pending = transitionInteraction(initial, {
      event,
      from: first,
      type: "move-start",
    });
    const targeted = transitionInteraction(pending, {
      to: second,
      type: "move-target",
    });

    assert(targeted.pendingMove).toStrictEqual({
      event,
      from: first,
      to: second,
    });
    assert(
      transitionInteraction(targeted, { type: "move-cancel" }).committedMove
    ).toBeNull();
    assert(
      transitionInteraction(targeted, { type: "move-confirm" }).committedMove
    ).toStrictEqual({
      event,
      from: first,
      to: second,
    });
    assert(
      transitionInteraction(pending, { to: first, type: "move-target" })
        .pendingMove
    ).toBeNull();
    assert(
      transitionInteraction(pending, { type: "move-target" }).pendingMove
    ).toBeNull();
    assert(
      transitionInteraction(initial, { type: "move-cancel" })
    ).toStrictEqual(initial);
    assert(
      transitionInteraction(initial, { type: "move-confirm" })
    ).toStrictEqual(initial);
  });

  it("does not move unavailable or unidentified events and does not permit moves outside the mode", () => {
    const unavailable = { ...event, available: false };

    const missingId = { ...event, id: "   " };

    assert(
      transitionInteraction(createInteractionState("paint-and-move"), {
        event: unavailable,
        from: first,
        type: "move-start",
      })
    ).toStrictEqual(createInteractionState("paint-and-move"));
    assert(
      transitionInteraction(createInteractionState("paint-and-move"), {
        event: missingId,
        from: first,
        type: "move-start",
      })
    ).toStrictEqual(createInteractionState("paint-and-move"));
    assert(
      transitionInteraction(createInteractionState("quick-create"), {
        event,
        from: first,
        type: "move-start",
      })
    ).toStrictEqual(createInteractionState("quick-create"));
  });

  it("handles an overnight cell and a repeated DST-hour cell without inventing wall time", () => {
    const overnight = cell("2026-08-24", "23:00", "00:00");
    assert(buildSelectionRange(overnight, overnight)?.cells).toStrictEqual([
      overnight,
    ]);

    const zone = parseIanaTimeZone("America/New_York");

    const repeated: CalendarCell = {
      date: calendarDate("2026-11-01"),
      end: fromViewerDateTime({
        date: calendarDate("2026-11-01"),
        disambiguation: "later",
        time: "01:30",
        timeZone: zone,
      }),
      endTime: parseLocalTime("01:30"),
      start: fromViewerDateTime({
        date: calendarDate("2026-11-01"),
        disambiguation: "earlier",
        time: "01:30",
        timeZone: zone,
      }),
      startTime: parseLocalTime("01:30"),
    };

    const later = {
      ...repeated,
      end: fromViewerDateTime({
        date: repeated.date,
        time: "03:30",
        timeZone: zone,
      }),
      endTime: parseLocalTime("03:30"),
      start: fromViewerDateTime({
        date: repeated.date,
        time: "02:30",
        timeZone: zone,
      }),
      startTime: parseLocalTime("02:30"),
    };

    const repeatedSelection = buildSelectionRange(repeated, later);

    assert(repeatedSelection?.cells).toHaveLength(3);
    assert(repeatedSelection?.cells.at(-1)).toStrictEqual(later);
  });

  it("bounds pathological inferred ranges while retaining the requested endpoint", () => {
    const short = cell("2026-08-24", "09:00", "09:01");

    const far = {
      ...short,
      date: calendarDate("2040-01-01"),
      end: utcInstant("2040-01-01T00:01:00.000Z"),
      start: utcInstant("2040-01-01T00:00:00.000Z"),
    };

    const result = buildSelectionRange(short, far);

    assert(result?.cells.at(-1)).toStrictEqual(far);
    assert(result?.cells.length).toBeGreaterThan(0);
  });

  it("returns typed rejection results for busy and unavailable move events", () => {
    assert(
      validateInteractionEvent({ ...event, access: "busy" })
    ).toStrictEqual({
      reason: "busy-access",
      valid: false,
    });
    assert(
      validateInteractionEvent({ ...event, available: false })
    ).toStrictEqual({
      reason: "unavailable",
      valid: false,
    });
    assert(
      transitionInteraction(createInteractionState("paint-and-move"), {
        event: { ...event, access: "busy" },
        from: first,
        type: "move-start",
      })
    ).toStrictEqual(createInteractionState("paint-and-move"));
    assert(
      transitionInteraction(createInteractionState("paint-and-move"), {
        event: { ...event, available: false },
        from: first,
        type: "move-start",
      })
    ).toStrictEqual(createInteractionState("paint-and-move"));
  });
});
