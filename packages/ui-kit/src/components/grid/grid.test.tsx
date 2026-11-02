import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { createRef } from 'react';

import { Grid, GridItem } from './grid';
import { defaultGridConfig } from './grid-config';
import { solveGridLayout } from './grid-solver';

describe('Grid components', () => {
  it('sets placement variables for every step and preserves DOM order and HTML ids', () => {
    render(<Grid dir="rtl" data-testid="root">
      <GridItem layoutId="first" id="html-first" size="medium" height="high" style={{ color: 'red', '--fx-grid-col-base': 'invalid' } as React.CSSProperties}>First</GridItem>
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
    expect(items[0].style.getPropertyValue('--fx-grid-col-base')).not.toBe('invalid');
    for (const element of items) for (const step of defaultGridConfig.steps) {
      expect(element.style.getPropertyValue(`--fx-grid-col-${step.name}`)).toMatch(/^\d+ \/ span \d+$/);
      expect(element.style.getPropertyValue(`--fx-grid-row-${step.name}`)).toMatch(/^\d+ \/ span [12]$/);
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
        expect(element.style.getPropertyValue(`--fx-grid-col-${step.name}`)).toBe(`${p.colStart} / span ${p.colSpan}`);
        expect(element.style.getPropertyValue(`--fx-grid-row-${step.name}`)).toBe(`${p.rowStart} / span ${p.rowSpan}`);
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
    const lg = (root: string, layoutId: string) => screen.getByTestId(`${root}-${layoutId}`).style.getPropertyValue('--fx-grid-col-lg');
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

const PACKAGE = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const SCRIPT = join(PACKAGE, 'scripts/grid-css.mjs');
const DEFAULT_JSON = join(PACKAGE, 'src/components/grid/default-grid-config.json');
const COMMITTED = join(PACKAGE, 'src/components/grid/grid-steps.css');

function runGenerator(input: string, output: string) {
  return spawnSync(process.execPath, [SCRIPT, input, output], { encoding: 'utf8' });
}

describe('Grid CSS generator', () => {
  it('writes the committed default CSS from the default config, and scopes a custom one by name', () => {
    const directory = mkdtempSync(join(tmpdir(), 'grid-css-'));
    try {
      const output = join(directory, 'grid.css');
      expect(runGenerator(DEFAULT_JSON, output).status).toBe(0);
      const committed = readFileSync(COMMITTED, 'utf8');
      expect(readFileSync(output, 'utf8')).toBe(committed);
      expect(committed).toContain('grid-auto-rows: var(--fx-grid-row-height, 10rem)');

      const custom = { ...structuredClone(defaultGridConfig), name: 'custom', columns: 8, rowHeight: '120px' };
      for (const size of Object.values(custom.sizes)) for (const range of Object.values(size)) {
        range.max = Math.min(range.max, 8);
        range.preferred = Math.min(range.preferred, 8);
        range.min = Math.min(range.min, 8);
      }
      const module = join(directory, 'config.mjs');
      writeFileSync(module, `export default ${JSON.stringify(custom)};`);
      expect(runGenerator(module, output).status).toBe(0);
      const scoped = readFileSync(output, 'utf8');
      expect(scoped).toContain('@container fx-grid (min-width: 768px)');
      expect(scoped).toContain('[data-fx-grid="custom"]');
      expect(scoped).toContain('var(--fx-grid-columns, 8)');
      expect(scoped).toContain('grid-auto-rows: var(--fx-grid-row-height, 120px)');
      expect(scoped).not.toContain('[data-fx-grid="default"]');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it.each([
    ['a module without a default export', 'config.mjs', 'export const config = {};', /no default export/],
    ['an unsupported extension', 'config.ts', 'export default {};', /\.json file or an ES module/],
  ])('fails with a plain message on %s', (_name, file, text, message) => {
    const directory = mkdtempSync(join(tmpdir(), 'grid-css-'));
    try {
      writeFileSync(join(directory, file), text);
      const run = runGenerator(join(directory, file), join(directory, 'out.css'));
      expect(run.status).toBe(1);
      expect(run.stderr).toMatch(message);
      expect(existsSync(join(directory, 'out.css'))).toBe(false);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
