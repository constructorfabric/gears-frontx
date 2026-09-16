import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { declarationMap, extractRules } from '../../__test-utils__/css-rules';

import { Toggle } from './toggle';
import styles from './toggle.module.css';

afterEach(cleanup);

describe('Toggle', () => {
  it('renders an unpressed toggle with base and default variant/size classes', () => {
    render(<Toggle aria-label="Bold" />);
    const toggle = screen.getByRole('button', { name: 'Bold' });
    expect(toggle.className).toContain(styles.toggle);
    expect(toggle.className).toContain(styles.variantDefault);
    expect(toggle.className).toContain(styles.sizeDefault);
    expect(toggle.hasAttribute('data-pressed')).toBe(false);
  });

  it('toggles on click and reports through onPressedChange', () => {
    const onPressedChange = vi.fn();
    render(<Toggle aria-label="Bold" onPressedChange={onPressedChange} />);
    const toggle = screen.getByRole('button', { name: 'Bold' });
    fireEvent.click(toggle);
    expect(onPressedChange).toHaveBeenCalledTimes(1);
    expect(onPressedChange.mock.calls[0]?.[0]).toBe(true);
    expect(toggle.hasAttribute('data-pressed')).toBe(true);
  });

  it('applies the outline variant and lg size, and merges a consumer className', () => {
    render(
      <Toggle aria-label="Italic" variant="outline" size="lg" className="consumer" />,
    );
    const toggle = screen.getByRole('button', { name: 'Italic' });
    expect(toggle.className).toContain(styles.variantOutline);
    expect(toggle.className).toContain(styles.sizeLg);
    expect(toggle.className).toContain('consumer');
  });

  it('supports an uncontrolled defaultPressed', () => {
    render(<Toggle aria-label="Starred" defaultPressed />);
    expect(screen.getByRole('button', { name: 'Starred' }).hasAttribute('data-pressed')).toBe(
      true,
    );
  });

  it('does not toggle when disabled', () => {
    const onPressedChange = vi.fn();
    render(<Toggle aria-label="Locked" disabled onPressedChange={onPressedChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Locked' }));
    expect(onPressedChange).not.toHaveBeenCalled();
  });
});

/*
 * The drawn steel variant. Pressed has to hold its fill under the pointer,
 * which is a source-order relationship no rendered assertion reaches in
 * jsdom, so the rules are read off the stylesheet.
 */
describe('Toggle steel variant', () => {
  const rules = extractRules(
    readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'toggle.module.css'), 'utf8'),
  );

  function declared(selector: string, prop: string) {
    const rule = rules.find(
      (candidate) => candidate.selector.replace(/\s*,\s*/g, ',').replace(/\s+/g, ' ').trim() === selector,
    );
    return rule ? declarationMap(rule.body).get(prop) : undefined;
  }

  it('applies the steel class', () => {
    render(
      <Toggle aria-label="Bold" variant="steel">
        B
      </Toggle>,
    );
    expect(screen.getByRole('button', { name: 'Bold' }).className).toContain(styles.variantSteel);
  });

  it('draws a hairline over nothing and fills with --muted on hover', () => {
    expect(declared('.variantSteel', 'border-color')).toBe('var(--border)');
    expect(declared('.variantSteel', 'background-color')).toBe('transparent');
    // The drawn hover fill binds a product-owned neutral this kit excludes
    // by ownership; --muted is the kit-generic role at that value.
    expect(declared('.variantSteel:hover', 'background-color')).toBe('var(--muted)');
  });

  it('holds the pressed fill under the pointer', () => {
    expect(
      declared('.variantSteel[data-pressed],.variantSteel[data-pressed]:hover', 'background-color'),
    ).toBe('var(--secondary)');
  });
});
