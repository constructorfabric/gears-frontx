import { cleanup, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { declaredIn } from '../../__test-utils__/css-rules';
import { Link, linkVariants } from './link';
import styles from './link.module.css';

afterEach(cleanup);

/** Stands in for an application router's link component: an anchor that takes `to`. */
function RouterLink({ to, children, ...props }: ComponentProps<'a'> & { to: string }) {
  return (
    <a href={`#${to}`} data-router="" {...props}>
      {children}
    </a>
  );
}

describe('Link', () => {
  it('renders an anchor in the default variant', () => {
    render(<Link href="/docs/setup">setup guide</Link>);
    const link = screen.getByRole('link', { name: 'setup guide' });
    expect(link.getAttribute('href')).toBe('/docs/setup');
    expect(link.className).toContain(styles.link);
    expect(link.className).toContain(styles.variantDefault);
  });

  it.each([
    ['default', styles.variantDefault],
    ['muted', styles.variantMuted],
    ['inherit', styles.variantInherit],
  ] as const)('applies the %s variant class', (variant, variantClass) => {
    render(
      <Link href="/" variant={variant}>
        x
      </Link>,
    );
    expect(screen.getByRole('link').className).toContain(variantClass);
  });

  it('resolves an explicit null variant to the default', () => {
    render(
      <Link href="/" variant={null}>
        x
      </Link>,
    );
    expect(screen.getByRole('link').className).toContain(styles.variantDefault);
  });

  it('hands the anchor to a router link through render', () => {
    render(<Link render={<RouterLink to="/settings" />}>Settings</Link>);
    const link = screen.getByRole('link', { name: 'Settings' });
    expect(link.hasAttribute('data-router')).toBe(true);
    expect(link.getAttribute('href')).toBe('#/settings');
    expect(link.className).toContain(styles.link);
  });

  it('opens an external link in a new tab with a hidden arrow', () => {
    render(
      <Link href="https://example.com" external>
        Example
      </Link>,
    );
    const link = screen.getByRole('link', { name: 'Example' });
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(link.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it("keeps the caller's target and rel on an external link", () => {
    render(
      <Link href="https://example.com" external target="docs" rel="noopener">
        Example
      </Link>,
    );
    const link = screen.getByRole('link');
    expect(link.getAttribute('target')).toBe('docs');
    expect(link.getAttribute('rel')).toBe('noopener');
  });

  it('adds no target, rel or icon to an internal link', () => {
    render(<Link href="/">Home</Link>);
    const link = screen.getByRole('link');
    expect(link.hasAttribute('target')).toBe(false);
    expect(link.hasAttribute('rel')).toBe(false);
    expect(link.querySelector('svg')).toBeNull();
  });

  it('exports the class builder it uses', () => {
    expect(linkVariants({ variant: 'muted' })).toContain(styles.variantMuted);
  });
});

// jsdom does no layout, so the line, state and icon rules are read from the module source.
describe('Link drawn rules', () => {
  const declared = declaredIn(import.meta.url, 'link.module.css');

  it('inherits the font of its line and adds no box of its own', () => {
    expect(declared('.link', 'font')).toBe('inherit');
    expect(declared('.link', 'padding')).toBeUndefined();
    expect(declared('.link', 'height')).toBeUndefined();
  });

  it('paints from the link tokens and focuses on the ring', () => {
    expect(declared('.variantDefault', 'color')).toBe('var(--link-foreground)');
    expect(declared('.variantMuted', 'color')).toBe('var(--muted-foreground)');
    expect(declared('.variantMuted:hover', 'color')).toBe('var(--link-foreground)');
    expect(declared('.variantInherit', 'text-decoration-line')).toBe('underline');
    expect(declared('.link:focus-visible', 'outline')).toBe(
      'var(--border-width-focus) solid var(--ring)',
    );
  });

  it('sizes an icon in the link to the text, on its baseline, with a gap on the text side', () => {
    expect(declared(':where(.link > svg)', 'width')).toBe('1em');
    expect(declared(':where(.link > svg)', 'height')).toBe('1em');
    expect(declared(':where(.link > svg)', 'vertical-align')).toBe('-0.125em');
    expect(declared(':where(.link > svg:last-child)', 'margin-inline-start')).toBe('0.25em');
    expect(declared(':where(.link > svg:first-child:not(:last-child))', 'margin-inline-end')).toBe(
      '0.25em',
    );
  });
});
