import type { TableSlot } from '../table-types';

interface DataGridTableSlotProps {
  slots: TableSlot[];
}

export function DataGridTableSlot({ slots }: DataGridTableSlotProps) {
  if (slots.length === 0) return null;

  return (
    <>
      {slots.map((slot) => {
        const SlotComponent = slot.component;
        return <SlotComponent key={slot.id} />;
      })}
    </>
  );
}
