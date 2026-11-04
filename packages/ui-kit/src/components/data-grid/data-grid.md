# DataGrid

A server-driven data grid: a `DataGrid` that renders rows through the kit's
`Table`, a `load(ctx)` callback that fetches them, a slot-based layout around
the table, and plugins that add behavior (paging, search, sorting, filters, a
custom empty state) by registering into those slots and hooking the load. Each concern
(load, layout, table, storage, persistence) is a service with its own store, and
a plugin reaches all of them through one context object.

Built-in plugins: pagination, text search, order, filters, empty state, row number, row
click, actions, row actions, an actions menu, table configuration, row select, a table tree
and drag and drop, each its own entry (see below).

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
| `@gears-frontx/ui-kit/data-grid/filters` | `DataGridFiltersPlugin`, the entity factories `filterSearch`, `filterToggle`, `filterCheckboxGroup`, `filterTagGroup`, `filterTree` and `filterDateRange`, `createDataGridTreeStructure` and `useDataGridTreeStructure` (the tree `filterTree` takes), and the types |
| `@gears-frontx/ui-kit/data-grid/empty-state` | `DataGridEmptyStatePlugin` |
| `@gears-frontx/ui-kit/data-grid/row-number` | `DataGridRowNumberPlugin` |
| `@gears-frontx/ui-kit/data-grid/row-click` | `DataGridRowClickPlugin` |
| `@gears-frontx/ui-kit/data-grid/actions` | `DataGridActionsPlugin` |
| `@gears-frontx/ui-kit/data-grid/row-actions` | `DataGridRowActionsPlugin` |
| `@gears-frontx/ui-kit/data-grid/actions-menu` | `DataGridActionsMenuPlugin`, `exportMenuItems` (the menu items that export the rows) and the types |
| `@gears-frontx/ui-kit/data-grid/table-configuration` | `DataGridTableConfigurationPlugin` |
| `@gears-frontx/ui-kit/data-grid/row-select` | `DataGridRowSelectPlugin` |
| `@gears-frontx/ui-kit/data-grid/table-tree` | `DataGridTableTreePlugin` |
| `@gears-frontx/ui-kit/data-grid/drag-drop` | `createDataGridDragDropPlugin` and the types |

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
| `tree` | table tree plugin | `{ parentId }`: `null` for the rows of the grid, a row's id for its children |
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
| `sticky` | `boolean` | Pins the column to the inline-start edge while the table scrolls sideways. The columns a plugin adds before the data (a row number, a selection checkbox) pin with the first pinned column, in front of it, so they stay in view; with nothing pinned they scroll away with the rest. |
| `visible` | `boolean` | Initial visibility. |
| `visibleToggleDisabled` | `boolean` | The column's visibility is not the user's to change. |
| `getClassName` | `(item) => string \| undefined` | A class for the column's cell in that row. |
| `type` | `'string' \| 'number' \| 'date'` | Declared on the type; nothing in the grid reads it yet (the order plugin's option `type` is what names the directions). |
| `groupId` | `string` | Set by the grid on columns inside a `DataGridTableGroup`; do not set it. |

A `DataGridTableGroup` is `{ id, label, columns, component?, visible?, sticky? }`; a
group's `sticky` pins all its columns. Pinning or unpinning a group at run time (the table
configuration plugin does) moves its heading and all its columns together. Pin a group as a
whole or none of its columns: a column pinned or unpinned on its own inside a group moves in
the body but not under the group's header, so the header labels stop matching their columns
(see "Known limitations").

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

### `label`

`label` names the grid for assistive tech, for a page that renders more than
one grid: the table's scroll container becomes a `region` named with it, and
the pagination plugin's pager becomes a `nav` named `<label> pagination`.

```tsx
<DataGrid name="users" label="Users" load={loadUsers} columns={columns}>
  <DataGridPaginationPlugin />
</DataGrid>
```

