import { type CSSProperties, useState } from 'react';

import {
  Badge,
  Button,
  PageHeader,
  PageHeaderActions,
  PageHeaderContent,
  PageHeaderDescription,
  PageHeaderEyebrow,
  PageHeaderLeading,
  PageHeaderMeta,
  PageHeaderTitle,
  StatusDot,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  ToggleGroup,
  ToggleGroupItem,
} from '@gears-frontx/ui-kit';
import {
  ArrowLeftIcon,
  ArrowLeftRightIcon,
  ChevronDownIcon,
  EllipsisIcon,
  ExternalLinkIcon,
  LayoutGridIcon,
  ListIcon,
  PlusIcon,
  SlidersHorizontalIcon,
} from 'lucide-react';

import { Measure, Section } from '../shared';

/*
 * Each section is a header the way an application fills it: an account, an
 * object under its parent, an object with a back link, an object with its
 * status and actions, a list with a view switch, a section with its own tabs
 * and actions. The headers sit in a bordered frame so the rule and the side
 * inset read against an edge, the way they do in a page. The object headers
 * carry role="group": in an application they sit above the page's main,
 * where a bare header would be a second banner.
 */
const panel = { padding: 'var(--space-4) var(--space-6)' } as const;

const frame = {
  border: 'var(--border-width) solid var(--border)',
  borderRadius: 'var(--radius-lg)',
  overflow: 'hidden',
} as const;

