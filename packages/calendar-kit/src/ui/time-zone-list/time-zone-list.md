# TimeZoneList

A controlled list of comparison time zones. The host supplies the offered IDs, reference labels, and the instant used to calculate every displayed offset.

```tsx
import { TimeZoneList } from "@gears-frontx/calendar-kit/time-zone-list";

<TimeZoneList
  options={timeZoneOptions}
  referenceInstant={referenceInstant}
  selectedTimeZoneId={comparisonTimeZoneId}
  onSelectionChange={setComparisonTimeZoneId}
  direction="ltr"
  t={t}
/>;
```

## Props

<!-- generated:props TimeZoneListProps -->

| Prop | Type | Required | Description |
| --- | --- | --- | --- |
| `onSelectionChange` | `(timeZoneId: IanaTimeZone \| null) => void` | yes | Called with the pressed zone, or `null` when the selected row is pressed again. |
| `options` | `readonly CalendarTimeZoneOption[]` | yes | Zones to offer, with host labels. Invalid ids are skipped. |
| `referenceInstant` | `UtcInstant` | yes | Instant every offset is computed at. |
| `className` | `string` |  | Class added to the component root. |
| `defaultSelectedTimeZoneId` | `IanaTimeZone` |  | Initial selected zone when uncontrolled. |
| `renderOption` | `(option: CalendarTimeZoneOption, offset: string, selected: boolean) => ReactNode` |  | Replaces a row's content. |
| `selectedTimeZoneId` | `IanaTimeZone` |  | Controlled selected zone. |

Also accepts the shared props `direction`, `locale`, `messages`, `t`, `timeZone`, `translations`; see [Internationalization](../../docs/i18n.md#per-component-overrides).
<!-- /generated -->

## Messages

Translate these ids, or override them with `translations`; see [Internationalization](../../docs/i18n.md).

<!-- generated:messages calendar.timeZone -->

| Translation ID | English | Values |
| --- | --- | --- |
| `calendar.timeZone.cityGroup.berlinBratislavaBelgrade` | Berlin, Bratislava, Belgrade |  |
| `calendar.timeZone.cityGroup.londonLisbonParis` | London, Lisbon, Paris |  |
| `calendar.timeZone.cityGroup.newYorkTorontoHavana` | New York, Toronto, Havana |  |
| `calendar.timeZone.cityGroup.singaporeKualaLumpurManila` | Singapore, Kuala Lumpur, Manila |  |

<!-- /generated -->

## Related

- [WorldClocks](../world-clocks/world-clocks.md)
- [EventDetailPanel](../event-detail-panel/event-detail-panel.md)
- [Customization](../../docs/customization.md)
- [Recipes](../../docs/recipes.md)
