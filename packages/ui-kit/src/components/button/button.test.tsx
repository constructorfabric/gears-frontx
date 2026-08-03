import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Button } from './button';
import styles from './button.module.css';

afterEach(cleanup);

describe('Button', () => {
  it('renders a button with its content and base class', () => {
    render(<Button>Save</Button>);
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button.className).toContain(styles.button);
    expect(button).toHaveProperty('type', 'button');
  });

  it('applies variant and size classes from the CSS module', () => {
    render(
      <Button variant="outline" size="sm">
        Cancel
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Cancel' });
    expect(button.className).toContain(styles.variantOutline);
    expect(button.className).toContain(styles.sizeSm);
  });

  it('defaults to the primary variant and medium size', () => {
    render(<Button>Go</Button>);
    const button = screen.getByRole('button', { name: 'Go' });
    expect(button.className).toContain(styles.variantDefault);
    expect(button.className).toContain(styles.sizeDefault);
  });

  it('merges a consumer className and forwards props', () => {
    const onClick = vi.fn();
    render(
      <Button className="consumer" onClick={onClick} disabled={false}>
        Click
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Click' });
    expect(button.className).toContain('consumer');
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('renders a custom element via the render prop', () => {
    render(
      <Button render={<a href="/docs" />} variant="link">
        Docs
      </Button>,
    );
    const link = screen.getByRole('link', { name: 'Docs' });
    expect(link).toHaveProperty('tagName', 'A');
    expect(link.className).toContain(styles.button);
    expect(link.className).toContain(styles.variantLink);
  });

  it('does not fire clicks when disabled', () => {
    const onClick = vi.fn();
    render(
      <Button onClick={onClick} disabled>
        Nope
      </Button>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Nope' }));
    expect(onClick).not.toHaveBeenCalled();
  });
});
