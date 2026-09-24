import type { CalendarCell } from "./model";
import { compareUtcInstants } from "./temporal";
import { calendarDate, parseLocalTime, utcInstant } from "./validation";

export const normalizeCalendarCell = (
  cell: CalendarCell
): CalendarCell | null => {
  try {
    const date = calendarDate(cell.date);
    const startTime = parseLocalTime(cell.startTime);
    const endTime = parseLocalTime(cell.endTime);
    const start = utcInstant(cell.start);
    const end = utcInstant(cell.end);

    if (compareUtcInstants(start, end) >= 0) {
      return null;
    }

    return { date, end, endTime, start, startTime };
  } catch {
    return null;
  }
};

export const compareCalendarCells = (
  left: CalendarCell,
  right: CalendarCell
): -1 | 0 | 1 => {
  const byStart = compareUtcInstants(left.start, right.start);

  if (byStart !== 0) {
    return byStart;
  }

  return compareUtcInstants(left.end, right.end);
};
