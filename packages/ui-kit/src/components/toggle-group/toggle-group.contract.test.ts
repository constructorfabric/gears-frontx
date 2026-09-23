// Conformance for both ToggleGroup contracts (root and item) - one file
// because the interesting assertions are about how the two relate (family
// membership, composition refs), not about either in isolation. Follows
// radio-group.contract.test.ts, the other root-plus-one-part family.
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

const DIRECTORY = 'toggle-group';
const ITEM = 'toggle-group-item';
const PART_STEMS = [ITEM] as const;
const ALL_STEMS = [DIRECTORY, ...PART_STEMS] as const;

for (const stem of ALL_STEMS) assertContractFreshness(DIRECTORY, stem);

const units = compileUnits(DIRECTORY, ALL_STEMS);
const componentType = buildComponentType();

const ROOT_REF = componentRef(DIRECTORY, contractMajor(DIRECTORY, DIRECTORY));
const ITEM_REF = componentRef(ITEM, contractMajor(DIRECTORY, ITEM));

describe('toggle-group family: component type validity', () => {
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

describe('toggle-group family: membership resolves', () => {
  it('the root names the family, calls itself root, and carries the item', () => {
    const root = units[DIRECTORY].contract.family_membership;
    expect(root?.name).toBe('toggle_group');
    expect(root?.role).toBe('root');
    expect(root?.members).toEqual([ITEM_REF]);
  });

  it('the item names the same family, calls itself a part, and lists no members', () => {
    const membership = units[ITEM].contract.family_membership;
    expect(membership?.name).toBe('toggle_group');
    expect(membership?.role).toBe('part');
    expect(membership?.members).toBeUndefined();
  });

  it('the part the root carries ships a compiled contract of its own', () => {
    for (const ref of units[DIRECTORY].contract.family_membership?.members ?? []) {
      const target = resolveComponentRef(ref);
      expect(target.contractId, `${ref}: ${target.stem} ships no compiled contract`).toBe(ref);
    }
  });

  it('the root is the only member the roster calls a root', () => {
    const roster = familyRoster('toggle_group');
    expect(roster.root).toBe(ROOT_REF);
    expect(roster.parts).toEqual([ITEM_REF]);
  });
});

describe('toggle-group family: what nests where', () => {
  it('the root accepts ToggleGroupItem and nothing else', () => {
    expect(units[DIRECTORY].contract.accepts).toEqual({ content: 'specified', components: [ITEM_REF] });
  });

  it('the item accepts its own caption or glyph as children', () => {
    expect(units[ITEM].contract.accepts).toEqual({ content: 'specified', text: true });
  });

  it("the item's mount point is FILLED from the contract that accepts it", () => {
    expect(units[ITEM].contract.mounted_in).toEqual([{ container: pascalCase(DIRECTORY), component: ROOT_REF }]);
  });

  it('gives the root no mount point at all - nothing in the kit mounts a ToggleGroup', () => {
    // Absent, not an empty list: an empty list would read as "may be
    // mounted nowhere".
    expect(units[DIRECTORY].contract.mounted_in).toBeUndefined();
  });

  it('every nesting reference in the family points inside the family', () => {
    const familyRefs = new Set(Object.values(units).map(({ contract }) => bareGtsId(String(contract.$id))));
    for (const { stem, contract } of Object.values(units)) {
      const mounts = (contract.mounted_in ?? []).map((entry) => entry.component).filter((ref): ref is string => ref !== undefined);
      for (const ref of [...(contract.accepts.components ?? []), ...mounts]) {
        expect(familyRefs.has(ref), `${stem}: it names "${ref}", which is not a member of this family`).toBe(true);
      }
    }
  });
});

describe('toggle-group family: what the schema cannot assert', () => {
  it("both contracts' prop statements name their generic-typed value prop, and the compiler emits them into the property description", () => {
    // The group's value is an array of the caller's own Value, the item's a
    // single Value: neither narrowing reaches the schema, so the statement
    // is the one place that says what the property holds.
    for (const stem of ALL_STEMS) {
      const statements = units[stem].contract.prop_statements ?? {};
      expect(Object.keys(statements), stem).toContain('value');
      expect(units[stem].contract.props.properties.value.description, stem).toContain(statements.value.states);
    }
    expect(units[DIRECTORY].contract.props.properties.value.type).toBe('array');
    expect(units[ITEM].contract.props.properties.value.type).toBe('string');
  });

  it("files the group's kit-narrowed style apart from the item's state-function style", () => {
    // ToggleGroupProps redeclares style as plain CSSProperties; the item
    // keeps Base UI's state-function union. Both assert nothing, for
    // different reasons, and both carry a statement.
    for (const stem of ALL_STEMS) {
      expect(Object.keys(units[stem].contract.prop_statements ?? {}), stem).toContain('style');
    }
    expect(units[DIRECTORY].contract.props.properties.style.description).toContain('Partially typed: CSSProperties | undefined.');
    expect(units[ITEM].contract.props.properties.style.description).toContain('((state: ToggleState) =>');
  });

  it('files a Base UI prop as API and a React attribute as forwarded surface', () => {
    expect(units[DIRECTORY].contract.props.properties.disabled).toEqual({ type: 'boolean' });
    expect(units[ITEM].contract.props.properties.disabled).toEqual({ type: 'boolean' });
    for (const stem of ALL_STEMS) {
      for (const prop of ['children', 'role', 'onClick']) {
        expect(units[stem].contract.props.properties, `${stem}.${prop}`).not.toHaveProperty(prop);
      }
    }
  });
});

describe('toggle-group family in a GTS store', () => {
  function registeredStore(): GTS {
    return unitStore(Object.values(units));
  }

  it('both components in the family validate as an instance of the component type', () => {
    const gts = registeredStore();
    for (const { stem, contract } of Object.values(units)) {
      const result = gts.validateInstance(contract.$id);
      expect(result.ok, `${stem}: ${result.error}`).toBe(true);
    }
  });

  it('each member names the surface of the element it renders', () => {
    for (const { stem, contract, elementSurface } of Object.values(units)) {
      expect(contract.forwards_to, stem).toBe(bareGtsId(String(elementSurface.$id)));
    }
    expect(units[DIRECTORY].contract.forwards_to).toBe(elementTypeRef('dom_div'));
    expect(units[ITEM].contract.forwards_to).toBe(elementTypeRef('dom_button'));
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

  it('rejects the root when it carries an unknown key - negative control', () => {
    const root = units[DIRECTORY].contract;
    const corrupted = { ...root, bogus_field: true } as typeof root;
    const result = validateContractInstance(corrupted);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/additional propert/i);
  });
});
