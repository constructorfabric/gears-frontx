import {
  DescriptionList,
  DescriptionListDetails,
  DescriptionListItem,
  DescriptionListTerm,
} from '@gears-frontx/ui-kit';

import { Section } from '../shared';

function Facts({ orientation, size }: { orientation?: 'vertical' | 'horizontal'; size?: 'sm' }) {
  return (
    <DescriptionList orientation={orientation} size={size}>
      <DescriptionListItem>
        <DescriptionListTerm>Owner</DescriptionListTerm>
        <DescriptionListDetails>Platform team</DescriptionListDetails>
      </DescriptionListItem>
      <DescriptionListItem>
        <DescriptionListTerm>Entry point</DescriptionListTerm>
        <DescriptionListDetails typography="mono">src/app/main.tsx</DescriptionListDetails>
      </DescriptionListItem>
      <DescriptionListItem>
        <DescriptionListTerm>Updated</DescriptionListTerm>
        <DescriptionListDetails>2 hours ago</DescriptionListDetails>
      </DescriptionListItem>
    </DescriptionList>
  );
}

export default function DescriptionListExample() {
  return (
    <>
      <Section title="Vertical">
        <Facts />
      </Section>
      <Section title="Horizontal">
        <Facts orientation="horizontal" />
      </Section>
      <Section title="Small">
        <Facts orientation="horizontal" size="sm" />
      </Section>
    </>
  );
}
