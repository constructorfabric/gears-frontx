import type { CalendarEvent } from "./model";

export type EventActionabilityInput = Pick<
  CalendarEvent,
  "available" | "access"
>;

export const isEventActionable = (
  event: EventActionabilityInput,
  availableOverride?: boolean
): boolean =>
  (availableOverride ?? event.available ?? true) && event.access !== "busy";
