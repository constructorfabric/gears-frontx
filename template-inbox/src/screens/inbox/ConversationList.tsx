import { PanelLeftIcon, SearchIcon } from 'lucide-react';
import {
  Badge,
  Button,
  Input,
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@gears-frontx/ui-kit';
import type { Contact, Conversation } from '../../api/types';
import { cx } from '../../shared/cx';
import { shortRelativeTime } from '../../shared/format';
import { PresenceAvatar } from '../../shared/PresenceAvatar';
import { countOpen, isSortOrder, SORT_ORDERS, type SortOrder } from './conversationOrdering';
import styles from '../../styles/workspace.module.css';

const SORT_LABEL_KEY: Record<SortOrder, string> = {
  'last-activity': 'sort_last_activity',
  oldest: 'sort_oldest',
  priority: 'sort_priority',
  unread: 'sort_unread',
};

export type ConversationListProps = {
  conversations: Conversation[];
  contactsById: Map<string, Contact>;
  channelLabel: string;
  selectedConversationId: string | null;
  onSelectConversation: (conversationId: string) => void;
  search: string;
  onSearchChange: (search: string) => void;
  sort: SortOrder;
  onSortChange: (sort: SortOrder) => void;
  onToggleChannels: () => void;
  hidden: boolean;
  t: (key: string) => string;
};

export function ConversationList({
  conversations,
  contactsById,
  channelLabel,
  selectedConversationId,
  onSelectConversation,
  search,
  onSearchChange,
  sort,
  onSortChange,
  onToggleChannels,
  hidden,
  t,
}: ConversationListProps) {
  const sortItems = SORT_ORDERS.map((order) => ({ value: order, label: t(SORT_LABEL_KEY[order]) }));

  return (
    <section
      className={cx(styles.listPane, hidden && styles.singlePaneHidden)}
      aria-label={t('conversations')}
    >
      <div className={styles.paneHeader}>
        <Button
          variant="ghost"
          size="sm"
          icon={<PanelLeftIcon />}
          aria-label={t('toggle_channels')}
          onClick={onToggleChannels}
        />
        <h2 className={styles.paneTitle}>{channelLabel}</h2>
        {/* The count follows the visible list, so a search moves it with the rows. */}
        <span className={styles.paneCount}>{conversations.length}</span>
      </div>

      <div className={styles.paneRow}>
        <Input
          className={styles.grow}
          type="search"
          value={search}
          onValueChange={onSearchChange}
          placeholder={t('search_conversations')}
          icon={<SearchIcon />}
          aria-label={t('search_conversations')}
        />
      </div>

      <div className={cx(styles.paneRow, styles.paneToolbar)}>
        <span className={styles.toolbarCount}>
          {t('open_count').replace('{count}', String(countOpen(conversations)))}
        </span>
        <Select
          value={sort}
          onValueChange={(value) => {
            if (isSortOrder(value)) onSortChange(value);
          }}
          items={sortItems}
        >
          <SelectTrigger size="sm" variant="filter" aria-label={t('sort_conversations')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {sortItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className={styles.listBody}>
        <ItemGroup className={styles.conversationGroup}>
          {conversations.map((conversation) => {
            const contact = contactsById.get(conversation.contactId);
            return (
              <Item
                key={conversation.id}
                className={styles.conversationRow}
                variant={conversation.id === selectedConversationId ? 'muted' : 'default'}
                render={
                  <button
                    type="button"
                    onClick={() => onSelectConversation(conversation.id)}
                    aria-current={
                      conversation.id === selectedConversationId ? 'true' : undefined
                    }
                  />
                }
              >
                <ItemMedia>
                  <PresenceAvatar
                    name={contact?.name ?? conversation.subject}
                    presence={contact?.presence ?? 'offline'}
                    size="lg"
                  />
                </ItemMedia>
                <ItemContent>
                  <div className={styles.rowLine}>
                    <ItemTitle className={cx(styles.rowText, styles.rowTitleText)}>
                      {conversation.subject}
                    </ItemTitle>
                    <span className={styles.rowTime}>
                      {shortRelativeTime(conversation.lastActivityAt)}
                    </span>
                  </div>
                  <div className={styles.rowLine}>
                    <ItemDescription className={cx(styles.rowText, styles.rowPreviewText)}>
                      {conversation.snippet}
                    </ItemDescription>
                    {conversation.unreadCount > 0 ? (
                      <Badge className={styles.unreadBadge} aria-label={t('unread_messages')}>
                        {conversation.unreadCount}
                      </Badge>
                    ) : null}
                  </div>
                </ItemContent>
              </Item>
            );
          })}
        </ItemGroup>
      </div>
    </section>
  );
}
