import { Badge, Spinner } from '@gears-frontx/ui-kit';

import { DemoIcon, Measure, Row, Section } from '../shared';

export default function BadgeExample() {
  return (
    <>
      <Section title="Variants">
        <Row>
          <Badge>default</Badge>
          <Badge variant="secondary">secondary</Badge>
          <Badge variant="destructive">destructive</Badge>
          <Badge variant="outline">outline</Badge>
          <Badge variant="ghost">ghost</Badge>
          <Badge variant="link">link</Badge>
          <Badge variant="category">category</Badge>
        </Row>
      </Section>

      {/* Mockup row order: Neutral (= secondary) first, then the five tones. */}
      <Section title="Tones">
        <Row>
          <Badge variant="secondary">neutral</Badge>
          <Badge variant="success">success</Badge>
          <Badge variant="warning">warning</Badge>
          <Badge variant="danger">danger</Badge>
          <Badge variant="info">info</Badge>
          <Badge variant="accent">accent</Badge>
        </Row>
      </Section>

      {/* Every size across every tone, plus the two cases that govern the
          xs box: a one-digit count (min-width holds it at 20) and a
          two-digit one (the label takes over). */}
      <Section title="Size">
        <Measure
          of={{
            xs: '#badge-xs',
            'xs, two digits': '#badge-xs-2',
            default: '#badge-default',
            unset: '#badge-unset',
            'default icon': '#badge-icon svg',
            category: '#badge-category',
            destructive: '#badge-destructive',
          }}
        >
          <Row>
            <Badge id="badge-xs" size="xs" variant="secondary">
              9
            </Badge>
            <Badge id="badge-xs-2" size="xs" variant="secondary">
              42
            </Badge>
            <Badge id="badge-default" size="default">
              default
            </Badge>
            <Badge id="badge-unset">unset</Badge>
            <Badge id="badge-icon" size="default" variant="secondary">
              <DemoIcon />
              icon
            </Badge>
            <Badge id="badge-category" variant="category">
              category
            </Badge>
            <Badge id="badge-destructive" variant="destructive">
              destructive
            </Badge>
          </Row>
          <Row>
            {(['xs', 'default'] as const).map((size) => (
              <Row key={size}>
                <Badge size={size} variant="secondary">
                  neutral
                </Badge>
                <Badge size={size} variant="success">
                  success
                </Badge>
                <Badge size={size} variant="warning">
                  warning
                </Badge>
                <Badge size={size} variant="danger">
                  danger
                </Badge>
                <Badge size={size} variant="info">
                  info
                </Badge>
                <Badge size={size} variant="accent">
                  accent
                </Badge>
                <Badge size={size} variant="outline">
                  outline
                </Badge>
                <Badge size={size} variant="category">
                  category
                </Badge>
                <Badge size={size} variant="destructive">
                  destructive
                </Badge>
              </Row>
            ))}
          </Row>
        </Measure>
      </Section>

      {/* The dot takes the label's own tone through currentColor, so one
          flag covers every variant without a rule per tone. */}
      <Section title="Status dot">
        <Measure of={{ dot: '#badge-dot span' }}>
          <Row>
            <Badge id="badge-dot" dot variant="success">
              Running
            </Badge>
            <Badge dot variant="warning">
              Degraded
            </Badge>
            <Badge dot variant="danger">
              Failed
            </Badge>
            <Badge dot variant="secondary">
              Neutral
            </Badge>
            <Badge dot size="xs" variant="info">
              Queued
            </Badge>
          </Row>
        </Measure>
      </Section>

      <Section title="With icon">
        <Row>
          <Badge>
            <DemoIcon />
            default
          </Badge>
          <Badge variant="secondary">
            <DemoIcon />
            secondary
          </Badge>
          <Badge variant="outline">
            <DemoIcon />
            outline
          </Badge>
        </Row>
      </Section>

      <Section title="With spinner">
        <Row>
          <Badge variant="secondary">
            <Spinner style={{ width: 'var(--icon-size-xs)', height: 'var(--icon-size-xs)' }} />
            Syncing
          </Badge>
        </Row>
      </Section>

      <Section title="Link">
        <Row>
          <Badge variant="outline" render={<a href="#plans" />}>
            as a link
          </Badge>
        </Row>
      </Section>
    </>
  );
}
