/**
 * Data Display Elements Category
 *
 * Demonstrates: Table, Badge, Tooltip
 */

import React from 'react';
import {
  Badge,
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@gears-frontx/ui-kit';
import { ElementDemo } from './ElementDemo';
import styles from '../UIKitElements.module.css';

interface DataDisplayElementsProps {
  t: (key: string) => string;
  /**
   * Element inside this MFE's shadow root that the tooltip popup portals into.
   * Left to the kit's `<body>` default the popup lands in the light DOM, where
   * neither the adopted component stylesheets nor this host's tokens reach it.
   */
  portalContainer: React.RefObject<HTMLElement | null>;
}

interface DemoInvoice {
  id: string;
  customer: string;
  /** Doubles as the Badge variant, which is what pairs a row with its colour. */
  status: 'success' | 'warning' | 'danger';
  statusLabel: string;
  amount: string;
}

/** Neutral fixture rows; nothing here stands in for real customer data. */
const INVOICES: readonly DemoInvoice[] = [
  {
    id: 'INV-001',
    customer: 'Northwind',
    status: 'success',
    statusLabel: 'Paid',
    amount: '€1,250.00',
  },
  {
    id: 'INV-002',
    customer: 'Contoso',
    status: 'warning',
    statusLabel: 'Pending',
    amount: '€480.00',
  },
  {
    id: 'INV-003',
    customer: 'Fabrikam',
    status: 'danger',
    statusLabel: 'Overdue',
    amount: '€2,100.00',
  },
];

export const DataDisplayElements: React.FC<DataDisplayElementsProps> = ({
  t,
  portalContainer,
}) => {
  return (
    <section id="category-data_display" className={styles.category}>
      <h2 className={styles.categoryTitle}>{t('category.data_display')}</h2>

      <ElementDemo
        id="table"
        title={t('element.table.title')}
        description={t('element.table.description')}
      >
        {/* `label` names the scrollable wrapper the kit puts around the table. */}
        <Table label="Invoices">
          <TableCaption>Invoices issued this quarter.</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Invoice</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {INVOICES.map((invoice, index) => (
              // Row state is a data attribute, not a prop; the first row shows `selected`.
              <TableRow key={invoice.id} data-state={index === 0 ? 'selected' : undefined}>
                <TableCell className={styles.mono}>{invoice.id}</TableCell>
                <TableCell>{invoice.customer}</TableCell>
                <TableCell>
                  <Badge variant={invoice.status}>{invoice.statusLabel}</Badge>
                </TableCell>
                <TableCell>{invoice.amount}</TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell>Total</TableCell>
              <TableCell />
              <TableCell />
              <TableCell>€3,830.00</TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </ElementDemo>

      <ElementDemo
        id="badge"
        title={t('element.badge.title')}
        description={t('element.badge.description')}
      >
        {/*
          The kit's badge variants are semantic states, not the visual weights
          shadcn names — there is no `default`, `outline` or `secondary` here.
        */}
        <div className={styles.row}>
          <Badge variant="success">Running</Badge>
          <Badge variant="warning">Degraded</Badge>
          <Badge variant="info">Queued</Badge>
          <Badge variant="danger">Failed</Badge>
          <Badge variant="muted">Draft</Badge>
        </div>

        <div className={styles.row}>
          <Badge variant="success" shape="dot">
            Online
          </Badge>
          <Badge variant="muted" shape="dot">
            Offline
          </Badge>
        </div>
      </ElementDemo>

      <ElementDemo
        id="tooltip"
        title={t('element.tooltip.title')}
        description={t('element.tooltip.description')}
      >
        <div className={styles.row}>
          {/*
            The kit wires no `aria-describedby`, so the trigger carries the same
            words as the tooltip rather than relying on it to name the control.
          */}
          <Tooltip>
            <TooltipTrigger aria-label="Bold">B</TooltipTrigger>
            <TooltipContent container={portalContainer}>
              Bold
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger aria-label="Italic">I</TooltipTrigger>
            <TooltipContent container={portalContainer} side="bottom">
              Italic
            </TooltipContent>
          </Tooltip>
        </div>
        <p className={styles.note}>Tooltips are suppressed on touch devices.</p>
      </ElementDemo>
    </section>
  );
};

DataDisplayElements.displayName = 'DataDisplayElements';
