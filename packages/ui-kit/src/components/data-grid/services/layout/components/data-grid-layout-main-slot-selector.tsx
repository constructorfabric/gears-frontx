import { messages } from '../../../messages';
import { Segment } from '../../../components/segment';
import { ToggleGroupItem } from '../../../../toggle-group/public.js';
import { useDataGridContext } from '../../core/data-grid-context';
import { CARDS_LAYOUT_SLOT_ID, TABLE_LAYOUT_SLOT_ID } from '../layout-slot-ids';

export const VIEW_SELECTOR_SLOT_ID = 'view_selector';

// The label of each built-in view. A view the grid does not know (a plugin's own main slot) has
// none, and is named by its id instead.
const slotLabels = new Map<string, string>([
  [TABLE_LAYOUT_SLOT_ID, messages.layoutMainSlotSelector.table],
  [CARDS_LAYOUT_SLOT_ID, messages.layoutMainSlotSelector.cards],
]);

export function DataGridLayoutMainSlotSelector() {
  const context = useDataGridContext();

  const mainSlots = context.layout.useLayoutStore((state) => state.slots.get('main'));
  const activeSlotId = context.layout.useLayoutStore((state) => state.activeSlotIds.get('main'));

  if (!mainSlots || mainSlots.length < 2) return null;

  return (
    <Segment size="sm" iconOnly value={activeSlotId} onValueChange={handleValueChange}>
      {mainSlots.map((slot) => {
        const Icon = 'icon' in slot ? slot.icon : undefined;
        return (
          <ToggleGroupItem
            key={slot.id}
            value={slot.id}
            aria-label={slotLabels.get(slot.id) ?? slot.id}
          >
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
