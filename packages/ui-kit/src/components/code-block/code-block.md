# CodeBlock

Code, terminal output, logs and diffs, with an optional header (title and
actions), line numbers, wrapping, diff and highlighted lines, and a small
size. A port of [shadcn/ui's base CodeBlock](https://ui.shadcn.com/docs/components/base/code-block)
to CSS Modules; no Base UI primitive.

Composition: `CodeBlock` (→ `CodeBlockHeader` (→ `CodeBlockTitle`,
`CodeBlockActions` (→ `CodeBlockCopyButton`)), `CodeBlockActions` (floating,
when there is no header), `CodeBlockContent` (→ `CodeBlockLine`),
`CodeBlockFooter`).

Syntax highlighting is not ported. Upstream keeps it in a separate hook
(`useHighlightedCode`, on Shiki), which would add a highlighter to every
consumer; a consumer that highlights renders the tokens inside
`CodeBlockLine` children.

## When to use

- An install or start command with a copy button.
- A file excerpt in a guide, terminal output, a log or a diff.

## When not to use

- A key or a shortcut: use `Kbd`.
- Code inside rendered Markdown or HTML: use the kit's `typeset.css`.
- A single path or name inside a line of text: use `Text` with
  `typography="mono"`.

## Props (kit level)

| Part | Prop | Type | Default |
|------|------|------|---------|
| `CodeBlock` | `variant` | `'default' \| 'destructive'` - `destructive` for error output, on `--destructive` | `'default'` |
| | `size` | `'default' \| 'sm'` - the body or the meta size, tighter insets at `sm` | `'default'` |
| `CodeBlockContent` | `wrap` | `boolean` - wrap long lines instead of scrolling sideways | `false` |
| | `lineNumbers` | `boolean` - number the lines; a string child is split into lines | `false` |
| | `startLine` | `number` - the first line's number | `1` |
| `CodeBlockLine` | `variant` | `'default' \| 'added' \| 'removed' \| 'highlighted'` - `added` and `removed` add a + or − marker | `'default'` |
| `CodeBlockCopyButton` | `value` | `string` - the text written to the clipboard | required |
| | `copyLabel`, `copiedLabel` | `string` - the button's name before and after a copy, and the announcement | `'Copy'`, `'Copied'` |

`CodeBlockCopyButton` is a kit `Button` (`variant="ghost"`, `size="sm"`,
icon-only) and takes the other Button props except `icon`, `end`,
`children`, `render`, `nativeButton` and `aria-label`: it draws its own
glyph and names itself from `copyLabel` and `copiedLabel`. `CodeBlockHeader`,
`CodeBlockTitle`, `CodeBlockActions` and `CodeBlockFooter` take their
element's props. The family ships `'use client'` (the copy button holds
state).

The edge fade of a scrolling block is the `scroll-fade-x` (or, wrapped,
`scroll-fade-y`) class from `utilities.css`: without that import the code
scrolls with no fade.

## Behavior

- `CodeBlockContent` is a `pre` that is always a tab stop, so a keyboard
  user can scroll a long line; keyboard focus marks the whole block with
  the kit's focus ring. It is always left to right; the header follows
  the page direction. Name it with `aria-label` when a page holds several
  blocks.
- A string child renders as one text node, so a block stays cheap while
  output streams. With `lineNumbers`, a string is split into lines; the
  numbers come from a CSS counter and stay out of a copied selection, and
  an empty line keeps a newline so blank lines survive the copy.
- A long `CodeBlockTitle` is cut with an ellipsis; to link the title to a
  file, wrap it in an anchor.
- `CodeBlockActions` placed straight in `CodeBlock` (no header) float over
  the top end of the block and show on hover or focus, and always on a
  touch screen.
- The copy button writes `value`, switches to a check glyph and
  `copiedLabel` for two seconds (a second copy restarts the two seconds)
  and says `copiedLabel` once in a polite live region. A refused write, or
  a page with no clipboard (an insecure context), changes nothing.
- Cap a long block's height with a `max-height` on `CodeBlockContent`; it
  scrolls inside the block.

## Examples

```tsx
import {
  CodeBlock,
  CodeBlockActions,
  CodeBlockContent,
  CodeBlockCopyButton,
  CodeBlockHeader,
  CodeBlockLine,
  CodeBlockTitle,
} from '@gears-frontx/ui-kit';

<CodeBlock>
  <CodeBlockHeader>
    <CodeBlockTitle>Terminal</CodeBlockTitle>
    <CodeBlockActions>
      <CodeBlockCopyButton value={command} />
    </CodeBlockActions>
  </CodeBlockHeader>
  <CodeBlockContent>{command}</CodeBlockContent>
</CodeBlock>

<CodeBlock size="sm">
  <CodeBlockContent lineNumbers>
    <CodeBlockLine variant="removed">return &lt;p&gt;Hello&lt;/p&gt;</CodeBlockLine>
    <CodeBlockLine variant="added">return &lt;p&gt;Hello, {'{name}'}&lt;/p&gt;</CodeBlockLine>
  </CodeBlockContent>
</CodeBlock>
```

## Anti-patterns

- Do not put a highlighter's HTML string into `CodeBlockContent`: render
  the tokens as elements inside `CodeBlockLine`.
- Do not wrap the whole block in a link or a button: it holds a focusable
  scroll region and its own actions.
