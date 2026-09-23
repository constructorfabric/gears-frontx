// Conformance for the InputGroup family contracts: the root and the parts it
// frames (InputGroupAddon, InputGroupButton, InputGroupText, InputGroupInput,
// InputGroupTextarea). One file because the interesting assertions are about
// how they relate (family membership, what nests where); the per-component
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

const DIRECTORY = 'input-group';
const PART_STEMS = [
  'input-group-addon',
  'input-group-button',
  'input-group-text',
  'input-group-input',
  'input-group-textarea',
] as const;
const ALL_STEMS = [DIRECTORY, ...PART_STEMS] as const;

for (const stem of ALL_STEMS) assertContractFreshness(DIRECTORY, stem);

const units = compileUnits(DIRECTORY, ALL_STEMS);
const componentType = buildComponentType();
const ref = (stem: string) => componentRef(stem, contractMajor(DIRECTORY, stem));
const KBD_REF = componentRef('kbd', contractMajor('kbd', 'kbd'));

describe('input-group family: component type validity', () => {
  it('every contract validates against the component type', () => {
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

describe('input-group family: membership resolves', () => {
  it('the root names the family, calls itself root, and carries every described part', () => {
    const root = units[DIRECTORY].contract.family_membership;
    expect(root?.name).toBe('input_group');
    expect(root?.role).toBe('root');
    expect(root?.members).toEqual(PART_STEMS.map(ref).sort());
  });

  it('every part names the same family, calls itself a part, and lists no members', () => {
    for (const stem of PART_STEMS) {
      const membership = units[stem].contract.family_membership;
      expect(membership?.name, stem).toBe('input_group');
      expect(membership?.role, stem).toBe('part');
      expect(membership?.members, stem).toBeUndefined();
    }
  });

  it('every member the root carries ships a compiled contract of its own', () => {
    for (const member of units[DIRECTORY].contract.family_membership?.members ?? []) {
      const target = resolveComponentRef(member);
      expect(target.contractId, `${member}: ${target.stem} ships no compiled contract`).toBe(member);
    }
  });

  it('the roster agrees from the outside', () => {
    const roster = familyRoster('input_group');
    expect(roster.root).toBe(ref(DIRECTORY));
    expect(roster.parts).toEqual(PART_STEMS.map(ref).sort());
  });
});

describe('input-group family: what nests where', () => {
  it('the root frames addons and exactly one kind of field part', () => {
    expect(units[DIRECTORY].contract.accepts).toEqual({
      content: 'specified',
      components: [ref('input-group-addon'), ref('input-group-input'), ref('input-group-textarea')],
    });
  });

  it('the addon holds text, the text and button parts, and a Kbd hint', () => {
    expect(units['input-group-addon'].contract.accepts).toEqual({
      content: 'specified',
      text: true,
      components: [ref('input-group-button'), ref('input-group-text'), KBD_REF],
    });
  });

  it('the field parts take no content', () => {
    for (const stem of ['input-group-input', 'input-group-textarea'] as const) {
      expect(units[stem].contract.accepts, stem).toEqual({ content: 'nothing' });
    }
  });

  it("each part's mount point is FILLED from the contract that accepts it", () => {
    const host = (stem: string) => [{ container: pascalCase(stem), component: ref(stem) }];
    expect(units['input-group-addon'].contract.mounted_in).toEqual(host(DIRECTORY));
    expect(units['input-group-input'].contract.mounted_in).toEqual(host(DIRECTORY));
    expect(units['input-group-textarea'].contract.mounted_in).toEqual(host(DIRECTORY));
    expect(units['input-group-text'].contract.mounted_in).toEqual(host('input-group-addon'));
    expect(units['input-group-button'].contract.mounted_in).toEqual(host('input-group-addon'));
  });

  it('every part mounts only inside the family', () => {
    const familyRefs = new Set(Object.values(units).map(({ contract }) => bareGtsId(String(contract.$id))));
    for (const stem of PART_STEMS) {
      for (const entry of units[stem].contract.mounted_in ?? []) {
        expect(familyRefs.has(String(entry.component)), `${stem} mounts in ${entry.component}`).toBe(true);
      }
    }
  });
});

describe('input-group family: what the schema cannot assert', () => {
  it('only the input and button parts carry prop statements, for the props Input and Button bring with them', () => {
    expect(Object.keys(units['input-group-input'].contract.prop_statements ?? {}).sort()).toEqual(
      ['defaultValue', 'end', 'icon', 'onValueChange', 'render', 'style', 'value'].sort(),
    );
    expect(Object.keys(units['input-group-button'].contract.prop_statements ?? {}).sort()).toEqual(['icon', 'render', 'style']);
    for (const stem of [DIRECTORY, 'input-group-addon', 'input-group-text', 'input-group-textarea'] as const) {
      expect(units[stem].contract.prop_statements, stem).toBeUndefined();
    }
  });

  it('the root and the addon carry their cva axes, nothing else of their own beyond className', () => {
    expect(Object.keys(units[DIRECTORY].contract.props.properties).sort()).toEqual(['className', 'size']);
    expect(Object.keys(units['input-group-addon'].contract.props.properties).sort()).toEqual(['align', 'className']);
  });

  it("the button part carries its own narrowed size and its own defaults, not Button's", () => {
    // InputGroupButtonProps omits Button's `size` and `type` and redeclares
    // them; the component then defaults `variant`, `size` and `type` in its
    // own parameter list. Button's own axis values and defaults must not
    // leak through the Omit.
    const properties = units['input-group-button'].contract.props.properties;
    expect(properties.size).toEqual({ type: 'string', enum: ['sm', 'xs'], default: 'xs' });
    expect(properties.variant?.default).toBe('ghost');
    expect(properties.type?.default).toBe('button');
  });
});

describe('input-group family in a GTS store', () => {
  it('every component validates as an instance of the component type', () => {
    const gts = unitStore(Object.values(units));
    for (const { stem, contract } of Object.values(units)) {
      const result = gts.validateInstance(contract.$id);
      expect(result.ok, `${stem}: ${result.error}`).toBe(true);
    }
  });

  it('each one names the surface of the element it renders', () => {
    for (const { stem, contract, elementSurface } of Object.values(units)) {
      expect(contract.forwards_to, stem).toBe(bareGtsId(String(elementSurface.$id)));
    }
    expect(units[DIRECTORY].contract.forwards_to).toBe(elementTypeRef('dom_div'));
    expect(units['input-group-addon'].contract.forwards_to).toBe(elementTypeRef('dom_div'));
    expect(units['input-group-button'].contract.forwards_to).toBe(elementTypeRef('dom_button'));
    expect(units['input-group-text'].contract.forwards_to).toBe(elementTypeRef('dom_span'));
    expect(units['input-group-input'].contract.forwards_to).toBe(elementTypeRef('dom_input'));
    expect(units['input-group-textarea'].contract.forwards_to).toBe(elementTypeRef('dom_textarea'));
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
});
