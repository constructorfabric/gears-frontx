# Accessibility

The kit targets WCAG 2.1 AA. The package's automated accessibility tests run axe over every component state, and keyboard behaviour is covered by the component tests. What follows is what users get without any work from the host.

## Keyboard

| Surface | Keys |
| --- | --- |
| `WeekGrid`, `DayGrid`, `CalendarGrid` | One tab stop. Arrows move between slots, Home/End to the row ends, Enter/Space activate. Events are buttons: Enter/Space open them |
| `MonthGrid` | Arrows between days, Home/End to the week ends, Enter/Space on an empty day selects it. In `date-range` mode: Enter/Space sets the start, arrows move the end, Enter/Space commits, Escape abandons |
| `AgendaView`, `SearchResults` | One tab stop across the rows; Up/Down, Home, End; Enter/Space open. Escape dismisses search |
| `MonthNavigator` | Arrows by day and week, Home/End, PageUp/PageDown by month, Enter/Space select |
| `CalendarToolbar` | The view switcher is a radio group: arrows move and select, wrapping at the ends, Home/End jump |
| `EventDetailPanel`, `CreateEventPopover` | Focus moves in on open and is trapped while open. Escape closes; a create form with unsaved changes asks before discarding. Focus returns to the element that opened it |
| Date fields in the create form | Type the date segment by segment; Alt+ArrowDown opens the picker |

`direction="rtl"` swaps Left and Right everywhere; Up and Down keep their meaning.

## Screen readers

- Grids use `role="grid"` with row and column headers and a full label per cell (date, time and whether it is working time).
- Events are buttons named by their title; an untitled event is announced as "(untitled)". Past and read-only states are in the accessible description, not the name.
- Unavailable and busy events stay focusable but are marked `aria-disabled`.
- Selection changes, painted ranges, the visible range and result counts are announced through polite live regions.
- Conflicts are a list; in compact mode each marker carries the full "dimension: label" as its name.
- Decorative icons are hidden from assistive technology. The trailing gutter copy is hidden so each hour is announced once.

## Visual

- Focus is always visible, with an outline driven by the focus-ring tokens.
- Forced-colors mode maps surfaces, text, focus and selection to system colours.
- `prefers-reduced-motion` turns every transition off.
- State is never shown by colour alone: selection has a ring, conflicts carry text, past events are muted and described.

## What stays with the host

- Content inside render slots. The kit keeps the button, focus and keyboard handling around a slot, but the slot's own content must be accessible.
- Loading and error states. The kit renders the ordinary surface; announce loading and failures yourself.
- Contrast of your own theme values when you map the seams to your design system.
