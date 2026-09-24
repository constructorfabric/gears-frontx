import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { calendarDate, parseLocalTime, utcInstant } from "../../../core/model";
import type { CalendarCell } from "../../../core/model";
import { CalendarGrid } from "../calendar-grid";
import type {
  CalendarGridCellKeyDownHandler,
  CalendarGridProps,
} from "../calendar-grid";

const firstCell: CalendarCell = {
  date: calendarDate("2026-08-24"),
  end: utcInstant("2026-08-24T10:00:00.000Z"),
  endTime: parseLocalTime("10:00"),
  start: utcInstant("2026-08-24T09:00:00.000Z"),
  startTime: parseLocalTime("09:00"),
};

const secondCell: CalendarCell = {
  ...firstCell,
  end: utcInstant("2026-08-24T11:00:00.000Z"),
  endTime: parseLocalTime("11:00"),
  start: utcInstant("2026-08-24T10:00:00.000Z"),
  startTime: parseLocalTime("10:00"),
};

const thirdCell: CalendarCell = {
  ...firstCell,
  date: calendarDate("2026-08-25"),
  end: utcInstant("2026-08-25T10:00:00.000Z"),
  start: utcInstant("2026-08-25T09:00:00.000Z"),
};

const columns = [
  { key: "monday", label: "Monday" },
  { key: "tuesday", label: "Tuesday" },
] as const;

const rows = [{ cells: [firstCell, secondCell], key: "morning" }] as const;

const unitColumns = [
  { key: "one", label: "One" },
  { key: "two", label: "Two" },
] as const;

const unitRows = [
  { cells: [firstCell, secondCell], key: "first" },
  { cells: [thirdCell], key: "second" },
] as const;

const renderGrid = (overrides: Partial<CalendarGridProps> = {}) =>
  render(
    <CalendarGrid
      columns={columns}
      rows={rows}
      t={(key) => key}
      direction="ltr"
      getCellKey={(cell) => `${cell.date}:${cell.startTime}`}
      getCellLabel={(cell, context) =>
        `${cell.date} ${cell.startTime} ${context.key}`
      }
      renderCell={(context) => <span>{context.label}</span>}
      {...overrides}
    />
  );

const renderUnitGrid = (overrides: Partial<CalendarGridProps> = {}) =>
  render(
    <CalendarGrid
      columns={unitColumns}
      rows={unitRows}
      t={(key) => key}
      direction="ltr"
      getCellKey={(cell) => `${cell.date}:${cell.startTime}`}
      getCellLabel={(cell, context) =>
        `${cell.date} ${cell.startTime} ${context.key}`
      }
      renderCell={(context) => <span>{context.label}</span>}
      {...overrides}
    />
  );

