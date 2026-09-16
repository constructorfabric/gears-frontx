import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { declarationMap, extractRules } from '../../__test-utils__/css-rules';

import { Button } from '../button/public';
import { ButtonGroup, ButtonGroupSeparator, ButtonGroupText } from './button-group';
import styles from './button-group.module.css';

afterEach(cleanup);

describe('ButtonGroup', () => {
  it('renders a group role with the base and default (horizontal) orientation class', () => {
    render(
      <ButtonGroup>
        <Button>One</Button>
        <Button>Two</Button>
      </ButtonGroup>,
    );
    const group = screen.getByRole('group');
    expect(group.className).toContain(styles.group);
    expect(group.className).toContain(styles.orientationHorizontal);
    expect(group.getAttribute('data-orientation')).toBe('horizontal');
  });

  it('switches to the vertical orientation class and data attribute', () => {
    render(
      <ButtonGroup orientation="vertical">
        <Button>One</Button>
        <Button>Two</Button>
      </ButtonGroup>,
    );
    const group = screen.getByRole('group');
    expect(group.className).toContain(styles.orientationVertical);
    expect(group.getAttribute('data-orientation')).toBe('vertical');
  });

  it('merges a consumer className and forwards native div props', () => {
    render(
      <ButtonGroup className="consumer" aria-label="Actions">
        <Button>One</Button>
      </ButtonGroup>,
    );
    const group = screen.getByRole('group', { name: 'Actions' });
    expect(group.className).toContain(styles.group);
    expect(group.className).toContain('consumer');
  });

  it('renders ButtonGroupText as a div by default with the text class', () => {
    render(<ButtonGroupText>$</ButtonGroupText>);
    const text = screen.getByText('$');
    expect(text).toHaveProperty('tagName', 'DIV');
    expect(text.className).toContain(styles.text);
  });

  it('renders ButtonGroupText through a custom render element', () => {
    render(<ButtonGroupText render={<label htmlFor="amount" />}>Amount</ButtonGroupText>);
    const text = screen.getByText('Amount');
    expect(text).toHaveProperty('tagName', 'LABEL');
    expect(text.className).toContain(styles.text);
  });

  it('renders ButtonGroupSeparator vertical by default (opposite of Separator itself)', () => {
    const { container } = render(<ButtonGroupSeparator />);
    const separator = container.firstElementChild;
    expect(separator?.getAttribute('data-orientation')).toBe('vertical');
    expect(separator?.className).toContain(styles.separator);
  });

  it('lets ButtonGroupSeparator opt into horizontal', () => {
    const { container } = render(<ButtonGroupSeparator orientation="horizontal" />);
    expect(container.firstElementChild?.getAttribute('data-orientation')).toBe('horizontal');
  });
});

/*
 * The drawn text part and divider. jsdom computes no layout, so the plate
 * fill, its hairline and the divider tone are asserted on the stylesheet.
 */
describe('ButtonGroup drawn text part and divider', () => {
  const rules = extractRules(
    readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'button-group.module.css'), 'utf8'),
  );

  function declared(selector: string, prop: string) {
    const rule = rules.find((candidate) => candidate.selector === selector);
    return rule ? declarationMap(rule.body).get(prop) : undefined;
  }

  it('fills the text part and gives it the same hairline its neighbours carry', () => {
    expect(declared('.text', 'background-color')).toBe('var(--muted)');
    expect(declared('.text', 'border')).toBe('var(--border-width) solid var(--border)');
    // Or the border would push the segment past the buttons beside it.
    expect(declared('.text', 'box-sizing')).toBe('border-box');
    expect(declared('.text svg', 'width')).toBe('var(--icon-size-sm)');
  });

  it('paints the divider in the field-border tone', () => {
    expect(declared(".group > .separator[data-orientation='vertical']", 'background-color')).toBe(
      'var(--input)',
    );
    expect(declared(".group > .separator[data-orientation='horizontal']", 'background-color')).toBe(
      'var(--input)',
    );
  });
});
