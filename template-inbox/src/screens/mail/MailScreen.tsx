import { useMemo, useState } from 'react';
import { MailIcon } from 'lucide-react';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle, Skeleton } from '@gears-frontx/ui-kit';
import { MAILBOX_SENT } from '../../api/mailDataset';
import type { Mail, MailboxId } from '../../api/mailTypes';
import { useApiQuery } from '../../api/queries';
import { getMailApi } from '../../api/registry';
import type { Translate } from '../../app/i18n';
import { MailboxSidebar, type ComposedMail } from './MailboxSidebar';
import { MailList } from './MailList';
import { MailReadingPane } from './MailReadingPane';
import { selectMails, type MailTab } from './mailSelectors';
import styles from '../../styles/workspace.module.css';

export type MailScreenProps = {
  t: Translate;
};

/**
 * The mail section's top-level orchestration - the same shape as
 * `InboxScreen`: three panes side by side, screen-local state for what is
 * selected and typed, and the API's own collections filtered client-side for
 * everything the panes show. Nothing here is fetched per mailbox or per mail;
 * the mock API answers with the whole collection, same as the chat domain,
 * and `mailSelectors.ts` is what narrows it.
 */
export function MailScreen({ t }: MailScreenProps) {
  const service = getMailApi();

  const mailboxesQuery = useApiQuery(service.getMailboxes);
  const mailsQuery = useApiQuery(service.getMails);
  const mailMessagesQuery = useApiQuery(service.getMailMessages);

  const [mailboxId, setMailboxId] = useState<MailboxId>('inbox');
  const [selectedMailId, setSelectedMailId] = useState<string | null>(null);
  // The mailbox still owed an automatic first-mail pick: set on mount and on
  // every mailbox switch, cleared once that pick has happened. The same
  // shape as `InboxScreen`'s `autoSelectChannelId` guard, for the same
  // reason - a plain "selection is null" check would also fire after the
  // reading pane is intentionally cleared, which this must not do.
  const [autoSelectMailboxId, setAutoSelectMailboxId] = useState<MailboxId | null>('inbox');
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<MailTab>('all');
  // Keyed by mail id rather than a single flag, so switching between two
  // mails with history does not collapse the one already left open.
  const [historyOpenById, setHistoryOpenById] = useState<Record<string, boolean>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  // Client-side only, never round-tripped through RestMockPlugin - a mail
  // the agent sends from the Compose dialog, appended alongside whatever
  // the mock API answered with.
  const [composedMails, setComposedMails] = useState<Mail[]>([]);

  const mailboxes = mailboxesQuery.data?.mailboxes ?? [];
  const mails = useMemo(
    () => [...(mailsQuery.data?.mails ?? []), ...composedMails],
    [mailsQuery.data, composedMails]
  );
  const mailMessages = useMemo(
    () => mailMessagesQuery.data?.mailMessages ?? [],
    [mailMessagesQuery.data]
  );

  // Auto-opens the mailbox's first mail - on the initial mount and again on
  // every mailbox switch (`selectMailbox` re-arms this by setting
  // `autoSelectMailboxId` to the mailbox just entered). Reuses `selectMails`
  // so the pick honours whichever tab and search are already in effect,
  // matching the order `MailList` renders. Resolved here, synchronously
  // during render, rather than in a `useEffect`: this is derived state
  // (React's own "adjust state when something changes" pattern - see "You
  // Might Not Need an Effect"), not a synchronization with anything outside
  // React, so settling it a render early avoids both the lint rule against
  // setting state from an effect and the one-frame flash of the empty state
  // an effect-based version would show first. Guarded by the id match so a
  // click that picks a different mail, once consumed, never gets
  // second-guessed while the agent stays in that mailbox.
  if (autoSelectMailboxId === mailboxId) {
    const candidates = selectMails(mails, mailboxId, tab, search);
    if (candidates.length > 0) {
      setAutoSelectMailboxId(null);
      if (selectedMailId !== candidates[0].id) {
        setSelectedMailId(candidates[0].id);
      }
    }
  }

  const selected = mails.find((mail) => mail.id === selectedMailId) ?? null;

  const history = useMemo(() => {
    if (!selected) return [];
    return mailMessages.filter((message) => message.mailId === selected.id);
  }, [mailMessages, selected]);

  const selectMailbox = (nextMailboxId: MailboxId) => {
    setMailboxId(nextMailboxId);
    setSelectedMailId(null);
    setAutoSelectMailboxId(nextMailboxId);
  };

  if (mailboxesQuery.isLoading) {
    return (
      <div className={styles.emptyPane} role="status" aria-busy="true">
        <Skeleton style={{ height: '2rem', width: '16rem' }} />
      </div>
    );
  }

  const mailboxLabel = mailboxes.find((mailbox) => mailbox.id === mailboxId)?.label ?? '';
  const showReading = selected !== null;

  const sendReply = () => {
    if (!selected) return;
    if ((drafts[selected.id] ?? '').trim() === '') return;
    // Kept simple per the owner's directive: no post endpoint, no appended
    // message - sending just clears the draft the agent was typing.
    setDrafts((previous) => ({ ...previous, [selected.id]: '' }));
  };

  /**
   * A demo-grade sent mail: appended to `composedMails` with
   * `mailboxId: MAILBOX_SENT`, so switching to Sent shows it exactly like
   * any other row - no separate "just sent" list to keep in step. Mailbox
   * selection is left alone; the compose dialog itself already closed on
   * submit (`MailboxSidebar`'s own `onOpenChange`).
   */
  const composeMail = ({ to, subject, body }: ComposedMail) => {
    const newMail: Mail = {
      id: `ml-sent-${Date.now()}`,
      mailboxId: MAILBOX_SENT,
      correspondentName: to,
      correspondentEmail: to,
      subject,
      snippet: body || subject,
      body,
      receivedAt: new Date().toISOString(),
      read: true,
      starred: false,
      pinned: false,
    };
    setComposedMails((previous) => [...previous, newMail]);
  };

  return (
    <>
      <MailboxSidebar
        mailboxes={mailboxes}
        mails={mails}
        selectedMailboxId={mailboxId}
        onSelectMailbox={selectMailbox}
        onComposeMail={composeMail}
        collapsed={false}
        t={t}
      />

      <MailList
        mails={mails}
        mailboxId={mailboxId}
        mailboxLabel={mailboxLabel}
        tab={tab}
        onTabChange={setTab}
        selectedMailId={selectedMailId}
        onSelectMail={setSelectedMailId}
        search={search}
        onSearchChange={setSearch}
        t={t}
      />

      <div className={styles.detailPane}>
        {showReading && selected ? (
          <MailReadingPane
            mail={selected}
            history={history}
            historyOpen={historyOpenById[selected.id] ?? false}
            onToggleHistory={() =>
              setHistoryOpenById((previous) => ({
                ...previous,
                [selected.id]: !(previous[selected.id] ?? false),
              }))
            }
            draft={drafts[selected.id] ?? ''}
            onDraftChange={(draft) =>
              setDrafts((previous) => ({ ...previous, [selected.id]: draft }))
            }
            onSend={sendReply}
            t={t}
          />
        ) : (
          <div className={styles.emptyPane}>
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <MailIcon />
                </EmptyMedia>
                <EmptyTitle>{t('no_mail_selected_title')}</EmptyTitle>
                <EmptyDescription>{t('no_mail_selected_description')}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          </div>
        )}
      </div>
    </>
  );
}
