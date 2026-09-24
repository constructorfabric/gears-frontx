import { leadingGraphemes } from "../../../core/format";
import { dateTimeFormatter, numberFormatter } from "../../../core/intl-cache";
import type { CalendarDate } from "../../../core/model";

const WEEKDAY_INITIAL_LENGTH = 2;

export const formatDateFieldLabel = (
  date: CalendarDate,
  locale: string,
  includeYear = false
): string =>
  dateTimeFormatter(locale, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    weekday: "short",
    year: includeYear ? "numeric" : undefined,
  }).format(new Date(`${date}T12:00:00Z`));

export const formatCalendarCaption = (month: Date, locale: string): string =>
  dateTimeFormatter(locale, { month: "long", year: "numeric" }).format(month);

export const formatWeekdayInitials = (
  weekday: Date,
  locale: string
): string => {
  const short = dateTimeFormatter(locale, { weekday: "short" }).format(weekday);

  return leadingGraphemes(short, locale, WEEKDAY_INITIAL_LENGTH);
};

export const formatDayNumber = (day: Date, locale: string): string =>
  numberFormatter(locale).format(day.getDate());

export const formatDayLabel = (day: Date, locale: string): string =>
  dateTimeFormatter(locale, { dateStyle: "full" }).format(day);
