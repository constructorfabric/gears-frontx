import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { declaredIn } from '../../__test-utils__/css-rules';
import {
  CodeBlock,
  CodeBlockActions,
  CodeBlockContent,
  CodeBlockCopyButton,
  CodeBlockFooter,
  CodeBlockHeader,
  CodeBlockLine,
  CodeBlockTitle,
} from './code-block';
import styles from './code-block.module.css';

const CODE = 'npm install\nnpm run dev';

const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
let writeText: ReturnType<typeof vi.fn>;

beforeEach(() => {
  writeText = vi.fn(() => Promise.resolve());
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  if (originalClipboard) {
    Object.defineProperty(navigator, 'clipboard', originalClipboard);
  } else {
    Reflect.deleteProperty(navigator, 'clipboard');
  }
});

function Example({ size }: { size?: 'sm' }) {
  return (
    <CodeBlock data-testid="block" size={size}>
      <CodeBlockHeader data-testid="header">
        <CodeBlockTitle>Terminal</CodeBlockTitle>
        <CodeBlockActions>
          <CodeBlockCopyButton value={CODE} />
        </CodeBlockActions>
      </CodeBlockHeader>
      <CodeBlockContent aria-label="Install and start">{CODE}</CodeBlockContent>
      <CodeBlockFooter data-testid="footer">Done</CodeBlockFooter>
    </CodeBlock>
  );
}

describe('CodeBlock', () => {
  it('renders the frame, its parts and the code as one text node', () => {
    render(<Example />);
    const block = screen.getByTestId('block');
    expect(block.className).toContain(styles.codeBlock);
    expect(block.className).toContain(styles.variantDefault);
    expect(block.className).toContain(styles.sizeDefault);
    expect(screen.getByTestId('header').className).toContain(styles.header);
    expect(screen.getByText('Terminal').className).toContain(styles.title);
    expect(screen.getByTestId('footer').className).toContain(styles.footer);
    const code = block.querySelector('pre > code');
    expect(code?.className).toBe(styles.code);
    expect(code?.childNodes).toHaveLength(1);
    expect(code?.textContent).toBe(CODE);
  });

  it('applies the destructive variant and the small size', () => {
    render(<CodeBlock data-testid="block" variant="destructive" size="sm" />);
    const block = screen.getByTestId('block');
    expect(block.className).toContain(styles.variantDestructive);
    expect(block.className).toContain(styles.sizeSm);
  });

  it('makes the content a left-to-right tab stop with the horizontal edge fade', () => {
    render(<Example />);
    const pre = screen.getByLabelText('Install and start');
    expect(pre.tagName).toBe('PRE');
    expect(pre.getAttribute('tabindex')).toBe('0');
    expect(pre.getAttribute('dir')).toBe('ltr');
    expect(pre.className).toContain(styles.content);
    expect(pre.className).toContain('scroll-fade-x');
    expect(pre.className).not.toContain(styles.wrap);
  });

  it('wraps with the vertical edge fade when asked', () => {
    render(<CodeBlockContent data-testid="pre" wrap>{CODE}</CodeBlockContent>);
    const pre = screen.getByTestId('pre');
    expect(pre.className).toContain(styles.wrap);
    expect(pre.className).toContain('scroll-fade-y');
    expect(pre.className).not.toContain('scroll-fade-x');
  });

  it('splits a string into numbered lines and resets the counter to the start line', () => {
    render(
      <CodeBlockContent data-testid="pre" lineNumbers startLine={12}>
        {'one\n\nthree\n'}
      </CodeBlockContent>,
    );
    const pre = screen.getByTestId('pre');
    expect(pre.className).toContain(styles.numbered);
    expect(pre.style.counterReset).toBe('line 11');
    const lines = pre.querySelectorAll(`.${styles.line}`);
    expect(Array.from(lines, (line) => line.textContent)).toEqual(['one', '\n', 'three']);
  });

  it('keeps the caller style next to the counter reset', () => {
    render(<CodeBlockContent data-testid="pre" style={{ maxHeight: 100 }} />);
    const pre = screen.getByTestId('pre');
    expect(pre.style.maxHeight).toBe('100px');
    expect(pre.style.counterReset).toBe('line 0');
  });

  it.each([
    ['added', styles.lineAdded],
    ['removed', styles.lineRemoved],
    ['highlighted', styles.lineHighlighted],
  ] as const)('marks an %s line', (variant, lineClass) => {
    render(
      <CodeBlockLine data-testid="line" variant={variant}>
        return a
      </CodeBlockLine>,
    );
    const line = screen.getByTestId('line');
    expect(line.className).toContain(styles.line);
    expect(line.className).toContain(lineClass);
  });

  it('keeps a newline in an empty line so a copied selection keeps it', () => {
    render(<CodeBlockLine data-testid="line" />);
    expect(screen.getByTestId('line').textContent).toBe('\n');
  });
});

