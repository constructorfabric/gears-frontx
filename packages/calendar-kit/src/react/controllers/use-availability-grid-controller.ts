/// <reference lib="es2023.array" />

import { useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";

import { arrayAt } from "../../core/array";
import {
  buildAvailabilityColumns,
  buildAvailabilityRange,
} from "../../core/availability";
import type { AvailabilityColumn } from "../../core/availability";
import { isGridNavigationKey, stepGridPosition } from "../../core/grid-keys";
import type {
  CalendarAvailabilityCell,
  CalendarCell,
  CalendarDirection,
  CalendarSelectionRange,
  IanaTimeZone,
} from "../../core/model";
import { useControlledValue } from "../hooks/use-controlled-value";

export interface UseAvailabilityGridControllerOptions {
  readonly date: CalendarAvailabilityCell["date"];
  readonly cells: readonly CalendarAvailabilityCell[];
  readonly timeZone: IanaTimeZone;
  readonly direction?: CalendarDirection;
  readonly selectedRange?: CalendarSelectionRange | null;
  readonly defaultSelectedRange?: CalendarSelectionRange | null;
  readonly onSelectedRangeChange?: (
    range: CalendarSelectionRange | null
  ) => void;
  readonly interactionMode?: "paint" | "read-only";
  readonly onPaintSelect?: (range: CalendarSelectionRange) => void;
}

export interface AvailabilityFocusedCell {
  readonly rowIndex: number;
  readonly columnIndex: number;
}

export interface AvailabilityGridControllerInternals {
  readonly paintAnchor: CalendarCell | null;
  readonly keyboardAnchor: CalendarCell | null;
}

export interface UseAvailabilityGridControllerResult {
  readonly interactionMode: "paint" | "read-only";
  readonly columns: readonly AvailabilityColumn[];
  readonly selectedRange: CalendarSelectionRange | null;
  readonly paint: CalendarSelectionRange | null;
  readonly focusedCell: AvailabilityFocusedCell;
  readonly getCell: (
    rowIndex: number,
    columnIndex: number
  ) => CalendarAvailabilityCell | undefined;
  readonly setFocusedCell: (position: AvailabilityFocusedCell) => void;
  readonly beginPaint: (cell: CalendarAvailabilityCell) => void;
  readonly updatePaint: (cell: CalendarAvailabilityCell) => void;
  readonly endPaint: () => void;
  readonly cancelPaint: () => void;
  readonly clearSelection: () => void;
  readonly handleGridKeyDown: (
    event: ReactKeyboardEvent<HTMLDivElement>,
    rowIndex: number,
    columnIndex: number
  ) => void;
  readonly getInternals: () => Readonly<AvailabilityGridControllerInternals>;
}

const DEFAULT_INTERACTION_MODE = "paint" as const;

export const useAvailabilityGridController = (
  options: UseAvailabilityGridControllerOptions
): UseAvailabilityGridControllerResult => {
  const direction = options.direction ?? "ltr";
  const interactionMode = options.interactionMode ?? DEFAULT_INTERACTION_MODE;

  const columns = useMemo(
    () => buildAvailabilityColumns(options.cells),
    [options.cells]
  );

  const cellsSignature = useMemo(
    () =>
      options.cells
        .map(
          (cell) => `${cell.date}:${cell.start}:${cell.end}:${cell.available}`
        )
        .join("|"),
    [options.cells]
  );

  const selectedState = useControlledValue<CalendarSelectionRange | null>({
    defaultValue: options.defaultSelectedRange ?? null,
    onChange: options.onSelectedRangeChange,
    value: options.selectedRange,
  });

  const [paintState, setPaintState] = useState<{
    readonly signature: string;
    readonly range: CalendarSelectionRange | null;
  }>({ range: null, signature: cellsSignature });

  const [focusedCellState, setFocusedCellState] =
    useState<AvailabilityFocusedCell>({
      columnIndex: 0,
      rowIndex: 0,
    });

  const keyboardAnchorRef = useRef<CalendarAvailabilityCell | null>(
    columns[0]?.cells[0] ?? null
  );

  const paintAnchorRef = useRef<CalendarAvailabilityCell | null>(null);
  const paintRef = useRef<CalendarSelectionRange | null>(null);
  const paintSignatureRef = useRef(cellsSignature);

  const rowKeys = useMemo(() => {
    const keys = new Set<string>();

    for (const column of columns) {
      for (const cell of column.cells) {
        keys.add(cell.startTime);
      }
    }

    return [...keys].toSorted();
  }, [columns]);

  const cellIndexes = useMemo(
    () =>
      columns.map((column) => {
        const index = new Map<string, CalendarAvailabilityCell>();

        for (const cell of column.cells) {
          if (!index.has(cell.startTime)) {
            index.set(cell.startTime, cell);
          }
        }

        return index;
      }),
    [columns]
  );

  const paint =
    interactionMode === "read-only" || paintState.signature !== cellsSignature
      ? null
      : paintState.range;

  const setCurrentPaint = (range: CalendarSelectionRange | null): void => {
    paintRef.current = range;
    paintSignatureRef.current = cellsSignature;
    setPaintState({ range, signature: cellsSignature });
  };

  const getCell = (
    rowIndex: number,
    columnIndex: number
  ): CalendarAvailabilityCell | undefined => {
    const startTime = arrayAt(rowKeys, rowIndex);

    if (startTime === undefined) {
      return undefined;
    }

    return cellIndexes[columnIndex]?.get(startTime);
  };

  const isValidPosition = (position: AvailabilityFocusedCell): boolean =>
    position.rowIndex >= 0 &&
    position.rowIndex < rowKeys.length &&
    position.columnIndex >= 0 &&
    position.columnIndex < columns.length;

  const setFocusedCell = (position: AvailabilityFocusedCell): void => {
    const cell = isValidPosition(position)
      ? getCell(position.rowIndex, position.columnIndex)
      : undefined;

    if (cell !== undefined) {
      setFocusedCellState(position);
      keyboardAnchorRef.current = cell;
    }
  };

  const commitRange = (range: CalendarSelectionRange): void => {
    selectedState.setValue(range);
    options.onPaintSelect?.(range);
  };

  const beginPaint = (cell: CalendarAvailabilityCell): void => {
    if (interactionMode === "read-only") {
      return;
    }

    const range = buildAvailabilityRange(options.cells, cell, cell);

    if (range === null) {
      return;
    }

    paintAnchorRef.current = cell;
    setCurrentPaint(range);
  };

  const updatePaint = (cell: CalendarAvailabilityCell): void => {
    const anchor =
      paintSignatureRef.current === cellsSignature
        ? paintAnchorRef.current
        : null;

    if (interactionMode === "read-only" || anchor === null) {
      return;
    }

    const range = buildAvailabilityRange(options.cells, anchor, cell);

    if (range !== null) {
      setCurrentPaint(range);
    }
  };

  const endPaint = (): void => {
    const range =
      paintSignatureRef.current === cellsSignature ? paintRef.current : null;

    if (interactionMode === "read-only" || range === null) {
      paintAnchorRef.current = null;
      setCurrentPaint(null);

      return;
    }

    paintAnchorRef.current = null;
    setCurrentPaint(null);
    commitRange(range);
  };

  const cancelPaint = (): void => {
    paintAnchorRef.current = null;
    setCurrentPaint(null);
  };

  const clearSelection = (): void => {
    if (interactionMode === "read-only") {
      return;
    }

    selectedState.setValue(null);
  };

  const moveFocus = (
    event: ReactKeyboardEvent<HTMLDivElement>,
    rowIndex: number,
    columnIndex: number
  ): void => {
    const step = stepGridPosition(
      event.key,
      direction,
      { columnIndex, rowIndex },
      columns.length
    );

    const nextPosition = {
      columnIndex: Math.max(0, Math.min(columns.length - 1, step.columnIndex)),
      rowIndex:
        event.key === "ArrowDown"
          ? Math.min(step.rowIndex, Math.max(rowKeys.length - 1, 0))
          : Math.max(step.rowIndex, 0),
    };

    const nextCell = getCell(nextPosition.rowIndex, nextPosition.columnIndex);
    event.preventDefault();

    if (nextCell !== undefined) {
      setFocusedCellState(nextPosition);
      const nextKeyboardAnchor =
        keyboardAnchorRef.current ?? getCell(rowIndex, columnIndex) ?? nextCell;
      keyboardAnchorRef.current = nextKeyboardAnchor;

      if (event.shiftKey && interactionMode === "paint") {
        const anchor =
          keyboardAnchorRef.current ?? getCell(rowIndex, columnIndex);

        if (anchor !== undefined) {
          const currentCell = getCell(rowIndex, columnIndex);

          const range =
            (currentCell === undefined
              ? null
              : buildAvailabilityRange(options.cells, anchor, currentCell)) ??
            buildAvailabilityRange(options.cells, anchor, nextCell) ??
            buildAvailabilityRange(options.cells, anchor, anchor);

          if (range !== null) {
            commitRange(range);
          }
        }
      }
    }
  };

  const handleGridKeyDown = (
    event: ReactKeyboardEvent<HTMLDivElement>,
    rowIndex: number,
    columnIndex: number
  ): void => {
    if (isGridNavigationKey(event.key)) {
      moveFocus(event, rowIndex, columnIndex);

      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();

      if (event.repeat || interactionMode === "read-only") {
        return;
      }

      const cell = getCell(rowIndex, columnIndex);

      if (cell !== undefined) {
        const range = buildAvailabilityRange(options.cells, cell, cell);

        if (range !== null) {
          commitRange(range);
        }
      }

      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();

      if (interactionMode === "paint") {
        clearSelection();
        cancelPaint();
      }
    }
  };

  const getInternals = (): Readonly<AvailabilityGridControllerInternals> => ({
    keyboardAnchor: keyboardAnchorRef.current,
    paintAnchor: paintAnchorRef.current,
  });

  return {
    beginPaint,
    cancelPaint,
    clearSelection,
    columns,
    endPaint,
    focusedCell: focusedCellState,
    getCell,
    getInternals,
    handleGridKeyDown,
    interactionMode,
    paint,
    selectedRange: selectedState.value,
    setFocusedCell,
    updatePaint,
  };
};
