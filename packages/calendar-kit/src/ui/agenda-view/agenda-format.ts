import { arrayAt } from "../../core/array";
import { formatCalendarList } from "../../core/format";
import { dateTimeFormatter } from "../../core/intl-cache";
import type { CalendarDate, IanaTimeZone, UtcInstant } from "../../core/model";
import { addCalendarDays, fromViewerDateTime } from "../../core/temporal";
import { parseIanaTimeZone, utcInstant } from "../../core/validation";
import type { CalendarTranslate } from "../../i18n/calendar-localization";
import type { AgendaAnnouncement } from "../../react/controllers/use-agenda-view-controller";
import type { AgendaDayGroup, AgendaEventRow } from "./agenda-rows";

export {
  formatDuration,
  formatGridTime as formatAgendaTime,
  formatRelativeHint,
} from "../../core/format";

export const getRelativeDayLabel = (
  date: CalendarDate,
  todayDate: CalendarDate,
  t: CalendarTranslate
): string | null => {
  if (date === todayDate) {
    return t("calendar.agenda.today");
  }

  if (date === addCalendarDays(todayDate, 1)) {
    return t("calendar.agenda.tomorrow");
  }

  return null;
};

const AGENDA_DATE_PARTS: Intl.DateTimeFormatOptions = {
  day: "numeric",
  month: "short",
  weekday: "short",
};

const findPart = (
  parts: readonly Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes
): string => parts.find((part) => part.type === type)?.value ?? "";

export const formatAgendaDate = (
  instant: UtcInstant,
  timeZone: IanaTimeZone,
  locale: string
): string => {
  const validInstant = utcInstant(instant);
  const validTimeZone = parseIanaTimeZone(timeZone);
  const parts = dateTimeFormatter(locale, {
    ...AGENDA_DATE_PARTS,
    timeZone: validTimeZone,
  }).formatToParts(new Date(validInstant));

  const weekday = findPart(parts, "weekday");
  const month = findPart(parts, "month").slice(0, 3);
  const day = findPart(parts, "day");

  return `${weekday}, ${month} ${day}`;
};

const formatAgendaGroupDate = (
  group: AgendaDayGroup,
  timeZone: IanaTimeZone,
  locale: string
): string =>
  formatAgendaDate(
    fromViewerDateTime({ date: group.date, time: "00:00", timeZone }),
    timeZone,
    locale
  );

export const formatAgendaEventCount = (
  count: number,
  t: CalendarTranslate
): string => t("calendar.agenda.eventCount", { count });

export const buildLiveAnnouncement = (
  announcement: AgendaAnnouncement | null,
  dayGroups: readonly AgendaDayGroup[],
  eventRows: readonly AgendaEventRow[],
  locale: string,
  timeZone: IanaTimeZone,
  t: CalendarTranslate
): string => {
  const firstGroup = arrayAt(dayGroups, 0);
  const lastGroup = arrayAt(dayGroups, -1);

  if (firstGroup === undefined || lastGroup === undefined) {
    return "";
  }

  const firstLabel = formatAgendaGroupDate(firstGroup, timeZone, locale);
  const lastLabel = formatAgendaGroupDate(lastGroup, timeZone, locale);

  const counts = dayGroups.map((group) =>
    formatCalendarList(locale, [
      formatAgendaGroupDate(group, timeZone, locale),
      formatAgendaEventCount(group.eventCount, t),
    ])
  );

  const parts = [`${firstLabel} – ${lastLabel}`, ...counts];

  if (announcement?.kind === "focus") {
    const focusedRow = arrayAt(eventRows, announcement.rowIndex);

    if (focusedRow !== undefined) {
      parts.push(`${focusedRow.event.title} ${t("calendar.agenda.focus")}`);
    }
  }

  return formatCalendarList(locale, parts);
};
