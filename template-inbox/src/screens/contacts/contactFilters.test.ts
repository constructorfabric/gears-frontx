import { describe, expect, it } from 'vitest';
import { contacts } from '../../api/dataset';
import { CONTACT_FILTERS, countForFilter, selectContacts } from './contactFilters';

describe('contact filters', () => {
  it('counts each filter over the seeded directory', () => {
    const counts = CONTACT_FILTERS.map((filter) => countForFilter(contacts, filter));

    expect(counts).toEqual([29, 19, 10, 26, 8]);
  });

  it('searches name, email, company and email domain', () => {
    expect(selectContacts(contacts, 'all', 'lucas')).toHaveLength(1);
    expect(selectContacts(contacts, 'all', 'brightlabs.io')).toHaveLength(1);
    expect(selectContacts(contacts, 'all', 'pixelforge')).toHaveLength(1);
  });

  it('applies the search within the chosen filter, not across the whole directory', () => {
    expect(selectContacts(contacts, 'leads', 'grace')).toHaveLength(1);
    expect(selectContacts(contacts, 'users', 'grace')).toHaveLength(0);
  });
});
