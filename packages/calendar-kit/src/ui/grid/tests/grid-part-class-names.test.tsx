import { render, screen, within } from "@testing-library/react";
import { describe, expect as assert, it } from "vitest";

import { UTC } from "../../../__test-utils__/fixtures";
import { calendarDate, parseLocalTime } from "../../../core/model";
import { englishTranslate as t } from "../../../i18n/english";
import { DayGrid } from "../../day-grid/day-grid";
import { MonthGrid } from "../../month-grid/month-grid";
import { WeekGrid } from "../../week-grid/week-grid";

const DATE = calendarDate("2026-08-24");

const CONTEXT = {
  direction: "ltr",
  locale: "en-US",
  t,
  timeZone: UTC,
} as const;

const PARTS = {
  cellClassName: "host-cell",
  columnHeaderClassName: "host-header",
} as const;

const visibleHours = {
  end: parseLocalTime("10:00"),
  start: parseLocalTime("09:00"),
};

const countByClass = (container: HTMLElement, className: string): number =>
  container.querySelectorAll(`.${className}`).length;

describe("grid part class names", () => {
  it("adds the host's classes to WeekGrid cells, day headers, and every gutter copy", () => {
    const { container } = render(
      <WeekGrid
        {...CONTEXT}
        {...PARTS}
        date={DATE}
        events={[]}
        gutterClassName="host-gutter"
        trailingGutter
        visibleHours={visibleHours}
      />
    );

    assert(countByClass(container, "host-header")).toBe(5);
    assert(countByClass(container, "host-cell")).toBe(10);
    // Header, all-day and 09:00 rows, on both edges.
    assert(countByClass(container, "host-gutter")).toBe(6);
  });

  it("adds the host's classes to DayGrid cells, its header, and every gutter copy", () => {
    const { container } = render(
      <DayGrid
        {...CONTEXT}
        {...PARTS}
        date={DATE}
        events={[]}
        gutterClassName="host-gutter"
        trailingGutter
        visibleHours={visibleHours}
      />
    );

    assert(countByClass(container, "host-header")).toBe(1);
    assert(countByClass(container, "host-cell")).toBe(1);
    assert(countByClass(container, "host-gutter")).toBe(6);
  });

  it("adds the host's classes to MonthGrid days, weekday headers, and week numbers", () => {
    render(
      <MonthGrid
        {...CONTEXT}
        {...PARTS}
        date={DATE}
        events={[]}
        weekNumberClassName="host-week"
      />
    );

    const grid = screen.getByRole("grid");

    assert(within(grid).getAllByRole("gridcell")[0]).toHaveClass("host-cell");
    assert(within(grid).getAllByRole("rowheader")[0]).toHaveClass("host-week");
    assert(within(grid).getAllByRole("columnheader")[0]).toHaveClass(
      "host-week"
    );
    assert(within(grid).getAllByRole("columnheader")[1]).toHaveClass(
      "host-header"
    );
  });
});
