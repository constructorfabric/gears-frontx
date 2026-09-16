import {
  Avatar,
  AvatarBadge,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarImage,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@gears-frontx/ui-kit';

import { DemoIcon, Measure, Row, Section } from '../shared';

export default function AvatarExample() {
  return (
    <>
      <Section title="Basic">
        <Row>
          <Avatar>
            <AvatarImage src="/does-not-exist.jpg" alt="Jane Doe" />
            <AvatarFallback>JD</AvatarFallback>
          </Avatar>
        </Row>
      </Section>

      {/* The drawn geometry at every size: the root has to measure 24 /
          32 / 40 exactly, hairline included, and the badge, the group
          overlap and the count circle step with it. */}
      <Section title="Sizes">
        <Measure
          of={{
            'root sm': '#av-sm',
            'root default': '#av-default',
            'root lg': '#av-lg',
            'badge sm': '#av-sm span:last-child',
            'badge default': '#av-default span:last-child',
            'badge lg': '#av-lg span:last-child',
            'group first': '#av-group > *:first-child',
            'group second': '#av-group > *:nth-child(2)',
            'count default': '#av-count-default',
            'count sm': '#av-count-sm',
            'count lg': '#av-count-lg',
            'count icon lg': '#av-count-lg svg',
          }}
        >
          <Row>
            <Avatar id="av-sm" size="sm">
              <AvatarFallback>JD</AvatarFallback>
              <AvatarBadge />
            </Avatar>
            <Avatar id="av-default">
              <AvatarFallback>JD</AvatarFallback>
              <AvatarBadge />
            </Avatar>
            <Avatar id="av-lg" size="lg">
              <AvatarFallback>JD</AvatarFallback>
              <AvatarBadge />
            </Avatar>
          </Row>
          <Row>
            <AvatarGroup id="av-group">
              <Avatar>
                <AvatarFallback>JD</AvatarFallback>
              </Avatar>
              <Avatar>
                <AvatarFallback>AB</AvatarFallback>
              </Avatar>
              <AvatarGroupCount id="av-count-default">+3</AvatarGroupCount>
            </AvatarGroup>
            <AvatarGroup>
              <Avatar size="sm">
                <AvatarFallback>JD</AvatarFallback>
              </Avatar>
              <AvatarGroupCount id="av-count-sm">+2</AvatarGroupCount>
            </AvatarGroup>
            <AvatarGroup>
              <Avatar size="lg">
                <AvatarFallback>JD</AvatarFallback>
              </Avatar>
              <AvatarGroupCount id="av-count-lg">
                <DemoIcon />
              </AvatarGroupCount>
            </AvatarGroup>
          </Row>
        </Measure>
      </Section>

      <Section title="Fill · solid">
        <Row>
          <Avatar data-testid="fill-solid-neutral">
            <AvatarFallback tone="neutral" variant="solid">
              AJ
            </AvatarFallback>
          </Avatar>
          <Avatar data-testid="fill-solid-accent">
            <AvatarFallback tone="accent" variant="solid">
              ML
            </AvatarFallback>
          </Avatar>
          <Avatar data-testid="fill-solid-info">
            <AvatarFallback tone="info" variant="solid">
              PN
            </AvatarFallback>
          </Avatar>
          <Avatar data-testid="fill-solid-success">
            <AvatarFallback tone="success" variant="solid">
              JB
            </AvatarFallback>
          </Avatar>
          <Avatar data-testid="fill-solid-warning">
            <AvatarFallback tone="warning" variant="solid">
              EW
            </AvatarFallback>
          </Avatar>
          <Avatar data-testid="fill-solid-danger">
            <AvatarFallback tone="danger" variant="solid">
              NK
            </AvatarFallback>
          </Avatar>
        </Row>
      </Section>

      <Section title="Fill · soft">
        <Row>
          <Avatar data-testid="fill-soft-neutral">
            <AvatarFallback tone="neutral" variant="soft">
              AJ
            </AvatarFallback>
          </Avatar>
          <Avatar data-testid="fill-soft-accent">
            <AvatarFallback tone="accent" variant="soft">
              ML
            </AvatarFallback>
          </Avatar>
          <Avatar data-testid="fill-soft-info">
            <AvatarFallback tone="info" variant="soft">
              PN
            </AvatarFallback>
          </Avatar>
          <Avatar data-testid="fill-soft-success">
            <AvatarFallback tone="success" variant="soft">
              JB
            </AvatarFallback>
          </Avatar>
          <Avatar data-testid="fill-soft-warning">
            <AvatarFallback tone="warning" variant="soft">
              EW
            </AvatarFallback>
          </Avatar>
          <Avatar data-testid="fill-soft-danger">
            <AvatarFallback tone="danger" variant="soft">
              NK
            </AvatarFallback>
          </Avatar>
        </Row>
      </Section>

      <Section title="Badge">
        <Row>
          <Avatar size="lg">
            <AvatarFallback>JD</AvatarFallback>
            <AvatarBadge />
          </Avatar>
        </Row>
      </Section>

      <Section title="Badge with icon">
        <Row>
          <Avatar size="lg">
            <AvatarFallback>JD</AvatarFallback>
            <AvatarBadge>
              <DemoIcon />
            </AvatarBadge>
          </Avatar>
        </Row>
      </Section>

      <Section title="Group">
        <AvatarGroup data-testid="group-neutral">
          <Avatar>
            <AvatarFallback>AB</AvatarFallback>
          </Avatar>
          <Avatar>
            <AvatarFallback>CD</AvatarFallback>
          </Avatar>
          <Avatar>
            <AvatarFallback>EF</AvatarFallback>
          </Avatar>
        </AvatarGroup>
      </Section>

      <Section title="Group · toned solid">
        <AvatarGroup data-testid="group-solid">
          <Avatar>
            <AvatarFallback tone="accent" variant="solid">
              ML
            </AvatarFallback>
          </Avatar>
          <Avatar>
            <AvatarFallback tone="success" variant="solid">
              JB
            </AvatarFallback>
          </Avatar>
          <Avatar>
            <AvatarFallback tone="danger" variant="solid">
              NK
            </AvatarFallback>
          </Avatar>
          <Avatar>
            <AvatarFallback tone="info" variant="solid">
              PN
            </AvatarFallback>
          </Avatar>
        </AvatarGroup>
      </Section>

      <Section title="Group · toned soft">
        <AvatarGroup data-testid="group-soft">
          <Avatar>
            <AvatarFallback tone="accent" variant="soft">
              ML
            </AvatarFallback>
          </Avatar>
          <Avatar>
            <AvatarFallback tone="success" variant="soft">
              JB
            </AvatarFallback>
          </Avatar>
          <Avatar>
            <AvatarFallback tone="danger" variant="soft">
              NK
            </AvatarFallback>
          </Avatar>
          <Avatar>
            <AvatarFallback tone="warning" variant="soft">
              EW
            </AvatarFallback>
          </Avatar>
        </AvatarGroup>
      </Section>

      <Section title="Group count">
        <AvatarGroup data-testid="group-count-neutral">
          <Avatar>
            <AvatarFallback>AB</AvatarFallback>
          </Avatar>
          <Avatar>
            <AvatarFallback>CD</AvatarFallback>
          </Avatar>
          <Avatar>
            <AvatarFallback>EF</AvatarFallback>
          </Avatar>
          <AvatarGroupCount>+3</AvatarGroupCount>
        </AvatarGroup>
      </Section>

      <Section title="Group count · toned">
        <AvatarGroup data-testid="group-count-toned">
          <Avatar>
            <AvatarFallback tone="accent" variant="solid">
              ML
            </AvatarFallback>
          </Avatar>
          <Avatar>
            <AvatarFallback tone="success" variant="solid">
              JB
            </AvatarFallback>
          </Avatar>
          <Avatar>
            <AvatarFallback tone="warning" variant="solid">
              EW
            </AvatarFallback>
          </Avatar>
          <AvatarGroupCount data-testid="count-toned" tone="accent" variant="soft">
            +3
          </AvatarGroupCount>
        </AvatarGroup>
      </Section>

      <Section title="Group with icon">
        <AvatarGroup data-testid="group-icon">
          <Avatar>
            <AvatarFallback tone="info" variant="solid">
              PN
            </AvatarFallback>
          </Avatar>
          <Avatar>
            <AvatarFallback tone="danger" variant="solid">
              NK
            </AvatarFallback>
          </Avatar>
          <AvatarGroupCount tone="info" variant="soft">
            <DemoIcon />
          </AvatarGroupCount>
        </AvatarGroup>
      </Section>

      <Section title="Group · toned small">
        <AvatarGroup data-testid="group-sm">
          <Avatar size="sm">
            <AvatarFallback tone="accent" variant="solid">
              ML
            </AvatarFallback>
          </Avatar>
          <Avatar size="sm">
            <AvatarFallback tone="success" variant="solid">
              JB
            </AvatarFallback>
          </Avatar>
          <Avatar size="sm">
            <AvatarFallback tone="danger" variant="solid">
              NK
            </AvatarFallback>
          </Avatar>
          <AvatarGroupCount tone="neutral" variant="soft">
            +5
          </AvatarGroupCount>
        </AvatarGroup>
      </Section>

      <Section title="Dropdown">
        <Row>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Avatar style={{ cursor: 'pointer' }}>
                  <AvatarFallback>JD</AvatarFallback>
                </Avatar>
              }
            />
            <DropdownMenuContent>
              <DropdownMenuItem>Profile</DropdownMenuItem>
              <DropdownMenuItem>Settings</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem>Sign out</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </Row>
      </Section>
    </>
  );
}
