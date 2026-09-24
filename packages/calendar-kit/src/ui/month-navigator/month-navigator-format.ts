import { leadingGraphemes } from "../../core/format";
import { dateTimeFormatter, numberFormatter } from "../../core/intl-cache";
import type { CalendarDate } from "../../core/model";

const noonUtc = (date: CalendarDate): Date =>
  // Noon keeps the date stable in any host zone.
  new Date(`${date}T12:00:00.000Z`);

export const formatNavigatorWeekday = (
  date: CalendarDate,
  locale: string
): string =>
  leadingGraphemes(
    dateTimeFormatter(locale, { timeZone: "UTC", weekday: "short" }).format(
      noonUtc(date)
    ),
    locale,
    2
  );

export const formatNavigatorDayNumber = (
  date: CalendarDate,
  locale: string
): string => numberFormatter(locale).format(Number(date.slice(8, 10)));

export const formatNavigatorDayLabel = (
  date: CalendarDate,
  locale: string
): string =>
  dateTimeFormatter(locale, { dateStyle: "full", timeZone: "UTC" }).format(
    noonUtc(date)
  );
