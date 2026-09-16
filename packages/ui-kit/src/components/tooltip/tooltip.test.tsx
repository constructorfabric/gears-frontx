import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { declarationMap, extractRules } from '../../__test-utils__/css-rules';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip';
import styles from './tooltip.module.css';

afterEach(cleanup);

// delay={0} on the trigger keeps hover-open assertions deterministic with
// real timers — Base UI's own default hover delay is 600ms (see tooltip.md).
function renderTooltip(open?: boolean) {
  return render(
    <Tooltip defaultOpen={open}>
      <TooltipTrigger delay={0}>Hover me</TooltipTrigger>
      <TooltipContent>Saved successfully</TooltipContent>
    </Tooltip>,
  );
}

describe('Tooltip', () => {
  it('renders a trigger and keeps the popup out of the DOM until opened', () => {
    renderTooltip();
    expect(screen.getByRole('button', { name: 'Hover me' })).toBeTruthy();
    expect(screen.queryByText('Saved successfully')).toBeNull();
  });

  it('opens on trigger hover and renders content with kit classes', async () => {
    renderTooltip();
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Hover me' }));
    const content = await waitFor(() => screen.getByText('Saved successfully'));
    expect(content.className).toContain(styles.popup);
  });

  it('closes on trigger mouse leave', async () => {
    renderTooltip();
    const trigger = screen.getByRole('button', { name: 'Hover me' });
    fireEvent.mouseEnter(trigger);
    await waitFor(() => screen.getByText('Saved successfully'));
    fireEvent.mouseLeave(trigger);
    await waitFor(() => expect(screen.queryByText('Saved successfully')).toBeNull());
  });

  it('opens on trigger focus', async () => {
    renderTooltip();
    fireEvent.focus(screen.getByRole('button', { name: 'Hover me' }));
    await waitFor(() => expect(screen.queryByText('Saved successfully')).not.toBeNull());
  });

  it('does not open a disabled trigger', async () => {
    render(
      <Tooltip>
        <TooltipTrigger delay={0} disabled>
          Hover me
        </TooltipTrigger>
        <TooltipContent>Saved successfully</TooltipContent>
      </Tooltip>,
    );
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Hover me' }));
    // Absence can't be `waitFor`-ed positively; give the (skipped) open delay
    // a moment to have fired if the disabled check were broken.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByText('Saved successfully')).toBeNull();
  });

  it('renders the caret inside the popup', async () => {
    renderTooltip(true);
    const content = await waitFor(() => screen.getByText('Saved successfully'));
    expect(content.querySelector(`.${styles.arrow}`)).toBeTruthy();
  });

  it('portals the popup into a provided container', async () => {
    const container = document.createElement('div');
    container.id = 'themed-section';
    document.body.appendChild(container);
    render(
      <Tooltip defaultOpen>
        <TooltipTrigger>Hover me</TooltipTrigger>
        <TooltipContent container={container}>Saved successfully</TooltipContent>
      </Tooltip>,
    );
    const content = await waitFor(() => screen.getByText('Saved successfully'));
    expect(container.contains(content)).toBe(true);
    container.remove();
  });

  it('opens instantly under a bare TooltipProvider', async () => {
    render(
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>Hover me</TooltipTrigger>
          <TooltipContent>Saved successfully</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    );
    const trigger = screen.getByRole('button', { name: 'Hover me' });
    fireEvent.mouseEnter(trigger);
    // The drawn provider delay is 0, so hovering opens it with no wait and
    // no hover-intent rest timer to arm. That is the behaviour difference
    // mounting the provider is for; a caller who wants the slower open
    // passes `delay` explicitly.
    await waitFor(() => expect(screen.queryByText('Saved successfully')).not.toBeNull());
  });

  it('slows back down when a caller passes a delay explicitly', async () => {
    render(
      <TooltipProvider delay={600}>
        <Tooltip>
          <TooltipTrigger>Hover me</TooltipTrigger>
          <TooltipContent>Saved successfully</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    );
    const trigger = screen.getByRole('button', { name: 'Hover me' });
    fireEvent.mouseEnter(trigger);
    // With a real (non-zero) open delay, Base UI defers to its "hover
    // intent" rest timer, which only arms on a mousemove after entry.
    fireEvent.mouseMove(trigger);
    // Real timers, so on a loaded runner this 200ms sleep can overshoot;
    // the "still closed" claim is only meaningful while we're actually
    // inside the 600ms window.
    const started = Date.now();
    await new Promise((resolve) => setTimeout(resolve, 200));
    if (Date.now() - started < 600) {
      expect(screen.queryByText('Saved successfully')).toBeNull();
    }
    await waitFor(() => expect(screen.queryByText('Saved successfully')).not.toBeNull(), {
      timeout: 800,
    });
  });
});

/*
 * The drawn plate's own numbers. tokens.test.ts's metric guard carries the
 * two 6s as reasoned exceptions, so only these cases keep them from
 * drifting off the drawn box.
 */
describe('Tooltip drawn geometry', () => {
  const rules = extractRules(
    readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'tooltip.module.css'), 'utf8'),
  );

  function declared(selector: string, prop: string) {
    const rule = rules.find((candidate) => candidate.selector === selector);
    return rule ? declarationMap(rule.body).get(prop) : undefined;
  }

  it('insets the plate by the drawn 6 and 12, with the same 6 between parts', () => {
    expect(declared('.popup', 'padding')).toBe('6px var(--space-3)');
    expect(declared('.popup', 'gap')).toBe('6px');
  });

  it('keeps the drawn corner, cap and inverted paint', () => {
    expect(declared('.popup', 'border-radius')).toBe('var(--radius-md)');
    expect(declared('.popup', 'max-width')).toBe('20rem');
    expect(declared('.popup', 'background-color')).toBe('var(--foreground)');
    expect(declared('.popup', 'color')).toBe('var(--background)');
  });

  it('draws the arrow as a 10px square turned 45 degrees', () => {
    expect(declared('.arrow', 'width')).toBe('0.625rem');
    expect(declared('.arrow', 'rotate')).toBe('45deg');
    expect(declared('.arrow', 'border-radius')).toBe('2px');
    expect(declared('.arrow', 'background-color')).toBe('var(--foreground)');
  });
});
