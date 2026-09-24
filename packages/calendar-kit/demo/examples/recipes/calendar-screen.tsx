import {
  AgendaView,
  CalendarToolbar,
  CreateEventPopover,
  DayGrid,
  EventDetailPanel,
  MonthGrid,
  WeekGrid,
  addCalendarDays,
  addCalendarMonths,
  parseLocalTime,
} from "@gears-frontx/calendar-kit";
import type {
  CalendarDate,
  CalendarEvent,
  CalendarQuickCreatePayload,
  CalendarRef,
  CalendarView,
  CreateEventDraft,
  CreateEventResult,
  IanaTimeZone,
} from "@gears-frontx/calendar-kit";
import { useState } from "react";

interface CalendarScreenProps {
  readonly today: CalendarDate;
  readonly timeZone: IanaTimeZone;
  readonly events: readonly CalendarEvent[];
  readonly calendars: readonly CalendarRef[];
  readonly createEvent: (draft: CreateEventDraft) => Promise<CreateEventResult>;
}

const stepDate = (
  date: CalendarDate,
  view: CalendarView,
  sign: 1 | -1
): CalendarDate => {
  if (view === "month") {
    return addCalendarMonths(date, sign);
  }

  const days = { agenda: 30, day: 1, week: 7 } as const;

  return addCalendarDays(date, sign * days[view]);
};

interface OpenDetail {
  readonly event: CalendarEvent;
  readonly anchor: HTMLElement | null;
}

interface OpenCreate {
  readonly draft: CreateEventDraft;
  readonly anchorRect?: DOMRect;
}

export const CalendarScreen = ({
  today,
  timeZone,
  events,
  calendars,
  createEvent,
}: CalendarScreenProps) => {
  const [view, setView] = useState<CalendarView>("week");

  const [date, setDate] = useState(today);

  const [detail, setDetail] = useState<OpenDetail | null>(null);

  const [create, setCreate] = useState<OpenCreate | null>(null);

  const openDetail = (
    event: CalendarEvent,
    _context: unknown,
    anchor?: HTMLElement
  ): void => {
    setDetail({ anchor: anchor ?? null, event });
  };

  const openCreate = ({
    range,
    anchorRect,
  }: CalendarQuickCreatePayload): void => {
    setCreate({
      anchorRect:
        anchorRect === undefined ? undefined : DOMRect.fromRect(anchorRect),
      draft: {
        allDay: false,
        calendarId: calendars[0]?.id ?? null,
        endDate: null,
        endTime: parseLocalTime(range.end.endTime),
        startDate: range.start.date,
        startTime: parseLocalTime(range.start.startTime),
        timeZone,
        title: "",
      },
    });
  };

  const shared = { date, events, onEventSelect: openDetail, timeZone } as const;

  return (
    <section>
      <CalendarToolbar
        currentDate={date}
        activeView={view}
        onViewChange={setView}
        onToday={() => {
          setDate(today);
        }}
        onPrevious={() => {
          setDate(stepDate(date, view, -1));
        }}
        onNext={() => {
          setDate(stepDate(date, view, 1));
        }}
      />

      {view === "day" && <DayGrid {...shared} onQuickCreate={openCreate} />}
      {view === "week" && (
        <WeekGrid {...shared} visibleDays={7} onQuickCreate={openCreate} />
      )}
      {view === "month" && <MonthGrid {...shared} />}
      {view === "agenda" && <AgendaView {...shared} />}

      <EventDetailPanel
        open={detail !== null}
        event={detail?.event ?? null}
        anchorElement={detail?.anchor ?? null}
        timeZone={timeZone}
        onClose={() => {
          setDetail(null);
        }}
      />

      {create !== null && (
        <CreateEventPopover
          open
          defaultDraft={create.draft}
          anchorRect={create.anchorRect}
          timeZone={timeZone}
          calendars={calendars}
          people={[]}
          locations={[]}
          conferencingProviders={[]}
          onSubmit={createEvent}
          onCancel={() => {
            setCreate(null);
          }}
          onOpenChange={(open) => {
            if (!open) {
              setCreate(null);
            }
          }}
        />
      )}
    </section>
  );
};
