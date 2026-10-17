# PageHeader

The bar at the top of a page or of a section of one: its title, and what
sits around the title - a control before it, a line above it, content
beside it, a description under it and actions at the end. PageHeader has
no Base UI primitive and no shadcn/ui counterpart; it is the kit's own, and
nothing in it is tied to one product - what the slots hold is the
application's. Every part is a plain styled element with no interactive
behaviour of its own.

Composition: `PageHeader` (root) → `PageHeaderLeading` (a control before the
text), `PageHeaderContent` (→ `PageHeaderEyebrow`, `PageHeaderTitle`,
`PageHeaderMeta`, `PageHeaderDescription`) and `PageHeaderActions` (the row
at the end).

## When to use

- The header of the page of one object - a customer, an order, a
  project, a document - with its name, and a badge, a status or a link
  beside it.
- The header of a list or of a section inside a page: a list with its
  "New …" button, a tab with its own section navigation and actions.

## When not to use

- The application's top bar - the product identity, the global navigation
  and the account menu belong to the shell, not to a page.
- A heading inside a card or a panel - use `CardHeader`/`CardTitle`.
- Tabs that switch panels below the header - the tab list may sit in
  `PageHeaderMeta`, but `Tabs` still owns the panels.

## Props (kit level)

`PageHeader`:

| Prop | Type | Default |
|------|------|---------|
| `size` | `'sm' \| 'default' \| 'lg'` - the minimum height: `sm` 56, `default` 64, `lg` 80 | `'default'` |
| `border` | `boolean` - draws the rule under the header; `false` paints it transparent, so the height and the text position stay those of a header with the rule | `true` |
| `className` | `string` - merged after the kit classes | — |

`PageHeaderTitle`:

| Prop | Type | Default |
|------|------|---------|
| `typography` | `'heading' \| 'display'` - the ramp role: `heading` is Heading 1 (20/28), `display` is the Page Title role (26/32) | `'heading'` |
| `render` | an element or a render function - replaces the `h1`, such as `render={<h2 />}` for a section's header | — |
| `className` | `string` - merged after the kit classes | — |

`PageHeaderLeading`, `PageHeaderContent`, `PageHeaderEyebrow`,
`PageHeaderMeta`, `PageHeaderDescription` and `PageHeaderActions` take no
kit-specific props - every prop is the `div`'s own, forwarded as-is.
`PageHeader` forwards the `header` element's props the same way.

### CSS hook

| Variable | Default | What it sets |
|----------|---------|--------------|
| `--page-header-inset` | `var(--space-6)` (24) | The inset on both sides. Set `0` for a header inside a region that already has its own padding, `var(--space-4)` for a denser panel. |

## Examples

```tsx
import {
  Badge,
  Button,
  PageHeader,
  PageHeaderActions,
  PageHeaderContent,
  PageHeaderDescription,
  PageHeaderEyebrow,
  PageHeaderLeading,
  PageHeaderMeta,
  PageHeaderTitle,
} from '@gears-frontx/ui-kit';

// An object's page: the tall header with the Page Title role and a link to
// its parent, set above the page's main on the card surface
// (styles.surface: `background: var(--card);` in the page's own module)
<PageHeader size="lg" role="group" className={styles.surface}>
  <PageHeaderContent>
    <PageHeaderEyebrow>
      <a href="/customers">Customers</a>
    </PageHeaderEyebrow>
    <PageHeaderTitle typography="display">Northwind Traders</PageHeaderTitle>
  </PageHeaderContent>
</PageHeader>

// An account: a link beside the title
<PageHeader size="lg" role="group" className={styles.surface}>
  <PageHeaderContent>
    <PageHeaderTitle typography="display">Acme Corporation</PageHeaderTitle>
    <PageHeaderMeta>
      <Button
        variant="ghost"
        size="sm"
        icon={<ArrowLeftRightIcon />}
        render={<a href="/switch-account" />}
        nativeButton={false}
      >
        Switch account
      </Button>
    </PageHeaderMeta>
  </PageHeaderContent>
</PageHeader>

// The compact header: a back link and a badge beside the title
<PageHeader size="sm">
  <PageHeaderLeading>
    <Button
      variant="ghost"
      icon={<ArrowLeftIcon />}
      aria-label="Back to orders"
      render={<a href="/orders" />}
      nativeButton={false}
    />
  </PageHeaderLeading>
  <PageHeaderContent>
    <PageHeaderTitle>Order 1042</PageHeaderTitle>
    <PageHeaderMeta>
      <Badge variant="outline">Paid</Badge>
    </PageHeaderMeta>
  </PageHeaderContent>
</PageHeader>

// A section under the page's own header: an h2, tabs and actions. One Tabs
// holds the header and the panels: the list sits in the meta, and the panels
// it switches follow the header.
<Tabs defaultValue="summary">
  <PageHeader>
    <PageHeaderContent>
      <PageHeaderTitle render={<h2 />}>Overview</PageHeaderTitle>
      <PageHeaderMeta>
        <TabsList variant="line" aria-label="Overview sections">
          <TabsTrigger value="summary">Summary</TabsTrigger>
          <TabsTrigger value="delivery">Delivery</TabsTrigger>
        </TabsList>
      </PageHeaderMeta>
    </PageHeaderContent>
    <PageHeaderActions>
      <Button variant="outline">Edit dashboard</Button>
      <Button>Export</Button>
    </PageHeaderActions>
  </PageHeader>
  <TabsContent value="summary">…</TabsContent>
  <TabsContent value="delivery">…</TabsContent>
</Tabs>

// A header set inside a region that already pads its content
// (styles.header: `--page-header-inset: 0;` in the screen's own module)
<PageHeader border={false} className={styles.header}>
  <PageHeaderContent>
    <PageHeaderTitle render={<h2 />}>Invoices</PageHeaderTitle>
    <PageHeaderDescription>12 invoices · 3 overdue</PageHeaderDescription>
  </PageHeaderContent>
  <PageHeaderActions>
    <Button>New invoice</Button>
  </PageHeaderActions>
</PageHeader>
```

