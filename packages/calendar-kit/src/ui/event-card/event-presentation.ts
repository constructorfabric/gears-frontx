import { isEventActionable } from "../../core/actionability";
import { formatCalendarList } from "../../core/format";
import type {
  CalendarConflict,
  CalendarEvent,
  CalendarEventGeometry,
  CalendarEventRenderContext,
  CalendarEventSegment,
  CalendarLocale,
  CalendarTranslate,
  IanaTimeZone,
  UtcInstant,
} from "../../core/model";
import { compareUtcInstants, toViewerDateTime } from "../../core/temporal";

export interface EventPresentationInput<Payload> {
  readonly event: CalendarEvent<Payload>;
  readonly segment: CalendarEventSegment;
  readonly geometry?: CalendarEventGeometry;
  readonly selected: boolean;
  readonly readOnly: boolean;
  readonly availableOverride?: boolean;
  readonly conflicts?: readonly CalendarConflict[];
  readonly translate: CalendarTranslate;
  readonly locale?: CalendarLocale;
  readonly timeZone: IanaTimeZone;
  readonly currentInstant?: UtcInstant;
  readonly pastOverride?: boolean;
}

export interface EventPresentationOutput<Payload> {
  readonly context: CalendarEventRenderContext<Payload>;
  readonly isAvailable: boolean;
  readonly isPast: boolean;
  readonly conflicts: readonly CalendarConflict[];
  readonly description: string | undefined;
}

const EMPTY_CONFLICTS: readonly CalendarConflict[] = [];

const resolvePastState = <Payload>(
  input: EventPresentationInput<Payload>
): boolean => {
  if (input.pastOverride !== undefined) {
    return input.pastOverride;
  }

  const { currentInstant } = input;

  if (currentInstant === undefined) {
    return false;
  }

  return input.event.allDay
    ? toViewerDateTime(currentInstant, input.timeZone).date >=
        input.event.endDate
    : compareUtcInstants(input.event.end, currentInstant) <= 0;
};

export const buildEventPresentation = <Payload>(
  input: EventPresentationInput<Payload>
): EventPresentationOutput<Payload> => {
  const isAvailable = isEventActionable(input.event, input.availableOverride);
  const isPast = resolvePastState(input);
  const conflicts = input.conflicts ?? input.event.conflicts ?? EMPTY_CONFLICTS;

  const descriptionParts = [
    ...(isPast ? [input.translate("calendar.eventCard.past")] : []),
    ...(input.readOnly ? [input.translate("calendar.eventCard.readOnly")] : []),
  ];

  const description =
    descriptionParts.length > 0
      ? formatCalendarList(input.locale, descriptionParts)
      : undefined;

  const context: CalendarEventRenderContext<Payload> = {
    conflicts,
    event: input.event,
    geometry: input.geometry,
    isAvailable,
    isPast,
    isReadOnly: input.readOnly,
    isSelected: input.selected,
    segment: input.segment,
  };

  return {
    conflicts,
    context,
    description,
    isAvailable,
    isPast,
  };
};
