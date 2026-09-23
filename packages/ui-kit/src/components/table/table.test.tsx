import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { declarationMap, extractRules } from '../../__test-utils__/css-rules';

import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from './table';
import styles from './table.module.css';

afterEach(cleanup);

function renderTable() {
  return render(
    <Table data-testid="table">
      <TableCaption>A list of recent invoices.</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Invoice</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow data-testid="row-1">
          <TableCell>INV001</TableCell>
          <TableCell>Paid</TableCell>
        </TableRow>
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell>Total</TableCell>
          <TableCell>1</TableCell>
        </TableRow>
      </TableFooter>
    </Table>,
  );
}

describe('Table', () => {
  it('renders the correct native element per part, with its kit class', () => {
    renderTable();
    const table = screen.getByTestId('table');
    expect(table.tagName).toBe('TABLE');
    expect(table.className).toContain(styles.table);

    const row = screen.getByTestId('row-1');
    expect(row.tagName).toBe('TR');
    expect(row.className).toContain(styles.tableRow);
    expect(row.parentElement).toHaveProperty('tagName', 'TBODY');
    expect(row.parentElement?.className).toContain(styles.tableBody);

    const cell = screen.getByText('INV001');
    expect(cell.tagName).toBe('TD');
    expect(cell.className).toContain(styles.tableCell);

    const head = screen.getByText('Invoice');
    expect(head.tagName).toBe('TH');
    expect(head.className).toContain(styles.tableHead);
    expect(head.closest('thead')?.className).toContain(styles.tableHeader);

    const footerCell = screen.getByText('Total');
    expect(footerCell.closest('tfoot')?.className).toContain(styles.tableFooter);

    const caption = screen.getByText('A list of recent invoices.');
    expect(caption.tagName).toBe('CAPTION');
    expect(caption.className).toContain(styles.tableCaption);
  });

  it('wraps the table in a scrollable, keyboard-reachable container', () => {
    // Table renders two elements (see table.tsx): the source's own
    // horizontal-scroll wrapper, plus <table> itself. tabIndex={0} is this
    // kit's own addition over the source, so the scroll region is reachable
    // by keyboard (WCAG 2.1.1), not only by dragging a scrollbar.
    renderTable();
    const table = screen.getByTestId('table');
    const wrapper = table.parentElement;
    expect(wrapper).toHaveProperty('tagName', 'DIV');
    expect(wrapper?.className).toContain(styles.tableContainer);
    expect(wrapper?.getAttribute('tabindex')).toBe('0');
    // Without label the wrapper stays roleless and nameless — the table
    // inside speaks for itself.
    expect(wrapper?.getAttribute('role')).toBeNull();
    expect(wrapper?.getAttribute('aria-label')).toBeNull();
  });

  it('names the focusable scroll wrapper via label', () => {
    render(<Table data-testid="table" label="Quarterly results" />);
    const wrapper = screen.getByTestId('table').parentElement;
    // aria-label on a bare div is ignored by the accname algorithm — the
    // label prop must bring role="region" with it for the name to land.
    expect(wrapper?.getAttribute('role')).toBe('region');
    expect(wrapper?.getAttribute('aria-label')).toBe('Quarterly results');
    expect(screen.getByRole('region', { name: 'Quarterly results' })).toBe(wrapper);
  });

  it.each([
    ['Table', Table, styles.table],
    ['TableHeader', TableHeader, styles.tableHeader],
    ['TableBody', TableBody, styles.tableBody],
    ['TableFooter', TableFooter, styles.tableFooter],
    ['TableCaption', TableCaption, styles.tableCaption],
  ] as const)('merges a consumer className on %s without dropping the kit class', (_name, Part, kitClass) => {
    render(<Part data-testid="part" className="consumer" />);
    const part = screen.getByTestId('part');
    expect(part.className).toContain(kitClass);
    expect(part.className).toContain('consumer');
  });

  it('merges a consumer className on TableRow without dropping the kit class', () => {
    render(
      <table>
        <tbody>
          <TableRow data-testid="part" className="consumer" />
        </tbody>
      </table>,
    );
    const part = screen.getByTestId('part');
    expect(part.className).toContain(styles.tableRow);
    expect(part.className).toContain('consumer');
  });

  it.each([
    ['TableHead', TableHead, styles.tableHead],
    ['TableCell', TableCell, styles.tableCell],
  ] as const)('merges a consumer className on %s without dropping the kit class', (_name, Part, kitClass) => {
    render(
      <table>
        <tbody>
          <tr>
            <Part data-testid="part" className="consumer" />
          </tr>
        </tbody>
      </table>,
    );
    const part = screen.getByTestId('part');
    expect(part.className).toContain(kitClass);
    expect(part.className).toContain('consumer');
  });

  it('forwards native th/td props such as colSpan and scope', () => {
    render(
      <table>
        <tbody>
          <tr>
            <TableHead scope="col" data-testid="head">
              Name
            </TableHead>
            <TableCell colSpan={2} data-testid="cell">
              Value
            </TableCell>
          </tr>
        </tbody>
      </table>,
    );
    expect(screen.getByTestId('head')).toHaveProperty('scope', 'col');
    expect(screen.getByTestId('cell')).toHaveProperty('colSpan', 2);
  });

  it.each(['selected', 'stale', 'restricted'])(
    'forwards data-state="%s" to TableRow for the row-state style hooks',
    (state) => {
      render(
        <table>
          <tbody>
            <TableRow data-testid="row" data-state={state} />
          </tbody>
        </table>,
      );
      expect(screen.getByTestId('row').getAttribute('data-state')).toBe(state);
    },
  );

  it('applies the compact density class from the density prop', () => {
    render(
      <Table density="compact">
        <TableBody>
          <TableRow>
            <TableCell>a</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );
    expect(screen.getByRole('table').className).toContain(styles.densityCompact);
  });

  it('stays density-default without the prop', () => {
    render(
      <Table>
        <TableBody>
          <TableRow>
            <TableCell>a</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );
    expect(screen.getByRole('table').className).not.toContain(styles.densityCompact);
  });

  it('keeps the table an accessible grid: role=table with the expected row/cell counts', () => {
    // Guards against a wrapper or a display value quietly breaking the
    // table's implicit ARIA roles — none of the parts here use flexbox or
    // grid display, so the browser's default table/row/cell roles survive.
    renderTable();
    expect(screen.getByRole('table').className).toContain(styles.table);
    expect(screen.getAllByRole('row')).toHaveLength(3);
    expect(screen.getAllByRole('columnheader')).toHaveLength(2);
    expect(screen.getAllByRole('cell')).toHaveLength(4);
  });
});

