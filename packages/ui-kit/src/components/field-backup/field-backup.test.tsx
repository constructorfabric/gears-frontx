import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Input } from '../input/input';
import { FieldBackup, FieldBackupDescription, FieldBackupError, FieldBackupLabel } from './field-backup';
import styles from './field-backup.module.css';

afterEach(cleanup);

describe('FieldBackup', () => {
  it('associates the label with the control automatically', () => {
    render(
      <FieldBackup name="email">
        <FieldBackupLabel>Email</FieldBackupLabel>
        <Input type="email" />
      </FieldBackup>,
    );
    const input = screen.getByLabelText('Email');
    expect(input).toHaveProperty('tagName', 'INPUT');
  });

  it('links the description via aria-describedby', () => {
    render(
      <FieldBackup name="email">
        <FieldBackupLabel>Email</FieldBackupLabel>
        <Input type="email" />
        <FieldBackupDescription>Used for the invoice only.</FieldBackupDescription>
      </FieldBackup>,
    );
    const input = screen.getByLabelText('Email');
    const description = screen.getByText('Used for the invoice only.');
    expect(description.className).toContain(styles.description);
    expect(input.getAttribute('aria-describedby')).toContain(description.id);
  });

  it('shows a forced error and marks the field invalid', () => {
    render(
      <FieldBackup name="slug" invalid>
        <FieldBackupLabel>Slug</FieldBackupLabel>
        <Input defaultValue="taken" />
        <FieldBackupError match={true}>Already taken.</FieldBackupError>
      </FieldBackup>,
    );
    const error = screen.getByText('Already taken.');
    expect(error.className).toContain(styles.error);
    expect(screen.getByLabelText('Slug').getAttribute('aria-invalid')).toBe('true');
  });

  it('dims and disables through the field root', () => {
    render(
      <FieldBackup name="locked" disabled>
        <FieldBackupLabel>Locked</FieldBackupLabel>
        <Input />
      </FieldBackup>,
    );
    expect(screen.getByLabelText('Locked')).toHaveProperty('disabled', true);
  });
});
