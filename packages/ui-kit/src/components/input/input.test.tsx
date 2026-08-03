import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Input } from './input';
import styles from './input.module.css';

afterEach(cleanup);

describe('Input', () => {
  it('renders a native input with the base class', () => {
    render(<Input placeholder="Search" />);
    const input = screen.getByPlaceholderText('Search');
    expect(input).toHaveProperty('tagName', 'INPUT');
    expect(input.className).toContain(styles.input);
  });

  it('reports value changes through onValueChange', () => {
    const onValueChange = vi.fn();
    render(<Input onValueChange={onValueChange} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'gears' } });
    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(onValueChange.mock.calls[0]?.[0]).toBe('gears');
  });

  it('merges a consumer className and forwards native props', () => {
    render(<Input className="consumer" type="email" defaultValue="a@b.c" required />);
    const input = screen.getByRole('textbox');
    expect(input.className).toContain(styles.input);
    expect(input.className).toContain('consumer');
    expect(input).toHaveProperty('type', 'email');
    expect(input).toHaveProperty('value', 'a@b.c');
    expect(input).toHaveProperty('required', true);
  });

  it('forwards the invalid state', () => {
    render(<Input aria-invalid={true} />);
    expect(screen.getByRole('textbox').getAttribute('aria-invalid')).toBe('true');
  });

  it('does not accept input when disabled', () => {
    const onValueChange = vi.fn();
    render(<Input disabled onValueChange={onValueChange} />);
    const input = screen.getByRole('textbox');
    expect(input).toHaveProperty('disabled', true);
  });
});
