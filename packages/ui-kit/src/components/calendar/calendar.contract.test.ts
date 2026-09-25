// Conformance for the two contracts of the calendar directory: Calendar and
// CalendarDayButton, the day button Calendar renders through its
// `components.DayButton` slot. The two form no family - the day button is a
// render slot of the wrapped library, not a child of Calendar - so this file
// checks each one's own shape and the one relation between them the
// contracts state: where the day button is mounted.
import Ajv2020 from 'ajv/dist/2020';
import { describe, expect, it } from 'vitest';

import {
  addContractTypes,
  buildComponentType,
  findUntypedPropMismatches,
  liftPropsSchema,
} from '../../../scripts/contracts/compile';
import { bareGtsId, elementTypeRef } from '../../../scripts/contracts/ids';
import {
  applyContractTestTimeout,
  assertContractFreshness,
  compileUnits,
  unitStore,
  validateContractInstance,
} from '../../../scripts/contracts/testing';

// Must run before any describe()/it() in the file; see
// applyContractTestTimeout's own comment in testing.ts.
applyContractTestTimeout();

const DIRECTORY = 'calendar';
const DAY_BUTTON = 'calendar-day-button';
const ALL_STEMS = [DIRECTORY, DAY_BUTTON] as const;

for (const stem of ALL_STEMS) assertContractFreshness(DIRECTORY, stem);

// The library renders Calendar's root itself and forwards only the
// attributes it names, so Calendar names no surface; the day button does.
const units = compileUnits(DIRECTORY, ALL_STEMS, { allowNoHostElement: true });
const componentType = buildComponentType();

describe('calendar directory: component type validity', () => {
  it('both contracts validate against the component type', () => {
    const ajv = new Ajv2020();
    addContractTypes(ajv);
    const validate = ajv.compile(componentType);
    for (const { stem, contract } of Object.values(units)) {
      expect(validate(JSON.parse(JSON.stringify(contract))), `${stem}: ${ajv.errorsText(validate.errors)}`).toBe(true);
    }
  });

  it('each one lifts a props type named after itself', () => {
    for (const { stem, contract } of Object.values(units)) {
      expect(liftPropsSchema(contract).$id, stem).toContain(`props.${stem.replace(/-/g, '_')}.v`);
    }
  });
});

describe('calendar directory: what nests where', () => {
  it('belongs to no family - the day button is a render slot, not a child', () => {
    for (const stem of ALL_STEMS) expect(units[stem].contract.family_membership, stem).toBeUndefined();
  });

  it('Calendar takes no children and names no mount point', () => {
    expect(units[DIRECTORY].contract.accepts).toEqual({ content: 'nothing' });
    expect(units[DIRECTORY].contract.mounted_in).toBeUndefined();
  });

  it("the day button takes the day's text and states its one mount point, a replacement DayButton, without a component ref", () => {
    const dayButton = units[DAY_BUTTON].contract;
    expect(dayButton.accepts).toEqual({ content: 'specified', text: true });
    expect(dayButton.mounted_in).toHaveLength(1);
    expect(dayButton.mounted_in?.[0].container).toContain('DayButton');
    expect(dayButton.mounted_in?.[0].component).toBeUndefined();
  });
});

describe('calendar directory: what the schema cannot assert', () => {
  it('every prop the schema leaves open carries a prop statement, and no fully typed prop does', () => {
    for (const { stem, contract } of Object.values(units)) {
      expect(findUntypedPropMismatches(contract), stem).toEqual([]);
    }
  });

  it("the mode union's selection props carry prop statements emitted into their descriptions", () => {
    const calendar = units[DIRECTORY].contract;
    for (const prop of ['selected', 'onSelect', 'disabled', 'month', 'defaultMonth', 'components', 'classNames', 'locale']) {
      const statement = calendar.prop_statements?.[prop];
      expect(statement, prop).toBeDefined();
      expect(calendar.props.properties[prop].description, prop).toContain(statement?.states);
    }
  });

  it('mode and captionLayout are typed enums, and a branch-only prop is optional', () => {
    const calendar = units[DIRECTORY].contract;
    expect(calendar.props.properties.mode).toEqual({ type: 'string', enum: ['multiple', 'range', 'single'] });
    expect(calendar.props.properties.captionLayout.enum).toEqual(['dropdown', 'dropdown-months', 'dropdown-years', 'label']);
    expect(calendar.props.required ?? []).not.toContain('selected');
    expect(calendar.props.properties.excludeDisabled.description).toContain('Declared only by');
  });

  it("the day button requires the slot's day and modifiers", () => {
    expect(units[DAY_BUTTON].contract.props.required).toEqual(['day', 'modifiers']);
  });

  it("Calendar's unexposed_parts name the kit's chevron and week number slots", () => {
    const parts = (units[DIRECTORY].contract.unexposed_parts ?? []).map((entry) => entry.part);
    expect(parts).toEqual(['the chevron', 'the week number cell']);
  });
});

describe('calendar directory in a GTS store', () => {
  it('both components validate as an instance of the component type', () => {
    const gts = unitStore(Object.values(units));
    for (const { stem, contract } of Object.values(units)) {
      const result = gts.validateInstance(contract.$id);
      expect(result.ok, `${stem}: ${result.error}`).toBe(true);
    }
  });

  it('the day button names the button surface and Calendar none', () => {
    const dayButton = units[DAY_BUTTON];
    expect(dayButton.elementSurface).toBeDefined();
    expect(dayButton.contract.forwards_to).toBe(bareGtsId(String(dayButton.elementSurface?.$id)));
    expect(dayButton.contract.forwards_to).toBe(elementTypeRef('dom_button'));
    expect(units[DIRECTORY].elementKind).toBeUndefined();
    expect(units[DIRECTORY].contract.forwards_to).toBeUndefined();
  });

  it('fails when the component type is not registered - negative control', () => {
    const gts = unitStore(Object.values(units), { componentType: false, vocabulary: false });
    const result = gts.validateInstance(units[DIRECTORY].contract.$id);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Schema not found');
  });

  it('both components validate as an instance of the committed component type', () => {
    for (const { stem, contract } of Object.values(units)) {
      const result = validateContractInstance(contract);
      expect(result.ok, `${stem}: ${result.error}`).toBe(true);
    }
  });

  it('rejects Calendar when it carries an unknown key - negative control', () => {
    const calendar = units[DIRECTORY].contract;
    const corrupted = { ...calendar, bogus_field: true } as typeof calendar;
    const result = validateContractInstance(corrupted);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/additional propert/i);
  });
});
