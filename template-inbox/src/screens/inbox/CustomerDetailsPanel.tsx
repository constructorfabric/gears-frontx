import { PlusIcon, SendIcon, SparklesIcon } from 'lucide-react';
import {
  Button,
  Input,
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@gears-frontx/ui-kit';
import type {
  AgentIdentity,
  Contact,
  Conversation,
  ConversationPriority,
  ConversationStatus,
} from '../../api/types';
import { labelOf, orDash } from '../../shared/format';
import { PresenceAvatar } from '../../shared/PresenceAvatar';
import { DetailsSection } from './DetailsSection';
import { TagEditor } from './TagEditor';
import styles from '../../styles/workspace.module.css';

const UNASSIGNED = 'Unassigned';

const PRIORITIES: ConversationPriority[] = ['none', 'low', 'medium', 'high'];
const STATUSES: ConversationStatus[] = ['open', 'snoozed', 'closed'];

/**
 * The team inboxes a conversation can be routed to. The reference carries
 * these as folders of their own too; the folders are out of scope, the routing
 * value is not.
 */
const TEAM_INBOXES = ['No team inbox', 'Marketing Team', 'Billing', 'Customer Success'];

const COPILOT_PROMPTS = ['copilot_summarize', 'copilot_draft', 'copilot_asking'];

type FieldRowProps = { label: string; value: string };

function FieldRow({ label, value }: FieldRowProps) {
  return (
    <div className={styles.fieldRow}>
      <span className={styles.fieldLabel}>{label}</span>
      <span className={styles.fieldValue}>{orDash(value)}</span>
    </div>
  );
}

export type CustomerDetailsPanelProps = {
  conversation: Conversation;
  contact: Contact | undefined;
  agent: AgentIdentity | undefined;
  onViewContact: () => void;
  onAssigneeChange: (assignee: string) => void;
  onTeamInboxChange: (teamInbox: string) => void;
  onPriorityChange: (priority: ConversationPriority) => void;
  onStatusChange: (status: ConversationStatus) => void;
  onToggleSpam: () => void;
  onAddTag: (tag: string) => void;
  onRemoveTag: (tag: string) => void;
  isSpam: boolean;
  t: (key: string) => string;
};

export function CustomerDetailsPanel({
  conversation,
  contact,
  agent,
  onViewContact,
  onAssigneeChange,
  onTeamInboxChange,
  onPriorityChange,
  onStatusChange,
  onToggleSpam,
  onAddTag,
  onRemoveTag,
  isSpam,
  t,
}: CustomerDetailsPanelProps) {
  const assignees = [UNASSIGNED, agent?.name ?? ''].filter((name) => name !== '');
  const assigneeValue = conversation.assignee === '' ? UNASSIGNED : conversation.assignee;
  const contactName = contact?.name ?? conversation.subject;

  return (
    <aside className={styles.detailsPanel} aria-label={t('customer_details')}>
      <Tabs defaultValue="details">
        <TabsList variant="line">
          <TabsTrigger value="details">{t('details')}</TabsTrigger>
          <TabsTrigger value="copilot">{t('copilot')}</TabsTrigger>
        </TabsList>

        <TabsContent value="details">
          <div className={styles.detailsBody}>
            <div className={styles.contactCard}>
              <PresenceAvatar
                name={contactName}
                presence={contact?.presence ?? 'offline'}
                size="lg"
              />
              <span className={styles.contactCardName}>{contactName}</span>
              <span className={styles.identityMeta}>
                {labelOf(contact?.presence ?? 'offline')}
              </span>
              <Button variant="outline" size="sm" onClick={onViewContact} disabled={!contact}>
                {t('view_contact')}
              </Button>
            </div>

            <div className={styles.stack}>
              <Select
                value={assigneeValue}
                onValueChange={(value) => {
                  if (typeof value === 'string') {
                    onAssigneeChange(value === UNASSIGNED ? '' : value);
                  }
                }}
                items={assignees.map((name) => ({ value: name, label: name }))}
              >
                <SelectTrigger size="sm" aria-label={t('assignee')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {assignees.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={conversation.teamInbox}
                onValueChange={(value) => {
                  if (typeof value === 'string') onTeamInboxChange(value);
                }}
                items={TEAM_INBOXES.map((name) => ({ value: name, label: name }))}
              >
                <SelectTrigger size="sm" aria-label={t('team_inbox')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TEAM_INBOXES.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={conversation.priority}
                onValueChange={(value) => {
                  const match = PRIORITIES.find((priority) => priority === value);
                  if (match) onPriorityChange(match);
                }}
                items={PRIORITIES.map((priority) => ({
                  value: priority,
                  label: labelOf(priority),
                }))}
              >
                <SelectTrigger size="sm" aria-label={t('priority')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((priority) => (
                    <SelectItem key={priority} value={priority}>
                      {labelOf(priority)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={conversation.status}
                onValueChange={(value) => {
                  const match = STATUSES.find((status) => status === value);
                  if (match) onStatusChange(match);
                }}
                items={STATUSES.map((status) => ({ value: status, label: labelOf(status) }))}
              >
                <SelectTrigger size="sm" aria-label={t('status')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {labelOf(status)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button variant="outline" onClick={onToggleSpam}>
                {isSpam ? t('remove_from_spam') : t('mark_as_spam')}
              </Button>
            </div>

            <DetailsSection title={t('lead_data')}>
              <FieldRow label={t('name')} value={contact?.name ?? ''} />
              <FieldRow label={t('email')} value={contact?.email ?? ''} />
              <FieldRow label={t('company')} value={contact?.company ?? ''} />
              <FieldRow label={t('location')} value={contact?.location ?? ''} />
            </DetailsSection>

            <DetailsSection title={t('conversation_attributes')}>
              <FieldRow label={t('id')} value={conversation.id} />
              <FieldRow label={t('channel')} value={labelOf(conversation.channel)} />
              <FieldRow label={t('brand')} value={conversation.brand} />
            </DetailsSection>

            <DetailsSection title={t('tags')}>
              <TagEditor
                tags={conversation.tags}
                onAddTag={onAddTag}
                onRemoveTag={onRemoveTag}
                t={t}
              />
            </DetailsSection>

            {/*
              Placeholders in the reference too: both rows offer to attach a
              link and neither is ever populated in its data, so they stay
              affordances rather than becoming a feature this template invents.
            */}
            <DetailsSection title={t('links')} defaultOpen={false}>
              <div className={styles.fieldRow}>
                <span className={styles.fieldLabel}>{t('tracker_ticket')}</span>
                <Button variant="ghost" size="sm" icon={<PlusIcon />} disabled aria-label={t('attach_link')} />
              </div>
              <div className={styles.fieldRow}>
                <span className={styles.fieldLabel}>{t('back_office_tickets')}</span>
                <Button variant="ghost" size="sm" icon={<PlusIcon />} disabled aria-label={t('attach_link')} />
              </div>
            </DetailsSection>

            <DetailsSection title={t('shared_files')}>
              {conversation.sharedFiles.length === 0 ? (
                <span className={styles.identityMeta}>{t('no_files')}</span>
              ) : (
                <ItemGroup>
                  {conversation.sharedFiles.map((file) => (
                    <Item key={file.name} size="xs">
                      <ItemContent>
                        <ItemTitle>{file.name}</ItemTitle>
                        <ItemDescription>{file.size}</ItemDescription>
                      </ItemContent>
                    </Item>
                  ))}
                </ItemGroup>
              )}
            </DetailsSection>
          </div>
        </TabsContent>

        {/*
          The Copilot tab is the reference's static surface only. Wiring the
          prompts to a model is out of this template's scope, so the controls
          are present and inert rather than pretending to answer.
        */}
        <TabsContent value="copilot">
          <div className={styles.detailsBody}>
            <div className={styles.stack}>
              <span className={styles.contactCardName}>{t('copilot_title')}</span>
              <span className={styles.identityMeta}>{t('copilot_subtitle')}</span>
            </div>
            <div className={styles.stack}>
              {COPILOT_PROMPTS.map((prompt) => (
                <Button key={prompt} variant="outline" size="sm" icon={<SparklesIcon />} disabled>
                  {t(prompt)}
                </Button>
              ))}
            </div>
            <Input
              disabled
              placeholder={t('copilot_placeholder')}
              aria-label={t('copilot_placeholder')}
              end={<Button variant="ghost" size="sm" icon={<SendIcon />} aria-label={t('send')} />}
            />
          </div>
        </TabsContent>
      </Tabs>
    </aside>
  );
}
