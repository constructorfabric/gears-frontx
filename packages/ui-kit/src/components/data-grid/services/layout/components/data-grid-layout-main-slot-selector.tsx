import { Segment } from '../../../components/segment';
import { ToggleGroupItem } from '../../../../toggle-group/public.js';
import { useDataGridContext } from '../../core/data-grid-context';
import { useDataGridMessages } from '../../core/data-grid-messages-context';
import { CARDS_LAYOUT_SLOT_ID, TABLE_LAYOUT_SLOT_ID } from '../layout-slot-ids';

export const VIEW_SELECTOR_SLOT_ID = 'view_selector';

export function DataGridLayoutMainSlotSelector() {
  const context = useDataGridContext();
  const messages = useDataGridMessages();

  const mainSlots = context.layout.useLayoutStore((state) => state.slots.get('main'));
  const activeSlotId = context.layout.useLayoutStore((state) => state.activeSlotIds.get('main'));

  if (!mainSlots || mainSlots.length < 2) return null;

  return (
    <Segment size="sm" iconOnly value={activeSlotId} onValueChange={handleValueChange}>
      {mainSlots.map((slot) => {
        const Icon = 'icon' in slot ? slot.icon : undefined;
        // A view the grid does not know (a plugin's own main slot) has no label of its own, and
        // is named by its id instead.
        const label =
          slot.id === TABLE_LAYOUT_SLOT_ID
            ? messages.layoutMainSlotSelector.table
            : slot.id === CARDS_LAYOUT_SLOT_ID
              ? messages.layoutMainSlotSelector.cards
              : slot.id;
        return (
          <ToggleGroupItem key={slot.id} value={slot.id} aria-label={label}>
            {Icon ? <Icon /> : null}
          </ToggleGroupItem>
        );
      })}
    </Segment>
  );

  function handleValueChange(value: string | undefined) {
    if (value) {
      context.layout.setActiveSlotId('main', value);
    }
  }
}
