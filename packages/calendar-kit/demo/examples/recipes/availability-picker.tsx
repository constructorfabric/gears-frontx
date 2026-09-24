import { AvailabilityGrid } from "@gears-frontx/calendar-kit";
import type {
  CalendarAvailabilityCell,
  CalendarDate,
  CalendarSelectionRange,
} from "@gears-frontx/calendar-kit";
import { useState } from "react";

export const AvailabilityPicker = ({
  date,
  cells,
}: {
  readonly date: CalendarDate;
  readonly cells: readonly CalendarAvailabilityCell[];
}) => {
  const [range, setRange] = useState<CalendarSelectionRange | null>(null);

  return (
    <>
      <AvailabilityGrid
        date={date}
        cells={cells}
        selectedRange={range ?? undefined}
        onSelectedRangeChange={setRange}
      />
      {range !== null && (
        <p>
          {range.start.date} {range.start.startTime}–{range.end.endTime} (
          {range.cells.length} slots)
        </p>
      )}
    </>
  );
};
