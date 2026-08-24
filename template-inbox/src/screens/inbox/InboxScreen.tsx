import { useMemo, useState } from 'react';
import { InboxIcon } from 'lucide-react';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Skeleton,
} from '@gears-frontx/ui-kit';
import { useApiMutation, useApiQuery } from '../../api/queries';
import { getInboxApi } from '../../api/registry';
import { CHANNEL_GENERAL } from '../../api/dataset';
import type {
  Contact,
  Conversation,
  ConversationPriority,
  ConversationStatus,
  Message,
  PostMessageRequest,
  PostMessageResponse,
} from '../../api/types';
import type { Translate } from '../../app/i18n';
import { contactRoute, navigate } from '../../app/routing';
import { cx } from '../../shared/cx';
import { COMPACT_QUERY, SINGLE_PANE_QUERY, useMediaQuery } from '../../shared/useMediaQuery';
import { ConversationList } from './ConversationList';
import { ConversationThread } from './ConversationThread';
import { countOpen, selectConversations, type SortOrder } from './conversationOrdering';
import { CustomerDetailsPanel } from './CustomerDetailsPanel';
import { FolderSidebar } from './FolderSidebar';
import { type ComposerTab } from './Composer';
import styles from '../../styles/workspace.module.css';

/**
 * The fields a triaging agent changes from the thread, held client-side.
 *
 * The service's write surface is one endpoint - posting a reply or a note -
 * because that is the only change the reference actually persists. Everything
 * else the details panel offers moves a value that a real backend would own,
 * so it is applied over the fetched conversation rather than pretending to
 * have been saved.
 */
type ConversationPatch = Partial<
  Pick<
    Conversation,
    'assignee' | 'priority' | 'snoozed' | 'starred' | 'status' | 'tags' | 'teamInbox'
  >
>;

export type InboxScreenProps = {
  t: Translate;
};

