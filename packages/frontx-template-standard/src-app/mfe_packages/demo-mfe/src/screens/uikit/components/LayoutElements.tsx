/**
 * Layout Elements Category
 *
 * Demonstrates: Grid, Separator, Divider, Card, Sidebar, Footer, Header, ScrollArea
 */

import React from 'react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '../../../components/ui/card';
import { Separator } from '../../../components/ui/separator';
import { ScrollArea } from '../../../components/ui/scroll-area';
import { Header } from '../../../components/ui/header';

interface LayoutElementsProps {
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

export const LayoutElements: React.FC<LayoutElementsProps> = ({ t }) => {
  return (
    <div id="category-layout" className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold mb-2">{t('category.layout')}</h2>
        <Separator className="mb-6" />
      </div>

      {/* Grid */}
      <ElementDemo
        id="element-grid"
        title={t('element.grid.title')}
        description={t('element.grid.description')}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="bg-primary/10 p-4 rounded text-center">Column 1</div>
          <div className="bg-primary/10 p-4 rounded text-center">Column 2</div>
          <div className="bg-primary/10 p-4 rounded text-center">Column 3</div>
          <div className="bg-primary/10 p-4 rounded text-center">Column 4</div>
          <div className="bg-primary/10 p-4 rounded text-center">Column 5</div>
          <div className="bg-primary/10 p-4 rounded text-center">Column 6</div>
        </div>
      </ElementDemo>

      {/* Separator */}
      <ElementDemo
        id="element-separator"
        title={t('element.separator.title')}
        description={t('element.separator.description')}
      >
        <div className="space-y-4">
          <div>Content above separator</div>
          <Separator />
          <div>Content below separator</div>
          <Separator orientation="horizontal" />
          <div className="flex gap-4">
            <div>Left content</div>
            <Separator orientation="vertical" className="h-12" />
            <div>Right content</div>
          </div>
        </div>
      </ElementDemo>

      {/* Divider (alias for Separator) */}
      <ElementDemo
        id="element-divider"
        title={t('element.divider.title')}
        description={t('element.divider.description')}
      >
        <div className="space-y-4">
          <div>Section 1</div>
          <Separator className="my-4" />
          <div>Section 2</div>
        </div>
      </ElementDemo>

      {/* Card */}
      <ElementDemo
        id="element-card"
        title={t('element.card.title')}
        description={t('element.card.description')}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Basic Card</CardTitle>
              <CardDescription>A simple card with header and content</CardDescription>
            </CardHeader>
            <CardContent>
              <p>This is the card content area. It can contain any content.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Card with Footer</CardTitle>
              <CardDescription>Includes header, content, and footer</CardDescription>
            </CardHeader>
            <CardContent>
              <p>Card content goes here.</p>
            </CardContent>
            <CardFooter className="text-sm text-muted-foreground">
              Footer information
            </CardFooter>
          </Card>
        </div>
      </ElementDemo>

      {/* Sidebar */}
      <ElementDemo
        id="element-sidebar"
        title={t('element.sidebar.title')}
        description={t('element.sidebar.description')}
      >
        <div className="text-sm text-muted-foreground">
          <p>The Sidebar component is a composite navigation component used in the host app.</p>
          <p className="mt-2">
            It includes SidebarContent, SidebarMenu, SidebarMenuItem, and SidebarMenuButton.
          </p>
          <p className="mt-2">See the main application sidebar for a live example.</p>
        </div>
      </ElementDemo>

      {/* Footer */}
      <ElementDemo
        id="element-footer"
        title={t('element.footer.title')}
        description={t('element.footer.description')}
      >
        <Card>
          <CardContent className="pt-6">
            <p>Main content area</p>
          </CardContent>
          <CardFooter className="bg-muted">
            <div className="w-full text-center text-sm text-muted-foreground">
              Footer content - typically used for actions or metadata
            </div>
          </CardFooter>
        </Card>
      </ElementDemo>

      {/* Header */}
      <ElementDemo
        id="element-header"
        title={t('element.header.title')}
        description={t('element.header.description')}
      >
        <Header>
          <div className="text-sm text-muted-foreground">Header content and actions</div>
        </Header>
        <p className="mt-4 text-sm text-muted-foreground">
          The Header component is a layout primitive used in the host application.
          It provides a consistent header bar with flexible content slots.
        </p>
      </ElementDemo>

      {/* ScrollArea */}
      <ElementDemo
        id="element-scroll_area"
        title={t('element.scroll_area.title')}
        description={t('element.scroll_area.description')}
      >
        <ScrollArea className="h-48 w-full border border-border rounded-lg p-4">
          <div className="space-y-2">
            {Array.from({ length: 20 }, (_, i) => (
              <div key={i} className="text-sm">
                Scrollable content item {i + 1}
              </div>
            ))}
          </div>
        </ScrollArea>
      </ElementDemo>
    </div>
  );
};

LayoutElements.displayName = 'LayoutElements';
