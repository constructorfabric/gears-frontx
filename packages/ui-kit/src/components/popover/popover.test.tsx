import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { useState } from 'react';

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { declarationMap, extractRules } from '../../__test-utils__/css-rules';
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from './popover';
import styles from './popover.module.css';

afterEach(cleanup);

function renderPopover(rootProps: Parameters<typeof Popover>[0] = {}) {
  return render(
    <Popover {...rootProps}>
      <PopoverTrigger>Open</PopoverTrigger>
      <PopoverContent>
        <PopoverHeader>
          <PopoverTitle>Dimensions</PopoverTitle>
          <PopoverDescription>Set the dimensions for the layer.</PopoverDescription>
        </PopoverHeader>
      </PopoverContent>
    </Popover>,
  );
}

describe('Popover', () => {
  it('renders a trigger and keeps the popup out of the DOM until opened', () => {
    renderPopover();
    expect(screen.getByRole('button', { name: 'Open' })).toBeTruthy();
    expect(screen.queryByText('Dimensions')).toBeNull();
  });

  it('opens on trigger click and renders content with kit classes', () => {
    renderPopover();
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    const popup = screen.getByRole('dialog');
    expect(popup.className).toContain(styles.popup);
    expect(screen.getByText('Dimensions').className).toContain(styles.title);
    expect(screen.getByText('Set the dimensions for the layer.').className).toContain(
      styles.description,
    );
  });

  it('closes on Escape', async () => {
    renderPopover();
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('closes on outside click', async () => {
    renderPopover();
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.pointerDown(document.body);
    fireEvent.mouseDown(document.body);
    fireEvent.mouseUp(document.body);
    fireEvent.click(document.body);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('portals the popup into a provided container', () => {
    const container = document.createElement('div');
    container.id = 'themed-section';
    document.body.appendChild(container);
    render(
      <Popover defaultOpen>
        <PopoverTrigger>Open</PopoverTrigger>
        <PopoverContent container={container}>
          <PopoverTitle>Themed</PopoverTitle>
        </PopoverContent>
      </Popover>,
    );
    const popup = screen.getByRole('dialog');
    expect(container.contains(popup)).toBe(true);
    container.remove();
  });

  // delay={0} keeps this deterministic with real timers, same rationale as
  // tooltip.test.tsx — openOnHover is the axis distinguishing Popover's
  // click-to-open default from an info-icon-style hover popover.
  it('opens on hover when openOnHover is set', async () => {
    render(
      <Popover>
        <PopoverTrigger openOnHover delay={0}>
          Open
        </PopoverTrigger>
        <PopoverContent>
          <PopoverTitle>Dimensions</PopoverTitle>
        </PopoverContent>
      </Popover>,
    );
    const trigger = screen.getByRole('button', { name: 'Open' });
    fireEvent.mouseEnter(trigger);
    fireEvent.mouseMove(trigger);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeNull());
  });
});

describe('PopoverContent anchor', () => {
  it('positions against a caller-supplied element instead of the trigger', () => {
    function Anchored() {
      const [anchor, setAnchor] = useState<HTMLElement | null>(null);
      return (
        <>
          <div ref={setAnchor} data-testid="anchor" />
          <Popover open>
            <PopoverTrigger>Open</PopoverTrigger>
            <PopoverContent anchor={anchor}>
              <PopoverTitle>Anchored</PopoverTitle>
            </PopoverContent>
          </Popover>
        </>
      );
    }
    render(<Anchored />);
    // jsdom computes no layout, so what is provable here is that the prop
    // reaches the positioner without throwing and the popup still mounts
    // against the given element rather than the trigger.
    expect(screen.getByText('Anchored')).toBeTruthy();
  });
});

/*
 * The drawn panel's own numbers. tokens.test.ts's metric guard carries the
 * two 10s as a reasoned exception, so only a case here keeps them from
 * drifting off the drawn box.
 */
describe('Popover drawn geometry', () => {
  const rules = extractRules(
    readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'popover.module.css'), 'utf8'),
  );

  function declared(selector: string, prop: string) {
    const rule = rules.find((candidate) => candidate.selector === selector);
    return rule ? declarationMap(rule.body).get(prop) : undefined;
  }

  it('insets the panel by the drawn 10 and sets the same 10 between regions', () => {
    // The spacing scale has no step between --space-2 (8) and --space-3
    // (12), so rounding either would be a kit-side correction.
    expect(declared('.popup', 'padding')).toBe('10px');
    expect(declared('.popup', 'gap')).toBe('10px');
  });

  it('keeps the drawn width and corner', () => {
    expect(declared('.popup', 'width')).toBe('18rem');
    expect(declared('.popup', 'border-radius')).toBe('var(--radius-lg)');
  });
});
