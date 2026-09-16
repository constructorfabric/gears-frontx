import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { declarationMap, extractRules } from '../../__test-utils__/css-rules';
import { Checkbox } from './checkbox';
import styles from './checkbox.module.css';

afterEach(cleanup);

describe('Checkbox', () => {
  it('renders an unchecked checkbox with the base class', () => {
    render(<Checkbox aria-label="Terms" />);
    const checkbox = screen.getByRole('checkbox', { name: 'Terms' });
    expect(checkbox.className).toContain(styles.checkbox);
    expect(checkbox.getAttribute('aria-checked')).toBe('false');
    expect(checkbox.hasAttribute('data-unchecked')).toBe(true);
  });

  it('toggles on click and reports through onCheckedChange', () => {
    const onCheckedChange = vi.fn();
    render(<Checkbox aria-label="Terms" onCheckedChange={onCheckedChange} />);
    const checkbox = screen.getByRole('checkbox', { name: 'Terms' });
    fireEvent.click(checkbox);
    expect(onCheckedChange).toHaveBeenCalledTimes(1);
    expect(onCheckedChange.mock.calls[0]?.[0]).toBe(true);
    expect(checkbox.getAttribute('aria-checked')).toBe('true');
    expect(checkbox.hasAttribute('data-checked')).toBe(true);
  });

  it('respects defaultChecked and merges a consumer className', () => {
    render(<Checkbox aria-label="Terms" defaultChecked className="consumer" />);
    const checkbox = screen.getByRole('checkbox', { name: 'Terms' });
    expect(checkbox.getAttribute('aria-checked')).toBe('true');
    expect(checkbox.className).toContain(styles.checkbox);
    expect(checkbox.className).toContain('consumer');
  });

  it('renders a distinct indeterminate state', () => {
    render(<Checkbox aria-label="Partial" indeterminate />);
    const checkbox = screen.getByRole('checkbox', { name: 'Partial' });
    expect(checkbox.getAttribute('aria-checked')).toBe('mixed');
    const indicator = checkbox.querySelector(`.${styles.indicator}`);
    expect(indicator?.hasAttribute('data-indeterminate')).toBe(true);
    expect(indicator?.querySelector(`.${styles.iconIndeterminate}`)).toBeTruthy();
  });

  it('does not toggle when disabled', () => {
    const onCheckedChange = vi.fn();
    render(<Checkbox aria-label="Terms" disabled onCheckedChange={onCheckedChange} />);
    const checkbox = screen.getByRole('checkbox', { name: 'Terms' });
    fireEvent.click(checkbox);
    expect(onCheckedChange).not.toHaveBeenCalled();
    // The root is a <span>, so the disabled style hangs off data-disabled.
    expect(checkbox.hasAttribute('data-disabled')).toBe(true);
  });
});

/*
 * Reads the module's own source, the way badge.test.tsx does: jsdom
 * computes no styles, so the drawn box, corner, glyph and hit area are
 * asserted on the declarations.
 */
describe('Checkbox drawn geometry', () => {
  const rules = extractRules(
    readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'checkbox.module.css'), 'utf8'),
  );

  function declared(selector: string, prop: string) {
    const rule = rules.find((candidate) => candidate.selector === selector);
    return rule ? declarationMap(rule.body).get(prop) : undefined;
  }

  it('carries the one drawn box and corner on the base rule', () => {
    expect(declared('.checkbox', 'width')).toBe('var(--icon-size-sm)');
    expect(declared('.checkbox', 'height')).toBe('var(--icon-size-sm)');
    expect(declared('.checkbox', 'border-radius')).toBe('var(--radius-xs)');
  });

  // 14 is not on the icon scale (12 / 16 / 20 / 24). Rounding it onto a
  // step would be a kit-side correction of a drawn value, so the literal
  // is pinned here instead.
  it('draws the mark at the drawn 14, off the icon scale', () => {
    expect(declared('.icon', 'width')).toBe('14px');
    expect(declared('.icon', 'height')).toBe('14px');
  });

  it('states the hit area as the two drawn insets around the box', () => {
    // 16 + 8 + 8 on the block axis is the drawn 32px row; the inline reach
    // is wider, which is also drawn.
    expect(declared('.checkbox::after', 'inset-inline')).toBe('calc(-1 * var(--space-3))');
    expect(declared('.checkbox::after', 'inset-block')).toBe('calc(-1 * var(--space-2))');
  });
});
