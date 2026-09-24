# calendar-kit documentation

`@gears-frontx/calendar-kit` is a calendar and scheduling UI for FrontX host applications: week, day, month and agenda views, the event card and detail, the create-event form, and the side-panel tools around them. It renders what the host gives it and reports what the user did. It never fetches, stores or decides anything about scheduling.

## Start here

| If you want to… | Read |
| --- | --- |
| Put a calendar on screen | [Getting started](getting-started.md) |
| Understand events, dates, times and zones | [Concepts](concepts.md) |
| See how data and callbacks move | [Architecture and data flow](architecture.md) |
| Change how something looks or behaves | [Customization](customization.md) |
| Translate the UI or switch language | [Internationalization](i18n.md) |
| Match your design system or dark mode | [Theming](../styles/theming.md) |
| Build your own UI on the kit's logic | [Headless controllers](headless.md) |
| Copy a working pattern | [Recipes](recipes.md) |
| Test a host screen | [Testing](testing.md) |
| Fix something that looks wrong | [Troubleshooting](troubleshooting.md) |
| Know what keyboard and screen readers get | [Accessibility](accessibility.md) |
| Look up a translatable message | [Message catalog](messages.md) |

## Component reference

| Component | Entry | What it is |
| --- | --- | --- |
| [`WeekGrid`](../ui/week-grid/week-grid.md) | `week-grid` | Five- or seven-day time grid with quick-create, painting and drag-to-move |
| [`DayGrid`](../ui/day-grid/day-grid.md) | `day-grid` | One-day time grid |
| [`MonthGrid`](../ui/month-grid/month-grid.md) | `month-grid` | Month of week rows with overflow and date-range picking |
| [`AgendaView`](../ui/agenda-view/agenda-view.md) | `agenda-view` | Thirty days as a grouped list |
| [`CalendarToolbar`](../ui/calendar-toolbar/calendar-toolbar.md) | `calendar-toolbar` | Title, Today, previous/next and the view switcher |
| [`EventCard`](../ui/event-card/event-card.md) | `event-card` | The event surface every view uses by default |
| [`EventDetailPanel`](../ui/event-detail-panel/event-detail-panel.md) | `event-detail-panel` | Event preview popover that expands into a dialog |
| [`CreateEventPopover`](../ui/create-event/create-event.md) | `create-event` | Create-event form with recurrence, people and discard guard |
| [`ConflictIndicator`](../ui/conflict-indicator/conflict-indicator.md) | `conflict-indicator` | Named scheduling conflicts |
| [`AvailabilityGrid`](../ui/availability-grid/availability-grid.md) | `availability-grid` | Paint free time over host availability |
| [`CalendarSidePanel`](../ui/calendar-side-panel/calendar-side-panel.md) | `calendar-side-panel` | Panel shell composing the tools below |
| [`MonthNavigator`](../ui/month-navigator/month-navigator.md) | `month-navigator` | Mini month for picking a day |
| [`SearchResults`](../ui/search-results/search-results.md) | `search-results` | Local event search grouped by day |
| [`TimeZoneList`](../ui/time-zone-list/time-zone-list.md) | `time-zone-list` | Pick a comparison time zone |
| [`WorldClocks`](../ui/world-clocks/world-clocks.md) | `world-clocks` | Editable list of clocks |
| [`CalendarList`](../ui/calendar-list/calendar-list.md) | `calendar-list` | Show or hide calendars |
| [`CalendarGrid`](../ui/grid/calendar-grid.md) | `grid` | The accessible grid primitive the views are built on |

Every component is also exported from the package root.

## For AI assistants

`llms.txt` at the package root is a short index for language models; `llms-full.txt` is every document here concatenated into one file. Both ship in the package.
