# DataGrid

A server-driven data grid: a `DataGrid` that renders rows through the kit's
`Table`, a `load(ctx)` callback that fetches them, a slot-based layout around
the table, and plugins that add behavior (paging, search, sorting, a custom
empty state) by registering into those slots and hooking the load. Each concern
(load, layout, table, storage, persistence) is a service with its own store, and
a plugin reaches all of them through one context object.

Built-in plugins: pagination, text search, order and empty state, each its own
entry (see below).

## When to use

- A list backed by an API that pages, searches and sorts on the server, where
  the page, the query and the order must survive a reload or live in the URL.
- A list whose behavior you want to extend by composition: each feature is a
  child component of `DataGrid`, and you can write your own the same way
  (see "Custom plugins").

## When not to use

- Static, already-loaded rows with at most client-side sorting and paging -
  use `DataTable`.
- Plain tabular markup you will drive yourself - use `Table`.

## Imports and entries

The grid is split in entries so a grid that uses no plugin ships none of their
code or CSS:

| Entry | Exports |
|-------|---------|
| `@gears-frontx/ui-kit/data-grid` | `DataGrid`, `createDataGridPlugin`, `useDataGrid`, `useDataGridPluginContext`, `useDataGridRecord`, `useDataGridActiveView`, `DATA_GRID_VIEW`, and the types |
| `@gears-frontx/ui-kit/data-grid/pagination` | `DataGridPaginationPlugin` |
| `@gears-frontx/ui-kit/data-grid/text-search` | `DataGridTextSearchPlugin` |
| `@gears-frontx/ui-kit/data-grid/order` | `DataGridOrderPlugin`, `createDataGridOrderOption` |
| `@gears-frontx/ui-kit/data-grid/empty-state` | `DataGridEmptyStatePlugin` |

