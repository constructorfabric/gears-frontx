import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";

import { dateTimeFormatter } from "../../core/intl-cache";
import type {
  CalendarDate,
  CalendarDirection,
  CalendarView,
  IanaTimeZone,
} from "../../core/model";
import {
  AGENDA_WINDOW_DAYS,
  addCalendarDays,
  fromViewerDateTime,
} from "../../core/temporal";
import { parseIanaTimeZone } from "../../core/validation";

const ALL_VIEWS: readonly CalendarView[] = ["day", "week", "month", "agenda"];

const DEFAULT_TIME_ZONE = parseIanaTimeZone("UTC");

export interface ToolbarTitleRange extends Readonly<Record<string, string>> {
  readonly startDay: string;
  readonly startMonth: string;
  readonly startYear: string;
  readonly endDay: string;
  readonly endMonth: string;
  readonly endYear: string;
}

export interface UseCalendarToolbarControllerOptions {
  readonly direction: CalendarDirection;
  readonly locale: string;
  readonly timeZone?: IanaTimeZone;
  readonly currentDate: CalendarDate;
  readonly activeView?: CalendarView;
  readonly defaultActiveView?: CalendarView;
  readonly availableViews?: readonly CalendarView[];
  readonly onViewChange: (view: CalendarView) => void;
}

export interface UseCalendarToolbarControllerResult {
  readonly activeView: CalendarView;
  readonly availableViews: readonly CalendarView[];
  readonly titleMonth: string;
  readonly titleYear: string;
  readonly titleRange: ToolbarTitleRange | null;
  readonly selectView: (view: CalendarView) => void;
  readonly handleViewKeyDown: (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    index: number
  ) => void;
  readonly registerRadio: (
    view: CalendarView,
    element: HTMLButtonElement | null
  ) => void;
}

const normalizeAvailableViews = (
  available: readonly CalendarView[] | undefined
): readonly CalendarView[] =>
  available !== undefined && available.length > 0 ? available : ALL_VIEWS;

const resolveActiveView = (
  requested: CalendarView,
  available: readonly CalendarView[]
): CalendarView => (available.includes(requested) ? requested : available[0]);

const rovingStepFor = (key: string, direction: CalendarDirection): number => {
  switch (key) {
    case "ArrowDown": {
      return 1;
    }
    case "ArrowUp": {
      return -1;
    }
    case "ArrowRight": {
      return direction === "rtl" ? -1 : 1;
    }
    case "ArrowLeft": {
      return direction === "rtl" ? 1 : -1;
    }
    default: {
      return 0;
    }
  }
};

const rovingTargetFor = (
  key: string,
  index: number,
  count: number,
  direction: CalendarDirection
): number | null => {
  if (count === 0) {
    return null;
  }

  if (key === "Home") {
    return 0;
  }

  if (key === "End") {
    return count - 1;
  }

  const step = rovingStepFor(key, direction);

  if (step === 0) {
    return null;
  }

  return (index + step + count) % count;
};

const partValue = (
  parts: readonly Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes
): string => parts.find((part) => part.type === type)?.value ?? "";

export const useCalendarToolbarController = (
  options: UseCalendarToolbarControllerOptions
): UseCalendarToolbarControllerResult => {
  const {
    direction,
    locale,
    timeZone = DEFAULT_TIME_ZONE,
    currentDate,
    activeView,
    defaultActiveView,
    availableViews,
    onViewChange,
  } = options;

  const [uncontrolledView, setUncontrolledView] = useState<CalendarView>(
    defaultActiveView ?? "day"
  );

  const radioRefs = useRef(new Map<CalendarView, HTMLButtonElement>());
  const previousViewRef = useRef<CalendarView | null>(null);

  const isControlled = activeView !== undefined;
  const visibleViews = normalizeAvailableViews(availableViews);
  const requestedView = activeView ?? uncontrolledView;
  const resolvedView = resolveActiveView(requestedView, visibleViews);

  const titleInstant = useMemo(
    () => fromViewerDateTime({ date: currentDate, time: "00:00", timeZone }),
    [currentDate, timeZone]
  );

  const titleFormatter = dateTimeFormatter(locale, {
    month: "long",
    timeZone,
    year: "numeric",
  });

  const { titleMonth, titleYear } = useMemo(() => {
    const titleParts = titleFormatter.formatToParts(new Date(titleInstant));

    return {
      titleMonth: partValue(titleParts, "month"),
      titleYear: partValue(titleParts, "year"),
    };
  }, [titleFormatter, titleInstant]);

  const titleRange = useMemo<ToolbarTitleRange | null>(() => {
    if (resolvedView !== "agenda") {
      return null;
    }

    const windowEnd = addCalendarDays(currentDate, AGENDA_WINDOW_DAYS - 1);

    const formatter = dateTimeFormatter(locale, {
      day: "numeric",
      month: "short",
      timeZone,
      year: "numeric",
    });

    const formatEndpoint = (date: CalendarDate) => {
      const instant = fromViewerDateTime({ date, time: "00:00", timeZone });
      const parts = formatter.formatToParts(new Date(instant));

      return {
        day: partValue(parts, "day"),
        month: partValue(parts, "month").slice(0, 3),
        year: partValue(parts, "year"),
      };
    };

    const start = formatEndpoint(currentDate);
    const end = formatEndpoint(windowEnd);

    return {
      endDay: end.day,
      endMonth: end.month,
      endYear: end.year,
      startDay: start.day,
      startMonth: start.month,
      startYear: start.year,
    };
  }, [resolvedView, locale, timeZone, currentDate]);

  const registerRadio = (
    view: CalendarView,
    element: HTMLButtonElement | null
  ): void => {
    if (element === null) {
      radioRefs.current.delete(view);
    } else {
      radioRefs.current.set(view, element);
    }
  };

  const selectView = (view: CalendarView): void => {
    onViewChange(view);

    if (!isControlled) {
      setUncontrolledView(view);
    }

    radioRefs.current.get(view)?.focus();
  };

  const handleViewKeyDown = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    index: number
  ): void => {
    const target = rovingTargetFor(
      event.key,
      index,
      visibleViews.length,
      direction
    );

    if (target === null) {
      return;
    }

    event.preventDefault();
    selectView(visibleViews[target]);
  };

  useEffect(() => {
    if (
      previousViewRef.current !== null &&
      previousViewRef.current !== resolvedView
    ) {
      radioRefs.current.get(resolvedView)?.focus();
    }

    previousViewRef.current = resolvedView;
  }, [resolvedView]);

  return {
    activeView: resolvedView,
    availableViews: visibleViews,
    handleViewKeyDown,
    registerRadio,
    selectView,
    titleMonth,
    titleRange,
    titleYear,
  };
};
