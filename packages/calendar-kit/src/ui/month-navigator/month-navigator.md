# MonthNavigator

Mini month navigator for side panels: a labelled month grid with weekday headers, previous/next month buttons, event dots, outside-month dimming, and full roving-keyboard navigation. It is a neutral controlled/uncontrolled component — dates, events, locale, zone and translation are all injected.

Import it from its own entry; the stylesheet arrives with the component:

```tsx
import { MonthNavigator } from "@gears-frontx/calendar-kit/month-navigator";

<MonthNavigator
  selectedDate={selectedDate}
  events={events}
  timeZone={viewerTimeZone}
  locale="en-US"
  direction="ltr"
  t={t}
  now={now}
  onSelectDate={(date) => setSelectedDate(date)}
/>;
```

## Props

<!-- generated:props MonthNavigatorProps -->

| Prop | Type | Required | Description |
| --- | --- | --- | --- |
| `events` | `readonly CalendarEvent[]` | yes | Events used to put a dot on each day they touch. |
| `onSelectDate` | `(date: CalendarDate) => void` | yes | Called on click, Enter and Space, even for the selected day. |
| `className` | `string` |  | Class added to the component root. |
| `defaultSelectedDate` | `CalendarDate` |  | Initial selected day when uncontrolled. Default today. |
| `now` | `UtcInstant` |  | Reference instant for today. Omit to follow the wall clock. |
| `renderDay` | `(date: CalendarDate, hasEvents: boolean) => ReactNode` |  | Replaces the day number. |
| `renderHeader` | `(date: CalendarDate) => ReactNode` |  | Replaces the month title. Receives the first day of the visible month. |
| `selectedDate` | `CalendarDate` |  | Controlled selected day. Changing it moves the visible month. |

Also accepts the shared props `direction`, `locale`, `messages`, `t`, `timeZone`, `translations`; see [Internationalization](../../docs/i18n.md#per-component-overrides).
<!-- /generated -->

## Behaviour

- **Weeks** render Sunday-first (US convention), unlike the main month grid's Monday-start rows; outside-month days stay in the grid, dimmed, and remain selectable.
- **Month stepping** — the previous/next buttons and `PageUp`/`PageDown` share one rule: move the visible month by one and land focus on the selected date's day-of-month in the target month, clamped to its length.
- **Keyboard**: arrows move by day (up/down by a week), `Home`/`End` jump to the focused week's edges, Enter and Space select. Focus moves across month boundaries are deferred until the month that owns the new date has rendered.
- **Selection follow**: a controlled `selectedDate` change from anywhere (e.g. the main calendar) resets the visible month and focus to it.

## States and CSS hooks

State is expressed through class names merged with `clsx` (no `data-*` state attributes): the selected day gets the slot-selected paint plus an inset ring, outside-month days are dimmed, and the event dot is a 4px pseudo-element under the day number so two-digit dates stay centred. The only public DOM hooks are the root `className` and standard roles/names.

## Accessibility

- The section is a labelled region; the grid uses `role="grid"` / `row` / `columnheader` / `gridcell` with a full-date accessible name per cell (`"Monday, August 24, 2026"`), extended with the translated `calendar.panel.dayHasEvents` marker when the day has events.
- Roving `tabIndex`: exactly one cell (the focused day) is tab-reachable.
- Previous/next month are ghost-style icon-only buttons labelled `calendar.monthNavigator.previousMonth` and `calendar.monthNavigator.nextMonth`.
- Focus ring: `:focus-visible` outline driven by `--cal-focus-ring-width` / `--cal-color-focus-ring`; forced-colors mode remaps the selection ring and the event dot.

## Styling

Token-only CSS Module: every value resolves through a `--cal-*` alias from `@gears-frontx/calendar-kit/theme.css`. Cell height uses `--cal-control-height-md`; transitions use `--cal-motion-duration-short`, which the theme zeroes under reduced motion. Direction uses logical properties only, so `direction="rtl"` needs no JS.

## Messages

Translate these ids, or override them with `translations`; see [Internationalization](../../docs/i18n.md).

<!-- generated:messages calendar.monthNavigator -->

| Translation ID                          | English        | Values |
| --------------------------------------- | -------------- | ------ |
| `calendar.monthNavigator.nextMonth`     | Next month     |        |
| `calendar.monthNavigator.previousMonth` | Previous month |        |

<!-- /generated -->

## Related

- [CalendarSidePanel](../calendar-side-panel/calendar-side-panel.md)
- [MonthGrid](../month-grid/month-grid.md)
- [Customization](../../docs/customization.md)
- [Recipes](../../docs/recipes.md)
