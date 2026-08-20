# Table

Styled markup for a native HTML table — `<table>`/`<thead>`/`<tbody>`/
`<tfoot>`/`<tr>`/`<th>`/`<td>`/`<caption>`, one part per element. Table has
no Base UI primitive: every part is a plain styled native element, no open
state, no keyboard behavior of its own beyond what the browser already
gives a table. This is deliberately just markup — sorting, filtering,
pagination, virtualisation, and column definitions are all out of scope; a
composite `data-table` is a separate, not-yet-built component.

Composition: `Table` (root) → optional `TableCaption` → `TableHeader` (→
`TableRow` → `TableHead`) → `TableBody` (→ `TableRow` → `TableCell`) →
optional `TableFooter` (→ `TableRow` → `TableCell`). Every part except
`Table` itself is a passthrough over the matching native element's props —
no kit-specific props of its own.

## When to use

- Real tabular data: rows that share the same columns, where a screen
  reader announcing "column 2 of 5, Status" on each cell is useful, and a
  sighted user scanning a column vertically is a real interaction.
- As the markup layer under your own sorting/filtering/pagination logic —
  Table gives you the styled elements; the behavior is yours to add.

## When not to use

- A single item's key/value details, or a summary card — use `Card`.
- Data you'd reach for a data grid library for (virtualised rows, resizable
  columns, drag-to-reorder) — this kit has no such component yet; Table is
  the markup you'd style underneath one if you build it yourself.

## The scroll wrapper

`Table` renders two elements: a wrapper `div` around the `<table>`, scrolling
horizontally when the table is wider than its container. This matches the
upstream source exactly, which takes the same view — a table that can
overflow needs *something* to scroll, and it's simpler for that to be
Table's own responsibility than to ask every consumer to remember to add a
wrapper.

That wrapper is also `tabIndex={0}`, which the source is not: a
horizontally-scrolling region with no keyboard-operable alternative to
dragging a scrollbar or swiping fails WCAG 2.1.1 (keyboard). With
`tabIndex={0}`, Tab reaches the region and the arrow keys scroll it, with a
focus ring around the whole table while it holds focus. This is
unconditional — every `Table` gets the tab stop, even one that never
actually overflows — rather than toggled on only once the content
overflows, which would need a `ResizeObserver` watching the container; that
kind of runtime behavior is exactly what this "primitive markup" component
intentionally does not have.

