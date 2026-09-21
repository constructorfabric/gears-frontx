import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { declarationMap, extractRules } from '../../__test-utils__/css-rules';
import { StatusDot } from './status-dot';
import styles from './status-dot.module.css';

afterEach(cleanup);

const moduleCss = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'status-dot.module.css'),
  'utf8',
);

function ruleFor(selector: string) {
  const rule = extractRules(moduleCss).find((candidate) => candidate.selector === selector);
  expect(rule, `${selector} missing from status-dot.module.css`).toBeDefined();
  return declarationMap(rule?.body ?? '');
}

// The same selector appears twice for `[data-live] .dot`: once plain and
// once inside the reduced-motion query, so the query's copy is the last -
// same convention tabs.test.tsx's own `declaredLast` uses.
function lastRuleFor(selector: string) {
  const matches = extractRules(moduleCss).filter((candidate) => candidate.selector === selector);
  expect(matches.length, `${selector} missing from status-dot.module.css`).toBeGreaterThan(0);
  return declarationMap(matches[matches.length - 1]?.body ?? '');
}

describe('StatusDot', () => {
  it('renders the dot with the label and defaults to the neutral tone', () => {
    render(<StatusDot data-testid="status" label="Running" />);
    const root = screen.getByTestId('status');
    expect(root.tagName).toBe('SPAN');
    expect(root.className).toContain(styles.statusDot);
    expect(root.className).toContain(styles.toneNeutral);
    expect(root.getAttribute('data-tone')).toBe('neutral');
    expect(root.textContent).toBe('Running');
    expect(root.querySelector(`.${styles.dot}`)).not.toBeNull();
  });

  it.each([
    ['neutral', styles.toneNeutral],
    ['success', styles.toneSuccess],
    ['warning', styles.toneWarning],
    ['danger', styles.toneDanger],
    ['info', styles.toneInfo],
  ] as const)('applies the %s tone class and data attribute', (tone, toneClass) => {
    render(<StatusDot data-testid="status" tone={tone} label="State" />);
    const root = screen.getByTestId('status');
    expect(root.className).toContain(toneClass);
    expect(root.getAttribute('data-tone')).toBe(tone);
  });

  it('treats an explicit null tone as neutral, in class and attribute alike', () => {
    render(<StatusDot data-testid="status" tone={null} label="State" />);
    const root = screen.getByTestId('status');
    expect(root.className).toContain(styles.toneNeutral);
    expect(root.getAttribute('data-tone')).toBe('neutral');
  });

  /*
   * The three accessibility branches of a labelless dot, which is where a
   * coloured shape either announces nothing useful or announces nothing at
   * all. A label that renders nothing (`label={busy && 'Running'}` with
   * `busy` false) has to land on the same branch as no label at all.
   */
  it('hides a bare dot from assistive tech, including a label that renders nothing', () => {
    render(
      <>
        <StatusDot data-testid="bare" tone="success" />
        <StatusDot data-testid="falsy" tone="success" label={false} />
      </>,
    );
    for (const id of ['bare', 'falsy']) {
      const root = screen.getByTestId(id);
      expect(root.getAttribute('aria-hidden')).toBe('true');
      expect(root.textContent).toBe('');
    }
  });

  it('names a labelless dot as an image when the caller supplies an aria-label', () => {
    render(<StatusDot tone="warning" aria-label="Degraded" />);
    const root = screen.getByRole('img', { name: 'Degraded' });
    expect(root.hasAttribute('aria-hidden')).toBe(false);
  });

  it('names a labelless dot as an image when the caller supplies an aria-labelledby', () => {
    render(
      <>
        <span id="job-state">Degraded</span>
        <StatusDot data-testid="status" tone="warning" aria-labelledby="job-state" />
      </>,
    );
    const root = screen.getByTestId('status');
    expect(root.getAttribute('role')).toBe('img');
    expect(root.hasAttribute('aria-hidden')).toBe(false);
  });

  it('adds no role or aria-hidden of its own once a visible label carries the name', () => {
    render(<StatusDot data-testid="status" label="Running" />);
    const root = screen.getByTestId('status');
    expect(root.hasAttribute('role')).toBe(false);
    expect(root.hasAttribute('aria-hidden')).toBe(false);
  });

  it('marks a live status on the root and leaves a settled one unmarked', () => {
    render(
      <>
        <StatusDot data-testid="live" live label="Streaming" />
        <StatusDot data-testid="settled" label="Completed" />
      </>,
    );
    expect(screen.getByTestId('live').hasAttribute('data-live')).toBe(true);
    expect(screen.getByTestId('settled').hasAttribute('data-live')).toBe(false);
  });

  it('merges a consumer className and forwards native span props', () => {
    render(
      <StatusDot data-testid="status" className="consumer" title="Job state" label="Running" />,
    );
    const root = screen.getByTestId('status');
    expect(root.className).toContain(styles.statusDot);
    expect(root.className).toContain('consumer');
    expect(root.getAttribute('title')).toBe('Job state');
  });

  it('renders as a different element via the render prop, keeping the kit class', () => {
    render(
      <ul>
        <StatusDot render={<li />} tone="success" label="Running" />
      </ul>,
    );
    const item = screen.getByRole('listitem');
    expect(item).toHaveProperty('tagName', 'LI');
    expect(item.className).toContain(styles.statusDot);
    expect(item.className).toContain(styles.toneSuccess);
    expect(item.getAttribute('data-tone')).toBe('success');
    expect(item.querySelector(`.${styles.dot}`)).not.toBeNull();
  });

  /*
   * The three accessibility branches still have to hold when the root is
   * not a span - `render` changes the tag, not which of the three
   * branches applies.
   */
  it('keeps the three accessibility branches when rendered as a different element', () => {
    render(
      <ul>
        <StatusDot render={<li />} data-testid="labelled" tone="success" label="Running" />
        <StatusDot render={<li />} data-testid="bare" tone="danger" />
        <StatusDot render={<li />} data-testid="named" tone="warning" aria-label="Degraded" />
      </ul>,
    );
    const labelled = screen.getByTestId('labelled');
    expect(labelled.hasAttribute('role')).toBe(false);
    expect(labelled.hasAttribute('aria-hidden')).toBe(false);

    const bare = screen.getByTestId('bare');
    expect(bare.getAttribute('aria-hidden')).toBe('true');

    const named = screen.getByTestId('named');
    expect(named.getAttribute('role')).toBe('img');
    expect(named.hasAttribute('aria-hidden')).toBe(false);
  });
});

/*
 * The drawn geometry, pinned because the kit's CSS-source tests assert
 * token names and cannot see a literal drift. 6/6 is the drawn dot and 6
 * the drawn gap; the gap is also the reason tokens.test.ts carries an
 * exception for this module, so a change here must move both.
 */
describe('StatusDot drawn geometry', () => {
  it('draws a 6px round dot painted from the tone', () => {
    const dot = ruleFor('.dot');
    expect(dot.get('width')).toBe('6px');
    expect(dot.get('height')).toBe('6px');
    expect(dot.get('border-radius')).toBe('var(--radius-full)');
    expect(dot.get('background-color')).toBe('currentColor');
  });

  it('sets the drawn 6px gap between the dot and its label', () => {
    expect(ruleFor('.statusDot').get('gap')).toBe('6px');
  });

  it('pulses the live dot on a 2s cycle and stops it under reduced motion', () => {
    expect(ruleFor('.statusDot[data-live] .dot').get('animation')).toBe(
      'status-dot-pulse 2s var(--ease-standard) infinite',
    );
    expect(lastRuleFor('.statusDot[data-live] .dot').get('animation')).toBe('none');
  });
});
