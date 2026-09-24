import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { calendarDate, parseLocalTime, utcInstant } from "../../../core/model";
import type { CalendarCell } from "../../../core/model";
import { CalendarGrid } from "../calendar-grid";

const cell: CalendarCell = {
  date: calendarDate("2026-08-24"),
  end: utcInstant("2026-08-24T10:00:00.000Z"),
  endTime: parseLocalTime("10:00"),
  start: utcInstant("2026-08-24T09:00:00.000Z"),
  startTime: parseLocalTime("09:00"),
};

describe("CalendarGrid cell addressing", () => {
  it("publishes each supplied domain key on its rendered gridcell", () => {
    const key = "viewer-cell-1";

    render(
      <CalendarGrid
        columns={[{ key: "day", label: "Day" }]}
        rows={[{ cells: [cell], key: "hour" }]}
        t={(value) => value}
        direction="ltr"
        getCellKey={() => key}
        getCellLabel={(value) => `${value.date} ${value.startTime}`}
        renderCell={() => null}
      />
    );

    expect(screen.getByRole("gridcell")).toHaveAttribute("data-cell-key", key);
  });
});
