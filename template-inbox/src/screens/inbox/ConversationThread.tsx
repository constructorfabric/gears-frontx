import {
  AlarmClockIcon,
  ArrowLeftIcon,
  CircleAlertIcon,
  MoreHorizontalIcon,
  PaperclipIcon,
  PanelRightIcon,
  StarIcon,
  TicketIcon,
  UserMinusIcon,
} from 'lucide-react';
import {
  Attachment,
  AttachmentContent,
  AttachmentDescription,
  AttachmentMedia,
  AttachmentTitle,
  Bubble,
  BubbleContent,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Message,
  MessageAvatar,
  MessageContent,
  MessageFooter,
  MessageHeader,
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
  useMessageScrollerScrollable,
} from '@gears-frontx/ui-kit';
import type {
  AgentIdentity,
  Contact,
  Conversation,
  Message as ThreadMessage,
} from '../../api/types';
import { labelOf } from '../../shared/format';
import { PresenceAvatar } from '../../shared/PresenceAvatar';
import { Composer, type ComposerProps } from './Composer';
import styles from '../../styles/workspace.module.css';

/**
 * Three bubble roles, spelled out rather than nested in the markup: an
 * internal note is quiet on purpose, the agent's own messages carry the
 * primary fill, and the customer's carry the neutral one.
 */
const bubbleVariantFor = (message: ThreadMessage): 'muted' | 'default' | 'secondary' => {
  if (message.internal) return 'muted';
  return message.direction === 'outbound' ? 'default' : 'secondary';
};

/**
 * The jump-to-newest affordance only makes sense while there is content below
 * the fold, and the hook that knows must run under the provider - hence a
 * component of its own rather than a branch in the parent.
 */
function ScrollToNewest({ label }: { label: string }) {
  const { end } = useMessageScrollerScrollable();
  return end ? <MessageScrollerButton direction="end" aria-label={label} /> : null;
}

export type ConversationThreadProps = {
  conversation: Conversation;
  contact: Contact | undefined;
  agent: AgentIdentity | undefined;
  messages: ThreadMessage[];
  detailsVisible: boolean;
  onToggleDetails: () => void;
  onToggleStar: () => void;
  onToggleSnooze: () => void;
  onCloseConversation: () => void;
  onBack: (() => void) | null;
  /** Puts the chip's text in the composer; the chip row is what calls it. */
  onUseSuggestedReply: (reply: string) => void;
  composer: ComposerProps;
  t: (key: string) => string;
};

