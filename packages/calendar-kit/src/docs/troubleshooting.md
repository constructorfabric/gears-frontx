# Troubleshooting and tips

## Looks wrong

### Everything is violet and grey

Only `theme.css` is loaded, so every token uses its neutral default. Import `themes/onecloud.css` or map the seams to your design tokens; see [Theming](../styles/theming.md).

### Dark mode only half works; popovers stay light

The dark tokens resolve on the element that carries `data-theme="dark"`, and on `:root` or `:host`. Overlays (popovers, dialogs, the create form) do not render inside the component that opened them: inside a shadow root they portal to the root itself, otherwise next to their trigger or into `document.body`. If `data-theme` sits on an inner element, overlays miss it. Put it on `<html>` or on the shadow host, or pass `container` pointing inside the themed element.

### The page resets or fonts change after importing `reset.css`

They should not: `reset.css` only applies inside `[data-calendar-kit-reset]` or `.calendar-kit-reset`. If nothing changes at all, add one of those to the calendar root.

### The grid is very tall, or never scrolls

`WeekGrid` and `DayGrid` scroll their hour rows inside the height their parent gives them. In a parent without a definite height they grow to show every row. Give the parent a height (a sized flex column, or a fixed height) to get an internal scroller that opens at the working hours.

### My styles stopped working after an upgrade

You probably targeted a CSS Module class like `.week-grid_cell__a1b2`. Those names are private and change. Use `className`, the part classes (`cellClassName` and friends), the documented `data-*` attributes, or theme tokens; see [Customization](customization.md#5-classes-and-dom-hooks).

## Wrong dates or times

### An all-day event shows one day short

All-day `endDate` is **exclusive**. A single-day event on 24 September has `startDate: "2026-09-24"` and `endDate: "2026-09-25"`. If your API stores an inclusive end, add a day with `addCalendarDays(end, 1)` when mapping.

### Timed events are off by a few hours

A timed event is placed by its `start`/`end` instants and labelled in the viewer's `timeZone`. Check that the instants are real UTC (built with `fromViewerDateTime` in the event's zone, not by appending `Z` to a local time), and that the viewer zone is set on the component or provider; the default is `UTC`.

### "Today" is wrong in tests or screenshots

Pass `now` to the components that show today and the now line. `DayGrid` and `AgendaView` follow the system clock, so fake it in tests.

### `RangeError: Invalid calendar date` (or local time, instant, time zone)

The parse helpers validate their input. Validate where data enters your app, so the error names the bad record rather than a component deep in the tree.

### `RangeError` about visible hours

`visibleHours` must start and end on a slot boundary: with `slotMinutes={30}`, `08:15` is rejected. Use `08:00` or `08:30`.

## Interactions

### Clicking an event does nothing

The event is `available: false` or `access: "busy"`, which makes it inert on purpose. Otherwise, check that `onEventSelect` is passed.

### Dragging an event does nothing, or it snaps back

Moves only happen in `interactionMode="paint-and-move"`, and they wait for the host. Call `request.confirm()` after saving, then pass the updated `events`. `request.cancel()` snaps the event back. If you call neither, the move stays pending.

### Selection jumps back

You passed a controlled value (`selectedEventId`, `activeView`, `selectedDate`…) without updating it in the change callback. A controlled component shows exactly what you pass.

### The detail opens as a big dialog instead of a popover next to the card

Pass `anchorElement`: the third argument of `onEventSelect`.

### The create form closes when I return an error

It stays open for any returned `{ error }`. If it closes, `onSubmit` resolved to `undefined` or `{ eventId }`.

## Text

### I see English inside a translated screen

Your translator returned the id, an empty string or nothing for that message, so the kit fell back to English. Find the id in the [message catalog](messages.md) and add it to your dictionary. `onMissingTranslation` only fires for ids English cannot fill.

### I see "Translation unavailable"

Something asked the kit translator for an id the kit does not define and no layer had text for it, for example a custom slot calling `useCalendarLocalization()` with its own key. Add that id to your translator or `translations`.

## Tips

- **Keep `events` stable.** Build the array in state or `useMemo`; a new array each render re-runs layout.
- **Filter before, not after.** Hidden calendars, search and permissions are host decisions; pass only the events the user should see.
- **Type `metadata` once** with `CalendarEvent<MyMetadata>` and the component generic (`WeekGrid<MyMetadata>`).
- **Use the root providers** for zone, locale, direction and translator, and override per component only when a component really differs.
- **Prefer slots over wrappers.** Wrapping a kit component to restyle it with descendant selectors breaks on the next release; a slot or token does not.
- **Leave callbacks out to disable features** rather than hiding buttons with CSS; the kit also removes them from the accessibility tree.
