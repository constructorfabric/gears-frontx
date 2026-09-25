// Conformance for all ten Field contracts (the root and its nine parts) -
// one file because the interesting assertions are about how the ten relate
// (family membership, composition refs), not about any one of them in
// isolation. See card.contract.test.ts for the multi-level family shape
// this follows. Unlike Card, the nesting here is a graph rather than a
// tree: FieldGroup and FieldSet each host the other and both host Field,
// Field and FieldContent share the caption parts, and Field also hosts the
// kit's form controls, which belong to no part of this family.
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

const DIRECTORY = 'field';
const PART_STEMS = [
  'field-set',
  'field-legend',
  'field-group',
  'field-content',
  'field-label',
  'field-title',
  'field-description',
  'field-separator',
  'field-error',
] as const;
const ALL_STEMS = [DIRECTORY, ...PART_STEMS] as const;

for (const stem of ALL_STEMS) assertContractFreshness(DIRECTORY, stem);

const units = compileUnits(DIRECTORY, ALL_STEMS);
const componentType = buildComponentType();

const ref = (stem: string) => componentRef(stem, contractMajor(DIRECTORY, stem));
// A component in another directory, at the major its own contract ships.
const kitRef = (directory: string) => componentRef(directory, contractMajor(directory, directory));
const ROOT_REF = ref(DIRECTORY);

// What each container of the family hosts, family members only.
const HOSTS: Record<string, readonly string[]> = {
  field: ['field-label', 'field-content', 'field-description', 'field-error'],
  'field-set': ['field-legend', 'field-description', 'field-group', 'field'],
  'field-group': ['field', 'field-set', 'field-separator'],
  'field-content': ['field-label', 'field-title', 'field-description', 'field-error'],
};
// The kit form controls Field hosts beside its own parts - the references
// that leave the family, on the root only.
const CONTROLS = [
  'input',
  'textarea',
  'input-group',
  'native-select',
  'select',
  'combobox',
  'checkbox',
  'switch',
  'radio-group',
  'slider',
  'input-otp',
  'date-picker',
] as const;
const TEXT_LEAVES = ['field-legend', 'field-label', 'field-title', 'field-description', 'field-separator', 'field-error'] as const;
const OUTSIDE_CONTAINER = "the consuming application's own form or section element";

