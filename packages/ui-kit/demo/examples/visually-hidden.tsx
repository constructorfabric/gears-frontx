import { VisuallyHidden } from '@gears-frontx/ui-kit';
import { Bell } from 'lucide-react';

import { Row, Section } from '../shared';

export default function VisuallyHiddenExample() {
  return (
    <>
      <Section title="Icon-only link">
        <Row>
          <a href="#notifications" onClick={(event) => event.preventDefault()}>
            <Bell aria-hidden="true" />
            <VisuallyHidden>Notifications</VisuallyHidden>
          </a>
          <span>The link is named by the hidden text.</span>
        </Row>
      </Section>

      <Section title="Table caption">
        <table>
          <VisuallyHidden render={<caption />}>Members</VisuallyHidden>
          <tbody>
            <tr>
              <td>Ana</td>
              <td>Owner</td>
            </tr>
          </tbody>
        </table>
      </Section>
    </>
  );
}
