import type { DataGridMessages } from '../../../messages';
import { messages } from '../../../messages';
import type { DataGridOrderColumnType } from '../order-types';

export interface OrderLabels {
  ascending: string;
  descending: string;
}

/**
 * What the two directions are called for a column of this type: A-Z, 0-9, oldest first. Takes the
 * strings to use, so the grid's `messages` prop reaches the labels; the defaults' own `order`
 * group is the fallback.
 */
export function getOrderLabels(
  type: DataGridOrderColumnType = 'string',
  texts: DataGridMessages['order'] = messages.order,
): OrderLabels {
  if (type === 'number') {
    return {
      ascending: texts.ascNumber,
      descending: texts.descNumber,
    };
  }

  if (type === 'date') {
    return {
      ascending: texts.ascDate,
      descending: texts.descDate,
    };
  }

  return {
    ascending: texts.ascString,
    descending: texts.descString,
  };
}