/*
 * Column resize. jsdom reports every rect as zero, so each case installs its
 * own widths through getBoundingClientRect before acting: what is under test
 * is the arithmetic and the wiring, not the browser's layout.
 */
describe('TableHead column resize', () => {
  function renderResizable(props: { resizeMinWidth?: number } = {}) {
    return render(
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead resizable {...props}>
              Name
            </TableHead>
            <TableHead>Owner</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>Ada</TableCell>
            <TableCell>Grace</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );
  }

  // Every <th> in the header row reports `width`, so the component's own
  // measurement has something to read.
  function stubWidths(widths: number[]) {
    const cells = screen.getAllByRole('columnheader');
    cells.forEach((cell, index) => {
      vi.spyOn(cell, 'getBoundingClientRect').mockImplementation(
        () => ({ width: widths[index] ?? 0 }) as DOMRect,
      );
    });
    return cells;
  }

  function pointerEvent(type: string, init: Record<string, unknown>) {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.assign(event, { pointerId: 1, button: 0, ...init });
    return event;
  }

  it('renders no handle unless the column asks for one', () => {
    render(
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
          </TableRow>
        </TableHeader>
      </Table>,
    );
    expect(screen.queryByRole('separator')).toBeNull();
  });

  it('names the handle after its column and reports the width live', () => {
    renderResizable();
    const [nameCell] = stubWidths([200, 200]);
    const handle = screen.getByRole('separator');
    expect(handle.getAttribute('aria-label')).toBe('Name width');
    fireEvent(handle, pointerEvent('pointerdown', { clientX: 0 }));
    fireEvent(handle, pointerEvent('pointermove', { clientX: 40 }));
    expect(handle.getAttribute('aria-label')).toBe('Name width, 240 pixels');
    expect(nameCell?.style.width).toBe('240px');
  });

  it('trades width with the trailing neighbour and leaves the total stable', () => {
    renderResizable();
    const cells = stubWidths([200, 200]);
    const handle = screen.getByRole('separator');
    fireEvent(handle, pointerEvent('pointerdown', { clientX: 0 }));
    fireEvent(handle, pointerEvent('pointermove', { clientX: 30 }));
    expect(cells[0]?.style.width).toBe('230px');
    expect(cells[1]?.style.width).toBe('170px');
  });

  it('freezes every column and fixes the layout on the first drag', () => {
    const { container } = renderResizable();
    const cells = stubWidths([200, 140]);
    const table = container.querySelector('table');
    expect(table?.style.tableLayout).toBe('');
    fireEvent(screen.getByRole('separator'), pointerEvent('pointerdown', { clientX: 0 }));
    expect(table?.style.tableLayout).toBe('fixed');
    expect(cells[1]?.style.width).toBe('140px');
  });

  it('clamps at the dragged column floor and at the neighbour floor', () => {
    renderResizable();
    const cells = stubWidths([200, 200]);
    const handle = screen.getByRole('separator');
    fireEvent(handle, pointerEvent('pointerdown', { clientX: 0 }));
    // 72 is the floor for a column carrying text.
    fireEvent(handle, pointerEvent('pointermove', { clientX: -500 }));
    expect(cells[0]?.style.width).toBe('72px');
    fireEvent(handle, pointerEvent('pointermove', { clientX: 500 }));
    expect(cells[1]?.style.width).toBe('72px');
  });

  it('takes a per-column floor over the default one', () => {
    renderResizable({ resizeMinWidth: 120 });
    const cells = stubWidths([200, 200]);
    const handle = screen.getByRole('separator');
    fireEvent(handle, pointerEvent('pointerdown', { clientX: 0 }));
    fireEvent(handle, pointerEvent('pointermove', { clientX: -500 }));
    expect(cells[0]?.style.width).toBe('120px');
  });

  it('moves the boundary 12px per arrow-key press', () => {
    renderResizable();
    const cells = stubWidths([200, 200]);
    const handle = screen.getByRole('separator');
    fireEvent.keyDown(handle, { key: 'ArrowRight' });
    expect(cells[0]?.style.width).toBe('212px');
    expect(handle.getAttribute('aria-label')).toBe('Name width, 212 pixels');
    fireEvent.keyDown(handle, { key: 'ArrowLeft' });
    // The second press re-measures, and the stub still reports 200.
    expect(cells[0]?.style.width).toBe('188px');
  });

  function renderLastResizable(tableStyle?: { minWidth: number }) {
    return render(
      <Table style={tableStyle}>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead resizable>Owner</TableHead>
          </TableRow>
        </TableHeader>
      </Table>,
    );
  }

  it('pins the table to its columns so the last column can narrow and widen', () => {
    const { container } = renderLastResizable();
    stubWidths([200, 300]);
    const table = container.querySelector('table');
    const handle = screen.getByRole('separator');
    fireEvent(handle, pointerEvent('pointerdown', { clientX: 0 }));
    expect(table?.style.width).toBe('500px');
    fireEvent(handle, pointerEvent('pointermove', { clientX: -80 }));
    expect(table?.style.width).toBe('420px');
    expect(handle.getAttribute('aria-label')).toBe('Owner width, 220 pixels');
    fireEvent(handle, pointerEvent('pointermove', { clientX: 60 }));
    expect(table?.style.width).toBe('560px');
  });

  it('stops the last column where the table min-width would take over', () => {
    // Below the floor the browser would widen the table back and spread the
    // difference, so the announced width would not be the rendered one.
    const { container } = renderLastResizable({ minWidth: 450 });
    const cells = stubWidths([200, 300]);
    const handle = screen.getByRole('separator');
    fireEvent(handle, pointerEvent('pointerdown', { clientX: 0 }));
    fireEvent(handle, pointerEvent('pointermove', { clientX: -200 }));
    expect(cells[1]?.style.width).toBe('250px');
    expect(container.querySelector('table')?.style.width).toBe('450px');
    expect(handle.getAttribute('aria-label')).toBe('Owner width, 250 pixels');
  });

  it('leaves a body cursor it did not set alone on pointer-up and unmount', () => {
    const { unmount } = renderResizable();
    document.body.style.cursor = 'wait';
    document.body.style.userSelect = 'text';
    fireEvent(screen.getByRole('separator'), pointerEvent('pointerup', { clientX: 0 }));
    unmount();
    expect(document.body.style.cursor).toBe('wait');
    expect(document.body.style.userSelect).toBe('text');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  });

  it('releases the page lock when the drag ends and when the header unmounts', () => {
    const { unmount } = renderResizable();
    stubWidths([200, 200]);
    const handle = screen.getByRole('separator');
    fireEvent(handle, pointerEvent('pointerdown', { clientX: 0 }));
    expect(document.body.style.cursor).toBe('col-resize');
    expect(document.body.style.userSelect).toBe('none');
    fireEvent(handle, pointerEvent('pointerup', { clientX: 0 }));
    expect(document.body.style.cursor).toBe('');

    fireEvent(screen.getByRole('separator'), pointerEvent('pointerdown', { clientX: 0 }));
    expect(document.body.style.cursor).toBe('col-resize');
    unmount();
    expect(document.body.style.cursor).toBe('');
    expect(document.body.style.userSelect).toBe('');
  });
});