export function ConversationThread({
  conversation,
  contact,
  agent,
  messages,
  detailsVisible,
  onToggleDetails,
  onToggleStar,
  onToggleSnooze,
  onCloseConversation,
  onBack,
  onUseSuggestedReply,
  composer,
  t,
}: ConversationThreadProps) {
  const contactName = contact?.name ?? conversation.subject;
  const suggestions = conversation.suggestedReplies;

  return (
    <div className={styles.thread}>
      <div className={styles.threadHeader}>
        {onBack ? (
          <Button
            variant="ghost"
            size="sm"
            icon={<ArrowLeftIcon />}
            aria-label={t('back_to_list')}
            onClick={onBack}
          />
        ) : null}
        <PresenceAvatar
          name={contactName}
          presence={contact?.presence ?? 'offline'}
          size="lg"
        />
        <div className={styles.threadTitles}>
          <span className={styles.threadSubject}>{conversation.subject}</span>
          <span className={styles.threadSubtitle}>
            {`${contactName} - ${labelOf(contact?.presence ?? 'offline')}`}
          </span>
        </div>
        <span className={styles.spacer} />
        <div className={styles.threadActions}>
          <Button
            variant="ghost"
            size="sm"
            icon={<StarIcon />}
            aria-label={conversation.starred ? t('unstar_conversation') : t('star_conversation')}
            aria-pressed={conversation.starred}
            onClick={onToggleStar}
          />
          <Button
            variant="ghost"
            size="sm"
            icon={<AlarmClockIcon />}
            aria-label={conversation.snoozed ? t('unsnooze_conversation') : t('snooze_conversation')}
            aria-pressed={conversation.snoozed}
            onClick={onToggleSnooze}
          />
          {/*
            Create-ticket and the two overflow entries below carry no handler:
            Tickets is a section this template does not ship, and unassigning
            is a routing change the details panel already owns through its
            Assignee combobox. They are drawn at full contrast rather than
            disabled because the header they belong to is being matched to the
            reference, where both read as live chrome.
          */}
          <Button
            variant="ghost"
            size="sm"
            icon={<TicketIcon />}
            aria-label={t('create_ticket')}
          />
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="ghost" size="sm" icon={<MoreHorizontalIcon />} aria-label={t('more_actions')} />
              }
            />
            <DropdownMenuContent align="end">
              <DropdownMenuItem>
                <UserMinusIcon />
                {t('unassign')}
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive">
                <CircleAlertIcon />
                {t('mark_as_spam')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="ghost"
            size="sm"
            icon={<PanelRightIcon />}
            aria-label={t('toggle_details')}
            aria-pressed={detailsVisible}
            onClick={onToggleDetails}
          />
          <Button
            variant="destructive"
            size="sm"
            disabled={conversation.status === 'closed'}
            onClick={onCloseConversation}
          >
            {conversation.status === 'closed' ? t('closed') : t('close')}
          </Button>
        </div>
      </div>

      <MessageScrollerProvider>
        <MessageScroller className={styles.transcript}>
          <MessageScrollerViewport>
            <MessageScrollerContent>
              {messages.map((message, index) => {
                const outbound = message.direction === 'outbound';
                const senderName = outbound ? (agent?.name ?? '') : contactName;
                return (
                  <MessageScrollerItem
                    key={message.id}
                    messageId={message.id}
                    scrollAnchor={index === messages.length - 1}
                  >
                    <Message align={outbound ? 'end' : 'start'}>
                      <MessageAvatar>
                        <PresenceAvatar
                          name={senderName}
                          presence={
                            outbound ? (agent?.presence ?? 'online') : (contact?.presence ?? 'offline')
                          }
                          size="sm"
                        />
                      </MessageAvatar>
                      <MessageContent>
                        {message.internal ? (
                          <MessageHeader>{t('internal_note')}</MessageHeader>
                        ) : null}
                        {message.attachment ? (
                          <Attachment className={styles.attachmentSlot}>
                            <AttachmentMedia>
                              <PaperclipIcon />
                            </AttachmentMedia>
                            <AttachmentContent>
                              <AttachmentTitle>{message.attachment.name}</AttachmentTitle>
                              <AttachmentDescription>
                                {message.attachment.size}
                              </AttachmentDescription>
                            </AttachmentContent>
                          </Attachment>
                        ) : null}
                        <Bubble
                          align={outbound ? 'end' : 'start'}
                          variant={bubbleVariantFor(message)}
                        >
                          <BubbleContent>{message.body}</BubbleContent>
                        </Bubble>
                        <MessageFooter>
                          <span className={styles.messageMeta}>
                            {/*
                              A read receipt is an outbound-only fact: an
                              inbound message never carries one, which is why
                              `seen` is null rather than false there.
                            */}
                            {message.seen === null
                              ? message.timestamp
                              : `${message.timestamp} - ${message.seen ? t('seen') : t('not_seen')}`}
                          </span>
                        </MessageFooter>
                      </MessageContent>
                    </Message>
                  </MessageScrollerItem>
                );
              })}
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <ScrollToNewest label={t('scroll_to_newest')} />
        </MessageScroller>
      </MessageScrollerProvider>

      {/*
        The assistant's drafts sit between the transcript and the composer, as
        the last thing read before the reply is written. An empty list renders
        nothing at all rather than an empty row, so a spam or parked thread
        keeps the transcript flush against the composer.
      */}
      {suggestions.length > 0 ? (
        <div className={styles.suggestions} aria-label={t('suggested_replies')} role="group">
          {suggestions.map((reply) => (
            <Button
              key={reply}
              className={styles.suggestionChip}
              variant="outline"
              size="sm"
              onClick={() => onUseSuggestedReply(reply)}
            >
              {reply}
            </Button>
          ))}
        </div>
      ) : null}

      <Composer {...composer} />
    </div>
  );
}
