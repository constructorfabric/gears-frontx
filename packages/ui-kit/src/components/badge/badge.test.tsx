import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Badge } from './badge';
import styles from './badge.module.css';

afterEach(cleanup);

describe('Badge', () => {
  it('renders a span with the base class and the muted pill defaults', () => {
    render(<Badge>New</Badge>);
    const badge = screen.getByText('New');
    expect(badge.tagName).toBe('SPAN');
    expect(badge.className).toContain(styles.badge);
    expect(badge.className).toContain(styles.variantMuted);
    expect(badge.className).toContain(styles.shapePill);
    // Neither dot nor icon by default.
    expect(badge.hasAttribute('data-dot')).toBe(false);
    expect(badge.querySelector('svg')).toBeNull();
  });

  it.each([
    ['success', styles.variantSuccess],
    ['warning', styles.variantWarning],
    ['info', styles.variantInfo],
    ['danger', styles.variantDanger],
    ['muted', styles.variantMuted],
  ] as const)('applies the %s variant class', (variant, variantClass) => {
    render(<Badge variant={variant}>Label</Badge>);
    expect(screen.getByText('Label').className).toContain(variantClass);
  });

  it('applies the plain shape class', () => {
    render(
      <Badge variant="success" shape="plain">
        Online
      </Badge>,
    );
    const badge = screen.getByText('Online');
    expect(badge.className).toContain(styles.shapePlain);
    expect(badge.className).not.toContain(styles.shapePill);
  });

  it('renders the dot only when asked', () => {
    render(
      <Badge variant="success" dot>
        Running
      </Badge>,
    );
    expect(screen.getByText('Running').getAttribute('data-dot')).toBe('true');
  });

  it('renders the icon slot as decorative content', () => {
    render(
      <Badge variant="info" icon={<svg data-testid="beta-icon" />}>
        Beta
      </Badge>,
    );
    const slot = screen.getByTestId('beta-icon').parentElement;
    expect(slot).toHaveProperty('tagName', 'SPAN');
    expect(slot?.className).toContain(styles.icon);
    expect(slot?.getAttribute('aria-hidden')).toBe('true');
  });

  it('resolves icon over dot when both are passed', () => {
    render(
      <Badge variant="success" dot icon={<svg data-testid="both-icon" />}>
        Up
      </Badge>,
    );
    expect(screen.getByText('Up').hasAttribute('data-dot')).toBe(false);
    expect(screen.getByTestId('both-icon')).toBeTruthy();
  });

  it('treats a false icon as absent, keeping the dot and rendering no icon span', () => {
    // `icon={cond && <Icon/>}` with cond=false passes `false` — a valid
    // ReactNode that renders nothing, but `icon != null` alone reads it as
    // present. That both suppressed the dot and rendered an empty icon
    // wrapper; see hasIcon in badge.tsx.
    render(
      <Badge variant="success" dot icon={false}>
        Running
      </Badge>,
    );
    const badge = screen.getByText('Running');
    expect(badge.getAttribute('data-dot')).toBe('true');
    expect(badge.querySelector(`.${styles.icon}`)).toBeNull();
  });

  it('lets its own derived data-dot win over a conflicting prop of the same name', () => {
    // A caller passing a literal data-dot that disagrees with the derived
    // value must not shadow it — same shadow-proofing as Button's
    // data-loading (see button.test.tsx).
    render(
      <Badge variant="success" dot data-dot="literal">
        Running
      </Badge>,
    );
    expect(screen.getByText('Running').getAttribute('data-dot')).toBe('true');
  });

  it('keeps data-dot absent when icon wins over dot, even with a caller-supplied data-dot', () => {
    render(
      <Badge variant="success" dot icon={<svg data-testid="icon-wins" />} data-dot="literal">
        Up
      </Badge>,
    );
    expect(screen.getByText('Up').hasAttribute('data-dot')).toBe(false);
    expect(screen.getByTestId('icon-wins')).toBeTruthy();
  });

  it('merges a consumer className without dropping the kit class', () => {
    render(<Badge className="consumer">Tag</Badge>);
    const badge = screen.getByText('Tag');
    expect(badge.className).toContain(styles.badge);
    expect(badge.className).toContain('consumer');
  });

  it('does not leak the variant or shape props to the DOM as attributes', () => {
    render(
      <Badge variant="info" shape="plain" dot icon={<svg />}>
        Tag
      </Badge>,
    );
    const badge = screen.getByText('Tag');
    expect(badge.hasAttribute('variant')).toBe(false);
    expect(badge.hasAttribute('shape')).toBe(false);
    expect(badge.hasAttribute('dot')).toBe(false);
    expect(badge.hasAttribute('icon')).toBe(false);
  });

  it('forwards native span props such as data-testid', () => {
    render(<Badge data-testid="status-badge">Active</Badge>);
    expect(screen.getByTestId('status-badge').textContent).toBe('Active');
  });

  it('renders as a different element via the render prop, keeping the kit class', () => {
    render(
      <Badge render={<a href="/filters/open" />} variant="info">
        Open
      </Badge>,
    );
    const link = screen.getByRole('link', { name: 'Open' });
    expect(link).toHaveProperty('tagName', 'A');
    expect(link).toHaveProperty('href', expect.stringContaining('/filters/open'));
    expect(link.className).toContain(styles.badge);
    expect(link.className).toContain(styles.variantInfo);
  });
});
