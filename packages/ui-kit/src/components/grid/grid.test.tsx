import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { createRef } from 'react';

import { Grid, GridItem } from './grid';
import { defaultGridConfig, type GridConfig } from './grid-config';
import { solveGridLayout } from './grid-solver';
import { generateGridCss } from './grid-css.mjs';
import { declarationMap, extractRules } from '../../__test-utils__/css-rules';

describe('Grid components', () => {
  it('sets placement variables for every step and preserves DOM order and HTML ids', () => {
    render(<Grid dir="rtl" data-testid="root">
      <GridItem layoutId="first" id="html-first" size="medium" height="high" style={{ color: 'red', '--_grid-col-base': 'invalid' } as React.CSSProperties}>First</GridItem>
      {[<GridItem key="second" layoutId="second" id="html-second" size="small">Second</GridItem>, null, false]}
      <GridItem layoutId="third" size="small">Third</GridItem>
    </Grid>);
    const root = screen.getByTestId('root');
    expect(root).toHaveAttribute('dir', 'rtl');
    const grid = root.querySelector('[data-fx-grid="default"]');
    expect(grid).not.toBeNull();
    const items = Array.from(grid!.querySelectorAll('[data-fx-grid-item]')) as HTMLElement[];
    expect(items.map(element => element.textContent)).toEqual(['First', 'Second', 'Third']);
    expect(items[0]).toHaveAttribute('id', 'html-first');
    expect(items[0].style.color).toBe('red');
    expect(items[0].style.getPropertyValue('--_grid-col-base')).not.toBe('invalid');
    for (const element of items) for (const step of defaultGridConfig.steps) {
      expect(element.style.getPropertyValue(`--_grid-col-${step.name}`)).toMatch(/^\d+ \/ span \d+$/);
      expect(element.style.getPropertyValue(`--_grid-row-${step.name}`)).toMatch(/^\d+ \/ span [12]$/);
    }
  });

  it('hands each item the solved placement and keeps its ref', () => {
    const ref = createRef<HTMLDivElement>();
    const items = [
      { layoutId: 'summary', size: 'medium', height: 'high' },
      { layoutId: 'trend', size: 'small' },
      { layoutId: 'alerts', size: 'small' },
    ] as const;
    render(<Grid>
      {items.map(item => <GridItem key={item.layoutId} ref={item.layoutId === 'trend' ? ref : undefined} data-testid={item.layoutId} {...item}>{item.layoutId}</GridItem>)}
    </Grid>);
    const layout = solveGridLayout([...items], defaultGridConfig);
    for (const item of items) {
      const element = screen.getByTestId(item.layoutId);
      expect(element).not.toHaveAttribute('layoutid');
      expect(element).toHaveAttribute('data-fx-grid-item');
      for (const step of defaultGridConfig.steps) {
        const p = layout.steps[step.name].placements[item.layoutId];
        expect(element.style.getPropertyValue(`--_grid-col-${step.name}`)).toBe(`${p.colStart} / span ${p.colSpan}`);
        expect(element.style.getPropertyValue(`--_grid-row-${step.name}`)).toBe(`${p.rowStart} / span ${p.rowSpan}`);
      }
    }
    expect(ref.current).toBe(screen.getByTestId('trend'));
  });

  it('keeps later items mounted when an earlier conditional item appears', () => {
    const Probe = ({ id }: { id: string }) => <span data-testid={id}>{id}</span>;
    const view = (showFirst: boolean) => (
      <Grid>
        {showFirst && <GridItem layoutId="first" size="small"><Probe id="first" /></GridItem>}
        <GridItem layoutId="second" size="small"><Probe id="second" /></GridItem>
      </Grid>
    );
    const { rerender } = render(view(false));
    const before = screen.getByTestId('second');
    rerender(view(true));
    expect(screen.getByTestId('second')).toBe(before);
  });

  it('renders the wrapper and the inner grid with no items', () => {
    const { container } = render(<Grid>{false}</Grid>);
    const wrapper = container.firstElementChild as HTMLElement;
    const grid = wrapper.querySelector('[data-fx-grid]');
    expect(grid).not.toBeNull();
    expect(grid!.querySelectorAll('[data-fx-grid-item]')).toHaveLength(0);
  });

  it('solves a flexible Grid in its own mode and marks it, also for items a strict Grid already solved', () => {
    const view = (flexible?: boolean) => {
      const root = flexible ? 'flexible' : 'strict';
      return (
        <Grid flexible={flexible} data-testid={root}>
          <GridItem layoutId="medium" size="medium" data-testid={`${root}-medium`}>Medium</GridItem>
          <GridItem layoutId="small" size="small" data-testid={`${root}-small`}>Small</GridItem>
        </Grid>
      );
    };
    render(<>{view()}{view(true)}</>);
    const lg = (root: string, layoutId: string) => screen.getByTestId(`${root}-${layoutId}`).style.getPropertyValue('--_grid-col-lg');
    expect([lg('strict', 'medium'), lg('strict', 'small')]).toEqual(['1 / span 6', '7 / span 3']);
    expect([lg('flexible', 'medium'), lg('flexible', 'small')]).toEqual(['1 / span 8', '9 / span 4']);
    expect(screen.getByTestId('strict').querySelector('[data-fx-grid]')).not.toHaveAttribute('data-fx-grid-flexible');
    expect(screen.getByTestId('flexible').querySelector('[data-fx-grid]')).toHaveAttribute('data-fx-grid-flexible', '');
  });

  it('rejects a custom config that takes the default name', () => {
    const copy = structuredClone(defaultGridConfig);
    expect(() => render(<Grid config={copy}><GridItem layoutId="a" size="small" /></Grid>)).toThrow(/give a custom config its own name/);
  });

  it.each([<span key="text">Wrong</span>, <>Wrong</>, 'Wrong'])('rejects children that are not direct GridItems', child => {
    expect(() => render(<Grid>{child}</Grid>)).toThrow(/direct GridItem/);
  });
});

