import { addCalendarDays, addCalendarMonths } from "@gears-frontx/calendar-kit";
import type {
  CalendarDate,
  CalendarDirection,
  CalendarView,
} from "@gears-frontx/calendar-kit";
import { AgendaView } from "@gears-frontx/calendar-kit/agenda-view";
import { AvailabilityGrid } from "@gears-frontx/calendar-kit/availability-grid";
import { CalendarToolbar } from "@gears-frontx/calendar-kit/calendar-toolbar";
import { DayGrid } from "@gears-frontx/calendar-kit/day-grid";
import { MonthGrid } from "@gears-frontx/calendar-kit/month-grid";
import { WeekGrid } from "@gears-frontx/calendar-kit/week-grid";
import { useState } from "react";
import type { ReactNode } from "react";

import {
  DEMO_DATE,
  DemoSection,
  sampleAvailabilityCells,
  sampleEvents,
} from "../main";

const VIEW_OPTIONS: readonly CalendarView[] = [
  "day",
  "week",
  "month",
  "agenda",
];

const CalendarSuiteDemo = ({ direction }: { direction: CalendarDirection }) => {
  const [view, setView] = useState<CalendarView>("week");

  const [date, setDate] = useState<CalendarDate>(DEMO_DATE);

  const step = (sign: 1 | -1): void => {
    if (view === "month") {
      setDate(addCalendarMonths(date, sign));

      return;
    }

    if (view === "day") {
      setDate(addCalendarDays(date, sign));

      return;
    }

    setDate(addCalendarDays(date, sign * (view === "agenda" ? 30 : 7)));
  };

  const views: Readonly<Record<CalendarView, ReactNode>> = {
    agenda: (
      <AgendaView date={date} events={sampleEvents} direction={direction} />
    ),
    day: <DayGrid date={date} events={sampleEvents} direction={direction} />,
    month: (
      <MonthGrid date={date} events={sampleEvents} direction={direction} />
    ),
    week: (
      <WeekGrid
        date={date}
        events={sampleEvents}
        visibleDays={7}
        interactionMode="read-only"
        direction={direction}
      />
    ),
  };

  return (
    <>
      <DemoSection
        title="Views"
        hint="One toolbar drives all four views: day, week, month and agenda."
      >
        <CalendarToolbar
          currentDate={date}
          activeView={view}
          onViewChange={setView}
          onToday={() => {
            setDate(DEMO_DATE);
          }}
          onPrevious={() => {
            step(-1);
          }}
          onNext={() => {
            step(1);
          }}
          availableViews={VIEW_OPTIONS}
          direction={direction}
        />
        {views[view]}
      </DemoSection>

      <DemoSection
        title="Availability grid"
        hint="Paint an ordered range across days; lunch and late-afternoon cells are unavailable."
      >
        <AvailabilityGrid
          date={DEMO_DATE}
          cells={sampleAvailabilityCells}
          interactionMode="paint"
          direction={direction}
          onPaintSelect={(range) => {
            console.info(
              "[demo] availability range",
              range.start.startTime,
              range.end.startTime
            );
          }}
        />
      </DemoSection>
    </>
  );
};

export default CalendarSuiteDemo;
