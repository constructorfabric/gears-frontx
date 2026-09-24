import { render, screen } from "@testing-library/react";
import { describe, expect as assert, it } from "vitest";

import { UTC, identityTranslate as t } from "../../../__test-utils__/fixtures";
import { calendarDate } from "../../../core/model";
import { DayGrid } from "../day-grid";

describe("DayGrid headers", () => {
  it("keeps the weekday and day number in separate stacked elements", () => {
    render(
      <DayGrid
        date={calendarDate("2026-08-24")}
        events={[]}
        timeZone={UTC}
        locale="en-US"
        t={t}
        direction="ltr"
      />
    );

    const weekday = screen.getByText("Mon");
    const dayNumber = screen.getByText("24");

    assert(weekday.tagName).toBe("SPAN");
    assert(dayNumber.tagName).toBe("SPAN");
    assert(weekday).toBeVisible();
    assert(dayNumber).toBeVisible();
    assert(`${weekday.textContent}${dayNumber.textContent}`).toBe("Mon24");
  });
});
