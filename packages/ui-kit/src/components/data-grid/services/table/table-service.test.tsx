import { Component, act, forwardRef, lazy, memo } from 'react';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { renderHook, screen } from '@testing-library/react';
import { render } from '../../../../__test-utils__/render-with-user';
import { createDataGrid } from '../../create-data-grid';
import { DataGrid } from '../../data-grid';
import type { DataGridLoadResult } from '../../data-grid-types';
import { internalContextKey } from '../internal/internal-helpers';
import { createDataGridPlugin } from '../plugins/plugins-helpers';
import type { DataGridPluginContext } from '../plugins/plugins-types';
import type { DataGridTableColumn } from './table-types';

interface TestItem {
  id: number;
  name: string;
}

function createGrid() {
  return createDataGrid<TestItem>({
    name: 'table_service_test',
    load: { current: () => Promise.resolve<DataGridLoadResult<TestItem>>({ results: [], total: 0 }) },
  });
}

describe('tableService -- stickyHeader', () => {

  it('starts with the sticky header off', () => {
    const grid = createGrid();
    const { result } = renderHook(() => grid[internalContextKey].table.useStickyHeader());

    expect(result.current).toBe(false);
  });

  it('follows updateStickyHeader in both directions', () => {
    const grid = createGrid();
    const { result } = renderHook(() => grid[internalContextKey].table.useStickyHeader());

    act(() => grid.updateStickyHeader(true));
    expect(result.current).toBe(true);

    act(() => grid.updateStickyHeader(false));
    expect(result.current).toBe(false);
  });

  it('exposes updateStickyHeader on the public API plugins receive', () => {
    const grid = createGrid();

    expect(typeof grid[internalContextKey].plugins.pluginContext.updateStickyHeader).toBe(
      'function',
    );
  });
});

class ClassRow extends Component<{ record: unknown }> {
  render() {
    return null;
  }
}

function FunctionRow(_props: { record: unknown }) {
  return null;
}

const MemoRow = memo(FunctionRow);
const ForwardRefRow = forwardRef<HTMLTableRowElement, { record: unknown }>(function ForwardRefRow(
  _props,
  _ref,
) {
  return null;
});
const LazyRow = lazy(() => Promise.resolve({ default: FunctionRow }));

class ClassHeaderLabel extends Component<{ column: DataGridTableColumn }> {
  render() {
    return <span>class label: {this.props.column.id}</span>;
  }
}

const ClassLabelPlugin = createDataGridPlugin('classLabel', (context) => {
  context.registerComponent('header-cell-label', ClassHeaderLabel);
  return {};
});

describe('tableService -- registerComponent', () => {
  it('takes every kind of component on the public API, class components included', () => {
    // Compile-time: `type-check:test` fails the build if the public parameter narrows (it once
    // became `ComponentType<never>`, which refuses a class component).
    type Register = DataGridPluginContext<TestItem>['registerComponent'];
    expectTypeOf<Register>().toBeCallableWith('row', ClassRow);
    expectTypeOf<Register>().toBeCallableWith('row', FunctionRow);
    expectTypeOf<Register>().toBeCallableWith('row', MemoRow);
    expectTypeOf<Register>().toBeCallableWith('row', ForwardRefRow);
    expectTypeOf<Register>().toBeCallableWith('row', LazyRow);
  });

  it('renders a class component registered as an override', async () => {
    render(
      <DataGrid
        name="register_class_component"
        load={() => Promise.resolve({ results: [{ id: 1, name: 'A' }], total: 1 })}
        columns={[{ id: 'name', label: 'Name' }]}
        persistent="memory"
      >
        <ClassLabelPlugin />
      </DataGrid>,
    );

    expect(await screen.findByText('class label: name')).toBeInTheDocument();
  });
});
