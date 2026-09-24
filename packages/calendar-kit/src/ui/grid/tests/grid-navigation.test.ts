import { describe, expect, it } from "vitest";

import { calendarDate, parseLocalTime, utcInstant } from "../../../core/model";
import type { CalendarCell, CalendarGridRow } from "../../../core/model";
import {
  buildCellRecords,
  indexCellRecords,
  navigateGrid,
} from "../grid-navigation";
import type { GridNavigationInput } from "../grid-navigation";

const cellAt = (day: number, hour: number): CalendarCell => {
  const time = `${String(hour).padStart(2, "0")}:00`;
  const date = `2026-08-${String(day).padStart(2, "0")}`;

  return {
    date: calendarDate(date),
    end: utcInstant(`${date}T${String(hour + 1).padStart(2, "0")}:00:00.000Z`),
    endTime: parseLocalTime(`${String(hour + 1).padStart(2, "0")}:00`),
    start: utcInstant(`${date}T${time}:00.000Z`),
    startTime: parseLocalTime(time),
  };
};

const rows: readonly CalendarGridRow[] = [
  { cells: [cellAt(24, 9), cellAt(25, 9), cellAt(26, 9)], key: "09" },
  { cells: [cellAt(24, 10), cellAt(25, 10), cellAt(26, 10)], key: "10" },
  { cells: [cellAt(24, 11)], key: "11" },
];

const getCellKey = (cell: CalendarCell): string =>
  `${cell.date}:${cell.startTime}`;

const records = buildCellRecords(rows, getCellKey);
const recordsByKey = indexCellRecords(records);

const recordAt = (rowIndex: number, columnIndex: number) => {
  const record = records.find(
    (candidate) =>
      candidate.rowIndex === rowIndex && candidate.columnIndex === columnIndex
  );

  if (record === undefined) {
    throw new Error(`No cell at ${rowIndex}:${columnIndex}`);
  }

  return record;
};

const navigate = (
  key: string,
  from: readonly [number, number],
  overrides: Partial<GridNavigationInput> = {}
) =>
  navigateGrid({
    direction: "ltr",
    getCellKey,
    key,
    record: recordAt(...from),
    recordsByKey,
    rows,
    ...overrides,
  });

describe(navigateGrid, () => {
  it("leaves keys that are not navigation keys alone", () => {
    expect(navigate("Enter", [0, 0])).toStrictEqual({ handled: false });
  });

  it("moves by row and column, mirrored in RTL", () => {
    expect(navigate("ArrowDown", [0, 1])).toStrictEqual({
      destination: recordAt(1, 1),
      handled: true,
    });
    expect(navigate("ArrowRight", [0, 1])).toStrictEqual({
      destination: recordAt(0, 2),
      handled: true,
    });
    expect(navigate("ArrowRight", [0, 1], { direction: "rtl" })).toStrictEqual({
      destination: recordAt(0, 0),
      handled: true,
    });
    expect(navigate("End", [1, 0])).toStrictEqual({
      destination: recordAt(1, 2),
      handled: true,
    });
  });

  it("consumes the key without moving at the grid edge", () => {
    expect(navigate("ArrowUp", [0, 0])).toStrictEqual({ handled: true });
    expect(navigate("ArrowDown", [2, 0])).toStrictEqual({ handled: true });
  });

  it("clamps the column into a shorter row and clamps at the row ends", () => {
    expect(navigate("ArrowDown", [1, 2])).toStrictEqual({
      destination: recordAt(2, 0),
      handled: true,
    });
    expect(navigate("ArrowLeft", [0, 0])).toStrictEqual({
      destination: recordAt(0, 0),
      handled: true,
    });
  });

  it("consumes the key but stays put when the destination is not navigable", () => {
    expect(
      navigate("ArrowRight", [0, 0], { isCellNavigable: () => false })
    ).toStrictEqual({ handled: true });
  });
});
