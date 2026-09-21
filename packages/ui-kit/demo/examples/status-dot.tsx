import { StatusDot, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@gears-frontx/ui-kit';

import { Measure, Row, Section } from '../shared';

export default function StatusDotExample() {
  return (
    <>
      <Section title="Tones">
        <Row>
          <StatusDot tone="neutral" label="Idle" />
          <StatusDot tone="success" label="Running" />
          <StatusDot tone="warning" label="Degraded" />
          <StatusDot tone="danger" label="Failed" />
          <StatusDot tone="info" label="Queued" />
        </Row>
      </Section>

      {/* The drawn anatomy: a 6x6 dot, 6 between it and a 12/16 label. The
          dot is measured on its own because the root's rect is the dot plus
          the gap plus the label, which would hide a drift in any one of
          them. */}
      <Section title="Anatomy">
        <Measure
          of={{
            root: '#status-anatomy',
            dot: '#status-anatomy > span:first-child',
            label: '#status-anatomy > span:last-child',
            'dot only': '#status-bare > span:first-child',
          }}
        >
          <Row>
            <StatusDot id="status-anatomy" tone="success" label="Running" />
            <StatusDot id="status-bare" tone="danger" aria-label="Failed" />
          </Row>
        </Measure>
      </Section>

      <Section title="Live">
        <Row>
          <StatusDot tone="success" live label="Streaming" />
          <StatusDot tone="info" live label="Syncing" />
          <StatusDot tone="neutral" label="Completed" />
        </Row>
      </Section>

      {/* Where the component earns its keep: a column of states that would
          each be a pill if they were badges. */}
      <Section title="In a table">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Job</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell>Nightly export</TableCell>
              <TableCell>
                <StatusDot tone="success" label="Completed" />
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell>Index rebuild</TableCell>
              <TableCell>
                <StatusDot tone="info" live label="Running" />
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell>Webhook retry</TableCell>
              <TableCell>
                <StatusDot tone="danger" label="Failed" />
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </Section>
    </>
  );
}
