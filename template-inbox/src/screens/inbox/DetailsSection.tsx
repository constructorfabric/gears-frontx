import { useState, type ReactNode } from 'react';
import { ChevronDownIcon, ChevronRightIcon } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@gears-frontx/ui-kit';
import styles from '../../styles/workspace.module.css';

export type DetailsSectionProps = {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
};

/**
 * One collapsible block of the customer details panel. The open state lives
 * here rather than in the panel because nothing outside the section reads it,
 * and the reference opens every section except Links by default.
 */
export function DetailsSection({ title, defaultOpen = true, children }: DetailsSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className={styles.section}>
      <CollapsibleTrigger className={styles.sectionTrigger}>
        <span>{title}</span>
        {open ? <ChevronDownIcon /> : <ChevronRightIcon />}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className={styles.stack}>{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}
