"use client";
// @cpt-flow:cpt-frontx-calendar-kit-flow-week-grid-host-embedding:p1
// @cpt-dod:cpt-frontx-calendar-kit-dod-week-grid-keyboard:p1

import { clsx } from "clsx";
import { useCallback, useRef } from "react";
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  ReactNode,
} from "react";

import type {
  CalendarCell,
  CalendarCellContext,
  CalendarGridColumn,
  CalendarGridRow,
} from "../../core/model";
import {
  omitCalendarContextProps,
  useCalendarLocalization,
} from "../../i18n/calendar-localization";
import type { CalendarContextProps } from "../../i18n/calendar-localization";
import { CalendarScope } from "../../i18n/calendar-localization-provider";
import type { CalendarGridCellKeyDownHandler } from "../../react/slots";
import { baseCellContext, navigateGrid } from "./grid-navigation";
import type { GridCellRecord } from "./grid-navigation";
import { useGridCells } from "./use-grid-cells";

import styles from "./calendar-grid.module.css";

export type { CalendarGridCellKeyDownHandler } from "../../react/slots";

export interface CalendarGridProps extends CalendarContextProps {
  /** Class added to the component root. */
  readonly className?: string;
  /** Column headers, in visual order. */
  readonly columns: readonly CalendarGridColumn[];
  /** Rows of cells. Every row should have one cell per column. */
  readonly rows: readonly CalendarGridRow[];
  /** Stable key for a cell; must be unique across the grid. */
  readonly getCellKey: (cell: CalendarCell) => string;
  /** Accessible name of a cell. */
  readonly getCellLabel: (
    cell: CalendarCell,
    context: CalendarCellContext
  ) => string;
  /** Controlled key of the cell holding the tab stop. */
  readonly activeCellKey?: string;
  /** Initial active cell when uncontrolled. */
  readonly defaultActiveCellKey?: string;
  /** Called with the domain cell when focus moves. */
  readonly onActiveCellChange?: (cell: CalendarCell) => void;
  /** Return `false` to let arrow keys skip a cell. */
  readonly isCellNavigable?: (cell: CalendarCell) => boolean;
  /** Runs before built-in navigation; call `preventDefault()` to consume the key. */
  readonly onCellKeyDown?: CalendarGridCellKeyDownHandler;
  /** Cell content. */
  readonly renderCell: (context: CalendarCellContext) => ReactNode;
  /** Replaces a column header's content. */
  readonly renderHeader?: (column: CalendarGridColumn) => ReactNode;
}

interface CalendarGridStyle extends CSSProperties {
  readonly "--calendar-grid-template-columns"?: string;
}

interface CalendarGridCellProps {
  readonly activeCellKey: string | undefined;
  readonly cell: CalendarCell;
  readonly currentActiveCellKey: string | null;
  readonly getCellLabel: CalendarGridProps["getCellLabel"];
  readonly labelsByCell: ReadonlyMap<CalendarCell, string>;
  readonly onCellKeyDown: (
    event: ReactKeyboardEvent<HTMLDivElement>,
    record: GridCellRecord,
    context: CalendarCellContext
  ) => void;
  readonly onFocusCell: (key: string) => void;
  readonly record: GridCellRecord;
  readonly renderCell: CalendarGridProps["renderCell"];
  readonly rowIndex: number;
  readonly setCellElement: (
    key: string,
    element: HTMLDivElement | null
  ) => void;
}

const CalendarGridCell = ({
  activeCellKey,
  cell,
  currentActiveCellKey,
  getCellLabel,
  labelsByCell,
  onCellKeyDown,
  onFocusCell,
  record,
  renderCell,
  rowIndex,
  setCellElement,
}: CalendarGridCellProps) => {
  const { key } = record;
  const isFocused = currentActiveCellKey === key;

  const provisionalContext = baseCellContext(cell, key, isFocused);

  const label =
    labelsByCell.get(cell) ?? getCellLabel(cell, provisionalContext);

  const context: CalendarCellContext = {
    ...provisionalContext,
    label,
  };

  const handleFocus = (): void => {
    if (activeCellKey === undefined) {
      onFocusCell(key);
    }
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    onCellKeyDown(event, record, context);
  };

  return (
    <div
      className={styles.cell}
      key={key}
      ref={(element) => {
        setCellElement(key, element);
      }}
      role="gridcell"
      data-cell-key={key}
      aria-colindex={record.columnIndex + 1}
      aria-rowindex={rowIndex + 2}
      aria-label={label}
      tabIndex={isFocused ? 0 : -1}
      onFocus={handleFocus}
      onKeyDown={handleKeyDown}
    >
      {renderCell(context)}
    </div>
  );
};

