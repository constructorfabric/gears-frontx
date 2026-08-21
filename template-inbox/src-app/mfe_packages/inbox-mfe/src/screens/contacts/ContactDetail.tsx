import type { ReactElement } from 'react';
import {
  ArrowLeftIcon,
  CircleCheckIcon,
  CircleIcon,
  MessageCircleIcon,
  TicketIcon,
  UserCheckIcon,
  UserPlusIcon,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
  Textarea,
} from '@gears-frontx/ui-kit';
import type { Contact, TicketPriority } from '../../api/types';
import { absoluteDate, labelOf, longRelativeTime, orDash } from '../../shared/format';
import { PresenceAvatar } from '../../shared/PresenceAvatar';
import { buildActivity, type ActivityKind } from './contactActivity';
import styles from '../../styles/workspace.module.css';

const ACTIVITY_ICON: Record<ActivityKind, ReactElement> = {
  ticket: <TicketIcon />,
  conversation: <MessageCircleIcon />,
  'signed-up': <UserCheckIcon />,
  added: <UserPlusIcon />,
};

const PRIORITY_DOT_CLASS: Record<TicketPriority, string> = {
  urgent: styles.dotUrgent,
  high: styles.dotHigh,
  medium: styles.dotMedium,
  low: styles.dotLow,
};

type CheckRowProps = { label: string; done: boolean };

/**
 * One line of the lead-qualification checklist. Derived from whether the field
 * is filled in rather than stored: a "complete" flag that disagreed with the
 * record it summarises would be worse than no flag.
 */
function CheckRow({ label, done }: CheckRowProps) {
  return (
    <div className={styles.checkRow}>
      <span className={done ? styles.checkOn : styles.checkOff}>
        {done ? <CircleCheckIcon /> : <CircleIcon />}
      </span>
      <span>{label}</span>
    </div>
  );
}

type FieldRowProps = { label: string; value: string };

function FieldRow({ label, value }: FieldRowProps) {
  return (
    <div className={styles.fieldRow}>
      <span className={styles.fieldLabel}>{label}</span>
      <span className={styles.fieldValue}>{orDash(value)}</span>
    </div>
  );
}

export type ContactDetailProps = {
  contact: Contact;
  onBack: () => void;
  t: (key: string) => string;
};

