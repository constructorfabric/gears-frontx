import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { declarationMap, extractRules } from '../../__test-utils__/css-rules';
import { Spinner } from './spinner';
import styles from './spinner.module.css';

afterEach(cleanup);

describe('Spinner', () => {
  it('renders an svg with the base class and the loading icon path', () => {
    const { container } = render(<Spinner data-testid="spinner" />);
    // `querySelector('svg')` (not `screen.getByTestId`, typed as a plain
    // HTMLElement) so `className` is statically an `SVGAnimatedString` —
    // matching what it actually is at runtime on an SVG element — instead
    // of the `string` testing-library's HTMLElement-typed getters would
    // give it, which has no `.baseVal` at all.
    const spinner = container.querySelector('svg');
    expect(spinner).not.toBeNull();
    expect(spinner?.className.baseVal).toContain(styles.spinner);
    expect(spinner?.querySelector('path')).not.toBeNull();
  });

  it('announces itself as a status with a default loading label', () => {
    render(<Spinner />);
    const spinner = screen.getByRole('status');
    expect(spinner.getAttribute('aria-label')).toBe('Loading');
  });

  it('lets a consumer override the default label and role', () => {
    render(<Spinner aria-label="Saving" role="alert" data-testid="spinner" />);
    const spinner = screen.getByTestId('spinner');
    expect(spinner.getAttribute('aria-label')).toBe('Saving');
    expect(spinner.getAttribute('role')).toBe('alert');
  });

  it('merges a consumer className without dropping the kit class', () => {
    const { container } = render(<Spinner className="consumer" data-testid="spinner" />);
    const spinner = container.querySelector('svg');
    expect(spinner).not.toBeNull();
    expect(spinner?.className.baseVal).toContain(styles.spinner);
    expect(spinner?.className.baseVal).toContain('consumer');
  });

  it('forwards native svg props such as id', () => {
    render(<Spinner id="save-spinner" data-testid="spinner" />);
    expect(screen.getByTestId('spinner')).toHaveProperty('id', 'save-spinner');
  });
});

/*
 * The composed block. Its whole point is that a labelled spinner announces
 * the text a reader can also see instead of a second hardcoded "Loading",
 * and that a label rendering nothing leaves the bare shape untouched - so
 * both branches are checked from the accessibility tree, not from classes.
 */
describe('Spinner with text', () => {
  const rules = extractRules(
    readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'spinner.module.css'), 'utf8'),
  );

  function declared(selector: string, prop: string) {
    const rule = rules.find((candidate) => candidate.selector === selector);
    return rule ? declarationMap(rule.body).get(prop) : undefined;
  }

  it('makes the block the live region and the glyph decorative', () => {
    const { container } = render(<Spinner label="Saving" description="This can take a minute" />);
    const status = screen.getByRole('status');
    expect(status.tagName).toBe('DIV');
    expect(status.className).toContain(styles.block);
    expect(status.textContent).toBe('SavingThis can take a minute');
    const glyph = container.querySelector('svg');
    expect(glyph?.getAttribute('aria-hidden')).toBe('true');
    expect(glyph?.hasAttribute('aria-label')).toBe(false);
  });

  it('sends a consumer role and aria-live to the block, keeping the glyph hidden', () => {
    const { container } = render(
      <Spinner label="Saving" role="presentation" aria-live="off" aria-atomic="true" />,
    );
    const block = container.querySelector('div');
    expect(block?.className).toContain(styles.block);
    expect(block?.getAttribute('role')).toBe('presentation');
    expect(block?.getAttribute('aria-live')).toBe('off');
    expect(block?.getAttribute('aria-atomic')).toBe('true');
    const glyph = container.querySelector('svg');
    expect(glyph?.getAttribute('aria-hidden')).toBe('true');
    expect(glyph?.hasAttribute('role')).toBe(false);
  });

  it('drops the role instead of defaulting it when a consumer passes role={undefined}', () => {
    const { container } = render(<Spinner label="Saving" role={undefined} />);
    const block = container.querySelector('div');
    expect(block?.hasAttribute('role')).toBe(false);
  });

  it('composes on a description alone, and stays bare on text that renders nothing', () => {
    const { rerender } = render(<Spinner description="Fetching rows" />);
    expect(screen.getByRole('status').tagName).toBe('DIV');
    rerender(<Spinner label={false} />);
    const bare = screen.getByRole('status');
    expect(bare.tagName).toBe('svg');
    expect(bare.getAttribute('aria-label')).toBe('Loading');
  });

  it('marks compact on whichever element is the root', () => {
    const { rerender } = render(<Spinner compact label="Saving" />);
    expect(screen.getByRole('status').hasAttribute('data-compact')).toBe(true);
    rerender(<Spinner compact />);
    expect(screen.getByRole('status').hasAttribute('data-compact')).toBe(true);
  });

  it('draws the indicator and glyph at both drawn steps', () => {
    expect(declared('.indicator', 'width')).toBe('2.25rem');
    expect(declared('.indicator .spinner', 'width')).toBe('18px');
    expect(declared('.block[data-compact] .indicator', 'width')).toBe('1.75rem');
    expect(declared('.block[data-compact] .indicator .spinner', 'width')).toBe('14px');
    expect(declared('.spinner[data-compact]', 'width')).toBe('14px');
  });

  it('tracks the drawn label out over the monospace micro role', () => {
    expect(declared('.label', 'font-family')).toBe('var(--font-mono)');
    expect(declared('.label', 'font-size')).toBe('var(--text-mono-size)');
    expect(declared('.label', 'letter-spacing')).toBe('0.08em');
    expect(declared('.label', 'text-transform')).toBe('uppercase');
  });
});
