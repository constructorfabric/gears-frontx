# Getting started

## Install

```bash
npm install @gears-frontx/calendar-kit
```

`react` and `react-dom` 19 are peer dependencies. `@gears-frontx/ui-kit` is a regular dependency of the kit and installs with it; import calendar-kit styles only, never ui-kit's.

## Load the styles once

```ts
import "@gears-frontx/calendar-kit/theme.css";
import "@gears-frontx/calendar-kit/themes/onecloud.css";
```

`theme.css` defines the calendar's design tokens. On its own it renders a neutral default palette; the OneCloud preset gives it the in-house look. To use your own design tokens instead, see [Theming](../styles/theming.md). Component CSS arrives automatically with each component import.

`reset.css` is optional. It only applies inside an element that has the `data-calendar-kit-reset` attribute or the `calendar-kit-reset` class, so it cannot leak into the rest of your page.

## Render a week

```tsx
import {
  WeekGrid,
  calendarDate,
  fromViewerDateTime,
  parseIanaTimeZone,
  parseLocalTime,
  type CalendarEvent,
} from "@gears-frontx/calendar-kit";

const timeZone = parseIanaTimeZone("Europe/Istanbul");
const date = calendarDate("2026-09-21");
const start = parseLocalTime("09:00");
const end = parseLocalTime("10:30");

const events: CalendarEvent[] = [
  {
    id: "standup",
    title: "Stand-up",
    colorFamily: "turquoise",
    timeZone,
    allDay: false,
    startDate: date,
    endDate: date,
    startTime: start,
    endTime: end,
    start: fromViewerDateTime({ date, time: start, timeZone }),
    end: fromViewerDateTime({ date, time: end, timeZone }),
  },
];

export const Week = () => (
  <WeekGrid date={date} events={events} timeZone={timeZone} visibleDays={7} />
);
```

Three things to notice:

1. **Dates, times and zones are branded values.** `calendarDate`, `parseLocalTime`, `parseIanaTimeZone` and `utcInstant` validate their input and throw a `RangeError` on bad values. Parse once where data enters your app; see [Concepts](concepts.md).
2. **A timed event carries both its wall-clock fields and its UTC instants.** The grid places it by `start`/`end`; the card prints its local times. `fromViewerDateTime` turns one into the other.
3. **The component is stateless about your data.** It shows `events`; it does not keep, sort or change them.

## Respond to the user

Components report intent through callbacks and change nothing on their own:

```tsx
<WeekGrid
  date={date}
  events={events}
  timeZone={timeZone}
  onEventSelect={(event, _context, anchor) => openDetail(event, anchor)}
  onQuickCreate={({ range, anchorRect }) => openCreate(range, anchorRect)}
/>
```

Wire those to an [`EventDetailPanel`](../ui/event-detail-panel/event-detail-panel.md) and a [`CreateEventPopover`](../ui/create-event/create-event.md) and you have a working calendar screen. The [calendar screen recipe](recipes.md#a-complete-calendar-screen) is the full version, toolbar included.

## Localize once

Two providers wrap a calendar: `CalendarProvider` sets the viewer's time zone, and `CalendarLocalizationProvider` sets the locale, the text direction and your translator for every kit component below them.

```tsx
<CalendarProvider timeZone={timeZone}>
  <CalendarLocalizationProvider locale="tr-TR" direction="ltr" t={translate}>
    <CalendarScreen />
  </CalendarLocalizationProvider>
</CalendarProvider>
```

Without the providers the defaults are `UTC`, `en-US`, the direction of the locale and the built-in English text. Any component prop overrides the providers for that component. See [Internationalization](i18n.md).

## Import paths

Import from the package root, or from a component's own entry when you want the smallest bundle. Both shapes drop the JavaScript of components you do not import; only the subpath also keeps the other families' CSS out of your bundle, so import family subpaths for CSS tree-shaking.

```ts
import { WeekGrid } from "@gears-frontx/calendar-kit";
import { WeekGrid } from "@gears-frontx/calendar-kit/week-grid";
```

Entries: `core`, `react`, `i18n`, `grid`, `week-grid`, `day-grid`, `month-grid`, `agenda-view`, `calendar-toolbar`, `event-card`, `event-detail-panel`, `create-event`, `conflict-indicator`, `availability-grid`, `calendar-side-panel`, `month-navigator`, `search-results`, `time-zone-list`, `world-clocks`, `calendar-list`. Anything else, including files under `src/` or `dist/chunks/`, is private and blocked by the package's `exports` map.
