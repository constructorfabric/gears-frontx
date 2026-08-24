import { useId, useState, type FormEvent, type ReactElement } from 'react';
import { ArchiveIcon, FileTextIcon, InboxIcon, PenSquareIcon, SendIcon, Trash2Icon } from 'lucide-react';
import {
  Badge,
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Field,
  FieldGroup,
  FieldLabel,
  Input,
  Item,
  ItemActions,
  ItemContent,
  ItemGroup,
  ItemMedia,
  ItemTitle,
  Textarea,
} from '@gears-frontx/ui-kit';
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

export type ComposedMail = {
  to: string;
  subject: string;
  body: string;
};

export type MailboxSidebarProps = {
  mailboxes: Mailbox[];
  mails: Mail[];
  selectedMailboxId: MailboxId;
  onSelectMailbox: (mailboxId: MailboxId) => void;
  onComposeMail: (mail: ComposedMail) => void;
  collapsed: boolean;
  t: Translate;
};

const EMPTY_DRAFT: ComposedMail = { to: '', subject: '', body: '' };

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
  onComposeMail,
  collapsed,
  t,
}: MailboxSidebarProps) {
  const toFieldId = useId();
  const subjectFieldId = useId();
  const bodyFieldId = useId();
  const [composeOpen, setComposeOpen] = useState(false);
  const [draft, setDraft] = useState<ComposedMail>(EMPTY_DRAFT);

  // The exact completeness rule for this demo: a recipient is always
  // required, plus at least one of Subject/Body - an address alone with
  // nothing else to send is not a real draft, but a bare subject line (or
  // a bare body) already is.
  const canSend = draft.to.trim() !== '' && (draft.subject.trim() !== '' || draft.body.trim() !== '');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!canSend) return;
    onComposeMail(draft);
    setDraft(EMPTY_DRAFT);
    setComposeOpen(false);
  };

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
        <Dialog
          open={composeOpen}
          onOpenChange={(open) => {
            setComposeOpen(open);
            if (!open) setDraft(EMPTY_DRAFT);
          }}
        >
          <DialogTrigger
            render={
              <Button variant="default" className={mailStyles.composeButton} icon={<PenSquareIcon />}>
                {t('compose')}
              </Button>
            }
          />
          <DialogContent>
            <form onSubmit={submit}>
              <DialogHeader>
                <DialogTitle>{t('compose_mail_title')}</DialogTitle>
              </DialogHeader>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor={toFieldId}>{t('compose_to_label')}</FieldLabel>
                  <Input
                    id={toFieldId}
                    type="email"
                    value={draft.to}
                    onValueChange={(to) => setDraft((previous) => ({ ...previous, to }))}
                    placeholder={t('compose_to_placeholder')}
                    autoFocus
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor={subjectFieldId}>{t('compose_subject_label')}</FieldLabel>
                  <Input
                    id={subjectFieldId}
                    value={draft.subject}
                    onValueChange={(subject) => setDraft((previous) => ({ ...previous, subject }))}
                    placeholder={t('compose_subject_placeholder')}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor={bodyFieldId}>{t('compose_body_label')}</FieldLabel>
                  <Textarea
                    id={bodyFieldId}
                    rows={6}
                    value={draft.body}
                    onChange={(event) =>
                      setDraft((previous) => ({ ...previous, body: event.target.value }))
                    }
                    placeholder={t('compose_body_placeholder')}
                  />
                </Field>
              </FieldGroup>
              <DialogFooter>
                <DialogClose render={<Button type="button" variant="outline" />}>
                  {t('cancel')}
                </DialogClose>
                <Button type="submit" icon={<SendIcon />} disabled={!canSend}>
                  {t('send')}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <ItemGroup>
          {mailboxes.map((mailbox) => (
            <Item
              key={mailbox.id}
              size="sm"
              className={cx(styles.folderItem, mailbox.id === selectedMailboxId && styles.rowSelected)}
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
