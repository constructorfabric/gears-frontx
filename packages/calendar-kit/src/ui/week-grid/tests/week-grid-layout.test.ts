import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import { describe, expect as assert, it, vi } from "vitest";

import {
  timedEvent,
  UTC,
  identityTranslate as t,
} from "../../../__test-utils__/fixtures";
import { calendarDate, parseLocalTime, utcInstant } from "../../../core/model";
import type { CalendarCell, CalendarMoveRequest } from "../../../core/model";
import { DEFAULT_WORKING_HOURS } from "../../../core/temporal";
import { CalendarGrid } from "../../grid/calendar-grid";
import type { CalendarGridProps } from "../../grid/calendar-grid";
import { WeekGrid } from "../week-grid";
import type { WeekGridProps } from "../week-grid";
import {
  buildCellLabel,
  buildGridData,
  buildTimedSegments,
} from "../week-grid-layout";

const DATE = calendarDate("2026-08-24");

const AXIS = { slotRowCount: 3, workingHours: DEFAULT_WORKING_HOURS };

const dayColumns = [
  {
    date: DATE,
    range: {
      end: utcInstant("2026-08-24T10:00:00.000Z"),
      start: utcInstant("2026-08-24T09:00:00.000Z"),
    },
    slots: [
      {
        date: DATE,
        end: utcInstant("2026-08-24T10:00:00.000Z"),
        endTime: parseLocalTime("10:00"),
        start: utcInstant("2026-08-24T09:00:00.000Z"),
        startTime: parseLocalTime("09:00"),
      },
    ],
  },
] as const;

const getCellKey = (value: CalendarCell): string =>
  `${value.date}:${value.startTime}`;