If you need a *vertical* scroll region too (capping a long table's height),
wrap your own `div` with `overflow-y` and a `max-height` around `<Table>` —
it composes cleanly, since your wrapper scrolls the vertical axis and
Table's own wrapper scrolls the horizontal one (see Examples).

A focus stop should announce something: pass `label` to name the wrapper
(`role="region"` + `aria-label` — a bare `div`'s `aria-label` is ignored
by the accessible-name algorithm without a role, which is also why
labelling your own outer `div` doesn't work: the name lands on a
non-focusable element while the focusable wrapper stays nameless).
Without `label` the wrapper is roleless and nameless as before. Prefer
passing it whenever the surrounding page doesn't make the table's purpose
obvious the moment focus lands. Beyond `label`, the wrapper takes no
props of its own — it isn't a separate export, so there's no `max-height`
you can pass it; for that, put your own `div` around `<Table>` (as above).

## Semantics and accessibility

Every part renders its literal matching native element — no `div` standing
in for a `tr`, no ARIA `role` patched onto anything — so the table keeps its
full implicit role structure (`table`/`rowgroup`/`row`/`columnheader`/`cell`)
for free, the same way a plain `<table>` you wrote by hand would. None of
the parts use `display: flex` or `display: grid` anywhere in their layout
(vertical centering is done with `vertical-align`, not a flex `align-items`)
— that matters because a `display` other than a table value on a
`tr`/`th`/`td` overrides its implicit role in most browsers, which would
silently turn a real table into an unlabeled pile of `div`-like boxes for
assistive tech.

`TableCaption` renders a real `<caption>`, which is the table's accessible
name/description regardless of where it's drawn on screen: `.table` sets
`caption-side: bottom`, so a `TableCaption` you place first in JSX (matching
the source's own convention) still paints below the rows, but it is exactly
as accessible there as `<caption>` always is — moving it visually doesn't
touch the accessibility tree.

The wrapper `div` around `<table>` carries no `role` of its own (see "The
scroll wrapper" above) — it does not stand between the table and its
implicit roles, since a plain ancestor `div` has no effect on a
descendant's own role.

## Metrics and type

Taken from the Studio Data Table frame:

| Part | Drawn | Shipped |
| --- | --- | --- |
| Header bar height | 36px | `--control-height-md` |
| Header label | JetBrains Mono 10/14, uppercase | the Mono role whole (`--font-mono`, `--text-mono-*`) + `text-transform: uppercase`, in `--subtle-foreground` |
| Row height (single line) | 56px | falls out of `--space-5` block padding on a `--text-meta` line — no `height`, so a two-line cell grows the row instead of overflowing it |
| Cell side padding | 16px | `--space-4` |
| Row rule | 1px | `--border-width` `--border` |

The header is the one place the table leaves Inter: its column labels are
mono by design, and that carries through to a header rendered as a button
(`DataTableSortButton` inherits it rather than imposing Button's own type).

`density="compact"` drops the header to `--control-height-sm` and halves
the cells' block padding to `--space-2`, taking a single-line row to 32px.
The frame draws no compact specimen, so that step is proportional rather
than measured.

## Column widths

There's no `width` prop — size a column the same way the upstream source's
own docs do, with a `className`/`style` width on `TableHead`/`TableCell`
(see Examples).

`TableHead`/`TableCell` declare `box-sizing: border-box` specifically so this
works: without it, the cell's own padding would add on top of the width you
set instead of being absorbed into it, and a `width: 100` cell would render
wider than 100.

## Row states

`TableRow` reads plain `data-*` attributes for its state, forwarded like any
other prop rather than driven by a kit-specific prop. Your own logic sets
the attribute; the kit only paints it.

A row is flat: transparent at rest, packed against its neighbours, with a
single full-bleed 1px `--border` rule under it and no corner radius, ring,
or fill of its own. Every state below is expressed as a full-bleed tint on
that shape — the drawn state language of the Studio Data Table:

- `data-state="selected"` — a `--selection-subtle` tint, for a row the
  user has selected (e.g. via a leading checkbox column).
- `data-state="stale"` — a `--warning-soft` tint, for a row whose data
  needs attention (out-of-date sync, pending action).
- `data-state="restricted"` — a `--danger-soft` tint, for a row the
  viewer lacks access to.
- Hover, and any row containing a descendant that is *currently*
  `aria-expanded="true"` (e.g. a row-level disclosure toggle, only while
  open — a collapsed toggle does not match) — a `--muted` tint, one step
  off both backdrops a table meets (`--surface` inside a card,
  `--background` bare on the page). A `data-state` tint outranks hover, so
  a selected row stays selected-colored under the pointer.

Because rows carry no fill at rest, the surface behind the table shows
through them — put a `Table` on a `Card`, on `DataTable`'s own card, or on
the page, and it takes that surface without any per-row override.

The rule under the last row of the table is dropped: below it sits either
the container's own bottom border or a footer bar's top border, and a
second line there would double it. A `<tfoot>` after the body still gets
its separator, since the body is then no longer the last section.

## Props (kit level)

Two kit-specific props on `Table`: `label` (`string`) names the focusable
scroll wrapper with `role="region"` + `aria-label` (see above), and
`density` (`default` | `compact`) tightens cell padding for operational
views — purely cell metrics, not a data-table feature. Every other prop
is the matching native element's own (`ComponentProps<'table'>`,
`<'thead'>`, `<'tbody'>`, `<'tfoot'>`, `<'tr'>`, `<'th'>`, `<'td'>`,
`<'caption'>`), plus `className`, merged after the kit class on every
part.

## Examples

```tsx
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@gears-frontx/ui-kit';

<Table>
  <TableCaption>A list of recent invoices.</TableCaption>
  <TableHeader>
    <TableRow>
      <TableHead>Invoice</TableHead>
      <TableHead>Status</TableHead>
      <TableHead>Amount</TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    <TableRow>
      <TableCell>INV001</TableCell>
      <TableCell>Paid</TableCell>
      <TableCell>$250.00</TableCell>
    </TableRow>
    <TableRow data-state="selected">
      <TableCell>INV002</TableCell>
      <TableCell>Pending</TableCell>
      <TableCell>$150.00</TableCell>
    </TableRow>
  </TableBody>
  <TableFooter>
    <TableRow>
      <TableCell>Total</TableCell>
      <TableCell />
      <TableCell>$400.00</TableCell>
    </TableRow>
  </TableFooter>
</Table>;
```

Sized columns, via `style`/`className` width on `TableHead`/`TableCell`
(see "Column widths" above for why `box-sizing: border-box` makes this
render at the width you set):

```tsx
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@gears-frontx/ui-kit';

<Table>
  <TableHeader>
    <TableRow>
      <TableHead style={{ width: 100 }}>Invoice</TableHead>
      <TableHead>Status</TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    <TableRow>
      <TableCell style={{ width: 100 }}>INV001</TableCell>
      <TableCell>Paid</TableCell>
    </TableRow>
  </TableBody>
</Table>;
```

A vertical scroll region, composed around `Table`'s own horizontal one (see
"The scroll wrapper" above):

```tsx
import { Table, TableBody, TableCell, TableRow } from '@gears-frontx/ui-kit';

<div style={{ maxHeight: '20rem', overflowY: 'auto' }}>
  <Table>
    <TableBody>
      <TableRow>
        <TableCell>Row 1</TableCell>
      </TableRow>
    </TableBody>
  </Table>
</div>;
```

A row with a leading checkbox column, sized flush against the cell edge by
the source's own `:has([role=checkbox])` rule (built into `.tableHead`/
`.tableCell`, no extra class needed):

```tsx
import { Checkbox, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@gears-frontx/ui-kit';

<Table>
  <TableHeader>
    <TableRow>
      <TableHead>
        <Checkbox aria-label="Select all" />
      </TableHead>
      <TableHead>Name</TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    <TableRow>
      <TableCell>
        <Checkbox aria-label="Select row" />
      </TableCell>
      <TableCell>Acme Inc.</TableCell>
    </TableRow>
  </TableBody>
</Table>;
```

## Anti-patterns

- Do not reach for `Table` for a single record's key/value pairs or a
  summary — that's `Card`, not a one-row table.
- Do not expect sorting, filtering, pagination, row selection state, or
  column definitions — none of that is here; this is markup only. Wire
  your own logic and drive `data-state`/`aria-*` attributes yourself.
- Do not assume the scroll wrapper's `tabIndex={0}` announces anything to
  screen readers on its own — it restores keyboard *operability* of the
  scroll, not a spoken label; the table inside still carries its own
  accessible name via `TableCaption` (or `aria-label`/`aria-labelledby` on
  `Table` itself) exactly as it would without the wrapper.
- Do not add `display: flex`/`display: grid` to a `TableRow`/`TableHead`/
  `TableCell` via `className` — that overrides the element's implicit
  table role in most browsers, turning it into an unlabeled box for
  assistive tech even though it still looks like a table row visually.
- Do not override `TableHead`/`TableCell`'s `box-sizing: border-box` back
  to `content-box` via `className` — that's what makes a `width` set on
  either one behave as documented in "Column widths" above; undoing it
  reopens the same padding-inflates-past-width bug the source relies on
  Tailwind's global preflight to avoid.
