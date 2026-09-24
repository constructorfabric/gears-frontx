# CalendarToolbar

Host-controlled navigation toolbar for a calendar surface: current-period title, Today / previous / next navigation, and an accessible view switcher. The host controls the date and, when supplied, the active view; otherwise view selection is local. Navigation and view changes are always reported through callbacks, and the toolbar never changes the host date.

Import it from its own entry; the stylesheet arrives with the component:

```tsx
import { CalendarToolbar } from "@gears-frontx/calendar-kit/calendar-toolbar";

<CalendarToolbar
  t={t}
  direction="ltr"
  locale="en-US"
  currentDate={date}
  activeView={view}
  onViewChange={setView}
  onToday={goToday}
  onPrevious={goPrevious}
  onNext={goNext}
/>;
```

## Props

<!-- generated:props CalendarToolbarProps -->

| Prop | Type | Required | Description |
| --- | --- | --- | --- |
| `currentDate` | `CalendarDate` | yes | The date the host is showing. The toolbar never changes it. |
| `onNext` | `() => void` | yes | The next button was pressed. |
| `onPrevious` | `() => void` | yes | The previous button was pressed. The host decides what one step is. |
| `onToday` | `() => void` | yes | The Today button was pressed. |
| `onViewChange` | `(view: CalendarView) => void` | yes | Called for every view selection. |
| `activeView` | `CalendarView` |  | Controlled view. Selecting another view only calls `onViewChange`. |
| `availableViews` | `readonly CalendarView[]` |  | Views to offer, in the host's order. Default all four. |
| `className` | `string` |  | Class added to the component root. |
| `defaultActiveView` | `CalendarView` |  | Initial view when uncontrolled. Default `day`. |
| `renderLeading` | `() => ReactNode` |  | Content at the start of the bar. |
| `renderTitle` | `(date: CalendarDate) => ReactNode` |  | Replaces the title text; the heading's accessible name is kept. |
| `renderTrailing` | `() => ReactNode` |  | Content at the end of the bar. |
| `renderViewOption` | `(view: CalendarView, active: boolean) => ReactNode` |  | Replaces one view option's visible content. |

Also accepts the shared props `direction`, `locale`, `messages`, `t`, `timeZone`, `translations`; see [Internationalization](../../docs/i18n.md#per-component-overrides).
<!-- /generated -->

## Rendering rules

- Non-agenda views show the localized long month name plus the numeric year of `currentDate` as a single text run in one style; agenda shows the 30-day window starting at `currentDate` through the translated `calendar.agenda.range` key, switching to `calendar.agenda.rangeCrossYear` when the window crosses a year boundary.
- The previous/next pair is labelled per active view ("Previous week" / "Next week", …) and grouped under a labelled group named after the change it performs ("Change week", …).
- Missing host entries use the resolver's built-in English message; unknown IDs use the safe `Translation unavailable` fallback rather than exposing a raw key.
- The title is derived from the viewer-local date string itself: the public props carry no time zone, so the date is interpreted at midnight UTC and formatted back in UTC — the displayed month/year always matches the supplied date.

## Accessibility

The view switcher follows the APG radio-group pattern: one `radiogroup` with a single tab stop on the checked radio (`tabindex="0"`, all others `-1`). Arrow keys move the selection with focus following — Left/Right and Up/Down all step through the options (wrapping at both ends), Home/End jump to the first/last available option, and the horizontal arrows are mirrored under `direction="rtl"` while vertical movement keeps its meaning. Every other key is left alone. Selection by click or keyboard reports through `onViewChange` and moves focus to the selected radio; controlled updates from the host move focus the same way. The heading's accessible name names the active view and the selected date even when the visible title is replaced by a slot.

## Styling

Every control is a borderless button with no fill or stroke of its own: Today and the view options are 32px tall with 12px inline padding, and the previous/next pair is 36px square with a 16px icon. The checked view segment is painted by this module rather than by a shared button variant: the switcher is a radiogroup, so its options carry `aria-checked`, which those variants do not style.

The remaining layout is a token-only CSS Module: every value resolves through a `--cal-*` alias from `@gears-frontx/calendar-kit/theme.css` (`--cal-text-title-*` for the title, `--cal-space-*` rhythm, `--cal-color-surface/-text/-muted/ -selection/-grid-line`). The bar's 64px minimum height is implementation geometry owned by this module, not a theme token. Forced-colors mode is handled: the checked segment keeps a `Highlight` ring, because author backgrounds are discarded there.

## Messages

Translate these ids, or override them with `translations`; see [Internationalization](../../docs/i18n.md).

<!-- generated:messages calendar.toolbar -->

| Translation ID                     | English               | Values |
| ---------------------------------- | --------------------- | ------ |
| `calendar.toolbar.change.agenda`   | Change agenda view    |        |
| `calendar.toolbar.change.day`      | Change day view       |        |
| `calendar.toolbar.change.month`    | Change month view     |        |
| `calendar.toolbar.change.week`     | Change week view      |        |
| `calendar.toolbar.label`           | Calendar toolbar      |        |
| `calendar.toolbar.next.agenda`     | Next agenda range     |        |
| `calendar.toolbar.next.day`        | Next day              |        |
| `calendar.toolbar.next.month`      | Next month            |        |
| `calendar.toolbar.next.week`       | Next week             |        |
| `calendar.toolbar.previous.agenda` | Previous agenda range |        |
| `calendar.toolbar.previous.day`    | Previous day          |        |
| `calendar.toolbar.previous.month`  | Previous month        |        |
| `calendar.toolbar.previous.week`   | Previous week         |        |
| `calendar.toolbar.selectedDate`    | Selected date         |        |
| `calendar.toolbar.today`           | Today                 |        |
| `calendar.toolbar.view.agenda`     | Agenda                |        |
| `calendar.toolbar.view.day`        | Day                   |        |
| `calendar.toolbar.view.month`      | Month                 |        |
| `calendar.toolbar.view.week`       | Week                  |        |
| `calendar.toolbar.viewLabel`       | View                  |        |
| `calendar.toolbar.viewName.agenda` | Agenda view           |        |
| `calendar.toolbar.viewName.day`    | Day view              |        |
| `calendar.toolbar.viewName.month`  | Month view            |        |
| `calendar.toolbar.viewName.week`   | Week view             |        |

<!-- /generated -->

## Related

- [WeekGrid](../week-grid/week-grid.md)
- [MonthGrid](../month-grid/month-grid.md)
- [Customization](../../docs/customization.md)
- [Recipes](../../docs/recipes.md)
