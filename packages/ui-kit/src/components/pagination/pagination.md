# Pagination

Page-number navigation built from real anchors. No Base UI primitive backs
it: pure styling over semantic markup (`nav` > `ul` > `li`), the same shape
as `Table`/`Breadcrumb`.

An item is a 28px square at a 6px radius, transparent, with a centred 12/16
label in `--muted-foreground` and a 4px gap between items. The active page
inverts: the page's own `--background` becomes the chip fill, under a
`--primary` label. `PaginationPrevious`/`PaginationNext` take the same 28px
height with horizontal padding instead of a fixed square, because they carry
an icon and a label side by side.

## When to use

- Navigating between server-rendered pages of a result set, where each page
  is a real URL (`<PaginationLink href="?page=2">`).

## When not to use

- Client-side "load more"/infinite scroll — use a plain `Button`.
- A single prev/next stepper with no page numbers — `PaginationPrevious`/
  `PaginationNext` alone (skip `PaginationLink`) already cover that.

## Parts

| Part | Renders | Notes |
|------|---------|-------|
| `Pagination` | `<nav aria-label="pagination">` | The root landmark |
| `PaginationContent` | `<ul>` | Row of page items |
| `PaginationItem` | `<li>` | One item |
| `PaginationLink` | `<a>` | A page number; square by default |
| `PaginationPrevious` | `<a>` | Chevron + "Previous" (hidden below 640px) |
| `PaginationNext` | `<a>` | "Next" + chevron (hidden below 640px) |
| `PaginationEllipsis` | `<span>` | Collapsed-pages indicator |

## Props (kit level)

`PaginationLink`:

| Prop | Type | Default |
|------|------|---------|
| `isActive` | `boolean` - inverts the item's paint and sets `aria-current="page"` | `false` |
| `square` | `boolean` - a 28px square footprint instead of a padded one | `true` |

`PaginationPrevious`/`PaginationNext` accept the same props minus `square`
(fixed to `false`), plus `text` to relabel the link.

## Implementation note

Pagination carries its own geometry rather than a `Button` size: the drawn
item is 28px with a paint inversion on the active page that no Button
variant renders. The parts are real `<a>` elements, so pagination items stay
crawlable and cmd-clickable.

## Examples

```tsx
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@gears-frontx/ui-kit';

<Pagination>
  <PaginationContent>
    <PaginationItem>
      <PaginationPrevious href="?page=1" />
    </PaginationItem>
    <PaginationItem>
      <PaginationLink href="?page=1">1</PaginationLink>
    </PaginationItem>
    <PaginationItem>
      <PaginationLink href="?page=2" isActive>
        2
      </PaginationLink>
    </PaginationItem>
    <PaginationItem>
      <PaginationEllipsis />
    </PaginationItem>
    <PaginationItem>
      <PaginationNext href="?page=3" />
    </PaginationItem>
  </PaginationContent>
</Pagination>
```

## Anti-patterns

- Do not wrap a client-side handler in `href="#"` and call
  `preventDefault()` as the only navigation mechanism — a real `href` keeps
  the page crawlable and cmd/middle-click-able, matching a genuine link's
  semantics.
- Do not set `isActive` on more than one `PaginationLink` at a time — only
  one page is "current".
