# CalendarList

`CalendarList` renders a controlled calendar visibility legend. Every calendar is rendered independently of loaded events, including an empty calendar, and its checkbox is checked when its id is absent from `hiddenCalendarIds`. An empty collection keeps the ordinary section without an empty-state shell or status region.

```tsx
<CalendarList
  calendars={calendars}
  hiddenCalendarIds={hiddenCalendarIds}
  onHiddenCalendarIdsChange={setHiddenCalendarIds}
  t={t}
  direction="ltr"
/>
```

Use `renderCalendar` to replace a row's visible content, `renderCreateCalendar` to supply a consumer-owned creation action, or `onCreateCalendar` for the default labelled button. The kit never creates or persists calendars.

Rows pair a label with a checkbox. The three contract colour families are carried by local accent classes; an unknown family falls back to the default action colour without inventing a token. Static row styling lives in this module's CSS rather than inline styles.

## Props

<!-- generated:props CalendarListProps -->

| Prop | Type | Required | Description |
| --- | --- | --- | --- |
| `calendars` | `readonly CalendarRef[]` | yes | Calendars to list. |
| `hiddenCalendarIds` | `readonly string[]` | yes | Ids of calendars whose checkbox is off. |
| `onHiddenCalendarIdsChange` | `(hiddenCalendarIds: readonly string[]) => void` | yes | Called with the new hidden ids after a toggle. |
| `className` | `string` |  | Class added to the component root. |
| `onCreateCalendar` | `() => void` |  | Shows a default create button that calls this. |
| `renderCalendar` | `(calendar: CalendarRef, hidden: boolean) => ReactNode` |  | Replaces a row's content. |
| `renderCreateCalendar` | `() => ReactNode` |  | Replaces the create button. |

Also accepts the shared props `direction`, `locale`, `messages`, `t`, `timeZone`, `translations`; see [Internationalization](../../docs/i18n.md#per-component-overrides).
<!-- /generated -->

## Messages

Translate these ids, or override them with `translations`; see [Internationalization](../../docs/i18n.md).

<!-- generated:messages calendar.list -->

| Translation ID              | English      | Values |
| --------------------------- | ------------ | ------ |
| `calendar.list.add`         | Add          |        |
| `calendar.list.moreOptions` | More options |        |

<!-- /generated -->

## Related

- [CalendarSidePanel](../calendar-side-panel/calendar-side-panel.md)
- [Customization](../../docs/customization.md)
- [Recipes](../../docs/recipes.md)
