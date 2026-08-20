import { useState } from 'react';

import {
  Badge,
  Button,
  ButtonGroup,
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  Input,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  NativeSelect,
  NativeSelectOption,
} from '@gears-frontx/ui-kit';

import { CloseIcon, DemoIcon, Row, Section } from '../shared';

export default function InputExample() {
  const [query, setQuery] = useState('');

  return (
    <div style={{ display: 'grid', gap: 'var(--space-6)', maxWidth: 480 }}>
      <Section title="Basic">
        <Input placeholder="Project name" />
      </Section>

      <Section title="Field">
        <Field>
          <FieldLabel htmlFor="in-username">Username</FieldLabel>
          <Input id="in-username" placeholder="shadcn" aria-describedby="in-username-desc" />
          <FieldDescription id="in-username-desc">This is your public display name.</FieldDescription>
        </Field>
      </Section>

      <Section title="Field group">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="in-first">First name</FieldLabel>
            <Input id="in-first" placeholder="Jane" />
          </Field>
          <Field>
            <FieldLabel htmlFor="in-last">Last name</FieldLabel>
            <Input id="in-last" placeholder="Doe" />
          </Field>
          <Row>
            <Button type="reset" variant="outline">
              Reset
            </Button>
            <Button type="submit">Submit</Button>
          </Row>
        </FieldGroup>
      </Section>

      <Section title="Disabled">
        <Input disabled placeholder="Read only for now" />
      </Section>

      <Section title="Invalid">
        <Input aria-invalid defaultValue="not-an-email" />
      </Section>

      <Section title="File">
        <Input type="file" />
      </Section>

      <Section title="Inline">
        <Field orientation="horizontal">
          <FieldLabel htmlFor="in-search">Search</FieldLabel>
          <Row>
            <Input id="in-search" placeholder="Search projects…" />
            <Button>Search</Button>
          </Row>
        </Field>
      </Section>

      <Section title="Grid">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
          <Field>
            <FieldLabel htmlFor="in-city">City</FieldLabel>
            <Input id="in-city" placeholder="Cupertino" />
          </Field>
          <Field>
            <FieldLabel htmlFor="in-zip">ZIP</FieldLabel>
            <Input id="in-zip" placeholder="95014" />
          </Field>
        </div>
      </Section>

      <Section title="Required">
        <Field>
          <FieldLabel htmlFor="in-email">Email</FieldLabel>
          <Input id="in-email" type="email" required placeholder="you@company.com" aria-describedby="in-email-desc" />
          <FieldDescription id="in-email-desc">Required to receive account notices.</FieldDescription>
        </Field>
      </Section>

      <Section title="Badge">
        <Field>
          <Row>
            <FieldLabel htmlFor="in-nickname">Nickname</FieldLabel>
            <Badge variant="secondary">Recommended</Badge>
          </Row>
          <Input id="in-nickname" placeholder="What should we call you?" />
        </Field>
      </Section>

      <Section title="Input group">
        <InputGroup style={{ maxWidth: '20rem' }}>
          <InputGroupAddon>
            <DemoIcon />
          </InputGroupAddon>
          <InputGroupInput
            placeholder="Search"
            aria-label="Search"
            value={query}
            onValueChange={setQuery}
          />
        </InputGroup>
      </Section>

      <Section title="Button group">
        <ButtonGroup>
          <Input placeholder="you@company.com" icon={<DemoIcon />} />
          <Button variant="outline" icon={<CloseIcon />} aria-label="Clear" onClick={() => setQuery('')} />
        </ButtonGroup>
      </Section>

      <Section title="Form">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="in-form-name">Name</FieldLabel>
            <Input id="in-form-name" placeholder="Jane Doe" />
          </Field>
          <Field>
            <FieldLabel htmlFor="in-form-email">Email</FieldLabel>
            <Input id="in-form-email" type="email" placeholder="you@company.com" />
          </Field>
          <Field>
            <FieldLabel htmlFor="in-form-country">Country</FieldLabel>
            <NativeSelect id="in-form-country" defaultValue="us">
              <NativeSelectOption value="us">United States</NativeSelectOption>
              <NativeSelectOption value="ca">Canada</NativeSelectOption>
            </NativeSelect>
          </Field>
          <Button type="submit">Create account</Button>
        </FieldGroup>
      </Section>
    </div>
  );
}
