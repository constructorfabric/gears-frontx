import {
  formatViewerDate,
  formatViewerTime,
  formatViewerTimeZoneOffset,
} from "../../core/format";
import type {
  CalendarDate,
  CalendarEvent,
  IanaTimeZone,
} from "../../core/model";
import { addCalendarDays, fromViewerDateTime } from "../../core/temporal";
import { formatTimeOfDay } from "../../core/time-input";
import type { CalendarTranslate } from "../../i18n/calendar-localization";
import type { EventDetailPanelCopyStatus } from "../../react/public";

export interface RsvpSegment {
  readonly labelKey: string;
  readonly count: number;
}

const RSVP_LABEL_KEYS = {
  awaiting: "calendar.detail.rsvp.awaiting",
  invited: "calendar.detail.rsvp.invited",
  maybe: "calendar.detail.rsvp.maybe",
  no: "calendar.detail.rsvp.no",
  yes: "calendar.detail.rsvp.yes",
} as const;

export const buildRsvpSegments = (
  event: CalendarEvent
): readonly RsvpSegment[] => {
  const { rsvp } = event;

  if (!rsvp) {
    return [];
  }
  return [
    { count: rsvp.invited, labelKey: RSVP_LABEL_KEYS.invited },
    { count: rsvp.yes, labelKey: RSVP_LABEL_KEYS.yes },
    { count: rsvp.no, labelKey: RSVP_LABEL_KEYS.no },
    { count: rsvp.awaiting, labelKey: RSVP_LABEL_KEYS.awaiting },
    { count: rsvp.maybe, labelKey: RSVP_LABEL_KEYS.maybe },
  ];
};

export const formatRsvpSegment = (
  segment: RsvpSegment,
  t: CalendarTranslate
): string => t(segment.labelKey, { count: segment.count });

export const resolveCopyAnnouncement = (
  copyStatus: EventDetailPanelCopyStatus,
  t: CalendarTranslate
): string => {
  if (copyStatus === "copied") {
    return t("calendar.detail.copy.copied");
  }
  if (copyStatus === "error") {
    return t("calendar.detail.copy.failed");
  }
  return "";
};

export const formatRecurrenceSummary = (
  event: CalendarEvent,
  t: CalendarTranslate
): string | undefined => {
  const rule = event.recurrenceRule ?? "";

  if (rule === "" || rule.trim() === "") {
    return undefined;
  }
  return t("calendar.detail.recurrence", { rule });
};

const formatViewerDay = (
  date: CalendarDate,
  timeZone: IanaTimeZone,
  locale: string
): string => {
  const dayStart = fromViewerDateTime({ date, time: "00:00", timeZone });

  return formatViewerDate(dayStart, timeZone, locale);
};

export const formatEventRange = (
  event: CalendarEvent,
  timeZone: IanaTimeZone,
  locale: string
): string => {
  if (event.allDay) {
    const lastDay = addCalendarDays(event.endDate, -1);
    const firstLabel = formatViewerDay(event.startDate, timeZone, locale);

    return event.startDate === lastDay
      ? firstLabel
      : `${firstLabel} – ${formatViewerDay(lastDay, timeZone, locale)}`;
  }

  const date = formatViewerDate(event.start, timeZone, locale);
  const startTime = formatTimeOfDay(event.startTime, locale);

  if (event.endTime === null) {
    return `${date}, ${startTime}`;
  }
  return `${date}, ${startTime} – ${formatTimeOfDay(event.endTime, locale)}`;
};

export const formatComparisonLine = (
  event: CalendarEvent,
  comparisonTimeZone: IanaTimeZone,
  locale: string
): string => {
  if (event.allDay) {
    const dayStart = fromViewerDateTime({
      date: event.startDate,
      time: "00:00",
      timeZone: comparisonTimeZone,
    });

    return `${formatViewerDate(dayStart, comparisonTimeZone, locale)} (${comparisonTimeZone})`;
  }

  const start = formatViewerTime(event.start, comparisonTimeZone, locale);

  const end =
    event.endTime === null
      ? start
      : `${start} – ${formatViewerTime(event.end, comparisonTimeZone, locale)}`;

  return `${end} (${comparisonTimeZone})`;
};

const SHORT_24H_TIME = { hour12: false, timeStyle: "short" } as const;

/** "GMT+3 Sofia, 10:00 - 11:00": one line of the detail's Time zone section. */
export const formatZoneLine = (
  event: Extract<CalendarEvent, { readonly allDay: false }>,
  timeZone: IanaTimeZone,
  locale: string
): string => {
  const offset = formatViewerTimeZoneOffset(event.start, timeZone, locale);
  const city = (timeZone.split("/").at(-1) ?? timeZone).replaceAll("_", " ");
  const start = formatViewerTime(event.start, timeZone, locale, SHORT_24H_TIME);
  const end = formatViewerTime(event.end, timeZone, locale, SHORT_24H_TIME);

  return `${offset} ${city}, ${start} - ${end}`;
};
