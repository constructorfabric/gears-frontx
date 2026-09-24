import { render, screen, within } from "@testing-library/react";
import { describe, expect as assert, it } from "vitest";

import { UTC } from "../../../__test-utils__/fixtures";
import { calendarDate } from "../../../core/model";
import { englishTranslate as t } from "../../../i18n/english";
import { MonthGrid } from "../month-grid";
import type { MonthGridProps } from "../month-grid";

const renderMonth = (overrides: Partial<MonthGridProps> = {}): void => {
  render(
    <MonthGrid
      date={calendarDate("2025-09-15")}
      events={[]}
      timeZone={UTC}
      locale="en-US"
      t={t}
      direction="ltr"
      {...overrides}
    />
  );
};

const weekHeaders = (): readonly string[] =>
  screen
    .getAllByRole("rowheader")
    .map((header) => header.getAttribute("aria-label") ?? "");

describe("MonthGrid week numbers", () => {
  it("counts weeks within the month by default", () => {
    renderMonth();

    assert(weekHeaders().slice(0, 2)).toStrictEqual(["Week 1", "Week 2"]);
  });

  it("shows ISO 8601 week-of-year numbers on request", () => {
    renderMonth({ weekNumbering: "iso" });

    assert(weekHeaders()).toStrictEqual([
      "Week 36",
      "Week 37",
      "Week 38",
      "Week 39",
      "Week 40",
    ]);
  });

  it("repeats the week column on the trailing edge without exposing it twice", () => {
    renderMonth({ trailingGutter: true, weekNumbering: "iso" });

    const [, firstWeek] = within(screen.getByRole("grid")).getAllByRole("row");

    if (firstWeek === undefined) {
      throw new Error("Expected a first week row");
    }

    assert(weekHeaders()).toHaveLength(5);
    assert((firstWeek.textContent ?? "").match(/W36/gu)).toHaveLength(2);
    assert(within(firstWeek).getAllByRole("gridcell")).toHaveLength(7);
  });
});
