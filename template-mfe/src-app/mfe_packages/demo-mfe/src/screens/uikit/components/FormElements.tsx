/**
 * Form Elements Category
 *
 * Demonstrates: Input, TextArea, Select, Checkbox, Radio, Switch, DatePicker, FileUpload, Slider, Rating
 */

import React, { useState } from 'react';
import { Separator } from '../../../components/ui/separator';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Textarea } from '../../../components/ui/textarea';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '../../../components/ui/select';
import { Checkbox } from '../../../components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '../../../components/ui/radio-group';
import { Switch } from '../../../components/ui/switch';
import { Slider } from '../../../components/ui/slider';
import {
  DatePicker,
  DatePickerTrigger,
  DatePickerContent,
  DatePickerInput,
} from '../../../components/ui/date-picker';

interface FormElementsProps {
  t: (key: string) => string;
}

const ElementDemo: React.FC<{ id: string; title: string; description: string; children: React.ReactNode }> = ({
  id,
  title,
  description,
  children,
}) => (
  <div id={id} className="scroll-mt-4 mb-8">
    <h3 className="text-xl font-semibold mb-2">{title}</h3>
    <p className="text-sm text-muted-foreground mb-4">{description}</p>
    <div className="border border-border rounded-lg p-6 bg-background">{children}</div>
  </div>
);

export const FormElements: React.FC<FormElementsProps> = ({ t }) => {
  const [sliderValue, setSliderValue] = useState([50]);
  const [date, setDate] = useState<Date>();

  return (
    <div id="category-forms" className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold mb-2">{t('category.forms')}</h2>
        <Separator className="mb-6" />
      </div>

      {/* Input */}
      <ElementDemo
        id="element-input"
        title={t('element.input.title')}
        description={t('element.input.description')}
      >
        <div className="space-y-4 max-w-md">
          <div>
            <Label htmlFor="input-text">Text Input</Label>
            <Input id="input-text" type="text" placeholder="Enter text..." />
          </div>
          <div>
            <Label htmlFor="input-email">Email Input</Label>
            <Input id="input-email" type="email" placeholder="email@example.com" />
          </div>
          <div>
            <Label htmlFor="input-password">Password Input</Label>
            <Input id="input-password" type="password" placeholder="Password" />
          </div>
          <div>
            <Label htmlFor="input-disabled">Disabled Input</Label>
            <Input id="input-disabled" type="text" placeholder="Disabled" disabled />
          </div>
        </div>
      </ElementDemo>

      {/* TextArea */}
      <ElementDemo
        id="element-textarea"
        title={t('element.textarea.title')}
        description={t('element.textarea.description')}
      >
        <div className="space-y-4 max-w-md">
          <div>
            <Label htmlFor="textarea-default">Default TextArea</Label>
            <Textarea id="textarea-default" placeholder="Type your message here..." />
          </div>
          <div>
            <Label htmlFor="textarea-rows">TextArea with custom rows</Label>
            <Textarea id="textarea-rows" placeholder="More space..." rows={6} />
          </div>
        </div>
      </ElementDemo>

      {/* Select */}
      <ElementDemo
        id="element-select"
        title={t('element.select.title')}
        description={t('element.select.description')}
      >
        <div className="max-w-md">
          <Label htmlFor="select-demo">Select an option</Label>
          <Select>
            <SelectTrigger id="select-demo">
              <SelectValue placeholder="Choose an option" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="option1">Option 1</SelectItem>
              <SelectItem value="option2">Option 2</SelectItem>
              <SelectItem value="option3">Option 3</SelectItem>
              <SelectItem value="option4">Option 4</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </ElementDemo>

      {/* Checkbox */}
      <ElementDemo
        id="element-checkbox"
        title={t('element.checkbox.title')}
        description={t('element.checkbox.description')}
      >
        <div className="space-y-3">
          <div className="flex items-center space-x-2">
            <Checkbox id="checkbox-1" />
            <Label htmlFor="checkbox-1">Accept terms and conditions</Label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox id="checkbox-2" defaultChecked />
            <Label htmlFor="checkbox-2">Checked by default</Label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox id="checkbox-3" disabled />
            <Label htmlFor="checkbox-3">Disabled checkbox</Label>
          </div>
        </div>
      </ElementDemo>

      {/* Radio */}
      <ElementDemo
        id="element-radio"
        title={t('element.radio.title')}
        description={t('element.radio.description')}
      >
        <RadioGroup defaultValue="option1">
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="option1" id="radio-1" />
            <Label htmlFor="radio-1">Option 1</Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="option2" id="radio-2" />
            <Label htmlFor="radio-2">Option 2</Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="option3" id="radio-3" />
            <Label htmlFor="radio-3">Option 3</Label>
          </div>
        </RadioGroup>
      </ElementDemo>

      {/* Switch */}
      <ElementDemo
        id="element-switch"
        title={t('element.switch.title')}
        description={t('element.switch.description')}
      >
        <div className="space-y-3">
          <div className="flex items-center space-x-2">
            <Switch id="switch-1" />
            <Label htmlFor="switch-1">Enable notifications</Label>
          </div>
          <div className="flex items-center space-x-2">
            <Switch id="switch-2" defaultChecked />
            <Label htmlFor="switch-2">Enabled by default</Label>
          </div>
          <div className="flex items-center space-x-2">
            <Switch id="switch-3" disabled />
            <Label htmlFor="switch-3">Disabled switch</Label>
          </div>
        </div>
      </ElementDemo>

      {/* DatePicker */}
      <ElementDemo
        id="element-date_picker"
        title={t('element.date_picker.title')}
        description={t('element.date_picker.description')}
      >
        <div className="max-w-md">
          <Label htmlFor="date-picker">Select a date</Label>
          <DatePicker date={date} onDateChange={setDate}>
            <DatePickerTrigger id="date-picker">
              <DatePickerInput placeholder="Pick a date" />
            </DatePickerTrigger>
            <DatePickerContent align="start" />
          </DatePicker>
          {date && (
            <p className="mt-2 text-sm text-muted-foreground">
              Selected: {date.toLocaleDateString()}
            </p>
          )}
        </div>
      </ElementDemo>

      {/* FileUpload */}
      <ElementDemo
        id="element-file_upload"
        title={t('element.file_upload.title')}
        description={t('element.file_upload.description')}
      >
        <div className="max-w-md">
          <Label htmlFor="file-upload">Choose a file</Label>
          <Input id="file-upload" type="file" />
          <p className="mt-2 text-xs text-muted-foreground">
            Note: UIKit uses native file input. Custom file upload components can be built on top.
          </p>
        </div>
      </ElementDemo>

      {/* Slider */}
      <ElementDemo
        id="element-slider"
        title={t('element.slider.title')}
        description={t('element.slider.description')}
      >
        <div className="space-y-4 max-w-md">
          <div>
            <Label htmlFor="slider-default">Default Slider</Label>
            <Slider
              id="slider-default"
              value={sliderValue}
              onValueChange={setSliderValue}
              max={100}
              step={1}
              className="mt-2"
            />
            <p className="mt-2 text-sm text-muted-foreground">Value: {sliderValue[0]}</p>
          </div>
        </div>
      </ElementDemo>

      {/* Rating */}
      <ElementDemo
        id="element-rating"
        title={t('element.rating.title')}
        description={t('element.rating.description')}
      >
        <div className="text-sm text-muted-foreground">
          <p>Rating component is not exported from UIKit.</p>
          <p className="mt-2">
            Star ratings can be implemented using Button or custom components with star icons.
          </p>
        </div>
      </ElementDemo>
    </div>
  );
};

FormElements.displayName = 'FormElements';
