import { useMemo, useState } from "react";

import {
  formatViewerTime,
  formatViewerTimeZoneOffset,
} from "../../core/format";
import type {
  CalendarWorldClock,
  IanaTimeZone,
  UtcInstant,
} from "../../core/model";
import { zoneCityLabel } from "../../core/time-zones";
import { parseIanaTimeZone } from "../../core/validation";
import { useCurrentInstant } from "../hooks/use-current-instant";

export const CLOCK_MOVE = {
  earlier: "earlier",
  later: "later",
} as const;

export type ClockMove = (typeof CLOCK_MOVE)[keyof typeof CLOCK_MOVE];

export interface WorldClocksControllerParams {
  readonly timeZoneIds: readonly IanaTimeZone[];
  readonly availableTimeZoneIds: readonly IanaTimeZone[];
  readonly locale: string;
  readonly now?: UtcInstant;
  readonly onChange: (timeZoneIds: readonly IanaTimeZone[]) => void;
}

export interface WorldClocksControllerResult {
  readonly clocks: readonly CalendarWorldClock[];
  readonly addableTimeZoneIds: readonly IanaTimeZone[];
  readonly availableTimeZoneIds: readonly IanaTimeZone[];
  readonly editing: boolean;
  readonly toggleEditing: () => void;
  readonly addClock: (timeZoneId: IanaTimeZone) => void;
  readonly removeClock: (timeZoneId: IanaTimeZone) => void;
  readonly moveClock: (timeZoneId: IanaTimeZone, move: ClockMove) => void;
}

const readValidTimeZoneIds = (
  timeZoneIds: readonly IanaTimeZone[]
): readonly IanaTimeZone[] =>
  timeZoneIds.flatMap((timeZoneId) => {
    try {
      parseIanaTimeZone(timeZoneId);

      return [timeZoneId];
    } catch {
      return [];
    }
  });

export interface WorldClockViewModelInput {
  readonly timeZoneIds: readonly IanaTimeZone[];
  readonly availableTimeZoneIds: readonly IanaTimeZone[];
  readonly locale: string;
  readonly currentInstant: UtcInstant;
}

export interface WorldClockViewModel {
  readonly clocks: readonly CalendarWorldClock[];
  readonly addableTimeZoneIds: readonly IanaTimeZone[];
  readonly availableTimeZoneIds: readonly IanaTimeZone[];
  readonly selectedTimeZoneIds: readonly IanaTimeZone[];
}

export const buildWorldClockViewModel = ({
  timeZoneIds,
  availableTimeZoneIds,
  locale,
  currentInstant,
}: WorldClockViewModelInput): WorldClockViewModel => {
  const selectedTimeZoneIds = readValidTimeZoneIds(timeZoneIds);
  const validAvailableTimeZoneIds = readValidTimeZoneIds(availableTimeZoneIds);
  const selectedTimeZoneSet = new Set(selectedTimeZoneIds);
  const clocks = selectedTimeZoneIds.map((timeZoneId) => {
    const timeZone = parseIanaTimeZone(timeZoneId);

    return {
      city: zoneCityLabel(timeZoneId),
      offset: formatViewerTimeZoneOffset(currentInstant, timeZone, locale),
      time: formatViewerTime(currentInstant, timeZone, locale, {
        hour12: false,
        timeStyle: "short",
      }),
      timeZoneId,
    } satisfies CalendarWorldClock;
  });
  const addableTimeZoneIds = validAvailableTimeZoneIds.filter(
    (timeZoneId) => !selectedTimeZoneSet.has(timeZoneId)
  );

  return {
    addableTimeZoneIds,
    availableTimeZoneIds: validAvailableTimeZoneIds,
    clocks,
    selectedTimeZoneIds,
  };
};

export const useWorldClocksController = ({
  timeZoneIds,
  availableTimeZoneIds,
  locale,
  now,
  onChange,
}: WorldClocksControllerParams): WorldClocksControllerResult => {
  const [editing, setEditing] = useState(false);

  const { currentInstant } = useCurrentInstant({
    cadence: "minute-aligned",
    now,
  });

  const viewModel = useMemo(
    () =>
      buildWorldClockViewModel({
        availableTimeZoneIds,
        currentInstant,
        locale,
        timeZoneIds,
      }),
    [availableTimeZoneIds, currentInstant, locale, timeZoneIds]
  );

  const addableTimeZoneSet = useMemo(
    () => new Set(viewModel.addableTimeZoneIds),
    [viewModel.addableTimeZoneIds]
  );

  const toggleEditing = (): void => {
    setEditing((current) => !current);
  };

  const addClock = (timeZoneId: IanaTimeZone): void => {
    if (!addableTimeZoneSet.has(timeZoneId)) {
      return;
    }

    onChange([...viewModel.selectedTimeZoneIds, timeZoneId]);
  };

  const removeClock = (timeZoneId: IanaTimeZone): void => {
    onChange(
      viewModel.selectedTimeZoneIds.filter(
        (candidate) => candidate !== timeZoneId
      )
    );
  };

  const moveClock = (timeZoneId: IanaTimeZone, move: ClockMove): void => {
    const index = viewModel.selectedTimeZoneIds.indexOf(timeZoneId);

    const targetIndex = move === CLOCK_MOVE.earlier ? index - 1 : index + 1;

    if (
      index === -1 ||
      targetIndex < 0 ||
      targetIndex >= viewModel.selectedTimeZoneIds.length
    ) {
      return;
    }

    const currentTimeZoneId = viewModel.selectedTimeZoneIds[index];
    const adjacentTimeZoneId = viewModel.selectedTimeZoneIds[targetIndex];

    const reordered = [...viewModel.selectedTimeZoneIds];
    reordered[index] = adjacentTimeZoneId;
    reordered[targetIndex] = currentTimeZoneId;
    onChange(reordered);
  };

  return {
    addClock,
    addableTimeZoneIds: viewModel.addableTimeZoneIds,
    availableTimeZoneIds: viewModel.availableTimeZoneIds,
    clocks: viewModel.clocks,
    editing,
    moveClock,
    removeClock,
    toggleEditing,
  };
};
