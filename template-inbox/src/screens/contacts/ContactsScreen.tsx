import { useCallback, useMemo, useState } from 'react';
import { SearchIcon } from 'lucide-react';
import { Input, Skeleton } from '@gears-frontx/ui-kit';
import { useApiQuery } from '../../api/queries';
import { getInboxApi } from '../../api/registry';
import type { Translate } from '../../app/i18n';
import { CONTACTS_ROUTE, contactRoute, navigate } from '../../app/routing';
import { COMPACT_QUERY, useMediaQuery } from '../../shared/useMediaQuery';
import { ContactDetail } from './ContactDetail';
import { ContactFilterSidebar } from './ContactFilterSidebar';
import { ContactsTable } from './ContactsTable';
import { selectContacts, type ContactFilter } from './contactFilters';
import styles from '../../styles/workspace.module.css';

export type ContactsScreenProps = {
  /**
   * The contact whose page is open, or `null` for the directory. It comes from
   * the URL rather than from state here, which is what makes a person's page a
   * link a thread can point at and a visitor can bookmark.
   */
  openContactId: string | null;
  t: Translate;
};

export function ContactsScreen({ openContactId, t }: ContactsScreenProps) {
  const service = getInboxApi();

  const contactsQuery = useApiQuery(service.getContacts);

  const [filter, setFilter] = useState<ContactFilter>('all');
  const [search, setSearch] = useState('');

  const isCompact = useMediaQuery(COMPACT_QUERY);

  const contacts = useMemo(() => contactsQuery.data?.contacts ?? [], [contactsQuery.data]);
  const visibleContacts = useMemo(
    () => selectContacts(contacts, filter, search),
    [contacts, filter, search]
  );

  const viewContact = useCallback(
    (contactId: string) => navigate(contactRoute(contactId)),
    []
  );

  if (contactsQuery.isLoading) {
    return (
      <div className={styles.emptyPane} role="status" aria-busy="true">
        <Skeleton style={{ height: '2rem', width: '16rem' }} />
      </div>
    );
  }

  const openContact = contacts.find((contact) => contact.id === openContactId) ?? null;

  return (
    <>
      {/*
        The filter list belongs to the directory, not to one person: on a
        contact's own page the reference drops it and gives the whole pane to
        the record. Keeping it here costs the ticket-subject column most of its
        width, so it leaves with the list rather than collapsing behind it.
      */}
      {openContact ? null : (
        <ContactFilterSidebar
          contacts={contacts}
          selectedFilter={filter}
          onSelectFilter={setFilter}
          collapsed={isCompact}
          t={t}
        />
      )}

      {openContact ? (
        <ContactDetail contact={openContact} onBack={() => navigate(CONTACTS_ROUTE)} t={t} />
      ) : (
        <div className={styles.contactsMain}>
          <div className={styles.paneHeader}>
            <span className={styles.contactsHeaderText}>
              <span className={styles.paneTitle}>{t('all_contacts')}</span>
              <span className={styles.paneCount}>
                {t('people_count').replace('{count}', String(visibleContacts.length))}
              </span>
            </span>
            <span className={styles.spacer} />
            <Input
              className={styles.searchField}
              type="search"
              value={search}
              onValueChange={setSearch}
              placeholder={t('search_contacts')}
              icon={<SearchIcon />}
              aria-label={t('search_contacts')}
            />
          </div>
          <div className={styles.contactsBody}>
            <ContactsTable contacts={visibleContacts} onViewContact={viewContact} t={t} />
          </div>
        </div>
      )}
    </>
  );
}
