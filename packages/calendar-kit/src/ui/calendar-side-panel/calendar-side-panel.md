# CalendarSidePanel

`CalendarSidePanel` provides a controlled or uncontrolled full-height panel shell with one visible open/close toggle. It is closed by default, exposes the panel id through `aria-controls`, and restores focus to the collapse control when its opening focus origin is no longer connected.

```tsx
<CalendarSidePanel
  id="calendar-side-panel"
  events={events}
  calendars={calendars}
  selectedDate={selectedDate}
  selectedTimeZoneId={selectedTimeZoneId}
  onSelectedTimeZoneIdChange={setSelectedTimeZoneId}
  worldClockTimeZoneIds={worldClockTimeZoneIds}
  onWorldClockTimeZoneIdsChange={setWorldClockTimeZoneIds}
  hiddenCalendarIds={hiddenCalendarIds}
  onHiddenCalendarIdsChange={setHiddenCalendarIds}
  onRevealEvent={onRevealEvent}
  onClose={onClose}
  t={t}
  locale="en-US"
  timeZone={timeZone}
  direction="ltr"
/>
```

Use `slots` to supply or rearrange the header, search field, body, month navigator, time-zone list, world clocks, calendar list, and search results. The shell does not load directories, persist preferences, or create calendars; consumers own those boundaries.

The panel composes its own search field, scroll container and decorative dividers. Its 329px width and below-48rem overlay treatment are CSS-module implementation details, not public theme tokens; no static inline style is required.

## Props

<!-- generated:props CalendarSidePanelProps -->

| Prop | Type | Required | Description |
| --- | --- | --- | --- |
| `calendars` | `readonly CalendarRef[]` | yes | Calendars for the calendar list. |
| `events` | `readonly CalendarEvent[]` | yes | Events for the navigator dots and search. |
| `hiddenCalendarIds` | `readonly string[]` | yes | Ids of hidden calendars. |
| `id` | `string` | yes | Id of the panel element, referenced by the toggle's `aria-controls`. |
| `onClose` | `() => void` | yes | Called when the panel closes. |
| `onHiddenCalendarIdsChange` | `(hiddenCalendarIds: readonly string[]) => void` | yes | Called after a calendar is toggled. |
| `onRevealEvent` | `(eventId: string, date: CalendarDate) => void` | yes | A search result was activated. |
| `onSelectedTimeZoneIdChange` | `(timeZoneId: IanaTimeZone \| null) => void` | yes | Called when the comparison zone changes. |
| `onWorldClockTimeZoneIdsChange` | `(timeZoneIds: readonly IanaTimeZone[]) => void` | yes | Called after a world clock is added, removed or moved. |
| `selectedDate` | `CalendarDate` | yes | Day the navigator selects. |
| `selectedTimeZoneId` | `IanaTimeZone \| null` | yes | Comparison zone selected in the time-zone list. |
| `worldClockTimeZoneIds` | `readonly IanaTimeZone[]` | yes | Ordered world-clock zones. |
| `className` | `string` |  | Class added to the component root. |
| `defaultOpen` | `boolean` |  | Initial open state when uncontrolled. Default closed. |
| `defaultQuery` | `string` |  | Initial search query when uncontrolled. |
| `onOpenChange` | `(open: boolean) => void` |  | Called when the toggle opens or closes the panel. |
| `onQueryChange` | `(query: string) => void` |  | Called when the search query changes. |
| `open` | `boolean` |  | Controlled open state. |
| `query` | `string` |  | Controlled search query. |
| `slots` | `CalendarSidePanelSlots` |  | Replacements for individual sections. |

Also accepts the shared props `direction`, `locale`, `messages`, `t`, `timeZone`, `translations`; see [Internationalization](../../docs/i18n.md#per-component-overrides).
<!-- /generated -->

## Messages

Translate these ids, or override them with `translations`; see [Internationalization](../../docs/i18n.md).

<!-- generated:messages calendar.panel -->

| Translation ID                       | English                    | Values  |
| ------------------------------------ | -------------------------- | ------- |
| `calendar.panel.calendars`           | Calendars                  |         |
| `calendar.panel.clearSearch`         | Clear search               |         |
| `calendar.panel.collapse`            | Collapse panel             |         |
| `calendar.panel.createCalendar`      | Create calendar            |         |
| `calendar.panel.dayHasEvents`        | has events                 |         |
| `calendar.panel.expand`              | Expand panel               |         |
| `calendar.panel.label`               | Calendar side panel        |         |
| `calendar.panel.monthGrid`           | Month                      |         |
| `calendar.panel.monthNavigator`      | Month navigator            |         |
| `calendar.panel.search`              | Search                     |         |
| `calendar.panel.searchCount_one`     | {{count}} result           | `count` |
| `calendar.panel.searchCount_other`   | {{count}} results          | `count` |
| `calendar.panel.searchLabel`         | Search events              |         |
| `calendar.panel.searchResults`       | Search results             |         |
| `calendar.panel.searchTooShort`      | Type at least 2 characters |         |
| `calendar.panel.timeZones`           | Time zones                 |         |
| `calendar.panel.worldClocks`         | World clocks               |         |
| `calendar.panel.worldClocksAdd`      | Add clock                  |         |
| `calendar.panel.worldClocksDone`     | Done                       |         |
| `calendar.panel.worldClocksEdit`     | Edit                       |         |
| `calendar.panel.worldClocksMoveDown` | Move down                  |         |
| `calendar.panel.worldClocksMoveUp`   | Move up                    |         |
| `calendar.panel.worldClocksRemove`   | Remove clock               |         |

<!-- /generated -->

## Related

- [MonthNavigator](../month-navigator/month-navigator.md)
- [SearchResults](../search-results/search-results.md)
- [TimeZoneList](../time-zone-list/time-zone-list.md)
- [WorldClocks](../world-clocks/world-clocks.md)
- [CalendarList](../calendar-list/calendar-list.md)
- [Customization](../../docs/customization.md)
- [Recipes](../../docs/recipes.md)
