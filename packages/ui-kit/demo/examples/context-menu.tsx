import { useState } from 'react';

import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
  DirectionProvider,
} from '@gears-frontx/ui-kit';

import { DemoIcon, Row, Section } from '../shared';

const triggerStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '6rem',
  width: '12rem',
  border: '1px dashed var(--border)',
  borderRadius: 'var(--radius-md)',
};

export default function ContextMenuExample() {
  const [showBookmarks, setShowBookmarks] = useState(true);
  const [view, setView] = useState('list');

  return (
    <>
      <Section title="Basic">
        <ContextMenu>
          <ContextMenuTrigger style={triggerStyle}>Right-click here</ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem>Back</ContextMenuItem>
            <ContextMenuItem disabled>Forward</ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem>Reload</ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      </Section>

      <Section title="Groups & labels">
        <ContextMenu>
          <ContextMenuTrigger style={triggerStyle}>Right-click here</ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuGroup>
              <ContextMenuLabel>Account</ContextMenuLabel>
              <ContextMenuItem>Profile</ContextMenuItem>
              <ContextMenuItem>Billing</ContextMenuItem>
            </ContextMenuGroup>
            <ContextMenuSeparator />
            <ContextMenuGroup>
              <ContextMenuLabel>Team</ContextMenuLabel>
              <ContextMenuItem>Invite members</ContextMenuItem>
            </ContextMenuGroup>
          </ContextMenuContent>
        </ContextMenu>
      </Section>

      <Section title="Shortcuts">
        <ContextMenu>
          <ContextMenuTrigger style={triggerStyle}>Right-click here</ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem>
              Back
              <ContextMenuShortcut>⌘[</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuItem>
              Forward
              <ContextMenuShortcut>⌘]</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuItem>
              Reload
              <ContextMenuShortcut>⌘R</ContextMenuShortcut>
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      </Section>

      <Section title="Icons">
        <ContextMenu>
          <ContextMenuTrigger style={triggerStyle}>Right-click here</ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem>
              <DemoIcon /> Add
            </ContextMenuItem>
            <ContextMenuItem>
              <DemoIcon /> Duplicate
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      </Section>

      <Section title="Checkboxes">
        <ContextMenu>
          <ContextMenuTrigger style={triggerStyle}>Right-click here</ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuCheckboxItem checked={showBookmarks} onCheckedChange={setShowBookmarks}>
              Show bookmarks
            </ContextMenuCheckboxItem>
            <ContextMenuCheckboxItem checked disabled>
              Show full URLs
            </ContextMenuCheckboxItem>
          </ContextMenuContent>
        </ContextMenu>
      </Section>

      <Section title="Radio">
        <ContextMenu>
          <ContextMenuTrigger style={triggerStyle}>Right-click here</ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuRadioGroup value={view} onValueChange={setView}>
              <ContextMenuRadioItem value="list">List view</ContextMenuRadioItem>
              <ContextMenuRadioItem value="grid">Grid view</ContextMenuRadioItem>
            </ContextMenuRadioGroup>
          </ContextMenuContent>
        </ContextMenu>
      </Section>

      <Section title="Submenu">
        <ContextMenu>
          <ContextMenuTrigger style={triggerStyle}>Right-click here</ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem>Back</ContextMenuItem>
            <ContextMenuSub>
              <ContextMenuSubTrigger>More tools</ContextMenuSubTrigger>
              <ContextMenuSubContent>
                <ContextMenuItem>Extensions</ContextMenuItem>
                <ContextMenuItem>Developer tools</ContextMenuItem>
              </ContextMenuSubContent>
            </ContextMenuSub>
          </ContextMenuContent>
        </ContextMenu>
      </Section>

      <Section title="Destructive">
        <ContextMenu>
          <ContextMenuTrigger style={triggerStyle}>Right-click here</ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem>Rename</ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem variant="destructive">Delete</ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      </Section>

      <Section title="Sides">
        <Row>
          {(['top', 'right', 'bottom', 'left'] as const).map((side) => (
            <ContextMenu key={side}>
              <ContextMenuTrigger style={triggerStyle}>{side}</ContextMenuTrigger>
              <ContextMenuContent side={side}>
                <ContextMenuItem>Item one</ContextMenuItem>
                <ContextMenuItem>Item two</ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          ))}
        </Row>
      </Section>

      <Section title="RTL">
        <DirectionProvider direction="rtl">
          <ContextMenu>
            <ContextMenuTrigger style={triggerStyle}>Right-click here</ContextMenuTrigger>
            <ContextMenuContent side="inline-end">
              <ContextMenuItem>Back</ContextMenuItem>
              <ContextMenuItem>Forward</ContextMenuItem>
              <ContextMenuSub>
                <ContextMenuSubTrigger>More tools</ContextMenuSubTrigger>
                <ContextMenuSubContent>
                  <ContextMenuItem>Extensions</ContextMenuItem>
                </ContextMenuSubContent>
              </ContextMenuSub>
            </ContextMenuContent>
          </ContextMenu>
        </DirectionProvider>
      </Section>
    </>
  );
}
