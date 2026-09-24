import { formatGridTime } from "../../core/format";
import type { IanaTimeZone } from "../../core/model";
import type { DaySegment } from "../../react/controllers/use-day-grid-controller";

export const buildEventAnnouncement = (
  segment: DaySegment,
  timeZone: IanaTimeZone,
  locale: string,
  t: (key: string) => string
): string => {
  const timeRange = segment.event.allDay
    ? t("calendar.eventCard.allDay")
    : `${formatGridTime(segment.start, timeZone, locale)} ${t("calendar.day.to")} ${formatGridTime(segment.end, timeZone, locale)}`;

  return `${t("calendar.day.eventPrefix")} ${segment.event.title}. ${timeRange}`;
};
