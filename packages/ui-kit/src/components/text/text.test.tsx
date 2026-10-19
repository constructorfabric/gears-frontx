import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { declaredIn } from '../../__test-utils__/css-rules';
import { Text, textVariants } from './text';
import styles from './text.module.css';

afterEach(cleanup);

describe('Text', () => {
  it('renders a p on the body role in the default tone', () => {
    render(<Text data-testid="text">Invite people by email.</Text>);
    const text = screen.getByTestId('text');
    expect(text.tagName).toBe('P');
    expect(text.className).toContain(styles.text);
    expect(text.className).toContain(styles.typographyBody);
    expect(text.className).toContain(styles.toneDefault);
  });

  it.each([
    ['body', styles.typographyBody],
    ['label', styles.typographyLabel],
    ['meta', styles.typographyMeta],
    ['mono', styles.typographyMono],
    ['micro', styles.typographyMicro],
    ['kpi', styles.typographyKpi],
    ['kpi-lg', styles.typographyKpiLg],
  ] as const)('applies the %s role class', (typography, roleClass) => {
    render(
      <Text data-testid="text" typography={typography}>
        x
      </Text>,
    );
    expect(screen.getByTestId('text').className).toContain(roleClass);
  });

  it('applies the muted tone', () => {
    render(
      <Text data-testid="text" tone="muted">
        x
      </Text>,
    );
    expect(screen.getByTestId('text').className).toContain(styles.toneMuted);
  });

  it('resolves explicit nulls to the defaults', () => {
    render(
      <Text data-testid="text" typography={null} tone={null}>
        x
      </Text>,
    );
    const text = screen.getByTestId('text');
    expect(text.className).toContain(styles.typographyBody);
    expect(text.className).toContain(styles.toneDefault);
  });

  it('swaps the element through render and keeps the class', () => {
    render(
      <Text typography="mono" render={<code />}>
        src/app/main.tsx
      </Text>,
    );
    const code = screen.getByText('src/app/main.tsx');
    expect(code.tagName).toBe('CODE');
    expect(code.className).toContain(styles.typographyMono);
  });

  it('exports the class builder it uses', () => {
    expect(textVariants({ typography: 'meta', tone: 'muted' })).toContain(styles.toneMuted);
  });
});

// jsdom does no layout, so the ramp roles and tones are read from the module source.
describe('Text drawn rules', () => {
  const declared = declaredIn(import.meta.url, 'text.module.css');

  it.each([
    ['body', '.typographyBody'],
    ['label', '.typographyLabel'],
    ['meta', '.typographyMeta'],
    ['mono', '.typographyMono'],
    ['micro', '.typographyMicro'],
    ['kpi', '.typographyKpi'],
    ['kpi-lg', '.typographyKpiLg'],
  ] as const)(
    'sets the %s role from its four ramp tokens',
    (role, selector) => {
      expect(declared(selector, 'font-size')).toBe(`var(--text-${role}-size)`);
      expect(declared(selector, 'line-height')).toBe(`var(--text-${role}-line-height)`);
      expect(declared(selector, 'font-weight')).toBe(`var(--text-${role}-weight)`);
      expect(declared(selector, 'letter-spacing')).toBe(`var(--text-${role}-tracking)`);
    },
  );

  it('sets the mono family, no margin, and paints the two tones from colour tokens', () => {
    expect(declared('.typographyMono', 'font-family')).toBe('var(--font-mono)');
    expect(declared('.typographyKpi', 'font-variant-numeric')).toBe('tabular-nums');
    expect(declared('.typographyKpiLg', 'font-variant-numeric')).toBe('tabular-nums');
    expect(declared('.text', 'margin')).toBe('0');
    expect(declared('.toneDefault', 'color')).toBe('var(--foreground)');
    expect(declared('.toneMuted', 'color')).toBe('var(--muted-foreground)');
  });
});
