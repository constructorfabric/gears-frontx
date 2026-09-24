import { EventDetailPanel } from "@gears-frontx/calendar-kit";
import type { CalendarEvent } from "@gears-frontx/calendar-kit";

export const ShadowDetail = ({
  overlayContainer,
  event,
  onClose,
}: {
  readonly overlayContainer: HTMLElement;
  readonly event: CalendarEvent | null;
  readonly onClose: () => void;
}) => (
  <EventDetailPanel
    open={event !== null}
    event={event}
    container={overlayContainer}
    onClose={onClose}
  />
);
