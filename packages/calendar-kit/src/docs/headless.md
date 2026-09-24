# Headless controllers

Every component is a thin view over a controller hook. The hooks are public, so when no combination of props and slots produces the layout you need, you can keep the kit's state handling, layout math and keyboard model and render your own markup.

Import them from the package root or `@gears-frontx/calendar-kit/react`.

## When to go headless

Go headless when the **structure** has to change: a toolbar with a different control set, an agenda rendered as cards, a grid inside a canvas. If only the **content** of a part changes, a [render slot](customization.md#6-render-slots) is less work and keeps accessibility for free.

## Controllers

| Hook | Behind | Gives you |
| --- | --- | --- |
| `useWeekGridController` | `WeekGrid` | Day columns and slots, timed geometry, all-day spans, the now position, selection and the interaction state (paint, pending and committed moves) |
| `useDayGridController` | `DayGrid` | The day's slots, placements, the current-time position and quick-create handling |
| `useMonthGridController` | `MonthGrid` | Week rows with cells, per-cell visible and hidden counts, focus and keyboard handling, selection |
| `useAgendaViewController` | `AgendaView` | The 30-day window, day groups, flat event rows, roving focus and announcements |
| `useAvailabilityGridController` | `AvailabilityGrid` | Columns of cells, the painted range, focus and paint handlers |
| `useCalendarToolbarController` | `CalendarToolbar` | Active and available views, title parts, the radio-group key handler |
| `useCreateEventController` | `CreateEventPopover` | The draft, validation errors, dirty state, submit and the discard guard |
| `useEventDetailPanelController` | `EventDetailPanel` | Open state, copy-link status, capped participants, restriction, edit/delete availability |
| `useMonthNavigatorController` | `MonthNavigator` | The visible month, selected and focused day, event dots, keyboard handling |
| `useSearchResultsController` | `SearchResults` | The debounced query, grouped results, roving focus |
| `useWorldClocksController` | `WorldClocks` | The clock rows and the add/remove/move edits |
| `useCalendarSidePanelController` | `CalendarSidePanel` | Open state, the search query, focus return |

Each hook takes the same props as its component (without the render slots) and returns plain data plus handlers. The TypeScript result type (`UseWeekGridControllerResult` and so on) is the full reference; your editor shows every member.

## Shared hooks

| Hook | Use |
| --- | --- |
| `useControlledValue` | The `value` / `defaultValue` / `onChange` pattern every component uses. `isControlled` is `value !== undefined` |
| `useDateRangeSelection` | Pick a range of whole days by press-and-drag, click-click or keyboard |
| `useInteractionController` | The paint and move state machine behind the time grids |

## Example: your own toolbar

The controller keeps the view state, the title and the arrow-key behaviour of a radio group; the markup is yours.

<!-- generated:example demo/examples/recipes/headless-toolbar.tsx -->

```tsx
// demo/examples/recipes/headless-toolbar.tsx
import { useCalendarToolbarController } from "@gears-frontx/calendar-kit";
import type { CalendarDate, CalendarView } from "@gears-frontx/calendar-kit";

export const PillToolbar = ({
  date,
  view,
  onViewChange,
}: {
  readonly date: CalendarDate;
  readonly view: CalendarView;
  readonly onViewChange: (view: CalendarView) => void;
}) => {
  const toolbar = useCalendarToolbarController({
    activeView: view,
    currentDate: date,
    direction: "ltr",
    locale: "en-US",
    onViewChange,
  });

  return (
    <header>
      <h2>
        {toolbar.titleMonth} {toolbar.titleYear}
      </h2>
      <div role="radiogroup" aria-label="View">
        {toolbar.availableViews.map((option, index) => (
          <button
            key={option}
            ref={(element) => {
              toolbar.registerRadio(option, element);
            }}
            type="button"
            role="radio"
            aria-checked={option === toolbar.activeView}
            tabIndex={option === toolbar.activeView ? 0 : -1}
            onClick={() => {
              toolbar.selectView(option);
            }}
            onKeyDown={(event) => {
              toolbar.handleViewKeyDown(event, index);
            }}
          >
            {option}
          </button>
        ))}
      </div>
    </header>
  );
};
```

<!-- /generated -->

## Example: a custom create form

`useCreateEventController` owns the draft, validation, the dirty check and the submit lifecycle, so a different form only has to render fields:

```tsx
const form = useCreateEventController({
  defaultDraft,
  onSubmit,
  onCancel,
  timeZone,
});

<form
  onSubmit={(event) => {
    event.preventDefault();
    void form.submit();
  }}
>
  <input
    value={form.draft.title}
    aria-invalid={form.errors.title !== undefined}
    onChange={(event) =>
      form.setDraft({ ...form.draft, title: event.target.value })
    }
  />
  <button disabled={form.isSubmitting}>Save</button>
  <button type="button" onClick={form.requestCancel}>
    Cancel
  </button>
  {form.isDiscardDialogOpen && (
    <DiscardDialog
      onKeep={form.dismissDiscard}
      onDiscard={form.confirmDiscard}
    />
  )}
</form>;
```

`errors` holds validation codes (`required`, `invalid`, `before-start`) per field. Use `createEventErrorMessages(errors, t)` to turn them into the kit's translated messages.

## The core, without React

Everything under `@gears-frontx/calendar-kit/core` is plain TypeScript and runs anywhere: on a server, in a worker, in a test.

| Area | Functions |
| --- | --- |
| Values | `calendarDate`, `parseLocalTime`, `utcInstant`, `parseIanaTimeZone` |
| Time | `fromViewerDateTime`, `toViewerDateTime`, `addCalendarDays`, `addCalendarMonths`, `compareUtcInstants`, `splitUtcRangeByViewerDay` |
| Ranges | `buildDayRange`, `buildWeekRange`, `buildMonthRange`, `toUtcRange`, `isDateInRange`, `orderDateRange` |
| Time windows | `buildSlotStarts`, `buildTimeWindowRange`, `countWindowSlots`, `isWithinTimeWindow`, `assertTimeWindow`, `FULL_DAY_TIME_WINDOW`, `DEFAULT_WORKING_HOURS` |
| Layout | `segmentEventsAcrossViewerDates`, `allocateAllDaySpans`, `bucketSegmentsByMonthWeekRow`, `calculateDayColumnGeometry`, `calculateMonthCellCapacity` |
| Formatting | `formatViewerDate`, `formatViewerTime`, `formatViewerDateTime`, `formatViewerMonthYear`, `formatDuration`, `formatRelativeHint`, `formatViewerTimeZoneOffset` |
| Time input | `parseTimeInput`, `formatTimeOfDay`, `usesTwelveHourClock`, `timeOfDayIncrements` |
| Interactions | `createInteractionState`, `transitionInteraction`, `buildSelectionRange`, `validateInteractionEvent` |

Use them to prepare data before it reaches a component, for example to find which events fall in the visible week, or to compute the same layout on a server for a printable view.
