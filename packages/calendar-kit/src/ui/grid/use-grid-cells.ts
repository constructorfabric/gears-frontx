import { useMemo, useState } from "react";

import type {
  CalendarCell,
  CalendarCellContext,
  CalendarGridRow,
} from "../../core/model";
import {
  buildCellLabels,
  buildCellRecords,
  indexCellRecords,
  resolveActiveCellKey,
} from "./grid-navigation";

interface UseGridCellsOptions {
  readonly rows: readonly CalendarGridRow[];
  readonly getCellKey: (cell: CalendarCell) => string;
  readonly getCellLabel: (
    cell: CalendarCell,
    context: CalendarCellContext
  ) => string;
  readonly activeCellKey: string | undefined;
  readonly defaultActiveCellKey: string | undefined;
}

export const useGridCells = ({
  activeCellKey,
  defaultActiveCellKey,
  getCellKey,
  getCellLabel,
  rows,
}: UseGridCellsOptions) => {
  const records = useMemo(
    () => buildCellRecords(rows, getCellKey),
    [getCellKey, rows]
  );

  const recordsByKey = useMemo(() => indexCellRecords(records), [records]);

  const [uncontrolledActiveCellKey, setUncontrolledActiveCellKey] = useState<
    string | null
  >(() => defaultActiveCellKey ?? records[0]?.key ?? null);

  const currentActiveCellKey = resolveActiveCellKey(
    records,
    activeCellKey,
    uncontrolledActiveCellKey
  );

  const labelsByCell = useMemo(
    () => buildCellLabels(records, getCellLabel, currentActiveCellKey),
    [currentActiveCellKey, getCellLabel, records]
  );

  return {
    currentActiveCellKey,
    labelsByCell,
    recordsByKey,
    setUncontrolledActiveCellKey,
  };
};
