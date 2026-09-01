import { useMemo } from 'react';
import { CalendarDaysIcon, CircleDotIcon, ContactIcon, SearchIcon, TagIcon, UserRoundIcon } from 'lucide-react';
import {
  Avatar,
  AvatarFallback,
  Badge,
  DataTable,
  DataTableSortButton,
  dataTableColumnHelper,
  Input,
} from '@gears-frontx/ui-kit';
import type { ActivityItem, ActivityKind, ActivityStatus } from '../../api/dashboardTypes';
import type { Contact } from '../../api/types';
import type { Translate } from '../../app/i18n';
import { identityToneOf, initialsOf, labelOf, longRelativeTime, orDash } from '../../shared/format';
import { PresenceAvatar } from '../../shared/PresenceAvatar';
import styles from '../../styles/dashboard.module.css';

export type ActivityTableProps = {
  activity: ActivityItem[];
  contacts: Contact[];
  t: Translate;
};

type ActivityRow = ActivityItem & { contact: Contact };

const KIND_TONE: Record<ActivityKind, 'info' | 'accent' | 'secondary'> = {
  chat: 'info',
  mail: 'accent',
  task: 'secondary',
};

const STATUS_TONE: Record<ActivityStatus, 'info' | 'warning' | 'success' | 'danger'> = {
  open: 'info',
  pending: 'warning',
  resolved: 'success',
  escalated: 'danger',
};

/**
 * Row 4's full-width table: a contact cell reusing the same identity data
 * the Contacts screen shows (avatar, name, company) so a person appearing
 * here reads as the same person there, plus the kind/status/owner/date
 * columns the spec asks for. Sorting and pagination come for free from the
 * kit's `DataTable`.
 *
 * Header dressing (per-column lucide icon, a live row count, an inert
 * search field) follows a public shadcn/ui CRM table reference the owner
 * pointed at - ported at template level only, through `DataTable`'s own
 * composition points (`header` render functions) and this file's own CSS,
 * no kit changes. The search field carries no handler: this template does
 * no activity filtering, so it stays disabled rather than silently doing
 * nothing (the same convention the rail's profile menu and
 * `ConversationThread`'s create-ticket button already follow).
 */
export function ActivityTable({ activity, contacts, t }: ActivityTableProps) {
  const contactById = useMemo(() => new Map(contacts.map((contact) => [contact.id, contact])), [contacts]);

  const rows = useMemo<ActivityRow[]>(
    () =>
      activity
        .map((item) => {
          const contact = contactById.get(item.contactId);
          return contact ? { ...item, contact } : null;
        })
        .filter((row): row is ActivityRow => row !== null),
    [activity, contactById]
  );

  const columns = useMemo(() => {
    const column = dataTableColumnHelper<ActivityRow>();
    return column.columns([
      column.accessor((row) => row.contact.name, {
        id: 'contact',
        header: ({ column: instance }) => (
          <DataTableSortButton column={instance}>
            <span className={styles.tableHeaderLabel}>
              <ContactIcon aria-hidden="true" />
              {t('contact')}
            </span>
          </DataTableSortButton>
        ),
        cell: ({ row }) => (
          <div className={styles.activityContactCell}>
            <PresenceAvatar name={row.original.contact.name} presence={row.original.contact.presence} size="sm" />
            <span className={styles.activityContactLines}>
              <span className={styles.cellText}>{row.original.contact.name}</span>
              <span className={styles.activityContactCompany}>{orDash(row.original.contact.company)}</span>
            </span>
          </div>
        ),
      }),
      column.accessor('kind', {
        header: ({ column: instance }) => (
          <DataTableSortButton column={instance}>
            <span className={styles.tableHeaderLabel}>
              <TagIcon aria-hidden="true" />
              {t('kind')}
            </span>
          </DataTableSortButton>
        ),
        cell: ({ getValue }) => <Badge variant={KIND_TONE[getValue()]}>{labelOf(getValue())}</Badge>,
      }),
      column.accessor('status', {
        header: ({ column: instance }) => (
          <DataTableSortButton column={instance}>
            <span className={styles.tableHeaderLabel}>
              <CircleDotIcon aria-hidden="true" />
              {t('status')}
            </span>
          </DataTableSortButton>
        ),
        cell: ({ getValue }) => <Badge variant={STATUS_TONE[getValue()]}>{labelOf(getValue())}</Badge>,
      }),
      column.accessor('ownerAgentName', {
        header: ({ column: instance }) => (
          <DataTableSortButton column={instance}>
            <span className={styles.tableHeaderLabel}>
              <UserRoundIcon aria-hidden="true" />
              {t('owner')}
            </span>
          </DataTableSortButton>
        ),
        cell: ({ getValue }) => {
          const name = getValue();
          return (
            <div className={styles.activityOwnerCell}>
              <Avatar size="sm">
                <AvatarFallback tone={identityToneOf(name)} variant="solid">
                  {initialsOf(name)}
                </AvatarFallback>
              </Avatar>
              <span className={styles.cellText}>{name}</span>
            </div>
          );
        },
      }),
      column.accessor('occurredAt', {
        header: ({ column: instance }) => (
          <DataTableSortButton column={instance}>
            <span className={styles.tableHeaderLabel}>
              <CalendarDaysIcon aria-hidden="true" />
              {t('date')}
            </span>
          </DataTableSortButton>
        ),
        cell: ({ getValue }) => longRelativeTime(getValue()),
      }),
    ]);
  }, [t]);

  return (
    <div className={styles.activitySection}>
      <div className={styles.activityToolbar}>
        <h2 className={styles.sectionHeading}>{t('recent_activity')}</h2>
        <span className={styles.activityCount}>{rows.length}</span>
        {/*
          The kit Input's own icon is absolutely positioned relative to its
          internal wrap, which is itself `width: 100%` of Input's immediate
          parent - so `margin-left: auto`/a fixed width need to sit on a
          wrapper div around Input, not on Input's own `className` (which
          targets the inner `<input>` only). Without this wrapper the wrap
          fills the whole flex row's remaining space and the icon stays
          pinned to that row's left edge instead of tracking the input box.
        */}
        <div className={styles.activitySearch}>
          <Input
            type="search"
            icon={<SearchIcon />}
            placeholder={t('search_activity')}
            disabled
            aria-label={t('search_activity')}
          />
        </div>
      </div>
      <DataTable columns={columns} data={rows} emptyMessage={t('no_conversations')} />
    </div>
  );
}
