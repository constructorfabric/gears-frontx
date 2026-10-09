import { useDataGridContext } from '../../core/data-grid-context';
import { DataGridLayoutTopDefault } from './data-grid-layout-top-default';

export function DataGridLayoutTop() {
  const context = useDataGridContext();

  const activeSlotId = context.layout.useLayoutStore((state) => state.activeSlotIds.get('top'));
  const topLayoutSlots = context.layout.useLayoutStore((state) => state.slots.get('top'));
  const topLayoutSlot = topLayoutSlots?.find((s) => s.id === activeSlotId);

  if (!topLayoutSlot) return null;

  const TopComponent =
    topLayoutSlot.id === 'default' ? DataGridLayoutTopDefault : topLayoutSlot.component;

  return <TopComponent />;
}
