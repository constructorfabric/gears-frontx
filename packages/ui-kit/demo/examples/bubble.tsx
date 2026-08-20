import {
  Bubble,
  BubbleContent,
  BubbleGroup,
  BubbleReactions,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@gears-frontx/ui-kit';
import { Row, Section } from '../shared';

export default function BubbleExample() {
  return (
    <>
      <Section title="Variants">
        <Row style={{ flexDirection: 'column', alignItems: 'stretch' }}>
          <Bubble variant="default">
            <BubbleContent>default</BubbleContent>
          </Bubble>
          <Bubble variant="secondary">
            <BubbleContent>secondary</BubbleContent>
          </Bubble>
          <Bubble variant="muted">
            <BubbleContent>muted</BubbleContent>
          </Bubble>
          <Bubble variant="tinted">
            <BubbleContent>tinted</BubbleContent>
          </Bubble>
          <Bubble variant="outline">
            <BubbleContent>outline</BubbleContent>
          </Bubble>
          <Bubble variant="ghost">
            <BubbleContent>ghost — spans the full row, unframed</BubbleContent>
          </Bubble>
          <Bubble variant="destructive">
            <BubbleContent>destructive</BubbleContent>
          </Bubble>
        </Row>
      </Section>

      <Section title="Alignment">
        <Row style={{ flexDirection: 'column', alignItems: 'stretch' }}>
          <Bubble align="start">
            <BubbleContent>Aligned to the start.</BubbleContent>
          </Bubble>
          <Bubble align="end">
            <BubbleContent>Aligned to the end.</BubbleContent>
          </Bubble>
        </Row>
      </Section>

      <Section title="Bubble group">
        <BubbleGroup>
          <Bubble align="end">
            <BubbleContent>First message.</BubbleContent>
          </Bubble>
          <Bubble align="end">
            <BubbleContent>Second message.</BubbleContent>
          </Bubble>
        </BubbleGroup>
      </Section>

      <Section title="Links and buttons">
        <Bubble variant="muted">
          <BubbleContent render={<button type="button" onClick={() => {}} />}>Click here</BubbleContent>
        </Bubble>
      </Section>

      <Section title="Reactions">
        <div style={{ paddingBlockEnd: 'var(--space-4)' }}>
          <Bubble variant="secondary">
            <BubbleContent>Ship it.</BubbleContent>
            <BubbleReactions side="top" align="start">
              <span>🔥</span>
            </BubbleReactions>
          </Bubble>
        </div>
      </Section>

      <Section title="Show more">
        <Bubble variant="outline" style={{ maxWidth: 'none' }}>
          <BubbleContent>
            <Collapsible style={{ display: 'grid', gap: 'var(--space-2)' }}>
              <div>Here is a short preview of a much longer message.</div>
              <CollapsibleContent keepMounted>
                The rest of the message only appears once expanded, keeping the
                conversation compact by default.
              </CollapsibleContent>
              <CollapsibleTrigger>Show more</CollapsibleTrigger>
            </Collapsible>
          </BubbleContent>
        </Bubble>
      </Section>

      <Section title="Tooltip">
        <Row>
          <Tooltip>
            <TooltipTrigger
              render={
                <Bubble variant="secondary" style={{ cursor: 'default' }}>
                  <BubbleContent>Message delivered.</BubbleContent>
                </Bubble>
              }
            />
            <TooltipContent>Read 2:41 PM</TooltipContent>
          </Tooltip>
        </Row>
      </Section>

      <Section title="Popover">
        <Row>
          <Popover>
            <PopoverTrigger
              render={
                <Bubble variant="destructive" style={{ cursor: 'pointer' }}>
                  <BubbleContent>Failed to send.</BubbleContent>
                </Bubble>
              }
            />
            <PopoverContent>
              <PopoverHeader>
                <PopoverTitle>Error details</PopoverTitle>
                <PopoverDescription>The network request timed out after 30 seconds.</PopoverDescription>
              </PopoverHeader>
            </PopoverContent>
          </Popover>
        </Row>
      </Section>
    </>
  );
}
