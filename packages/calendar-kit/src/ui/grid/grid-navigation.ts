import { arrayAt } from "../../core/array";
import { isGridNavigationKey, stepGridPosition } from "../../core/grid-keys";
import type {
  CalendarCell,
  CalendarCellContext,
  CalendarDirection,
  CalendarGridRow,
} from "../../core/model";

export interface GridCellRecord {
  readonly cell: CalendarCell;
  readonly key: string;
  readonly rowIndex: number;
  readonly columnIndex: number;
}

type GetCellKey = (cell: CalendarCell) => string;

type GetCellLabel = (
  cell: CalendarCell,
  context: CalendarCellContext
) => string;

export const baseCellContext = (
  cell: CalendarCell,
  key: string,
  isFocused: boolean
): CalendarCellContext => ({
  cell,
  isFocused,
  isReadOnly: false,
  isSelected: false,
  isUnavailable: false,
  key,
  label: "",
});

export const buildCellRecords = (
  rows: readonly CalendarGridRow[],
  getCellKey: GetCellKey
): readonly GridCellRecord[] =>
  rows.flatMap((row, rowIndex) =>
    row.cells.map((cell, columnIndex): GridCellRecord => ({
      cell,
      columnIndex,
      key: getCellKey(cell),
      rowIndex,
    }))
  );

// First record wins on duplicate keys.
export const indexCellRecords = (
  records: readonly GridCellRecord[]
): ReadonlyMap<string, GridCellRecord> => {
  const byKey = new Map<string, GridCellRecord>();

  for (const record of records) {
    if (!byKey.has(record.key)) {
      byKey.set(record.key, record);
    }
  }

  return byKey;
};

export const buildCellLabels = (
  records: readonly GridCellRecord[],
  getCellLabel: GetCellLabel,
  activeCellKey: string | null
): ReadonlyMap<CalendarCell, string> =>
  new Map(
    records.map((record) => [
      record.cell,
      getCellLabel(
        record.cell,
        baseCellContext(record.cell, record.key, activeCellKey === record.key)
      ),
    ])
  );

export const resolveActiveCellKey = (
  records: readonly GridCellRecord[],
  activeCellKey: string | undefined,
  uncontrolledActiveCellKey: string | null
): string | null => {
  const exists = (key: string): boolean =>
    records.some((record) => record.key === key);

  const firstKey = records[0]?.key ?? null;

  if (activeCellKey !== undefined) {
    return exists(activeCellKey) ? activeCellKey : firstKey;
  }

  return uncontrolledActiveCellKey !== null && exists(uncontrolledActiveCellKey)
    ? uncontrolledActiveCellKey
    : firstKey;
};

export interface GridNavigationInput {
  readonly key: string;
  readonly direction: CalendarDirection;
  readonly rows: readonly CalendarGridRow[];
  readonly record: GridCellRecord;
  readonly recordsByKey: ReadonlyMap<string, GridCellRecord>;
  readonly getCellKey: GetCellKey;
  readonly isCellNavigable?: (cell: CalendarCell) => boolean;
}

// `handled` without `destination`: the key is consumed, focus stays.
export type GridNavigation =
  | { readonly handled: false }
  | { readonly handled: true; readonly destination?: GridCellRecord };

export const navigateGrid = ({
  direction,
  getCellKey,
  isCellNavigable,
  key,
  record,
  recordsByKey,
  rows,
}: GridNavigationInput): GridNavigation => {
  const currentRow = arrayAt(rows, record.rowIndex);

  if (!isGridNavigationKey(key) || currentRow === undefined) {
    return { handled: false };
  }

  const target = stepGridPosition(
    key,
    direction,
    record,
    currentRow.cells.length
  );

  const destinationRow =
    target.rowIndex < 0 ? undefined : arrayAt(rows, target.rowIndex);

  const destinationCell =
    destinationRow === undefined
      ? undefined
      : arrayAt(
          destinationRow.cells,
          Math.max(
            0,
            Math.min(destinationRow.cells.length - 1, target.columnIndex)
          )
        );

  if (destinationCell === undefined) {
    return { handled: true };
  }

  const destination = recordsByKey.get(getCellKey(destinationCell));

  if (
    destination === undefined ||
    (isCellNavigable !== undefined && !isCellNavigable(destinationCell))
  ) {
    return { handled: true };
  }

  return { destination, handled: true };
};
