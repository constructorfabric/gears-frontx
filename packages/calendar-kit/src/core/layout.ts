// @cpt-flow:cpt-frontx-calendar-kit-flow-week-grid-host-embedding:p1
import { arrayAt, sortCopy } from "./array";
import type { UtcInstant } from "./model";
import { utcInstant } from "./validation";

declare const console: {
  readonly warn: (message: string) => void;
};

const SAFE_EDGE_PERCENT = 98;
const MIN_EVENT_WIDTH_PERCENT = 4;
export const GRID_CONTENT_Z_INDEX = 0;
export const BASE_Z_INDEX = 10;
export const NOW_LINE_Z_INDEX = 20;
export const ALL_DAY_BAND_Z_INDEX = 30;
export const DAY_NUMBER_BAND_Z_INDEX = 31;
export const OVERLAY_Z_INDEX = 40;
export const ALERT_DIALOG_Z_INDEX = 50;

export interface TimedLayoutInput {
  readonly id: string;
  readonly start: UtcInstant;
  readonly end: UtcInstant;
  readonly allDay?: boolean;
}

export interface TimedEventGeometry {
  readonly id: string;
  readonly left: number;
  readonly width: number;
  readonly zIndex: number;
  readonly groupIndex: number;
}

interface NormalizedEvent extends TimedLayoutInput {
  readonly startEpoch: number;
  readonly endEpoch: number;
  readonly inputIndex: number;
  columnIndex: number;
}

const compareEvents = (
  left: NormalizedEvent,
  right: NormalizedEvent
): number => {
  if (left.startEpoch !== right.startEpoch) {
    return left.startEpoch - right.startEpoch;
  }

  const leftDuration = left.endEpoch - left.startEpoch;
  const rightDuration = right.endEpoch - right.startEpoch;

  if (leftDuration !== rightDuration) {
    return rightDuration - leftDuration;
  }

  return left.inputIndex - right.inputIndex;
};

const layoutGroup = (
  groupEvents: NormalizedEvent[],
  groupIndex: number
): TimedEventGeometry[] => {
  const columns: NormalizedEvent[][] = [];

  for (const event of groupEvents) {
    const columnIndex = columns.findIndex((column) => {
      const previous = arrayAt(column, -1);

      return previous !== undefined && previous.endEpoch <= event.startEpoch;
    });

    if (columnIndex === -1) {
      event.columnIndex = columns.length;
      columns.push([event]);
    } else {
      const column = arrayAt(columns, columnIndex);

      if (!column) {
        throw new Error(`Missing overlap column for ${event.id}`);
      }

      event.columnIndex = columnIndex;
      column.push(event);
    }
  }

  const columnCount = columns.length;

  return groupEvents.map((event, eventIndex) => {
    const left = (event.columnIndex / columnCount) * SAFE_EDGE_PERCENT;
    let span = 1;

    for (
      let columnIndex = event.columnIndex + 1;
      columnIndex < columnCount;
      columnIndex += 1
    ) {
      const column = arrayAt(columns, columnIndex);

      if (!column) {
        throw new Error(`Missing overlap column for ${event.id}`);
      }

      const hasOverlap = column.some(
        (candidate) =>
          candidate.startEpoch < event.endEpoch &&
          candidate.endEpoch > event.startEpoch
      );

      if (hasOverlap) {
        break;
      }

      span += 1;
    }

    const maxWidth = Math.max(0, SAFE_EDGE_PERCENT - left);
    const minimumWidth = Math.min(MIN_EVENT_WIDTH_PERCENT, maxWidth);

    const width = Math.min(
      maxWidth,
      Math.max(minimumWidth, (span / columnCount) * SAFE_EDGE_PERCENT)
    );

    return {
      groupIndex,
      id: event.id,
      left,
      width,
      zIndex: BASE_Z_INDEX + eventIndex,
    };
  });
};

const toEpoch = (value: UtcInstant): number => {
  const normalized = utcInstant(value);
  const epoch = Date.parse(normalized);

  if (!Number.isFinite(epoch)) {
    throw new RangeError(`Invalid UTC instant: ${value}`);
  }

  return epoch;
};

const normalizeTimedEvents = (
  events: readonly TimedLayoutInput[]
): NormalizedEvent[] => {
  const seenIds = new Set<string>();

  const timedEvents: NormalizedEvent[] = [];

  for (const [inputIndex, event] of events.entries()) {
    if (event.allDay === true) {
      continue;
    }

    if (seenIds.has(event.id)) {
      console.warn(`Calendar: skipping duplicate event id ${event.id}`);
      continue;
    }

    seenIds.add(event.id);

    let startEpoch: number;
    let endEpoch: number;

    try {
      startEpoch = toEpoch(event.start);
      endEpoch = toEpoch(event.end);
    } catch {
      console.warn(`Calendar: skipping malformed event ${event.id}`);
      continue;
    }

    if (endEpoch <= startEpoch) {
      console.warn(
        `Calendar: skipping event ${event.id}, end is not after start`
      );
      continue;
    }

    timedEvents.push({
      ...event,
      columnIndex: -1,
      endEpoch,
      inputIndex,
      startEpoch,
    });
  }

  return timedEvents;
};

const groupOverlappingEvents = (
  sortedEvents: readonly NormalizedEvent[]
): NormalizedEvent[][] => {
  const groups: NormalizedEvent[][] = [];

  let group: NormalizedEvent[] = [];

  let groupFurthestEnd = -Infinity;

  for (const event of sortedEvents) {
    if (group.length > 0 && event.startEpoch >= groupFurthestEnd) {
      groups.push(group);
      group = [];
      groupFurthestEnd = -Infinity;
    }

    group.push(event);
    groupFurthestEnd = Math.max(groupFurthestEnd, event.endEpoch);
  }

  if (group.length > 0) {
    groups.push(group);
  }

  return groups;
};

const buildLayoutGeometry = (
  groups: readonly NormalizedEvent[][]
): TimedEventGeometry[] => {
  const geometry: TimedEventGeometry[] = [];

  for (const [groupIndex, groupEvents] of groups.entries()) {
    geometry.push(...layoutGroup(groupEvents, groupIndex));
  }

  return geometry;
};

export const layoutTimedEvents = (
  events: readonly TimedLayoutInput[]
): TimedEventGeometry[] => {
  // @cpt-begin:cpt-frontx-calendar-kit-flow-week-grid-host-embedding:p1:inst-wg-derive
  const normalizedEvents = normalizeTimedEvents(events);
  const sortedEvents = sortCopy(normalizedEvents, compareEvents);
  const groups = groupOverlappingEvents(sortedEvents);

  return buildLayoutGeometry(groups);
  // @cpt-end:cpt-frontx-calendar-kit-flow-week-grid-host-embedding:p1:inst-wg-derive
};
