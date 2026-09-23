// Conformance for the eighteen contracts of the questionnaire directory: the
// Questionnaire family (root and seventeen parts). One file because the
// interesting assertions are about how the parts relate; the per-component
// shape comes from testing.ts's assertContractFreshness.
import Ajv2020 from 'ajv/dist/2020';
import { describe, expect, it } from 'vitest';

import {
  addContractTypes,
  buildComponentType,
  contractMajor,
  familyRoster,
  liftPropsSchema,
  pascalCase,
} from '../../../scripts/contracts/compile';
import { bareGtsId, componentRef, elementTypeRef } from '../../../scripts/contracts/ids';
import {
  applyContractTestTimeout,
  assertContractFreshness,
  compileUnits,
  resolveComponentRef,
  unitStore,
  validateContractInstance,
} from '../../../scripts/contracts/testing';

// Must run before any describe()/it() in the file; see
// applyContractTestTimeout's own comment in testing.ts.
applyContractTestTimeout();

const DIRECTORY = 'questionnaire';
const FAMILY = 'questionnaire';
const NAV_STEMS = ['questionnaire-previous', 'questionnaire-skip', 'questionnaire-next', 'questionnaire-submit'] as const;
// The three parts only a QuestionnaireChoice's context can host, and that
// QuestionnaireChoice already renders itself: nothing accepts them.
const CHOICE_INTERNALS = ['questionnaire-choice-input', 'questionnaire-choice-label', 'questionnaire-choice-shortcut'] as const;
const PART_STEMS = [
  'questionnaire-progress',
  'questionnaire-item',
  'questionnaire-title',
  'questionnaire-description',
  'questionnaire-choices',
  ...CHOICE_INTERNALS,
  'questionnaire-choice',
  'questionnaire-choice-description',
  'questionnaire-input',
  'questionnaire-error',
  'questionnaire-actions',
  ...NAV_STEMS,
] as const;
const ALL_STEMS = [DIRECTORY, ...PART_STEMS] as const;

for (const stem of ALL_STEMS) assertContractFreshness(DIRECTORY, stem);

const units = compileUnits(DIRECTORY, ALL_STEMS);
const componentType = buildComponentType();
const ref = (stem: string) => componentRef(stem, contractMajor(DIRECTORY, stem));
const mountedIn = (stem: string) => (units[stem].contract.mounted_in ?? []).map((entry) => entry.component).sort();