describe('CodeBlockCopyButton', () => {
  it('copies its value, confirms and announces once, and resets after two seconds', async () => {
    vi.useFakeTimers();
    render(<CodeBlockCopyButton value={CODE} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    });
    expect(writeText).toHaveBeenCalledWith(CODE);
    expect(screen.getByRole('button', { name: 'Copied' })).toBeDefined();
    expect(document.querySelector('[aria-live="polite"]')?.textContent).toBe('Copied');
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByRole('button', { name: 'Copy' })).toBeDefined();
    expect(document.querySelector('[aria-live="polite"]')?.textContent).toBe('');
  });

  it('takes translated labels and calls the caller click handler', async () => {
    const onClick = vi.fn();
    render(
      <CodeBlockCopyButton value="x" copyLabel="Kopieren" copiedLabel="Kopiert" onClick={onClick} />,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Kopieren' }));
    });
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Kopiert' })).toBeDefined();
  });

  it('changes nothing when the clipboard refuses the write', async () => {
    writeText.mockImplementation(() => Promise.reject(new Error('denied')));
    render(<CodeBlockCopyButton value="x" />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    });
    expect(screen.getByRole('button', { name: 'Copy' })).toBeDefined();
    expect(document.querySelector('[aria-live="polite"]')?.textContent).toBe('');
  });
});

// jsdom does no layout, so the frame, the focus mark and the floating
// actions are read from the module source.
describe('CodeBlock drawn rules', () => {
  const declared = declaredIn(import.meta.url, 'code-block.module.css');

  it('frames the code on the input border and marks keyboard focus on the block', () => {
    expect(declared('.variantDefault', 'border')).toBe('var(--border-width) solid var(--input)');
    expect(declared('.codeBlock', 'border-radius')).toBe('var(--radius-lg)');
    expect(declared('.codeBlock:has(> .content:focus-visible)', 'box-shadow')).toBe(
      'inset 0 0 0 var(--ring-inset) var(--ring)',
    );
  });

  it('sets the code in the mono family on the relaxed line', () => {
    expect(declared('.content', 'font-family')).toBe('var(--font-mono)');
    expect(declared('.content', 'line-height')).toBe('1.625');
    expect(declared('.sizeSm:has(> .header) > .content', 'padding-block-start')).toBe(
      'calc(var(--space-1) * 1.5)',
    );
  });

  it('floats header-less actions and shows them on hover or focus', () => {
    expect(declared('.codeBlock > .actions', 'position')).toBe('absolute');
    expect(declared('.codeBlock > .actions', 'opacity')).toBe('0');
    expect(declared('.codeBlock:hover > .actions,\n.codeBlock:focus-within > .actions', 'opacity')).toBe(
      '1',
    );
  });

  it('spaces a title glyph and pulls the actions to the edge by upstream 6px steps', () => {
    expect(declared(':where(.title svg)', 'margin-inline-end')).toBe('calc(var(--space-1) * 1.5)');
    expect(declared('.actions', 'margin-inline-end')).toBe('calc(var(--space-1) * -1.5)');
  });
});
