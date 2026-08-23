import { ArchiveIcon, ReplyIcon, StarIcon, Trash2Icon } from 'lucide-react';
import {
  Button,
  MessageScroller,
  MessageScrollerContent,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from '@gears-frontx/ui-kit';
import type { Mail, MailMessage } from '../../api/mailTypes';
import type { Translate } from '../../app/i18n';
import { IdentityAvatar } from '../../shared/IdentityAvatar';
import { MailComposer } from './MailComposer';
import styles from '../../styles/workspace.module.css';
import mailStyles from '../../styles/mail.module.css';

export type MailReadingPaneProps = {
  mail: Mail;
  /** Earlier messages, oldest first; empty when the mail has no history. */
  history: MailMessage[];
  historyOpen: boolean;
  onToggleHistory: () => void;
  draft: string;
  onDraftChange: (draft: string) => void;
  onSend: () => void;
  t: Translate;
};

/**
 * The reading pane - the largest divergence from the chat thread it reuses
 * the chrome of. No bubbles, no per-sender alignment: a mail renders flat,
 * top to bottom. The scroll container and its provider are the same
 * `MessageScroller` family `ConversationThread` uses; what changes is what
 * goes inside it - a history toggle, muted bordered cards for anything
 * behind it, and the newest message flat and full width, never wrapped in a
 * card of its own.
 */
export function MailReadingPane({
  mail,
  history,
  historyOpen,
  onToggleHistory,
  draft,
  onDraftChange,
  onSend,
  t,
}: MailReadingPaneProps) {
  return (
    <div className={styles.thread}>
      <div className={styles.paneHeader}>
        <div className={styles.threadActions}>
          <Button variant="ghost" size="sm" icon={<ArchiveIcon />} aria-label={t('archive_mail')} />
          <Button variant="ghost" size="sm" icon={<Trash2Icon />} aria-label={t('trash_mail')} />
          <Button
            variant="ghost"
            size="sm"
            icon={<StarIcon />}
            aria-label={mail.starred ? t('unstar_mail') : t('star_mail')}
            aria-pressed={mail.starred}
          />
        </div>
        <span className={styles.spacer} />
        <div className={styles.threadActions}>
          <Button variant="ghost" size="sm" icon={<ReplyIcon />} aria-label={t('reply_to_mail')} />
        </div>
      </div>

      <div className={styles.threadHeader}>
        <IdentityAvatar name={mail.correspondentName} size="default" />
        <div className={styles.threadTitles}>
          <span className={styles.threadSubject}>{mail.subject}</span>
          <span className={styles.threadSubtitle}>{mail.correspondentName}</span>
          <span className={mailStyles.replyToLine}>
            {t('reply_to_label')}: {mail.correspondentEmail}
          </span>
        </div>
      </div>

      <MessageScrollerProvider>
        <MessageScroller className={styles.transcript}>
          <MessageScrollerViewport>
            <MessageScrollerContent>
              {history.length > 0 ? (
                <Button
                  variant="outline"
                  className={mailStyles.historyToggle}
                  onClick={onToggleHistory}
                  aria-expanded={historyOpen}
                >
                  {historyOpen
                    ? t('hide_earlier_messages')
                    : t('earlier_messages').replace('{count}', String(history.length))}
                </Button>
              ) : null}

              {historyOpen
                ? history.map((message) => (
                    <div key={message.id} className={mailStyles.historyCard}>
                      <div className={mailStyles.historyCardHeader}>
                        <IdentityAvatar name={message.correspondentName} size="default" />
                        <span className={mailStyles.historyCardSender}>{message.correspondentName}</span>
                        <span className={mailStyles.historyCardDate}>{message.date}</span>
                      </div>
                      <div className={mailStyles.historyCardBody}>{message.body}</div>
                    </div>
                  ))
                : null}

              <div className={mailStyles.focusedMessage}>{mail.body}</div>
            </MessageScrollerContent>
          </MessageScrollerViewport>
        </MessageScroller>
      </MessageScrollerProvider>

      <MailComposer
        correspondentName={mail.correspondentName}
        draft={draft}
        onDraftChange={onDraftChange}
        onSend={onSend}
        t={t}
      />
    </div>
  );
}
