import { Toggle } from '@gears-frontx/ui-kit';

import { Measure, Row, Section } from '../shared';

export default function ToggleExample() {
  return (
    <>
      <Section title="Default">
        <Row>
          <Toggle aria-label="Bold">B</Toggle>
          <Toggle aria-label="Italic" defaultPressed>
            I
          </Toggle>
        </Row>
      </Section>

      <Section title="Outline">
        <Row>
          <Toggle aria-label="Bold" variant="outline">
            B
          </Toggle>
          <Toggle aria-label="Italic" variant="outline" defaultPressed>
            I
          </Toggle>
        </Row>
      </Section>

      {/* The drawn steel variant: a hairline over nothing, a --muted hover
          and the secondary pairing while pressed. */}
      <Section title="Steel">
        <Measure
          of={{
            'steel idle': '#toggle-steel-idle',
            'steel pressed': '#toggle-steel-pressed',
            'steel sm': '#toggle-steel-sm',
          }}
        >
          <Row>
            <Toggle id="toggle-steel-idle" aria-label="Bold, steel" variant="steel">
              B
            </Toggle>
            <Toggle
              id="toggle-steel-pressed"
              aria-label="Italic, steel"
              variant="steel"
              defaultPressed
            >
              I
            </Toggle>
            <Toggle id="toggle-steel-sm" aria-label="Underline, steel" variant="steel" size="sm">
              U
            </Toggle>
            <Toggle aria-label="Strike, steel" variant="steel" disabled>
              S
            </Toggle>
          </Row>
        </Measure>
      </Section>

      <Section title="With text">
        <Row>
          <Toggle aria-label="Toggle italic" defaultPressed>
            Italic
          </Toggle>
        </Row>
      </Section>

      <Section title="Sizes">
        <Row>
          <Toggle aria-label="Small" size="sm">
            S
          </Toggle>
          <Toggle aria-label="Default" size="default">
            D
          </Toggle>
          <Toggle aria-label="Large" size="lg">
            L
          </Toggle>
        </Row>
      </Section>

      <Section title="Disabled">
        <Row>
          <Toggle aria-label="Disabled" disabled>
            D
          </Toggle>
        </Row>
      </Section>
    </>
  );
}
