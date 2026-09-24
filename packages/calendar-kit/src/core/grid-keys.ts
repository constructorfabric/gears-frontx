import type { CalendarDirection } from "./model";

export interface GridPosition {
  readonly rowIndex: number;
  readonly columnIndex: number;
}

const GRID_NAVIGATION_KEYS: ReadonlySet<string> = new Set([
  "ArrowDown",
  "ArrowUp",
  "ArrowLeft",
  "ArrowRight",
  "Home",
  "End",
]);

export const isGridNavigationKey = (key: string): boolean =>
  GRID_NAVIGATION_KEYS.has(key);

export const stepGridPosition = (
  key: string,
  direction: CalendarDirection,
  position: GridPosition,
  rowLength: number
): GridPosition => {
  const { columnIndex, rowIndex } = position;

  const inlineStep = direction === "rtl" ? -1 : 1;

  switch (key) {
    case "ArrowDown": {
      return { columnIndex, rowIndex: rowIndex + 1 };
    }
    case "ArrowUp": {
      return { columnIndex, rowIndex: rowIndex - 1 };
    }
    case "Home": {
      return { columnIndex: 0, rowIndex };
    }
    case "End": {
      return { columnIndex: rowLength - 1, rowIndex };
    }
    case "ArrowLeft": {
      return { columnIndex: columnIndex - inlineStep, rowIndex };
    }
    case "ArrowRight": {
      return { columnIndex: columnIndex + inlineStep, rowIndex };
    }
    default: {
      return position;
    }
  }
};
