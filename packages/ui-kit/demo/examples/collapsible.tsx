import { useState } from 'react';

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@gears-frontx/ui-kit';

import { Section } from '../shared';

function ControlledDemo() {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen} style={{ width: '20rem' }}>
      <CollapsibleTrigger>{open ? 'Hide' : 'Show'} advanced options</CollapsibleTrigger>
      <CollapsibleContent>Custom endpoint, retry policy, timeout.</CollapsibleContent>
    </Collapsible>
  );
}

export default function CollapsibleExample() {
  return (
    <>
      <Section title="Default">
        <Collapsible defaultOpen style={{ width: '20rem' }}>
          <CollapsibleTrigger>What is included?</CollapsibleTrigger>
          <CollapsibleContent>Everything in the Pro plan, plus priority support.</CollapsibleContent>
        </Collapsible>
      </Section>
      <Section title="Controlled">
        <ControlledDemo />
      </Section>
      <Section title="Disabled">
        <Collapsible disabled style={{ width: '20rem' }}>
          <CollapsibleTrigger>Locked section</CollapsibleTrigger>
          <CollapsibleContent>Unavailable on your current plan.</CollapsibleContent>
        </Collapsible>
      </Section>
      <Section title="Keep mounted">
        <Collapsible style={{ width: '20rem' }}>
          <CollapsibleTrigger>Custom endpoint</CollapsibleTrigger>
          <CollapsibleContent keepMounted>
            <input placeholder="https://api.example.com" style={{ width: '100%' }} />
          </CollapsibleContent>
        </Collapsible>
      </Section>
      <Section title="Nested">
        <Collapsible defaultOpen style={{ width: '20rem' }}>
          <CollapsibleTrigger>src</CollapsibleTrigger>
          <CollapsibleContent keepMounted style={{ paddingLeft: 'var(--space-4)' }}>
            <Collapsible defaultOpen>
              <CollapsibleTrigger>components</CollapsibleTrigger>
              <CollapsibleContent keepMounted style={{ paddingLeft: 'var(--space-4)' }}>
                <div>button.tsx</div>
                <div>card.tsx</div>
              </CollapsibleContent>
            </Collapsible>
            <Collapsible>
              <CollapsibleTrigger>hooks</CollapsibleTrigger>
              <CollapsibleContent keepMounted style={{ paddingLeft: 'var(--space-4)' }}>
                <div>use-toggle.ts</div>
              </CollapsibleContent>
            </Collapsible>
          </CollapsibleContent>
        </Collapsible>
      </Section>
    </>
  );
}
