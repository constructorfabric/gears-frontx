import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Field, FieldDescription, FieldLabel } from '../field/field';
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

  it('composes inside a Field via manual id/htmlFor/aria-describedby wiring', () => {
    // Unlike Input (still a Base UI primitive, still auto-wires inside
    // FieldBackup), Textarea has no primitive to lean on and the
    // canonical Field wires nothing automatically — every id below is set
    // by hand, same as field.md's own examples.
    render(
      <Field>
        <FieldLabel htmlFor="notes">Notes</FieldLabel>
        <Textarea id="notes" disabled aria-describedby="notes-desc" />
        <FieldDescription id="notes-desc">Optional context.</FieldDescription>
      </Field>,
    );
    const textarea = screen.getByLabelText('Notes');
    expect(textarea).toHaveProperty('tagName', 'TEXTAREA');
    expect(textarea).toHaveProperty('disabled', true);
    const description = screen.getByText('Optional context.');
    expect(textarea.getAttribute('aria-describedby')).toBe(description.id);
  });
});
