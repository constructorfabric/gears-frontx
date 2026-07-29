/**
 * Data Display Elements Category
 *
 * Demonstrates: DataTable, Table, List, Badge, Tag, Typography, Icon, Image, Timeline, Tooltip
 */

import React from 'react';
import { Separator } from '../../../components/ui/separator';
import { DataTable } from '../../../components/ui/data-table/data-table';
import type { ColumnDef } from '@tanstack/react-table';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '../../../components/ui/table';
import { Badge } from '../../../components/ui/badge';
import {
  TypographyH1,
  TypographyH2,
  TypographyH3,
  TypographyH4,
  TypographyP,
  TypographyBlockquote,
  TypographyList,
  TypographyInlineCode,
  TypographyLarge,
  TypographySmall,
  TypographyMuted,
} from '../../../components/ui/typography';
import {
  Tooltip,
  TooltipProvider,
  TooltipTrigger,
  TooltipContent,
} from '../../../components/ui/tooltip';
import { Button } from '../../../components/ui/button';
import { ButtonVariant } from '../../../components/types';

interface DataDisplayElementsProps {
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

type Payment = {
  id: string;
  amount: number;
  status: 'pending' | 'processing' | 'success' | 'failed';
  email: string;
};

const payments: Payment[] = [
  { id: 'PAY001', amount: 100, status: 'success', email: 'user1@example.com' },
  { id: 'PAY002', amount: 200, status: 'pending', email: 'user2@example.com' },
  { id: 'PAY003', amount: 150, status: 'processing', email: 'user3@example.com' },
  { id: 'PAY004', amount: 300, status: 'failed', email: 'user4@example.com' },
];

const columns: ColumnDef<Payment>[] = [
  {
    accessorKey: 'id',
    header: 'ID',
  },
  {
    accessorKey: 'email',
    header: 'Email',
  },
  {
    accessorKey: 'amount',
    header: 'Amount',
    cell: ({ row }) => {
      const amount = row.getValue('amount') as number;
      return `$${amount.toFixed(2)}`;
    },
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => {
      const status = row.getValue('status') as string;
      const variant =
        status === 'success'
          ? 'default'
          : status === 'failed'
          ? 'destructive'
          : 'secondary';
      return <Badge variant={variant as 'default' | 'secondary' | 'destructive' | 'outline'}>{status}</Badge>;
    },
  },
];

export const DataDisplayElements: React.FC<DataDisplayElementsProps> = ({ t }) => {
  return (
    <div id="category-data_display" className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold mb-2">{t('category.data_display')}</h2>
        <Separator className="mb-6" />
      </div>

      {/* DataTable */}
      <ElementDemo
        id="element-data_table"
        title={t('element.data_table.title')}
        description={t('element.data_table.description')}
      >
        <DataTable columns={columns} data={payments} />
      </ElementDemo>

      {/* Table */}
      <ElementDemo
        id="element-table"
        title={t('element.table.title')}
        description={t('element.table.description')}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell>John Doe</TableCell>
              <TableCell>Developer</TableCell>
              <TableCell>Active</TableCell>
            </TableRow>
            <TableRow>
              <TableCell>Jane Smith</TableCell>
              <TableCell>Designer</TableCell>
              <TableCell>Active</TableCell>
            </TableRow>
            <TableRow>
              <TableCell>Bob Johnson</TableCell>
              <TableCell>Manager</TableCell>
              <TableCell>Away</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </ElementDemo>

      {/* List */}
      <ElementDemo
        id="element-list"
        title={t('element.list.title')}
        description={t('element.list.description')}
      >
        <div className="space-y-4">
          <div>
            <TypographyH4>Unordered List</TypographyH4>
            <TypographyList className="mt-2">
              <li>First item</li>
              <li>Second item</li>
              <li>Third item</li>
            </TypographyList>
          </div>
          <div>
            <TypographyH4>Ordered List</TypographyH4>
            <ol className="mt-2 list-decimal list-inside space-y-1">
              <li>First step</li>
              <li>Second step</li>
              <li>Third step</li>
            </ol>
          </div>
        </div>
      </ElementDemo>

      {/* Badge */}
      <ElementDemo
        id="element-badge"
        title={t('element.badge.title')}
        description={t('element.badge.description')}
      >
        <div className="flex flex-wrap gap-2">
          <Badge>Default</Badge>
          <Badge variant="secondary">Secondary</Badge>
          <Badge variant="destructive">Destructive</Badge>
          <Badge variant="outline">Outline</Badge>
        </div>
      </ElementDemo>

      {/* Tag */}
      <ElementDemo
        id="element-tag"
        title={t('element.tag.title')}
        description={t('element.tag.description')}
      >
        <div className="text-sm text-muted-foreground">
          <p>UIKit does not export a dedicated Tag component.</p>
          <p className="mt-2">Use Badge for tags:</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Badge variant="outline">React</Badge>
            <Badge variant="outline">TypeScript</Badge>
            <Badge variant="outline">TailwindCSS</Badge>
            <Badge variant="outline">Vite</Badge>
          </div>
        </div>
      </ElementDemo>

      {/* Typography */}
      <ElementDemo
        id="element-typography"
        title={t('element.typography.title')}
        description={t('element.typography.description')}
      >
        <div className="space-y-4">
          <TypographyH1>Heading 1</TypographyH1>
          <TypographyH2>Heading 2</TypographyH2>
          <TypographyH3>Heading 3</TypographyH3>
          <TypographyH4>Heading 4</TypographyH4>
          <TypographyP>
            This is a paragraph with <TypographyInlineCode>inline code</TypographyInlineCode> and regular text.
          </TypographyP>
          <TypographyLarge>Large text for emphasis.</TypographyLarge>
          <TypographySmall>Small text for fine print.</TypographySmall>
          <TypographyMuted>Muted text for secondary information.</TypographyMuted>
          <TypographyBlockquote>
            "This is a blockquote. It can be used for citations or emphasized text."
          </TypographyBlockquote>
        </div>
      </ElementDemo>

      {/* Icon */}
      <ElementDemo
        id="element-icon"
        title={t('element.icon.title')}
        description={t('element.icon.description')}
      >
        <div className="text-sm text-muted-foreground">
          <p>UIKit does not export icon components directly.</p>
          <p className="mt-2">
            Icons are provided via Iconify (lucide: prefix) or custom SVG components.
          </p>
          <p className="mt-2">See IconButton component for icon usage examples.</p>
        </div>
      </ElementDemo>

      {/* Image */}
      <ElementDemo
        id="element-image"
        title={t('element.image.title')}
        description={t('element.image.description')}
      >
        <div className="text-sm text-muted-foreground">
          <p>UIKit does not export a dedicated Image component.</p>
          <p className="mt-2">Use standard HTML &lt;img&gt; or Next.js Image for images.</p>
        </div>
      </ElementDemo>

      {/* Timeline */}
      <ElementDemo
        id="element-timeline"
        title={t('element.timeline.title')}
        description={t('element.timeline.description')}
      >
        <div className="text-sm text-muted-foreground">
          <p>UIKit does not export a Timeline component.</p>
          <p className="mt-2">
            Timelines can be built using Card, Separator, and custom styling.
          </p>
        </div>
      </ElementDemo>

      {/* Tooltip */}
      <ElementDemo
        id="element-tooltip"
        title={t('element.tooltip.title')}
        description={t('element.tooltip.description')}
      >
        <TooltipProvider>
          <div className="flex flex-wrap gap-4">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant={ButtonVariant.Outline}>Hover me</Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>This is a tooltip</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button>Another tooltip</Button>
              </TooltipTrigger>
              <TooltipContent side="right">
                <p>Positioned to the right</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant={ButtonVariant.Destructive}>Warning</Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p>This action cannot be undone</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
      </ElementDemo>
    </div>
  );
};

DataDisplayElements.displayName = 'DataDisplayElements';
