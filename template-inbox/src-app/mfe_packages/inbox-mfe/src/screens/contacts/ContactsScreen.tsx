import { useCallback, useMemo, useState } from 'react';
import { SearchIcon } from 'lucide-react';
import { Input, Skeleton } from '@gears-frontx/ui-kit';
import { apiRegistry, useApiQuery, type ChildMfeBridge } from '@gears-frontx/react';
import { InboxApiService } from '../../api/InboxApiService';
import { takePendingContactId } from '../../shared/crossScreenNavigation';
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
  // Read once, on the first render of this mount: a jump from a thread leaves
  // the target here, and the slot is cleared as it is taken so a later plain
  // visit to the section opens on the table.
  const [openContactId, setOpenContactId] = useState<string | null>(() => takePendingContactId());

  const isCompact = useMediaQuery(COMPACT_QUERY);

  const contacts = useMemo(() => contactsQuery.data?.contacts ?? [], [contactsQuery.data]);
  const visibleContacts = useMemo(
    () => selectContacts(contacts, filter, search),
    [contacts, filter, search]
  );

  const viewContact = useCallback((contactId: string) => setOpenContactId(contactId), []);

  if (translationsLoading || contactsQuery.isLoading) {
    return (
      <WorkspaceRoot>
        <div className={styles.emptyPane} role="status" aria-busy="true">
          <Skeleton style={{ height: '2rem', width: '16rem' }} />
        </div>
      </WorkspaceRoot>
    );
  }

  const openContact = contacts.find((contact) => contact.id === openContactId) ?? null;

  return (
    <WorkspaceRoot>
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
