import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";

import { DAYS_PER_WEEK } from "../../core/grid";
import { dateTimeFormatter } from "../../core/intl-cache";
import type {
  CalendarDate,
  CalendarEvent,
  IanaTimeZone,
  UtcInstant,
} from "../../core/model";
import {
  addCalendarDays,
  addCalendarMonths,
  buildMonthRange,
  buildWeekRange,
  fromViewerDateTime,
  splitUtcRangeByViewerDay,
  toViewerDateTime,
} from "../../core/temporal";
import { useCurrentInstant } from "../hooks/use-current-instant";

export interface MonthNavigatorWeek {
  readonly key: string;
  readonly dates: readonly CalendarDate[];
}

export interface UseMonthNavigatorControllerOptions {
  readonly selectedDate?: CalendarDate;
  readonly defaultSelectedDate?: CalendarDate;
  readonly events: readonly CalendarEvent[];
  readonly now?: UtcInstant;
  readonly timeZone: IanaTimeZone;
  readonly locale: string;
  readonly onSelectDate: (date: CalendarDate) => void;
}

export interface UseMonthNavigatorControllerResult {
  readonly weeks: readonly MonthNavigatorWeek[];
  readonly monthStart: CalendarDate;
  readonly monthEndExclusive: CalendarDate;
  readonly titleMonth: string;
  readonly titleYear: string;
  readonly datesWithEvents: ReadonlySet<CalendarDate>;
  readonly selectedDate: CalendarDate;
  readonly todayDate: CalendarDate;
  readonly focusedDate: CalendarDate;
  readonly setDayRef: (
    date: CalendarDate,
    element: HTMLDivElement | null
  ) => void;
  readonly goToPreviousMonth: () => void;
  readonly goToNextMonth: () => void;
  readonly selectDate: (date: CalendarDate) => void;
  readonly handleDayKeyDown: (
    event: ReactKeyboardEvent<HTMLDivElement>,
    date: CalendarDate
  ) => void;
}

const resolveInitialDate = (
  defaultSelectedDate: CalendarDate | undefined,
  timeZone: IanaTimeZone,
  currentInstant: UtcInstant
): CalendarDate => {
  if (defaultSelectedDate !== undefined) {
    return defaultSelectedDate;
  }

  return toViewerDateTime(currentInstant, timeZone).date;
};

const collectEventDates = (
  events: readonly CalendarEvent[],
  timeZone: IanaTimeZone
): ReadonlySet<CalendarDate> => {
  const dates = new Set<CalendarDate>();

  for (const event of events) {
    try {
      if (event.allDay) {
        for (
          let date = event.startDate;
          date < event.endDate;
          date = addCalendarDays(date, 1)
        ) {
          dates.add(date);
        }
      } else {
        for (const segment of splitUtcRangeByViewerDay(
          event.start,
          event.end,
          timeZone
        )) {
          dates.add(segment.date);
        }
      }
    } catch {
      // Skip an invalid event rather than blank the navigator.
    }
  }

  return dates;
};

const buildNavigatorWeeks = (
  monthStart: CalendarDate,
  monthEndExclusive: CalendarDate,
  timeZone: IanaTimeZone
): readonly MonthNavigatorWeek[] => {
  const firstWeek = buildWeekRange(monthStart, timeZone);
  const lastMonthDate = addCalendarDays(monthEndExclusive, -1);
  const lastWeek = buildWeekRange(lastMonthDate, timeZone);
  const firstDisplayDate = firstWeek.start;
  const lastDisplayDateExclusive = lastWeek.endExclusive;

  const weeks: MonthNavigatorWeek[] = [];

  let weekStart = firstDisplayDate;

  while (weekStart < lastDisplayDateExclusive) {
    const currentWeekStart = weekStart;
    const dates = Array.from({ length: DAYS_PER_WEEK }, (_, index) =>
      addCalendarDays(currentWeekStart, index)
    );

    weeks.push({ dates, key: `month-week:${weekStart}` });
    weekStart = addCalendarDays(weekStart, DAYS_PER_WEEK);
  }

  return weeks;
};

const dayStepForKey = (key: string): number | null => {
  switch (key) {
    case "ArrowLeft": {
      return -1;
    }
    case "ArrowRight": {
      return 1;
    }
    case "ArrowUp": {
      return -DAYS_PER_WEEK;
    }
    case "ArrowDown": {
      return DAYS_PER_WEEK;
    }
    default: {
      return null;
    }
  }
};

const monthStepForKey = (key: string): number | null => {
  switch (key) {
    case "PageUp": {
      return -1;
    }
    case "PageDown": {
      return 1;
    }
    default: {
      return null;
    }
  }
};

