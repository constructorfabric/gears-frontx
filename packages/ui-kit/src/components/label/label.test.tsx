import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Input } from '../input/input';
import { Label } from './label';
import styles from './label.module.css';

afterEach(cleanup);

describe('Label', () => {
  it('renders a native label with the base class', () => {
    render(<Label>Email</Label>);
    const label = screen.getByText('Email');
    expect(label).toHaveProperty('tagName', 'LABEL');
    expect(label.className).toContain(styles.label);
  });

  it('associates with a control via htmlFor', () => {
    render(
      <>
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" />
      </>,
    );
    expect(screen.getByLabelText('Email')).toHaveProperty('id', 'email');
  });

  it('merges a consumer className and forwards data attributes', () => {
    render(
      <Label className="consumer" data-disabled="">
        Name
      </Label>,
    );
    const label = screen.getByText('Name');
    expect(label.className).toContain(styles.label);
    expect(label.className).toContain('consumer');
    expect(label.hasAttribute('data-disabled')).toBe(true);
  });
});
