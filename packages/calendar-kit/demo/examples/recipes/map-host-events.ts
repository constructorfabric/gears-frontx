import {
  calendarDate,
  fromViewerDateTime,
  parseIanaTimeZone,
  parseLocalTime,
} from "@gears-frontx/calendar-kit";
import type { CalendarEvent } from "@gears-frontx/calendar-kit";

interface ApiEvent {
  readonly id: string;
  readonly name: string;
  readonly zone: string;
  readonly allDay: boolean;
  readonly startDate: string;
  readonly endDate: string;
  readonly startTime?: string;
  readonly endTime?: string;
  readonly room?: string;
  readonly courseCode?: string;
  readonly canEdit: boolean;
}

export interface CourseMetadata {
  readonly courseCode: string | null;
  readonly canEdit: boolean;
}

export const toCalendarEvent = (
  api: ApiEvent
): CalendarEvent<CourseMetadata> => {
  const timeZone = parseIanaTimeZone(api.zone);
  const startDate = calendarDate(api.startDate);
  const endDate = calendarDate(api.endDate);

  const shared = {
    colorFamily: "turquoise",
    id: api.id,
    location: api.room ?? null,
    metadata: { canEdit: api.canEdit, courseCode: api.courseCode ?? null },
    timeZone,
    title: api.name,
  } as const;

  if (api.allDay) {
    return {
      ...shared,
      allDay: true,
      endDate,
      endTime: null,
      startDate,
      startTime: null,
    };
  }

  const startTime = parseLocalTime(api.startTime ?? "00:00");
  const endTime = parseLocalTime(api.endTime ?? "00:00");

  return {
    ...shared,
    allDay: false,
    end: fromViewerDateTime({ date: endDate, time: endTime, timeZone }),
    endDate,
    endTime,
    start: fromViewerDateTime({ date: startDate, time: startTime, timeZone }),
    startDate,
    startTime,
  };
};
