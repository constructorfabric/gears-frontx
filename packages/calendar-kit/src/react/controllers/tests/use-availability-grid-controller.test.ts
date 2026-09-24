import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  availabilityCell as cell,
  keyboardEvent as keyDownEvent,
  UTC,
} from "../../../__test-utils__/fixtures";
import type {
  CalendarAvailabilityCell,
  CalendarSelectionRange,
} from "../../../core/model";
import { calendarDate } from "../../../core/model";
import { useAvailabilityGridController } from "../use-availability-grid-controller";
import type { UseAvailabilityGridControllerOptions } from "../use-availability-grid-controller";

// React's AbstractView type needs styleMedia.
declare global {
  interface Window {
    styleMedia: { matchMedium: (query: string) => boolean; type: string };
  }
}

const MONDAY = "2026-08-24";
const TUESDAY = "2026-08-25";
const WEDNESDAY = "2026-08-26";

const availabilityCells = (): CalendarAvailabilityCell[] => {
  const days = [MONDAY, TUESDAY, WEDNESDAY];

  const hours = ["08:00", "09:00", "10:00", "11:00"];

  const blocked = new Set<string>([`${MONDAY}:10:00`, `${TUESDAY}:09:00`]);

  return days.flatMap((day) =>
    hours.map((hour) => cell(day, hour, !blocked.has(`${day}:${hour}`)))
  );
};

const mon08 = cell(MONDAY, "08:00");
const mon09 = cell(MONDAY, "09:00");
const mon10Blocked = cell(MONDAY, "10:00", false);
const mon11 = cell(MONDAY, "11:00");

const wed08 = cell(WEDNESDAY, "08:00");
const wed09 = cell(WEDNESDAY, "09:00");
const wed10 = cell(WEDNESDAY, "10:00");
const wed11 = cell(WEDNESDAY, "11:00");

const keyEvent = (key: string, shiftKey = false) => {
  const event = keyDownEvent(key, { shiftKey });

  return { event, preventDefault: vi.spyOn(event, "preventDefault") };
};

const baseOptions = (
  overrides: Partial<UseAvailabilityGridControllerOptions> = {}
) => ({
  cells: availabilityCells(),
  date: calendarDate(MONDAY),
  timeZone: UTC,
  ...overrides,
});

