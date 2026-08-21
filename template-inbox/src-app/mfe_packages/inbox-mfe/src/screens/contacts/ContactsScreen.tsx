import { useCallback, useEffect, useMemo, useState } from 'react';
import { SearchIcon } from 'lucide-react';
import { Input, Skeleton } from '@gears-frontx/ui-kit';
import { apiRegistry, useApiQuery, type ChildMfeBridge } from '@gears-frontx/react';
import { InboxApiService } from '../../api/InboxApiService';
import { subscribePendingContact, takePendingContact } from '../../shared/contactSelection';
import { COMPACT_QUERY, useMediaQuery } from '../../shared/useMediaQuery';
import { useScreenTranslations } from '../../shared/useScreenTranslations';
import { WorkspaceRoot } from '../../shared/WorkspaceRoot';
import { ContactDetail } from './ContactDetail';
import { ContactFilterSidebar } from './ContactFilterSidebar';
import { ContactsTable } from './ContactsTable';
import { selectContacts, type ContactFilter } from './contactFilters';
import styles from '../../styles/workspace.module.css';

export type ContactsScreenProps = {
  bridge: ChildMfeBridge;
};

export function ContactsScreen({ bridge }: ContactsScreenProps) {
  const service = apiRegistry.getService(InboxApiService);
  const { t, loading: translationsLoading } = useScreenTranslations(bridge);

  const agentQuery = useApiQuery(service.getAgent);
  const contactsQuery = useApiQuery(service.getContacts);

  const [filter, setFilter] = useState<ContactFilter>('all');
  const [search, setSearch] = useState('');
  // A jump from a thread names its target in a chained action, which may be
  // answered before this first render or after it. The lazy initializer takes
  // a target that was already waiting; the effect below takes one that arrived
  // between render and commit, and then listens for a later one.
  const [openContactId, setOpenContactId] = useState<string | null>(() => takePendingContact());

  useEffect(() => {
    const parked = takePendingContact();
    if (parked !== null) setOpenContactId(parked);
    return subscribePendingContact(setOpenContactId);
  }, []);

  const isCompact = useMediaQuery(COMPACT_QUERY);

  const contacts = useMemo(() => contactsQuery.data?.contacts ?? [], [contactsQuery.data]);
  const visibleContacts = useMemo(
    () => selectContacts(contacts, filter, search),
    [contacts, filter, search]
  );

  const viewContact = useCallback((contactId: string) => setOpenContactId(contactId), []);

  if (translationsLoading || contactsQuery.isLoading) {
    return (
      <WorkspaceRoot bridge={bridge}>
        <div className={styles.emptyPane} role="status" aria-busy="true">
          <Skeleton style={{ height: '2rem', width: '16rem' }} />
        </div>
      </WorkspaceRoot>
    );
  }

  const openContact = contacts.find((contact) => contact.id === openContactId) ?? null;

  return (
    <WorkspaceRoot bridge={bridge}>
      <ContactFilterSidebar
        bridge={bridge}
        agent={agentQuery.data?.agent}
        contacts={contacts}
        selectedFilter={filter}
        onSelectFilter={(next) => {
          setFilter(next);
          setOpenContactId(null);
        }}
        collapsed={isCompact}
        t={t}
      />

      {openContact ? (
        <ContactDetail contact={openContact} onBack={() => setOpenContactId(null)} t={t} />
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
    </WorkspaceRoot>
  );
}
