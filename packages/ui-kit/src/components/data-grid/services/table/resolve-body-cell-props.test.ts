import { describe, expect, it } from 'vitest';
import { resolveBodyCellProps } from './resolve-body-cell-props';
import type { DataGridTableColumn } from './table-types';

interface TestItem {
  id: string;
  name: string;
}

function column(overrides: Partial<DataGridTableColumn<TestItem>> = {}): DataGridTableColumn<TestItem> {
  return { id: 'name', label: 'Name', ...overrides };
}

describe('resolveBodyCellProps', () => {
  it('defaults overflow to wrap and leaves title unset', () => {
    const result = resolveBodyCellProps(column(), { id: '1', name: 'Ada' }, 'fixed');

    expect(result.overflow).toBe('wrap');
    expect(result.title).toBeUndefined();
  });

  it('sets title to the plain-string display value under nowrap', () => {
    const result = resolveBodyCellProps(
      column({ cellOverflow: 'nowrap' }),
      { id: '1', name: 'Ada' },
      'fixed',
    );

    expect(result.overflow).toBe('nowrap');
    expect(result.title).toBe('Ada');
  });

  it('leaves title unset under nowrap when the value stringifies to empty', () => {
    const result = resolveBodyCellProps(
      column({ cellOverflow: 'nowrap' }),
      { id: '1', name: '' },
      'fixed',
    );

    expect(result.title).toBeUndefined();
  });

  it('leaves title unset under nowrap for a custom render column', () => {
    const result = resolveBodyCellProps(
      column({ cellOverflow: 'nowrap', render: () => 'custom' }),
      { id: '1', name: 'Ada' },
      'fixed',
    );

    expect(result.title).toBeUndefined();
  });

  it('forwards resolveColumnStyle output as style/capped', () => {
    const result = resolveBodyCellProps(
      column({ maxWidth: 120 }),
      { id: '1', name: 'Ada' },
      'auto',
    );

    expect(result.style).toEqual({ '--_data-grid-col-max': '120px' });
    expect(result.capped).toBe(true);
  });
});