The package root re-exports all of them, so
`import { DataGrid, DataGridPaginationPlugin } from '@gears-frontx/ui-kit'`
works too; a bundler that honors `sideEffects` keeps only what is used. The core
entry never imports a plugin. The core and every plugin entry carry `'use client'`,
so a Server Component can import and render them; props that are functions
(`load`, a column's `render`) have to come from a Client Component.

## Quick start

```tsx
import {
  DataGrid,
  DataGridOrderPlugin,
  DataGridPaginationPlugin,
  DataGridTextSearchPlugin,
  type DataGridLoadContext,
  type DataGridTableColumn,
} from '@gears-frontx/ui-kit';

interface User {
  id: number;
  name: string;
  email: string;
}

async function loadUsers({ pagination, filters, order, signal }: DataGridLoadContext) {
  const response = await fetchUsers({
    page: pagination?.page ?? 1,
    limit: pagination?.limit ?? 12,
    search: filters?.textSearch?.value,
    sort: order?.[0],
    signal,
  });

  return { results: response.users, total: response.total };
}

const columns: DataGridTableColumn<User>[] = [
  { id: 'name', label: 'Name' },
  { id: 'email', label: 'Email' },
];

function UsersPage() {
  return (
    <DataGrid<User> name="users" load={loadUsers} columns={columns} persistent="localStorage">
      <DataGridTextSearchPlugin />
      <DataGridOrderPlugin />
      <DataGridPaginationPlugin defaultLimit={12} limits={[12, 24, 48]} />
    </DataGrid>
  );
}
```

`columns` and `implicitFilterKeys` must keep their identity between renders (a
module-level constant, or `useMemo`): a new array each render is read as a
change and recomputes the grid's derived state. The built-in plugins compare
their own array props by content, so an inline `limits` or `options` is fine; a
plugin you write compares by reference unless you give it `propsAreEqual`.

## The `load` contract

`DataGrid` calls `load` once on mount and again whenever a plugin asks for a
reload (a page change, a search, a sort). It hands it a `DataGridLoadContext`, which the
plugins fill in, and expects a `DataGridLoadResult`.

| `DataGridLoadContext` field | Set by | Shape |
|---------------------|--------|-------|
| `pagination` | pagination plugin | `{ page: number; limit: number }`, page is 1-based |
| `filters` | text search plugin, and any plugin that registers one | `Record<string, { value, ... }>` keyed by filter key; text search writes `filters.textSearch` |
| `order` | order plugin | `{ column: string; direction: 'asc' \| 'desc' }[]`, absent when nothing is sorted |
| `signal` | the grid | an `AbortSignal`, aborted when a refresh replaces the load or the grid unmounts |

`DataGridLoadResult` is `{ results: TItem[]; total?: number }`. `total` is what the pager
counts; leave it out and the pager shows one page. A result without `results` is a
failed load, not an empty grid.

A plugin is not wired to your backend: it contributes to the context, and your
`load` has to read it (`filters.textSearch?.value`, `order?.[0]`).

If the first load fails, the grid shows an error view in place of itself and
logs the error to the console in development. It has no retry and a failed first
load stays failed; a failed later load has no UI of its own. Handle failures you
want shown inside `load`.

## Columns

Each entry of `columns` is a `DataGridTableColumn`, or a `DataGridTableGroup` holding columns
under a spanning header cell.

| Field | Type | Notes |
|-------|------|-------|
| `id` | `string` | Required, **snake_case** (`user_name`). Checked when the columns arrive and throws otherwise: ids travel into plugins, storage and analytics. |
| `key` | `string` | The item field to show. Defaults to `id`; a dotted path (`owner.name`) reads nested values. |
| `label` | `string \| () => string` | Header text. A function is called on every render, for a label that changes with locale. |
| `render` | `(item) => ReactNode \| ReactNode` | Cell content. Wins over `component` and `key`. |
| `component` | `ComponentType<{ item, column, value }>` | Cell component. |
| `formatter` | `(value) => string` | Formats the value when neither `render` nor `component` is set. |
| `headerComponent` | `ComponentType<{ column }>` | Replaces the header label (for example a select-all checkbox). |
| `width` | `number \| string \| 'min-content'` | See "Choosing column widths". |
| `minWidth`, `maxWidth` | `number` | Pixels. Independent floor and cap under `tableLayout="auto"`. |
| `headerOverflow` | `'nowrap' \| 'wrap'` | Default `'nowrap'`: one line, clipped with an ellipsis, the label in `title`. |
| `cellOverflow` | `'wrap' \| 'nowrap'` | Default `'wrap'`. `'nowrap'` clips with an ellipsis and sets `title` to the value. |
| `sticky` | `boolean` | Pins the column to the inline-start edge while the table scrolls sideways. |
| `visible` | `boolean` | Initial visibility. |
| `visibleToggleDisabled` | `boolean` | The column's visibility is not the user's to change. |
| `getClassName` | `(item) => string \| undefined` | A class for the column's cell in that row. |
| `type` | `'string' \| 'number' \| 'date'` | Declared on the type; nothing in the grid reads it yet (the order plugin's option `type` is what names the directions). |
| `groupId` | `string` | Set by the grid on columns inside a `DataGridTableGroup`; do not set it. |

A `DataGridTableGroup` is `{ id, label, columns, component?, visible?, sticky? }`; a
group's `sticky` pins all its columns. Pin a group as a whole or none of its
columns: a column pinned or unpinned on its own inside a group moves in the body
but not under the group's header, so the header labels stop matching their
columns (see "Known limitations").

Pass a component to a column as its own module-level component, not an inline
function: an inline component is a new component on every render and loses its
state.

### `tableLayout`

`'fixed'` (the default) shares one weighted track between the columns, computed
from the header row, so content never changes an already-rendered column's width.
`'auto'` sizes columns to their content, with `minWidth` and `maxWidth` as
independent floor and cap. This is the table's CSS `table-layout`, unrelated to
the slot layout below.

In both modes the table never shrinks below its content's natural width
(`min-inline-size: max-content`), so a grid with many columns scrolls sideways
rather than squeezing every column; the floor is adjustable (see "CSS
customization").

Under `'fixed'` the three width props collapse into one track: a lone `width`,
`minWidth` or `maxWidth` is the track, and combining them logs a development-only
warning (`width` wins). Under `'auto'`, if every column has a `width` or
`maxWidth` and the container is wider than their sum, the browser grows them all
past their caps and capped columns show trailing blank space; leave at least one
column unconstrained to absorb the slack (a development-only warning says so).

### Choosing column widths

1. Start from `tableLayout="fixed"`: it fills the container and keeps widths
   stable when the page content changes.
2. Classify each column. Long variable text (titles, descriptions) should grow.
   Bounded variable content (dates, statuses, ids) has a known range. Fixed-shape
   content (action buttons, avatars, checkboxes) is always the same width. Names
   look like long text but behave like bounded content.
3. Give long text no `width` so it absorbs the slack, bounded content a pixel
   `width` sized to its widest value plus padding, and fixed-shape content
   `width: 'min-content'` when the header defines the width (a pixel `width` when
   the body is wider than the header).
4. Route the slack on purpose. Under `'fixed'` a track holds only while at least
   one column stays flexible; give every column a `width` and they all stretch in
   proportion. Several long-text columns share the slack evenly when none has a
   `width`. Extra columns a plugin adds with no width are flexible too.
5. A flexible column in a narrow container can collapse to a word per line; a
   definite track (a `width`, or a lone `minWidth`) gives it a floor while the
   table scrolls around it. If the grid only starves in a narrow pane, raise the
   table's floor with `--data-grid-table-min-inline-size` and leave the columns
   alone.
6. Bodies default to `'wrap'` and headers to `'nowrap'`. Do not truncate
   identifier or code columns: they must stay readable and copyable in full.
7. Reach for `tableLayout="auto"` only when a grid must shrink to its content or
   needs caps `'fixed'` cannot express.

Give peer columns of one type (two date columns) one identical width, so one does
not wrap while its twin does.

### `stickyHeader`

`stickyHeader` pins the header row to the top of the grid's scroll area while the
rows scroll under it, with the cells on an opaque fill. Pinned columns keep
working, and the corner cells stick on both axes. With column groups both header
rows stay pinned.

It only takes effect when the surrounding layout bounds the grid's height, so
that the grid scrolls internally: every ancestor between an element with a
definite height and the grid must be a flex column that may shrink. On a grid
that grows to its content the header scrolls away with the rows.

```css
.grid-host {
  display: flex;
  flex: 1 1 0;
  flex-direction: column;
  min-block-size: 0;
}
```

The header fill is `--card`; set `--data-grid-header-background` to change it.

## Loading

While a load is in flight the grid is dimmed behind a scrim with a spinner
centered over it. The rows stay on screen underneath, so the grid keeps its shape
and scroll position, but they read as stale. The scrim covers the grid's own
regions - toolbar, rows and pagination - and takes the pointer events over them.
The first load is the exception: there is nothing to cover yet, so the grid shows
a centered spinner in its place.

The scrim and the spinner fade in after a short delay, so a load that settles
quickly shows nothing, and the content region carries `aria-busy="true"` while
either is on screen. The block is pointer-only: the covered controls stay in the tab
order and activatable from the keyboard.

Loads that only add to the grid (and so do not replace what you are looking at)
leave it alone.

### `loading`

Use `loading` for work the grid never reloads for, such as a bulk copy started
elsewhere:

```tsx
<DataGrid name="terms" load={loadTerms} columns={columns} loading={isCopying} />
```

Hold the flag on the screen that renders the grid rather than inside the thing
that started the work, so the overlay survives that thing going away. It is OR-ed
with the grid's own loads, and there is no imperative equivalent.

## Empty state

A grid with no records shows a centered `Empty` instead of the table: "No results
found", with a "Try adjusting your search or filters" line when a filter is
applied (`hasActiveFilters`). To replace it, use `DataGridEmptyStatePlugin`.

### `implicitFilterKeys`

`hasActiveFilters` counts every filter key in the load context, including filters
the grid always sends on its own (a tenant or team taken from outside it). List
those keys to keep them out of the count, so an empty grid reaches its unfiltered
empty state:

```tsx
const IMPLICIT_KEYS = ['teamId'];

<DataGrid name="users" load={loadUsers} columns={columns} implicitFilterKeys={IMPLICIT_KEYS} />;
```

Only for filters with no control in the grid to clear them: a key the user can
clear belongs nowhere near this list, or they are stranded on an unfiltered empty
state with a filter still applied. The array must be referentially stable.

## Layout slots

The grid lays itself out in named slots, and plugins register components into
them with `registerSlot(name, { id, component, order? })`:

| Slot | Where |
|------|-------|
| `top-start` | Left of the toolbar (search, filters) |
| `top` | The whole toolbar row, replacing the two halves when its `active` option is set |
| `top-end` | Right of the toolbar (order button, actions) |
| `main` | The primary content: the table view is the default one |
| `bottom` | The footer (pagination); hidden while the grid has no records |
| `empty` | Replaces the built-in empty state |

With two or more `main` views (for example the table and a cards view) the grid
adds a view switch to `top-end` by itself. Read or set the active view with
`useDataGridActiveView()` and `DATA_GRID_VIEW`:

```tsx
const view = useDataGridActiveView(); // 'table_layout' | 'cards_layout' | undefined
grid.setActiveSlotId('main', DATA_GRID_VIEW.cards);
```

The `main` slot is hidden when the grid is empty and nothing is filtered, which is
why the empty state has a slot of its own.

## Persistence

`persistent` chooses where grid state (page and limit, search, order, and the
state of plugins that register any) is kept:

| Value | Where |
|-------|-------|
| `'localStorage'` (default) | Survives sessions |
| `'sessionStorage'` | Cleared when the tab closes |
| `'router'` | The URL query: `history.replaceState` on the current path, one query key per state |
| `'memory'` | Within one mount; a remount or reload starts clean |

Storage keys are `dataGrid:${name}:${key}`, with a JSON value, so a grid's `name`
is its identity: two grids with the same name on one page share state. A stored
value is user-editable (devtools, the address bar), so a value that is not valid
JSON reads as absent, and plugins narrow what they read.

Router mode writes the URL directly with bare keys, shared by every grid on the
page, and does not listen for `popstate`; a plugin can opt a state out of it
(`registerPersistentState(key, { router: false })`) or send one state to another
backend (`{ storage: 'localStorage' }`).

`persistentColumnVisibility` remembers which columns the user showed or hid, in
`localStorage` whatever `persistent` says. The grid ships no control that changes
it; a plugin of your own calls `updateColumnVisibility`.

## Plugins

Plugins are children of `DataGrid`. They render nothing themselves: each one
registers its UI into a slot and its behavior into the load, once, when it mounts.

### `DataGridPaginationPlugin`

Draws a pager in the `bottom` slot and fills `DataGridLoadContext.pagination`.

| Prop | Type | Default |
|------|------|---------|
| `defaultLimit` | `number` | `12` |
| `limits` | `number[]` | `[12, 24, 48, 96]`; the page-size selector appears with more than one |
| `autoHide` | `boolean` | `false`; hides the pager when everything fits the smallest limit |

A page change updates the page, stores it and reloads. A limit change goes back to
page 1, stores the limit and reloads. A refresh resets the page to 1. The page
count comes from `total`. The loading treatment is the grid's, not the pager's.

### `DataGridTextSearchPlugin`

Draws a search box in `top-start` and contributes the query to the load as
`filters[filterKey] = { value }` (default key `textSearch`); your `load` reads it.

| Prop | Type | Default |
|------|------|---------|
| `filterKey` | `string` | `'textSearch'` |
| `placeholder` | `string` | `Search...` |
| `fullWidth` | `boolean` | `false`; stretches across the free `top-start` space |

Typing shows at once and reloads 300 ms after the user stops. The clear button
cancels a pending reload, reloads immediately with no query, and keeps focus in
the field. A refresh that resets filters empties the box. Its API
(`getPlugin<DataGridTextSearchPluginApi>('textSearch')`) offers `useQuery`,
`usePlaceholder`, `useFullWidth`, `setSearch` (immediate) and `updateSearch`
(debounced).

### `DataGridOrderPlugin`

Header sorting plus an optional toolbar button; fills `DataGridLoadContext.order`.

| Prop | Type | Notes |
|------|------|-------|
| `options` | `DataGridOrderOption[]` | `createDataGridOrderOption({ id, label, type? })`. With options the toolbar button appears in `top-end`; `type` (`'string'`, `'number'`, `'date'`) names the directions A-Z, 0-9 or Oldest first. |
| `excludedColumns` | `string[]` | No header sort control for these. A column in both `excludedColumns` and `options` is sortable from the button only. |
| `defaultOrder` | `{ id, direction }` | Applies when nothing usable is stored. It seeds an order, it does not keep governing one. |
| `popover` | `{ minInlineSize }` | Sizes the button's popover. |

A header label is a button: the first click sorts descending, the second
ascending, the third clears the sort (and keeps `defaultOrder` suppressed on
later visits). The sorted column shows a direction icon that advances the same
cycle. The toolbar button changes the column and the direction, and never clears.
The order is stored; one whose column is orderable nowhere (excluded and not
offered) is withheld rather than deleted, so it returns if the column is offered
again.

The plugin compares `options` and `excludedColumns` by content, so an inline
array does not count as a change.

### `DataGridEmptyStatePlugin`

Renders your component in place of the built-in empty state, whenever the grid has
no records (it sits outside `main`, so it also renders for an empty grid with no
filters). Read `hasActiveFilters` from `useDataGrid()` inside it to tell "nothing
here yet" from "nothing matched".

```tsx
function UsersEmptyState() {
  const { useStore } = useDataGrid();
  const hasActiveFilters = useStore((s) => s.hasActiveFilters);

  return (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>{hasActiveFilters ? 'No matching users' : 'No users yet'}</EmptyTitle>
      </EmptyHeader>
    </Empty>
  );
}

<DataGrid name="users" load={loadUsers} columns={columns} implicitFilterKeys={IMPLICIT_KEYS}>
  <DataGridEmptyStatePlugin component={UsersEmptyState} />
</DataGrid>;
```

## Custom plugins

`createDataGridPlugin(name, setup, propsAreEqual?)` returns a component to use as
a child of `DataGrid`. `setup` runs once, when it first mounts, with the plugin
context, and returns the plugin's API; the optional third argument is the
comparison `React.memo` uses for the props.

```tsx
import { createDataGridPlugin, useDataGrid, type DataGridPluginApi } from '@gears-frontx/ui-kit';
import { create } from 'zustand';

interface StatusApi extends DataGridPluginApi {
  useStatus: () => string;
  setStatus: (status: string) => void;
}

function StatusFilter() {
  const grid = useDataGrid();
  const status = grid.getPlugin<StatusApi>('status')!;
  return <Select value={status.useStatus()} onValueChange={status.setStatus} /* ... */ />;
}

export const StatusPlugin = createDataGridPlugin<DataGridItem, 'status', Record<string, never>, StatusApi>(
  'status',
  (context) => {
    const useStore = create(() => ({ status: '' }));
    const persistent = context.registerPersistentState<{ status?: unknown }>('status');

    // Storage is user-editable: narrow what you read.
    const stored = persistent.value?.status;
    if (typeof stored === 'string') useStore.setState({ status: stored });

    context.registerSlot('top-start', { id: 'status', component: StatusFilter });

    context.hook('load:context', () => {
      const { status } = useStore.getState();
      return status ? { filters: { status: { value: status } } } : undefined;
    });

    return {
      useStatus: () => useStore((s) => s.status),
      setStatus(status) {
        useStore.setState({ status });
        persistent.setValue(status ? { status } : undefined);
        context.triggerLoad();
      },
    };
  },
);
```

### The plugin context

| Area | Members |
|------|---------|
| Plugins | `hook(name, handler)`, `getPlugin<Api>(name)` |
| Layout | `registerSlot(name, options)`, `setActiveSlotId(name, id)`, `getActiveSlotId(name)` |
| Table | `registerTableSlot(name, options)` (`subheader`, `footer`, `header-cell-end`), `registerExtraColumn(options)`, `updateExtraColumnWidth` / `Order` / `Sticky`, `registerComponent(name, component)` (override `row`, `header-cell-label`, `body-cell-content` or `content`), `updateColumns`, `updateColumnVisibility`, `updateColumnSticky`, `updateTableLayout`, `updateStickyHeader` |
| Persistent state | `registerPersistentState(key, options?)` |
| Storage | `useStore(selector)` (`visibleRecords`, `rootSections`, `hasActiveFilters`, ...), `createSection`, `clearSections`, `getRecord`, `getItemId`, ... |
| Load | `triggerLoad(config?)`, `refresh(options?)`, `abort()`, `getLoadInstances()`, `useLoadStateStore` |

### Lifecycle hooks

| Hook | When |
|------|------|
| `init`, `destroy` | The grid mounts, and unmounts (release observers, timers and subscriptions here) |
| `load:prepare` | Before a load starts |
| `load:context` | Return a partial `DataGridLoadContext` to merge into this load: `pagination`, `filters`, `order` |
| `load:process` | Return a replacement `DataGridLoadResult` before it is stored |
| `load:store` | After the result is stored; read `instance.processResult.total`. Return `true` to claim the storing |
| `load:success`, `load:error` | The load settled |
| `refresh` | `refresh()` was called; the options say whether filters reset |

### Conventions

- `registerSlot`, `registerTableSlot` and `registerExtraColumn` append: call them
  in `setup`, not in `onPropsChange`, which runs on every props change.
- `onPropsChange(props)` mirrors props into stores. Gate each optional prop with
  `!== undefined` when you collect updates, or the guard is always true.
- Call `triggerLoad()` or `refresh()` from user actions, not from a global store
  `subscribe`, which fires during initialization and adds loads on top of the
  first. `triggerLoad` queues a load; `refresh` aborts the one in flight first.
- Functions that build plugin infrastructure but are not React hooks do not use
  the `use` prefix.
- Do not import from another plugin's internals; share a utility through the
  grid's services.

## Hooks

| Hook | Returns |
|------|---------|
| `useDataGrid<TItem>()` | The grid instance, inside a `DataGrid`: `getPlugin`, `useStore`, `triggerLoad`, `refresh`, `setActiveSlotId`, ... |
| `useDataGridPluginContext<TItem>()` | The plugin context above, for a component that needs it directly |
| `useDataGridRecord<TItem>()` | The record of the row being rendered, inside a cell or row component |
| `useDataGridActiveView()` | The id of the active `main` view |

## CSS customization

Set these on the grid or any ancestor:

| Variable | Default | Description |
|----------|---------|-------------|
| `--data-grid-table-min-inline-size` | `max-content` | Floor for the table's width. Raise it for a narrow pane that starves flexible columns, set it to `0` for a grid that must fit its wrapper. |
| `--data-grid-header-background` | `var(--card)` | Fill of the header cells while `stickyHeader` is on |
| `--data-grid-text-search-inline-size` | `initial` | Width of the search box; a fixed value stops it shifting as the clear button appears |

The floor is one constraint among several: under `'fixed'` a table whose columns
declare widths cannot shrink below their sum, and under either mode not below the
columns' minimum content widths.

## Accessibility

- The header label of an orderable column is a native `button` named "Change
  sorting of '<column>' column"; Enter and Space sort. There is no `aria-sort`.
- The table's scroll container is a tab stop (it holds `tabIndex=0` so a keyboard
  can scroll it).
- The pager is a `nav` named "Pagination"; the page buttons are named "Go to page
  N" and carry `aria-current="page"` on the current one.
- `aria-busy` is set on the content region while a loader is on screen.
- The order popover's items are menu items without a menu popup, so they take
  focus and Enter and Space, but arrow keys do not move between them.
- Strings are English and live in one module; the kit has no i18n layer yet.

## Known limitations

- Data loading has no stale-response guard: `triggerLoad` neither aborts the load
  in flight nor ignores a late result, so when two loads overlap (two quick page
  clicks, a page-size change, a refresh over a page change) the older result can
  replace the newer one. A `load` that ignores `signal` is not protected even by
  the abort `refresh()` sends. `refresh()` also defaults to `resetFilters: true`.
- Changing the page size from a later page fires two loads.
- A failed first load has no retry; a failed refetch has no UI, and when search or
  sort started it, the failure also reaches the host as an unhandled rejection.
- A search still waiting out its debounce when the grid unmounts is flushed: its
  refresh runs after the grid is gone, and its load's `signal` is not aborted.
- The loading overlay blocks the pointer only, not the keyboard.
- No `aria-sort`; Previous and Next drop keyboard focus at the ends of the range.
- Renderer overrides (`registerComponent`) are last registered wins.
- `registerComponent` accepts `'header-cell'` and `'header-group'`, but the header
  always renders its own cell and group components, so those two overrides have no
  effect.
- A column pinned on its own inside a group, or a pinned group with one column
  unpinned, moves in the body but not under the group's header, so the header
  labels sit over the wrong columns. Pin a group as a whole.
- Router persistence shares bare keys across grids and does not follow `popstate`;
  it also drops `history.state` and the `#hash` when it writes the URL, and it does
  not work during server rendering.
- A new `columns` array identity resets user pins and visibility.
- There is no plugin unregister.

## Anti-patterns

- Do not define a column's cell component inline in `render`: it is a new
  component each render.
- Do not leave `columns`, `options` or `excludedColumns` as inline literals that
  change identity every render.
- Do not use `camelCase` column ids; they must be snake_case.
- Do not put a key that the user can clear in `implicitFilterKeys`.
- Do not reach into the grid's markup from a consumer stylesheet; use the CSS
  variables above.
- Do not trigger loads from a store `subscribe` in a plugin.
