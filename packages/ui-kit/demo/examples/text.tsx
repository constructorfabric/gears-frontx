import { Text } from '@gears-frontx/ui-kit';

import { Section } from '../shared';

export default function TextExample() {
  return (
    <>
      <Section title="Typography">
        <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
          <Text>Body: invite people to the workspace by email.</Text>
          <Text typography="label">Label: Notification settings</Text>
          <Text typography="meta">Meta: updated 2 hours ago</Text>
          <Text typography="mono" render={<code />}>
            src/app/main.tsx
          </Text>
          <Text typography="micro">Micro: v0.4.2</Text>
        </div>
      </Section>

      <Section title="Tone">
        <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
          <Text>Default tone on --foreground.</Text>
          <Text tone="muted">Muted tone on --muted-foreground.</Text>
        </div>
      </Section>
    </>
  );
}
