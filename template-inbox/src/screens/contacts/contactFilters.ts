/**
 * The contacts sidebar's five filters and the search over the table.
 *
 * The counts beside each filter are computed from the collection the screen
 * holds rather than fetched, so a filter reads the same number the table
 * shows under it - the reference's own 29 / 19 / 10 / 26 / 8.
 */

import type { Contact } from '../../api/types';
import { emailDomain } from '../../shared/format';

export const CONTACT_FILTERS = ['all', 'users', 'leads', 'active', 'new'] as const;

export type ContactFilter = (typeof CONTACT_FILTERS)[number];

export const CONTACT_FILTER_LABEL_KEY: Record<ContactFilter, string> = {
  all: 'filter_all_contacts',
  users: 'filter_users',
  leads: 'filter_leads',
  active: 'filter_active',
  new: 'filter_new',
};

const MATCHERS: Record<ContactFilter, (contact: Contact) => boolean> = {
  all: () => true,
  users: (contact) => contact.type === 'user',
  leads: (contact) => contact.type === 'lead',
  active: (contact) => contact.active,
  new: (contact) => contact.isNew,
};

export const countForFilter = (contacts: Contact[], filter: ContactFilter): number =>
  contacts.filter(MATCHERS[filter]).length;

/** Name, email and company - the three the reference's own placeholder names. */
export function selectContacts(
  contacts: Contact[],
  filter: ContactFilter,
  search: string
): Contact[] {
  const needle = search.trim().toLowerCase();
  return contacts.filter((contact) => {
    if (!MATCHERS[filter](contact)) return false;
    if (needle === '') return true;
    return (
      contact.name.toLowerCase().includes(needle) ||
      contact.email.toLowerCase().includes(needle) ||
      contact.company.toLowerCase().includes(needle) ||
      emailDomain(contact.email).toLowerCase().includes(needle)
    );
  });
}
