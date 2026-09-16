import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { declarationMap, extractRules } from '../../__test-utils__/css-rules';

import { ScrollArea, ScrollBar } from './scroll-area';
import styles from './scroll-area.module.css';

afterEach(cleanup);

describe('ScrollArea', () => {
  it('renders its children inside a viewport with the kit classes', () => {
    render(
      <ScrollArea data-testid="area">
        <p>Row content</p>
      </ScrollArea>,
    );
    expect(screen.getByText('Row content')).toBeTruthy();
    const area = screen.getByTestId('area');
    expect(area.className).toContain(styles.root);
  });

  it('merges a consumer className onto the root without dropping the kit class', () => {
    render(
      <ScrollArea className="consumer" data-testid="area">
        content
      </ScrollArea>,
    );
    const area = screen.getByTestId('area');
    expect(area.className).toContain(styles.root);
    expect(area.className).toContain('consumer');
  });

  // jsdom performs no real layout, so Base UI never measures overflow and
  // the scrollbar ScrollArea auto-renders stays hidden by default
  // (Scrollbar's own `keepMounted` default is `false` — see
  // ScrollAreaScrollbar.js). ScrollBar also requires a ScrollArea.Root
  // ancestor for context (it throws standalone), so the remaining tests
  // render an extra, forced-mounted ScrollBar inside a ScrollArea to assert
  // on its DOM shape instead of depending on unavailable layout measurement.
  it('renders a vertical ScrollBar with a thumb when forced mounted', () => {
    render(
      <ScrollArea>
        <ScrollBar keepMounted data-testid="bar" />
      </ScrollArea>,
    );
    const bar = screen.getByTestId('bar');
    expect(bar.className).toContain(styles.scrollbar);
    expect(bar.getAttribute('data-orientation')).toBe('vertical');
    expect(bar.querySelector(`.${styles.thumb}`)).toBeTruthy();
  });

  it('switches orientation via the orientation prop', () => {
    render(
      <ScrollArea>
        <ScrollBar keepMounted orientation="horizontal" data-testid="bar" />
      </ScrollArea>,
    );
    expect(screen.getByTestId('bar').getAttribute('data-orientation')).toBe('horizontal');
  });

  it('merges a consumer className onto a standalone ScrollBar', () => {
    render(
      <ScrollArea>
        <ScrollBar keepMounted className="consumer" data-testid="bar" />
      </ScrollArea>,
    );
    const bar = screen.getByTestId('bar');
    expect(bar.className).toContain(styles.scrollbar);
    expect(bar.className).toContain('consumer');
  });

  it('lets a consumer add a second ScrollBar alongside the one ScrollArea renders', () => {
    const { container } = render(
      <ScrollArea>
        <p>Row content</p>
        <ScrollBar keepMounted orientation="horizontal" data-testid="h-bar" />
      </ScrollArea>,
    );
    // ScrollArea's own vertical bar stays hidden (unmeasured, see above);
    // only the consumer's forced-mounted horizontal one renders — proving
    // ScrollBar is usable standalone alongside the composed ScrollArea,
    // not only as its internal, non-overridable default.
    expect(container.querySelectorAll(`.${styles.scrollbar}`)).toHaveLength(1);
    expect(screen.getByTestId('h-bar').getAttribute('data-orientation')).toBe('horizontal');
  });
});

describe('ScrollArea drawn track', () => {
  const rules = extractRules(
    readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'scroll-area.module.css'), 'utf8'),
  );

  function declared(selector: string, prop: string) {
    const rule = rules.find((candidate) => candidate.selector === selector);
    return rule ? declarationMap(rule.body).get(prop) : undefined;
  }

  it('keeps the drawn 10px track from growing by its own inset and border', () => {
    // Measured in the demo: without border-box the declared 10 is the
    // content width and the 1px padding on each side plus the 1px leading
    // border make the rendered track 13.
    expect(declared('.scrollbar', 'box-sizing')).toBe('border-box');
    expect(declared('.scrollbar', 'padding')).toBe('var(--border-width)');
    expect(declared(".scrollbar[data-orientation='vertical']", 'width')).toBe('0.625rem');
    expect(declared(".scrollbar[data-orientation='horizontal']", 'height')).toBe('0.625rem');
    expect(declared('.thumb', 'border-radius')).toBe('var(--radius-full)');
    expect(declared('.thumb', 'background-color')).toBe('var(--border)');
  });
});
