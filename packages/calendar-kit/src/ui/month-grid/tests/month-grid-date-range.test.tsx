import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect as assert, it, vi } from "vitest";

import { timedEvent, UTC } from "../../../__test-utils__/fixtures";
import { calendarDate } from "../../../core/model";
import type { CalendarDateRange } from "../../../core/model";
import { englishTranslate as t } from "../../../i18n/english";
import { MonthGrid } from "../month-grid";
import type { MonthGridProps } from "../month-grid";

const DATE = calendarDate("2025-09-15");

const renderMonth = (overrides: Partial<MonthGridProps> = {}) => {
  const onSelectedDateRangeChange =
    vi.fn<(range: CalendarDateRange | null) => void>();
  const onEmptyCellSelect = vi.fn<() => void>();

  render(
    <MonthGrid
      date={DATE}
      events={[]}
      timeZone={UTC}
      locale="en-US"
      t={t}
      direction="ltr"
      selectionMode="date-range"
      onEmptyCellSelect={onEmptyCellSelect}
      onSelectedDateRangeChange={onSelectedDateRangeChange}
      {...overrides}
    />
  );

  return { onEmptyCellSelect, onSelectedDateRangeChange };
};

const day = (label: string): HTMLElement =>
  screen.getByRole("gridcell", { name: new RegExp(`^${label}`, "u") });

describe("MonthGrid date range selection", () => {
  it("selects a range by dragging across days", () => {
    const { onEmptyCellSelect, onSelectedDateRangeChange } = renderMonth();

    fireEvent.pointerDown(day("Wednesday, September 3, 2025"), { button: 0 });
    fireEvent.pointerMove(day("Thursday, September 11, 2025"));
    fireEvent.pointerUp(day("Thursday, September 11, 2025"));

    assert(onSelectedDateRangeChange).toHaveBeenCalledWith({
      end: calendarDate("2025-09-11"),
      start: calendarDate("2025-09-03"),
    });
    assert(onEmptyCellSelect).not.toHaveBeenCalled();
    assert(day("Monday, September 8, 2025")).toHaveAttribute(
      "aria-selected",
      "true"
    );
    assert(day("Friday, September 12, 2025")).toHaveAttribute(
      "aria-selected",
      "false"
    );
    assert(screen.getByRole("grid")).toHaveAttribute(
      "aria-multiselectable",
      "true"
    );
  });

  it("selects a range with Enter on the start and end days, and announces it", async () => {
    const user = userEvent.setup();
    const { onSelectedDateRangeChange } = renderMonth();

    day("Monday, September 1, 2025").focus();
    await user.keyboard("{Enter}{ArrowRight}{ArrowRight}{Enter}");

    assert(onSelectedDateRangeChange).toHaveBeenCalledWith({
      end: calendarDate("2025-09-03"),
      start: calendarDate("2025-09-01"),
    });
    assert(screen.getByRole("status")).toHaveTextContent(
      "Selected September 1, 2025 to September 3, 2025"
    );
  });

  it("cancels a pending range with Escape", async () => {
    const user = userEvent.setup();
    const { onSelectedDateRangeChange } = renderMonth();

    day("Monday, September 1, 2025").focus();
    await user.keyboard("{Enter}{ArrowRight}{Escape}{Enter}{Enter}");

    assert(onSelectedDateRangeChange).toHaveBeenCalledOnce();
    assert(onSelectedDateRangeChange).toHaveBeenCalledWith({
      end: calendarDate("2025-09-02"),
      start: calendarDate("2025-09-02"),
    });
  });

  it("passes the selected state to renderCell and keeps event activation", () => {
    const onEventSelect = vi.fn<() => void>();

    const selected: string[] = [];

    renderMonth({
      defaultSelectedDateRange: {
        end: calendarDate("2025-09-02"),
        start: calendarDate("2025-09-01"),
      },
      events: [
        timedEvent({
          id: "lecture",
          startDate: "2025-09-10",
          title: "Lecture",
        }),
      ],
      onEventSelect,
      renderCell: (context) => {
        if (context.isSelected) {
          selected.push(context.cell.date);
        }

        return null;
      },
    });

    assert(new Set(selected)).toStrictEqual(
      new Set(["2025-09-01", "2025-09-02"])
    );

    fireEvent.click(screen.getByRole("button", { name: /Lecture/u }));
    assert(onEventSelect).toHaveBeenCalledOnce();
  });

  it("keeps single-day activation when range selection is off", () => {
    const { onEmptyCellSelect, onSelectedDateRangeChange } = renderMonth({
      selectionMode: "none",
    });

    fireEvent.pointerDown(day("Wednesday, September 3, 2025"), { button: 0 });
    fireEvent.click(day("Wednesday, September 3, 2025"));

    assert(onEmptyCellSelect).toHaveBeenCalledOnce();
    assert(onSelectedDateRangeChange).not.toHaveBeenCalled();
    assert(day("Wednesday, September 3, 2025")).not.toHaveAttribute(
      "aria-selected"
    );
  });
});
