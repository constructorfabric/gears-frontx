// Conformance for the three ButtonGroup contracts (root, text, separator) -
// one file because the interesting assertions are about how the three relate
// (family membership, what nests where), not about any one in isolation. The per-component shape comes from testing.ts's
// assertContractFreshness.
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

const DIRECTORY = 'button-group';
const PART_STEMS = ['button-group-text', 'button-group-separator'] as const;
const ALL_STEMS = [DIRECTORY, ...PART_STEMS] as const;

for (const stem of ALL_STEMS) assertContractFreshness(DIRECTORY, stem);

const units = compileUnits(DIRECTORY, ALL_STEMS);
const componentType = buildComponentType();
const ref = (stem: string) => componentRef(stem, contractMajor(DIRECTORY, stem));
// Button sits outside the family: the root joins it, at Button's own major.
const BUTTON_REF = componentRef('button', contractMajor('button', 'button'));
// Input and the Select root sit outside the family too; the root joins them.
const INPUT_REF = componentRef('input', contractMajor('input', 'input'));
const SELECT_REF = componentRef('select', contractMajor('select', 'select'));
const OUTSIDE_REFS = new Set([BUTTON_REF, INPUT_REF, SELECT_REF]);

describe('button-group family: component type validity', () => {
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

describe('button-group family: membership resolves', () => {
  it('the root names the family, calls itself root, and carries every part', () => {
    const root = units[DIRECTORY].contract.family_membership;
    expect(root?.name).toBe('button_group');
    expect(root?.role).toBe('root');
    expect(root?.members).toEqual(PART_STEMS.map(ref).sort());
  });

  it('every part names the same family, calls itself a part, and lists no members', () => {
    for (const stem of PART_STEMS) {
      const membership = units[stem].contract.family_membership;
      expect(membership?.name, stem).toBe('button_group');
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
    const roster = familyRoster('button_group');
    expect(roster.root).toBe(ref(DIRECTORY));
    expect(roster.parts).toEqual(PART_STEMS.map(ref).sort());
  });
});

describe('button-group family: what nests where', () => {
  it('the root accepts Button, Input, the Select root and its own two parts, and no bare text', () => {
    expect(units[DIRECTORY].contract.accepts).toEqual({
      content: 'specified',
      components: [BUTTON_REF, INPUT_REF, SELECT_REF, ref('button-group-text'), ref('button-group-separator')],
    });
  });

  it('the text segment takes text and the separator takes nothing', () => {
    expect(units['button-group-text'].contract.accepts).toEqual({ content: 'specified', text: true });
    expect(units['button-group-separator'].contract.accepts).toEqual({ content: 'nothing' });
  });

  it('every part mount point is FILLED from the root that accepts it', () => {
    for (const stem of PART_STEMS) {
      expect(units[stem].contract.mounted_in, stem).toEqual([{ container: pascalCase(DIRECTORY), component: ref(DIRECTORY) }]);
    }
  });

  it("fills the mount points of Button, Input and Select with the root, from the root's accepts", () => {
    for (const stem of ['button', 'input', 'select']) {
      // The Select root renders no element of its own (Base UI's Select.Root
      // only provides context), so it names no surface.
      const contract = compileUnits(stem, [stem], { allowNoHostElement: true })[stem].contract;
      expect(contract.mounted_in ?? [], stem).toContainEqual({ container: pascalCase(DIRECTORY), component: ref(DIRECTORY) });
    }
  });

  it('every nesting reference in the family points inside the family, except the joined Button, Input and Select', () => {
    const familyRefs = new Set(Object.values(units).map(({ contract }) => bareGtsId(String(contract.$id))));
    for (const { stem, contract } of Object.values(units)) {
      const mounts = (contract.mounted_in ?? []).map((entry) => entry.component).filter((r): r is string => r !== undefined);
      for (const target of [...(contract.accepts.components ?? []), ...mounts]) {
        if (stem === DIRECTORY && OUTSIDE_REFS.has(target)) continue;
        expect(familyRefs.has(target), `${stem}: it names "${target}", which is not a member of this family`).toBe(true);
      }
    }
  });
});

describe('button-group family: what the schema cannot assert', () => {
  it('the parts pair their render-typed props with statements, and the root needs none', () => {
    expect(Object.keys(units['button-group-text'].contract.prop_statements ?? {})).toEqual(['render']);
    expect(Object.keys(units['button-group-separator'].contract.prop_statements ?? {}).sort()).toEqual(['render', 'style']);
    expect(units[DIRECTORY].contract.prop_statements).toBeUndefined();
  });

  it("the root's orientation is its own cva axis, the separator's is the primitive's", () => {
    expect(units[DIRECTORY].contract.props.properties.orientation).toMatchObject({ enum: ['horizontal', 'vertical'], default: 'horizontal' });
    expect(units['button-group-separator'].contract.props.properties.orientation).toMatchObject({ enum: ['horizontal', 'vertical'] });
  });
});

describe('button-group family in a GTS store', () => {
  it('every component in the family validates as an instance of the component type', () => {
    const gts = unitStore(Object.values(units));
    for (const { stem, contract } of Object.values(units)) {
      const result = gts.validateInstance(contract.$id);
      expect(result.ok, `${stem}: ${result.error}`).toBe(true);
    }
  });

  it('each part names the surface of the element it renders', () => {
    for (const { stem, contract, elementSurface } of Object.values(units)) {
      expect(contract.forwards_to, stem).toBe(bareGtsId(String(elementSurface.$id)));
    }
    for (const stem of ALL_STEMS) expect(units[stem].contract.forwards_to, stem).toBe(elementTypeRef('dom_div'));
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
