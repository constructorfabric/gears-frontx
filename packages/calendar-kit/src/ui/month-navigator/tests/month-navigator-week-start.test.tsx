import { render, screen, within } from "@testing-library/react";
import { describe, expect as assert, it } from "vitest";

import { UTC, identityTranslate as t } from "../../../__test-utils__/fixtures";
import { calendarDate } from "../../../core/model";
import { MonthGrid } from "../../month-grid/month-grid";
import { MonthNavigator } from "../month-navigator";

const DATE = calendarDate("2026-08-24");

const weekdayHeaders = (grid: HTMLElement): string[] =>
  within(grid)
    .getAllByRole("columnheader")
    .map((header) => header.textContent ?? "");

describe("MonthNavigator week start", () => {
  it("uses the month grid Monday-start column order", () => {
    render(
      <>
        <MonthNavigator
          selectedDate={DATE}
          events={[]}
          timeZone={UTC}
          locale="de-DE"
          t={t}
          direction="ltr"
          onSelectDate={() => {}}
        />
        <MonthGrid
          date={DATE}
          events={[]}
          timeZone={UTC}
          locale="de-DE"
          t={t}
          direction="ltr"
        />
      </>
    );

    const [navigatorGrid, monthGrid] = screen.getAllByRole("grid");
    const navigatorHeaders = weekdayHeaders(navigatorGrid);
    const monthHeaders = weekdayHeaders(monthGrid).slice(1);

    assert(navigatorHeaders).toStrictEqual([
      "Mo",
      "Di",
      "Mi",
      "Do",
      "Fr",
      "Sa",
      "So",
    ]);
    assert(monthHeaders).toStrictEqual(navigatorHeaders);
  });
});
