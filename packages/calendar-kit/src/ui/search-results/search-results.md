# SearchResults

`SearchResults` is a neutral, local search surface for supplied calendar events. It never fetches data or performs navigation: the host supplies events and receives the selected event and viewer date through `onReveal`.

```tsx
import { SearchResults } from "@gears-frontx/calendar-kit/search-results";

<SearchResults
  events={events}
  query={query}
  now={now}
  locale="en-US"
  timeZone={timeZone}
  direction="ltr"
  t={t}
  onReveal={(eventId, date) => revealEvent(eventId, date)}
  onDismiss={() => setQuery("")}
/>;
```

## Props

<!-- generated:props SearchResultsProps -->

| Prop | Type | Required | Description |
| --- | --- | --- | --- |
| `events` | `readonly CalendarEvent[]` | yes | Events to search. |
| `now` | `UtcInstant` | yes | Reference instant for the Today group. |
| `onDismiss` | `() => void` | yes | Escape was pressed on a result. |
| `onReveal` | `(eventId: string, date: CalendarDate) => void` | yes | A result was activated. Receives the event id and the viewer day of the row. |
| `className` | `string` |  | Class added to the component root. |
| `defaultQuery` | `string` |  | Initial query when uncontrolled. |
| `onQueryChange` | `(query: string) => void` |  | Called when the query changes. |
| `query` | `string` |  | Controlled query. |
| `renderGroupHeader` | `(group: string, count: number) => ReactNode` |  | Replaces a day heading. |
| `renderResult` | `(event: CalendarEvent, context: SearchResultContext) => ReactNode` |  | Replaces a row's content. |

Also accepts the shared props `direction`, `locale`, `messages`, `t`, `timeZone`, `translations`; see [Internationalization](../../docs/i18n.md#per-component-overrides).
<!-- /generated -->

## Query and announcements

Queries are trimmed, lowercased, and diacritic-folded before matching the event title, organizer, and location. Results require two characters and settle after 200 ms; the previous result set remains visible while a new query is pending. The result list is always rendered, and contains no rows for a too-short query or when no event matches. The result count remains a separate polite, atomic status announcement. Fetching and failure presentation remain host concerns.

Timed events are grouped by viewer day, including midnight-spanning segments; all-day events appear on each date in their exclusive-end range.

The result list uses one roving tab stop. Arrow Up/Down, Home, and End move focus; Enter or Space calls `onReveal`, and Escape calls `onDismiss`. Result rows are native buttons laid out as list rows and expose only the public `data-event-id` hook; all other styling state is expressed through CSS Modules.

## Related

- [CalendarSidePanel](../calendar-side-panel/calendar-side-panel.md)
- [Customization](../../docs/customization.md)
- [Recipes](../../docs/recipes.md)
