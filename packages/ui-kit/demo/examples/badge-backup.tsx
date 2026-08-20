import { BadgeBackup } from '@gears-frontx/ui-kit';

import { DemoIcon, Row, Section } from '../shared';

export default function BadgeBackupExample() {
  return (
    <>
      <Section title="Variants">
        <Row>
          <BadgeBackup variant="success">success</BadgeBackup>
          <BadgeBackup variant="warning">warning</BadgeBackup>
          <BadgeBackup variant="info">info</BadgeBackup>
          <BadgeBackup variant="danger">danger</BadgeBackup>
          <BadgeBackup>muted</BadgeBackup>
        </Row>
      </Section>

      <Section title="Shapes">
        <Row>
          <BadgeBackup variant="success" shape="pill">
            pill
          </BadgeBackup>
          <BadgeBackup variant="success" shape="plain">
            plain
          </BadgeBackup>
        </Row>
      </Section>

      <Section title="With dot">
        <Row>
          <BadgeBackup variant="success" dot>
            Running
          </BadgeBackup>
          <BadgeBackup variant="danger" dot>
            Failed
          </BadgeBackup>
          <BadgeBackup variant="success" shape="plain" dot>
            Online
          </BadgeBackup>
        </Row>
      </Section>

      <Section title="With icon">
        <Row>
          <BadgeBackup variant="info" icon={<DemoIcon />}>
            with icon
          </BadgeBackup>
        </Row>
      </Section>

      <Section title="As a link">
        <Row>
          <BadgeBackup variant="info" render={<a href="#filters/open" />}>
            3 open
          </BadgeBackup>
        </Row>
      </Section>
    </>
  );
}