export default function PageHeaderExample() {
  const [view, setView] = useState<string[]>(['list']);

  return (
    <>
      <Section title="Organization - lg, display title, content beside it">
        <div style={frame}>
          <PageHeader size="lg" role="group">
            <PageHeaderContent>
              <PageHeaderTitle typography="display">Acme Corporation</PageHeaderTitle>
              <PageHeaderMeta>
                <Button variant="ghost" size="sm" icon={<ArrowLeftRightIcon />}>
                  Switch organization
                </Button>
              </PageHeaderMeta>
            </PageHeaderContent>
          </PageHeader>
        </div>
      </Section>

      <Section title="Workspace - eyebrow linking to the parent">
        <div style={frame}>
          <PageHeader size="lg" role="group">
            <PageHeaderContent>
              <PageHeaderEyebrow>
                <a href="#page-header">Acme Corporation</a>
              </PageHeaderEyebrow>
              <PageHeaderTitle typography="display">Platform Workspace</PageHeaderTitle>
            </PageHeaderContent>
          </PageHeader>
        </div>
      </Section>

      <Section title="Project - sm, back link, badge">
        <div style={frame}>
          <PageHeader size="sm" role="group">
            <PageHeaderLeading>
              <Button
                variant="ghost"
                icon={<ArrowLeftIcon />}
                aria-label="Back to projects"
                render={<a href="#page-header" />}
                nativeButton={false}
              />
            </PageHeaderLeading>
            <PageHeaderContent>
              <PageHeaderTitle>Security Scanner</PageHeaderTitle>
              <PageHeaderMeta>
                <Badge variant="outline">Platform</Badge>
              </PageHeaderMeta>
            </PageHeaderContent>
          </PageHeader>
        </div>
      </Section>

      <Section title="Component - status and summary beside the title, two actions">
        <div style={frame}>
          <PageHeader size="sm">
            <PageHeaderContent>
              <PageHeaderTitle>Account Management</PageHeaderTitle>
              <PageHeaderMeta>
                <StatusDot tone="success" label="Released" />
                <span style={{ color: 'var(--muted-foreground)' }}>
                  Reference multi-tenant account management
                </span>
              </PageHeaderMeta>
            </PageHeaderContent>
            <PageHeaderActions>
              <Button size="sm" icon={<PlusIcon />}>
                Add to project
              </Button>
              <Button size="sm" variant="outline" end={<ExternalLinkIcon />}>
                Open repository
              </Button>
            </PageHeaderActions>
          </PageHeader>
        </div>
      </Section>

      <Section title="Collection - a view switch before the title, h2">
        <div style={frame}>
          <PageHeader>
            <PageHeaderLeading>
              <ToggleGroup aria-label="Projects view" variant="outline" value={view} onValueChange={setView}>
                <ToggleGroupItem value="list" aria-label="Table view">
                  <ListIcon />
                </ToggleGroupItem>
                <ToggleGroupItem value="grid" aria-label="Gallery view">
                  <LayoutGridIcon />
                </ToggleGroupItem>
              </ToggleGroup>
            </PageHeaderLeading>
            <PageHeaderContent>
              <PageHeaderTitle render={<h2 />}>Projects</PageHeaderTitle>
            </PageHeaderContent>
            <PageHeaderActions>
              <Button>New project</Button>
            </PageHeaderActions>
          </PageHeader>
        </div>
      </Section>

      <Section title="Project tab - section tabs beside the title, three actions">
        <div style={frame}>
          <Tabs defaultValue="summary">
            <PageHeader>
              <PageHeaderContent>
                <PageHeaderTitle render={<h2 />}>Overview</PageHeaderTitle>
                <PageHeaderMeta>
                  <TabsList variant="line" aria-label="Project overview sections">
                    <TabsTrigger value="summary">Summary</TabsTrigger>
                    <TabsTrigger value="delivery">Delivery</TabsTrigger>
                    <TabsTrigger value="quality">Quality</TabsTrigger>
                  </TabsList>
                </PageHeaderMeta>
              </PageHeaderContent>
              <PageHeaderActions>
                <Button size="sm" variant="secondary" end={<ChevronDownIcon />}>
                  Default view
                </Button>
                <Button size="sm" variant="outline" icon={<SlidersHorizontalIcon />}>
                  Edit dashboard
                </Button>
                <Button size="sm" variant="ghost" icon={<EllipsisIcon />} aria-label="More actions" />
              </PageHeaderActions>
            </PageHeader>
            <TabsContent value="summary" style={panel}>
              Summary panel
            </TabsContent>
            <TabsContent value="delivery" style={panel}>
              Delivery panel
            </TabsContent>
            <TabsContent value="quality" style={panel}>
              Quality panel
            </TabsContent>
          </Tabs>
        </div>
      </Section>

      <Section title="Route - description under the title">
        <div style={frame}>
          <PageHeader>
            <PageHeaderContent>
              <PageHeaderTitle render={<h2 />}>Connections</PageHeaderTitle>
              <PageHeaderDescription>Manage organization sources.</PageHeaderDescription>
            </PageHeaderContent>
            <PageHeaderActions>
              <Button>Connect source</Button>
            </PageHeaderActions>
          </PageHeader>
        </div>
      </Section>

      {/* A section header with no rule and no inset of its own,
          for a header inside a region that already pads its content. The
          rule is transparent, not gone, so this header is as tall as the
          one above it. */}
      <Section title="Section - border={false}, --page-header-inset: 0">
        <div style={{ ...frame, padding: '0 var(--space-6)' }}>
          <PageHeader border={false} style={{ '--page-header-inset': '0' } as CSSProperties}>
            <PageHeaderContent>
              <PageHeaderTitle render={<h2 />}>Workspaces</PageHeaderTitle>
              <PageHeaderDescription>1 workspace · 16 projects</PageHeaderDescription>
            </PageHeaderContent>
            <PageHeaderActions>
              <Button>New workspace</Button>
            </PageHeaderActions>
          </PageHeader>
        </div>
      </Section>

      {/* The drawn heights, measured: the rule is inside them, so each root
          reads 56, 64 or 80 whether or not the rule is drawn. */}
      <Section title="Anatomy">
        <Measure
          of={{
            sm: '#page-header-sm',
            default: '#page-header-default',
            'default, border={false}': '#page-header-borderless',
            lg: '#page-header-lg',
            'title (heading)': '#page-header-default h2',
            'title (display)': '#page-header-lg h1',
          }}
        >
          <div style={frame}>
            <PageHeader id="page-header-sm" size="sm">
              <PageHeaderContent>
                <PageHeaderTitle render={<h2 />}>Small</PageHeaderTitle>
              </PageHeaderContent>
            </PageHeader>
            <PageHeader id="page-header-default">
              <PageHeaderContent>
                <PageHeaderTitle render={<h2 />}>Default</PageHeaderTitle>
              </PageHeaderContent>
            </PageHeader>
            <PageHeader id="page-header-borderless" border={false}>
              <PageHeaderContent>
                <PageHeaderTitle render={<h2 />}>Default, no rule</PageHeaderTitle>
              </PageHeaderContent>
            </PageHeader>
            <PageHeader id="page-header-lg" size="lg">
              <PageHeaderContent>
                <PageHeaderTitle typography="display">Large</PageHeaderTitle>
              </PageHeaderContent>
            </PageHeader>
          </div>
        </Measure>
      </Section>

      {/* The narrow layout queries the header's own width: in a 600 wide
          frame the tabs move under the title and the actions take a line
          of their own, though the window is wide. */}
      <Section title="Narrow container">
        <div style={{ ...frame, maxWidth: '37.5rem' }}>
          <Tabs defaultValue="files">
            <PageHeader>
              <PageHeaderContent>
                <PageHeaderTitle render={<h2 />}>Artifacts</PageHeaderTitle>
                <PageHeaderMeta>
                  <TabsList variant="line" aria-label="Artifact views">
                    <TabsTrigger value="files">Files</TabsTrigger>
                    <TabsTrigger value="graph">Graph view</TabsTrigger>
                  </TabsList>
                </PageHeaderMeta>
              </PageHeaderContent>
              <PageHeaderActions>
                <Button size="sm" variant="ghost" icon={<EllipsisIcon />} aria-label="Artifact view actions" />
                <Button size="sm" variant="outline">
                  Upload documents
                </Button>
              </PageHeaderActions>
            </PageHeader>
            <TabsContent value="files" style={panel}>
              Files panel
            </TabsContent>
            <TabsContent value="graph" style={panel}>
              Graph panel
            </TabsContent>
          </Tabs>
        </div>
      </Section>
    </>
  );
}
