import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { declaredIn } from '../../__test-utils__/css-rules';
import { Heading, headingVariants } from './heading';
import styles from './heading.module.css';

afterEach(cleanup);

describe('Heading', () => {
  it('renders an h2 on the heading-1 role by default', () => {
    render(<Heading>Members</Heading>);
    const heading = screen.getByRole('heading', { level: 2, name: 'Members' });
    expect(heading.className).toContain(styles.heading);
    expect(heading.className).toContain(styles.typographyHeading1);
  });

  it.each([
    ['display', styles.typographyDisplay],
    ['heading-1', styles.typographyHeading1],
    ['heading-2', styles.typographyHeading2],
  ] as const)('applies the %s role class', (typography, roleClass) => {
    render(<Heading typography={typography}>Title</Heading>);
    expect(screen.getByRole('heading').className).toContain(roleClass);
  });

  it('resolves an explicit null typography to the default role', () => {
    render(<Heading typography={null}>Title</Heading>);
    expect(screen.getByRole('heading').className).toContain(styles.typographyHeading1);
  });

  it('keeps the outline level and the look independent through render', () => {
    render(
      <Heading typography="display" render={<h1 />}>
        Settings
      </Heading>,
    );
    const heading = screen.getByRole('heading', { level: 1, name: 'Settings' });
    expect(heading.className).toContain(styles.typographyDisplay);
  });

  it('merges a consumer class and forwards native props', () => {
    render(
      <Heading className="consumer" id="members">
        Members
      </Heading>,
    );
    const heading = screen.getByRole('heading');
    expect(heading.id).toBe('members');
    expect(heading.className).toContain('consumer');
    expect(heading.className).toContain(styles.heading);
  });

  it('exports the class builder it uses', () => {
    expect(headingVariants({ typography: 'heading-2' })).toContain(styles.typographyHeading2);
  });
});

// jsdom does no layout, so the ramp roles are read from the module source.
describe('Heading drawn rules', () => {
  const declared = declaredIn(import.meta.url, 'heading.module.css');

  it('has no margin and the heading family', () => {
    expect(declared('.heading', 'margin')).toBe('0');
    expect(declared('.heading', 'font-family')).toBe('var(--font-heading)');
  });

  it.each([
    ['display', '.typographyDisplay'],
    ['heading-1', '.typographyHeading1'],
    ['heading-2', '.typographyHeading2'],
  ] as const)('sets the %s role from its four ramp tokens', (role, selector) => {
    expect(declared(selector, 'font-size')).toBe(`var(--text-${role}-size)`);
    expect(declared(selector, 'line-height')).toBe(`var(--text-${role}-line-height)`);
    expect(declared(selector, 'font-weight')).toBe(`var(--text-${role}-weight)`);
    expect(declared(selector, 'letter-spacing')).toBe(`var(--text-${role}-tracking)`);
  });
});
