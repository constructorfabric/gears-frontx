# WorldClocks

A controlled list of world clocks. The host owns persistence and supplies both the ordered selected IDs and the offered directory; the component owns only its transient edit mode.

```tsx
import { WorldClocks } from "@gears-frontx/calendar-kit/world-clocks";

<WorldClocks
  timeZoneIds={worldClockTimeZoneIds}
  availableTimeZoneIds={offeredTimeZoneIds}
  onChange={setWorldClockTimeZoneIds}
  direction="ltr"
  t={t}
/>;
```

## Props

<!-- generated:props WorldClocksProps -->

| Prop | Type | Required | Description |
| --- | --- | --- | --- |
| `availableTimeZoneIds` | `readonly IanaTimeZone[]` | yes | Zones the add picker offers. |
| `onChange` | `(timeZoneIds: readonly IanaTimeZone[]) => void` | yes | Called with the full ordered list after an add, remove or move. |
| `className` | `string` |  | Class added to the component root. |
| `defaultTimeZoneIds` | `readonly IanaTimeZone[]` |  | Initial clock zones when uncontrolled. |
| `now` | `UtcInstant` |  | Pins every clock to one instant. Omit and the clocks tick each minute. |
| `renderClock` | `(clock: CalendarWorldClock) => ReactNode` |  | Replaces a clock row's content. |
| `renderEditor` | `(available: readonly IanaTimeZone[], selected: readonly IanaTimeZone[]) => ReactNode` |  | Replaces the edit controls. |
| `timeZoneIds` | `readonly IanaTimeZone[]` |  | Controlled ordered clock zones. |

Also accepts the shared props `direction`, `locale`, `messages`, `t`, `timeZone`, `translations`; see [Internationalization](../../docs/i18n.md#per-component-overrides).
<!-- /generated -->

## Related

- [TimeZoneList](../time-zone-list/time-zone-list.md)
- [CalendarSidePanel](../calendar-side-panel/calendar-side-panel.md)
- [Customization](../../docs/customization.md)
- [Recipes](../../docs/recipes.md)
