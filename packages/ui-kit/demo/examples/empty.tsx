import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
  Button,
  Empty,
  EmptyActions,
  EmptyContent,
  EmptyDescription,
  EmptyDetail,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@gears-frontx/ui-kit';

import { DemoIcon, Measure, Row, Section } from '../shared';

export default function EmptyExample() {
  return (
    <>
      <Section title="No projects yet">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <DemoIcon />
            </EmptyMedia>
            <EmptyTitle>No projects yet</EmptyTitle>
            <EmptyDescription>Create a project or import an existing one.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Row>
              <Button>Create project</Button>
              <Button variant="outline">Import</Button>
            </Row>
          </EmptyContent>
        </Empty>
      </Section>

      {/* The two slots and the distances they are drawn at: 16 between
          the description and the detail (the header's own 8 gap plus the
          detail's 8), 24 above the action row (the root's gap, which the
          row deliberately adds nothing to). Measured against the elements
          above them, since a margin that stacks on a gap looks fine until
          it is counted. */}
      <Section title="Detail and actions">
        <Measure
          of={{
            description: '#empty-slots-description',
            detail: '#empty-slots-detail',
            actions: '#empty-slots-actions',
            plate: '#empty-slots-plate',
          }}
        >
          <Empty>
            <EmptyHeader>
              <EmptyMedia id="empty-slots-plate" variant="icon">
                <DemoIcon />
              </EmptyMedia>
              <EmptyTitle>No results</EmptyTitle>
              <EmptyDescription id="empty-slots-description">
                Try a different search term or clear your filters.
              </EmptyDescription>
              <EmptyDetail id="empty-slots-detail">3 filters applied</EmptyDetail>
            </EmptyHeader>
            <EmptyActions id="empty-slots-actions">
              <Button>New project</Button>
              <Button variant="outline">Clear filters</Button>
            </EmptyActions>
          </Empty>
        </Measure>
      </Section>

      <Section title="With border">
        <Empty style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)' }}>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <DemoIcon />
            </EmptyMedia>
            <EmptyTitle>No storage connected</EmptyTitle>
            <EmptyDescription>Connect a cloud storage provider to sync files.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button variant="outline">Connect storage</Button>
          </EmptyContent>
        </Empty>
      </Section>

      <Section title="Avatar">
        <Empty>
          <EmptyHeader>
            <EmptyMedia>
              <Avatar size="lg">
                <AvatarFallback>CN</AvatarFallback>
              </Avatar>
            </EmptyMedia>
            <EmptyTitle>You are offline</EmptyTitle>
            <EmptyDescription>Check your connection and try again.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </Section>

      <Section title="Avatar group">
        <Empty>
          <EmptyHeader>
            <EmptyMedia>
              <AvatarGroup>
                <Avatar>
                  <AvatarFallback>CN</AvatarFallback>
                </Avatar>
                <Avatar>
                  <AvatarFallback>LR</AvatarFallback>
                </Avatar>
                <Avatar>
                  <AvatarFallback>KL</AvatarFallback>
                </Avatar>
              </AvatarGroup>
            </EmptyMedia>
            <EmptyTitle>No team members yet</EmptyTitle>
            <EmptyDescription>Invite your team to start collaborating.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button>Invite members</Button>
          </EmptyContent>
        </Empty>
      </Section>

      <Section title="With input group">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <DemoIcon />
            </EmptyMedia>
            <EmptyTitle>404 - Page not found</EmptyTitle>
            <EmptyDescription>The page you are looking for does not exist.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <InputGroup style={{ maxWidth: '20rem' }}>
              <InputGroupInput placeholder="Search pages" aria-label="Search pages" />
              <InputGroupAddon align="inline-end">
                <InputGroupButton>Search</InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
          </EmptyContent>
        </Empty>
      </Section>
    </>
  );
}