export const useMonthNavigatorController = (
  options: UseMonthNavigatorControllerOptions
): UseMonthNavigatorControllerResult => {
  const { currentInstant } = useCurrentInstant({
    cadence: "interval",
    now: options.now,
  });
  const { events, timeZone, locale, onSelectDate } = options;
  const isControlled = options.selectedDate !== undefined;

  const [uncontrolledDate, setUncontrolledDate] = useState<CalendarDate>(() =>
    resolveInitialDate(options.defaultSelectedDate, timeZone, currentInstant)
  );

  const selectedDate = isControlled ? options.selectedDate : uncontrolledDate;

  const todayDate = useMemo(
    () => toViewerDateTime(currentInstant, timeZone).date,
    [currentInstant, timeZone]
  );

  const [visibleMonth, setVisibleMonth] = useState<CalendarDate>(selectedDate);

  const [previousSelectedDate, setPreviousSelectedDate] =
    useState<CalendarDate>(selectedDate);

  const [focusedDate, setFocusedDate] = useState<CalendarDate>(selectedDate);

  const dayRefs = useRef(new Map<CalendarDate, HTMLDivElement>());
  const pendingFocusRef = useRef(false);

  if (previousSelectedDate !== selectedDate) {
    setPreviousSelectedDate(selectedDate);
    setVisibleMonth(selectedDate);
    setFocusedDate(selectedDate);
  }

  const monthRange = useMemo(
    () => buildMonthRange(visibleMonth, timeZone),
    [timeZone, visibleMonth]
  );

  const weeks = useMemo(
    () =>
      buildNavigatorWeeks(monthRange.start, monthRange.endExclusive, timeZone),
    [monthRange.start, monthRange.endExclusive, timeZone]
  );

  const datesWithEvents = useMemo(
    () => collectEventDates(events, timeZone),
    [events, timeZone]
  );

  const titleFormatters = useMemo(
    () => ({
      month: dateTimeFormatter(locale, { month: "long", timeZone }),
      year: dateTimeFormatter(locale, { timeZone, year: "numeric" }),
    }),
    [locale, timeZone]
  );

  const titleInstant = useMemo(
    () =>
      fromViewerDateTime({ date: monthRange.start, time: "00:00", timeZone }),
    [monthRange.start, timeZone]
  );

  const { titleMonth, titleYear } = useMemo(
    () => ({
      titleMonth: titleFormatters.month.format(new Date(titleInstant)),
      titleYear: titleFormatters.year.format(new Date(titleInstant)),
    }),
    [titleFormatters, titleInstant]
  );

  // Focus waits for the target month to render.
  useEffect(() => {
    if (!pendingFocusRef.current) {
      return;
    }

    pendingFocusRef.current = false;
    dayRefs.current.get(focusedDate)?.focus();
  }, [focusedDate]);

  const setDayRef = (
    date: CalendarDate,
    element: HTMLDivElement | null
  ): void => {
    if (element) {
      dayRefs.current.set(date, element);
    } else {
      dayRefs.current.delete(date);
    }
  };

  const selectDate = (date: CalendarDate): void => {
    if (!isControlled) {
      setUncontrolledDate(date);
    }

    setFocusedDate(date);
    onSelectDate(date);
  };

  const focusDate = (date: CalendarDate): void => {
    pendingFocusRef.current = true;
    setFocusedDate(date);

    if (!dayRefs.current.has(date)) {
      setVisibleMonth(date);
    }
  };

  const stepMonth = (step: number): void => {
    const targetMonthStart = addCalendarMonths(monthRange.start, step);
    const anchorDay = Number(selectedDate.slice(8, 10));
    const target = addCalendarMonths(targetMonthStart, 0, anchorDay);

    pendingFocusRef.current = true;
    setVisibleMonth(targetMonthStart);
    setFocusedDate(target);
  };

  const goToPreviousMonth = (): void => {
    stepMonth(-1);
  };

  const goToNextMonth = (): void => {
    stepMonth(1);
  };

  const handleDayKeyDown = (
    event: ReactKeyboardEvent<HTMLDivElement>,
    date: CalendarDate
  ): void => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectDate(date);

      return;
    }

    const dayStep = dayStepForKey(event.key);

    if (dayStep !== null) {
      event.preventDefault();
      focusDate(addCalendarDays(date, dayStep));

      return;
    }

    const monthStep = monthStepForKey(event.key);

    if (monthStep !== null) {
      event.preventDefault();
      stepMonth(monthStep);

      return;
    }

    if (event.key !== "Home" && event.key !== "End") {
      return;
    }

    event.preventDefault();

    const week = weeks.find((candidate) => candidate.dates.includes(date));

    if (!week) {
      return;
    }

    const edge =
      event.key === "Home" ? week.dates[0] : week.dates[DAYS_PER_WEEK - 1];
    focusDate(edge);
  };

  return {
    datesWithEvents,
    focusedDate,
    goToNextMonth,
    goToPreviousMonth,
    handleDayKeyDown,
    monthEndExclusive: monthRange.endExclusive,
    monthStart: monthRange.start,
    selectDate,
    selectedDate,
    setDayRef,
    titleMonth,
    titleYear,
    todayDate,
    weeks,
  };
};
