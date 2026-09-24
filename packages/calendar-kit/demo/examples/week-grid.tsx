import {
  CreateEventPopover,
  EventDetailPanel,
  parseLocalTime,
} from "@gears-frontx/calendar-kit";
import type {
  CalendarDirection,
  CalendarEvent,
  CalendarEventRenderContext,
  CreateEventDraft,
  CreateEventResult,
  WeekGridInteractionMode,
} from "@gears-frontx/calendar-kit";
import { ConflictIndicator } from "@gears-frontx/calendar-kit/conflict-indicator";
import { WeekGrid } from "@gears-frontx/calendar-kit/week-grid";
import { useState } from "react";
import type { ReactNode } from "react";

import {
  DEMO_DATE,
  DEMO_TIME_ZONE,
  DEMO_WEEK_TRANSLATIONS,
  DemoSection,
  demoTranslate,
  logDemo,
  sampleCalendars,
  sampleEvents,
  sampleLocations,
  samplePeople,
  sampleProviders,
  SegmentedControl,
} from "../main";
import type { DemoEventMetadata, SegmentOption } from "../main";

type DemoState = "normal" | "empty";

const MODE_OPTIONS: readonly SegmentOption<WeekGridInteractionMode>[] = [
  { label: "Quick create", value: "quick-create" },
  { label: "Paint & move", value: "paint-and-move" },
  { label: "Read only", value: "read-only" },
];

const DAYS_OPTIONS: readonly SegmentOption<5 | 7>[] = [
  { label: "7 days", value: 7 },
  { label: "5 days", value: 5 },
];

const STATE_OPTIONS: readonly SegmentOption<DemoState>[] = [
  { label: "Data", value: "normal" },
  { label: "Empty", value: "empty" },
];

const defaultDraft: CreateEventDraft = {
  allDay: false,
  calendarId: "cal-work",
  endDate: null,
  endTime: parseLocalTime("11:00"),
  startDate: DEMO_DATE,
  startTime: parseLocalTime("10:00"),
  timeZone: DEMO_TIME_ZONE,
  title: "New meeting",
};

const submitDraft = async (
  draft: CreateEventDraft
): Promise<CreateEventResult> => {
  console.info("[demo] create-event submit", draft.title);

  return await Promise.resolve({ eventId: "ev-created" });
};

const WeekGridDemo = ({ direction }: { direction: CalendarDirection }) => {
  const [mode, setMode] = useState<WeekGridInteractionMode>("quick-create");

  const [visibleDays, setVisibleDays] = useState<5 | 7>(7);

  const [state, setState] = useState<DemoState>("normal");

  const [selectedEventId, setSelectedEventId] = useState<string | null>(
    "ev-sprint-planning"
  );

  const events: readonly CalendarEvent<DemoEventMetadata>[] =
    state === "empty" ? [] : sampleEvents;

  const detailEvent =
    sampleEvents.find((event) => event.id === selectedEventId) ?? null;

  const renderDemoEvent = (
    context: CalendarEventRenderContext<DemoEventMetadata>
  ): ReactNode => {
    const { event, conflicts } = context;
    const room = event.metadata?.room;

    return (
      <span>
        <strong>{event.title}</strong>
        {room !== undefined && <span> · {room}</span>}
        {conflicts.length > 0 && (
          <ConflictIndicator
            conflicts={conflicts}
            t={demoTranslate}
            direction={direction}
          />
        )}
      </span>
    );
  };

  return (
    <>
      <DemoSection
        title="Week grid"
        hint="Switch interaction mode, day count and data presence. The custom renderEvent slot shows title, opaque metadata and dimension-labelled conflicts."
      >
        <div className="demo-controls">
          <SegmentedControl
            label="Mode"
            options={MODE_OPTIONS}
            value={mode}
            onChange={setMode}
          />
          <SegmentedControl
            label="Days"
            options={DAYS_OPTIONS}
            value={visibleDays}
            onChange={setVisibleDays}
          />
          <SegmentedControl
            label="State"
            options={STATE_OPTIONS}
            value={state}
            onChange={setState}
          />
        </div>
        <WeekGrid
          date={DEMO_DATE}
          events={events}
          visibleDays={visibleDays}
          interactionMode={mode}
          selectedEventId={selectedEventId}
          onSelectedEventIdChange={setSelectedEventId}
          direction={direction}
          translations={DEMO_WEEK_TRANSLATIONS}
          renderEvent={renderDemoEvent}
          onQuickCreate={logDemo("quick-create")}
          onPaintSelect={logDemo("paint-select")}
          onMoveRequest={(request) => {
            request.confirm();
          }}
        />
      </DemoSection>

      <div className="demo-columns">
        <DemoSection
          title="Create shell"
          hint="CreateEventPopover draft workflow, open by default."
        >
          <CreateEventPopover
            calendars={sampleCalendars}
            people={samplePeople}
            locations={sampleLocations}
            conferencingProviders={sampleProviders}
            defaultOpen
            defaultDraft={defaultDraft}
            onSubmit={submitDraft}
            onCancel={logDemo("create-event cancel")}
            direction={direction}
          />
        </DemoSection>

        <DemoSection
          title="Detail shell"
          hint="EventDetailPanel for the selected event, open by default."
        >
          <EventDetailPanel
            event={detailEvent}
            defaultOpen
            onClose={() => {
              setSelectedEventId(null);
            }}
            onEdit={logDemo("event edit")}
            onDelete={() => {
              setSelectedEventId(null);
            }}
            direction={direction}
          />
        </DemoSection>
      </div>
    </>
  );
};

export default WeekGridDemo;
