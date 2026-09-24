# @gears-frontx/calendar-kit

The calendar UI shared by Constructor products: week, day, month and agenda views, the event card and detail, the create-event form, availability painting, and the side-panel tools around them.

The kit renders what the host gives it and reports what the user did. It never fetches, saves or decides anything about scheduling: data, permissions, conflicts, language and persistence stay with your app.

- **Stack:** React 19 + CSS Modules, over the `@gears-frontx/ui-kit` primitives it wraps
- **Self-contained styles:** the package ships compiled CSS; no CSS framework, preprocessor or build plugin
- **Theming:** `--cal-*` tokens mapped from upstream seams, plus an opt-in scoped reset
- **Text:** every generated string has a stable `calendar.*` id with English text; you supply the translator
- **Accessibility:** WCAG 2.1 AA target, axe-checked over every component state

## Install

```bash
npm install @gears-frontx/calendar-kit
```

`react` and `react-dom` 19 are peer dependencies. `@gears-frontx/ui-kit` is a regular dependency and installs with the kit: import calendar-kit styles only, never ui-kit's.

## Styles

Import the tokens once, in your entry module:

```ts
import "@gears-frontx/calendar-kit/theme.css";
```

`theme.css` maps the `--cal-*` tokens from upstream seams (`--surface`, `--foreground`, `--primary`, `--font-sans`, …) with kit fallbacks, so a host that defines none of them gets the neutral default palette. Add the in-house preset for the OneCloud look:

```ts
import "@gears-frontx/calendar-kit/themes/onecloud.css";
```

`reset.css` is optional and scoped: it applies only inside an element carrying `data-calendar-kit-reset` or the `calendar-kit-reset` class, so it cannot leak into the rest of the page.

Component stylesheets are not imported separately. Each component entry carries its own CSS, which arrives with the component.

## Usage

```tsx
import {
  CalendarLocalizationProvider,
  CalendarProvider,
  WeekGrid,
  parseIanaTimeZone,
  type CalendarTranslate,
} from "@gears-frontx/calendar-kit";

const viewerZone = parseIanaTimeZone("Europe/Istanbul");
const translate: CalendarTranslate = (id, values) =>
  i18n.t(`calendar:${id}`, values);

export const Week = ({ date, events }: WeekProps) => (
  <CalendarProvider timeZone={viewerZone}>
    <CalendarLocalizationProvider locale="en-US" t={translate}>
      <WeekGrid
        date={date}
        events={events}
        onEventSelect={(event, _context, anchor) => openDetail(event, anchor)}
        onQuickCreate={({ range, anchorRect }) => openCreate(range, anchorRect)}
      />
    </CalendarLocalizationProvider>
  </CalendarProvider>
);
```

`CalendarProvider` sets the viewer time zone; `CalendarLocalizationProvider` sets `locale`, `direction`, `t`, `messages` and `onMissingTranslation`. Everything below inherits both, and a prop on a component wins for that component alone. Without them the defaults are `UTC`, `en-US`, the direction of the locale and the built-in English text; see [Internationalization](dist/docs/i18n.md).

The callbacks report intent and change nothing: `onEventSelect`'s third argument is the activated card, which an `EventDetailPanel` takes as `anchorElement`, and `onQuickCreate` hands you the range to create in. Wire them to a panel and a create popover and you have a calendar screen — the [complete calendar screen recipe](dist/docs/recipes.md#a-complete-calendar-screen) is the full version.

## Import paths

```ts
import { WeekGrid } from "@gears-frontx/calendar-kit";
import { WeekGrid } from "@gears-frontx/calendar-kit/week-grid";
```

Entries: `core`, `react`, `i18n`, `grid`, `week-grid`, `day-grid`, `month-grid`, `agenda-view`, `calendar-toolbar`, `event-card`, `event-detail-panel`, `create-event`, `conflict-indicator`, `availability-grid`, `calendar-side-panel`, `month-navigator`, `search-results`, `time-zone-list`, `world-clocks`, `calendar-list`.

Both shapes drop the JavaScript of components you do not import. CSS is different: a family's stylesheet reaches your bundle through the chunk that imports it, and the root entry re-exports every family, so a root import keeps all of their CSS reachable. **Import family subpaths for CSS tree-shaking** when stylesheet weight matters — `@gears-frontx/calendar-kit/week-grid` pulls that family's CSS and no other.

Anything else is private: `src/`, `dist/chunks/`, and the `core/*`, `react/*`, `ui/*`, `i18n/*`, `docs/*`, `__test-utils__/*` subpaths are blocked by the package's `exports` map.

## Documentation

Start at the [documentation index](dist/docs/index.md): getting started, concepts, architecture, customization, internationalization, theming, headless use, recipes, testing, troubleshooting and accessibility, the message catalog, and one reference page per component.

The same pages ship in the package under `dist/docs/`. `llms.txt` is an index for language models and `dist/llms-full.txt` is every page in one file.

## Development

```bash
npm run build --workspace=@gears-frontx/calendar-kit       # dist/: one entry per component, the CSS and the docs
npm run type-check --workspace=@gears-frontx/calendar-kit  # source and build scripts
npm run test:unit --workspace=@gears-frontx/calendar-kit
npm run test:dist --workspace=@gears-frontx/calendar-kit   # builds, then imports every published entry
npm run test:demo --workspace=@gears-frontx/calendar-kit
npm run docs:check --workspace=@gears-frontx/calendar-kit  # props, message and example regions are current
npm run demo --workspace=@gears-frontx/calendar-kit        # builds the kit, then serves the sandbox in demo/
```

Contributor notes that do not belong in the consumer docs: [docs/primitives.md](https://github.com/constructorfabric/gears-frontx/blob/develop/packages/calendar-kit/docs/primitives.md) for the private ui-kit wrappers and [docs/style-modules.md](https://github.com/constructorfabric/gears-frontx/blob/develop/packages/calendar-kit/docs/style-modules.md) for the CSS shared between components.

## Accessibility and browser support

WCAG 2.1 AA is the target: full keyboard operation, `role="grid"` surfaces with a full label per cell, polite live-region announcements, always-visible focus, forced-colors and reduced-motion support. The package's automated accessibility tests run axe over every component state; [Accessibility](dist/docs/accessibility.md) lists what the host still owns.

The package is ESM-only and ships no legacy build. It needs a modern evergreen browser: `<dialog>`, `ResizeObserver`, `Intl.Locale` (with a script-based fallback where text info is missing) and CSS `:has()`, custom properties and logical properties.

## License

Apache-2.0. See [LICENSE](LICENSE) and the third-party attributions in [NOTICE](NOTICE).