export function ContactDetail({ contact, onBack, t }: ContactDetailProps) {
  const activity = buildActivity(contact);

  return (
    <div className={styles.contactsMain}>
      <div className={styles.paneHeader}>
        <Button
          variant="ghost"
          size="sm"
          icon={<ArrowLeftIcon />}
          aria-label={t('back_to_contacts')}
          onClick={onBack}
        />
        <PresenceAvatar name={contact.name} presence={contact.presence} size="lg" />
        <span className={styles.paneTitle}>{contact.name}</span>
        <Badge variant={contact.type === 'lead' ? 'warning' : 'info'}>
          {labelOf(contact.type)}
        </Badge>
        <span className={styles.paneCount}>{labelOf(contact.presence)}</span>
      </div>

      <div className={styles.contactsBody}>
        <div className={styles.detailColumns}>
          <div className={styles.detailColumn}>
            <Card size="sm">
              <CardContent>
                <div className={styles.contactCard}>
                  <PresenceAvatar name={contact.name} presence={contact.presence} size="lg" />
                  <span className={styles.contactCardName}>{contact.name}</span>
                  <span className={styles.identityMeta}>{contact.email}</span>
                  <Badge variant={contact.type === 'lead' ? 'warning' : 'info'}>
                    {labelOf(contact.type)}
                  </Badge>
                </div>
              </CardContent>
            </Card>

            <Card size="sm">
              <CardHeader>
                <CardTitle>{t('details')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className={styles.stack}>
                  <FieldRow label={t('company')} value={contact.company} />
                  <FieldRow label={t('job_title')} value={contact.jobTitle} />
                  <FieldRow label={t('phone')} value={contact.phone} />
                  <FieldRow label={t('location')} value={contact.location} />
                </div>
              </CardContent>
            </Card>

            <Card size="sm">
              <CardHeader>
                <CardTitle>{t('qualification')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className={styles.stack}>
                  <CheckRow label={t('name')} done={contact.name !== ''} />
                  <CheckRow label={t('email')} done={contact.email !== ''} />
                  <CheckRow label={t('phone')} done={contact.phone !== ''} />
                  <CheckRow label={t('company')} done={contact.company !== ''} />
                  <CheckRow label={t('job_title')} done={contact.jobTitle !== ''} />
                  <CheckRow label={t('location')} done={contact.location !== ''} />
                </div>
              </CardContent>
            </Card>

            <Card size="sm">
              <CardHeader>
                <CardTitle>{t('activity')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className={styles.stack}>
                  <FieldRow label={t('signed_up')} value={absoluteDate(contact.signedUpAt)} />
                  <FieldRow label={t('last_seen')} value={longRelativeTime(contact.lastSeenAt)} />
                  <FieldRow label={t('added')} value={absoluteDate(contact.addedAt)} />
                  <FieldRow label={t('tickets')} value={String(contact.tickets.length)} />
                </div>
              </CardContent>
            </Card>

            <Card size="sm">
              <CardHeader>
                <CardTitle>{t('tags')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className={styles.chipRow}>
                  {contact.tags.length === 0 ? (
                    <span className={styles.identityMeta}>{t('no_tags')}</span>
                  ) : (
                    contact.tags.map((tag) => (
                      <Badge key={tag} variant="secondary">
                        {tag}
                      </Badge>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

            <Card size="sm">
              <CardHeader>
                <CardTitle>{t('notes')}</CardTitle>
              </CardHeader>
              <CardContent>
                {/*
                  Uncontrolled and keyed by contact: the note is a private
                  scratchpad in the reference too, and this template ships no
                  endpoint that would persist an edit.
                */}
                <Textarea
                  key={contact.id}
                  rows={4}
                  defaultValue={contact.notes}
                  placeholder={t('notes_placeholder')}
                  aria-label={t('notes')}
                />
              </CardContent>
            </Card>
          </div>

          <div className={styles.detailColumn}>
            <Card size="sm">
              <CardHeader>
                <CardTitle>{`${t('tickets')} (${contact.tickets.length})`}</CardTitle>
              </CardHeader>
              <CardContent>
                {contact.tickets.length === 0 ? (
                  <span className={styles.identityMeta}>{t('no_tickets')}</span>
                ) : (
                  <ItemGroup>
                    {contact.tickets.map((ticket) => (
                      <Item key={ticket.id} size="sm">
                        <ItemContent>
                          <ItemTitle>{ticket.subject}</ItemTitle>
                          <ItemDescription>
                            {`${ticket.number} - ${absoluteDate(ticket.openedAt)}`}
                          </ItemDescription>
                        </ItemContent>
                        <div className={styles.ticketRow}>
                          <span className={PRIORITY_DOT_CLASS[ticket.priority]}>
                            <CircleIcon />
                          </span>
                          <span className={styles.ticketMeta}>{labelOf(ticket.priority)}</span>
                          <Badge variant="secondary">{labelOf(ticket.status)}</Badge>
                        </div>
                      </Item>
                    ))}
                  </ItemGroup>
                )}
              </CardContent>
            </Card>

            <Card size="sm">
              <CardHeader>
                <CardTitle>
                  {`${t('conversations')} (${contact.conversations.length})`}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {contact.conversations.length === 0 ? (
                  <span className={styles.identityMeta}>{t('no_conversations')}</span>
                ) : (
                  <ItemGroup>
                    {contact.conversations.map((conversation) => (
                      <Item key={conversation.id} size="sm">
                        <ItemContent>
                          <div className={styles.rowLine}>
                            <ItemTitle className={styles.rowText}>
                              {conversation.subject}
                            </ItemTitle>
                            <span className={styles.rowTime}>
                              {`${labelOf(conversation.channel)} - ${longRelativeTime(conversation.at)}`}
                            </span>
                          </div>
                          <ItemDescription className={styles.rowText}>
                            {conversation.snippet}
                          </ItemDescription>
                        </ItemContent>
                      </Item>
                    ))}
                  </ItemGroup>
                )}
              </CardContent>
            </Card>
          </div>

          <div className={styles.detailColumn}>
            <Card size="sm">
              <CardHeader>
                <CardTitle>{t('recent_activity')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className={styles.stack}>
                  {activity.map((entry) => (
                    <div key={entry.id} className={styles.timelineItem}>
                      <span className={styles.timelineIcon}>{ACTIVITY_ICON[entry.kind]}</span>
                      <span className={styles.timelineLines}>
                        <span>{entry.label}</span>
                        <span className={styles.timelineMeta}>
                          {longRelativeTime(entry.at)}
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
