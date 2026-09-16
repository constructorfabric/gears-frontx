import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { contrastRatio } from '../../__test-utils__/contrast';
import { declarationMap, extractRules } from '../../__test-utils__/css-rules';
import { readThemeTokens } from '../../__test-utils__/theme-tokens';
import { Badge } from './badge';
import styles from './badge.module.css';

afterEach(cleanup);

describe('Badge', () => {
  it('renders a span with the base class and defaults to the default variant', () => {
    render(<Badge>New</Badge>);
    const badge = screen.getByText('New');
    expect(badge.tagName).toBe('SPAN');
    expect(badge.className).toContain(styles.badge);
    expect(badge.className).toContain(styles.variantDefault);
  });

  it.each([
    ['default', styles.variantDefault],
    ['secondary', styles.variantSecondary],
    ['destructive', styles.variantDestructive],
    ['outline', styles.variantOutline],
    ['ghost', styles.variantGhost],
    ['link', styles.variantLink],
    ['success', styles.variantSuccess],
    ['warning', styles.variantWarning],
    ['danger', styles.variantDanger],
    ['info', styles.variantInfo],
    ['accent', styles.variantAccent],
  ] as const)('applies the %s variant class', (variant, variantClass) => {
    render(<Badge variant={variant}>Label</Badge>);
    expect(screen.getByText('Label').className).toContain(variantClass);
  });

  it('merges a consumer className without dropping the kit class', () => {
    render(<Badge className="consumer">Tag</Badge>);
    const badge = screen.getByText('Tag');
    expect(badge.className).toContain(styles.badge);
    expect(badge.className).toContain('consumer');
  });

  it('does not leak the variant prop to the DOM as an attribute', () => {
    render(<Badge variant="secondary">Tag</Badge>);
    expect(screen.getByText('Tag').hasAttribute('variant')).toBe(false);
  });

  it('forwards native span props such as data-testid and aria-invalid', () => {
    render(
      <Badge data-testid="status-badge" aria-invalid="true">
        Active
      </Badge>,
    );
    const badge = screen.getByTestId('status-badge');
    expect(badge.textContent).toBe('Active');
    expect(badge.getAttribute('aria-invalid')).toBe('true');
  });

  it('renders size="default" and an omitted size as the exact same class list', () => {
    render(
      <>
        <Badge data-testid="omitted">A</Badge>
        <Badge data-testid="explicit" size="default">
          B
        </Badge>
      </>,
    );
    // Same class STRING: defaultVariants is what makes the two one code
    // path, rather than two renderings that agree today.
    expect(screen.getByTestId('omitted').className).toBe(
      screen.getByTestId('explicit').className,
    );
    expect(screen.getByTestId('omitted').className).toContain(styles.sizeDefault);
  });

  it.each([
    ['xs', styles.sizeXs],
    ['sm', styles.sizeSm],
    ['default', styles.sizeDefault],
  ] as const)('applies the %s size class', (size, sizeClass) => {
    render(<Badge size={size}>Label</Badge>);
    expect(screen.getByText('Label').className).toContain(sizeClass);
  });

  it('renders the status dot ahead of the label, hidden from assistive tech', () => {
    render(<Badge dot>Running</Badge>);
    const badge = screen.getByText(/Running/);
    const dot = badge.firstElementChild;
    expect(dot?.className).toContain(styles.dot);
    expect(dot?.getAttribute('aria-hidden')).toBe('true');
    // The label is still the accessible name; the dot adds no text.
    expect(badge.textContent).toBe('Running');
  });

  it('omits the dot element entirely when the flag is off', () => {
    render(<Badge>Running</Badge>);
    expect(screen.getByText('Running').firstElementChild).toBeNull();
  });

  it('does not leak the size or dot props to the DOM as attributes', () => {
    render(
      <Badge size="sm" dot>
        Tag
      </Badge>,
    );
    const badge = screen.getByText(/Tag/);
    expect(badge.hasAttribute('size')).toBe(false);
    expect(badge.hasAttribute('dot')).toBe(false);
  });

  it('renders as a different element via the render prop, keeping the kit class', () => {
    render(
      <Badge render={<a href="/filters/open" />} variant="outline">
        Open
      </Badge>,
    );
    const link = screen.getByRole('link', { name: 'Open' });
    expect(link).toHaveProperty('tagName', 'A');
    expect(link).toHaveProperty('href', expect.stringContaining('/filters/open'));
    expect(link.className).toContain(styles.badge);
    expect(link.className).toContain(styles.variantOutline);
  });
});

