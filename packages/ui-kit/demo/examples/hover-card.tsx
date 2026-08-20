import { Avatar, AvatarFallback, HoverCard, HoverCardContent, HoverCardTrigger } from '@gears-frontx/ui-kit';

import { Row, Section } from '../shared';

export default function HoverCardExample() {
  return (
    <>
      <Section title="Basic">
        <HoverCard>
          <HoverCardTrigger href="https://github.com/shadcn" target="_blank" rel="noreferrer">
            @shadcn
          </HoverCardTrigger>
          <HoverCardContent>
            <Row>
              <Avatar>
                <AvatarFallback>CN</AvatarFallback>
              </Avatar>
              The React Framework – created and maintained by @shadcn.
            </Row>
          </HoverCardContent>
        </HoverCard>
      </Section>

      <Section title="Sides">
        <Row>
          {(['top', 'right', 'bottom', 'left'] as const).map((side) => (
            <HoverCard key={side}>
              <HoverCardTrigger href="#">
                {side}
              </HoverCardTrigger>
              <HoverCardContent side={side}>Positioned on the {side}.</HoverCardContent>
            </HoverCard>
          ))}
        </Row>
      </Section>
    </>
  );
}
