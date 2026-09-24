import { WeekGrid } from "@gears-frontx/calendar-kit";
import type {
  CalendarDate,
  CalendarEvent,
  CalendarMoveRequest,
  CalendarSelectionRange,
} from "@gears-frontx/calendar-kit";

interface ConfirmMovesProps {
  readonly date: CalendarDate;
  readonly events: readonly CalendarEvent[];
  readonly saveMove: (eventId: string, startIso: string) => Promise<boolean>;
  readonly proposeSlot: (range: CalendarSelectionRange) => void;
}

export const ConfirmMoves = ({
  date,
  events,
  saveMove,
  proposeSlot,
}: ConfirmMovesProps) => {
  const settleMove = async (request: CalendarMoveRequest): Promise<void> => {
    const saved = await saveMove(request.event.id, request.to.start);

    if (saved) {
      request.confirm();

      return;
    }

    request.cancel();
  };

  const handleMove = (request: CalendarMoveRequest): void => {
    void settleMove(request);
  };

  return (
    <WeekGrid
      date={date}
      events={events}
      interactionMode="paint-and-move"
      onMoveRequest={handleMove}
      onPaintSelect={proposeSlot}
    />
  );
};
