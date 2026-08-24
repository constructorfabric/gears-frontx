import { useState } from 'react';
import { PanelLeftIcon, PinIcon, SearchIcon, UserRoundPlusIcon } from 'lucide-react';
import {
  Badge,
  Button,
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Field,
  FieldLabel,
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
  SidebarGroupLabel,
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
  onStartChat: (contactId: string) => void;
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
  onStartChat,
  search,
  onSearchChange,
  sort,
  onSortChange,
  onToggleChannels,
  hidden,
  t,
}: ConversationListProps) {
  const sortItems = SORT_ORDERS.map((order) => ({ value: order, label: t(SORT_LABEL_KEY[order]) }));
  const [newChatOpen, setNewChatOpen] = useState(false);
  // The whole `{ value, label }` item, not just the id: passing a plain
  // string as `ComboboxItem`'s own `value` has no `label` for the kit's
  // Combobox to auto-stringify against, so the input would echo the raw
  // contact id back once picked instead of the contact's name - passing
  // the full item value is what the kit's own "the label will be used
  // automatically" rule (combobox.md) actually requires.
  const [newChatContact, setNewChatContact] = useState<{ value: string; label: string } | null>(
    null
  );
  const contactItems = Array.from(contactsById.values()).map((contact) => ({
    value: contact.id,
    label: contact.name,
  }));

  const submitNewChat = () => {
    if (newChatContact === null) return;
    onStartChat(newChatContact.value);
    setNewChatContact(null);
    setNewChatOpen(false);
  };

  // `conversations` already sorts pinned rows first (conversationOrdering.ts's
  // comparators do this regardless of `sort`), so splitting it in two here is
  // a plain filter, not a re-sort - each half keeps the order it arrived in.
  const pinnedConversations = conversations.filter((conversation) => conversation.pinned);
  const otherConversations = conversations.filter((conversation) => !conversation.pinned);

  const renderRow = (conversation: Conversation) => {
    const contact = contactsById.get(conversation.contactId);
    return (
      <Item
        key={conversation.id}
        className={cx(
          styles.conversationRow,
          conversation.id === selectedConversationId && styles.rowSelected
        )}
        variant={conversation.id === selectedConversationId ? 'muted' : 'default'}
        render={
          <button
            type="button"
            onClick={() => onSelectConversation(conversation.id)}
            aria-current={conversation.id === selectedConversationId ? 'true' : undefined}
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
            <span className={styles.rowTime}>{shortRelativeTime(conversation.lastActivityAt)}</span>
          </div>
          <div className={styles.rowLine}>
            <ItemDescription className={cx(styles.rowText, styles.rowPreviewText)}>
              {conversation.snippet}
            </ItemDescription>
            <span className={styles.rowActionsGroup}>
              {conversation.pinned ? (
                <PinIcon className={styles.pinIcon} aria-label={t('pinned_conversation')} />
              ) : null}
              {conversation.unreadCount > 0 ? (
                <Badge className={styles.unreadBadge} aria-label={t('unread_messages')}>
                  {conversation.unreadCount}
                </Badge>
              ) : null}
            </span>
          </div>
        </ItemContent>
      </Item>
    );
  };

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
        <Dialog
          open={newChatOpen}
          onOpenChange={(open) => {
            setNewChatOpen(open);
            if (!open) setNewChatContact(null);
          }}
        >
          <DialogTrigger
            render={
              <Button
                variant="ghost"
                size="sm"
                icon={<UserRoundPlusIcon />}
                aria-label={t('new_chat')}
              />
            }
          />
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('new_chat')}</DialogTitle>
            </DialogHeader>
            <Field>
              <FieldLabel>{t('new_chat_contact_label')}</FieldLabel>
              <Combobox
                items={contactItems}
                value={newChatContact}
                onValueChange={(value) => setNewChatContact(value)}
              >
                <ComboboxInput
                  autoFocus
                  placeholder={t('new_chat_contact_placeholder')}
                  aria-label={t('new_chat_contact_label')}
                />
                <ComboboxContent>
                  <ComboboxEmpty>{t('no_contacts_match')}</ComboboxEmpty>
                  <ComboboxList>
                    {(item: { value: string; label: string }) => (
                      <ComboboxItem key={item.value} value={item}>
                        {item.label}
                      </ComboboxItem>
                    )}
                  </ComboboxList>
                </ComboboxContent>
              </Combobox>
            </Field>
            <DialogFooter>
              <DialogClose render={<Button type="button" variant="outline" />}>
                {t('cancel')}
              </DialogClose>
              <Button type="button" disabled={newChatContact === null} onClick={submitNewChat}>
                {t('start_chat')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
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
        {pinnedConversations.length > 0 ? (
          <>
            <SidebarGroupLabel>{t('pinned')}</SidebarGroupLabel>
            <ItemGroup className={styles.conversationGroup}>
              {pinnedConversations.map(renderRow)}
            </ItemGroup>
          </>
        ) : null}
        <ItemGroup className={styles.conversationGroup}>
          {otherConversations.map(renderRow)}
        </ItemGroup>
      </div>
    </section>
  );
}
