import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";

import { UTC } from "../../../__test-utils__/fixtures";
import { calendarDate, parseLocalTime, utcInstant } from "../../../core/model";
import type {
  CalendarAvailabilityCell,
  CalendarCellContext,
  CalendarSelectionRange,
} from "../../../core/model";
import { englishTranslate as t } from "../../../i18n/english";
import { AvailabilityGrid } from "../availability-grid";
import type { AvailabilityGridProps } from "../availability-grid";

const MONDAY = "2026-08-24";

const TUESDAY = "2026-08-25";

const cell = (
  date: string,
  time: string,
  available = true
): CalendarAvailabilityCell => {
  const hour = Number(time.slice(0, 2));
  const nextHour = `${String(hour + 1).padStart(2, "0")}:00`;

  return {
    available,
    date: calendarDate(date),
    end: utcInstant(`${date}T${nextHour}:00.000Z`),
    endTime: parseLocalTime(nextHour),
    start: utcInstant(`${date}T${time}:00.000Z`),
    startTime: parseLocalTime(time),
  };
};

const mon08 = cell(MONDAY, "08:00");

const mon09Blocked = cell(MONDAY, "09:00", false);

const mon10 = cell(MONDAY, "10:00");

const tue08 = cell(TUESDAY, "08:00");

const tue09 = cell(TUESDAY, "09:00");

const tue10 = cell(TUESDAY, "10:00");

const cells = [mon08, mon09Blocked, mon10, tue08, tue09, tue10] as const;

const keyboardMon09 = cell(MONDAY, "09:00");

const keyboardCells = [mon08, keyboardMon09, mon10] as const;

const renderCell = (
  context: CalendarCellContext & { readonly available: boolean }
): ReactElement => (
  <span>
    {context.cell.date} {context.cell.startTime}
  </span>
);

const availabilityElement = (
  overrides: Partial<AvailabilityGridProps> = {}
): ReactElement => (
  <AvailabilityGrid
    date={calendarDate(MONDAY)}
    cells={cells}
    timeZone={UTC}
    locale="en-US"
    t={t}
    direction="ltr"
    renderCell={renderCell}
    {...overrides}
  />
);

const renderAvailability = (overrides: Partial<AvailabilityGridProps> = {}) => {
  const view = render(availabilityElement(overrides));

  return {
    ...view,
    rerender: (next: Partial<AvailabilityGridProps> = {}): void => {
      view.rerender(availabilityElement({ ...overrides, ...next }));
    },
  };
};

const getRenderedCell = (date: string, time: string): HTMLElement => {
  const content = screen.getByText(`${date} ${time}`);
  const element = content.closest<HTMLElement>('[role="gridcell"]');

  if (!element) {
    throw new Error(
      `Expected ${date} ${time} to be rendered inside a gridcell`
    );
  }

  return element;
};

const expectedRange = (
  start: CalendarAvailabilityCell,
  end: CalendarAvailabilityCell,
  rangeCells: readonly CalendarAvailabilityCell[]
): CalendarSelectionRange => ({ cells: rangeCells, end, start });

