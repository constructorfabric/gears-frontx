import { useState } from 'react';

import { Progress, ProgressLabel, ProgressValue, Slider } from '@gears-frontx/ui-kit';

import { Measure, Section } from '../shared';

export default function ProgressExample() {
  const [value, setValue] = useState(42);

  return (
    <div style={{ display: 'grid', gap: 'var(--space-6)', maxWidth: '20rem' }}>
      <Section title="Basic">
        <Progress value={64} aria-label="Uploading" />
      </Section>

      <Section title="Indeterminate">
        <Progress value={null} aria-label="Importing" />
      </Section>

      <Section title="With label and value">
        <Progress value={value}>
          <ProgressLabel>Uploading</ProgressLabel>
          <ProgressValue />
        </Progress>
      </Section>

      {/* The drawn track at the three points that define it: empty, part
          way and full. The track rect has to measure 6 tall at each. */}
      <Section title="Track geometry">
        <Measure
          of={{
            'track 0%': '#progress-zero [role=progressbar] > *',
            'track 42%': '#progress-mid [role=progressbar] > *',
            'indicator 42%': '#progress-mid [role=progressbar] > * > *',
            'track 100%': '#progress-full [role=progressbar] > *',
            'indicator 100%': '#progress-full [role=progressbar] > * > *',
            label: '#progress-mid-label',
            value: '#progress-mid-value',
          }}
        >
          <Progress id="progress-zero" value={0} aria-label="Empty" />
          <Progress id="progress-mid" value={42}>
            <ProgressLabel id="progress-mid-label">Uploading</ProgressLabel>
            <ProgressValue id="progress-mid-value" />
          </Progress>
          <Progress id="progress-full" value={100} aria-label="Complete" />
        </Measure>
      </Section>

      <Section title="Controlled">
        <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
          <Progress value={value} aria-label="Controlled progress" />
          <Slider value={[value]} onValueChange={(next: number[]) => setValue(next[0])} />
        </div>
      </Section>
    </div>
  );
}