// jsdom does not resolve container queries, so the agreement between the
// component, the generated stylesheet and the module stylesheet is read off
// their sources: one config, and the names and scope all three rely on.
describe('Grid cross-module agreement', () => {
  const config: GridConfig = { ...structuredClone(defaultGridConfig), name: 'report', columns: 8, rowHeight: '120px' };
  for (const size of Object.values(config.sizes)) for (const range of Object.values(size)) {
    range.max = Math.min(range.max, config.columns);
    range.preferred = Math.min(range.preferred, config.columns);
    range.min = Math.min(range.min, config.columns);
  }

  const moduleRules = extractRules(
    readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'grid.module.css'), 'utf8'),
  );

  it('matches the generated step CSS on the names and scope the rendered grid relies on', () => {
    const css = generateGridCss(config);
    render(<Grid config={config} data-testid="grid">
      <GridItem layoutId="first" size="medium">First</GridItem>
      <GridItem layoutId="second" size="small">Second</GridItem>
    </Grid>);
    const grid = screen.getByTestId('grid').querySelector('[data-fx-grid="report"]') as HTMLElement | null;
    expect(grid, 'the generated CSS scopes by data-fx-grid, so the element must carry the config name').not.toBeNull();
    expect(grid).toHaveAttribute('data-fx-grid', 'report');
    expect(grid!.style.getPropertyValue('--_grid-columns')).toBe(String(config.columns));
    const items = Array.from(grid!.querySelectorAll('[data-fx-grid-item]')) as HTMLElement[];
    expect(items).toHaveLength(2);
    for (const step of config.steps) {
      // The item's inline style is the value the generated rule reads.
      for (const element of items) {
        expect(element.style.getPropertyValue(`--_grid-col-${step.name}`)).toMatch(/^\d+ \/ span \d+$/);
        expect(element.style.getPropertyValue(`--_grid-row-${step.name}`)).toMatch(/^\d+ \/ span [12]$/);
      }
      expect(css).toContain(`var(--_grid-col-${step.name}`);
      expect(css).toContain(`var(--_grid-row-${step.name}`);
      expect(css).toContain(`[data-fx-grid="${config.name}"]`);
    }
  });

  it('queries the container name the module stylesheet declares', () => {
    const css = generateGridCss(config);
    const root = moduleRules.find(rule => rule.selector === '.root');
    expect(root, 'grid.module.css keeps the size container on .root').toBeDefined();
    const declared = [...declarationMap(root?.body ?? '')].find(([prop]) => prop === 'container' || prop === 'container-name');
    // The declaration names the container; the generated rules must query exactly it.
    const containerName = declared?.[1]?.split('/')[0]?.trim() ?? '';
    expect(containerName).toBe('fx-grid');
    expect(css).toContain(`@container ${containerName} (min-width`);
  });
});
