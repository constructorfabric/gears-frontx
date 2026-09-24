# Testing

How to test a screen that uses the kit, and what the kit already tests so you don't have to.

## Set up jsdom

The components run in jsdom with two small stubs, because jsdom does not implement these browser APIs:

```ts
// vitest.setup.ts
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Painting and drag-to-move listen for pointer events; jsdom has no PointerEvent.
globalThis.PointerEvent ??= class extends MouseEvent {
  readonly pointerId: number;
  readonly pointerType: string;

  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 0;
    this.pointerType = init.pointerType ?? "";
  }
} as typeof PointerEvent;
```

Popovers, selects and the grids that measure themselves construct a `ResizeObserver` on mount, so without the stub they throw.

## Freeze time

Pass `now` to every component that shows today, the now line or past styling (`WeekGrid`, `MonthGrid`, `MonthNavigator`, `SearchResults`, `WorldClocks`, `CreateEventPopover`). Without it they follow the wall clock and your snapshots change every minute.

`DayGrid` and `AgendaView` have no `now` prop; freeze the clock for them with `vi.useFakeTimers()` and `vi.setSystemTime(...)`.

```tsx
const NOW = utcInstant("2026-09-23T09:00:00.000Z");

render(
  <WeekGrid
    date={calendarDate("2026-09-23")}
    events={events}
    now={NOW}
    timeZone={UTC}
  />
);
```

## Query like a user

The kit exposes roles and accessible names, so tests can avoid class names entirely:

```ts
screen.getByRole("grid");
screen.getByRole("button", { name: /stand-up/i }); // an event
screen.getByRole("radio", { name: "Month" }); // a toolbar view
screen.getByRole("dialog", { name: "Create event" });
```

`[data-event-id="…"]` is a stable hook when a role query is not specific enough.

## Assert callbacks, not DOM changes

Components change nothing on their own, so the useful assertion is what they asked for:

```ts
const onMoveRequest = vi.fn();
render(<WeekGrid interactionMode="paint-and-move" onMoveRequest={onMoveRequest} {...props} />);
// …drag…
expect(onMoveRequest).toHaveBeenCalledWith(expect.objectContaining({ to: expect.objectContaining({ startTime: "14:00" }) }));
```

## What jsdom cannot tell you

jsdom has no layout engine: every element measures zero. The month grid computes how many events fit from the measured cell height, so in jsdom pass `monthData={{ densityCap: 3, overflowByDate: {} }}` to get a deterministic overflow count. Anything about pixel positions, heights or scrolling needs a real browser (Playwright, Storybook test runner).

## What the kit already covers

The kit's own suite (about 1,200 tests) covers time-zone and daylight-saving math, event segmentation and layout, keyboard models, focus return, translation resolution and every component's callbacks. Host tests should cover your mapping into `CalendarEvent`, your callbacks, and your slots.

## Running the kit's checks

| Command | Checks |
| --- | --- |
| `npm run test:unit` | Unit and component tests (Vitest, jsdom) |
| `npm run test:dist` | Builds the package and imports every published entry |
| `npm run test:demo` | The demo's translation contract |
| `npm run test:a11y` | axe checks for every component state |
| `npm run type-check`, `type-check:test`, `type-check:demo` | Source, tests, and the demo and recipes against the published types |
| `npx eslint packages/calendar-kit --max-warnings 0` (from the repo root) | Root ESLint; the package defines no lint or format scripts |
| `npm run docs:check` | Generated doc tables and examples match the source |