describe(AvailabilityGrid, () => {
  it("renders host-supplied cells with an accessible grid name and availability context", () => {
    const renderSlot = vi.fn<typeof renderCell>(renderCell);

    renderAvailability({ renderCell: renderSlot });

    const grid = screen.getByRole("grid", { name: "Availability" });

    expect(grid).toHaveAttribute("dir", "ltr");
    expect(within(grid).getAllByRole("gridcell")).toHaveLength(cells.length);
    expect(screen.getByText("2026-08-24 08:00")).toBeVisible();
    expect(screen.getByText("2026-08-25 10:00")).toBeVisible();
    expect(renderSlot).toHaveBeenCalledWith(
      expect.objectContaining({
        available: false,
        cell: mon09Blocked,
        isReadOnly: false,
        isSelected: false,
        isUnavailable: true,
      })
    );
  });

  it("keeps the cell label in the accessibility tree without rendering it as visible text", () => {
    renderAvailability({ renderCell: undefined });

    const grid = screen.getByRole("grid", { name: "Availability" });
    const gridCells = within(grid).getAllByRole("gridcell");

    expect(gridCells[0]).toHaveAttribute(
      "aria-label",
      expect.stringMatching(/Monday, August 24, 2026 8:00/iu)
    );

    for (const gridCell of gridCells) {
      expect(gridCell.textContent).toBe("");
    }
  });

  it("paints a reversed drag in chronological order and skips blocked cells", () => {
    const onPaintSelect = vi.fn<(range: CalendarSelectionRange) => void>();

    renderAvailability({ onPaintSelect });

    const start = getRenderedCell(MONDAY, "10:00");
    const blocked = getRenderedCell(MONDAY, "09:00");
    const end = getRenderedCell(MONDAY, "08:00");

    fireEvent.pointerDown(start);
    fireEvent.pointerEnter(blocked);
    fireEvent.pointerMove(end);
    fireEvent.pointerUp(end);

    expect(onPaintSelect).toHaveBeenCalledExactlyOnceWith(
      expectedRange(mon08, mon10, [mon08, mon10])
    );
  });

  it("does not start painting from a blocked cell and cancels a pending drag without emitting", () => {
    const onPaintSelect = vi.fn<(range: CalendarSelectionRange) => void>();

    renderAvailability({ onPaintSelect });

    const blocked = getRenderedCell(MONDAY, "09:00");
    const available = getRenderedCell(MONDAY, "08:00");

    fireEvent.pointerDown(blocked);
    fireEvent.pointerEnter(available);
    fireEvent.pointerUp(available);

    expect(onPaintSelect).not.toHaveBeenCalled();

    fireEvent.pointerDown(available);
    fireEvent.pointerEnter(getRenderedCell(MONDAY, "10:00"));
    fireEvent.pointerCancel(getRenderedCell(MONDAY, "10:00"));
    fireEvent.pointerUp(getRenderedCell(MONDAY, "10:00"));

    expect(onPaintSelect).not.toHaveBeenCalled();
  });

  it("extends the selected range with Shift+Arrow and clears it with Escape", async () => {
    const onPaintSelect = vi.fn<(range: CalendarSelectionRange) => void>();
    const renderSlot = vi.fn<typeof renderCell>(renderCell);

    renderAvailability({
      cells: keyboardCells,
      onPaintSelect,
      renderCell: renderSlot,
    });

    const first = getRenderedCell(MONDAY, "08:00");
    const second = getRenderedCell(MONDAY, "09:00");
    const third = getRenderedCell(MONDAY, "10:00");
    const user = userEvent.setup();

    first.focus();
    await user.keyboard("{ArrowDown}");
    second.focus();
    await user.keyboard("{Shift>}{ArrowDown}{/Shift}");

    third.focus();
    await user.keyboard("{Escape}");

    expect(onPaintSelect).toHaveBeenCalledExactlyOnceWith(
      expectedRange(mon08, keyboardMon09, [mon08, keyboardMon09])
    );
    expect(renderSlot).toHaveBeenCalledWith(
      expect.objectContaining({ cell: mon08, isSelected: false })
    );
  });

  it("commits a single available cell with Enter and Space and ignores blocked activation", async () => {
    const onPaintSelect = vi.fn<(range: CalendarSelectionRange) => void>();

    renderAvailability({ onPaintSelect });

    const first = getRenderedCell(MONDAY, "08:00");
    const blocked = getRenderedCell(MONDAY, "09:00");
    const user = userEvent.setup();

    first.focus();
    await user.keyboard("{Enter}");
    await user.keyboard(" ");
    blocked.focus();
    await user.keyboard("{Enter}");

    expect(onPaintSelect).toHaveBeenCalledTimes(2);
    expect(onPaintSelect).toHaveBeenNthCalledWith(
      1,
      expectedRange(mon08, mon08, [mon08])
    );
    expect(onPaintSelect).toHaveBeenNthCalledWith(
      2,
      expectedRange(mon08, mon08, [mon08])
    );
  });

  it("repaints after a completed selection and emits the new ordered range", () => {
    const onPaintSelect = vi.fn<(range: CalendarSelectionRange) => void>();

    renderAvailability({ onPaintSelect });

    fireEvent.pointerDown(getRenderedCell(MONDAY, "08:00"));
    fireEvent.pointerUp(getRenderedCell(MONDAY, "08:00"));

    fireEvent.pointerDown(getRenderedCell(TUESDAY, "10:00"));
    fireEvent.pointerEnter(getRenderedCell(TUESDAY, "08:00"));
    fireEvent.pointerUp(getRenderedCell(TUESDAY, "08:00"));

    expect(onPaintSelect).toHaveBeenCalledTimes(2);
    expect(onPaintSelect).toHaveBeenLastCalledWith(
      expectedRange(tue08, tue10, [tue08, tue09, tue10])
    );
  });

  it("keeps a controlled selection authoritative until the host rerenders it", async () => {
    const onSelectedRangeChange =
      vi.fn<(range: CalendarSelectionRange | null) => void>();
    const selectedRange = expectedRange(mon08, mon10, [mon08, mon10]);

    const selectedStates: boolean[] = [];

    const renderSlot = vi.fn<
      (
        context: CalendarCellContext & { readonly available: boolean }
      ) => ReactElement
    >((context: CalendarCellContext & { readonly available: boolean }) => {
      if (context.cell === mon08) {
        selectedStates.push(context.isSelected);
      }

      return renderCell(context);
    });

    const { rerender } = renderAvailability({
      onSelectedRangeChange,
      renderCell: renderSlot,
      selectedRange,
    });

    expect(selectedStates.at(-1)).toBeTruthy();

    const target = getRenderedCell(MONDAY, "10:00");
    target.focus();
    const user = userEvent.setup();
    await user.keyboard("{Escape}");

    expect(onSelectedRangeChange).toHaveBeenCalledWith(null);
    expect(selectedStates.at(-1)).toBeTruthy();

    rerender({ selectedRange: undefined });

    expect(selectedStates.at(-1)).toBeFalsy();
  });

  it("keeps read-only cells navigable but rejects paint, keyboard selection, and clearing", async () => {
    const onPaintSelect = vi.fn<() => void>();
    const onSelectedRangeChange = vi.fn<() => void>();
    const selectedRange = expectedRange(mon08, mon10, [mon08, mon10]);
    const renderSlot = vi.fn<typeof renderCell>(renderCell);

    renderAvailability({
      interactionMode: "read-only",
      onPaintSelect,
      onSelectedRangeChange,
      renderCell: renderSlot,
      selectedRange,
    });

    const first = getRenderedCell(MONDAY, "08:00");
    const second = getRenderedCell(MONDAY, "10:00");

    expect(renderSlot).toHaveBeenCalledWith(
      expect.objectContaining({ isReadOnly: true, isSelected: true })
    );

    const user = userEvent.setup();
    first.focus();
    await user.keyboard("{ArrowDown}");
    second.focus();
    await user.keyboard("{Enter}");
    await user.keyboard("{Escape}");
    fireEvent.pointerDown(first);
    fireEvent.pointerUp(second);

    expect(second).toHaveFocus();
    expect(onPaintSelect).not.toHaveBeenCalled();
    expect(onSelectedRangeChange).not.toHaveBeenCalled();
  });

  it("flips horizontal keyboard navigation in RTL while preserving the host direction", async () => {
    renderAvailability({ direction: "rtl" });

    const monday = getRenderedCell(MONDAY, "08:00");
    const tuesday = getRenderedCell(TUESDAY, "08:00");

    expect(screen.getByRole("grid")).toHaveAttribute("dir", "rtl");

    monday.focus();
    const user = userEvent.setup();
    await user.keyboard("{ArrowLeft}");

    expect(tuesday).toHaveFocus();
  });

  it("renders the ordinary zero-cell grid without status or alert regions", () => {
    const { rerender } = renderAvailability({
      cells: [],
    });

    expect(screen.getByRole("grid")).toBeInTheDocument();
    expect(screen.queryAllByRole("gridcell")).toHaveLength(0);

    rerender();

    expect(screen.getByRole("grid")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