Without it the pager is the one `nav` named "Pagination" and the table's
scroll container stays roleless, so a single grid on a page needs no label.
Give every grid on a page that holds more than one a distinct label: two grids
sharing one still leave their landmarks indistinguishable. The label is a spoken name, not the storage key `name`
(which identifies a grid's persisted state, and is not readable text), and it
is never persisted.

### `portalContainer`

The popups the grid and its plugins open render in a portal, on `<body>` by
default: the filter popovers and their narrow-screen panel, the All filters
panel, the sort and table configuration popovers, and the actions menu.
`portalContainer` moves them all to another node, the way `container` does on
a kit popup.

Pass it when `<body>` is not where the kit's styles or theme reach: a grid in a
shadow root whose CSS is injected into that root, or a grid under a
`data-theme` container that is not `<html>` or `<body>`. The node takes a
shadow root, an element or a ref.

```tsx
<div data-theme="dark" ref={themedRef}>
  <DataGrid name="users" load={loadUsers} columns={columns} portalContainer={themedRef}>
    <DataGridFiltersPlugin entities={filters} />
  </DataGrid>
</div>
```

A popup that your own component opens inside the grid, such as a row actions
menu, is yours to place: pass it the same node as `container`.

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

The toolbar fits itself to the grid's width. What `top-start` holds flows onto
further lines when it is too wide for one, and `top-end` goes on to a line of its
own, at its end, when it would not fit beside `top-start` on a single line. A
toolbar that fits on one line has everything centred on it.

A slot registered in `top` and made active replaces the toolbar's two halves. While the toolbar
is on one line, the grid gives the slot at least the height the toolbar had and centres what it
holds in that height, so the table under it does not move when the slot takes the toolbar's place
(the row select bar does). A toolbar that has wrapped onto several lines, as a row of quick
filters does on a narrow screen, is not kept: the slot takes its own height and the table moves
up with it.

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
`localStorage` whatever `persistent` says. The table configuration plugin is the
built-in control that changes it; a plugin of your own calls `updateColumnVisibility`.

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
In a container too narrow for one row, the page buttons wrap to a centred line
under the page-size selector and the page text, and below a 640px container the
Previous and Next words collapse to their chevrons. The pager is a size
container, so a parent that shrinks to fit its content collapses it to zero
width (see the containment note in `pagination.md`). A grid with a `label`
names the pager `<label> pagination` (see `label`).

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

### `DataGridFiltersPlugin`

A bar of quick filters in `top-start`, and an "All filters" panel that edits the
same filters in one go. Each active filter reaches your `load` as
`filters[filterKey] = { value }`.

```tsx
import {
  DataGridFiltersPlugin,
  filterCheckboxGroup,
  filterDateRange,
  filterToggle,
} from '@gears-frontx/ui-kit/data-grid/filters';

const ENTITIES = [
  filterToggle({ id: 'only_active', label: 'Only active' }),
  filterCheckboxGroup({
    id: 'role',
    label: 'Role',
    options: [
      { label: 'Admin', value: 'admin' },
      { label: 'Member', value: 'member' },
    ],
  }),
  filterDateRange({ id: 'created_at', label: 'Created' }),
];

async function loadUsers({ filters }: DataGridLoadContext) {
  const roles = filters?.role?.value; // ['admin'], when the Role filter holds a choice
  const range = filters?.created_at?.value; // { from?: '2026-03-01', to?: '2026-03-31' }
  // ...
}

<DataGrid name="users" load={loadUsers} columns={columns}>
  <DataGridFiltersPlugin entities={ENTITIES} />
</DataGrid>;
```

| Prop | Type | Default |
|------|------|---------|
| `entities` | `DataGridFilterEntity[]` | required; keep the array referentially stable (module scope, or `useMemo`) |
| `isAllFiltersOptionVisible` | `boolean` | `true`; the "All filters" chip is drawn when this is on and at least one entity has a panel section |

**Entities.** Each factory returns one filter. They share `id`, `filterKey`
(defaults to `id`: the key your `load` reads) and `label`. With no `label`, the
chip is named after the column whose id equals `id`; an entity with neither a
label nor a matching column throws when it renders. `popover` (`{ minInlineSize,
maxInlineSize? }`, in px) sizes the popover of a filter that has one.

| Factory | Value in `load` | Quick filter | Panel section |
|---------|-----------------|--------------|---------------|
| `filterSearch({ id })` | `{ value: string }` | A text box in a popover, applied 1 s after typing stops | no |
| `filterToggle({ id })` | `{ value: true }` | A chip that switches the filter on and off | no |
| `filterCheckboxGroup({ id, options, search?, searchDebounce? })` | `{ value: (string \| number)[] }` | A popover of checkboxes | yes |
| `filterTagGroup({ id, options, mode?, search? })` | `{ value: (string \| number)[] }` | A popover of selectable tags; `mode: 'radio'` allows one | yes |
| `filterTree({ id, tree, treeLabel, filterValue?, search? })` | `{ value: string \| number }` | A popover with a tree of radios | yes |
| `filterDateRange({ id, modelDateFormat? })` | `{ value: { from?: string, to?: string } }` | A popover with a range calendar | yes |

An option is `{ label, value, component? }`; `component` draws the option in
place of its label. The search box of a checkbox group and a tree shows above 5
options (5 nodes), and of a tag group above 10; `search` forces it on or off.
`filterCheckboxGroup` takes a function for `options` when the list is too long
to load up front: it is called with the trimmed search term, once when the list
opens (with an empty string) and again `searchDebounce` ms (default 300) after
each change of the term, and only the latest answer is shown. A failure shows "No
options found".

**Quick filters** apply at once: each change updates the value, stores it and
reloads from page 1. A chip shows a count when its value is a list, a dot when it
holds any other value, and its popover has a Reset button.

**The "All filters" panel** opens a sheet (from the side from 720 px wide, from the
bottom edge below it) with a section for each entity that has one. Its choices
are a draft: nothing loads until **Apply**, which commits all of them at once.
Leaving the panel without Apply (its close button, Escape, a click outside)
discards the draft, and the next opening starts from what is applied. The count tag in a section's
header clears that section of the draft. The chip's count is the number of active
filters that have a section.

The same width decides how a quick filter opens: as a popover beside its chip,
or as a panel from the bottom edge.

**Active values.** A filter is active unless its value is `undefined`, `null`,
`''` or an empty array, so `false` and `0` are values like any other. Inactive
filters are left out of the load context. (The grid's own `hasActiveFilters`,
which the empty state reads, agrees except for one value: it treats `0` as
inactive.)

**Persistence.** All filters are stored under one key, `dataGrid:${name}:filters`,
as `{ [filterKey]: { value } }`. A refresh that resets filters clears them. The
stored value can be edited by the user, so what the controls show is guarded: a
checkbox group or a tag group reads a stored value that is not a list as no
selection, and a date range reads a bound that is not a date in `modelDateFormat`
as unset. The guards change only what the controls show. Every stored value,
whatever its shape, still reaches `load` as long as it is stored (a list filter's
wrongly shaped value, a date range's, a value for a filter that is no longer in
`entities`), so read `filters` defensively there (check `Array.isArray` before
using a list).

**`filterDateRange`.** The bounds are strings in `modelDateFormat`, which takes
[date-fns format tokens](https://date-fns.org/docs/format) and defaults to
`'yyyy-MM-dd'`: `'dd.MM.yyyy'`, not `'DD.MM.YYYY'`. Either bound may be missing
(`{ from }` means "from then on"). The first click on a day starts a range, the
second ends it (in either order), and a click after that starts a new one.

**`filterTree`.** `tree` is a tree structure, made in the same entry:

```tsx
import { filterTree, useDataGridTreeStructure } from '@gears-frontx/ui-kit/data-grid/filters';

const tree = useDataGridTreeStructure({
  items: departments,
  itemKey: 'id', // the default; a function is allowed
  parentKey: 'parent_id', // the default; or `childrenKey` for nested items
  isLeaf: (department) => !department.has_children, // without it every node can be expanded
});

filterTree({ id: 'department', tree, treeLabel: 'name', filterValue: 'code' });
```

`createDataGridTreeStructure` makes the same thing outside a component; either
returns a structure you can fill later with `tree.setItems(items)` or reshape with
`tree.move(...)` (which throws for a move under the node itself or one of its
descendants), and an open filter follows. `treeLabel` is a property name or a
function returning the node's text; search matches on it, keeps the matching
nodes, the path down to each one and the nodes under it, and starts 300 ms after
typing stops. By default `load` receives the id of the chosen node; `filterValue`
(a property name or a function of the item) sends something else, such as a
code, while the id is what is stored. A tree keeps its items' `id` property as
their key: use the default `itemKey`.

The plugin's API (`getPlugin<DataGridFiltersPluginApi>('filters')`) offers
`useState(filterKey)`, `setState`, `removeState`, `useDraftState`,
`setDraftState`, `applyDraftState`, `resetDraftState`, `useActiveCount(filterKeys)`,
`isFilterValueActive` and `useFilterEntities`, for a custom filter or a control
of your own.

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

### `DataGridRowNumberPlugin`

Adds a column before the data with the row's 1-based number, in the monospace face. It
takes no props.

```tsx
import { DataGridPaginationPlugin } from '@gears-frontx/ui-kit/data-grid/pagination';
import { DataGridRowNumberPlugin } from '@gears-frontx/ui-kit/data-grid/row-number';

<DataGrid name="users" load={loadUsers} columns={columns}>
  <DataGridPaginationPlugin defaultLimit={20} />
  <DataGridRowNumberPlugin />
</DataGrid>;
```

The number is `limit * (page - 1) + index + 1`, so with the pagination plugin the second page
of 20 starts at 21; without it the number is the row's position. The column has no header
text, starts at 32px and grows to the widest number on the page.

### `DataGridRowClickPlugin`

Calls back with the row's item when a row is clicked, double-clicked, or has Enter pressed
on it. It replaces the `row` renderer, so it takes the whole row.

| Prop | Type | Notes |
|------|------|-------|
| `click` | `(item) => void` | A click, and Enter on a focused row |
| `dblclick` | `(item) => void` | A double click, which also fires `click` twice first, as in a browser |

```tsx
import { DataGridRowClickPlugin } from '@gears-frontx/ui-kit/data-grid/row-click';

<DataGrid<User> name="users" load={loadUsers} columns={columns}>
  <DataGridRowClickPlugin<User> click={(user) => navigate(`/users/${user.id}`)} />
</DataGrid>;
```

Every body row gets `tabIndex={0}` and a pointer cursor. The callbacks are read when the event
fires, so a new function each render is fine.

A click anywhere in the row counts, including on a control inside a cell, so a button, link or
checkbox in a cell would fire the row click as well. Mark such an element with
`data-grid-row-ignore-click`, or any ancestor of it in the cell: clicks, double clicks and
Enter that start inside it are skipped. An extra column marks its whole cell with the
`ignoreRowClick` option of `registerExtraColumn`.

```tsx
const columns: DataGridTableColumn<User>[] = [
  { id: 'name', label: 'Name' },
  {
    id: 'actions',
    label: 'Actions',
    component: ({ item }) => (
      <Button data-grid-row-ignore-click onClick={() => remove(item.id)}>
        Delete
      </Button>
    ),
  },
];
```

### `DataGridActionsPlugin`

Renders a component of yours in the toolbar's `top-end` slot, at order 0, so it sits before
the other toolbar buttons. It is for toolbar content (an "Add" button, a bulk-import
trigger); actions on a row belong in a column of your own.

| Prop | Type | Notes |
|------|------|-------|
| `component` | `ComponentType` | Required. Keep its identity between renders (a module-level component) |
| `props` | `Record<string, unknown>` | Spread onto `component` |

```tsx
import { DataGridActionsPlugin } from '@gears-frontx/ui-kit/data-grid/actions';

function AddUserButton({ onAdd }: { onAdd?: () => void }) {
  return <Button onClick={onAdd}>Add user</Button>;
}

<DataGrid name="users" load={loadUsers} columns={columns}>
  <DataGridActionsPlugin component={AddUserButton} props={{ onAdd: openCreateDialog }} />
</DataGrid>;
```

`props` is not typed against `component`, so the component's own props have to be optional
for it to type-check, as `onAdd` is here.

The wrapper lays its content out in a row with a small gap. The component renders as a
child of the grid, so `useDataGrid()` works inside it.

### `DataGridRowActionsPlugin`

Adds a last column that renders your component in every row, given the row's `item`:
the place for a row's edit and delete buttons or its "more" menu.

| Prop | Type | Default |
|------|------|---------|
| `component` | `ComponentType<{ item }>` | required |
| `order` | `number` | `100`, its place among the columns at the end |
| `className` | `string` | none; goes on the wrapper around your component |
| `sticky` | `boolean` | `false`; pins the column to the inline-end edge |

```tsx
import { DataGridRowActionsPlugin } from '@gears-frontx/ui-kit/data-grid/row-actions';

function UserActions({ item }: { item: User }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="sm" icon={<MoreHorizontal />} aria-label={`Actions for ${item.name}`} />}
      />
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => edit(item)}>Edit</DropdownMenuItem>
        <DropdownMenuItem onClick={() => remove(item)}>Delete</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

<DataGrid<User> name="users" load={loadUsers} columns={columns}>
  <DataGridRowActionsPlugin<User> component={UserActions} sticky />
</DataGrid>;
```

The column has no header text and is as wide as the widest actions it holds. The wrapper is
marked `data-grid-row-ignore-click`, so with the row click plugin a click on your buttons does
not also click the row. A menu your component opens renders in a portal, outside that
wrapper: see Known limitations.

`sticky` keeps the actions in view on a table wide enough to scroll sideways: the column sticks
to the inline-end edge, in left-to-right and right-to-left alike, and its cells are opaque, so
the rows scroll under it. A pinned cell is painted with its row's own fill over `--card`, so
it follows hover, selection and the other row states; set `--data-grid-pinned-background` (see
CSS customization) when the grid sits on `--background`.

### `DataGridActionsMenuPlugin`

Adds an ellipsis button named "Actions" to the toolbar's `top-end` slot, after the other
toolbar buttons (order 100). It opens a `DropdownMenu` whose items are components of yours,
or the export items the kit ships (see Export below).

| Prop | Type | Notes |
|------|------|-------|
| `menuItems` | `{ component, params?, order? }[]` | `component` receives `{ params }` and renders a `DropdownMenuItem` (or any menu part) |

```tsx
import { DataGridActionsMenuPlugin } from '@gears-frontx/ui-kit/data-grid/actions-menu';

// `params` is typed as a plain record, so each field of an item's own params is optional.
function ArchiveItem({ params }: { params?: { onArchive?: () => void } }) {
  return <DropdownMenuItem onClick={params?.onArchive}>Archive</DropdownMenuItem>;
}

const menuItems = [{ component: ArchiveItem, params: { onArchive: archiveAll } }];

<DataGrid name="users" load={loadUsers} columns={columns}>
  <DataGridActionsMenuPlugin menuItems={menuItems} />
</DataGrid>;
```

Items are listed by `order`; one without it takes ten times its position in the array, so
10, 20, 30. Another plugin can add items with `registerMenuItem({ component, params?, order? })`
on the plugin's API (`getPlugin<DataGridActionsMenuPluginApi>('actionsMenu')`); without an
`order` it takes ten times one more than the number of items already there, so 20 when one is
(`10 * (count + 1)`). A new `menuItems` array replaces every item, the registered ones too, so
keep `menuItems` in a module-level constant or `useMemo`.

#### Export

`exportMenuItems(config?)` returns menu items that download the grid's rows: "Export as Excel", when
`loadExcelJs` is given, and "Export as CSV". Put them in `menuItems`:

```tsx
import {
  DataGridActionsMenuPlugin,
  exportMenuItems,
} from '@gears-frontx/ui-kit/data-grid/actions-menu';

const menuItems = exportMenuItems<User>({
  filename: 'users',
  // Excel only: install `exceljs` (4.4.0) in your app and hand the package over.
  loadExcelJs: () => import('exceljs'),
});

<DataGrid<User> name="users" load={loadUsers} columns={columns}>
  <DataGridActionsMenuPlugin menuItems={menuItems} />
</DataGrid>;
```

The kit never imports `exceljs`: `exceljs` is an optional peer dependency, and the import lives in
your code, so an app that exports only CSV does not install it and builds without it. Without
`loadExcelJs` there is no Excel item. `DataGridExcelJsModule`, what the loader resolves to, is
spelled out as the `Workbook` the export uses and names no `exceljs` type, so the kit's types
need nothing installed either.

| Option | Type | Default |
|--------|------|---------|
| `filename` | `string \| () => string` | `Report`; a string gets the extension when it is missing, a function's result is used as is |
| `includeHeaders` | `boolean` | `true` |
| `delimiter` | `string` | `,` (CSV) |
| `sheetName` | `string` | `Sheet` (Excel) |
| `transformCellText` | `Record<columnId, ({ value, formattedValue, row }, grid) => string>` | none; replaces the text of one column's cells |
| `loadExcelJs` | `() => Promise<DataGridExcelJsModule>` | none; `() => import('exceljs')` fits, and without it there is CSV only |
| `onError` | `(error: Error) => void` | none; see below |

The export is of every row, not the page on screen:
- With the pagination plugin it reads the pages itself from `load`, with the search, filters and
  order the grid has now, and leaves the grid on the page it was on (the pager's total is the one
  thing it can change, for a lazy tree: see Known limitations).
- With the table tree plugin it walks the tree, each row followed by its children, closed rows
  included; a lazy tree loads the children of every row that can have them, and keeps what it
  loaded without opening those rows.
- Otherwise it is what is on screen.

The columns are the visible ones, in their order, headed by their labels. A cell is the row's
property named by the column's `key` (its `id` without one), through the column's `formatter` and
then `transformCellText`; a column drawn by `render` or `component` exports its value, not what is
drawn. In CSV a value that holds the delimiter, a quote or a line break is quoted, and one that
starts with `=`, `+`, `-`, `@`, a tab or a carriage return is quoted and prefixed with a tab, so a
spreadsheet does not read it as a formula. In Excel a value that nothing changed stays a number,
a boolean or a date, and a string that is an ISO date or a plain number (not one with a leading
zero, or an exponent) is written as one.

A failure while the cells are made goes to `onError`, or to `console.error` without it; the menu
closes when an item is chosen, so there is no other place to show it.

### `DataGridTableConfigurationPlugin`

Adds a gear button named "Configure columns" to the toolbar's `top-end` slot, after an
`actions` component and before the actions menu (order 10). It opens a popover headed "Table
configuration" that lists the grid's columns, so the user can show, hide and pin them. It
takes no props.

```tsx
import { DataGridTableConfigurationPlugin } from '@gears-frontx/ui-kit/data-grid/table-configuration';

<DataGrid name="users" load={loadUsers} columns={columns} persistentColumnVisibility>
  <DataGridTableConfigurationPlugin />
</DataGrid>;
```

Every column has a switch for its visibility and a pin button for keeping it at the inline
start while the table scrolls sideways. The pin button shows while its row is hovered or has
keyboard focus, and always while the column is pinned. A group is a section: a pin button for
the group, then a switch for each column in it, with no pin button of their own. Pinning the
group pins its heading and all its columns together, and unpinning reverses it. The switch of
the last visible column is locked so the table is never empty, and a column's own
`visibleToggleDisabled` locks its switch.

A choice applies at once. Which columns are hidden survives a reload only with
`persistentColumnVisibility` on the grid; pins are not stored. A new `columns` array resets both.

The panel renders in a portal, so set its two size hooks on `:root` or `body`, or on the grid's
`portalContainer` when it has one (on `:host` when that is a shadow root), not on the grid (see CSS
customization). It keeps inside the screen: its width floor gives way to the room there is on a
narrow one, and a list longer than the room scrolls inside it.

### `DataGridRowSelectPlugin`

Adds a checkbox column at the start, a select-all checkbox in its header, and an action bar
that replaces the toolbar while rows are selected.

| Prop | Type | Default |
|------|------|---------|
| `onSelectionChange` | `(items, meta) => void` | none; `meta` is `{ mode: 'none' \| 'page' \| 'all', count }` |
| `component` | `ComponentType<{ rowSelect }>` | none; your actions in the action bar |
| `statusComponent` | `ComponentType<{ rowSelect }>` | none; replaces the "N items selected" text |
| `multiple` | `boolean` | `true`; `false` allows one row, with no select-all checkbox |
| `showSelectAll` | `boolean` | `true`; the select-all checkbox in the header |
| `visible` | `(item) => boolean` | none; rows it rejects get no checkbox, and select-all skips them |
| `showSelectAllMatching` | `boolean` | `false`; see below |
| `keepHiddenSelection` | `boolean` | `false`; see below |

```tsx
import { DataGridRowSelectPlugin, type DataGridRowSelectPluginApi } from '@gears-frontx/ui-kit/data-grid/row-select';

function BulkActions({ rowSelect }: { rowSelect: DataGridRowSelectPluginApi<User> }) {
  return (
    <>
      <Button variant="outline" onClick={rowSelect.clearSelection}>Cancel</Button>
      <Button variant="destructive" onClick={() => deactivate(rowSelect.getSelectionDescriptor())}>
        Deactivate
      </Button>
    </>
  );
}

<DataGrid<User> name="users" load={loadUsers} columns={columns}>
  <DataGridRowSelectPlugin<User> component={BulkActions} onSelectionChange={setSelected} />
</DataGrid>;
```

The action bar needs `component` or `statusComponent`; with neither, selecting only ticks the
checkboxes. It shows the count ("1 item selected", "3 items selected") at the end, or your
`statusComponent` in its place, and your `component` at the start. `rowSelect` is the plugin's
API: `useSelectedIds`, `useSelectionCount`, `useSelectionMode` and the other `use*` hooks read
it, `toggleSelection(id)`, `toggleSelectAll(value)` and `clearSelection()` change it.

Selection is kept per page, and it follows the rows that are loaded. Every load empties the
loaded rows while it runs, so every load clears the selection and calls `onSelectionChange` with
`[]` and `{ mode: 'none', count: 0 }`: a page change, a filter, a search, and also `refresh()` or
`triggerLoad()` when they bring back the very same rows. With `keepHiddenSelection` the ids
selected by hand survive loads. The `total` of the load result is mirrored, so the plugin does
not depend on the pagination plugin being registered first.

#### Select all matching

`showSelectAllMatching` is opt-in: turn it on only when your bulk action handles the all-matching
scope. With it on, once every selectable row on the page is selected and the load result's
`total` is more than the rows loaded, a banner offers "Select all N". Taking it enters
all-matching mode, every record that matches the current filter across all pages, without
listing ids. In that mode `onSelectionChange` still gets only the current page's items, and the
scope is in `meta` (`mode: 'all'`, `count: total`) and in `getSelectionDescriptor()`. Any single
row toggle, a clear, or any load leaves all-matching, and
`getSelectionDescriptor()` is back to ids. In single-selection mode the banner and all-matching
are off.

Send the descriptor, never a list of thousands of ids:

```tsx
const selection = rowSelect.getSelectionDescriptor();
// { mode: 'ids', ids: [1, 2, 3] }  or  { mode: 'all-matching' }
await (selection.mode === 'all-matching' ? deleteMatching(currentFilter) : deleteIds(selection.ids));
```

The count in all-matching mode is the load result's `total`, which the client cannot narrow by
`visible`, and a filter-based action acts on every match, so `visible` is not honoured by "select
all matching". If `visible` is a permission gate, leave `showSelectAllMatching` off. The backend
enforces permissions either way.

#### `keepHiddenSelection`

With it on, rows selected by hand stay selected when they leave the screen (another page, a
filter, a search). `onSelectionChange` then reports every selected item across pages, and the
select-all checkbox, which acts on the page, is ticked or mixed by the page's rows only. Select-all
adds the page to the selection rather than replacing it, but unticking it clears the whole
selection, other pages included, as the source grid does. It is not meant to be combined with
`showSelectAllMatching`: the one keeps a hand-picked set across pages, the other offers a single
scope.

#### With row click

The checkbox column marks its whole cell, header and body, as ignoring row clicks, so ticking a
box does not call a row click plugin's `click`. Nothing to configure.

### `DataGridTableTreePlugin`

Shows hierarchical rows as a tree: a row that has children gets a toggle button in the first
visible column, and its children appear under it, each level indented one step further. It
replaces the `row` and `body-cell-content` renderers, so it takes the whole row.

| Prop | Type | Notes |
|------|------|-------|
| `parentKey` | `string \| (item) => id` | Every row arrives in one load and names its parent by this field (or function); a row whose parent is `null` or `undefined` is a root, and the field has to be on every row. A row with children is expandable |
| `expandable` | `(item) => boolean` | Children load when a row opens: a row it accepts is expandable. Keep its identity between renders (a module-level function, or `useCallback`): a new one each render updates the plugin's props and re-renders every row |

Use one of the two. With neither, no row is expandable.

```tsx
import { DataGridTableTreePlugin } from '@gears-frontx/ui-kit/data-grid/table-tree';

interface Category {
  id: number;
  name: string;
  parent_id: number | null;
  hasChildren: boolean;
}

// Flat: one load returns every row, and each row names its parent.
<DataGrid<Category> name="categories" load={loadAllCategories} columns={columns}>
  <DataGridTableTreePlugin<Category> parentKey="parent_id" />
</DataGrid>;

// Lazy: the children of a row load when it opens.
const hasChildren = (category: Category) => category.hasChildren;

async function loadCategories({ tree, signal }: DataGridLoadContext) {
  const response = await fetchCategories({ parentId: tree?.parentId ?? null, signal });
  return { results: response.items, total: response.total };
}

<DataGrid<Category> name="categories" load={loadCategories} columns={columns}>
  <DataGridTableTreePlugin<Category> expandable={hasChildren} />
</DataGrid>;
```

In flat mode every row has to carry the `parentKey` field (`null` for a root). A row without it
fails the whole load: the first load shows the grid's error view, "Something went wrong", in place
of the table and logs `Key "…" not found in item …` to the console in development, and a later
load has no UI of its own (see Known limitations). A row's children are the rows of the same load
that name it as their parent, so with the pagination plugin a page has to hold the children of the
roots it shows, and a row whose parent is not in the load is not shown. Opening and closing a row
shows and hides its children and loads nothing.

In lazy mode `load` is called with `tree.parentId` set to the row's id when it opens, and
`null` for the rows of the grid. That load carries the same `pagination`, `filters` and
`order` as the rows' load, so read `tree.parentId` first and decide whether they apply to a
branch. Closing a row keeps what was loaded: opening it again shows the children without a load.
A refresh or a page change drops everything loaded; the open rows that come back in the new
load fetch their children again.

The toggle sits in the first visible column, so hiding that column moves it to the next one.
Clicking it does not call the row click plugin's `click`.

#### Persisted expand state

Which rows are open is stored with the grid's other state, under `dataGrid:${name}:tree`, as a
list of ids with no opt-in. The list keeps the 200 most recent ids and is read back with the
same cap, and anything in it that is not a string or a number is ignored. Under
`persistent="router"` the expand state is not stored at all: the list holds ids of rows that may
no longer exist, and a copied link would carry all of that into whichever grid opens it.

- Ids are kept when the page changes, so coming back to a page restores its open rows; ids of
  other pages stay stored and take effect once those rows load.
- In lazy mode a restored row's children are fetched when its record arrives, and a restored id
  whose row turns out not to be expandable is dropped from the list.

The plugin's API (`getPlugin<DataGridTableTreePluginApi>('tableTree')`) has `toggle(id)`, which
opens or closes a row and stores the change, `useIsExpanded(id)`, `useIsExpandable(record)`,
`isExpandable(record)` (the same check outside a render) and `useLevel(section)`, the depth of
a section's rows.

#### With row click

Declare `DataGridRowClickPlugin` before the tree. Both replace the `row` renderer and the last
one registered wins. The tree's row does what the row click plugin's does when that plugin is
registered (`click`, `dblclick`, Enter, a tab stop and the pointer cursor on every row, the
children's too), so with the tree last the two work together. With the row click plugin last,
its rows replace the tree's, which draw no children: a toggle opens a branch that never appears.

```tsx
<DataGrid<Category> name="categories" load={loadCategories} columns={columns}>
  <DataGridRowClickPlugin<Category> click={(category) => navigate(`/categories/${category.id}`)} />
  <DataGridTableTreePlugin<Category> expandable={hasChildren} />
</DataGrid>
```

### `createDataGridDragDropPlugin`

Adds a handle column at the start of the grid and lets the user reorder rows by dragging a row,
by its handle, onto another row or onto the grid. It replaces the `row` and `content` renderers.
Unlike the other plugins it is a factory: the callbacks are its configuration, and what it
returns is the component to render as a child of the grid. Create it once, outside render, or in
`useState`. `onDrop` is the one it was created with, so anything it needs that changes between
renders has to reach it some other way, through a ref or a store.

| Option | Type | Notes |
|--------|------|-------|
| `onDrop` | `({ item, target, ...context }) => void \| Promise<void>` | Required. `item` is the dragged row's item and `target` the item of the row it was dropped on, or `null` for a drop on the grid and not on a row. The rest is the plugin context, so `refresh()` reloads the grid |
| `renderDragPreview` | `(item) => ReactNode` | What follows the pointer; without it, a copy of the dragged row |

```tsx
import { createDataGridDragDropPlugin } from '@gears-frontx/ui-kit/data-grid/drag-drop';

const DragDrop = createDataGridDragDropPlugin<Task>({
  onDrop: async ({ item, target, refresh }) => {
    // `target` is the row the task was dropped on, or null when it was dropped on the grid.
    await moveTask(item.id, target?.id ?? null);
    await refresh({ resetFilters: false });
  },
});

<DataGrid<Task> name="tasks" load={loadTasks} columns={columns}>
  <DragDrop />
</DataGrid>;
```

The plugin does not reorder anything: it reports the drop, and `onDrop` moves the row, usually on
the server, and reloads. It is told the item and the row it was dropped on, and not which edge of
that row the pointer was nearer.

The handle is the only place a drag can start, and dragging is pointer-only: there is no keyboard
way to move a row. While a row is dragged it is tinted, the row under the pointer is tinted too
and has a line on its top or bottom edge, and a drop on the grid outside every row outlines the
whole grid. A drop outside the grid does nothing.

When `onDrop` returns a promise, the handle of the dragged row shows a spinner until it settles.
A rejection is swallowed and the spinner stops: handle errors inside `onDrop`. A callback that
returns anything else is done at once. One that throws has its error reported as uncaught, on
its own, and the next drag works as usual.

The handle, which fills its cell, is marked `data-grid-row-ignore-click`; the rest of the cell
around it is not, since there is none. Only this entry loads the drag
library (`@atlaskit/pragmatic-drag-and-drop`, a dependency of the kit), so a grid without the
plugin ships none of it.

`--data-grid-drag-cursor` sets the cursor over a handle at rest (see CSS customization).

#### With other row plugins

Row click, the table tree and drag and drop each replace the `row` renderer and the last one
registered wins, so declaration order decides what a grid with two of them does:

| Declared last | What the grid does |
|---------------|--------------------|
| Drag and drop, after row click | Rows drag; the row click callbacks are not called |
| Row click, after drag and drop | Rows click; the handle column is drawn but nothing drags |
| Drag and drop, after the table tree | Rows drag, and the tree's toggle and indentation are drawn, but opening a row shows no children |
| The table tree, after drag and drop | The tree's rows show their children; the handle column is drawn but nothing drags |

With row select the handle column comes first, ahead of the checkboxes.

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
  first. `triggerLoad` queues a load; `refresh` aborts the loads already in flight
  before it starts its own, but two `refresh()` calls in the same tick both load
  (see Known limitations).
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
| `--data-grid-table-configuration-min-inline-size` | `304px` | Minimum width of the table configuration panel. The panel renders in a portal: set it on `:root`, `body` or the grid's `portalContainer` (`:host` when that is a shadow root) |
| `--data-grid-table-configuration-content-max-block-size` | `500px` | Height at which the panel's column list scrolls. Set it where the panel's portal is under the cascade, like the width |
| `--data-grid-drag-cursor` | `grab` | Cursor over a drag handle at rest. The row being dragged sets it to `grabbing` on itself, so a value set above it applies before and after a drag |
| `--data-grid-pinned-background` | `var(--card)` | Fill of a pinned column's cells at rest. A pinned cell is painted with its row's own fill over it, so it follows hover and the other row states. Set `var(--background)` for a grid that sits on the page rather than on a card |

The floor is one constraint among several: under `'fixed'` a table whose columns
declare widths cannot shrink below their sum, and under either mode not below the
columns' minimum content widths.

## Accessibility

- The header label of an orderable column is a native `button` named "Change
  sorting of '<column>' column"; Enter and Space sort. There is no `aria-sort`.
- The table's scroll container is a tab stop (it holds `tabIndex=0` so a keyboard
  can scroll it).
- The pager is a `nav` named "Pagination"; the page buttons are named "Go to page
  N" and carry `aria-current="page"` on the current one. A grid with a `label`
  names its pager `<label> pagination` and its table's scroll container a
  `region` named `<label>` - pass a distinct `label` per grid when a page
  holds more than one grid, so their landmarks do not collide.
- `aria-busy` is set on the content region while a loader is on screen.
- The order popover's items are menu items without a menu popup, so they take
  focus and Enter and Space, but arrow keys do not move between them.
- A filter chip is a native `button`; the toggle chip does not say whether it is on
  (no `aria-pressed`), only by its look. The text box of a `filterSearch` filter has
  no placeholder and no accessible name, and the search box inside a list filter
  has a placeholder ("Search...") and no accessible name. A tag is a label over a
  native checkbox or radio, so the input carries the state.
- In a tree filter each row holds a radio and the tree moves its own focus: Arrow
  keys move between rows, Right and Left open and close a directory, Home and End
  go to the ends, and Enter toggles a directory. A node is chosen with the mouse,
  or by Tab to its radio and Space.
- The "All filters" panel is a dialog; it is left with its close button (named
  "Close dialog"), Escape or a click outside.
- The table configuration panel is built like the order popover, from menu items without
  a menu popup: its switches and pin buttons are reached with Tab, not with arrow keys, the
  switches carry no accessible name of their own (the column's name is the text beside them),
  and the pin buttons are named "Pin column" and "Unpin column" without the column.
- With the row click plugin every body row is a tab stop and Enter activates it; Space
  does not.
- Drag and drop is pointer-only: there is no keyboard way to move a row. The handle is a `div`
  with the label "Drag to reorder row" and no role, so it is not reached with Tab and a screen
  reader does not announce it as a control.
- The table tree's toggle is a native `button` with no accessible name and no `aria-expanded`,
  so a screen reader announces an unnamed button and not whether the row is open.
- The row select checkboxes, the select-all one included, have no accessible name. "Select all
  N" and "Clear selection" in the banner are buttons, and the banner is an `alert`, so it is
  announced when it appears.
- Strings are English and live in one module; the kit has no i18n layer yet.

## Known limitations

- Data loading has no stale-response guard: `triggerLoad` neither aborts the load
  in flight nor ignores a late result, so when two loads overlap (two quick page
  clicks, a page-size change, a refresh over a page change, two `refresh()` calls
  in the same tick) the older result can replace the newer one. A `load` that
  ignores `signal` is not protected even by the abort `refresh()` sends. `refresh()` also defaults to `resetFilters: true`.
- Changing the page size from a later page fires two loads.
- `abort()` counts as the grid's own abort. Called during the first load, or during
  the refresh the first load waits on, it ends the first load with nothing loaded:
  the grid shows "No results found" and loads nothing more. A superseded
  `refresh()` resolves without its data, so a caller cannot tell it was superseded.
- A failed first load has no retry; a failed refetch has no UI, and when search or
  sort started it, the failure also reaches the host as an unhandled rejection.
- A search still waiting out its debounce when the grid unmounts is flushed: its
  refresh runs after the grid is gone, and its load's `signal` is not aborted.
- The loading overlay blocks the pointer only, not the keyboard.
- No `aria-sort`; Previous and Next drop keyboard focus at the ends of the range.
- With the row click plugin, activating an item of a menu that a row action opens fires the row
  click, and fires it twice: with the mouse, and with Enter on the item (Space does not, a row
  ignores it). The menu renders in a portal, so the item is not inside the element marked to
  ignore row clicks, and a React event still bubbles from it to the row, where it arrives twice.
  Stop both in the menu's content, which leaves the item's own `onClick`, Escape and the arrow
  keys as they were:

  ```tsx
  <DropdownMenuContent
    onClick={(event) => event.stopPropagation()}
    onKeyDown={(event) => {
      if (event.key === 'Enter') event.stopPropagation();
    }}
  >
  ```
- The export reads a cell as `item[key]`, a plain property and not a path: a column whose `key` is
  dotted exports empty, though the grid shows the nested value. A failing `load` while it reads
  the pages is logged to the console and does not reach `onError`, and the `format` and `encoding`
  options are accepted and ignored.
- Renderer overrides (`registerComponent`) are last registered wins. The row click, table
  tree and drag and drop plugins all override `row`, so declare the tree after row click (see
  the tree's section), and see "With other row plugins" under drag and drop for what each
  pair does.
- With the drag and drop plugin, a row dropped on itself is not refused: a row is never its own
  target, so the drop falls through to the grid and `onDrop` is called with a `null` target, the
  same as for a drop outside every row. A row dropped on another grid that has the plugin does
  the same for its own grid: its `onDrop` is called with `target: null`, and the other grid's is
  not.
- The line on a drop target's edge is the edge the pointer entered the row by: it does not
  follow the pointer inside the row. The grid's outline for a drop on the grid shows once the
  pointer has been over another row first, since a drag starts over its own row.
- In lazy mode, the load of a row's children replaces the `total` that the pagination plugin
  shows and that row select mirrors with the children's own: after a row is opened the pager
  counts its children until the next load of the rows. The export of a lazy tree does the same,
  since it loads the children of every row that can have them: with the pagination plugin the pager
  is left counting the last branch it loaded (`Page 1 of 4 (11 items)` reads `Page 1 of 1 (1
  items)`) until the grid loads its rows again. The export's file and the rows on screen are not
  affected.
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
- A filter's quick popover is not kept in step with what resets it from outside:
  a tree filter's radio stays checked after its Reset button until the popover is
  opened again, although the filter is cleared.
- `filterTree` reads each item's `id` property for its search and its radios. With
  an `itemKey` other than `id` every radio shows as checked, a click selects
  nothing, and a search hides every node.
- In a tree filter with a search, the arrow keys also step onto the rows the search
  hides. Once the focus is on a hidden row, no row shown is a tab stop, so the
  arrow keys are lost until that row is shown again or another row is clicked;
  each row's radio can still be reached with Tab.
- A key in `filters` that no entity owns any more, and any stored value of the
  wrong shape (see Persistence), still reach `load`.
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