/*
 * Guards the fix for the invisible focus ring on a default-variant link
 * Badge (design-notes.md's "Post-review contrast pass" entry records the
 * finding): light --ring equals --primary, and the
 * inset half of Badge's focus idiom recolors chrome sitting ON the badge's
 * own fill — on the default variant that painted blue over blue and
 * vanished. What makes focus visible regardless of the fill is the OUTSIDE
 * outline half, offset off the border box, whose only WCAG 1.4.11 neighbor
 * is therefore the page background — the same guarantee button.test.tsx
 * verifies for Button's ring. Reads the raw module CSS (like that file
 * does), not the rendered DOM: jsdom computes no styles.
 *
 * The second case here guards the other half of the same idiom: the ring,
 * the invalid state and the bordered variant all draw an INSET box-shadow
 * and no border at all. A border would put the badge 2px over the height
 * the spec draws, which is how it used to render 26 instead of 24, and it
 * is the kind of thing that creeps back one recolored `border-color` at a
 * time.
 */
describe('Badge focus ring', () => {
  const css = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), 'badge.module.css'),
    'utf8',
  );
  const rules = extractRules(css);
  const focusRule = rules.find((rule) => rule.selector === '.badge:focus-visible');

  it('draws every ring and hairline as an inset shadow, never as a border', () => {
    for (const selector of [
      '.badge',
      '.badge:focus-visible',
      ".badge[aria-invalid='true']",
      '.variantDestructive:focus-visible',
      '.variantOutline',
    ]) {
      const rule = rules.find((candidate) => candidate.selector === selector);
      expect(rule, `${selector} rule missing from badge.module.css`).toBeDefined();
      const decls = declarationMap(rule?.body ?? '');
      expect(decls.get('border'), selector).toBeUndefined();
      expect(decls.get('border-color'), selector).toBeUndefined();
    }
    for (const [selector, tone] of [
      ['.badge:focus-visible', 'var(--ring)'],
      [".badge[aria-invalid='true']", 'var(--destructive)'],
      ['.variantDestructive:focus-visible', 'var(--destructive-ring)'],
      ['.variantOutline', 'var(--border)'],
    ] as const) {
      const rule = rules.find((candidate) => candidate.selector === selector);
      expect(declarationMap(rule?.body ?? '').get('box-shadow'), selector).toContain(tone);
    }
  });

  it('draws an outside outline in the kit-wide ring tone, offset off the fill', () => {
    expect(focusRule, '.badge:focus-visible rule missing from badge.module.css').toBeDefined();
    const decls = declarationMap(focusRule?.body ?? '');
    expect(decls.get('outline'), 'outline must carry the ring tone').toContain('var(--ring)');
    expect(decls.get('outline')).not.toContain('none');
    // The offset is what keeps the outline clear of the badge's own fill,
    // so its contrast neighbor is the page, never the variant color.
    expect(decls.get('outline-offset'), 'outline-offset missing').toBeDefined();
  });

  it('outline tone clears 3:1 against the page background in both themes', () => {
    const { light, dark } = readThemeTokens();
    for (const [themeName, tokens] of [
      ['light', light],
      ['dark', dark],
    ] as const) {
      const ring = tokens.get('--ring');
      const background = tokens.get('--background');
      expect(ring, `--ring missing from the ${themeName} block`).toBeDefined();
      expect(background, `--background missing from the ${themeName} block`).toBeDefined();
      expect(
        contrastRatio(ring as string, background as string),
        themeName,
      ).toBeGreaterThanOrEqual(3);
    }
  });
});
