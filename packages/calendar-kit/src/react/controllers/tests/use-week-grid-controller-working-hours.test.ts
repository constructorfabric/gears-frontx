import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { UTC } from "../../../__test-utils__/fixtures";
import { calendarDate, parseIanaTimeZone } from "../../../core/model";
import { useWeekGridController } from "../use-week-grid-controller";

const SOFIA = parseIanaTimeZone("Europe/Sofia");

const DATE = calendarDate("2026-09-14");
// Contains the Europe/Sofia fall-back, 2026-10-25.
const DST_WEEK = calendarDate("2026-10-19");

const WORKING_HOUR_START_ROW = 8;
const HOUR_ROWS_PER_DAY = 24;

describe("useWeekGridController working-hour scroll inputs", () => {
  it("reports the working-hour start row of the rendered hour axis", () => {
    const { result } = renderHook(() =>
      useWeekGridController({
        date: DATE,
        events: [],
        timeZone: SOFIA,
        visibleDays: 7,
      })
    );

    expect(result.current.workingSlotIndex).toBe(WORKING_HOUR_START_ROW);
    expect(result.current.slotRowCount).toBe(HOUR_ROWS_PER_DAY);
  });

  it("counts the taller DST day in the rendered hour-row count", () => {
    const { result } = renderHook(() =>
      useWeekGridController({
        date: DST_WEEK,
        events: [],
        timeZone: SOFIA,
        visibleDays: 7,
      })
    );

    expect(result.current.workingSlotIndex).toBe(WORKING_HOUR_START_ROW);
    expect(result.current.slotRowCount).toBe(HOUR_ROWS_PER_DAY + 1);
  });

  it("keeps the viewer-zone hour axis for a UTC viewer", () => {
    const { result } = renderHook(() =>
      useWeekGridController({ date: DATE, events: [], timeZone: UTC })
    );

    expect(result.current.workingSlotIndex).toBe(WORKING_HOUR_START_ROW);
    expect(result.current.slotRowCount).toBe(HOUR_ROWS_PER_DAY);
  });
});
