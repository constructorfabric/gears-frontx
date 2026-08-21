import type { KeyboardEvent } from 'react';
import { SendIcon } from 'lucide-react';
import { Button, Tabs, TabsContent, TabsList, TabsTrigger, Textarea } from '@gears-frontx/ui-kit';
import { cx } from '../../shared/cx';
import styles from '../../styles/workspace.module.css';

export const COMPOSER_TABS = ['reply', 'note'] as const;

export type ComposerTab = (typeof COMPOSER_TABS)[number];

export const isComposerTab = (value: unknown): value is ComposerTab =>
  typeof value === 'string' && COMPOSER_TABS.some((tab) => tab === value);

export type ComposerProps = {
  tab: ComposerTab;
  onTabChange: (tab: ComposerTab) => void;
  draft: string;
  onDraftChange: (draft: string) => void;
  onSend: () => void;
  sending: boolean;
  t: (key: string) => string;
};

export function Composer({
  tab,
  onTabChange,
  draft,
  onDraftChange,
  onSend,
  sending,
  t,
}: ComposerProps) {
  const isNote = tab === 'note';
  const canSend = draft.trim() !== '' && !sending;

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && canSend) {
      event.preventDefault();
      onSend();
    }
  };

  // One body for both tabs: the reference keeps the same box and swaps only
  // the placeholder, the submit label and the frame. Each tab still owns a
  // panel so the tablist has something to control.
  const body = (
    <div className={cx(styles.composerBox, isNote && styles.composerBoxNote)}>
      <Textarea
        rows={3}
        value={draft}
        onChange={(event) => onDraftChange(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder={isNote ? t('note_placeholder') : t('reply_placeholder')}
        aria-label={isNote ? t('note') : t('reply')}
      />
      <div className={styles.composerToolbar}>
        <span className={styles.composerHint}>{t('send_shortcut')}</span>
        <Button icon={<SendIcon />} disabled={!canSend} loading={sending} onClick={onSend}>
          {isNote ? t('add_note') : t('send')}
        </Button>
      </div>
    </div>
  );

  return (
    <div className={styles.composer}>
      <Tabs
        value={tab}
        onValueChange={(value) => {
          if (isComposerTab(value)) onTabChange(value);
        }}
      >
        <TabsList variant="line">
          <TabsTrigger value="reply">{t('reply')}</TabsTrigger>
          <TabsTrigger value="note">{t('note')}</TabsTrigger>
        </TabsList>
        <TabsContent value="reply">{body}</TabsContent>
        <TabsContent value="note">{body}</TabsContent>
      </Tabs>
    </div>
  );
}
