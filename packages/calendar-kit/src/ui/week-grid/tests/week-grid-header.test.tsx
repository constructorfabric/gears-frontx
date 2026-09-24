import { render, screen, within } from "@testing-library/react";
import { describe, expect as assert, it, vi } from "vitest";

import { UTC, identityTranslate as t } from "../../../__test-utils__/fixtures";
import { calendarDate } from "../../../core/model";
import { WeekGrid } from "../week-grid";

describe("WeekGrid headers", () => {
  it("emphasises today's weekday and date without changing the header text", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-24T09:00:00.000Z"));

    render(
      <WeekGrid
        date={calendarDate("2026-08-24")}
        events={[]}
        timeZone={UTC}
        locale="en-US"
        t={t}
        direction="ltr"
        visibleDays={5}
      />
    );

    const headers = within(screen.getByRole("grid")).getAllByRole(
      "columnheader"
    );
    const [, todayHeader, followingHeader] = headers;

    if (todayHeader === undefined || followingHeader === undefined) {
      throw new Error("Expected weekday column headers");
    }

    const todayWeekday = within(todayHeader).getByText("MON");
    const todayNumber = within(todayHeader).getByText("24");

    assert(todayHeader.textContent).toBe("MON24");
    assert(todayWeekday.className).toContain("today");
    assert(todayNumber.className).toContain("today");
    assert(within(followingHeader).getByText("TUE").className).not.toContain(
      "today"
    );
    assert(within(followingHeader).getByText("25").className).not.toContain(
      "today"
    );
  });
});
