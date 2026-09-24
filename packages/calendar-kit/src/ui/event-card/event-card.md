# EventCard

Default event presentation for calendar grids: title, time range, model-backed metadata, conflict list, and the selected / past / unavailable / read-only states. Timed cards use the event family's tinted surface, stronger leading bar, and foreground title before their optional metadata rows. The card is one interactive surface rendered as a native button, so click, Enter, and Space all select through one code path.

Import it from its own entry; the stylesheet arrives with the component:

```tsx
import { EventCard } from "@gears-frontx/calendar-kit/event-card";

<EventCard
  event={event}
  locale="en-US"
  timeZone={viewerTimeZone}
  direction="ltr"
  t={t}
  onSelect={(selectedEvent) => openDetails(selectedEvent.id)}
/>;
```

## Props

<!-- generated:props EventCardProps -->

| Prop | Type | Required | Description |
| --- | --- | --- | --- |
| `event` | `CalendarEvent<Payload>` | yes | The event to show. |
| `aria-colspan` | `number` |  | Set by the owning grid for spanning all-day events. |
| `aria-rowindex` | `number` |  | Set by the owning grid. |
| `available` | `boolean` |  | Override for `event.available`. |
| `className` | `string` |  | Class added to the component root. |
| `conflicts` | `readonly CalendarConflict[]` |  | Conflicts to show. Default `event.conflicts`. |
| `data-color-family` | `string` |  | Set by the owning grid for host CSS. |
| `data-continues-after` | `"true"` |  | Marks a segment that continues to the next day. |
| `data-continues-before` | `"true"` |  | Marks a segment that continues from the previous day. |
| `geometry` | `CalendarEventGeometry` |  | Placement and size. The height also picks the card's density tier. |
| `onKeyDown` | `CalendarEventKeyDownHandler<Payload>` |  | Called before the card's own Enter/Space handling. |
| `onSelect` | `(event: CalendarEvent<Payload>, context: CalendarEventRenderContext<Payload>, anchor: HTM…` |  | `anchor` is the card element, so a host can open a preview beside it. |
| `past` | `boolean` |  | Past state: muted surface, named in the accessible description. |
| `positioned` | `boolean` |  | Apply `geometry` inline; `false` when a host wrapper positions the card. Default `true`. |
| `readOnly` | `boolean` |  | Read-only state, named in the accessible description. The card stays selectable. |
| `renderConflict` | `(conflict: CalendarConflict, context: CalendarEventRenderContext<Payload>) => ReactNode` |  | Replaces how each conflict renders. |
| `renderMetadata` | `(context: CalendarEventRenderContext<Payload>) => ReactNode` |  | Replaces the location, organizer and type rows. Never hidden by compact density. |
| `renderTime` | `(context: CalendarEventRenderContext<Payload>) => ReactNode` |  | Replaces the time row, clock icon included. |
| `renderTitle` | `(context: CalendarEventRenderContext<Payload>) => ReactNode` |  | Replaces the title. |
| `segment` | `CalendarEventSegment` |  | The day segment the grid laid out. Derived from the event when omitted. |
| `selected` | `boolean` |  | Selected state, exposed as `aria-pressed`. |
| `style` | `CSSProperties` |  | Extra inline styles on the card root. |
| `tabIndex` | `number` |  | Roving tab index set by the owning grid. |

Also accepts the shared props `direction`, `locale`, `messages`, `t`, `timeZone`, `translations`; see [Internationalization](../../docs/i18n.md#per-component-overrides).
<!-- /generated -->

## Render context

Every render slot receives the pinned `CalendarEventRenderContext<Payload>`: `event`, `segment`, `geometry?`, `isSelected`, `isPast`, `isAvailable`, `isReadOnly`, `conflicts`.

## States and CSS hooks

The card root carries the public `data-event-id` hook and accepts a consumer `className`. Color and state modifier classes are CSS-Module implementation details, not public DOM hooks.

- `data-event-id` — always present, so existing `[data-event-id]` selectors keep matching.
- `data-event-card-layout` — geometry-driven presentation tier: `full`, `stacked`, `single`, or `title`.
- `aria-disabled="true"` — hard-pinned for unavailable events and `access: 'busy'` events; such cards are not actionable by any gesture.
- `aria-pressed` — selection state for assistive technology (`"true"` while selected).
- `aria-describedby` — set whenever `past` or `readOnly` holds, pointing at a visually-hidden element inside the card whose text is the translated `calendar.eventCard.past` and/or `calendar.eventCard.readOnly` string(s), joined by a space. This is the contracted accessible-description observable: past and read-only are named in the **description**, not the name.

Unavailable and busy events are disabled but stay in the tab order, so they remain keyboard-focusable while clicks and activation are suppressed; their state stays observable through `aria-disabled`.

## Accessibility

- Each card renders as one native button, providing the role, focusability, and click semantics.
- The accessible name carries the event title; an empty title falls back to the translated `calendar.eventCard.unnamed` string so the name is never empty.
- A non-repeated Enter/Space activation calls `preventDefault()` so the native button activation does not double-fire the selection.
- Past and read-only states are exposed through the accessible description (`aria-describedby` → visually-hidden translated marker), keeping them observable to screen readers without polluting the event's name.
- Decorative time, metadata, and recurrence icons use `aria-hidden="true"`.
- Focus ring: `:focus-visible` outline driven by `--cal-focus-ring-width` / `--cal-color-focus-ring`; the card suppresses any inset focus ring so the outline is the single focus indicator.

## Styling

Token-only CSS Module: every value resolves through a `--cal-*` alias from `@gears-frontx/calendar-kit/theme.css`. The 3px leading color-bar width is fixed implementation geometry owned by this module (not a theme token).

Past cards use the existing muted surface and muted foreground tokens with a solid border. All-day cards use their color-family tint as a flat band and remove the card border. Timed metadata rows use the existing metadata typography and icon-size tokens. Short cards use a two-row title/time stack, a one-line title/time strip, or a title-only strip according to their geometry; default metadata is hidden in those compact tiers while a consumer `renderMetadata` slot is never hidden by this density treatment. Layout resolution applies the same 24px effective compact floor used by the card's one-line treatment, so a short host slot still retains its time row. The `data-event-card-compact` hook remains derived from the raw supplied `geometry.height` (`<110px`) for compatibility; the card does not require a ResizeObserver or imperatively measure its rendered box.

Transitions use `--cal-motion-duration-short`, which the theme zeroes under reduced motion; forced-colors mode is handled by the theme's token remap.

## Messages

Translate these ids, or override them with `translations`; see [Internationalization](../../docs/i18n.md).

<!-- generated:messages calendar.eventCard -->

| Translation ID                | English    | Values |
| ----------------------------- | ---------- | ------ |
| `calendar.eventCard.allDay`   | All day    |        |
| `calendar.eventCard.past`     | Past       |        |
| `calendar.eventCard.readOnly` | Read only  |        |
| `calendar.eventCard.unnamed`  | (untitled) |        |

<!-- /generated -->

## Related

- [ConflictIndicator](../conflict-indicator/conflict-indicator.md)
- [WeekGrid](../week-grid/week-grid.md)
- [Customization](../../docs/customization.md)
- [Recipes](../../docs/recipes.md)
