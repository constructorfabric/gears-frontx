"use client";

import { clsx } from "clsx";
import { useMemo } from "react";
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";

import { sortCopy } from "../../core/array";
import { dateTimeFormatter } from "../../core/intl-cache";
import type {
  CalendarAvailabilityCell,
  CalendarCell,
  CalendarCellContext,
  CalendarGridColumn,
  CalendarGridRow,
  CalendarSelectionRange,
} from "../../core/model";
import { useCalendarContext } from "../../i18n/calendar-context";
import {
  omitCalendarContextProps,
  useCalendarLocalization,
} from "../../i18n/calendar-localization";
import type {
  CalendarContextProps,
  CalendarTranslate,
} from "../../i18n/calendar-localization";
import { CalendarScope } from "../../i18n/calendar-localization-provider";
import { useAvailabilityGridController } from "../../react/controllers/use-availability-grid-controller";
import type { CalendarGridCellKeyDownHandler } from "../../react/slots";
import { CalendarGrid } from "../grid/calendar-grid";

import styles from "./availability-grid.module.css";

export interface AvailabilityGridProps extends CalendarContextProps {
  /** Class added to the component root. */
  readonly className?: string;
  /** Day the cells belong to, used for the grid's label. */
  readonly date: CalendarAvailabilityCell["date"];
  /** Host availability decisions, one per slot. */
  readonly cells: readonly CalendarAvailabilityCell[];
  /** Controlled painted range. */
  readonly selectedRange?: CalendarSelectionRange | null;
  /** Initial painted range when uncontrolled. */
  readonly defaultSelectedRange?: CalendarSelectionRange | null;
  /** Called when the painted range changes or clears. */
  readonly onSelectedRangeChange?: (
    range: CalendarSelectionRange | null
  ) => void;
  /** `read-only` keeps navigation but disables painting. Default `paint`. */
  readonly interactionMode?: "paint" | "read-only";
  /** Replaces cell content. The context adds the cell's `available` flag. */
  readonly renderCell?: (
    context: CalendarCellContext & { readonly available: boolean }
  ) => ReactNode;
  /** Called once when a paint gesture is committed. */
  readonly onPaintSelect?: (range: CalendarSelectionRange) => void;
}

const DEFAULT_MODE = "paint" as const;

const formatColumnLabel = (
  cell: CalendarAvailabilityCell,
  locale: string,
  timeZone: NonNullable<CalendarContextProps["timeZone"]>
): string =>
  dateTimeFormatter(locale, {
    day: "numeric",
    month: "short",
    timeZone,
    weekday: "short",
  }).format(new Date(cell.start));

const getCellKey = (cell: CalendarCell): string =>
  `${cell.date}:${cell.startTime}:${cell.start}`;

const buildRangeKeys = (
  range: CalendarSelectionRange | null
): ReadonlySet<string> => new Set(range?.cells.map(getCellKey));

