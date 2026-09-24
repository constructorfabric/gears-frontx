import { describe, expect as assert, it, vi } from "vitest";

import { instant } from "../../__test-utils__/fixtures";
import { layoutTimedEvents } from "../layout";
import type { TimedLayoutInput } from "../layout";

describe("timed event overlap layout", () => {
  it("returns no geometry for an empty event list", () => {
    assert(layoutTimedEvents([])).toStrictEqual([]);
  });

  it("skips all-day, duplicate, malformed, and non-positive records deterministically", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      const start = instant("2026-08-24", "09:00");
      const end = instant("2026-08-24", "10:00");

      const result = layoutTimedEvents([
        { allDay: true, end, id: "all-day", start },
        { end, id: "kept", start },
        { end, id: "kept", start },
        (() => {
          const malformed = { end, id: "malformed", start };
          Object.defineProperty(malformed, "start", { value: "bad" });

          return malformed;
        })(),
        { end: start, id: "inverted", start: end },
      ]);

      assert(result).toStrictEqual([
        { groupIndex: 0, id: "kept", left: 0, width: 98, zIndex: 10 },
      ]);
      assert(warn).toHaveBeenCalledTimes(3);
    } finally {
      warn.mockRestore();
    }
  });

  it("orders overlapping events by start, duration, and input order", () => {
    const events: TimedLayoutInput[] = [
      {
        end: instant("2026-08-24", "10:00"),
        id: "short",
        start: instant("2026-08-24", "09:00"),
      },
      {
        end: instant("2026-08-24", "12:00"),
        id: "long",
        start: instant("2026-08-24", "09:00"),
      },
      {
        end: instant("2026-08-24", "11:00"),
        id: "middle",
        start: instant("2026-08-24", "10:00"),
      },
    ];

    const result = layoutTimedEvents(events);

    assert(result.map(({ id }) => id)).toStrictEqual([
      "long",
      "short",
      "middle",
    ]);
    assert(
      result.every(
        ({ left, width }) => left >= 0 && width > 0 && left + width <= 98
      )
    ).toBeTruthy();
    assert(result[0]?.width).toBeGreaterThanOrEqual(result[1]?.width ?? 0);
    assert(result.map(({ groupIndex }) => groupIndex)).toStrictEqual([0, 0, 0]);
  });

  it("reuses columns for touching intervals and starts a new overlap group afterward", () => {
    const result = layoutTimedEvents([
      {
        end: instant("2026-08-24", "10:00"),
        id: "first",
        start: instant("2026-08-24", "09:00"),
      },
      {
        end: instant("2026-08-24", "11:00"),
        id: "touching",
        start: instant("2026-08-24", "10:00"),
      },
      {
        end: instant("2026-08-24", "14:00"),
        id: "later",
        start: instant("2026-08-24", "13:00"),
      },
    ]);

    assert(result).toStrictEqual([
      { groupIndex: 0, id: "first", left: 0, width: 98, zIndex: 10 },
      { groupIndex: 1, id: "touching", left: 0, width: 98, zIndex: 10 },
      { groupIndex: 2, id: "later", left: 0, width: 98, zIndex: 10 },
    ]);
  });

  it("allows a long event to expand across free columns without exceeding the safe edge", () => {
    const result = layoutTimedEvents([
      {
        end: instant("2026-08-24", "12:00"),
        id: "long",
        start: instant("2026-08-24", "09:00"),
      },
      {
        end: instant("2026-08-24", "10:00"),
        id: "first-overlap",
        start: instant("2026-08-24", "09:00"),
      },
      {
        end: instant("2026-08-24", "11:00"),
        id: "middle",
        start: instant("2026-08-24", "10:00"),
      },
      {
        end: instant("2026-08-24", "11:00"),
        id: "second-overlap",
        start: instant("2026-08-24", "10:00"),
      },
    ]);

    const firstOverlap = result.find(({ id }) => id === "first-overlap");

    assert(firstOverlap).toBeDefined();
    assert(firstOverlap?.width).toBeGreaterThan(98 / 3);
    assert(result.every(({ left, width }) => left + width <= 98)).toBeTruthy();
  });
});
