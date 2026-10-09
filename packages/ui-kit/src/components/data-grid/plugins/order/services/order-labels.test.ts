import { describe, expect, it } from 'vitest';
import { messages } from '../../../messages';
import { getOrderLabels } from './order-labels';

describe('getOrderLabels', () => {
  it('returns string labels by default', () => {
    expect(getOrderLabels()).toEqual({
      ascending: messages.order.ascString,
      descending: messages.order.descString,
    });
  });

  it('returns string labels for string type', () => {
    expect(getOrderLabels('string')).toEqual({
      ascending: messages.order.ascString,
      descending: messages.order.descString,
    });
  });

  it('returns number labels for number type', () => {
    expect(getOrderLabels('number')).toEqual({
      ascending: messages.order.ascNumber,
      descending: messages.order.descNumber,
    });
  });

  it('returns date labels for date type', () => {
    expect(getOrderLabels('date')).toEqual({
      ascending: messages.order.ascDate,
      descending: messages.order.descDate,
    });
  });
});