const formatCellLabel = (
  cell: CalendarCell,
  locale: string,
  timeZone: NonNullable<CalendarContextProps["timeZone"]>
): string => {
  const start = new Date(cell.start);
  const dateLabel = dateTimeFormatter(locale, {
    dateStyle: "full",
    timeZone,
  }).format(start);
  const timeLabel = dateTimeFormatter(locale, {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(start);

  return `${dateLabel} ${timeLabel}`;
};

const AvailabilityGridContent = ({
  cells,
  className,
  date,
  defaultSelectedRange,
  interactionMode = DEFAULT_MODE,
  onPaintSelect,
  onSelectedRangeChange,
  renderCell,
  selectedRange,
}: AvailabilityGridContentProps) => {
  const { direction, locale, t } = useCalendarLocalization();
  const { timeZone } = useCalendarContext();

  const controller = useAvailabilityGridController({
    cells,
    date,
    defaultSelectedRange,
    direction,
    interactionMode,
    onPaintSelect,
    onSelectedRangeChange,
    selectedRange,
    timeZone,
  });

  const rowKeys = useMemo(
    () =>
      sortCopy([
        ...new Set(
          controller.columns.flatMap((column) =>
            column.cells.map((cell) => cell.startTime)
          )
        ),
      ]),
    [controller.columns]
  );

  const gridColumns = useMemo<readonly CalendarGridColumn[]>(
    () =>
      controller.columns.map((column) => ({
        key: column.key,
        label: formatColumnLabel(column.cells[0], locale, timeZone),
      })),
    [controller.columns, locale, timeZone]
  );

  const gridRows = useMemo<readonly CalendarGridRow[]>(() => {
    const cellsByColumn = controller.columns.map((column) => {
      const columnCells = new Map<string, CalendarCell>();

      for (const cell of column.cells) {
        if (!columnCells.has(cell.startTime)) {
          columnCells.set(cell.startTime, cell);
        }
      }

      return columnCells;
    });

    return rowKeys.map((startTime, rowIndex) => ({
      cells: cellsByColumn.flatMap((columnCells) => {
        const cell = columnCells.get(startTime);

        return cell === undefined ? [] : [cell];
      }),
      key: `availability-row-${rowIndex}`,
    }));
  }, [controller.columns, rowKeys]);

  const cellsByKey = useMemo(
    () =>
      new Map(
        controller.columns.flatMap((column) =>
          column.cells.map((cell) => [getCellKey(cell), cell] as const)
        )
      ),
    [controller.columns]
  );

  const selectedKeys = useMemo(
    () => buildRangeKeys(controller.selectedRange),
    [controller.selectedRange]
  );

  const paintKeys = useMemo(
    () => buildRangeKeys(controller.paint),
    [controller.paint]
  );

  const cellAtTarget = (
    target: EventTarget | null
  ): CalendarAvailabilityCell | undefined => {
    const element = target instanceof Element ? target : null;

    const gridCell = element?.closest<HTMLElement>("[data-cell-key]");
    const key = gridCell?.dataset.cellKey;

    return key === undefined ? undefined : cellsByKey.get(key);
  };

  const handlePointerDown = (
    event: ReactPointerEvent<HTMLDivElement>
  ): void => {
    const cell = cellAtTarget(event.target);

    if (cell === undefined || controller.interactionMode === "read-only") {
      return;
    }

    event.preventDefault();
    controller.beginPaint(cell);
  };

  const handlePointerMove = (
    event: ReactPointerEvent<HTMLDivElement>
  ): void => {
    const cell = cellAtTarget(event.target);

    if (cell !== undefined) {
      controller.updatePaint(cell);
    }
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (
      cellAtTarget(event.target) !== undefined &&
      event.target instanceof Element
    ) {
      event.target.closest<HTMLElement>("[data-cell-key]")?.focus();
    }

    controller.endPaint();
  };

  const handlePointerCancel = (): void => {
    controller.cancelPaint();
  };

  const handleCellKeyDown = (
    event: Parameters<CalendarGridCellKeyDownHandler>[0],
    context: CalendarCellContext
  ): void => {
    const selectionKey =
      event.key === "Enter" ||
      event.key === " " ||
      event.key === "Escape" ||
      (event.shiftKey && event.key.startsWith("Arrow"));

    if (!selectionKey) {
      return;
    }

    const rowIndex = rowKeys.indexOf(context.cell.startTime);

    const columnIndex = controller.columns.findIndex((column) =>
      column.cells.some((cell) => cell === context.cell)
    );

    if (rowIndex !== -1 && columnIndex !== -1) {
      controller.handleGridKeyDown(event, rowIndex, columnIndex);
    }
  };

  const gridTranslate: CalendarTranslate = (key, values) =>
    key === "calendar.grid.label"
      ? t("calendar.availability.label", values)
      : t(key, values);

  const renderAvailabilityCell = (context: CalendarCellContext): ReactNode => {
    const availabilityCell = cellsByKey.get(context.key);
    const available = availabilityCell?.available ?? true;
    const isSelected =
      selectedKeys.has(context.key) || paintKeys.has(context.key);

    const cellContext: CalendarCellContext & {
      readonly available: boolean;
    } = {
      ...context,
      available,
      isReadOnly: controller.interactionMode === "read-only",
      isSelected,
      isUnavailable: !available,
    };

    return (
      <div
        className={clsx(
          styles.cellContent,
          !available && styles.unavailable,
          isSelected && styles.selected,
          controller.interactionMode === "read-only" && styles.readOnly
        )}
        aria-disabled={available ? undefined : "true"}
      >
        {renderCell?.(cellContext)}
      </div>
    );
  };

  return (
    <div
      className={clsx(styles.root, className)}
      onPointerCancel={handlePointerCancel}
      onPointerDown={handlePointerDown}
      onPointerEnter={handlePointerMove}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <CalendarScope t={gridTranslate}>
        <CalendarGrid
          columns={gridColumns}
          rows={gridRows}
          getCellKey={getCellKey}
          getCellLabel={(cell) => formatCellLabel(cell, locale, timeZone)}
          onCellKeyDown={handleCellKeyDown}
          renderCell={renderAvailabilityCell}
          className={styles.grid}
        />
      </CalendarScope>
    </div>
  );
};

export const AvailabilityGrid = (props: AvailabilityGridProps) => (
  <CalendarScope {...props}>
    <AvailabilityGridContent {...omitCalendarContextProps(props)} />
  </CalendarScope>
);

type AvailabilityGridContentProps = Omit<
  AvailabilityGridProps,
  keyof CalendarContextProps
>;

AvailabilityGrid.displayName = "AvailabilityGrid";
