import { render, within } from "@testing-library/react";
import { describe, expect as assert, it } from "vitest";

import { UTC } from "../../../__test-utils__/fixtures";
import { calendarDate } from "../../../core/model";
import { englishTranslate as t } from "../../../i18n/english";
import { WeekGrid } from "../week-grid";

const DATE = calendarDate("2026-08-24");

const renderWeek = () =>
  render(
    <WeekGrid
      date={DATE}
      events={[]}
      timeZone={UTC}
      locale="en-US"
      t={t}
      direction="ltr"
      visibleDays={5}
    />
  );

const rows = (container: HTMLElement): HTMLElement[] =>
  within(container).getAllByRole("row");

const findHeaderBand = (allRows: readonly HTMLElement[]): HTMLElement => {
  const band = allRows.find(
    (row) => within(row).queryAllByRole("columnheader").length > 0
  );

  if (!band) {
    throw new Error("Expected the week day-number band");
  }

  return band;
};

const findAllDayBand = (allRows: readonly HTMLElement[]): HTMLElement => {
  const band = allRows.find((row) =>
    within(row)
      .queryAllByRole("gridcell")
      .some((cell) =>
        /All-day events/iu.test(cell.getAttribute("aria-label") ?? "")
      )
  );

  if (!band) {
    throw new Error("Expected the week all-day band");
  }

  return band;
};

const findHourRows = (
  allRows: readonly HTMLElement[],
  headerBand: HTMLElement,
  allDayBand: HTMLElement
): HTMLElement[] =>
  allRows.filter(
    (row) =>
      row !== headerBand &&
      row !== allDayBand &&
      within(row).queryAllByRole("gridcell").length > 0
  );

describe("WeekGrid scroll scope acceptance pins", () => {
  it("keeps the frame and both bands outside the hour-row scroll surface", () => {
    const { container } = renderWeek();
    const allRows = rows(container);
    const headerBand = findHeaderBand(allRows);
    const allDayBand = findAllDayBand(allRows);
    const hourRows = findHourRows(allRows, headerBand, allDayBand);
    const surface = allDayBand.nextElementSibling;

    assert(hourRows.length).toBeGreaterThan(0);
    assert(surface).toBeInstanceOf(HTMLElement);

    if (!(surface instanceof HTMLElement)) {
      return;
    }

    assert(surface).not.toHaveAttribute("role", "row");
    assert(allDayBand).toBeVisible();
    assert(surface).toContainElement(hourRows[0]);
    const lastHourRow = hourRows.at(-1);

    if (lastHourRow === undefined) {
      throw new Error("Expected a last hour row");
    }

    assert(surface).toContainElement(lastHourRow);
    assert(surface).not.toContainElement(headerBand);
    assert(surface).not.toContainElement(allDayBand);

    const frame = surface.closest('[role="grid"]');
    assert(frame).not.toBeNull();
    assert(frame).toContainElement(surface);
    assert(frame).toContainElement(headerBand);
    assert(frame).toContainElement(allDayBand);
    assert(surface).not.toHaveAttribute("role", "grid");
  });
});
