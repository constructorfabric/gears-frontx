import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Input } from '../input/input';
import { Field, FieldDescription, FieldError, FieldLabel } from './field';
import styles from './field.module.css';

afterEach(cleanup);

describe('Field', () => {
  it('associates the label with the control automatically', () => {
    render(
      <Field name="email">
        <FieldLabel>Email</FieldLabel>
        <Input type="email" />
      </Field>,
    );
    const input = screen.getByLabelText('Email');
    expect(input).toHaveProperty('tagName', 'INPUT');
  });

  it('links the description via aria-describedby', () => {
    render(
      <Field name="email">
        <FieldLabel>Email</FieldLabel>
        <Input type="email" />
        <FieldDescription>Used for the invoice only.</FieldDescription>
      </Field>,
    );
    const input = screen.getByLabelText('Email');
    const description = screen.getByText('Used for the invoice only.');
    expect(description.className).toContain(styles.description);
    expect(input.getAttribute('aria-describedby')).toContain(description.id);
  });

  it('shows a forced error and marks the field invalid', () => {
    render(
      <Field name="slug" invalid>
        <FieldLabel>Slug</FieldLabel>
        <Input defaultValue="taken" />
        <FieldError match={true}>Already taken.</FieldError>
      </Field>,
    );
    const error = screen.getByText('Already taken.');
    expect(error.className).toContain(styles.error);
    expect(screen.getByLabelText('Slug').getAttribute('aria-invalid')).toBe('true');
  });

  it('dims and disables through the field root', () => {
    render(
      <Field name="locked" disabled>
        <FieldLabel>Locked</FieldLabel>
        <Input />
      </Field>,
    );
    expect(screen.getByLabelText('Locked')).toHaveProperty('disabled', true);
  });
});
