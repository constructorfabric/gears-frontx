import { describe, expect as assert, it } from "vitest";

import { availabilityCell as cell } from "../../__test-utils__/fixtures";
import {
  buildAvailabilityColumns,
  buildAvailabilityRange,
} from "../availability";
import { calendarDate, utcInstant } from "../model";

const mon08 = cell("2026-08-24", "08:00");
const mon09 = cell("2026-08-24", "09:00");
const mon10 = cell("2026-08-24", "10:00");

const mon10Blocked = { ...mon10, available: false };

const mon11 = cell("2026-08-24", "11:00");
const tue09 = cell("2026-08-25", "09:00");
const tue10 = cell("2026-08-25", "10:00");

describe(buildAvailabilityColumns, () => {
  it("groups host cells into chronological day columns with chronologically sorted cells", () => {
    const columns = buildAvailabilityColumns([
      cell("2026-08-26", "11:00"),
      cell("2026-08-24", "10:00"),
      cell("2026-08-25", "08:00"),
      cell("2026-08-24", "08:00"),
      cell("2026-08-26", "09:00"),
    ]);

    assert(columns).toHaveLength(3);
    assert(columns.map((column) => column.key)).toStrictEqual([
      "2026-08-24",
      "2026-08-25",
      "2026-08-26",
    ]);
    assert(columns[0].date).toBe(calendarDate("2026-08-24"));
    assert(columns[0].cells).toStrictEqual([
      cell("2026-08-24", "08:00"),
      cell("2026-08-24", "10:00"),
    ]);
    assert(columns[2].cells).toStrictEqual([
      cell("2026-08-26", "09:00"),
      cell("2026-08-26", "11:00"),
    ]);
  });

  it("returns no columns for an empty host list", () => {
    assert(buildAvailabilityColumns([])).toStrictEqual([]);
  });

  it("drops malformed host cells without disturbing valid columns", () => {
    const inverted = {
      ...cell("2026-08-24", "09:00"),
      end: utcInstant("2026-08-24T08:00:00.000Z"),
    };

    const malformed = { ...cell("2026-08-24", "10:00") };
    Object.defineProperty(malformed, "start", { value: "not-an-instant" });

    const columns = buildAvailabilityColumns([
      malformed,
      inverted,
      cell("2026-08-24", "08:00"),
    ]);

    assert(columns).toHaveLength(1);
    assert(columns[0].cells).toStrictEqual([cell("2026-08-24", "08:00")]);
  });
});

describe(buildAvailabilityRange, () => {
  it("builds the ordered range for forward pointer travel over supplied cells", () => {
    const range = buildAvailabilityRange(
      [mon08, mon09, mon10, mon11],
      mon09,
      mon11
    );

    assert(range).toStrictEqual({
      cells: [mon09, mon10, mon11],
      end: mon11,
      start: mon09,
    });
  });

  it("orders the range chronologically for reversed pointer travel", () => {
    const range = buildAvailabilityRange(
      [mon08, mon09, mon10, mon11],
      mon11,
      mon09
    );

    assert(range).toStrictEqual({
      cells: [mon09, mon10, mon11],
      end: mon11,
      start: mon09,
    });
  });

  it("selects a single cell when anchor and active coincide", () => {
    const range = buildAvailabilityRange([mon08, mon09, mon10], mon10, mon10);

    assert(range).toStrictEqual({ cells: [mon10], end: mon10, start: mon10 });
  });

  it("excludes blocked cells from the painted range", () => {
    const range = buildAvailabilityRange(
      [mon09, mon10Blocked, mon11],
      mon11,
      mon09
    );

    assert(range).toStrictEqual({
      cells: [mon09, mon11],
      end: mon11,
      start: mon09,
    });
  });

  it("returns null when every supplied cell in the span is blocked", () => {
    const range = buildAvailabilityRange(
      [{ ...mon09, available: false }, mon10Blocked],
      mon08,
      mon11
    );

    assert(range).toBeNull();
  });

  it("returns null when an endpoint is blocked or malformed", () => {
    const malformed = { ...mon09 };
    Object.defineProperty(malformed, "start", { value: "not-an-instant" });

    assert(
      buildAvailabilityRange([mon09, mon10Blocked, mon11], mon10Blocked, mon11)
    ).toBeNull();
    assert(
      buildAvailabilityRange([mon09, mon11], mon11, mon10Blocked)
    ).toBeNull();
    assert(buildAvailabilityRange([mon09, mon11], malformed, mon11)).toBeNull();
  });

  it("orders a multi-day span across day boundaries while skipping blocked hours", () => {
    const tue09Blocked = { ...tue09, available: false };

    const range = buildAvailabilityRange(
      [mon11, tue09Blocked, tue10],
      tue10,
      mon11
    );

    assert(range).toStrictEqual({
      cells: [mon11, tue10],
      end: tue10,
      start: mon11,
    });
  });

  it("uses span bounds rather than membership and drops malformed supplied cells", () => {
    const early = cell("2026-08-24", "08:30");
    const late = cell("2026-08-24", "10:30");

    const malformed = { ...mon10 };
    Object.defineProperty(malformed, "start", { value: "not-an-instant" });

    const range = buildAvailabilityRange(
      [mon09, malformed, mon10],
      early,
      late
    );

    assert(range).toStrictEqual({
      cells: [mon09, mon10],
      end: mon10,
      start: mon09,
    });
  });

  it("returns null when the span contains no available supplied cell", () => {
    const farAnchor = cell("2026-08-24", "15:00");
    const farActive = cell("2026-08-24", "16:00");

    assert(
      buildAvailabilityRange([mon08, mon09, mon10, mon11], farAnchor, farActive)
    ).toBeNull();
  });
});
