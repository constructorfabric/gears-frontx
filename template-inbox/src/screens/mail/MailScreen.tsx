import { useMemo, useState } from 'react';
import { MailIcon } from 'lucide-react';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle, Skeleton } from '@gears-frontx/ui-kit';
import type { MailboxId } from '../../api/mailTypes';
import { useApiQuery } from '../../api/queries';
import { getMailApi } from '../../api/registry';
import type { Translate } from '../../app/i18n';
import { MailboxSidebar } from './MailboxSidebar';
import { MailList } from './MailList';
import { MailReadingPane } from './MailReadingPane';
import { type MailTab } from './mailSelectors';
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
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<MailTab>('all');
  // Keyed by mail id rather than a single flag, so switching between two
  // mails with history does not collapse the one already left open.
  const [historyOpenById, setHistoryOpenById] = useState<Record<string, boolean>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const mailboxes = mailboxesQuery.data?.mailboxes ?? [];
  const mails = useMemo(() => mailsQuery.data?.mails ?? [], [mailsQuery.data]);
  const mailMessages = useMemo(
    () => mailMessagesQuery.data?.mailMessages ?? [],
    [mailMessagesQuery.data]
  );

  const selected = mails.find((mail) => mail.id === selectedMailId) ?? null;

  const history = useMemo(() => {
    if (!selected) return [];
    return mailMessages.filter((message) => message.mailId === selected.id);
  }, [mailMessages, selected]);

  const selectMailbox = (nextMailboxId: MailboxId) => {
    setMailboxId(nextMailboxId);
    setSelectedMailId(null);
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

  return (
    <>
      <MailboxSidebar
        mailboxes={mailboxes}
        mails={mails}
        selectedMailboxId={mailboxId}
        onSelectMailbox={selectMailbox}
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
