import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Textarea } from './textarea';
import styles from './textarea.module.css';

afterEach(cleanup);

describe('Textarea', () => {
  it('renders a native textarea with the base class', () => {
    render(<Textarea placeholder="Notes" />);
    const textarea = screen.getByPlaceholderText('Notes');
    expect(textarea).toHaveProperty('tagName', 'TEXTAREA');
    expect(textarea.className).toContain(styles.textarea);
  });

  it('forwards value changes', () => {
    const onChange = vi.fn();
    render(<Textarea onChange={onChange} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'line one' } });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('textbox')).toHaveProperty('value', 'line one');
  });

  it('merges a consumer className and forwards native props', () => {
    render(<Textarea className="consumer" rows={6} disabled />);
    const textarea = screen.getByRole('textbox');
    expect(textarea.className).toContain(styles.textarea);
    expect(textarea.className).toContain('consumer');
    expect(textarea).toHaveProperty('rows', 6);
    expect(textarea).toHaveProperty('disabled', true);
  });

  it('forwards the invalid state', () => {
    render(<Textarea aria-invalid={true} />);
    expect(screen.getByRole('textbox').getAttribute('aria-invalid')).toBe('true');
  });
});
