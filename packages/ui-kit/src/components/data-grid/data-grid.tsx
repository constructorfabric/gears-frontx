// Load-bearing: DataGrid calls useState/useEffect directly in its own render body, so this
// can't be dropped. Coupled to CLIENT_COMPONENTS in scripts/verify-consumer.sh and to the
// client-component sentence in README.md and llms.txt (client-boundaries.test.ts checks all
// three) - keep them in sync if this ever changes.
'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';

import { DataGridContent } from './components/data-grid-content';
import { DataGridSpinner } from './components/data-grid-spinner';
import { createDataGrid } from './create-data-grid';
import type { DataGridItem, DataGridProps } from './data-grid-types';
import { DataGridProvider } from './services/core/data-grid-context';
import { DataGridLabelProvider } from './services/core/data-grid-label-context';
import {
  DataGridMessagesProvider,
  resolveDataGridMessages,
} from './services/core/data-grid-messages-context';
import { DataGridPortalContainerProvider } from './services/core/data-grid-portal-container-context';
import { internalContextKey } from './services/internal/internal-helpers';
import { useLatest } from './utils/use-latest';

const noImplicitFilterKeys: string[] = [];

export function DataGrid<TItem extends DataGridItem = DataGridItem>({
  name,
  load,
  columns,
  children,
  persistent,
  persistentColumnVisibility,
  tableLayout = 'fixed',
  stickyHeader = false,
  loading = false,
  implicitFilterKeys,
  label,
  portalContainer,
  messages: messagesOverride,
}: DataGridProps<TItem>) {
  const loadRef = useLatest(load);
  const [grid] = useState(() =>
    createDataGrid<TItem>({
      name,
      load: loadRef,
      persistent,
      persistentColumnVisibility,
    }),
  );

  // Runs before the columns effect (declaration order) so column ingestion -- which DEV-warns on
  // a width contradiction that only exists under `tableLayout="fixed"` -- reads the current mode.
  useEffect(() => {
    grid.updateTableLayout(tableLayout);
  }, [grid, tableLayout]);

  useEffect(() => {
    grid.updateColumns(columns);
  }, [grid, columns]);

  useEffect(() => {
    grid.updateStickyHeader(stickyHeader);
  }, [grid, stickyHeader]);

  // Reaches the core service directly because the setter is internal: this prop is the only way to
  // raise the overlay for work the grid does not own, so there is exactly one writer of the flag.
  useEffect(() => {
    grid[internalContextKey].core.updateLoading(loading);
  }, [grid, loading]);

  // Same idiom as `loading` above: the setter is internal, and this prop is its only writer.
  // Falls back to a shared constant so an omitted prop stays reference-equal across renders.
  useEffect(() => {
    grid[internalContextKey].storage.updateImplicitFilterKeys(
      implicitFilterKeys ?? noImplicitFilterKeys,
    );
  }, [grid, implicitFilterKeys]);

  // Merged once per prop identity: an omitted prop resolves to the shared defaults object, so
  // the context value stays reference-equal across renders and notifies nobody.
  const messages = useMemo(() => resolveDataGridMessages(messagesOverride), [messagesOverride]);

  return (
    <DataGridProvider value={grid}>
      {/* A blank label is not a name: passed through, it would name the pager " pagination" and
       * put a role="region" with no accessible name on the table wrapper, which is worse than the
       * roleless wrapper an absent label promises. Normalized at the only writer, trimmed too, so
       * both landmarks fall back to their unlabelled names together and a padded label names
       * them without its padding. */}
      <DataGridLabelProvider value={label?.trim() || undefined}>
        <DataGridPortalContainerProvider value={portalContainer}>
          <DataGridMessagesProvider value={messages}>
            {children}
            <Suspense fallback={<DataGridSpinner />}>
              <DataGridContent />
            </Suspense>
          </DataGridMessagesProvider>
        </DataGridPortalContainerProvider>
      </DataGridLabelProvider>
    </DataGridProvider>
  );
}
