// Conformance for the four bubble contracts - one file because the
// interesting assertions are about how they relate, not about any one in
// isolation. Bubble, BubbleContent and BubbleReactions form the bubble
// family (root and two parts, as in radio-group.contract.test.ts);
// BubbleGroup belongs to no family: it wraps whole bubbles, the way
// AvatarGroup wraps Avatar roots, so it is not a part of the thing it wraps.
import { GTS } from '@globaltypesystem/gts-ts';
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

const DIRECTORY = 'bubble';
const GROUP = 'bubble-group';
const PART_STEMS = ['bubble-content', 'bubble-reactions'] as const;
const FAMILY_STEMS = [DIRECTORY, ...PART_STEMS] as const;
const ALL_STEMS = [...FAMILY_STEMS, GROUP] as const;

for (const stem of ALL_STEMS) assertContractFreshness(DIRECTORY, stem);

const units = compileUnits(DIRECTORY, ALL_STEMS);
const componentType = buildComponentType();

const ref = (stem: string) => componentRef(stem, contractMajor(DIRECTORY, stem));
const ROOT_REF = ref(DIRECTORY);

describe('bubble: component type validity', () => {
  it('all four contracts validate against the component type', () => {
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

describe('bubble family: membership resolves', () => {
  it('the root names the family, calls itself root, and carries both parts', () => {
    const root = units[DIRECTORY].contract.family_membership;
    expect(root?.name).toBe('bubble');
    expect(root?.role).toBe('root');
    expect(root?.members).toEqual(PART_STEMS.map(ref).sort());
  });

  it('every part names the same family, calls itself a part, and lists no members', () => {
    for (const stem of PART_STEMS) {
      const membership = units[stem].contract.family_membership;
      expect(membership?.name, stem).toBe('bubble');
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

  it('the root is the only member the roster calls a root, and the group is not in the roster', () => {
    const roster = familyRoster('bubble');
    expect(roster.root).toBe(ROOT_REF);
    expect(roster.parts).toEqual(PART_STEMS.map(ref).sort());
    expect(roster.parts).not.toContain(ref(GROUP));
  });

  it('the group states no family membership', () => {
    // A wrapper around whole bubbles is not a part of the bubble: a Bubble
    // also stands alone or sits in a Message row.
    expect(units[GROUP].contract.family_membership).toBeUndefined();
  });
});

describe('bubble: what nests where', () => {
  it('the root accepts its two parts and nothing else', () => {
    expect(units[DIRECTORY].contract.accepts).toEqual({ content: 'specified', components: PART_STEMS.map(ref) });
  });

  it('the group and both parts take any content', () => {
    // The group cannot list Bubble under `specified`: the shared suite
    // requires every kit mount point of a family member, the root included,
    // to lie inside that member's own family, and the group is not one of
    // its members (the same reason AvatarGroup's accepts is unconstrained).
    for (const stem of [GROUP, ...PART_STEMS]) {
      expect(units[stem].contract.accepts, stem).toEqual({ content: 'unconstrained' });
    }
  });

  it("every part's mount point is FILLED from the root's accepts, and only the root", () => {
    for (const stem of PART_STEMS) {
      expect(units[stem].contract.mounted_in, stem).toEqual([{ container: pascalCase(DIRECTORY), component: ROOT_REF }]);
    }
  });

  it("the root's only mount point is the authored one outside the kit", () => {
    // Nothing in the kit names Bubble in a `specified` accepts list, so no
    // kit mount point is filled; the authored entry carries no component.
    const mounts = units[DIRECTORY].contract.mounted_in ?? [];
    expect(mounts).toHaveLength(1);
    expect(mounts[0]?.component).toBeUndefined();
    expect(mounts[0]?.container).toBe('any parent in the consuming application');
  });

  it('gives the group no mount point at all - nothing in the kit names BubbleGroup in its accepts', () => {
    expect(units[GROUP].contract.mounted_in).toBeUndefined();
  });

  it('every nesting reference in the directory points inside the directory', () => {
    const directoryRefs = new Set(Object.values(units).map(({ contract }) => bareGtsId(String(contract.$id))));
    for (const { stem, contract } of Object.values(units)) {
      const mounts = (contract.mounted_in ?? []).map((entry) => entry.component).filter((mount): mount is string => mount !== undefined);
      for (const nested of [...(contract.accepts.components ?? []), ...mounts]) {
        expect(directoryRefs.has(nested), `${stem}: it names "${nested}", which is not a contract of this directory`).toBe(true);
      }
    }
  });
});

describe('bubble: what the schema cannot assert', () => {
  it("BubbleContent's render prop carries the one prop statement, emitted into its description", () => {
    const statements = units['bubble-content'].contract.prop_statements ?? {};
    expect(Object.keys(statements)).toEqual(['render']);
    expect(units['bubble-content'].contract.props.properties.render.description).toContain(statements.render.states);
  });

  it('no other contract carries a prop statement, and none has a partially typed prop left over', () => {
    for (const { stem, contract } of Object.values(units)) {
      expect(Object.keys(contract['x-uikit'].partially_typed_props), stem).toEqual([]);
      if (stem !== 'bubble-content') expect(contract.prop_statements, stem).toBeUndefined();
    }
  });

  it('the group declares no kit prop of its own - every prop is the div surface', () => {
    expect(units[GROUP].contract.props.properties).toEqual({});
  });

  it('the two cva builders are companions of the contracts whose classes they build', () => {
    expect((units[DIRECTORY].contract.companions ?? []).map((entry) => entry.export)).toEqual(['bubbleVariants']);
    expect((units['bubble-reactions'].contract.companions ?? []).map((entry) => entry.export)).toEqual([
      'bubbleReactionsVariants',
    ]);
  });
});

describe('bubble contracts in a GTS store', () => {
  function registeredStore(): GTS {
    return unitStore(Object.values(units));
  }

  it('all four components validate as an instance of the component type', () => {
    const gts = registeredStore();
    for (const { stem, contract } of Object.values(units)) {
      const result = gts.validateInstance(contract.$id);
      expect(result.ok, `${stem}: ${result.error}`).toBe(true);
    }
  });

  it('every contract names the div surface it renders', () => {
    for (const { stem, contract, elementSurface } of Object.values(units)) {
      expect(contract.forwards_to, stem).toBe(bareGtsId(String(elementSurface.$id)));
      expect(contract.forwards_to, stem).toBe(elementTypeRef('dom_div'));
    }
  });

  it('fails when the component type is not registered - negative control', () => {
    const gts = unitStore(Object.values(units), { componentType: false, vocabulary: false });
    const result = gts.validateInstance(units[DIRECTORY].contract.$id);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Schema not found');
  });

  it('all four components validate as an instance of the committed component type', () => {
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
