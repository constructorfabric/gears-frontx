import { PinIcon, StarIcon, SearchIcon } from 'lucide-react';
import { Input, Item, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle, SidebarGroupLabel, Tabs, TabsContent, TabsList, TabsTrigger } from '@gears-frontx/ui-kit';
import type { Mail, MailboxId } from '../../api/mailTypes';
import type { Translate } from '../../app/i18n';
import { IdentityAvatar } from '../../shared/IdentityAvatar';
import { cx } from '../../shared/cx';
import { shortRelativeTime } from '../../shared/format';
import { isMailTab, selectMails, type MailTab } from './mailSelectors';
import styles from '../../styles/workspace.module.css';
import mailStyles from '../../styles/mail.module.css';

export type MailListProps = {
  mails: Mail[];
  mailboxId: MailboxId;
  mailboxLabel: string;
  tab: MailTab;
  onTabChange: (tab: MailTab) => void;
  selectedMailId: string | null;
  onSelectMail: (mailId: string) => void;
  search: string;
  onSearchChange: (search: string) => void;
  t: Translate;
};

/**
 * The mail counterpart to `ConversationList`: the same row shape, reused
 * exactly (`.conversationRow`, the two `.rowLine`s, `.rowTitleText` /
 * `.rowPreviewText`), with subject and snippet compressed onto one preview
 * line instead of the reference's separate third line - the divergence the
 * reuse mapping calls out explicitly. Unread is typography only: a bold,
 * full-opacity row versus a normal, dimmed one, no dot.
 */
export function MailList({
  mails,
  mailboxId,
  mailboxLabel,
  tab,
  onTabChange,
  selectedMailId,
  onSelectMail,
  search,
  onSearchChange,
  t,
}: MailListProps) {
  const allMails = selectMails(mails, mailboxId, 'all', search);
  const unreadMails = selectMails(mails, mailboxId, 'unread', search);

  const renderRow = (mail: Mail) => (
    <Item
      key={mail.id}
      className={cx(
        styles.conversationRow,
        mail.read && mailStyles.mailRowRead,
        mail.id === selectedMailId && styles.rowSelected
      )}
      variant={mail.id === selectedMailId ? 'muted' : 'default'}
      render={
        <button
          type="button"
          onClick={() => onSelectMail(mail.id)}
          aria-current={mail.id === selectedMailId ? 'true' : undefined}
        />
      }
    >
      <ItemMedia>
        <IdentityAvatar name={mail.correspondentName} size="lg" />
      </ItemMedia>
      <ItemContent>
        <div className={styles.rowLine}>
          <ItemTitle className={cx(styles.rowText, styles.rowTitleText, mailStyles.correspondentText)}>
            {mail.correspondentName}
          </ItemTitle>
          <span className={mailStyles.rowTimeGroup}>
            {mail.pinned ? (
              <PinIcon className={styles.pinIcon} aria-label={t('pinned_mail')} />
            ) : null}
            {mail.starred ? (
              <StarIcon className={mailStyles.starIcon} aria-label={t('starred_mail')} />
            ) : null}
            <span className={styles.rowTime}>{shortRelativeTime(mail.receivedAt)}</span>
          </span>
        </div>
        <div className={styles.rowLine}>
          <ItemDescription className={cx(styles.rowText, styles.rowPreviewText, mailStyles.subjectText)}>
            {mail.subject} - {mail.snippet}
          </ItemDescription>
        </div>
      </ItemContent>
    </Item>
  );

  // `rows` already sorts pinned mails first (mailSelectors.ts's own
  // comparator does this regardless of tab/search), so splitting it here is
  // a plain filter, not a re-sort.
  const renderRows = (rows: Mail[]) => {
    const pinnedMails = rows.filter((mail) => mail.pinned);
    const otherMails = rows.filter((mail) => !mail.pinned);
    return (
      <div className={styles.listBody}>
        {pinnedMails.length > 0 ? (
          <>
            <SidebarGroupLabel>{t('pinned')}</SidebarGroupLabel>
            <ItemGroup className={styles.conversationGroup}>
              {pinnedMails.map(renderRow)}
            </ItemGroup>
          </>
        ) : null}
        <ItemGroup className={styles.conversationGroup}>{otherMails.map(renderRow)}</ItemGroup>
      </div>
    );
  };

  return (
    <section className={styles.listPane} aria-label={mailboxLabel}>
      <div className={styles.paneHeader}>
        <h2 className={styles.paneTitle}>{mailboxLabel}</h2>
        <span className={styles.paneCount}>{allMails.length}</span>
      </div>

      <div className={styles.paneRow}>
        <Input
          className={styles.grow}
          type="search"
          value={search}
          onValueChange={onSearchChange}
          placeholder={t('search_mail')}
          icon={<SearchIcon />}
          aria-label={t('search_mail')}
        />
      </div>

      <Tabs
        className={mailStyles.tabsFill}
        value={tab}
        onValueChange={(value) => {
          if (isMailTab(value)) onTabChange(value);
        }}
      >
        <TabsList variant="line" className={styles.paneRow}>
          <TabsTrigger value="all">{t('all_mail')}</TabsTrigger>
          <TabsTrigger value="unread">
            {t('unread_mail_count').replace('{count}', String(unreadMails.length))}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="all" className={mailStyles.tabsPanel}>
          {renderRows(allMails)}
        </TabsContent>
        <TabsContent value="unread" className={mailStyles.tabsPanel}>
          {renderRows(unreadMails)}
        </TabsContent>
      </Tabs>
    </section>
  );
}