describe(useAvailabilityGridController, () => {
  it("exposes host cells as chronological day columns", () => {
    const { result } = renderHook(() =>
      useAvailabilityGridController(baseOptions())
    );

    expect(result.current.interactionMode).toBe("paint");
    expect(result.current.columns.map((column) => column.key)).toStrictEqual([
      MONDAY,
      TUESDAY,
      WEDNESDAY,
    ]);
  });

  it("preserves each host column's cells", () => {
    const { result } = renderHook(() =>
      useAvailabilityGridController(baseOptions())
    );

    expect(result.current.columns[0].cells).toStrictEqual([
      mon08,
      mon09,
      mon10Blocked,
      mon11,
    ]);
  });

  it("returns host cells only for valid grid coordinates", () => {
    const { result } = renderHook(() =>
      useAvailabilityGridController(baseOptions())
    );

    expect(result.current.getCell(0, 0)).toStrictEqual(mon08);
    expect(result.current.getCell(3, 2)).toStrictEqual(wed11);
    expect(result.current.getCell(4, 0)).toBeUndefined();
    expect(result.current.getCell(0, 3)).toBeUndefined();
    expect(result.current.selectedRange).toBeNull();
  });

  it("builds sparse host columns for available days", () => {
    const sparse = [
      cell(MONDAY, "08:00"),
      cell(MONDAY, "09:00"),
      cell(TUESDAY, "09:00"),
      cell(TUESDAY, "10:00"),
    ];

    const { result } = renderHook(() =>
      useAvailabilityGridController(baseOptions({ cells: sparse }))
    );

    expect(result.current.columns).toHaveLength(2);
    expect(result.current.getCell(0, 0)).toStrictEqual(cell(MONDAY, "08:00"));
    expect(result.current.getCell(1, 0)).toStrictEqual(cell(MONDAY, "09:00"));
    expect(result.current.getCell(1, 1)).toStrictEqual(cell(TUESDAY, "09:00"));
  });

  it("leaves missing sparse grid slots empty", () => {
    const sparse = [
      cell(MONDAY, "08:00"),
      cell(MONDAY, "09:00"),
      cell(TUESDAY, "09:00"),
      cell(TUESDAY, "10:00"),
    ];

    const { result } = renderHook(() =>
      useAvailabilityGridController(baseOptions({ cells: sparse }))
    );

    expect(result.current.getCell(0, 1)).toBeUndefined();
    expect(result.current.getCell(2, 0)).toBeUndefined();
    expect(result.current.getCell(2, 1)).toStrictEqual(cell(TUESDAY, "10:00"));
  });

  it("emits the exact ordered paint callbacks for reversed pointer travel", () => {
    const onPaintSelect = vi.fn<(range: CalendarSelectionRange) => void>();
    const onSelectedRangeChange =
      vi.fn<(range: CalendarSelectionRange | null) => void>();

    const { result } = renderHook(() =>
      useAvailabilityGridController(
        baseOptions({ onPaintSelect, onSelectedRangeChange })
      )
    );

    act(() => {
      result.current.beginPaint(wed11);
      result.current.updatePaint(wed09);
      result.current.endPaint();
    });

    expect(onPaintSelect).toHaveBeenCalledExactlyOnceWith({
      cells: [wed09, wed10, wed11],
      end: wed11,
      start: wed09,
    });
    expect(onSelectedRangeChange).toHaveBeenCalledExactlyOnceWith({
      cells: [wed09, wed10, wed11],
      end: wed11,
      start: wed09,
    });
  });

  it("commits reversed pointer travel and clears the pending paint", () => {
    const { result } = renderHook(() =>
      useAvailabilityGridController(baseOptions())
    );

    act(() => {
      result.current.beginPaint(wed11);
      result.current.updatePaint(wed09);
      result.current.endPaint();
    });

    expect(result.current.selectedRange).toStrictEqual({
      cells: [wed09, wed10, wed11],
      end: wed11,
      start: wed09,
    });
    expect(result.current.paint).toBeNull();
  });

  it("excludes blocked cells from the painted range and keeps the anchor while crossing them", () => {
    const onPaintSelect = vi.fn<(range: CalendarSelectionRange) => void>();
    const { result } = renderHook(() =>
      useAvailabilityGridController(baseOptions({ onPaintSelect }))
    );

    act(() => {
      result.current.beginPaint(mon11);
      result.current.updatePaint(mon10Blocked);
    });

    expect(result.current.paint).toStrictEqual({
      cells: [mon11],
      end: mon11,
      start: mon11,
    });

    act(() => {
      result.current.updatePaint(mon09);
      result.current.endPaint();
    });

    expect(onPaintSelect).toHaveBeenCalledExactlyOnceWith({
      cells: [mon09, mon11],
      end: mon11,
      start: mon09,
    });
  });

  it("does not start a paint on a blocked origin and cancels without emitting", () => {
    const onPaintSelect = vi.fn<() => void>();
    const { result } = renderHook(() =>
      useAvailabilityGridController(baseOptions({ onPaintSelect }))
    );

    act(() => {
      result.current.beginPaint(mon10Blocked);
      result.current.updatePaint(mon09);
      result.current.endPaint();
    });

    expect(result.current.paint).toBeNull();
    expect(onPaintSelect).not.toHaveBeenCalled();

    act(() => {
      result.current.beginPaint(wed09);
      result.current.cancelPaint();
    });

    expect(result.current.paint).toBeNull();
    expect(onPaintSelect).not.toHaveBeenCalled();
  });

  it("keeps the default selection independently controllable", () => {
    const onSelectedRangeChange =
      vi.fn<(range: CalendarSelectionRange | null) => void>();

    const defaultRange = { cells: [wed09, wed10], end: wed10, start: wed09 };

    const { result, rerender } = renderHook(
      (props: { selectedRange?: CalendarSelectionRange | null }) =>
        useAvailabilityGridController(
          baseOptions({
            defaultSelectedRange: defaultRange,
            onSelectedRangeChange,
            ...props,
          })
        ),
      { initialProps: {} }
    );

    expect(result.current.selectedRange).toStrictEqual(defaultRange);

    act(() => {
      result.current.clearSelection();
    });

    expect(result.current.selectedRange).toBeNull();
    expect(onSelectedRangeChange).toHaveBeenLastCalledWith(null);

    rerender({ selectedRange: defaultRange });

    expect(result.current.selectedRange).toStrictEqual(defaultRange);
  });

  it("keeps a controlled selection authoritative after clearing", () => {
    const onSelectedRangeChange =
      vi.fn<(range: CalendarSelectionRange | null) => void>();

    const defaultRange = { cells: [wed09, wed10], end: wed10, start: wed09 };

    const { result, rerender } = renderHook(
      (props: { selectedRange?: CalendarSelectionRange | null }) =>
        useAvailabilityGridController(
          baseOptions({
            defaultSelectedRange: defaultRange,
            onSelectedRangeChange,
            ...props,
          })
        ),
      { initialProps: {} }
    );

    rerender({ selectedRange: defaultRange });
    act(() => {
      result.current.clearSelection();
    });

    expect(result.current.selectedRange).toStrictEqual(defaultRange);
    expect(onSelectedRangeChange).toHaveBeenLastCalledWith(null);
  });

  it("moves focus with an unmodified arrow key", () => {
    const { result } = renderHook(() =>
      useAvailabilityGridController(baseOptions())
    );
    const first = keyEvent("ArrowDown");

    act(() => {
      result.current.handleGridKeyDown(first.event, 0, 0);
    });

    expect(first.preventDefault).toHaveBeenCalledOnce();
    expect(result.current.focusedCell).toStrictEqual({
      columnIndex: 0,
      rowIndex: 1,
    });
  });

  it("starts a selection with the first Shift+arrow extension", () => {
    const onPaintSelect = vi.fn<(range: CalendarSelectionRange) => void>();
    const { result } = renderHook(() =>
      useAvailabilityGridController(baseOptions({ onPaintSelect }))
    );
    const first = keyEvent("ArrowDown");
    const extendOne = keyEvent("ArrowDown", true);

    act(() => {
      result.current.handleGridKeyDown(first.event, 0, 0);
      result.current.handleGridKeyDown(extendOne.event, 1, 0);
    });

    expect(result.current.focusedCell).toStrictEqual({
      columnIndex: 0,
      rowIndex: 2,
    });

    expect(result.current.selectedRange).toStrictEqual({
      cells: [mon08, mon09],
      end: mon09,
      start: mon08,
    });
    expect(onPaintSelect).toHaveBeenCalledExactlyOnceWith({
      cells: [mon08, mon09],
      end: mon09,
      start: mon08,
    });
  });

  it("extends a Shift+arrow selection across the next available cell", () => {
    const onPaintSelect = vi.fn<(range: CalendarSelectionRange) => void>();
    const { result } = renderHook(() =>
      useAvailabilityGridController(baseOptions({ onPaintSelect }))
    );
    const first = keyEvent("ArrowDown");
    const extendOne = keyEvent("ArrowDown", true);
    const extendTwo = keyEvent("ArrowDown", true);

    act(() => {
      result.current.handleGridKeyDown(first.event, 0, 0);
      result.current.handleGridKeyDown(extendOne.event, 1, 0);
      result.current.handleGridKeyDown(extendTwo.event, 2, 0);
    });

    expect(result.current.focusedCell).toStrictEqual({
      columnIndex: 0,
      rowIndex: 3,
    });

    expect(result.current.selectedRange).toStrictEqual({
      cells: [mon08, mon09, mon11],
      end: mon11,
      start: mon08,
    });
    expect(onPaintSelect).toHaveBeenCalledTimes(2);
  });

  it("clears the painted selection with Escape", () => {
    const onSelectedRangeChange =
      vi.fn<(range: CalendarSelectionRange | null) => void>();
    const { result } = renderHook(() =>
      useAvailabilityGridController(baseOptions({ onSelectedRangeChange }))
    );
    const first = keyEvent("ArrowDown");
    const extend = keyEvent("ArrowDown", true);
    const escape = keyEvent("Escape");

    act(() => {
      result.current.handleGridKeyDown(first.event, 0, 0);
    });
    act(() => {
      result.current.handleGridKeyDown(extend.event, 1, 0);
    });
    act(() => {
      result.current.handleGridKeyDown(escape.event, 2, 0);
    });

    expect(result.current.selectedRange).toBeNull();
    expect(onSelectedRangeChange).toHaveBeenLastCalledWith(null);
  });

  it("keeps the previous selection when a keyboard extension lands on a fully blocked span", () => {
    const onPaintSelect = vi.fn<() => void>();
    const { result } = renderHook(() =>
      useAvailabilityGridController(baseOptions({ onPaintSelect }))
    );

    act(() => {
      result.current.setFocusedCell({ columnIndex: 0, rowIndex: 2 });
    });

    const extend = keyEvent("ArrowDown", true);
    act(() => {
      result.current.handleGridKeyDown(extend.event, 2, 0);
    });

    expect(result.current.focusedCell).toStrictEqual({
      columnIndex: 0,
      rowIndex: 3,
    });

    expect(result.current.selectedRange).toBeNull();
    expect(onPaintSelect).not.toHaveBeenCalled();

    act(() => {
      result.current.setFocusedCell({ columnIndex: 0, rowIndex: 1 });
    });

    const extendFromNine = keyEvent("ArrowDown", true);
    act(() => {
      result.current.handleGridKeyDown(extendFromNine.event, 1, 0);
    });

    expect(result.current.selectedRange).toStrictEqual({
      cells: [mon09],
      end: mon09,
      start: mon09,
    });

    expect(onPaintSelect).toHaveBeenCalledOnce();
  });

  it("commits a single-cell paint on Enter", () => {
    const onPaintSelect = vi.fn<(range: CalendarSelectionRange) => void>();
    const { result } = renderHook(() =>
      useAvailabilityGridController(baseOptions({ onPaintSelect }))
    );
    const enter = keyEvent("Enter");

    act(() => {
      result.current.handleGridKeyDown(enter.event, 0, 0);
    });

    expect(enter.preventDefault).toHaveBeenCalledOnce();
    expect(onPaintSelect).toHaveBeenCalledExactlyOnceWith({
      cells: [mon08],
      end: mon08,
      start: mon08,
    });

    expect(result.current.selectedRange).toStrictEqual({
      cells: [mon08],
      end: mon08,
      start: mon08,
    });
  });

  it("commits a single-cell paint on Space", () => {
    const onPaintSelect = vi.fn<(range: CalendarSelectionRange) => void>();
    const { result } = renderHook(() =>
      useAvailabilityGridController(baseOptions({ onPaintSelect }))
    );
    act(() => {
      result.current.setFocusedCell({ columnIndex: 0, rowIndex: 1 });
    });
    const space = keyEvent(" ");

    act(() => {
      result.current.handleGridKeyDown(space.event, 1, 0);
    });

    expect(space.preventDefault).toHaveBeenCalledOnce();
    expect(onPaintSelect).toHaveBeenCalledExactlyOnceWith({
      cells: [mon09],
      end: mon09,
      start: mon09,
    });
  });

  it("ignores a blocked Enter target", () => {
    const onPaintSelect = vi.fn<(range: CalendarSelectionRange) => void>();
    const { result } = renderHook(() =>
      useAvailabilityGridController(baseOptions({ onPaintSelect }))
    );
    const blockedEnter = keyEvent("Enter");

    act(() => {
      result.current.handleGridKeyDown(blockedEnter.event, 2, 0);
    });

    expect(onPaintSelect).not.toHaveBeenCalled();
  });

  it("moves roving focus across adjacent cells", () => {
    const { result } = renderHook(() =>
      useAvailabilityGridController(baseOptions())
    );

    const press = (key: string, row: number, column: number) => {
      const pressed = keyEvent(key);
      act(() => {
        result.current.handleGridKeyDown(pressed.event, row, column);
      });

      return pressed.preventDefault;
    };

    expect(press("ArrowRight", 0, 0)).toHaveBeenCalledOnce();
    expect(result.current.focusedCell).toStrictEqual({
      columnIndex: 1,
      rowIndex: 0,
    });
    expect(press("ArrowDown", 0, 1)).toHaveBeenCalledOnce();
    expect(result.current.focusedCell).toStrictEqual({
      columnIndex: 1,
      rowIndex: 1,
    });
  });

  it("moves roving focus to the row edges with Home and End", () => {
    const { result } = renderHook(() =>
      useAvailabilityGridController(baseOptions())
    );

    const press = (key: string, row: number, column: number) => {
      const pressed = keyEvent(key);
      act(() => {
        result.current.handleGridKeyDown(pressed.event, row, column);
      });

      return pressed.preventDefault;
    };

    expect(press("Home", 1, 1)).toHaveBeenCalledOnce();
    expect(result.current.focusedCell).toStrictEqual({
      columnIndex: 0,
      rowIndex: 1,
    });
    expect(press("End", 1, 0)).toHaveBeenCalledOnce();
    expect(result.current.focusedCell).toStrictEqual({
      columnIndex: 2,
      rowIndex: 1,
    });
  });

  it("clamps roving focus at the grid edges", () => {
    const { result } = renderHook(() =>
      useAvailabilityGridController(baseOptions())
    );

    const press = (key: string, row: number, column: number) => {
      const pressed = keyEvent(key);
      act(() => {
        result.current.handleGridKeyDown(pressed.event, row, column);
      });

      return pressed.preventDefault;
    };

    expect(press("ArrowUp", 1, 2)).toHaveBeenCalledOnce();
    expect(result.current.focusedCell).toStrictEqual({
      columnIndex: 2,
      rowIndex: 0,
    });
    press("ArrowUp", 0, 2);
    press("ArrowRight", 0, 2);
    expect(result.current.focusedCell).toStrictEqual({
      columnIndex: 2,
      rowIndex: 0,
    });
  });

  it("flips horizontal keyboard movement in RTL direction", () => {
    const { result } = renderHook(() =>
      useAvailabilityGridController(baseOptions({ direction: "rtl" }))
    );

    const left = keyEvent("ArrowLeft");
    act(() => {
      result.current.handleGridKeyDown(left.event, 0, 0);
    });

    expect(left.preventDefault).toHaveBeenCalledOnce();
    expect(result.current.focusedCell).toStrictEqual({
      columnIndex: 1,
      rowIndex: 0,
    });

    const right = keyEvent("ArrowRight");
    act(() => {
      result.current.handleGridKeyDown(right.event, 0, 1);
    });

    expect(result.current.focusedCell).toStrictEqual({
      columnIndex: 0,
      rowIndex: 0,
    });
  });

  it("rejects painting, extending, clearing, and activation in read-only mode", () => {
    const onPaintSelect = vi.fn<() => void>();
    const onSelectedRangeChange = vi.fn<() => void>();

    const defaultRange = { cells: [mon08, mon09], end: mon09, start: mon08 };

    const { result } = renderHook(() =>
      useAvailabilityGridController(
        baseOptions({
          defaultSelectedRange: defaultRange,
          interactionMode: "read-only",
          onPaintSelect,
          onSelectedRangeChange,
        })
      )
    );

    act(() => {
      result.current.beginPaint(mon08);
      result.current.updatePaint(mon11);
      result.current.endPaint();
      result.current.clearSelection();
    });

    const enter = keyEvent("Enter");
    const extend = keyEvent("ArrowDown", true);
    const escape = keyEvent("Escape");
    act(() => {
      result.current.handleGridKeyDown(enter.event, 0, 0);
      result.current.handleGridKeyDown(extend.event, 0, 0);
      result.current.handleGridKeyDown(escape.event, 0, 0);
    });

    expect(onPaintSelect).not.toHaveBeenCalled();
    expect(onSelectedRangeChange).not.toHaveBeenCalled();
    expect(result.current.selectedRange).toStrictEqual(defaultRange);
    expect(result.current.paint).toBeNull();

    const arrow = keyEvent("ArrowRight");
    act(() => {
      result.current.handleGridKeyDown(arrow.event, 0, 0);
    });

    expect(result.current.focusedCell).toStrictEqual({
      columnIndex: 1,
      rowIndex: 0,
    });
  });

  it("preserves a pending paint while the controlled selection changes", () => {
    const onPaintSelect = vi.fn<() => void>();
    const onSelectedRangeChange = vi.fn<() => void>();

    const hostRange = { cells: [wed08, wed09], end: wed09, start: wed08 };

    const { result, rerender } = renderHook(
      (props: { selectedRange?: CalendarSelectionRange | null }) =>
        useAvailabilityGridController(
          baseOptions({
            onPaintSelect,
            onSelectedRangeChange,
            selectedRange: props.selectedRange,
          })
        ),
      { initialProps: { selectedRange: hostRange } }
    );

    act(() => {
      result.current.beginPaint(wed10);
      result.current.updatePaint(wed11);
    });

    expect(result.current.paint).toStrictEqual({
      cells: [wed10, wed11],
      end: wed11,
      start: wed10,
    });

    rerender({
      selectedRange: { cells: [mon08, mon09], end: mon09, start: mon08 },
    });
    expect(result.current.selectedRange).toStrictEqual({
      cells: [mon08, mon09],
      end: mon09,
      start: mon08,
    });
  });

  it("emits only the controlled selection when a pending paint ends", () => {
    const onPaintSelect = vi.fn<() => void>();
    const onSelectedRangeChange = vi.fn<() => void>();

    const hostRange = { cells: [wed08, wed09], end: wed09, start: wed08 };

    const { result, rerender } = renderHook(
      (props: { selectedRange?: CalendarSelectionRange | null }) =>
        useAvailabilityGridController(
          baseOptions({
            onPaintSelect,
            onSelectedRangeChange,
            selectedRange: props.selectedRange,
          })
        ),
      { initialProps: { selectedRange: hostRange } }
    );

    act(() => {
      result.current.beginPaint(wed10);
      result.current.updatePaint(wed11);
    });
    rerender({
      selectedRange: { cells: [mon08, mon09], end: mon09, start: mon08 },
    });

    act(() => {
      result.current.endPaint();
    });

    expect(onPaintSelect).toHaveBeenCalledOnce();
    expect(onSelectedRangeChange).toHaveBeenCalledOnce();
    expect(result.current.selectedRange).toStrictEqual({
      cells: [mon08, mon09],
      end: mon09,
      start: mon08,
    });
  });

  it("ignores invalid pending-paint completion gestures", () => {
    const onPaintSelect = vi.fn<() => void>();

    const hostRange = { cells: [wed08, wed09], end: wed09, start: wed08 };

    const { result, rerender } = renderHook(
      (props: { selectedRange?: CalendarSelectionRange | null }) =>
        useAvailabilityGridController(
          baseOptions({ onPaintSelect, selectedRange: props.selectedRange })
        ),
      { initialProps: { selectedRange: hostRange } }
    );

    act(() => {
      result.current.beginPaint(wed10);
      result.current.updatePaint(wed11);
    });
    rerender({
      selectedRange: { cells: [mon08, mon09], end: mon09, start: mon08 },
    });
    act(() => {
      result.current.endPaint();
      result.current.endPaint();
      result.current.updatePaint(mon09);
      result.current.endPaint();
    });

    expect(onPaintSelect).toHaveBeenCalledOnce();
  });

  it("clears a pending paint when the host cell list changes", () => {
    const { result, rerender } = renderHook(
      (cells: readonly CalendarAvailabilityCell[]) =>
        useAvailabilityGridController(baseOptions({ cells })),
      { initialProps: availabilityCells() }
    );

    act(() => {
      result.current.beginPaint(wed09);
      result.current.updatePaint(wed11);
    });

    expect(result.current.paint).not.toBeNull();

    rerender([mon08, mon09]);

    expect(result.current.paint).toBeNull();
  });
});
