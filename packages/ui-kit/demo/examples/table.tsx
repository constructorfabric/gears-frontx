import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@gears-frontx/ui-kit';

import { Measure, Section } from '../shared';

const INVOICES = [
  { id: 'INV001', status: 'Paid', amount: '$250.00' },
  { id: 'INV002', status: 'Pending', amount: '$150.00' },
  { id: 'INV003', status: 'Unpaid', amount: '$350.00' },
];

export default function TableExample() {
  return (
    <>
      <Section title="Basic">
        <Table>
          <TableCaption>A list of recent invoices.</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Invoice</TableHead>
              <TableHead>Status</TableHead>
              <TableHead style={{ textAlign: 'right' }}>Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {INVOICES.map((invoice) => (
              <TableRow key={invoice.id}>
                <TableCell>{invoice.id}</TableCell>
                <TableCell>{invoice.status}</TableCell>
                <TableCell style={{ textAlign: 'right' }}>{invoice.amount}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>

      <Section title="Footer">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Invoice</TableHead>
              <TableHead style={{ textAlign: 'right' }}>Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {INVOICES.map((invoice) => (
              <TableRow key={invoice.id}>
                <TableCell>{invoice.id}</TableCell>
                <TableCell style={{ textAlign: 'right' }}>{invoice.amount}</TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell>Total</TableCell>
              <TableCell style={{ textAlign: 'right' }}>$750.00</TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </Section>

      <Section title="Actions">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Invoice</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {INVOICES.map((invoice) => (
              <TableRow key={invoice.id}>
                <TableCell>{invoice.id}</TableCell>
                <TableCell style={{ textAlign: 'right' }}>
                  <DropdownMenu>
                    <DropdownMenuTrigger render={<Button variant="ghost" size="sm">Actions</Button>} />
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem>View</DropdownMenuItem>
                      <DropdownMenuItem>Edit</DropdownMenuItem>
                      <DropdownMenuItem>Delete</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>

      <Section title="Row states">
        <Table>
          <TableBody>
            <TableRow data-state="selected">
              <TableCell>gears-scheduler (selected)</TableCell>
              <TableCell>
                <Badge variant="success">running</Badge>
              </TableCell>
            </TableRow>
            <TableRow data-state="stale">
              <TableCell>gears-connector (stale)</TableCell>
              <TableCell>
                <Badge variant="warning">needs action</Badge>
              </TableCell>
            </TableRow>
            <TableRow data-state="restricted">
              <TableCell>gears-vault (restricted)</TableCell>
              <TableCell>
                <Badge variant="danger">no access</Badge>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </Section>

      <Section title="Density">
        <Table density="compact">
          <TableBody>
            <TableRow>
              <TableCell>compact density</TableCell>
              <TableCell>row one</TableCell>
            </TableRow>
            <TableRow>
              <TableCell>compact density</TableCell>
              <TableCell>row two</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </Section>

      {/* The resize handle at rest, hovered, focused and mid-drag. Drag a
          boundary and both column widths move while the table's own width
          stays put; the arrow keys move it 12px per press. */}
      <Section title="Resizable columns">
        <Measure
          of={{
            'handle rect': '#table-resize th:first-child [role=separator]',
            'first column': '#table-resize th:first-child',
            'second column': '#table-resize th:nth-child(2)',
            'third column': '#table-resize th:nth-child(3)',
          }}
        >
          <Table id="table-resize" label="Invoices, resizable">
            <TableHeader>
              <TableRow>
                <TableHead resizable>Invoice</TableHead>
                <TableHead resizable>Status</TableHead>
                <TableHead resizable resizeMinWidth={120}>
                  Amount
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {INVOICES.map((invoice) => (
                <TableRow key={invoice.id}>
                  <TableCell>{invoice.id}</TableCell>
                  <TableCell>{invoice.status}</TableCell>
                  <TableCell>{invoice.amount}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Measure>
      </Section>

      {/* The collection view: a fixed layout, a sticky header on its own
          fill, 64px rows that wrap, and the two row states. The height cap
          sits on Table's own wrapper, the header's scroll container, so the
          header stays put while the rows scroll under it. */}
      <Section title="Collection view">
        <Measure
          of={{
            header: '#table-collection th:first-child',
            row: '#table-collection tbody tr:first-child',
            cell: '#table-collection tbody td:first-child',
            'pending row': '#table-collection tbody tr[data-pending]',
          }}
        >
          <Table
            id="table-collection"
            variant="collection"
            label="Invoices, collection"
            containerStyle={{ maxHeight: 220 }}
          >
            <TableHeader>
              <TableRow>
                <TableHead resizable>Invoice</TableHead>
                <TableHead resizable>Status</TableHead>
                <TableHead resizable>Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {INVOICES.map((invoice, index) => (
                <TableRow key={invoice.id} tabIndex={0} data-pending={index === 1 ? '' : undefined}>
                  <TableCell>
                    {invoice.id} - a long value that wraps onto a second line in a collection row
                    instead of being cut off
                  </TableCell>
                  <TableCell>{invoice.status}</TableCell>
                  <TableCell>{invoice.amount}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Measure>
      </Section>
    </>
  );
}
