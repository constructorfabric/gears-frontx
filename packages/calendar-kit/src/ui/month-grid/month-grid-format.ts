import { arrayAt } from "../../core/array";
import {
  formatCalendarList,
  formatViewerDate,
  formatViewerMonthYear,
} from "../../core/format";
import { dateTimeFormatter, numberFormatter } from "../../core/intl-cache";
import type { CalendarDate, IanaTimeZone } from "../../core/model";
import { buildDayRange, toUtcRange } from "../../core/temporal";
import type { CalendarTranslate } from "../../i18n/calendar-localization";
import type {
  MonthGridAnnouncement,
  MonthGridRow,
} from "../../react/controllers/use-month-grid-controller";

export const MONTH_ANNOUNCEMENT_KIND = {
  focus: "focus",
  overflow: "overflow",
  range: "range",
} as const;

export const formatMonthWeekNumber = (
  weekNumber: number,
  locale: string
): string => numberFormatter(locale).format(weekNumber);

export const formatMonthDayNumber = (
  date: CalendarDate,
  locale: string
): string => numberFormatter(locale).format(Number(date.slice(8, 10)));

export const formatMonthWeekday = (
  date: CalendarDate,
  timeZone: IanaTimeZone,
  locale: string
): string => {
  const instant = toUtcRange(buildDayRange(date, timeZone)).start;

  return dateTimeFormatter(locale, { timeZone, weekday: "short" }).format(
    new Date(instant)
  );
};

const formatCount = (
  id: "calendar.month.eventCount" | "calendar.month.hidden",
  count: number,
  t: CalendarTranslate
): string => t(id, { count });

export const buildLiveAnnouncement = (
  announcement: MonthGridAnnouncement | null,
  monthRange: {
    readonly start: CalendarDate;
    readonly endExclusive: CalendarDate;
  },
  rows: readonly MonthGridRow[],
  locale: string,
  timeZone: IanaTimeZone,
  t: CalendarTranslate
): string => {
  if (announcement === null) {
    return "";
  }

  if (announcement.kind === MONTH_ANNOUNCEMENT_KIND.range) {
    const monthStart = toUtcRange(
      buildDayRange(monthRange.start, timeZone)
    ).start;

    return `${t("calendar.month.range")} ${formatViewerMonthYear(monthStart, timeZone, locale)}`;
  }

  if (announcement.kind === MONTH_ANNOUNCEMENT_KIND.overflow) {
    return formatCount(
      "calendar.month.hidden",
      announcement.hiddenCount ?? 0,
      t
    );
  }

  const date =
    announcement.date ??
    arrayAt(arrayAt(rows, 0)?.cells ?? [], 0)?.date ??
    monthRange.start;
  const dayStart = toUtcRange(buildDayRange(date, timeZone)).start;

  const hiddenCount = announcement.hiddenCount ?? 0;

  return formatCalendarList(locale, [
    formatViewerDate(dayStart, timeZone, locale, { dateStyle: "full" }),
    formatCount("calendar.month.eventCount", announcement.eventCount ?? 0, t),
    t("calendar.month.focus"),
    ...(hiddenCount > 0
      ? [formatCount("calendar.month.hidden", hiddenCount, t)]
      : []),
  ]);
};