export function InboxScreen({ t }: InboxScreenProps) {
  const service = getInboxApi();

  const agentQuery = useApiQuery(service.getAgent);
  const channelsQuery = useApiQuery(service.getChannels);
  const conversationsQuery = useApiQuery(service.getConversations);
  const messagesQuery = useApiQuery(service.getMessages);
  const contactsQuery = useApiQuery(service.getContacts);

  const [channelId, setChannelId] = useState<string>(CHANNEL_GENERAL);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // The channel still owed an automatic first-conversation pick: set on mount
  // and on every channel switch, cleared once that pick has happened. Nulled
  // by closing or backing out of a thread does not touch this, so those stay
  // on the empty state rather than jumping to another conversation.
  const [autoSelectChannelId, setAutoSelectChannelId] = useState<string | null>(CHANNEL_GENERAL);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortOrder>('last-activity');
  const [channelsCollapsed, setChannelsCollapsed] = useState(false);
  const [detailsVisible, setDetailsVisible] = useState(true);
  const [patches, setPatches] = useState<Record<string, ConversationPatch>>({});
  const [sentMessages, setSentMessages] = useState<Message[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [composerTab, setComposerTab] = useState<ComposerTab>('reply');

  const isCompact = useMediaQuery(COMPACT_QUERY);
  const isSinglePane = useMediaQuery(SINGLE_PANE_QUERY);

  const sendMessage = useApiMutation<PostMessageResponse, PostMessageRequest>({
    endpoint: service.postMessage,
    onSuccess: (response) => {
      setSentMessages((previous) => [...previous, response.message]);
      // Cleared per conversation rather than globally, so a draft the agent
      // left open on another thread survives a send on this one.
      setDrafts((previous) => ({ ...previous, [response.message.conversationId]: '' }));
    },
  });

  const conversations: Conversation[] = useMemo(() => {
    const fetched = conversationsQuery.data?.conversations ?? [];
    return fetched.map((conversation) => ({ ...conversation, ...patches[conversation.id] }));
  }, [conversationsQuery.data, patches]);

  const contactsById = useMemo(() => {
    const index = new Map<string, Contact>();
    for (const contact of contactsQuery.data?.contacts ?? []) index.set(contact.id, contact);
    return index;
  }, [contactsQuery.data]);

  const visibleConversations = useMemo(
    () => selectConversations(conversations, contactsById, channelId, search, sort),
    [conversations, contactsById, channelId, search, sort]
  );

  // Auto-opens the channel's first conversation - on the initial mount and
  // again on every channel switch (`selectChannel` re-arms this by setting
  // `autoSelectChannelId` to the channel just entered). Resolved here,
  // synchronously during render, rather than in a `useEffect`: this is
  // derived state (React's own "adjust state when something changes"
  // pattern - see "You Might Not Need an Effect"), not a synchronization
  // with anything outside React, so settling it a render early avoids both
  // the lint rule against setting state from an effect and the one-frame
  // flash of the empty state an effect-based version would show first.
  // Guarded by the id match so a click that picks a different conversation,
  // once consumed, never gets second-guessed while the agent stays in that
  // channel; an empty channel is simply left on the empty state, still
  // armed, in case a later fetch surfaces conversations for it.
  if (autoSelectChannelId === channelId && visibleConversations.length > 0) {
    setAutoSelectChannelId(null);
    if (selectedId !== visibleConversations[0].id) {
      setSelectedId(visibleConversations[0].id);
    }
  }

  // Selected from the whole collection rather than the visible slice: typing a
  // search narrows the list without closing the thread the agent is reading.
  const selected = conversations.find((conversation) => conversation.id === selectedId) ?? null;

  const threadMessages = useMemo(() => {
    if (!selected) return [];
    const fetched = messagesQuery.data?.messages ?? [];
    return [...fetched, ...sentMessages].filter(
      (message) => message.conversationId === selected.id
    );
  }, [messagesQuery.data, sentMessages, selected]);

  const channels = useMemo(() => {
    const rows = channelsQuery.data?.channels ?? [];
    return rows.map((channel) => {
      const inChannel = conversations.filter(
        (conversation) => conversation.channelId === channel.id
      );
      return { ...channel, itemCount: inChannel.length, openCount: countOpen(inChannel) };
    });
  }, [channelsQuery.data, conversations]);

  const patchConversation = (conversationId: string, patch: ConversationPatch) => {
    setPatches((previous) => ({
      ...previous,
      [conversationId]: { ...previous[conversationId], ...patch },
    }));
  };

  const selectChannel = (nextChannelId: string) => {
    setChannelId(nextChannelId);
    setSelectedId(null);
    setAutoSelectChannelId(nextChannelId);
  };

  if (channelsQuery.isLoading) {
    return (
      <div className={styles.emptyPane} role="status" aria-busy="true">
        <Skeleton style={{ height: '2rem', width: '16rem' }} />
      </div>
    );
  }

  const channelLabel = channels.find((channel) => channel.id === channelId)?.label ?? '';
  const isSpam = selected?.tags.includes('spam') ?? false;
  const showThread = selected !== null;

  const sendCurrentDraft = () => {
    if (!selected) return;
    const body = (drafts[selected.id] ?? '').trim();
    if (body === '') return;
    sendMessage.mutate({ conversationId: selected.id, body, kind: composerTab });
  };

  return (
    <>
      <FolderSidebar
        channels={channels}
        selectedChannelId={channelId}
        onSelectChannel={selectChannel}
        // Below the compact width the column has no room to open into, so the
        // toggle reflects the viewport rather than fighting it.
        collapsed={channelsCollapsed || isCompact}
        t={t}
      />

      <ConversationList
        conversations={visibleConversations}
        contactsById={contactsById}
        channelLabel={channelLabel}
        selectedConversationId={selectedId}
        onSelectConversation={setSelectedId}
        search={search}
        onSearchChange={setSearch}
        sort={sort}
        onSortChange={setSort}
        onToggleChannels={() => setChannelsCollapsed((collapsed) => !collapsed)}
        hidden={isSinglePane && showThread}
        t={t}
      />

      <div className={cx(styles.detailPane, isSinglePane && !showThread && styles.singlePaneHidden)}>
        {selected ? (
          <>
            <ConversationThread
              conversation={selected}
              contact={contactsById.get(selected.contactId)}
              agent={agentQuery.data?.agent}
              messages={threadMessages}
              detailsVisible={detailsVisible}
              onToggleDetails={() => setDetailsVisible((visible) => !visible)}
              onToggleStar={() => patchConversation(selected.id, { starred: !selected.starred })}
              onToggleSnooze={() =>
                patchConversation(selected.id, {
                  snoozed: !selected.snoozed,
                  status: selected.snoozed ? 'open' : 'snoozed',
                })
              }
              onCloseConversation={() => {
                patchConversation(selected.id, { status: 'closed' });
                setSelectedId(null);
              }}
              onBack={isSinglePane ? () => setSelectedId(null) : null}
              onUseSuggestedReply={(reply) => {
                // A suggestion is a draft, not a send: it lands in the reply
                // box for the agent to edit. Appended rather than assigned so
                // a half-typed reply survives the click, and the tab is
                // switched because a suggestion is never an internal note.
                setComposerTab('reply');
                setDrafts((previous) => {
                  const current = previous[selected.id] ?? '';
                  return {
                    ...previous,
                    [selected.id]: current === '' ? reply : `${current} ${reply}`,
                  };
                });
              }}
              composer={{
                tab: composerTab,
                onTabChange: setComposerTab,
                draft: drafts[selected.id] ?? '',
                onDraftChange: (draft) =>
                  setDrafts((previous) => ({ ...previous, [selected.id]: draft })),
                onSend: sendCurrentDraft,
                sending: sendMessage.isPending,
                t,
              }}
              t={t}
            />
            {detailsVisible ? (
              <CustomerDetailsPanel
                conversation={selected}
                contact={contactsById.get(selected.contactId)}
                agent={agentQuery.data?.agent}
                isSpam={isSpam}
                onViewContact={() => navigate(contactRoute(selected.contactId))}
                onAssigneeChange={(assignee: string) =>
                  patchConversation(selected.id, { assignee })
                }
                onTeamInboxChange={(teamInbox: string) =>
                  patchConversation(selected.id, { teamInbox })
                }
                onPriorityChange={(priority: ConversationPriority) =>
                  patchConversation(selected.id, { priority })
                }
                onStatusChange={(status: ConversationStatus) =>
                  patchConversation(selected.id, { status, snoozed: status === 'snoozed' })
                }
                onToggleSpam={() => {
                  // Spam is a tag, not a channel: the conversation stays put in
                  // whichever channel it is already in, so marking or
                  // unmarking it never moves the selection out from under the
                  // agent.
                  patchConversation(selected.id, {
                    tags: isSpam
                      ? selected.tags.filter((tag) => tag !== 'spam')
                      : [...selected.tags, 'spam'],
                  });
                }}
                onAddTag={(tag: string) =>
                  patchConversation(selected.id, { tags: [...selected.tags, tag] })
                }
                onRemoveTag={(tag: string) =>
                  patchConversation(selected.id, {
                    tags: selected.tags.filter((existing) => existing !== tag),
                  })
                }
                t={t}
              />
            ) : null}
          </>
        ) : (
          <div className={styles.emptyPane}>
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <InboxIcon />
                </EmptyMedia>
                <EmptyTitle>{t('empty_title')}</EmptyTitle>
                <EmptyDescription>{t('empty_description')}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          </div>
        )}
      </div>
    </>
  );
}
