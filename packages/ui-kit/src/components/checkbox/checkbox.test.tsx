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

  it('renders size="default" and an omitted size as the exact same class list', () => {
    render(
      <>
        <Checkbox aria-label="Omitted" />
        <Checkbox aria-label="Explicit" size="default" />
      </>,
    );
    expect(screen.getByRole('checkbox', { name: 'Omitted' }).className).toBe(
      screen.getByRole('checkbox', { name: 'Explicit' }).className,
    );
  });

  it('applies the sm size class only for size="sm"', () => {
    render(<Checkbox aria-label="Dense" size="sm" />);
    const checkbox = screen.getByRole('checkbox', { name: 'Dense' });
    expect(checkbox.className).toContain(styles.sizeSm);
    expect(checkbox.className).not.toContain(styles.sizeDefault);
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
 * Reads the module's own source, the way badge.test.tsx does: the size axis
 * is only honest if the two steps differ in the box alone. jsdom computes
 * no styles, so the assertion is on the declarations.
 */
describe('Checkbox size axis', () => {
  const rules = extractRules(
    readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'checkbox.module.css'), 'utf8'),
  );

  function declared(selector: string, prop: string) {
    const rule = rules.find((candidate) => candidate.selector === selector);
    return rule ? declarationMap(rule.body).get(prop) : undefined;
  }

  it('moves the control box between the two steps and nothing else', () => {
    expect(declared('.sizeSm', 'width')).toBe('var(--icon-size-sm)');
    expect(declared('.sizeDefault', 'width')).toBe('var(--icon-size-md)');
    // A box on the base rule would compete with the two steps; the radius
    // and the glyph stay there because the spec draws one of each.
    expect(declared('.checkbox', 'width')).toBeUndefined();
    expect(declared('.checkbox', 'border-radius')).toBe('var(--radius-sm)');
    expect(declared('.icon', 'width')).toBe('var(--icon-size-xs)');
  });

  it('states the interaction row as a height, so both steps get the drawn 32px', () => {
    // A negative inset would have to be recomputed per size to hold 32, and
    // the two would drift the moment either box moved.
    expect(declared('.checkbox::after', 'height')).toBe('var(--control-height-sm)');
    expect(declared('.checkbox::after', 'inset')).toBeUndefined();
  });
});
