import { useState, type ReactNode } from 'react';

import { AlignCenter, AlignJustify, AlignLeft, AlignRight, LayoutGrid, List, Rows3, Rows4, Table2 } from 'lucide-react';

import { ToggleGroup, ToggleGroupItem } from '@gears-frontx/ui-kit';

import { Measure, Row, Section } from '../shared';

const alignIcons: Record<string, ReactNode> = {
  left: <AlignLeft />,
  center: <AlignCenter />,
  right: <AlignRight />,
  justify: <AlignJustify />,
};

export default function ToggleGroupExample() {
  const [align, setAlign] = useState<string[]>(['left']);
  const [view, setView] = useState('list');

  return (
    <>
      <Section title="Default">
        <Row>
          <ToggleGroup aria-label="Text alignment" value={align} onValueChange={setAlign}>
            <ToggleGroupItem value="left" aria-label="Align left">
              L
            </ToggleGroupItem>
            <ToggleGroupItem value="center" aria-label="Align center">
              C
            </ToggleGroupItem>
            <ToggleGroupItem value="right" aria-label="Align right">
              R
            </ToggleGroupItem>
          </ToggleGroup>
        </Row>
      </Section>

      <Section title="Outline">
        <Row>
          <ToggleGroup aria-label="Text formatting" multiple variant="outline" defaultValue={['bold']}>
            <ToggleGroupItem value="bold" aria-label="Bold">
              B
            </ToggleGroupItem>
            <ToggleGroupItem value="italic" aria-label="Italic">
              I
            </ToggleGroupItem>
          </ToggleGroup>
        </Row>
      </Section>

      <Section title="Sizes">
        <Row style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
          <ToggleGroup aria-label="View mode, small" size="sm" defaultValue={['list']}>
            <ToggleGroupItem value="list" aria-label="List view">
              List
            </ToggleGroupItem>
            <ToggleGroupItem value="grid" aria-label="Grid view">
              Grid
            </ToggleGroupItem>
          </ToggleGroup>
          <ToggleGroup aria-label="View mode, default" defaultValue={['list']}>
            <ToggleGroupItem value="list" aria-label="List view">
              List
            </ToggleGroupItem>
            <ToggleGroupItem value="grid" aria-label="Grid view">
              Grid
            </ToggleGroupItem>
          </ToggleGroup>
          <ToggleGroup aria-label="View mode, large" size="lg" defaultValue={['list']}>
            <ToggleGroupItem value="list" aria-label="List view">
              List
            </ToggleGroupItem>
            <ToggleGroupItem value="grid" aria-label="Grid view">
              Grid
            </ToggleGroupItem>
          </ToggleGroup>
        </Row>
      </Section>

      {/* The drawn segmented control: an icon group of two and of four,
          each with the selected item in a different position, so the
          container's own box is measured against a short strip and a long
          one alike. */}
      <Section title="Segmented (spacing={0})">
        <Measure
          of={{
            'group, 2 items': '#tg-seg-2',
            'item, 2 items': '#tg-seg-2 button',
            'icon, 2 items': '#tg-seg-2 svg',
            'group, 4 items': '#tg-seg-4',
            'first item, 4 items': '#tg-seg-4 button:first-child',
            'last item, 4 items': '#tg-seg-4 button:last-child',
            'label strip': '#tg-seg-labels',
            'sm group': '#tg-seg-sm',
            'sm first item': '#tg-seg-sm button:first-child',
          }}
        >
          <Row>
            <ToggleGroup
              id="tg-seg-2"
              aria-label="Density, segmented"
              spacing={0}
              variant="outline"
              defaultValue={['comfortable']}
            >
              <ToggleGroupItem value="compact" aria-label="Compact density">
                <Rows3 />
              </ToggleGroupItem>
              <ToggleGroupItem value="comfortable" aria-label="Comfortable density">
                <Rows4 />
              </ToggleGroupItem>
            </ToggleGroup>
            <ToggleGroup
              id="tg-seg-4"
              aria-label="Alignment, segmented"
              spacing={0}
              variant="outline"
              defaultValue={['center']}
            >
              {['left', 'center', 'right', 'justify'].map((value) => (
                <ToggleGroupItem key={value} value={value} aria-label={`Align ${value}`}>
                  {alignIcons[value]}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <ToggleGroup
              aria-label="Alignment, segmented, last selected"
              spacing={0}
              variant="outline"
              defaultValue={['justify']}
            >
              {['left', 'center', 'right', 'justify'].map((value) => (
                <ToggleGroupItem key={value} value={value} aria-label={`Align ${value}`}>
                  {alignIcons[value]}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </Row>
          <Row>
            <ToggleGroup
              id="tg-seg-labels"
              aria-label="View mode, segmented"
              spacing={0}
              variant="outline"
              defaultValue={['list']}
            >
              <ToggleGroupItem value="list" aria-label="List view">
                List
              </ToggleGroupItem>
              <ToggleGroupItem value="grid" aria-label="Grid view">
                Grid
              </ToggleGroupItem>
              <ToggleGroupItem value="table" aria-label="Table view">
                Table
              </ToggleGroupItem>
            </ToggleGroup>
            {/* The group's own size is what tightens the outer corner. */}
            <ToggleGroup
              id="tg-seg-sm"
              aria-label="View mode, segmented small"
              spacing={0}
              size="sm"
              variant="outline"
              defaultValue={['grid']}
            >
              <ToggleGroupItem value="list" aria-label="List view">
                List
              </ToggleGroupItem>
              <ToggleGroupItem value="grid" aria-label="Grid view">
                Grid
              </ToggleGroupItem>
              <ToggleGroupItem value="table" aria-label="Table view">
                Table
              </ToggleGroupItem>
            </ToggleGroup>
            {/* No variant set: the same collapse, on the default paint. */}
            <ToggleGroup aria-label="View mode, joined" spacing={0} defaultValue={['list']}>
              <ToggleGroupItem value="list" aria-label="List view">
                List
              </ToggleGroupItem>
              <ToggleGroupItem value="grid" aria-label="Grid view">
                Grid
              </ToggleGroupItem>
            </ToggleGroup>
          </Row>
        </Measure>
      </Section>

      {/* The drawn icon view switch: square 32 boxes, 18 glyphs, no gap,
          one hairline strip, one choice at a time. Measured because every
          number in it is drawn - the item box, the glyph, and the strip the
          three of them add up to. */}
      <Section title="Icon view switch">
        <Measure
          of={{
            group: '#tg-icon-switch',
            'first item': '#tg-icon-switch button:first-child',
            'middle item': '#tg-icon-switch button:nth-child(2)',
            glyph: '#tg-icon-switch svg',
          }}
        >
          <Row>
            <ToggleGroup
              id="tg-icon-switch"
              aria-label="View"
              size="sm"
              spacing={0}
              variant="outline"
              iconOnly
              value={[view]}
              onValueChange={([next]) => next && setView(next)}
            >
              <ToggleGroupItem value="list" aria-label="List">
                <List />
              </ToggleGroupItem>
              <ToggleGroupItem value="grid" aria-label="Grid">
                <LayoutGrid />
              </ToggleGroupItem>
              <ToggleGroupItem value="table" aria-label="Table">
                <Table2 />
              </ToggleGroupItem>
            </ToggleGroup>
          </Row>
        </Measure>
      </Section>

      <Section title="Vertical orientation">
        <Row>
          <ToggleGroup aria-label="View mode" orientation="vertical" defaultValue={['list']}>
            <ToggleGroupItem value="list" aria-label="List view">
              List
            </ToggleGroupItem>
            <ToggleGroupItem value="grid" aria-label="Grid view">
              Grid
            </ToggleGroupItem>
          </ToggleGroup>
        </Row>
      </Section>

      <Section title="Disabled">
        <Row>
          <ToggleGroup aria-label="Text alignment, disabled" disabled defaultValue={['left']}>
            <ToggleGroupItem value="left" aria-label="Align left">
              L
            </ToggleGroupItem>
            <ToggleGroupItem value="center" aria-label="Align center">
              C
            </ToggleGroupItem>
            <ToggleGroupItem value="right" aria-label="Align right">
              R
            </ToggleGroupItem>
          </ToggleGroup>
        </Row>
      </Section>
    </>
  );
}
