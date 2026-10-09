import { messages } from '../../../messages';
import type { DataGridOrderColumnType } from '../order-types';

export interface OrderLabels {
  ascending: string;
  descending: string;
}

/** What the two directions are called for a column of this type: A-Z, 0-9, oldest first. */
export function getOrderLabels(type: DataGridOrderColumnType = 'string'): OrderLabels {
  if (type === 'number') {
    return {
      ascending: messages.order.ascNumber,
      descending: messages.order.descNumber,
    };
  }

  if (type === 'date') {
    return {
      ascending: messages.order.ascDate,
      descending: messages.order.descDate,
    };
  }

  return {
    ascending: messages.order.ascString,
    descending: messages.order.descString,
  };
}
