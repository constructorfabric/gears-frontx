import { Heading, Text } from '@gears-frontx/ui-kit';

import { Section } from '../shared';

export default function HeadingExample() {
  return (
    <>
      <Section title="Typography">
        <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
          <Heading typography="display" render={<h3 />}>
            Display: the page title role
          </Heading>
          <Heading typography="heading-1" render={<h3 />}>
            Heading 1: a section title
          </Heading>
          <Heading typography="heading-2" render={<h3 />}>
            Heading 2: a subsection title
          </Heading>
        </div>
      </Section>

      <Section title="Level apart from look">
        <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
          <Heading typography="heading-2" render={<h3 />}>
            An h3 on the heading-2 role
          </Heading>
          <Text tone="muted">
            The element sets the outline level; <code>typography</code> sets the look.
          </Text>
        </div>
      </Section>
    </>
  );
}