describe("week-grid-layout", () => {
  it("builds stable cell maps and computes labels while building the grid", () => {
    const grid = buildGridData(
      dayColumns,
      [DATE],
      UTC,
      t,
      "en-US",
      (cell) => `${cell.date}:${cell.startTime}:${cell.start}`,
      AXIS
    );

    const [firstDayColumn] = dayColumns;
    const [timedCell] = firstDayColumn.slots;
    const key = `${DATE}:09:00:${timedCell.start}`;
    const meta = grid.metaByCell.get(timedCell);

    if (!meta) {
      throw new Error("Expected timed cell metadata");
    }

    assert(grid.cellByKey.get(key)).toBe(timedCell);
    assert(grid.cellKeyByCell.get(timedCell)).toBe(key);
    assert(meta.label).toContain("09:00");
    assert(
      buildCellLabel(timedCell, meta, UTC, "en-US", t, DEFAULT_WORKING_HOURS)
    ).toBe(meta.label);
  });

  it("labels each hour row with its own hour rather than the first of the week", () => {
    const hour = (
      startTime: string,
      endTime: string,
      iso: string,
      endIso: string
    ) => ({
      date: DATE,
      end: utcInstant(endIso),
      endTime: parseLocalTime(endTime),
      start: utcInstant(iso),
      startTime: parseLocalTime(startTime),
    });

    const grid = buildGridData(
      [
        {
          date: DATE,
          range: {
            end: utcInstant("2026-08-24T12:00:00.000Z"),
            start: utcInstant("2026-08-24T09:00:00.000Z"),
          },
          slots: [
            hour(
              "09:00",
              "10:00",
              "2026-08-24T09:00:00.000Z",
              "2026-08-24T10:00:00.000Z"
            ),
            hour(
              "10:00",
              "11:00",
              "2026-08-24T10:00:00.000Z",
              "2026-08-24T11:00:00.000Z"
            ),
            hour(
              "11:00",
              "12:00",
              "2026-08-24T11:00:00.000Z",
              "2026-08-24T12:00:00.000Z"
            ),
          ],
        },
      ],
      [DATE],
      UTC,
      t,
      "en-US",
      (cell) => `${cell.date}:${cell.startTime}:${cell.start}`,
      AXIS
    );

    const gutterLabels: string[] = [];

    for (const row of grid.rows) {
      if (row.key === "all-day") {
        continue;
      }

      const [gutterCell] = row.cells;
      const meta = grid.metaByCell.get(gutterCell);

      if (meta?.kind === "gutter") {
        gutterLabels.push(gutterCell.startTime);
      }
    }

    assert(gutterLabels.slice(0, 3)).toStrictEqual(["09:00", "10:00", "11:00"]);
  });

  it("lets invalid timed segments surface to the view error boundary", () => {
    const malformed = timedEvent({ colorFamily: "purple" });
    Object.defineProperty(malformed, "start", { value: "not-an-instant" });

    assert(() => buildTimedSegments([malformed], [DATE], UTC)).toThrow(
      "Invalid UTC instant"
    );
  });

  it("moves horizontal keyboard focus between day columns", async () => {
    const user = userEvent.setup();

    const props = {
      date: DATE,
      direction: "ltr" as const,
      events: [],
      locale: "en-US",
      t,
      timeZone: UTC,
    } satisfies WeekGridProps;

    render(createElement(WeekGrid, props));

    const monday = screen.getByRole("gridcell", {
      name: /Monday, August 24, 2026 09:00/u,
    });
    const tuesday = screen.getByRole("gridcell", {
      name: /Tuesday, August 25, 2026 09:00/u,
    });

    act(() => {
      monday.focus();
    });
    await user.keyboard("{ArrowRight}");

    assert(tuesday).toHaveFocus();
  });

  it("keeps a move pending when drop is followed by dragend", () => {
    const requests: CalendarMoveRequest[] = [];

    const resolutions: string[] = [];

    const onMoveRequest = vi.fn<(request: CalendarMoveRequest) => void>(
      (request) => {
        requests.push({
          ...request,
          cancel: () => {
            request.cancel();
            resolutions.push("canceled");
          },
          confirm: () => {
            request.confirm();
            resolutions.push("confirmed");
          },
        });
      }
    );

    const props = {
      date: DATE,
      direction: "ltr" as const,
      events: [timedEvent({ colorFamily: "purple" })],
      interactionMode: "paint-and-move" as const,
      locale: "en-US",
      onMoveRequest,
      t,
      timeZone: UTC,
    } satisfies WeekGridProps;

    render(createElement(WeekGrid, props));

    const eventButton = screen.getByRole("button", { name: /Planning/u });
    const firstTarget = screen.getByRole("gridcell", {
      name: /Monday, August 24, 2026 10:00/u,
    });
    const secondTarget = screen.getByRole("gridcell", {
      name: /Monday, August 24, 2026 11:00/u,
    });

    fireEvent.dragStart(eventButton);
    fireEvent.dragEnd(eventButton);

    fireEvent.dragStart(eventButton);
    fireEvent.drop(firstTarget);
    fireEvent.dragEnd(eventButton);

    fireEvent.dragStart(eventButton);
    fireEvent.drop(secondTarget);
    fireEvent.dragEnd(eventButton);

    assert(onMoveRequest).toHaveBeenCalledOnce();
    assert(requests).toHaveLength(1);

    act(() => {
      requests[0]?.confirm();
    });
    assert(resolutions).toStrictEqual(["confirmed"]);

    fireEvent.dragStart(eventButton);
    fireEvent.drop(secondTarget);
    fireEvent.dragEnd(eventButton);

    assert(requests).toHaveLength(2);

    act(() => {
      requests[1]?.cancel();
    });
    assert(resolutions).toStrictEqual(["confirmed", "canceled"]);
  });

  it("refreshes accessible cell labels when the label callback changes", () => {
    const [firstDayColumn] = dayColumns;
    const [cell] = firstDayColumn.slots;

    const columns = [{ key: "day", label: "Day" }] as const;

    const rows = [{ cells: [cell], key: "hour" }] as const;

    const baseProps = {
      columns,
      direction: "ltr" as const,
      getCellKey,
      renderCell: () => null,
      rows,
      t,
    } satisfies Omit<CalendarGridProps, "getCellLabel">;

    const { rerender } = render(
      createElement(CalendarGrid, {
        ...baseProps,
        getCellLabel: () => "Initial label",
      })
    );

    assert(
      screen.getByRole("gridcell", { name: "Initial label" })
    ).toBeInTheDocument();

    rerender(
      createElement(CalendarGrid, {
        ...baseProps,
        getCellLabel: () => "Updated label",
      })
    );

    assert(
      screen.getByRole("gridcell", { name: "Updated label" })
    ).toBeInTheDocument();
  });
});
