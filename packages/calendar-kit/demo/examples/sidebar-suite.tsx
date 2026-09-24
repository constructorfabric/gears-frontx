import type {
  CalendarDate,
  CalendarDirection,
  IanaTimeZone,
} from "@gears-frontx/calendar-kit";
import { CalendarList } from "@gears-frontx/calendar-kit/calendar-list";
import { CalendarSidePanel } from "@gears-frontx/calendar-kit/calendar-side-panel";
import { MonthNavigator } from "@gears-frontx/calendar-kit/month-navigator";
import { SearchResults } from "@gears-frontx/calendar-kit/search-results";
import { TimeZoneList } from "@gears-frontx/calendar-kit/time-zone-list";
import { WorldClocks } from "@gears-frontx/calendar-kit/world-clocks";
import { useState } from "react";

import {
  DEMO_DATE,
  DEMO_NOW,
  DEMO_TIME_ZONE,
  DemoSection,
  logDemo,
  sampleCalendars,
  sampleEvents,
  sampleTimeZoneOptions,
  sampleWorldClockIds,
} from "../main";

const availableZoneIds: readonly IanaTimeZone[] = sampleTimeZoneOptions.map(
  (option) => option.id
);

const SidebarSuiteDemo = ({ direction }: { direction: CalendarDirection }) => {
  const [selectedDate, setSelectedDate] = useState<CalendarDate>(DEMO_DATE);

  const [selectedTimeZoneId, setSelectedTimeZoneId] =
    useState<IanaTimeZone | null>(DEMO_TIME_ZONE);

  const [hiddenCalendarIds, setHiddenCalendarIds] = useState<readonly string[]>(
    []
  );

  const [query, setQuery] = useState("");

  return (
    <>
      <DemoSection
        title="Composable side panel"
        hint="CalendarSidePanel composes search, calendars, month navigator, time zones and world clocks in one shell."
      >
        <CalendarSidePanel
          id="demo-side-panel"
          events={sampleEvents}
          calendars={sampleCalendars}
          selectedDate={selectedDate}
          selectedTimeZoneId={selectedTimeZoneId}
          onSelectedTimeZoneIdChange={setSelectedTimeZoneId}
          worldClockTimeZoneIds={sampleWorldClockIds}
          onWorldClockTimeZoneIdsChange={logDemo("world clocks change")}
          hiddenCalendarIds={hiddenCalendarIds}
          onHiddenCalendarIdsChange={setHiddenCalendarIds}
          query={query}
          onQueryChange={setQuery}
          onRevealEvent={(eventId) => {
            console.info("[demo] reveal", eventId);
          }}
          onClose={logDemo("side panel close")}
          direction={direction}
        />
      </DemoSection>

      <div className="demo-columns">
        <DemoSection
          title="Calendar list"
          hint="Controlled hidden-calendar collection."
        >
          <CalendarList
            calendars={sampleCalendars}
            hiddenCalendarIds={hiddenCalendarIds}
            onHiddenCalendarIdsChange={setHiddenCalendarIds}
            direction={direction}
          />
        </DemoSection>

        <DemoSection
          title="World clocks"
          hint="Controlled world-clock collection."
        >
          <WorldClocks
            availableTimeZoneIds={availableZoneIds}
            defaultTimeZoneIds={sampleWorldClockIds}
            now={DEMO_NOW}
            onChange={logDemo("world clocks change")}
            direction={direction}
          />
        </DemoSection>

        <DemoSection
          title="Time zone list"
          hint="Reference-instant time-zone selection."
        >
          <TimeZoneList
            options={sampleTimeZoneOptions}
            referenceInstant={DEMO_NOW}
            selectedTimeZoneId={selectedTimeZoneId}
            onSelectionChange={setSelectedTimeZoneId}
            direction={direction}
          />
        </DemoSection>

        <DemoSection
          title="Search results"
          hint="Grouped event search with reveal."
        >
          <SearchResults
            events={sampleEvents}
            query={query}
            onQueryChange={setQuery}
            now={DEMO_NOW}
            onReveal={(eventId) => {
              console.info("[demo] reveal", eventId);
            }}
            onDismiss={() => {
              setQuery("");
            }}
            direction={direction}
          />
        </DemoSection>

        <DemoSection title="Month navigator" hint="Mini month date navigator.">
          <MonthNavigator
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            events={sampleEvents}
            direction={direction}
          />
        </DemoSection>
      </div>
    </>
  );
};

export default SidebarSuiteDemo;
