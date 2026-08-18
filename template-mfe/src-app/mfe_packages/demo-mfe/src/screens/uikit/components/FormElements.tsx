/**
 * Form Elements Category
 *
 * Demonstrates: Field, Label, Input, Textarea, Select, Checkbox, RadioGroup, Switch
 */

import React, { useState } from 'react';
import {
  Checkbox,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  Label,
  RadioGroup,
  RadioGroupItem,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
  Switch,
  Textarea,
} from '@gears-frontx/ui-kit';
import { ElementDemo } from './ElementDemo';
import styles from '../UIKitElements.module.css';

interface FormElementsProps {
  t: (key: string) => string;
  /**
   * Element inside this MFE's shadow root that Select's popup portals into.
   * Left to the kit's `<body>` default the popup lands in the light DOM, where
   * neither the adopted component stylesheets nor this host's tokens reach it.
   */
  portalContainer: React.RefObject<HTMLElement | null>;
}

/**
 * Select renders the closed trigger from this list, not from the popup's items:
 * without it the trigger shows the raw value until the popup has been opened
 * once. Hoisted to module level so the array keeps a stable identity across
 * renders.
 */
const REGION_ITEMS = [
  { value: 'eu-central', label: 'Frankfurt' },
  { value: 'eu-west', label: 'Dublin' },
  { value: 'us-east', label: 'Virginia' },
];

export const FormElements: React.FC<FormElementsProps> = ({ t, portalContainer }) => {
  const [region, setRegion] = useState('eu-central');
  const [plan, setPlan] = useState('free');
  const [notifications, setNotifications] = useState(true);

  return (
    <section id="category-forms" className={styles.category}>
      <h2 className={styles.categoryTitle}>{t('category.forms')}</h2>

      <ElementDemo
        id="field"
        title={t('element.field.title')}
        description={t('element.field.description')}
      >
        <div className={styles.stack}>
          {/*
            Field is the kit's composition for a labelled control: it wires the
            label's `htmlFor`, the control's id and `aria-describedby` itself, so
            nothing below sets them by hand.
          */}
          <Field name="email">
            <FieldLabel>Email</FieldLabel>
            <Input type="email" required placeholder="you@company.com" />
            <FieldDescription>We only use it for the invoice.</FieldDescription>
            <FieldError match="valueMissing">Email is required.</FieldError>
            <FieldError match="typeMismatch">That does not look like an email.</FieldError>
          </Field>
        </div>
      </ElementDemo>

      <ElementDemo
        id="label"
        title={t('element.label.title')}
        description={t('element.label.description')}
      >
        {/*
          Label is a styled native `<label>` with no id wiring of its own, for
          controls that stand outside a Field. Nesting the control gives the
          pair one click target without an `htmlFor`.
        */}
        <Label>
          <Checkbox name="standalone-terms" />
          Nesting the control needs no htmlFor
        </Label>

        <div className={styles.stack}>
          <Label htmlFor="label-demo-input">Associated through htmlFor</Label>
          <Input id="label-demo-input" placeholder="Project name" />
        </div>
      </ElementDemo>

      <ElementDemo
        id="input"
        title={t('element.input.title')}
        description={t('element.input.description')}
      >
        <div className={styles.stack}>
          <Input type="text" placeholder="Plain text" />
          <Input type="password" placeholder="Password" />
          {/* `type="search"` grows a magnifier and a searchbox role, with no prop. */}
          <Input type="search" placeholder="Search projects" />
          <Input aria-invalid defaultValue="Rejected value" />
          <Input disabled placeholder="Disabled" />
        </div>
      </ElementDemo>

      <ElementDemo
        id="textarea"
        title={t('element.textarea.title')}
        description={t('element.textarea.description')}
      >
        <div className={styles.stack}>
          <Textarea placeholder="Type your message here..." />
          <Textarea rows={6} placeholder="Six rows to start with" />
        </div>
      </ElementDemo>

      <ElementDemo
        id="select"
        title={t('element.select.title')}
        description={t('element.select.description')}
      >
        <div className={styles.stack}>
          <Field name="region">
            <FieldLabel>Region</FieldLabel>
            {/*
              Select reports `null` when a selection is cleared, which this demo
              has no control for; the fallback keeps the trigger showing a region
              rather than the placeholder.
            */}
            <Select
              items={REGION_ITEMS}
              value={region}
              onValueChange={(value) => setRegion(value ?? REGION_ITEMS[0].value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Pick a region" />
              </SelectTrigger>
              <SelectContent container={portalContainer}>
                {/* The group carries the list padding; items directly under the content lose it. */}
                <SelectGroup>
                  <SelectLabel>Europe</SelectLabel>
                  {REGION_ITEMS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        </div>
      </ElementDemo>

      <ElementDemo
        id="checkbox"
        title={t('element.checkbox.title')}
        description={t('element.checkbox.description')}
      >
        <Label className={styles.inlineControl}>
          <Checkbox name="terms" />
          Accept terms and conditions
        </Label>
        <Label className={styles.inlineControl}>
          <Checkbox name="newsletter" defaultChecked />
          Checked by default
        </Label>
        <Label className={styles.inlineControl}>
          {/* Reports `aria-checked="mixed"` rather than a third boolean state. */}
          <Checkbox name="partial" indeterminate />
          Indeterminate
        </Label>
        <Label className={styles.inlineControl}>
          <Checkbox name="locked" disabled />
          Disabled
        </Label>
      </ElementDemo>

      <ElementDemo
        id="radio"
        title={t('element.radio.title')}
        description={t('element.radio.description')}
      >
        <RadioGroup value={plan} onValueChange={(value) => setPlan(String(value))}>
          <Label className={styles.inlineControl}>
            <RadioGroupItem value="free" />
            Free
          </Label>
          <Label className={styles.inlineControl}>
            <RadioGroupItem value="pro" />
            Pro
          </Label>
          <Label className={styles.inlineControl}>
            <RadioGroupItem value="enterprise" disabled />
            Enterprise (unavailable)
          </Label>
        </RadioGroup>
        <p className={styles.note}>
          Selected: <span className={styles.mono}>{plan}</span>
        </p>
      </ElementDemo>

      <ElementDemo
        id="switch"
        title={t('element.switch.title')}
        description={t('element.switch.description')}
      >
        <Label className={styles.inlineControl}>
          <Switch checked={notifications} onCheckedChange={setNotifications} />
          Enable notifications
        </Label>
        <Label className={styles.inlineControl}>
          <Switch size="sm" defaultChecked />
          Small switch
        </Label>
        <Label className={styles.inlineControl}>
          <Switch disabled />
          Disabled
        </Label>
      </ElementDemo>
    </section>
  );
};

FormElements.displayName = 'FormElements';
