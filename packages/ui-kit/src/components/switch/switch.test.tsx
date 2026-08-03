import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Switch } from './switch';
import styles from './switch.module.css';

afterEach(cleanup);

describe('Switch', () => {
  it('renders an unchecked switch with base and default size classes', () => {
    render(<Switch aria-label="Notifications" />);
    const toggle = screen.getByRole('switch', { name: 'Notifications' });
    expect(toggle.className).toContain(styles.switch);
    expect(toggle.className).toContain(styles.sizeDefault);
    expect(toggle.getAttribute('aria-checked')).toBe('false');
  });

  it('toggles on click and reports through onCheckedChange', () => {
    const onCheckedChange = vi.fn();
    render(<Switch aria-label="Notifications" onCheckedChange={onCheckedChange} />);
    const toggle = screen.getByRole('switch', { name: 'Notifications' });
    fireEvent.click(toggle);
    expect(onCheckedChange).toHaveBeenCalledTimes(1);
    expect(onCheckedChange.mock.calls[0]?.[0]).toBe(true);
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    expect(toggle.hasAttribute('data-checked')).toBe(true);
  });

  it('applies the sm size and merges a consumer className', () => {
    render(<Switch aria-label="Rule" size="sm" className="consumer" />);
    const toggle = screen.getByRole('switch', { name: 'Rule' });
    expect(toggle.className).toContain(styles.sizeSm);
    expect(toggle.className).toContain('consumer');
  });

  it('does not toggle when disabled', () => {
    const onCheckedChange = vi.fn();
    render(<Switch aria-label="Locked" disabled onCheckedChange={onCheckedChange} />);
    fireEvent.click(screen.getByRole('switch', { name: 'Locked' }));
    expect(onCheckedChange).not.toHaveBeenCalled();
  });
});
