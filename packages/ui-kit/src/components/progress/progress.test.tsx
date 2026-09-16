import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { declarationMap, extractRules } from '../../__test-utils__/css-rules';

import { Progress, ProgressLabel, ProgressValue } from './progress';
import styles from './progress.module.css';

afterEach(cleanup);

describe('Progress', () => {
  it('renders a determinate progressbar with its value', () => {
    render(<Progress value={64} aria-label="Uploading" />);
    const bar = screen.getByRole('progressbar', { name: 'Uploading' });
    expect(bar.className).toContain(styles.root);
    expect(bar.getAttribute('aria-valuenow')).toBe('64');
    expect(bar.getAttribute('aria-valuemin')).toBe('0');
    expect(bar.getAttribute('aria-valuemax')).toBe('100');
  });

  it('renders the indicator width from the value', () => {
    const { container } = render(<Progress value={64} aria-label="Uploading" />);
    const indicator = container.querySelector(`.${styles.indicator}`) as HTMLElement;
    expect(indicator.style.width).toBe('64%');
  });

  it('reports indeterminate state with no aria-valuenow', () => {
    render(<Progress value={null} aria-label="Importing" />);
    const bar = screen.getByRole('progressbar', { name: 'Importing' });
    expect(bar.hasAttribute('aria-valuenow')).toBe(false);
    expect(bar.hasAttribute('data-indeterminate')).toBe(true);
  });

  it('composes with a label and a live value readout', () => {
    render(
      <Progress value={42}>
        <ProgressLabel>Uploading</ProgressLabel>
        <ProgressValue />
      </Progress>,
    );
    // getByText throws if the node is missing — its return alone proves
    // both parts rendered; no jest-dom matchers are configured here.
    expect(screen.getByText('Uploading').tagName).toBe('SPAN');
    expect(screen.getByText('42%').tagName).toBe('SPAN');
  });

  it('merges a consumer className', () => {
    render(<Progress value={10} aria-label="Loading" className="consumer" />);
    expect(screen.getByRole('progressbar', { name: 'Loading' }).className).toContain('consumer');
  });
});

/*
 * The drawn track and the two text parts. The track's 6px height is a
 * literal: the drawn height is carried by a product-owned token this kit
 * excludes, and the spacing scale has no step between 4 and 8 either.
 */
describe('Progress drawn geometry', () => {
  const rules = extractRules(
    readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'progress.module.css'), 'utf8'),
  );

  function declared(selector: string, prop: string) {
    const rule = rules.find((candidate) => candidate.selector === selector);
    return rule ? declarationMap(rule.body).get(prop) : undefined;
  }

  it('draws a 6px fully round track in --muted under a --primary indicator', () => {
    expect(declared('.track', 'height')).toBe('6px');
    expect(declared('.track', 'border-radius')).toBe('var(--radius-full)');
    expect(declared('.track', 'background-color')).toBe('var(--muted)');
    expect(declared('.indicator', 'background-color')).toBe('var(--primary)');
    expect(declared('.root', 'gap')).toBe('var(--space-3)');
  });

  it('sets label and readout at 14 and pushes the readout to the end', () => {
    expect(declared('.label', 'font-size')).toBe('var(--text-body-size)');
    expect(declared('.label', 'font-weight')).toBe('var(--text-label-weight)');
    expect(declared('.value', 'font-size')).toBe('var(--text-body-size)');
    expect(declared('.value', 'margin-inline-start')).toBe('auto');
    // Tabular figures, or a counting readout shifts the label beside it.
    expect(declared('.value', 'font-variant-numeric')).toBe('tabular-nums');
  });
});