type CalendarGridContentProps = Omit<
  CalendarGridProps,
  keyof CalendarContextProps
>;

const CalendarGridContent = ({
  activeCellKey,
  className,
  columns,
  defaultActiveCellKey,
  getCellKey,
  getCellLabel,
  isCellNavigable,
  onActiveCellChange,
  onCellKeyDown,
  renderCell,
  renderHeader,
  rows,
}: CalendarGridContentProps) => {
  const { direction, t } = useCalendarLocalization();

  // @cpt-begin:cpt-frontx-calendar-kit-flow-week-grid-host-embedding:p1:inst-wg-render

  const {
    currentActiveCellKey,
    labelsByCell,
    recordsByKey,
    setUncontrolledActiveCellKey,
  } = useGridCells({
    activeCellKey,
    defaultActiveCellKey,
    getCellKey,
    getCellLabel,
    rows,
  });

  const cellElementsRef = useRef(new Map<string, HTMLDivElement>());

  const setCellElement = useCallback(
    (key: string, element: HTMLDivElement | null): void => {
      if (element === null) {
        cellElementsRef.current.delete(key);
      } else {
        cellElementsRef.current.set(key, element);
      }
    },
    []
  );

  const handleCellFocus = useCallback(
    (key: string): void => {
      setUncontrolledActiveCellKey(key);
    },
    [setUncontrolledActiveCellKey]
  );

  const handleCellKeyDown = useCallback(
    (
      event: ReactKeyboardEvent<HTMLDivElement>,
      record: GridCellRecord,
      context: CalendarCellContext
    ): void => {
      // @cpt-begin:cpt-frontx-calendar-kit-flow-week-grid-host-embedding:p1:inst-wg-select
      onCellKeyDown?.(event, context);

      if (event.defaultPrevented) {
        return;
      }

      const navigation = navigateGrid({
        direction,
        getCellKey,
        isCellNavigable,
        key: event.key,
        record,
        recordsByKey,
        rows,
      });

      if (!navigation.handled) {
        return;
      }

      event.preventDefault();

      const destinationRecord = navigation.destination;

      if (destinationRecord === undefined) {
        return;
      }

      if (activeCellKey === undefined) {
        setUncontrolledActiveCellKey(destinationRecord.key);
      }

      onActiveCellChange?.(destinationRecord.cell);
      cellElementsRef.current.get(destinationRecord.key)?.focus();
      // @cpt-end:cpt-frontx-calendar-kit-flow-week-grid-host-embedding:p1:inst-wg-select
    },
    [
      activeCellKey,
      direction,
      getCellKey,
      isCellNavigable,
      onActiveCellChange,
      onCellKeyDown,
      recordsByKey,
      rows,
      setUncontrolledActiveCellKey,
    ]
  );

  return (
    <div className={styles.container}>
      <div
        className={clsx(styles.root, className)}
        role="grid"
        aria-label={t("calendar.grid.label")}
        aria-colcount={columns.length}
        aria-rowcount={rows.length + 1}
        dir={direction}
        style={
          {
            "--calendar-grid-template-columns": `repeat(${Math.max(columns.length, 1)}, minmax(0, 1fr))`,
          } as CalendarGridStyle
        }
      >
        {columns.length > 0 ? (
          <div className={styles.row} role="row" aria-rowindex={1}>
            {columns.map((column, columnIndex) => (
              <div
                className={styles.headerCell}
                key={column.key}
                role="columnheader"
                aria-colindex={columnIndex + 1}
              >
                {renderHeader ? renderHeader(column) : column.label}
              </div>
            ))}
          </div>
        ) : null}

        {rows.map((row, rowIndex) => (
          <div
            className={styles.row}
            key={row.key}
            role="row"
            aria-rowindex={rowIndex + 2}
          >
            {row.cells.map((cell) => {
              const record = recordsByKey.get(getCellKey(cell));

              if (!record) {
                return null;
              }

              return (
                <CalendarGridCell
                  activeCellKey={activeCellKey}
                  cell={cell}
                  currentActiveCellKey={currentActiveCellKey}
                  getCellLabel={getCellLabel}
                  key={record.key}
                  labelsByCell={labelsByCell}
                  onCellKeyDown={handleCellKeyDown}
                  onFocusCell={handleCellFocus}
                  record={record}
                  renderCell={renderCell}
                  rowIndex={rowIndex}
                  setCellElement={setCellElement}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
  // @cpt-end:cpt-frontx-calendar-kit-flow-week-grid-host-embedding:p1:inst-wg-render
};

export const CalendarGrid = (props: CalendarGridProps) => (
  <CalendarScope {...props}>
    <CalendarGridContent {...omitCalendarContextProps(props)} />
  </CalendarScope>
);

CalendarGrid.displayName = "CalendarGrid";
