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
import { apiRegistry, useApiMutation, useApiQuery, type ChildMfeBridge } from '@gears-frontx/react';
import { InboxApiService } from '../../api/InboxApiService';
import { FOLDER_SPAM, FOLDER_YOUR_INBOX } from '../../api/dataset';
import type {
  Contact,
  Conversation,
  ConversationPriority,
  ConversationStatus,
  Message,
  PostMessageRequest,
  PostMessageResponse,
} from '../../api/types';
import { cx } from '../../shared/cx';
import { openContactDetail } from '../../shared/crossScreenNavigation';
import { COMPACT_QUERY, SINGLE_PANE_QUERY, useMediaQuery } from '../../shared/useMediaQuery';
import { useScreenTranslations } from '../../shared/useScreenTranslations';
import { WorkspaceRoot } from '../../shared/WorkspaceRoot';
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
    'assignee' | 'folderId' | 'priority' | 'snoozed' | 'starred' | 'status' | 'tags' | 'teamInbox'
  >
>;

export type InboxScreenProps = {
  bridge: ChildMfeBridge;
};

export function InboxScreen({ bridge }: InboxScreenProps) {
  const service = apiRegistry.getService(InboxApiService);
  const { t, loading: translationsLoading } = useScreenTranslations(bridge);

  const agentQuery = useApiQuery(service.getAgent);
  const foldersQuery = useApiQuery(service.getFolders);
  const conversationsQuery = useApiQuery(service.getConversations);
  const messagesQuery = useApiQuery(service.getMessages);
  const contactsQuery = useApiQuery(service.getContacts);

  const [folderId, setFolderId] = useState<string>(FOLDER_YOUR_INBOX);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortOrder>('last-activity');
  const [foldersCollapsed, setFoldersCollapsed] = useState(false);
  const [detailsVisible, setDetailsVisible] = useState(true);
  const [patches, setPatches] = useState<Record<string, ConversationPatch>>({});
  const [sentMessages, setSentMessages] = useState<Message[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [composerTab, setComposerTab] = useState<ComposerTab>('reply');

  const isCompact = useMediaQuery(COMPACT_QUERY);
  const isSinglePane = useMediaQuery(SINGLE_PANE_QUERY);

  const sendMessage = useApiMutation<PostMessageResponse, Error, PostMessageRequest>({
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
    () => selectConversations(conversations, contactsById, folderId, search, sort),
    [conversations, contactsById, folderId, search, sort]
  );

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

  const folders = useMemo(() => {
    const rows = foldersQuery.data?.folders ?? [];
    return rows.map((folder) => {
      const inFolder = conversations.filter(
        (conversation) => conversation.folderId === folder.id
      );
      return { ...folder, itemCount: inFolder.length, openCount: countOpen(inFolder) };
    });
  }, [foldersQuery.data, conversations]);

  const patchConversation = (conversationId: string, patch: ConversationPatch) => {
    setPatches((previous) => ({
      ...previous,
      [conversationId]: { ...previous[conversationId], ...patch },
    }));
  };

  const selectFolder = (nextFolderId: string) => {
    setFolderId(nextFolderId);
    setSelectedId(null);
  };

  if (translationsLoading || foldersQuery.isLoading) {
    return (
      <WorkspaceRoot>
        <div className={styles.emptyPane} role="status" aria-busy="true">
          <Skeleton style={{ height: '2rem', width: '16rem' }} />
        </div>
      </WorkspaceRoot>
    );
  }

  const folderLabel = folders.find((folder) => folder.id === folderId)?.label ?? '';
  const isSpam = selected?.folderId === FOLDER_SPAM;
  const showThread = selected !== null;

  const sendCurrentDraft = () => {
    if (!selected) return;
    const body = (drafts[selected.id] ?? '').trim();
    if (body === '') return;
    sendMessage.mutate({ conversationId: selected.id, body, kind: composerTab });
  };

  return (
    <WorkspaceRoot>
      <FolderSidebar
        bridge={bridge}
        agent={agentQuery.data?.agent}
        folders={folders}
        selectedFolderId={folderId}
        onSelectFolder={selectFolder}
        // Below the compact width the column has no room to open into, so the
        // toggle reflects the viewport rather than fighting it.
        collapsed={foldersCollapsed || isCompact}
        t={t}
      />

      <ConversationList
        conversations={visibleConversations}
        contactsById={contactsById}
        folderLabel={folderLabel}
        selectedConversationId={selectedId}
        onSelectConversation={setSelectedId}
        search={search}
        onSearchChange={setSearch}
        sort={sort}
        onSortChange={setSort}
        onToggleFolders={() => setFoldersCollapsed((collapsed) => !collapsed)}
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
                onViewContact={() => openContactDetail(bridge, selected.contactId)}
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
                  patchConversation(selected.id, {
                    folderId: isSpam ? FOLDER_YOUR_INBOX : FOLDER_SPAM,
                    tags: isSpam
                      ? selected.tags.filter((tag) => tag !== 'spam')
                      : [...selected.tags, 'spam'],
                  });
                  // The conversation has left the folder the list is showing.
                  setSelectedId(null);
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
    </WorkspaceRoot>
  );
}
