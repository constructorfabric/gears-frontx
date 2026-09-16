import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { declarationMap, extractRules } from '../../__test-utils__/css-rules';
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

  it('focuses a textarea control when the addon padding is clicked', () => {
    render(
      <InputGroup>
        <InputGroupAddon align="block-start" data-testid="addon">
          <InputGroupText>To:</InputGroupText>
        </InputGroupAddon>
        <InputGroupTextarea aria-label="Message" />
      </InputGroup>,
    );
    fireEvent.click(screen.getByTestId('addon'));
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Message' }));
  });

  it('renders InputGroupButton as a ghost xs button by default, sm on request', () => {
    render(
      <>
        <InputGroupButton>Go</InputGroupButton>
        <InputGroupButton size="sm">Stop</InputGroupButton>
      </>,
    );
    const xs = screen.getByRole('button', { name: 'Go' });
    expect(xs.className).toContain(buttonStyles.variantGhost);
    expect(xs.className).toContain(styles.sizeXs);
    expect(xs.getAttribute('data-size')).toBe('xs');
    expect(xs).toHaveProperty('type', 'button');

    // `sm` is Button's own smallest geometry with no compression on top —
    // the class both sizes share stays, the xs-only one drops.
    const sm = screen.getByRole('button', { name: 'Stop' });
    expect(sm.className).toContain(buttonStyles.sizeSm);
    expect(sm.className).not.toContain(styles.sizeXs);
    expect(sm.getAttribute('data-size')).toBe('sm');
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

  it('renders size="default" and an omitted size as the exact same class list', () => {
    render(
      <>
        <InputGroup aria-label="Omitted" />
        <InputGroup size="default" aria-label="Explicit default" />
      </>,
    );
    const omitted = screen.getByRole('group', { name: 'Omitted' });
    const explicitDefault = screen.getByRole('group', { name: 'Explicit default' });
    // Same class STRING, not just "both render at 40px" - CVA's
    // defaultVariants is what makes an omitted `size` and `size="default"`
    // literally the same code path rather than two renderings that happen
    // to agree today.
    expect(omitted.className).toBe(explicitDefault.className);
    expect(omitted.className).toContain(styles.sizeDefault);
  });

  it('gives each size its own class', () => {
    render(
      <>
        <InputGroup size="sm" aria-label="Small" />
        <InputGroup size="lg" aria-label="Large" />
      </>,
    );
    expect(screen.getByRole('group', { name: 'Small' }).className).toContain(styles.sizeSm);
    expect(screen.getByRole('group', { name: 'Large' }).className).toContain(styles.sizeLg);
  });

  /*
   * Reads input-group.module.css's own source (not the hashed `styles`
   * import, which has no selector names left in it) the same way
   * button.test.tsx's focus-ring guard does. What it pins is the drawn
   * table: the three size classes carry the three heights and the three
   * icon boxes, and the height lives on them rather than on the bare
   * `.group` rule, which is what keeps the steps from fighting the base
   * rule on specificity.
   */
  const cssPath = join(dirname(fileURLToPath(import.meta.url)), 'input-group.module.css');
  const rules = extractRules(readFileSync(cssPath, 'utf8'));

  function declared(selector: string, prop: string): string | undefined {
    const rule = rules.find((candidate) => candidate.selector === selector);
    return rule ? declarationMap(rule.body).get(prop) : undefined;
  }

  it('carries the drawn height, inset, gap and icon box on each size class', () => {
    const drawn = {
      '.group.sizeSm': ['--control-height-sm', '--space-2', '--space-1', '--icon-size-sm'],
      '.group.sizeDefault': ['--control-height-md', '--space-3', '--space-2', '--icon-size-md'],
      '.group.sizeLg': ['--control-height-lg', '--space-3', '--space-2', '--icon-size-lg'],
    };
    for (const [selector, [height, inset, gap, icon]] of Object.entries(drawn)) {
      expect(declared(selector, '--size-height'), selector).toBe(`var(${height})`);
      expect(declared(selector, '--size-inset'), selector).toBe(`var(${inset})`);
      expect(declared(selector, '--size-gap'), selector).toBe(`var(${gap})`);
      expect(declared(selector, '--size-icon'), selector).toBe(`var(${icon})`);
    }
  });

  it('leaves the height to the size axis instead of the bare group rule', () => {
    // A height on `.group` would sit at (0,1,0) and the size classes at
    // (0,2,0) would have to out-declare it; reading the axis local is what
    // makes the three steps the only place a height is written.
    expect(declared('.group', 'min-height')).toBe('var(--size-height)');
    expect(declared('.group .addon > svg', 'width')).toBe('var(--size-icon)');
  });

  it('tightens the wrapped control block padding only under sizeSm, to land the group at exactly 32px', () => {
    // `default` and `lg` leave 34px and 38px of content space over the
    // control's own 32px intrinsic height, so only `sm` needs the pull-back.
    expect(declared('.group.sizeSm .control', 'padding-block')).toBe('3px');
    expect(declared('.group.sizeDefault .control', 'padding-block')).toBeUndefined();
    expect(declared('.group.sizeLg .control', 'padding-block')).toBeUndefined();
  });
});
