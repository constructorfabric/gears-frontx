import { render, screen } from "@testing-library/react";
import { describe, expect as assert, it, vi } from "vitest";

import { timedEvent, UTC } from "../../../__test-utils__/fixtures";
import { calendarDate } from "../../../core/model";
import { englishTranslate as t } from "../../../i18n/english";
import { DayGrid } from "../day-grid";

describe("DayGrid now marker", () => {
  it("renders no now marker on a non-today date even when timed events fill the grid", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-25T13:30:00.000Z"));

    render(
      <DayGrid
        date={calendarDate("2026-08-24")}
        timeZone={UTC}
        locale="en-US"
        t={t}
        direction="ltr"
        events={[
          timedEvent(
            "a",
            "Morning lecture",
            "2026-08-24T09:00:00.000Z",
            "2026-08-24T10:00:00.000Z"
          ),
          timedEvent(
            "b",
            "Lab session",
            "2026-08-24T11:00:00.000Z",
            "2026-08-24T13:00:00.000Z"
          ),
          timedEvent(
            "c",
            "Seminar",
            "2026-08-24T14:00:00.000Z",
            "2026-08-24T16:00:00.000Z"
          ),
        ]}
      />
    );

    assert(screen.queryByRole("status", { name: /Current time/iu })).toBeNull();
  });

  it("renders the now marker on the today date alongside timed events", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-24T13:30:00.000Z"));

    render(
      <DayGrid
        date={calendarDate("2026-08-24")}
        timeZone={UTC}
        locale="en-US"
        t={t}
        direction="ltr"
        events={[
          timedEvent(
            "a",
            "Morning lecture",
            "2026-08-24T09:00:00.000Z",
            "2026-08-24T10:00:00.000Z"
          ),
        ]}
      />
    );

    assert(
      screen.getByRole("status", { name: /Current time/iu })
    ).toBeInTheDocument();
  });
});
