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

  it('uses the texts it is given instead of the defaults, so the messages prop reaches the labels', () => {
    const texts = {
      ...messages.order,
      ascNumber: 'Kleinste zuerst',
      descNumber: 'Groesste zuerst',
      ascDate: 'Aelteste zuerst',
      descDate: 'Neueste zuerst',
      ascString: 'A bis Z',
      descString: 'Z bis A',
    };
    expect(getOrderLabels('number', texts)).toEqual({
      ascending: 'Kleinste zuerst',
      descending: 'Groesste zuerst',
    });
    expect(getOrderLabels('date', texts)).toEqual({
      ascending: 'Aelteste zuerst',
      descending: 'Neueste zuerst',
    });
    expect(getOrderLabels('string', texts)).toEqual({
      ascending: 'A bis Z',
      descending: 'Z bis A',
    });
    // No type is the string branch too, and it reads the given texts as well.
    expect(getOrderLabels(undefined, texts)).toEqual({
      ascending: 'A bis Z',
      descending: 'Z bis A',
    });
  });
});