/*
 * The collection view's own metrics. jsdom computes no layout, so they are
 * asserted on the stylesheet, plus the one thing that is a rendering fact:
 * the omitted variant and variant="default" take the same code path.
 */
describe('Table collection view', () => {
  const rules = extractRules(
    readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'table.module.css'), 'utf8'),
  );

  function declared(selector: string, prop: string) {
    const rule = rules.find((candidate) => candidate.selector === selector);
    return rule ? declarationMap(rule.body).get(prop) : undefined;
  }

  it('renders variant="default" and an omitted variant as the same class list', () => {
    const { container } = render(
      <>
        <Table>
          <TableBody>
            <TableRow>
              <TableCell>Omitted</TableCell>
            </TableRow>
          </TableBody>
        </Table>
        <Table variant="default">
          <TableBody>
            <TableRow>
              <TableCell>Explicit</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </>,
    );
    const [omitted, explicit] = Array.from(container.querySelectorAll('table'));
    expect(omitted?.className).toBe(explicit?.className);
  });

  it('fixes the layout on a floor wide enough for its own columns', () => {
    expect(declared('.variantCollection', 'table-layout')).toBe('fixed');
    expect(declared('.variantCollection', 'min-width')).toBe('960px');
  });

  it('sticks the header on its own fill at the drawn 40', () => {
    expect(declared('.variantCollection .tableHead', 'position')).toBe('sticky');
    expect(declared('.variantCollection .tableHead', 'height')).toBe('var(--control-height-lg)');
    expect(declared('.variantCollection .tableHead', 'padding')).toBe('0 var(--space-3)');
    expect(declared('.variantCollection .tableHead', 'background-color')).toBe('var(--card)');
    expect(declared('.variantCollection .tableHead', 'color')).toBe('var(--muted-foreground)');
    // The mono role's line is 14; the drawn label sits on 16, and one
    // consumer is not enough to add a step to a shared role.
    expect(declared('.variantCollection .tableHead', 'line-height')).toBe('16px');
  });

  it('gives the row its drawn height and lets the cell wrap', () => {
    expect(declared('.variantCollection .tableBody .tableRow', 'height')).toBe('4rem');
    expect(declared('.variantCollection .tableCell', 'padding')).toBe(
      'var(--space-3) var(--space-2)',
    );
    expect(declared('.variantCollection .tableCell', 'white-space')).toBe('normal');
  });

  it('draws the row focus ring inset and marks a pending row', () => {
    // An outline would be clipped at the scrollport's edge.
    expect(declared('.variantCollection .tableBody .tableRow:focus-visible', 'box-shadow')).toBe(
      'inset 0 0 0 var(--border-width-focus) var(--primary)',
    );
    expect(declared('.variantCollection .tableBody .tableRow[data-pending]', '--table-row-fill')).toBe(
      'var(--muted)',
    );
    expect(declared('.variantCollection .tableBody .tableRow[tabindex]', 'cursor')).toBe('pointer');
    // Declared after the activatable rule, so an activatable row that is
    // also pending reads as pending rather than as clickable.
    expect(declared('.variantCollection .tableBody .tableRow[data-pending]', 'cursor')).toBe(
      'progress',
    );
  });
});