describe(CalendarGrid, () => {
  it("renders semantic grid dimensions, headers, cells, and exactly one roving tab stop", () => {
    renderGrid();
    const grid = screen.getByRole("grid");

    expect(grid.getAttribute("aria-colcount")).toBe("2");
    expect(grid.getAttribute("aria-rowcount")).toBe("2");
    expect(within(grid).getAllByRole("columnheader")).toHaveLength(2);
    expect(within(grid).getAllByRole("row")).toHaveLength(2);
    expect(within(grid).getAllByRole("gridcell")).toHaveLength(2);
  });

  it("keeps exactly one roving tab stop and labels the rendered cells", () => {
    renderGrid();
    const grid = screen.getByRole("grid");

    expect(
      within(grid)
        .getAllByRole("gridcell")
        .filter((cell) => cell.getAttribute("tabindex") === "0")
    ).toHaveLength(1);
    expect(
      within(grid).getByRole("gridcell", {
        name: "2026-08-24 09:00 2026-08-24:09:00",
      })
    ).toHaveTextContent("2026-08-24");
  });

  it("falls back to the first cell when a controlled active key is stale", () => {
    renderGrid({ activeCellKey: "stale-controlled-key" });

    const grid = screen.getByRole("grid");
    const [first, second] = within(grid).getAllByRole("gridcell");

    expect(first).toHaveAttribute("tabindex", "0");
    expect(second).toHaveAttribute("tabindex", "-1");
  });

  it("uses the two-argument label callback as the accessible cell name", () => {
    const getCellLabel = vi.fn<CalendarGridProps["getCellLabel"]>(
      (cell, context) => `${cell.date}/${context.key}`
    );
    renderGrid({ getCellLabel });

    expect(getCellLabel).toHaveBeenCalledWith(
      firstCell,
      expect.objectContaining({ cell: firstCell, key: "2026-08-24:09:00" })
    );
    expect(
      screen.getByRole("gridcell", { name: "2026-08-24/2026-08-24:09:00" })
    ).toBeTruthy();
  });

  it("moves the active cell by keyboard and reports the domain cell", async () => {
    const onActiveCellChange = vi.fn<() => void>();
    renderGrid({ onActiveCellChange });
    const grid = screen.getByRole("grid");

    const active = within(grid).getByRole("gridcell", {
      name: "2026-08-24 09:00 2026-08-24:09:00",
    });

    const destination = within(grid).getByRole("gridcell", {
      name: "2026-08-24 10:00 2026-08-24:10:00",
    });

    active.focus();
    expect(active).toHaveFocus();

    const user = userEvent.setup();

    await user.keyboard("{ArrowRight}");

    expect(active).not.toHaveFocus();
    expect(destination).toHaveFocus();
    expect(onActiveCellChange).toHaveBeenCalledWith(secondCell);
    expect(destination).toHaveAttribute("tabindex", "0");
  });

  it("pins the controlled active cell supplied by the consumer", () => {
    renderGrid({
      activeCellKey: "2026-08-24:09:00",
      getCellLabel: (cell, context) => `${cell.date} ${context.key}`,
    });

    expect(
      within(screen.getByRole("grid")).getByRole("gridcell", {
        name: "2026-08-24 2026-08-24:09:00",
      })
    ).toHaveAttribute("tabindex", "0");
  });

  it("invokes the keyboard extension with the pinned event and context arity", async () => {
    const onCellKeyDown = vi.fn<CalendarGridCellKeyDownHandler>();
    renderGrid({ onCellKeyDown });

    const cell = within(screen.getByRole("grid")).getByRole("gridcell", {
      name: "2026-08-24 09:00 2026-08-24:09:00",
    });
    cell.focus();
    const user = userEvent.setup();

    await user.keyboard("{Enter}");

    expect(onCellKeyDown).toHaveBeenCalledOnce();
    expect(onCellKeyDown.mock.calls[0]?.[1]).toStrictEqual(
      expect.objectContaining({ cell: firstCell, isReadOnly: false })
    );
  });

  it("renders the ordinary grid without status regions", () => {
    renderGrid({});

    expect(screen.getByRole("grid")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("renders the ordinary zero-row grid without status regions", () => {
    renderGrid({
      rows: [],
    });

    expect(screen.getByRole("grid")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("renders the ordinary grid with no alert region", () => {
    renderGrid({});

    expect(screen.getByRole("grid")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("CalendarGrid unit behaviour", () => {
  it("uses supplied header and cell slots while exposing the root class", () => {
    renderUnitGrid({
      className: "consumer-grid",
      renderCell: () => <span>slot</span>,
      renderHeader: (column) => <strong>{column.label} header</strong>,
    });

    expect(screen.getByRole("grid")).toHaveClass("consumer-grid");
    expect(screen.getByText("One header")).toBeVisible();
    expect(
      within(
        screen.getByRole("gridcell", {
          name: "2026-08-24 09:00 2026-08-24:09:00",
        })
      ).getByText("slot")
    ).toBeVisible();
  });

  it("supports RTL navigation and clamps movement at the grid edges", async () => {
    renderUnitGrid({ direction: "rtl" });
    const grid = screen.getByRole("grid");

    const first = within(grid).getByRole("gridcell", {
      name: "2026-08-24 09:00 2026-08-24:09:00",
    });

    const second = within(grid).getByRole("gridcell", {
      name: "2026-08-24 10:00 2026-08-24:10:00",
    });

    first.focus();
    const user = userEvent.setup();
    await user.keyboard("{ArrowLeft}");

    expect(second).toHaveFocus();

    await user.keyboard("{ArrowRight}");

    expect(first).toHaveFocus();

    await user.keyboard("{ArrowUp}");

    expect(first).toHaveFocus();
  });

  it("keeps controlled focus and lets the keyboard extension consume navigation", async () => {
    const onActiveCellChange = vi.fn<() => void>();

    const onCellKeyDown = vi.fn<CalendarGridCellKeyDownHandler>((event) => {
      event.preventDefault();
    });

    renderUnitGrid({
      activeCellKey: "2026-08-24:10:00",
      onActiveCellChange,
      onCellKeyDown,
    });

    const first = screen.getByRole("gridcell", {
      name: "2026-08-24 09:00 2026-08-24:09:00",
    });

    const second = screen.getByRole("gridcell", {
      name: "2026-08-24 10:00 2026-08-24:10:00",
    });

    expect(second).toHaveAttribute("tabindex", "0");
    second.focus();
    const user = userEvent.setup();
    await user.keyboard("{ArrowLeft}");

    expect(first).not.toHaveFocus();
    expect(onActiveCellChange).not.toHaveBeenCalled();
    expect(onCellKeyDown).toHaveBeenCalledOnce();
  });

  it("renders the default zero-row grid without cells or status", () => {
    renderUnitGrid({ renderCell: () => null, rows: [] });

    expect(screen.getByRole("grid")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("clamps Home, End, and vertical movement while rejecting a stale destination record", async () => {
    const { unmount } = renderUnitGrid();
    const grid = screen.getByRole("grid");

    const first = within(grid).getByRole("gridcell", {
      name: "2026-08-24 09:00 2026-08-24:09:00",
    });

    first.focus();
    const user = userEvent.setup();
    await user.keyboard("{Home}");
    await user.keyboard("{End}");
    await user.keyboard("{ArrowDown}");
    await user.keyboard("{ArrowUp}");

    let calls = 0;

    const staleKey = (cell: CalendarCell): string => {
      calls += 1;

      return calls > 4 ? "stale-key" : `${cell.date}:${cell.startTime}`;
    };

    unmount();
    renderUnitGrid({ getCellKey: staleKey });

    const staleFirst = screen.getByRole("gridcell", {
      name: "2026-08-24 09:00 2026-08-24:09:00",
    });

    staleFirst.focus();
    await user.keyboard("{ArrowRight}");

    expect(staleFirst).toHaveFocus();
  });

  it("omits cells whose key no longer exists in the indexed records", () => {
    let calls = 0;

    const changingKey = (cell: CalendarCell): string => {
      calls += 1;

      return calls > 3 ? "missing-key" : `${cell.date}:${cell.startTime}`;
    };

    renderUnitGrid({ getCellKey: changingKey });

    expect(
      within(screen.getByRole("grid")).queryAllByRole("gridcell")
    ).toHaveLength(0);
  });
});
