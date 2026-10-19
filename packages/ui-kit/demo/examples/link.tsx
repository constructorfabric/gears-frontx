import { Heading, Link, Text } from '@gears-frontx/ui-kit';
import { ArrowRight } from 'lucide-react';

import { Section } from '../shared';

const stay = (event: { preventDefault: () => void }) => event.preventDefault();

export default function LinkExample() {
  return (
    <>
      <Section title="Variant">
        <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
          <Text>
            Read the{' '}
            <Link href="#setup" onClick={stay}>
              setup guide
            </Link>{' '}
            before the first deploy.
          </Text>
          <Text tone="muted">
            Last edited by Ana,{' '}
            <Link href="#history" variant="muted" onClick={stay}>
              see history
            </Link>
            .
          </Text>
          <Text>
            Inside coloured text,{' '}
            <Link href="#inherit" variant="inherit" onClick={stay}>
              the inherit variant
            </Link>{' '}
            keeps the colour and stays underlined.
          </Text>
        </div>
      </Section>

      <Section title="External">
        <Text>
          The kit builds on{' '}
          <Link href="https://base-ui.com" external>
            Base UI
          </Link>
          .
        </Text>
      </Section>

      <Section title="Icon follows the text">
        <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
          <Text>
            <Link href="#next" onClick={stay}>
              Next step
              <ArrowRight aria-hidden="true" />
            </Link>
          </Text>
          <Heading typography="heading-1" render={<h3 />}>
            <Link href="#guides" variant="inherit" onClick={stay}>
              All guides
              <ArrowRight aria-hidden="true" />
            </Link>
          </Heading>
        </div>
      </Section>
    </>
  );
}
