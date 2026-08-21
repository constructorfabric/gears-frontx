import { useMemo } from 'react';
import { EyeIcon } from 'lucide-react';
import {
  Badge,
  Button,
  DataTable,
  DataTableSortButton,
  dataTableColumnHelper,
  dataTableSelectionColumn,
} from '@gears-frontx/ui-kit';
import type { Contact } from '../../api/types';
import { emailDomain, labelOf, longRelativeTime, orDash } from '../../shared/format';
import { PresenceAvatar } from '../../shared/PresenceAvatar';
import styles from '../../styles/workspace.module.css';

/** The reference's own default: 29 contacts across two pages. */
const ROWS_PER_PAGE = 25;

export type ContactsTableProps = {
  contacts: Contact[];
  onViewContact: (contactId: string) => void;
  t: (key: string) => string;
};

export function ContactsTable({ contacts, onViewContact, t }: ContactsTableProps) {
  // Rebuilt only when the labels or the row action change: a fresh `columns`
  // array on every render would reset the table's own sorting and paging
  // state, which is what a data table keeps between renders.
  const columns = useMemo(() => {
    const column = dataTableColumnHelper<Contact>();
    return column.columns([
      dataTableSelectionColumn<Contact>(),
      column.accessor('name', {
        header: ({ column: instance }) => (
          <DataTableSortButton column={instance}>{t('name')}</DataTableSortButton>
        ),
        cell: ({ row }) => (
          <div className={styles.nameCell}>
            <PresenceAvatar
              name={row.original.name}
              presence={row.original.presence}
              size="sm"
            />
            <span className={styles.nameCellLines}>
              <span className={styles.rowText}>{row.original.name}</span>
              <span className={styles.nameCellEmail}>{row.original.email}</span>
            </span>
          </div>
        ),
      }),
      column.accessor('type', {
        header: ({ column: instance }) => (
          <DataTableSortButton column={instance}>{t('type')}</DataTableSortButton>
        ),
        cell: ({ getValue }) => (
          <Badge variant={getValue() === 'lead' ? 'warning' : 'info'}>{labelOf(getValue())}</Badge>
        ),
      }),
      column.accessor('company', {
        header: ({ column: instance }) => (
          <DataTableSortButton column={instance}>{t('company')}</DataTableSortButton>
        ),
        cell: ({ getValue }) => orDash(getValue()),
      }),
      column.accessor((contact) => emailDomain(contact.email), {
        id: 'domain',
        header: ({ column: instance }) => (
          <DataTableSortButton column={instance}>{t('email_domain')}</DataTableSortButton>
        ),
      }),
      column.accessor('location', {
        header: ({ column: instance }) => (
          <DataTableSortButton column={instance}>{t('location')}</DataTableSortButton>
        ),
        cell: ({ getValue }) => orDash(getValue()),
      }),
      column.accessor((contact) => contact.tickets.length, {
        id: 'tickets',
        header: ({ column: instance }) => (
          <DataTableSortButton column={instance}>{t('tickets')}</DataTableSortButton>
        ),
      }),
      column.accessor('lastSeenAt', {
        header: ({ column: instance }) => (
          <DataTableSortButton column={instance}>{t('last_seen')}</DataTableSortButton>
        ),
        cell: ({ getValue }) => longRelativeTime(getValue()),
      }),
      column.display({
        id: 'actions',
        cell: ({ row }) => (
          <div className={styles.rowActions}>
            <Button
              variant="ghost"
              size="sm"
              icon={<EyeIcon />}
              aria-label={t('view_contact')}
              onClick={() => onViewContact(row.original.id)}
            />
          </div>
        ),
      }),
    ]);
  }, [onViewContact, t]);

  return (
    <DataTable
      columns={columns}
      data={contacts}
      pageSize={ROWS_PER_PAGE}
      enableRowSelection
      emptyMessage={t('no_contacts')}
    />
  );
}
