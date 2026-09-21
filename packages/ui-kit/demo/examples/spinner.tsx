import { Badge, InputGroup, InputGroupAddon, InputGroupInput, Spinner } from '@gears-frontx/ui-kit';

import { Measure, Row, Section } from '../shared';

export default function SpinnerExample() {
  return (
    <>
      <Section title="Basic">
        <Row>
          <Spinner />
        </Row>
      </Section>

      <Section title="Sizes">
        <Row>
          <Spinner style={{ width: 'var(--icon-size-xs)', height: 'var(--icon-size-xs)' }} />
          <Spinner style={{ width: 'var(--icon-size-sm)', height: 'var(--icon-size-sm)' }} />
          <Spinner style={{ width: 'var(--icon-size-md)', height: 'var(--icon-size-md)' }} />
          <Spinner style={{ width: 'var(--icon-size-lg)', height: 'var(--icon-size-lg)' }} />
        </Row>
      </Section>

      <Section title="With label">
        <Row>
          <p style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <Spinner aria-label="Saving changes" />
            Saving changes…
          </p>
        </Row>
      </Section>

      {/* The composed block at both steps. Measured because every number
          in it is drawn: the indicator box that keeps the block's height
          steady, the glyph inside it, and the micro label under both. The
          Spinner's own props go to the glyph, so the id for measuring the
          block sits on a wrapper - which is the documented way to place
          the whole thing too. */}
      <Section title="Loading block">
        <Measure
          of={{
            block: '#spinner-block > div',
            indicator: '#spinner-block > div > span:nth-of-type(1)',
            glyph: '#spinner-block svg',
            label: '#spinner-block > div > span:nth-of-type(2)',
            'compact block': '#spinner-compact > div',
            'compact indicator': '#spinner-compact > div > span:nth-of-type(1)',
            'compact glyph': '#spinner-compact svg',
          }}
        >
          <Row style={{ alignItems: 'flex-start', gap: 'var(--space-8)' }}>
            <div id="spinner-block">
              <Spinner label="Saving" description="This can take a minute" />
            </div>
            <div id="spinner-compact">
              <Spinner compact label="Loading" />
            </div>
          </Row>
        </Measure>
      </Section>

      <Section title="In a badge">
        <Row>
          <Badge variant="secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)' }}>
            <Spinner style={{ width: 'var(--icon-size-xs)', height: 'var(--icon-size-xs)' }} />
            Syncing
          </Badge>
        </Row>
      </Section>

      <Section title="In an input group">
        <Row>
          <InputGroup style={{ maxWidth: 240 }}>
            <InputGroupInput placeholder="Searching…" readOnly value="constructor" />
            <InputGroupAddon align="inline-end">
              <Spinner style={{ width: 'var(--icon-size-xs)', height: 'var(--icon-size-xs)' }} />
            </InputGroupAddon>
          </InputGroup>
        </Row>
      </Section>
    </>
  );
}
