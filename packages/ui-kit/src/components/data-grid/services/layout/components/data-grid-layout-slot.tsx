import { useDataGridContext } from '../../core/data-grid-context';
import type { LayoutSlotName } from '../layout-types';

interface DataGridLayoutSlotProps {
  name: LayoutSlotName;
}

export function DataGridLayoutSlot({ name }: DataGridLayoutSlotProps) {
  const context = useDataGridContext();
  const currentSlots = context.layout.useLayoutStore((state) => state.slots.get(name));

  if (!currentSlots || currentSlots.length === 0) return null;

  return (
    <>
      {currentSlots.map((slot) => (
        <slot.component key={slot.id} />
      ))}
    </>
  );
}
