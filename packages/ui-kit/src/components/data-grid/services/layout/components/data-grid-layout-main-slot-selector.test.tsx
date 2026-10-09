import { LayoutGridIcon } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { messages } from '../../../messages';
import { screen } from '@testing-library/react';
import { render } from '../../../../../__test-utils__/render-with-user';
import { DataGrid } from '../../../data-grid';
import type { DataGridLoadResult } from '../../../data-grid-types';
import { createDataGridPlugin } from '../../plugins/plugins-helpers';
import { useDataGrid } from '../../core/data-grid-context';
import { CARDS_LAYOUT_SLOT_ID } from '../layout-slot-ids';
import type { DataGridTableColumn } from '../../table/table-types';
import { DATA_GRID_VIEW, useDataGridActiveView } from '../data-grid-view';

vi.stubGlobal(
  'ResizeObserver',
  vi.fn(function () {
    return {
      observe: vi.fn(),
      unobserve: vi.fn(),
      disconnect: vi.fn(),
    };
  }),
);

interface TestItem {
  id: number;
  name: string;
}

const testData: TestItem[] = [
  { id: 1, name: 'Item A' },
  { id: 2, name: 'Item B' },
];

const testColumns: DataGridTableColumn<TestItem>[] = [{ id: 'name', label: 'Name' }];

function loadData(): Promise<DataGridLoadResult<TestItem>> {
  return Promise.resolve({ results: testData, total: testData.length });
}

// A second main view registered under the cards slot id, which is all the selector needs to see.
function CardsView() {
  const { useStore } = useDataGrid<TestItem>();
  const records = useStore((s) => s.visibleRecords);
  return (
    <>
      {records.map((record) => (
        <article key={record.id}>{record.item.name}</article>
      ))}
    </>
  );
}

const TestCardsPlugin = createDataGridPlugin('cards', (context) => {
  context.registerSlot('main', {
    id: CARDS_LAYOUT_SLOT_ID,
    component: CardsView,
    icon: LayoutGridIcon,
  });
  return {};
});

function ActiveViewProbe() {
  const view = useDataGridActiveView();
  return <output>{view ?? 'none'}</output>;
}

describe('DataGridLayoutMainSlotSelector', () => {

  it('does not render with a single main view (table only)', async () => {
    render(
      <DataGrid name="vs_single" load={loadData} columns={testColumns} />,
    );

    await screen.findByRole('table');
    expect(
      screen.queryByRole('button', { name: messages.layoutMainSlotSelector.table }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: messages.layoutMainSlotSelector.cards }),
    ).not.toBeInTheDocument();
  });

  it('auto-mounts with two main views, defaulting to the table view', async () => {
    render(
      <DataGrid name="vs_two" load={loadData} columns={testColumns}>
        <TestCardsPlugin />
      </DataGrid>,
    );

    // Table is the default active view once data loads.
    expect(await screen.findByRole('table')).toBeInTheDocument();
    // The selector offers both views.
    expect(
      screen.getByRole('button', { name: messages.layoutMainSlotSelector.table }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: messages.layoutMainSlotSelector.cards }),
    ).toBeInTheDocument();
    // Cards are not shown while the table view is active.
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
  });

  it('switches to the cards view when the cards item is selected', async () => {
    const { user } = render(
      <DataGrid name="vs_switch" load={loadData} columns={testColumns}>
        <TestCardsPlugin />
      </DataGrid>,
    );

    await screen.findByRole('table');
    await user.click(
      screen.getByRole('button', { name: messages.layoutMainSlotSelector.cards }),
    );

    expect(await screen.findAllByRole('article')).toHaveLength(2);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('exposes the active view id via useDataGridActiveView', async () => {
    const { user } = render(
      <DataGrid name="vs_hook" load={loadData} columns={testColumns}>
        <TestCardsPlugin />
        <ActiveViewProbe />
      </DataGrid>,
    );

    expect(await screen.findByText(DATA_GRID_VIEW.table)).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: messages.layoutMainSlotSelector.cards }),
    );

    expect(await screen.findByText(DATA_GRID_VIEW.cards)).toBeInTheDocument();
  });
});
