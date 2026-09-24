import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect as assert, it, vi } from "vitest";

import { timedEvent, UTC } from "../../../__test-utils__/fixtures";
import { calendarDate, parseLocalTime } from "../../../core/model";
import { englishTranslate as t } from "../../../i18n/english";
import { DayGrid } from "../day-grid";
import type { DayGridProps } from "../day-grid";

const DATE = calendarDate("2026-08-24");

const timeWindow = (start: string, end: string) => ({
  end: parseLocalTime(end),
  start: parseLocalTime(start),
});

const renderDay = (overrides: Partial<DayGridProps> = {}): void => {
  render(
    <DayGrid
      date={DATE}
      events={[]}
      timeZone={UTC}
      locale="en-US"
      t={t}
      direction="ltr"
      {...overrides}
    />
  );
};

const timedCells = (): readonly HTMLElement[] =>
  within(screen.getByRole("grid")).getAllByRole("gridcell");

describe("DayGrid time axis", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders one cell per slot inside the visible hours", () => {
    renderDay({ slotMinutes: 30, visibleHours: timeWindow("08:00", "12:00") });

    const cells = timedCells();

    assert(cells).toHaveLength(8);
    assert(cells[0]).toHaveAccessibleName(/08:00/u);
    assert(cells[1]).toHaveAccessibleName(/08:30/u);
  });

  it("drops events outside the visible hours", () => {
    renderDay({
      events: [
        timedEvent({
          endTime: "07:00",
          id: "early",
          startTime: "06:00",
          title: "Early standup",
        }),
        timedEvent({
          endTime: "11:00",
          id: "inside",
          startTime: "10:00",
          title: "Lecture",
        }),
      ],
      visibleHours: timeWindow("09:00", "18:00"),
    });

    assert(screen.queryByRole("button", { name: /Early standup/u })).toBeNull();
    assert(screen.getByRole("button", { name: /Lecture/u })).toBeVisible();
  });

  it("hides the now marker while the current time is outside the visible hours", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-24T20:00:00.000Z"));
    renderDay({ visibleHours: timeWindow("09:00", "18:00") });

    assert(screen.queryByRole("status", { name: /Current time/iu })).toBeNull();
  });

  it("shades cells by the host's working hours", () => {
    renderDay({
      visibleHours: timeWindow("06:00", "08:00"),
      workingHours: timeWindow("07:00", "08:00"),
    });

    const [six, seven] = timedCells();

    assert(six).toHaveAccessibleName(/non-working/iu);
    assert(seven).not.toHaveAccessibleName(/non-working/iu);
  });

  it("repeats the hour labels on the trailing edge without adding grid cells", () => {
    const { container } = render(
      <DayGrid
        date={DATE}
        events={[]}
        timeZone={UTC}
        locale="en-US"
        t={t}
        direction="ltr"
        trailingGutter
        visibleHours={timeWindow("09:00", "11:00")}
      />
    );

    assert((container.textContent ?? "").match(/10:00/gu)).toHaveLength(2);
    assert(timedCells()).toHaveLength(2);
  });
});
