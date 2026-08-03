import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

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
