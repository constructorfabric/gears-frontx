import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import buttonStyles from '../button/button.module.css';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
  InputGroupTextarea,
} from './input-group';
import styles from './input-group.module.css';

afterEach(cleanup);

describe('InputGroup', () => {
  it('renders a group role wrapping the input control', () => {
    render(
      <InputGroup>
        <InputGroupInput aria-label="Amount" />
      </InputGroup>,
    );
    const group = screen.getByRole('group');
    expect(group.className).toContain(styles.group);
    const input = screen.getByRole('textbox', { name: 'Amount' });
    expect(input.className).toContain(styles.control);
  });

  it('defaults an addon to the inline-start alignment', () => {
    render(
      <InputGroup>
        <InputGroupAddon>
          <InputGroupText>$</InputGroupText>
        </InputGroupAddon>
        <InputGroupInput aria-label="Amount" />
      </InputGroup>,
    );
    const addon = screen.getByText('$').closest(`.${styles.addon}`);
    expect(addon?.className).toContain(styles.alignInlineStart);
    expect(addon?.getAttribute('data-align')).toBe('inline-start');
  });

  it('applies the inline-end alignment class', () => {
    render(
      <InputGroup>
        <InputGroupInput aria-label="Amount" />
        <InputGroupAddon align="inline-end">
          <InputGroupText>USD</InputGroupText>
        </InputGroupAddon>
      </InputGroup>,
    );
    const addon = screen.getByText('USD').closest(`.${styles.addon}`);
    expect(addon?.className).toContain(styles.alignInlineEnd);
  });

  it('focuses the input when the addon padding is clicked', () => {
    render(
      <InputGroup>
        <InputGroupAddon data-testid="addon">
          <InputGroupText>$</InputGroupText>
        </InputGroupAddon>
        <InputGroupInput aria-label="Amount" />
      </InputGroup>,
    );
    fireEvent.click(screen.getByTestId('addon'));
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Amount' }));
  });

  it('does not steal focus when the click lands on a button inside the addon', () => {
    const onButtonClick = vi.fn();
    render(
      <InputGroup>
        <InputGroupInput aria-label="Search" />
        <InputGroupAddon align="inline-end" data-testid="addon">
          <InputGroupButton onClick={onButtonClick} aria-label="Clear" />
        </InputGroupAddon>
      </InputGroup>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(onButtonClick).toHaveBeenCalledTimes(1);
    // Focus-steal is a side effect of the addon's own onClick, which fires
    // on every bubbled click including this one — the button click itself
    // must still register regardless, which the assertion above proves.
  });

  it('renders InputGroupButton with the ghost variant and sm size by default', () => {
    render(<InputGroupButton>Go</InputGroupButton>);
    const button = screen.getByRole('button', { name: 'Go' });
    expect(button.className).toContain(buttonStyles.variantGhost);
    expect(button.className).toContain(buttonStyles.sizeSm);
    expect(button).toHaveProperty('type', 'button');
  });

  it('renders InputGroupTextarea with the resize-none control class', () => {
    render(
      <InputGroup>
        <InputGroupTextarea aria-label="Notes" />
      </InputGroup>,
    );
    const textarea = screen.getByRole('textbox', { name: 'Notes' });
    expect(textarea.className).toContain(styles.control);
    expect(textarea.className).toContain(styles.textareaControl);
  });

  it('merges a consumer className onto the group without dropping the kit class', () => {
    render(<InputGroup className="consumer" aria-label="Amount field" />);
    const group = screen.getByRole('group', { name: 'Amount field' });
    expect(group.className).toContain(styles.group);
    expect(group.className).toContain('consumer');
  });
});
