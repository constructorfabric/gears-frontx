/**
 * Action Elements Category
 *
 * Demonstrates: Button, Toggle, Dropdown, Chip
 */

import React from 'react';
import { Separator } from '../../../components/ui/separator';
import { Button } from '../../../components/ui/button';
import { ButtonVariant, ButtonSize } from '../../../components/types';
import { IconButton } from '../../../components/ui/icon-button';
import { DropdownButton } from '../../../components/ui/dropdown-button';
import { Toggle } from '../../../components/ui/toggle';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '../../../components/ui/dropdown-menu';
import { Badge } from '../../../components/ui/badge';

interface ActionElementsProps {
  t: (key: string) => string;
}

const ElementDemo: React.FC<{ id: string; title: string; description: string; children: React.ReactNode }> = ({
  id,
  title,
  description,
  children,
}) => (
  <div id={id} className="scroll-mt-4 mb-8">
    <h3 className="text-xl font-semibold mb-2">{title}</h3>
    <p className="text-sm text-muted-foreground mb-4">{description}</p>
    <div className="border border-border rounded-lg p-6 bg-background">{children}</div>
  </div>
);

export const ActionElements: React.FC<ActionElementsProps> = ({ t }) => {
  return (
    <div id="category-actions" className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold mb-2">{t('category.actions')}</h2>
        <Separator className="mb-6" />
      </div>

      {/* Button */}
      <ElementDemo
        id="element-button"
        title={t('element.button.title')}
        description={t('element.button.description')}
      >
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button variant={ButtonVariant.Default}>Default</Button>
            <Button variant={ButtonVariant.Secondary}>Secondary</Button>
            <Button variant={ButtonVariant.Destructive}>Destructive</Button>
            <Button variant={ButtonVariant.Outline}>Outline</Button>
            <Button variant={ButtonVariant.Ghost}>Ghost</Button>
            <Button variant={ButtonVariant.Link}>Link</Button>
          </div>

          <Separator />

          <div className="flex flex-wrap gap-2 items-center">
            <Button size={ButtonSize.Sm}>Small</Button>
            <Button size={ButtonSize.Default}>Default</Button>
            <Button size={ButtonSize.Lg}>Large</Button>
            <IconButton aria-label="Settings">⚙️</IconButton>
          </div>

          <Separator />

          <div className="flex flex-wrap gap-2">
            <Button disabled>Disabled</Button>
            <Button variant={ButtonVariant.Destructive} disabled>
              Disabled Destructive
            </Button>
          </div>
        </div>
      </ElementDemo>

      {/* Toggle */}
      <ElementDemo
        id="element-toggle"
        title={t('element.toggle.title')}
        description={t('element.toggle.description')}
      >
        <div className="flex flex-wrap gap-2">
          <Toggle aria-label="Toggle italic">
            <span className="font-bold">B</span>
          </Toggle>
          <Toggle aria-label="Toggle italic">
            <span className="italic">I</span>
          </Toggle>
          <Toggle aria-label="Toggle underline">
            <span className="underline">U</span>
          </Toggle>
          <Toggle defaultPressed aria-label="Toggle strikethrough">
            <span className="line-through">S</span>
          </Toggle>
        </div>
      </ElementDemo>

      {/* Dropdown */}
      <ElementDemo
        id="element-dropdown"
        title={t('element.dropdown.title')}
        description={t('element.dropdown.description')}
      >
        <div className="flex flex-wrap gap-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button>Open Menu</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem>Profile</DropdownMenuItem>
              <DropdownMenuItem>Settings</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem>Logout</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <DropdownButton>Dropdown Button</DropdownButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => alert('Action 1')}>Action 1</DropdownMenuItem>
              <DropdownMenuItem onClick={() => alert('Action 2')}>Action 2</DropdownMenuItem>
              <DropdownMenuItem onClick={() => alert('Action 3')}>Action 3</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </ElementDemo>

      {/* Chip */}
      <ElementDemo
        id="element-chip"
        title={t('element.chip.title')}
        description={t('element.chip.description')}
      >
        <div>
          <p className="text-sm text-muted-foreground mb-4">
            UIKit does not export a dedicated Chip component. Badge component provides similar functionality:
          </p>
          <div className="flex flex-wrap gap-2">
            <Badge>Default Badge</Badge>
            <Badge variant="secondary">Secondary</Badge>
            <Badge variant="destructive">Destructive</Badge>
            <Badge variant="outline">Outline</Badge>
          </div>
        </div>
      </ElementDemo>
    </div>
  );
};

ActionElements.displayName = 'ActionElements';
