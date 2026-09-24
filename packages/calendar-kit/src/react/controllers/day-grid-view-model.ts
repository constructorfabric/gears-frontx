import { isEventActionable } from "../../core/actionability";
import type { TimedEventGeometry } from "../../core/layout";
import type {
  CalendarDate,
  CalendarEvent,
  CalendarEventRenderContext,
  IanaTimeZone,
  UtcInstant,
  ViewerDaySegment,
} from "../../core/model";
import { compareUtcInstants } from "../../core/temporal";

export interface DaySegment {
  readonly event: CalendarEvent;
  readonly start: UtcInstant;
  readonly end: UtcInstant;
  readonly date: CalendarDate;
  readonly segment: ViewerDaySegment["segment"];
}

export interface TimedSegment extends DaySegment {
  readonly event: Extract<CalendarEvent, { readonly allDay: false }>;
}

export interface AllDaySegment extends DaySegment {
  readonly event: Extract<CalendarEvent, { readonly allDay: true }>;
}

export interface TimedEventPlacement {
  readonly segment: TimedSegment;
  readonly geometry: TimedEventGeometry;
  readonly topPercent: number;
  readonly heightPercent: number;
}

export interface DayGridViewModelInput {
  readonly daySegments: readonly DaySegment[];
  readonly timedSegments: readonly TimedSegment[];
  readonly axisStartEpoch: number;
  readonly axisDuration: number;
  readonly currentInstant: UtcInstant;
  readonly date: CalendarDate;
  readonly timeZone: IanaTimeZone;
  readonly readOnly: boolean;
  readonly selectedEventId: string | null;
  readonly timedGeometryByEventId: ReadonlyMap<string, TimedEventGeometry>;
}

export interface DayGridViewModelOutput {
  readonly timedEvents: readonly TimedEventPlacement[];
  readonly buildEventContext: (
    event: CalendarEvent,
    geometry?: TimedEventGeometry
  ) => CalendarEventRenderContext | undefined;
}

export const buildDayGridViewModel = (
  input: DayGridViewModelInput
): DayGridViewModelOutput => {
  const segmentsById = new Map<string, DaySegment>();

  for (const segment of input.daySegments) {
    if (!segmentsById.has(segment.event.id)) {
      segmentsById.set(segment.event.id, segment);
    }
  }

  const timedSegmentsById = new Map<string, TimedSegment>();

  for (const segment of input.timedSegments) {
    if (!timedSegmentsById.has(segment.event.id)) {
      timedSegmentsById.set(segment.event.id, segment);
    }
  }

  const timedEvents: TimedEventPlacement[] = [];

  for (const geometry of input.timedGeometryByEventId.values()) {
    const segment = timedSegmentsById.get(geometry.id);

    if (segment === undefined) {
      continue;
    }

    const startEpoch = Date.parse(segment.start);
    const endEpoch = Date.parse(segment.end);
    timedEvents.push({
      geometry,
      heightPercent: Math.max(
        0.5,
        ((endEpoch - startEpoch) / input.axisDuration) * 100
      ),
      segment,
      topPercent: Math.max(
        0,
        ((startEpoch - input.axisStartEpoch) / input.axisDuration) * 100
      ),
    });
  }

  const buildEventContext = (
    event: CalendarEvent,
    geometry?: TimedEventGeometry
  ): CalendarEventRenderContext | undefined => {
    const segment = segmentsById.get(event.id);

    if (segment === undefined) {
      return undefined;
    }

    const isPast = event.allDay
      ? input.date >= event.endDate
      : compareUtcInstants(segment.end, input.currentInstant) <= 0;

    const timedGeometry =
      geometry ?? input.timedGeometryByEventId.get(event.id);

    const resolvedGeometry =
      timedGeometry === undefined
        ? undefined
        : {
            height: 0,
            inlineSize: timedGeometry.width,
            insetInlineStart: timedGeometry.left,
            top: 0,
            zIndex: timedGeometry.zIndex,
          };

    return {
      conflicts: event.conflicts ?? [],
      event,
      geometry: resolvedGeometry,
      isAvailable: isEventActionable(event),
      isPast,
      isReadOnly: input.readOnly,
      isSelected: input.selectedEventId === event.id,
      segment: { ...segment, date: input.date },
    };
  };

  return { buildEventContext, timedEvents };
};