## Parts and their spacing

The root is a row: 16 after the leading control, 24 before the actions,
centred on the drawn minimum height, with the rule under it. The heights
include the rule, and a header whose content outgrows them grows past them,
keeping 4 above and below its content so it does not touch its edges.

`PageHeaderContent` is a grid of named areas - the eyebrow above, the title
and the content beside it on one line, the description under them - so a
part lands in its place whichever of the others are present. Write them in
that order: eyebrow, title, meta, description. The title and the content
beside it are each as wide as their content, and the rest of the row is an
empty flexible column, so a long eyebrow or description does not move the
meta away from the title. When the row runs short, the title and the meta
share it: content beside the title that is narrower than its share keeps
its width and the title truncates with an ellipsis, and when both are long
each gets half.

The eyebrow and the description are on the meta role (12/16), muted, 4 from
the title. The eyebrow holds text or a plain link - a link takes its colour,
turns the link colour with an underline on hover, and draws its focus ring
inside its own box, since the eyebrow clips its overflow for the ellipsis.
A `Breadcrumb` trail does not go there.

`PageHeaderMeta` sets its children 20 apart, the same 20 that separates it
from the title. `PageHeaderActions` sets its children 8 apart, does not
shrink, and wraps its controls onto further lines, 8 apart, when they do
not fit. Both take any content: buttons, menus, badges, a status, a toggle
group, section navigation.

`PageHeaderMeta` does not scroll or clip. A tab list or a set of links that
can outgrow the room beside the title goes in a block of its own with
`overflow-x: auto`, so it scrolls instead of running under the actions. A
scrolling block clips vertically too, so leave room in it for focus rings
and the tab indicator.

When the header's width inside its side insets is below 1024 - 1072
outside them at the default inset of 24 - the narrow layout applies. It is
a container query on the header itself, not the viewport. The content
beside the title moves under the description, the actions take a line of
their own, flush with the start, and the leading control stays on the
first line beside the text. Each line keeps 8 above and below it, on top
of the header's own 4, so wrapped lines touch neither the header's edges
nor each other.

## Surface and insets

The root paints no background: it takes the surface it is set on. A header
drawn on the card surface over a differently painted page - an object's
header above the content of its page, say - sets `background: var(--card)`
in a class of its own.

`--page-header-inset` sets both sides at once. A header that has to clear a
control of the shell at one edge, such as a panel toggle over its end,
sets `padding-inline-end` in its own class instead.

The header takes its width from its parent and does not size itself to its
content: the narrow layout measures the header, so the header cannot be
measured by what it holds. In normal flow, or as a stretched item of a grid
or a flex column, that is the full width. As an item of a flex row, give it
`flex: 1` or a width of its own - without one it collapses to its side
insets.

## Accessibility

- The title is an `h1`. A page has one: give every header below the page's
  own an `h2` with `render={<h2 />}`.
- The root is a `header` element. Inside `main`, `article`, `aside`, `nav`
  or `section` - or an element with role `main`, `article`,
  `complementary`, `navigation` or `region` - it is not a landmark; outside
  them it is a `banner`, a second one next to the application's top bar. A section's header goes
  inside the page's `main`. A header the layout keeps above `main` - an
  object's header over the tabs that switch between its pages, for one -
  passes `role="group"`, which a `header` element allows, so it is not a
  second banner.
- Navigation between pages in `PageHeaderMeta` is a `nav` with links and
  `aria-current="page"` on the current one. `Tabs` belong there only when
  they switch panels on the same page: a tab list is not a list of links.
  The kit has no component that draws page links in the line-tabs look.
- Name an icon-only control in `PageHeaderLeading` or `PageHeaderActions`
  with `aria-label`, as with any icon button.

## Anti-patterns

- Do not put the page's section navigation in `PageHeaderActions` - it goes
  in `PageHeaderMeta`, beside the title it belongs to.
- Do not put a long text in `PageHeaderMeta` - a sentence about the page is
  `PageHeaderDescription`.
- Do not leave every header an `h1` - a section's header under the page's
  own is an `h2`.
- Do not drop the rule with `border-bottom: none` - `border={false}` keeps
  the rule's width inside the header, so the text sits exactly where it
  does with the rule. A border removed in CSS moves the text by half a
  rule, and makes a header whose content outgrows the minimum height one
  rule shorter.
- Do not place `PageHeader` in a flex row without `flex: 1` or a width of
  its own - it collapses to its side insets.
- Do not render `Tabs` with links in them for navigation between pages -
  that is a `nav` of links, whatever it is drawn like.
