import { EventCard, WeekGrid } from "@gears-frontx/calendar-kit";
import type {
  CalendarDate,
  CalendarEvent,
  CalendarEventRenderContext,
} from "@gears-frontx/calendar-kit";

import type { CourseMetadata } from "./map-host-events";

const CourseCard = (context: CalendarEventRenderContext<CourseMetadata>) => (
  <EventCard<CourseMetadata>
    event={context.event}
    segment={context.segment}
    geometry={context.geometry}
    positioned={false}
    selected={context.isSelected}
    past={context.isPast}
    readOnly={context.isReadOnly}
    renderMetadata={({ event }) => {
      const courseCode = event.metadata?.courseCode ?? null;

      return courseCode === null ? null : <span>{courseCode}</span>;
    }}
  />
);

export const CourseWeek = ({
  date,
  events,
}: {
  readonly date: CalendarDate;
  readonly events: readonly CalendarEvent<CourseMetadata>[];
}) => (
  <WeekGrid<CourseMetadata>
    date={date}
    events={events}
    renderEvent={CourseCard}
  />
);
