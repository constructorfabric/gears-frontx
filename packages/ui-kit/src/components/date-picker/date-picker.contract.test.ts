// Conformance for the one DatePicker contract. DatePicker renders no element
// of its own (it composes Popover, Calendar, Button and Input) and its props
// type is a union of a single-mode and a range-mode shape, so the
// interesting assertions here are about what that union leaves to the
// overlay: which properties the extraction keeps, and which of them carry a
// prop statement because the schema cannot state their type.
import Ajv2020 from 'ajv/dist/2020';
import { describe, expect, it } from 'vitest';

import { addContractTypes, buildComponentType, liftPropsSchema } from '../../../scripts/contracts/compile';
import {
  applyContractTestTimeout,
  assertContractFreshness,
  compileUnit,
  resolveComponentRef,
  unitStore,
  validateContractInstance,
} from '../../../scripts/contracts/testing';

// Must run before any describe()/it() in the file; see
// applyContractTestTimeout's own comment in testing.ts.
applyContractTestTimeout();

const DIRECTORY = 'date-picker';

assertContractFreshness(DIRECTORY);

// DatePicker renders no element of its own, so it names no surface.
const unit = compileUnit(DIRECTORY, DIRECTORY, { allowNoHostElement: true });
const { contract } = unit;
const componentType = buildComponentType();

describe('date-picker: component type validity', () => {
  it('validates against the component type', () => {
    const ajv = new Ajv2020();
    addContractTypes(ajv);
    const validate = ajv.compile(componentType);
    expect(validate(JSON.parse(JSON.stringify(contract))), ajv.errorsText(validate.errors)).toBe(true);
  });

  it('lifts a props type named after itself', () => {
    expect(liftPropsSchema(contract).$id).toContain('props.date_picker.v');
  });
});

describe('date-picker: host and nesting', () => {
  it('renders no element of its own, so it names no element surface', () => {
    expect(unit.elementKind).toBeUndefined();
    expect(contract.forwards_to).toBeUndefined();
  });

  it('accepts no content and belongs to no family', () => {
    expect(contract.accepts).toEqual({ content: 'nothing' });
    expect(contract.family_membership).toBeUndefined();
  });

  it('every kit component named in dont_use_when is a real kit directory', () => {
    const refs = contract.dont_use_when.map((entry) => entry.instead.component).filter((r): r is string => r !== undefined);
    expect(refs.length).toBeGreaterThan(0);
    for (const ref of refs) {
      expect(() => resolveComponentRef(ref), ref).not.toThrow();
    }
  });

  it('lists the kit components it composes as unexposed parts', () => {
    const parts = (contract.unexposed_parts ?? []).map((entry) => entry.part);
    expect(parts).toEqual(['Popover', 'PopoverTrigger', 'PopoverContent', 'Calendar', 'Button', 'Input']);
  });
});

describe('date-picker: what the single/range union leaves to the overlay', () => {
  it('reads the union heritage with nothing left unclassified', () => {
    expect(contract['x-uikit'].cannot_extract).toEqual([]);
  });

  it('keeps the properties one mode declares as optional, typed, statement-free branch props', () => {
    const properties = contract.props.properties;
    expect(Object.keys(properties)).toContain('mode');
    expect(properties.variant).toEqual({
      type: 'string',
      enum: ['button', 'input'],
      description: 'Declared only by DatePickerSingleProps of the props union; absent from the others.',
    });
    expect(properties.numberOfMonths).toEqual({
      type: 'number',
      description: 'Declared only by DatePickerRangeProps of the props union; absent from the others.',
    });
    expect(contract.props.required).not.toContain('variant');
    expect(contract.props.required).not.toContain('numberOfMonths');
    expect(Object.keys(contract.prop_statements ?? {})).not.toContain('variant');
    expect(Object.keys(contract.prop_statements ?? {})).not.toContain('numberOfMonths');
  });

  it('types mode as the two-value discriminant, with no prop statement', () => {
    expect(contract.props.properties.mode).toEqual({ type: 'string', enum: ['range', 'single'] });
    expect(Object.keys(contract.prop_statements ?? {})).not.toContain('mode');
  });

  it('requires selected and onSelect, the pair both modes declare as required', () => {
    expect([...contract.props.required].sort()).toEqual(['onSelect', 'selected']);
  });

  it('carries a prop statement for exactly the partially typed properties, emitted into their descriptions', () => {
    const statements = contract.prop_statements ?? {};
    const partial = Object.keys(contract['x-uikit'].partially_typed_props).sort();
    expect(partial).toEqual(['container', 'disabled', 'locale', 'onOpenChange', 'onSelect', 'selected']);
    expect(Object.keys(statements).sort()).toEqual(partial);
    for (const prop of partial) {
      expect(contract.props.properties[prop].description, prop).toContain(statements[prop].states);
    }
  });

  it('types the open state and the plain strings, with no prop statement', () => {
    for (const prop of ['open', 'defaultOpen', 'closeOnSelect']) {
      expect(contract.props.properties[prop], prop).toEqual({ type: 'boolean' });
    }
    for (const prop of ['placeholder', 'openCalendarLabel', 'id', 'className', 'aria-label']) {
      expect(contract.props.properties[prop], prop).toEqual({ type: 'string' });
    }
    expect(contract.props.properties.captionLayout).toEqual({
      type: 'string',
      enum: ['dropdown', 'dropdown-months', 'dropdown-years', 'label'],
    });
  });
});

describe('date-picker in a GTS store', () => {
  it('validates as an instance of the component type', () => {
    const gts = unitStore([unit]);
    const result = gts.validateInstance(contract.$id);
    expect(result.ok, result.error).toBe(true);
  });

  it('fails when the component type is not registered - negative control', () => {
    const gts = unitStore([unit], { componentType: false, vocabulary: false });
    const result = gts.validateInstance(contract.$id);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Schema not found');
  });

  it('validates as an instance of the committed component type', () => {
    const result = validateContractInstance(contract);
    expect(result.ok, result.error).toBe(true);
  });

  it('rejects the contract when it carries an unknown key - negative control', () => {
    const corrupted = { ...contract, bogus_field: true } as typeof contract;
    const result = validateContractInstance(corrupted);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/additional propert/i);
  });
});
