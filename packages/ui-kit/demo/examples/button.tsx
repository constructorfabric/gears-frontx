import { useState } from 'react';

import { Button } from '@gears-frontx/ui-kit';

import { Avatar, AvatarFallback } from '@gears-frontx/ui-kit';

import { DemoIcon, Measure, Row, Section } from '../shared';

function LoadingDemo() {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="outline"
      loading={busy}
      onClick={() => {
        setBusy(true);
        setTimeout(() => setBusy(false), 1500);
      }}
    >
      Click me
    </Button>
  );
}

export default function ButtonExample() {
  return (
    <>
      <Section title="Variants">
        <Row>
          <Button>Default</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructive</Button>
          <Button variant="link">Link</Button>
        </Row>
      </Section>
      {/* The three drawn variants, each across all three sizes, with the
          navigation button in both its states, the avatar button wrapping
          an avatar, and the destructive tint at rest and disabled. */}
      <Section title="Drawn variants">
        <Measure
          of={{
            'navigation sm': '#btn-nav-sm',
            'navigation default': '#btn-nav-default',
            'navigation lg': '#btn-nav-lg',
            'navigation current': '#btn-nav-current',
            'utility default': '#btn-util-default',
            'utility icon': '#btn-util-default svg',
            'avatar default': '#btn-avatar',
            'destructive default': '#btn-destructive',
          }}
        >
          <Row>
            <Button id="btn-nav-sm" variant="navigation" size="sm" icon={<DemoIcon />}>
              Navigation sm
            </Button>
            <Button id="btn-nav-default" variant="navigation" icon={<DemoIcon />}>
              Navigation
            </Button>
            <Button id="btn-nav-lg" variant="navigation" size="lg" icon={<DemoIcon />}>
              Navigation lg
            </Button>
            <Button id="btn-nav-current" variant="navigation" data-current icon={<DemoIcon />}>
              Current location
            </Button>
          </Row>
          <Row>
            <Button variant="utility" size="sm" icon={<DemoIcon />} aria-label="Utility small" />
            <Button id="btn-util-default" variant="utility" icon={<DemoIcon />}>
              Utility
            </Button>
            <Button variant="utility" size="lg" icon={<DemoIcon />}>
              Utility lg
            </Button>
          </Row>
          <Row>
            <Button id="btn-avatar" variant="avatar" aria-label="Open account menu">
              <Avatar>
                <AvatarFallback>SE</AvatarFallback>
              </Avatar>
            </Button>
            <Button variant="avatar" size="lg" aria-label="Open account menu, large">
              <Avatar size="lg">
                <AvatarFallback>SE</AvatarFallback>
              </Avatar>
            </Button>
          </Row>
          <Row>
            <Button id="btn-destructive" variant="destructive">
              Destructive
            </Button>
            <Button variant="destructive" size="sm">
              Destructive sm
            </Button>
            <Button variant="destructive" size="lg">
              Destructive lg
            </Button>
            <Button variant="destructive" disabled>
              Destructive disabled
            </Button>
          </Row>
        </Measure>
      </Section>
      <Section title="Sizes">
        <Row>
          <Button size="sm">Small</Button>
          <Button>Default</Button>
          <Button size="lg">Large</Button>
        </Row>
      </Section>
      <Section title="With icon">
        <Row>
          <Button icon={<DemoIcon />}>With icon</Button>
          <Button variant="secondary" icon={<DemoIcon />}>
            Secondary
          </Button>
          <Button variant="outline" icon={<DemoIcon />}>
            Outline
          </Button>
        </Row>
      </Section>
      <Section title="Icon only">
        <Row>
          <Button size="sm" icon={<DemoIcon />} aria-label="Icon only small" />
          <Button icon={<DemoIcon />} aria-label="Icon only default" />
          <Button size="lg" icon={<DemoIcon />} aria-label="Icon only large" />
          <Button variant="secondary" icon={<DemoIcon />} aria-label="Icon only secondary" />
        </Row>
      </Section>
      <Section title="Disabled">
        <Row>
          <Button disabled>Default</Button>
          <Button variant="outline" disabled>
            Outline
          </Button>
          <Button disabled icon={<DemoIcon />} aria-label="Disabled icon only" />
        </Row>
      </Section>
      <Section title="Loading">
        <Row>
          <Button loading>Loading</Button>
          <Button variant="secondary" loading>
            Loading
          </Button>
          <Button variant="outline" loading icon={<DemoIcon />} aria-label="Loading icon only" />
          <LoadingDemo />
        </Row>
      </Section>
      <Section title="As link">
        <Row>
          <Button
            render={<a href="#" onClick={(event) => event.preventDefault()} />}
            nativeButton={false}
            variant="outline"
          >
            Open reports
          </Button>
        </Row>
      </Section>
    </>
  );
}