describe('questionnaire directory: component type validity', () => {
  it('every one of the eighteen validates against the component type', () => {
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

describe('questionnaire family: membership resolves', () => {
  it('the root names the family, calls itself root, and carries every part', () => {
    const root = units[DIRECTORY].contract.family_membership;
    expect(root?.name).toBe(FAMILY);
    expect(root?.role).toBe('root');
    expect(root?.members).toEqual(PART_STEMS.map(ref).sort());
  });

  it('every part names the same family, calls itself a part, and lists no members', () => {
    for (const stem of PART_STEMS) {
      const membership = units[stem].contract.family_membership;
      expect(membership?.name, stem).toBe(FAMILY);
      expect(membership?.role, stem).toBe('part');
      expect(membership?.members, stem).toBeUndefined();
    }
  });

  it('every part the root carries ships a compiled contract of its own', () => {
    for (const member of units[DIRECTORY].contract.family_membership?.members ?? []) {
      const target = resolveComponentRef(member);
      expect(target.contractId, `${member}: ${target.stem} ships no compiled contract`).toBe(member);
    }
  });

  it('the roster has the root and the seventeen parts', () => {
    const roster = familyRoster(FAMILY);
    expect(roster.root).toBe(ref(DIRECTORY));
    expect(roster.parts).toEqual(PART_STEMS.map(ref).sort());
  });
});

describe('questionnaire family: what nests where', () => {
  it('the root accepts the progress, the items and the actions row', () => {
    expect(units[DIRECTORY].contract.accepts).toEqual({
      content: 'specified',
      components: ['questionnaire-progress', 'questionnaire-item', 'questionnaire-actions'].map(ref),
    });
  });

  it('an item accepts its title, description, choices, freeform field and error', () => {
    expect(units['questionnaire-item'].contract.accepts.components).toEqual(
      ['questionnaire-title', 'questionnaire-description', 'questionnaire-choices', 'questionnaire-input', 'questionnaire-error'].map(ref),
    );
  });

  it('the freeform field mounts in an item or as the last cell of the choices', () => {
    expect(mountedIn('questionnaire-input')).toEqual([ref('questionnaire-choices'), ref('questionnaire-item')].sort());
    expect(units['questionnaire-input'].contract.accepts).toEqual({ content: 'nothing' });
  });

  it('a choice takes text and its description, and the description mounts in the choice or its label', () => {
    expect(units['questionnaire-choice'].contract.accepts).toEqual({
      content: 'specified',
      text: true,
      components: [ref('questionnaire-choice-description')],
    });
    expect(mountedIn('questionnaire-choice')).toEqual([ref('questionnaire-choices')]);
    expect(mountedIn('questionnaire-choice-description')).toEqual(
      [ref('questionnaire-choice'), ref('questionnaire-choice-label')].sort(),
    );
  });

  it("the four navigation buttons mount in the actions row, and the actions row in the root", () => {
    expect(units['questionnaire-actions'].contract.accepts.components).toEqual(NAV_STEMS.map(ref));
    for (const stem of NAV_STEMS) {
      expect(units[stem].contract.mounted_in, stem).toEqual([
        { container: pascalCase('questionnaire-actions'), component: ref('questionnaire-actions') },
      ]);
    }
    expect(mountedIn('questionnaire-actions')).toEqual([ref(DIRECTORY)]);
  });

  it('the choice internals have no mount point - the choice renders its own', () => {
    for (const stem of CHOICE_INTERNALS) {
      expect(units[stem].contract.mounted_in, stem).toBeUndefined();
    }
  });

  it('gives the root no mount point at all - nothing in the kit mounts a Questionnaire', () => {
    expect(units[DIRECTORY].contract.mounted_in).toBeUndefined();
  });

  it('every nesting reference in the family points inside the family', () => {
    const familyRefs = new Set(ALL_STEMS.map((stem) => bareGtsId(String(units[stem].contract.$id))));
    for (const stem of ALL_STEMS) {
      const { contract } = units[stem];
      const mounts = (contract.mounted_in ?? []).map((entry) => entry.component).filter((r): r is string => r !== undefined);
      for (const nested of [...(contract.accepts.components ?? []), ...mounts]) {
        expect(familyRefs.has(nested), `${stem}: it names "${nested}", which is not a member of this family`).toBe(true);
      }
    }
  });
});

describe('questionnaire directory: what the schema cannot assert', () => {
  it("the root's item definitions and callback carry prop statements; its current item and shortcut mode are typed", () => {
    const root = units[DIRECTORY].contract;
    for (const prop of ['items', 'onItemChange']) {
      expect(Object.keys(root.prop_statements ?? {}), prop).toContain(prop);
      expect(root.props.properties[prop].description, prop).toContain(root.prop_statements?.[prop].states);
    }
    expect(root.props.properties.item).toEqual({ type: 'string' });
    expect(root.props.properties.defaultItem).toEqual({ type: 'string' });
    expect(root.props.properties.shortcuts).toEqual({ type: 'string', enum: ['letters', 'numbers'] });
  });

  it("the item's status callback carries a prop statement and its flags are typed", () => {
    const item = units['questionnaire-item'].contract;
    expect(Object.keys(item.prop_statements ?? {})).toEqual(['onStatusChange']);
    for (const prop of ['invalid', 'multiple', 'required']) {
      expect(item.props.properties[prop], prop).toEqual({ type: 'boolean' });
    }
    expect(item.props.required).toContain('name');
  });

  it("the choice's change callback carries a prop statement and its value is a required string", () => {
    const choice = units['questionnaire-choice'].contract;
    expect(Object.keys(choice.prop_statements ?? {}).sort()).toEqual(['onChange', 'render']);
    expect(choice.props.properties.value).toEqual({ type: 'string' });
    expect(choice.props.required).toContain('value');
  });

  it("the freeform field's type admits only single-line input types", () => {
    expect(units['questionnaire-input'].contract.props.properties.type).toEqual({
      type: 'string',
      enum: ['date', 'datetime-local', 'email', 'month', 'number', 'password', 'search', 'tel', 'text', 'time', 'url', 'week'],
    });
  });

  it('every part with a render prop states it, and the two plain elements have neither', () => {
    for (const stem of PART_STEMS) {
      const { contract } = units[stem];
      if ('render' in contract.props.properties) {
        expect(Object.keys(contract.prop_statements ?? {}), stem).toContain('render');
      }
    }
    for (const stem of ['questionnaire-actions', 'questionnaire-choice-description']) {
      expect(units[stem].contract.props.properties, stem).toEqual({});
      expect(units[stem].contract.prop_statements, stem).toBeUndefined();
    }
  });

  it('the navigation buttons carry the kit Button axes', () => {
    for (const stem of NAV_STEMS) {
      const { properties } = units[stem].contract.props;
      expect(properties.variant.enum, stem).toContain('outline');
      expect(properties.size.enum, stem).toEqual(['default', 'sm', 'lg']);
    }
  });

  it("the choice's unexposed_parts name its drawn indicator", () => {
    const parts = (units['questionnaire-choice'].contract.unexposed_parts ?? []).map((entry) => entry.part);
    expect(parts.some((part) => /indicator/.test(part))).toBe(true);
  });
});

describe('questionnaire directory in a GTS store', () => {
  it('every component validates as an instance of the component type', () => {
    const gts = unitStore(Object.values(units));
    for (const { stem, contract } of Object.values(units)) {
      const result = gts.validateInstance(contract.$id);
      expect(result.ok, `${stem}: ${result.error}`).toBe(true);
    }
  });

  it('each part names the surface of the element it renders', () => {
    for (const { stem, contract, elementSurface } of Object.values(units)) {
      expect(contract.forwards_to, stem).toBe(bareGtsId(String(elementSurface?.$id)));
    }
    const expected: Record<string, string> = {
      questionnaire: 'dom_form',
      'questionnaire-item': 'dom_fieldset',
      'questionnaire-title': 'dom_legend',
      'questionnaire-description': 'dom_p',
      'questionnaire-error': 'dom_p',
      'questionnaire-choice': 'dom_label',
      'questionnaire-choice-input': 'dom_input',
      'questionnaire-input': 'dom_input',
      'questionnaire-previous': 'dom_button',
      'questionnaire-next': 'dom_button',
    };
    for (const [stem, token] of Object.entries(expected)) {
      expect(units[stem].contract.forwards_to, stem).toBe(elementTypeRef(token));
    }
  });

  it('fails when the component type is not registered - negative control', () => {
    const gts = unitStore(Object.values(units), { componentType: false, vocabulary: false });
    const result = gts.validateInstance(units[DIRECTORY].contract.$id);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Schema not found');
  });

  it('every component validates as an instance of the committed component type', () => {
    for (const { stem, contract } of Object.values(units)) {
      const result = validateContractInstance(contract);
      expect(result.ok, `${stem}: ${result.error}`).toBe(true);
    }
  });

  it('rejects the root when it carries an unknown key - negative control', () => {
    const root = units[DIRECTORY].contract;
    const corrupted = { ...root, bogus_field: true } as typeof root;
    const result = validateContractInstance(corrupted);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/additional propert/i);
  });
});
