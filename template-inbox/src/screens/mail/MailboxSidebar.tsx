import type { ReactElement } from 'react';
import { ArchiveIcon, FileTextIcon, InboxIcon, PenSquareIcon, SendIcon, Trash2Icon } from 'lucide-react';
import { Badge, Button, Item, ItemActions, ItemContent, ItemGroup, ItemMedia, ItemTitle } from '@gears-frontx/ui-kit';
import type { Mail, Mailbox, MailboxId } from '../../api/mailTypes';
import type { Translate } from '../../app/i18n';
import { cx } from '../../shared/cx';
import { countInMailbox } from './mailSelectors';
import styles from '../../styles/workspace.module.css';
import mailStyles from '../../styles/mail.module.css';

const MAILBOX_ICON: Record<MailboxId, ReactElement> = {
  inbox: <InboxIcon />,
  drafts: <FileTextIcon />,
  sent: <SendIcon />,
  archive: <ArchiveIcon />,
  trash: <Trash2Icon />,
};

export type MailboxSidebarProps = {
  mailboxes: Mailbox[];
  mails: Mail[];
  selectedMailboxId: MailboxId;
  onSelectMailbox: (mailboxId: MailboxId) => void;
  collapsed: boolean;
  t: Translate;
};

/**
 * Same 12rem sidebar and 36px `.folderItem` Item as `FolderSidebar` and
 * `ContactFilterSidebar`, one nav section and a Compose button above it. The
 * reference's plain-text counts become the kit's own Badge here, the
 * deliberate divergence the reuse mapping calls for - and every count is
 * read off `mails`, never stored on a mailbox row.
 */
export function MailboxSidebar({
  mailboxes,
  mails,
  selectedMailboxId,
  onSelectMailbox,
  collapsed,
  t,
}: MailboxSidebarProps) {
  return (
    <aside
      className={cx(styles.sidebar, collapsed && styles.sidebarCollapsed)}
      aria-label={t('mail')}
      aria-hidden={collapsed}
    >
      <div className={styles.paneHeader}>
        <span className={styles.paneTitle}>{t('mail')}</span>
      </div>
      <nav className={styles.sidebarBody}>
        {/*
          Present but inert, exactly as the reference: Compose has no store to
          write a draft into in this template, so the button draws at full
          contrast as the primary action without a handler behind it - the
          same dead-controls convention as the chat composer's attach/emoji
          buttons.
        */}
        <Button variant="default" className={mailStyles.composeButton} icon={<PenSquareIcon />}>
          {t('compose')}
        </Button>

        <ItemGroup>
          {mailboxes.map((mailbox) => (
            <Item
              key={mailbox.id}
              size="sm"
              className={styles.folderItem}
              variant={mailbox.id === selectedMailboxId ? 'muted' : 'default'}
              render={
                <button
                  type="button"
                  onClick={() => onSelectMailbox(mailbox.id)}
                  aria-current={mailbox.id === selectedMailboxId ? 'true' : undefined}
                />
              }
            >
              <ItemMedia variant="icon">{MAILBOX_ICON[mailbox.id]}</ItemMedia>
              <ItemContent>
                <ItemTitle>{mailbox.label}</ItemTitle>
              </ItemContent>
              <ItemActions>
                <Badge variant="secondary">{countInMailbox(mails, mailbox.id)}</Badge>
              </ItemActions>
            </Item>
          ))}
        </ItemGroup>
      </nav>
    </aside>
  );
}
