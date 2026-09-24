# ConflictIndicator

Dimension-labelled conflict primitive: renders every supplied conflict with its raw `dimension` string and the host-localised `label`, so a clash is always named after what it clashes on (program/section, instructor, student, classroom, or any consumer dimension).

Import it from its own entry; the stylesheet arrives with the component:

```tsx
import { ConflictIndicator } from "@gears-frontx/calendar-kit/conflict-indicator";

<ConflictIndicator conflicts={conflicts} direction="ltr" t={t} />;
```

## Props

<!-- generated:props ConflictIndicatorProps -->

| Prop | Type | Required | Description |
| --- | --- | --- | --- |
| `conflicts` | `readonly CalendarConflict[]` | yes | Conflicts to show. An empty list renders nothing. |
| `className` | `string` |  | Class added to the component root. |
| `compact` | `boolean` |  | One coloured marker per conflict, with the text in its accessible name only. |
| `renderConflict` | `(conflict: CalendarConflict) => ReactNode` |  | Replaces how each conflict renders; wins over `compact`. |

Also accepts the shared props `direction`, `locale`, `messages`, `t`, `timeZone`, `translations`; see [Internationalization](../../docs/i18n.md#per-component-overrides).
<!-- /generated -->

## Rendering rules

- Default rendering shows **both** the raw `dimension` string and the host-supplied `label` for every conflict in normal mode.
- Compact mode renders one marker per conflict (a small pill painted with `--cal-color-conflict`, or `--cal-color-warning` for warnings) and no visible text at all; the marker's `aria-label` still names the dimension and the label, so nothing is lost to assistive technology.
- Unknown dimension strings pass through untouched — the kit never invents or whitelists labels.
- `conflict.severity` selects the warning or error paint (`warning` / `error`); errors paint with `--cal-color-conflict`, warnings with `--cal-color-warning`, and conflicts without severity keep the muted default.
- Long labels truncate with an ellipsis and expose the full text through a `title` attribute (normal mode).

## Accessibility

Conflicts are a semantic `<ul>`/`<li>` list, so screen readers announce each named clash as list content inside whatever labelled region hosts the indicator (an EventCard's accessible subtree, a detail panel, …). In compact mode each marker carries an `aria-label` of `<dimension>: <label>`. Severity selects the warning or conflict token; the class names that carry it are private.

## Styling

Token-only CSS Module: every value resolves through a `--cal-*` alias from `@gears-frontx/calendar-kit/theme.css` (`--cal-text-meta-*` typography, `--cal-space-1` rhythm, `--cal-color-muted/-subtle/-warning/-conflict` paints, `--cal-icon-size-xs` / `--cal-radius-pill` for the compact marker). No fixed geometry of its own.

## Related

- [EventCard](../event-card/event-card.md)
- [Customization](../../docs/customization.md)
- [Recipes](../../docs/recipes.md)
