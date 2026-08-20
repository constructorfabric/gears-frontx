import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
  InputGroupTextarea,
  Kbd,
  Spinner,
} from '@gears-frontx/ui-kit';

import { CloseIcon, DemoIcon, Row, Section } from '../shared';

export default function InputGroupExample() {
  return (
    <div style={{ display: 'grid', gap: 'var(--space-6)' }}>
      <Section title="Alignment">
        <Row style={{ flexDirection: 'column', alignItems: 'stretch', maxWidth: '20rem' }}>
          <InputGroup>
            <InputGroupAddon align="inline-start">
              <InputGroupText>$</InputGroupText>
            </InputGroupAddon>
            <InputGroupInput type="number" placeholder="0.00" aria-label="Amount" />
          </InputGroup>
          <InputGroup>
            <InputGroupInput placeholder="Search" aria-label="Search" />
            <InputGroupAddon align="inline-end">
              <InputGroupButton icon={<CloseIcon />} aria-label="Clear" />
            </InputGroupAddon>
          </InputGroup>
          <InputGroup>
            <InputGroupAddon align="block-start">
              <InputGroupText>To:</InputGroupText>
            </InputGroupAddon>
            <InputGroupTextarea placeholder="Message" aria-label="Message" rows={2} />
          </InputGroup>
          <InputGroup>
            <InputGroupTextarea placeholder="Notes" aria-label="Notes" rows={2} />
            <InputGroupAddon align="block-end">
              <InputGroupText>Markdown supported</InputGroupText>
            </InputGroupAddon>
          </InputGroup>
        </Row>
      </Section>

      <Section title="Icon">
        <InputGroup style={{ maxWidth: '20rem' }}>
          <InputGroupAddon>
            <DemoIcon />
          </InputGroupAddon>
          <InputGroupInput placeholder="Search" aria-label="Search" />
        </InputGroup>
      </Section>

      <Section title="Text">
        <Row style={{ flexDirection: 'column', alignItems: 'stretch', maxWidth: '20rem' }}>
          <InputGroup>
            <InputGroupAddon>
              <InputGroupText>https://</InputGroupText>
            </InputGroupAddon>
            <InputGroupInput placeholder="example.com" aria-label="URL" />
            <InputGroupAddon align="inline-end">
              <InputGroupText>.com</InputGroupText>
            </InputGroupAddon>
          </InputGroup>
        </Row>
      </Section>

      <Section title="Button">
        <InputGroup style={{ maxWidth: '20rem' }}>
          <InputGroupInput placeholder="Search" aria-label="Search" />
          <InputGroupAddon align="inline-end">
            <InputGroupButton>Search</InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </Section>

      <Section title="Kbd">
        <InputGroup style={{ maxWidth: '20rem' }}>
          <InputGroupInput placeholder="Search…" aria-label="Search" />
          <InputGroupAddon align="inline-end">
            <Kbd>⌘K</Kbd>
          </InputGroupAddon>
        </InputGroup>
      </Section>

      <Section title="Dropdown">
        <InputGroup style={{ maxWidth: '20rem' }}>
          <InputGroupInput placeholder="Filter by status" aria-label="Filter" />
          <InputGroupAddon align="inline-end">
            <DropdownMenu>
              <DropdownMenuTrigger render={<InputGroupButton>Status</InputGroupButton>} />
              <DropdownMenuContent>
                <DropdownMenuItem>Open</DropdownMenuItem>
                <DropdownMenuItem>Closed</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </InputGroupAddon>
        </InputGroup>
      </Section>

      <Section title="Spinner">
        <InputGroup style={{ maxWidth: '20rem' }}>
          <InputGroupInput placeholder="Loading…" aria-label="Loading" disabled />
          <InputGroupAddon align="inline-end">
            <Spinner />
          </InputGroupAddon>
        </InputGroup>
      </Section>

      <Section title="Textarea">
        <InputGroup style={{ maxWidth: '20rem' }}>
          <InputGroupTextarea placeholder="Notes" aria-label="Notes" rows={3} />
          <InputGroupAddon align="block-end">
            <InputGroupText>0/280</InputGroupText>
          </InputGroupAddon>
        </InputGroup>
      </Section>
    </div>
  );
}
