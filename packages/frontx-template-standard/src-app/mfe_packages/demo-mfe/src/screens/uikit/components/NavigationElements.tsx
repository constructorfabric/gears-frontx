/**
 * Navigation Elements Category
 *
 * Demonstrates: Breadcrumb, Nav, Tab, Pagination, Link, Menu
 */

import React, { useState } from 'react';
import { Separator } from '../../../components/ui/separator';
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbSeparator,
  BreadcrumbPage,
} from '../../../components/ui/breadcrumb';
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '../../../components/ui/tabs';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationPrevious,
  PaginationNext,
  PaginationEllipsis,
} from '../../../components/ui/pagination';
import {
  Menubar,
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarItem,
  MenubarSeparator,
} from '../../../components/ui/menubar';

interface NavigationElementsProps {
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

export const NavigationElements: React.FC<NavigationElementsProps> = ({ t }) => {
  const [currentPage, setCurrentPage] = useState(1);

  return (
    <div id="category-navigation" className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold mb-2">{t('category.navigation')}</h2>
        <Separator className="mb-6" />
      </div>

      {/* Breadcrumb */}
      <ElementDemo
        id="element-breadcrumb"
        title={t('element.breadcrumb.title')}
        description={t('element.breadcrumb.description')}
      >
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/">Home</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href="/docs">Documentation</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>UIKit</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </ElementDemo>

      {/* Navigation Menu */}
      <ElementDemo
        id="element-nav"
        title={t('element.nav.title')}
        description={t('element.nav.description')}
      >
        <Menubar>
          <MenubarMenu>
            <MenubarTrigger>File</MenubarTrigger>
            <MenubarContent>
              <MenubarItem>New File</MenubarItem>
              <MenubarItem>Open</MenubarItem>
              <MenubarSeparator />
              <MenubarItem>Save</MenubarItem>
            </MenubarContent>
          </MenubarMenu>
          <MenubarMenu>
            <MenubarTrigger>Edit</MenubarTrigger>
            <MenubarContent>
              <MenubarItem>Cut</MenubarItem>
              <MenubarItem>Copy</MenubarItem>
              <MenubarItem>Paste</MenubarItem>
            </MenubarContent>
          </MenubarMenu>
          <MenubarMenu>
            <MenubarTrigger>View</MenubarTrigger>
            <MenubarContent>
              <MenubarItem>Zoom In</MenubarItem>
              <MenubarItem>Zoom Out</MenubarItem>
            </MenubarContent>
          </MenubarMenu>
        </Menubar>
      </ElementDemo>

      {/* Tabs */}
      <ElementDemo
        id="element-tab"
        title={t('element.tab.title')}
        description={t('element.tab.description')}
      >
        <Tabs defaultValue="tab1">
          <TabsList>
            <TabsTrigger value="tab1">Tab 1</TabsTrigger>
            <TabsTrigger value="tab2">Tab 2</TabsTrigger>
            <TabsTrigger value="tab3">Tab 3</TabsTrigger>
          </TabsList>
          <TabsContent value="tab1" className="mt-4">
            <div className="p-4 border border-border rounded">Content for Tab 1</div>
          </TabsContent>
          <TabsContent value="tab2" className="mt-4">
            <div className="p-4 border border-border rounded">Content for Tab 2</div>
          </TabsContent>
          <TabsContent value="tab3" className="mt-4">
            <div className="p-4 border border-border rounded">Content for Tab 3</div>
          </TabsContent>
        </Tabs>
      </ElementDemo>

      {/* Pagination */}
      <ElementDemo
        id="element-pagination"
        title={t('element.pagination.title')}
        description={t('element.pagination.description')}
      >
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  setCurrentPage(Math.max(1, currentPage - 1));
                }}
              />
            </PaginationItem>
            <PaginationItem>
              <PaginationLink href="#" isActive={currentPage === 1} onClick={(e) => { e.preventDefault(); setCurrentPage(1); }}>
                1
              </PaginationLink>
            </PaginationItem>
            <PaginationItem>
              <PaginationLink href="#" isActive={currentPage === 2} onClick={(e) => { e.preventDefault(); setCurrentPage(2); }}>
                2
              </PaginationLink>
            </PaginationItem>
            <PaginationItem>
              <PaginationLink href="#" isActive={currentPage === 3} onClick={(e) => { e.preventDefault(); setCurrentPage(3); }}>
                3
              </PaginationLink>
            </PaginationItem>
            <PaginationItem>
              <PaginationEllipsis />
            </PaginationItem>
            <PaginationItem>
              <PaginationNext
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  setCurrentPage(Math.min(10, currentPage + 1));
                }}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
        <p className="mt-2 text-sm text-muted-foreground text-center">Current page: {currentPage}</p>
      </ElementDemo>

      {/* Link */}
      <ElementDemo
        id="element-link"
        title={t('element.link.title')}
        description={t('element.link.description')}
      >
        <div className="space-y-2">
          <div>
            <a href="#" className="text-primary underline hover:no-underline">
              Standard hyperlink
            </a>
          </div>
          <div>
            <a href="#" className="text-primary hover:underline">
              Link with hover underline
            </a>
          </div>
          <div>
            <a href="#" className="text-muted-foreground hover:text-foreground transition-colors">
              Muted link
            </a>
          </div>
        </div>
      </ElementDemo>

      {/* Menu */}
      <ElementDemo
        id="element-menu"
        title={t('element.menu.title')}
        description={t('element.menu.description')}
      >
        <p className="text-sm text-muted-foreground">
          See the Navigation Menu example above (Nav element) for a Menubar demonstration.
          UIKit also exports DropdownMenu and ContextMenu - see the Actions category.
        </p>
      </ElementDemo>
    </div>
  );
};

NavigationElements.displayName = 'NavigationElements';
