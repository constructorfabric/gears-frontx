import {
  Checkbox,
  FieldBackup,
  FieldBackupDescription,
  FieldBackupError,
  FieldBackupLabel,
  Input,
  RadioGroup,
  RadioGroupItem,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from '@gears-frontx/ui-kit';

import { Row, Section } from '../shared';

export default function FieldBackupExample() {
  return (
    <div style={{ display: 'grid', gap: 'var(--space-6)', maxWidth: 420 }}>
      <Section title="Native validation">
        <FieldBackup name="email">
          <FieldBackupLabel>Email</FieldBackupLabel>
          <Input type="email" required placeholder="you@company.com" />
          <FieldBackupDescription>We only use it for the invoice.</FieldBackupDescription>
          <FieldBackupError match="valueMissing">Email is required.</FieldBackupError>
          <FieldBackupError match="typeMismatch">That does not look like an email.</FieldBackupError>
        </FieldBackup>
      </Section>

      <Section title="External validation">
        <FieldBackup name="slug" invalid>
          <FieldBackupLabel>Slug</FieldBackupLabel>
          <Input defaultValue="already-taken" />
          <FieldBackupError match>This slug is already taken.</FieldBackupError>
        </FieldBackup>
      </Section>

      <Section title="Custom validate">
        <FieldBackup name="password" validate={(value) => (typeof value === 'string' && value.length < 8 ? 'Must be at least 8 characters.' : null)}>
          <FieldBackupLabel>Password</FieldBackupLabel>
          <Input type="password" />
          <FieldBackupError match />
        </FieldBackup>
      </Section>

      <Section title="Disabled">
        <FieldBackup name="plan" disabled>
          <FieldBackupLabel>Plan</FieldBackupLabel>
          <Input defaultValue="Pro" />
          <FieldBackupDescription>Contact billing to change your plan.</FieldBackupDescription>
        </FieldBackup>
      </Section>

      <Section title="Checkbox auto-wiring">
        <FieldBackup name="terms">
          <Row>
            <Checkbox required />
            <FieldBackupLabel>Accept terms and conditions</FieldBackupLabel>
          </Row>
          <FieldBackupError match="valueMissing">You must accept the terms.</FieldBackupError>
        </FieldBackup>
      </Section>

      <Section title="Switch auto-wiring">
        <FieldBackup name="marketing">
          <Row>
            <Switch />
            <FieldBackupLabel>Marketing emails</FieldBackupLabel>
          </Row>
          <FieldBackupDescription>Occasional product news, no more than monthly.</FieldBackupDescription>
        </FieldBackup>
      </Section>

      <Section title="RadioGroup auto-wiring">
        <FieldBackup name="delivery">
          <FieldBackupLabel>Delivery method</FieldBackupLabel>
          <RadioGroup defaultValue="standard">
            <Row>
              <RadioGroupItem value="standard" /> Standard
            </Row>
            <Row>
              <RadioGroupItem value="express" /> Express
            </Row>
          </RadioGroup>
        </FieldBackup>
      </Section>

      <Section title="Select auto-wiring">
        <FieldBackup name="country">
          <FieldBackupLabel>Country</FieldBackupLabel>
          <Select defaultValue="us">
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="us">United States</SelectItem>
              <SelectItem value="ca">Canada</SelectItem>
            </SelectContent>
          </Select>
        </FieldBackup>
      </Section>
    </div>
  );
}
