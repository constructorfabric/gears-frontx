# MessageScroller

A chat-transcript scroller with auto-follow: it sticks to the newest message
while the user is at the bottom, stops following the moment they scroll up
to read history, and exposes a floating button to jump back. Behavior
(scroll tracking, anchor bookkeeping, the imperative `scrollTo*` API) comes
from **`@shadcn/react/message-scroller`**, a headless, zero-runtime-dep
engine — a dependency deviation from the kit's usual Base UI foundation,
approved 2026-08-20 (see `shadcn-porting-map.md`), taken because Base UI
ships no chat-scroller primitive. This file supplies only CSS Modules
styling and composes the kit `Button` for the jump affordance.

Composition: `MessageScrollerProvider` (holds auto-follow state, wrap once
per scroller) → `MessageScroller` (root frame) → `MessageScrollerViewport`
(the scrolling element) → `MessageScrollerContent` (message list) →
`MessageScrollerItem` (one message), with `MessageScrollerButton` as a
sibling of the viewport, absolutely positioned within the root.

## When to use

- A chat/conversation transcript that should auto-scroll to new messages
  but yield control the instant the user scrolls up to read older ones.

## When not to use

- A generic scrollable panel with no auto-follow need — a plain styled
  `overflow-y: auto` container, or `scroll-area` once ported, is simpler.
- A virtualized list with windowing (only rendered items exist in the DOM) —
  this component keeps every `MessageScrollerItem` mounted
  (`content-visibility: auto` trims paint cost, not DOM presence).

## Props (kit level)

`MessageScrollerProvider`: `autoScroll`, `defaultScrollPosition`
(`'start' | 'end' | 'last-anchor'`), `scrollEdgeThreshold`,
`scrollPreviousItemPeek`, `scrollMargin` — see
`useMessageScroller`/`useMessageScrollerScrollable`/
`useMessageScrollerVisibility` below for reading state back out.

`MessageScrollerItem`: `messageId` (target for `scrollToMessage`),
`scrollAnchor` (marks the item auto-follow/visibility tracking treats as
the current read position — typically the newest message).

`MessageScrollerButton`:

| Prop | Type | Default |
|------|------|---------|
| `direction` | `'end' \| 'start'` | `'end'` |
| `variant` | kit `Button` variant | `'secondary'` |
| `size` | kit `Button` size | `'sm'` |
| `render` | element to render as — defaults to a kit `Button` with the arrow icon | — |
| `aria-label` | accessible name | `'Scroll to end'` / `'Scroll to start'` |
| `className` | merged after the kit class | — |

Renders as a kit `Button` via `render` (same composition idiom as
`AlertDialogCancel`/`AlertDialogAction`) and is icon-only by default — no
visible label, so `Button`'s own icon-only square sizing applies. Pass
`children` to render a labeled button instead; passing `render` replaces
the composed `Button` entirely (any element accepting `className`/`ref`
works, e.g. a router `<Link>`).

Hooks (re-exported, call anywhere under `MessageScrollerProvider`):
`useMessageScroller()` — `{ scrollToEnd, scrollToMessage, scrollToStart }`;
`useMessageScrollerScrollable()` — `{ start, end }`, whether more content
exists past each edge; `useMessageScrollerVisibility()` —
`{ currentAnchorId, visibleMessageIds }`.

## Behavior notes

- **Short transcripts bottom-anchor.** `MessageScrollerContent` renders
  `justify-content: flex-end` whenever it directly contains at least one
  `MessageScrollerItem` (detected via the `data-scroll-anchor` attribute
  every item carries), so a transcript shorter than its viewport pushes its
  messages down to sit flush against whatever follows the scroller (a
  composer, typically) instead of leaving a permanent gap there. A plain
  reading surface built from `MessageScrollerContent` without any
  `MessageScrollerItem` (see the mail reading pane's history-toggle +
  message body markup) never matches and keeps ordinary top-anchored flow.
  This is pure CSS, scoped by markup shape - no prop to pass, no per-
  consumer compensation.

## Deviations from upstream

- **Icon-only by default, via `aria-label`.** Upstream always renders a
  visually-hidden `sr-only` label span inside the button; this kit's
  `Button` treats any non-empty `children` as a visible label (driving its
  own icon-only auto-sizing), so an `sr-only` span would have forced the
  wide pill shape instead of the compact circle. This component passes an
  explicit `''` to suppress the primitive's own visible-text fallback (it
  falls back to real text whenever `children` is nullish, not merely
  omitted) and supplies the accessible name via `aria-label` instead —
  the kit's standing convention for bare icon buttons (see `button.md`).
- **No scroll-fade edge mask.** Upstream's viewport also carries a
  `scroll-fade-b` Tailwind utility (a gradient mask hinting more content
  below) and a `scrollbar-thin` utility. Both are separate, not-yet-ported
  utility items in `shadcn-porting-map.md` ("Non-component items");
  the viewport here uses the platform default scrollbar and no fade mask.
- **No manual recolor on the button.** Upstream repaints the composed
  `Button` to `border-border bg-background text-foreground` regardless of
  the `variant` it passes. This wrapper leaves color entirely to the kit
  `Button`'s own `variant` (default `secondary`), so it looks like every
  other secondary button in the kit rather than a one-off recolor.

## Examples

```tsx
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
  useMessageScrollerScrollable,
} from '@gears-frontx/ui-kit';

function Transcript({ messages }: { messages: { id: string; text: string }[] }) {
  const { end } = useMessageScrollerScrollable();
  return (
    <MessageScrollerProvider>
      <MessageScroller style={{ height: 480 }}>
        <MessageScrollerViewport>
          <MessageScrollerContent>
            {messages.map((message, index) => (
              <MessageScrollerItem
                key={message.id}
                messageId={message.id}
                scrollAnchor={index === messages.length - 1}
              >
                {message.text}
              </MessageScrollerItem>
            ))}
          </MessageScrollerContent>
        </MessageScrollerViewport>
        {end && <MessageScrollerButton direction="end" />}
      </MessageScroller>
    </MessageScrollerProvider>
  );
}
```

## Testing

jsdom implements neither real scrolling (`scrollHeight`/`clientHeight`
always read 0) nor `content-visibility`, so auto-follow tracking, the
`data-active`/`data-scrollable` states derived from real scroll position,
and the render-cost skip from `content-visibility: auto` cannot be
exercised under vitest. `message-scroller.test.tsx` covers part rendering,
class/prop wiring, and the `Button` composition (default icon-only sizing,
`aria-label` override, a fully custom `render` target) instead — behavior
that doesn't depend on layout.

## Anti-patterns

- Do not nest more than one `MessageScrollerProvider`/`MessageScroller` per
  scroller — the auto-follow state is per-provider.
- Do not rely on `MessageScrollerButton`'s default icon-only rendering AND
  omit `aria-label` while also passing empty/whitespace `children` — the
  button would carry no accessible name at all.
