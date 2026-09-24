# calendar-kit demo

A sandbox that uses the **built** package the way an installed dependency would. Every import is `@gears-frontx/calendar-kit` or one of its documented subpaths, resolved through the `exports` map to `dist/`; nothing reaches into `src/` and there are no path aliases. `demo/` is not in the package `files`, so it never ships.

## Run

```sh
npm run demo
```

`demo` builds the kit first, then serves the sandbox with Vite at the local URL it prints. After a rebuild a plain reload picks up the new `dist/`.

| Script | Does |
| --- | --- |
| `demo:build`, `demo:preview` | Production-build the sandbox into `demo/dist` and serve it |
| `type-check:demo` | Type-check the sandbox and `examples/recipes/` against the emitted types |
| `test:demo` | `tests/translation-contract.test.ts`: the demo's translation table uses only canonical ids and declared placeholders |

## Layout

- `main.tsx` imports `theme.css`, owns the Theme (light, dark, system) and Direction (LTR, RTL) switches, holds the shared sample data and a small host translation table, and lazy-loads one screen.
- `examples/week-grid.tsx`: the three interaction modes, 5- and 7-day widths, loading, empty and error states, a custom `renderEvent`, and the create and detail shells.
- `examples/calendar-suite.tsx`: day, week, month and agenda under one `CalendarToolbar`, plus the paintable `AvailabilityGrid`.
- `examples/sidebar-suite.tsx`: `CalendarSidePanel` and each side-panel widget on its own.
- `examples/recipes/`: the compiled examples embedded in [Recipes](../src/docs/recipes.md).

Theme sets `data-theme` on `<html>` (`system` removes it). Direction sets `dir` on `<html>` and is also passed to each component. Sample data is a fixed week in March 2026, so the same conflicts and overflow appear on every load; only world clocks and search follow the real clock. The screens import both from the package root and from subpaths, so both entry shapes are exercised.