describe('field family: component type validity', () => {
  it('all ten contracts validate against the component type', () => {
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

describe('field family: membership resolves', () => {
  it('the root names the family, calls itself root, and carries all nine parts', () => {
    const root = units[DIRECTORY].contract.family_membership;
    expect(root?.name).toBe('field');
    expect(root?.role).toBe('root');
    expect(root?.members).toEqual(PART_STEMS.map(ref).sort());
  });

  it('every part names the same family, calls itself a part, and lists no members', () => {
    for (const stem of PART_STEMS) {
      const membership = units[stem].contract.family_membership;
      expect(membership?.name, stem).toBe('field');
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

  it('the root is the only member the roster calls a root', () => {
    const roster = familyRoster('field');
    expect(roster.root).toBe(ROOT_REF);
    expect(roster.parts).toEqual(PART_STEMS.map(ref).sort());
  });
});

describe('field family: what nests where', () => {
  it('Field accepts its caption parts and the kit form controls, and nothing else', () => {
    expect(units[DIRECTORY].contract.accepts).toEqual({
      content: 'specified',
      components: [...HOSTS.field.map(ref), ...CONTROLS.map(kitRef)],
    });
  });

  it('FieldSet, FieldGroup and FieldContent accept only family members', () => {
    for (const stem of ['field-set', 'field-group', 'field-content']) {
      expect(units[stem].contract.accepts, stem).toEqual({ content: 'specified', components: HOSTS[stem].map(ref) });
    }
  });

  it('the text parts take text and nothing else', () => {
    for (const stem of TEXT_LEAVES) {
      expect(units[stem].contract.accepts, stem).toEqual({ content: 'specified', text: true });
    }
  });

  it("every member's kit mount points are FILLED from exactly the containers that accept it", () => {
    // Nothing in any overlay writes a kit mount point: each one is derived
    // from an `accepts` list, so the two directions cannot disagree. The
    // expected set is computed from HOSTS, the authored side.
    for (const stem of ALL_STEMS) {
      const expected = Object.entries(HOSTS)
        .filter(([, hosted]) => hosted.includes(stem))
        .map(([container]) => ref(container))
        .sort();
      const filled = (units[stem].contract.mounted_in ?? [])
        .map((entry) => entry.component)
        .filter((mount): mount is string => mount !== undefined)
        .sort();
      expect(filled, stem).toEqual(expected);
    }
  });

  it('names a filled mount point by the container it is', () => {
    const mounts = units['field-legend'].contract.mounted_in;
    expect(mounts).toEqual([{ container: pascalCase('field-set'), component: ref('field-set') }]);
  });

  it('states the application form as the outside mount point of Field, FieldSet and FieldGroup only', () => {
    for (const stem of ALL_STEMS) {
      const outside = (units[stem].contract.mounted_in ?? []).filter((entry) => entry.component === undefined);
      const expected = stem === DIRECTORY || stem === 'field-set' || stem === 'field-group' ? [OUTSIDE_CONTAINER] : [];
      expect(
        outside.map((entry) => entry.container),
        stem,
      ).toEqual(expected);
    }
  });

  it('every nesting reference among the parts points inside the family', () => {
    // The root's controls are the one reference set that leaves the family
    // on purpose (see the Field accepts test above).
    const familyRefs = new Set(Object.values(units).map(({ contract }) => bareGtsId(String(contract.$id))));
    for (const stem of PART_STEMS) {
      const mounts = (units[stem].contract.mounted_in ?? [])
        .map((entry) => entry.component)
        .filter((mount): mount is string => mount !== undefined);
      for (const target of [...(units[stem].contract.accepts.components ?? []), ...mounts]) {
        expect(familyRefs.has(target), `${stem}: it names "${target}", which is not a member of this family`).toBe(true);
      }
    }
  });
});

describe('field family: props the code owns', () => {
  it('carries `orientation` on Field only and `variant` on FieldLegend only', () => {
    for (const stem of ALL_STEMS) {
      const properties = Object.keys(units[stem].contract.props.properties);
      expect(properties.includes('orientation'), `${stem}.orientation`).toBe(stem === DIRECTORY);
      expect(properties.includes('variant'), `${stem}.variant`).toBe(stem === 'field-legend');
    }
  });

  it("states what the schema cannot say about FieldError's errors and FieldSeparator's children", () => {
    for (const [stem, prop] of [
      ['field-error', 'errors'],
      ['field-separator', 'children'],
    ] as const) {
      const statement = units[stem].contract.prop_statements?.[prop];
      expect(statement, `${stem}.${prop}`).toBeDefined();
      expect(units[stem].contract.props.properties[prop].description, `${stem}.${prop}`).toContain(statement?.states);
    }
  });
});

describe('field family in a GTS store', () => {
  it('all ten components validate as an instance of the component type', () => {
    const gts = unitStore(Object.values(units));
    for (const { stem, contract } of Object.values(units)) {
      const result = gts.validateInstance(contract.$id);
      expect(result.ok, `${stem}: ${result.error}`).toBe(true);
    }
  });

  it('every member names the surface of the element it renders', () => {
    const hosts: Record<string, string> = {
      'field-set': 'dom_fieldset',
      'field-legend': 'dom_legend',
      'field-label': 'dom_label',
      'field-description': 'dom_p',
    };
    for (const { stem, contract, elementSurface } of Object.values(units)) {
      expect(contract.forwards_to, stem).toBe(bareGtsId(String(elementSurface.$id)));
      expect(contract.forwards_to, stem).toBe(elementTypeRef(hosts[stem] ?? 'dom_div'));
    }
  });

  it('fails when the component type is not registered - negative control', () => {
    const gts = unitStore(Object.values(units), { componentType: false, vocabulary: false });
    const result = gts.validateInstance(units[DIRECTORY].contract.$id);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Schema not found');
  });

  it('all ten components validate as an instance of the committed component type', () => {
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
