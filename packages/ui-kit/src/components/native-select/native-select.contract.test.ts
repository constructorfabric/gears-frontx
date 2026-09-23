// Conformance for all three NativeSelect contracts (root, option,
// opt-group) - one file because the interesting assertions are about how the
// three relate (family membership, composition refs), not about any one of
// them in isolation. See button.contract.test.ts for the per-component
// conformance shape this reuses via testing.ts's assertContractFreshness, and
// radio-group.contract.test.ts for the smaller family this follows - this
// family has two parts, and unlike RadioGroupItem neither part carries a
// property of its own, which is asserted below rather than assumed.
import { GTS } from '@globaltypesystem/gts-ts';
import Ajv2020 from 'ajv/dist/2020';
import { describe, expect, it } from 'vitest';

import {
  addContractTypes,
  buildComponentType,
  contractMajor,
  familyRoster,
  liftPropsSchema,
  partlyCheckedPropertyNames,
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

// assertContractFreshness below builds a real TypeScript program - several
// seconds on a CI-class runner, comfortably under 5s locally - so only CI
// hits vitest's default test timeout. Must run before any describe()/it()
// in the file; see applyContractTestTimeout's own comment in testing.ts.
applyContractTestTimeout();

const DIRECTORY = 'native-select';
// stem === directory for the root (see compile.ts's resolveTargetExtraction
// default), so it is not listed alongside the two parts below.
const PART_STEMS = ['native-select-option', 'native-select-opt-group'] as const;
const ALL_STEMS = [DIRECTORY, ...PART_STEMS] as const;

for (const stem of ALL_STEMS) assertContractFreshness(DIRECTORY, stem);

const units = compileUnits(DIRECTORY, ALL_STEMS);
const componentType = buildComponentType();

// The ref every pointer at NativeSelect itself should agree on - built once
// so a typo in one overlay shows up as a mismatch against this, not just
// against itself.
const ROOT_REF = componentRef(DIRECTORY, contractMajor(DIRECTORY, DIRECTORY));

describe('native-select family: component type validity', () => {
  it('all three contracts validate against the component type', () => {
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

describe('native-select family: membership resolves', () => {
  it('the root names the family, calls itself root, and carries both parts', () => {
    const root = units[DIRECTORY].contract.family_membership;
    expect(root?.name).toBe('native_select');
    expect(root?.role).toBe('root');
    expect(root?.members).toEqual(PART_STEMS.map((stem) => componentRef(stem, contractMajor(DIRECTORY, stem))).sort());
  });

  it('every part names the same family, calls itself a part, and lists no members', () => {
    for (const stem of PART_STEMS) {
      const membership = units[stem].contract.family_membership;
      expect(membership?.name, stem).toBe('native_select');
      expect(membership?.role, stem).toBe('part');
      expect(membership?.members, stem).toBeUndefined();
    }
  });

  it('every part the root carries ships a compiled contract of its own', () => {
    // That each of these references resolves at all - to a component the kit
    // ships, at the major that component ships - is the shared suite's check
    // (assertContractFreshness, testing.ts), which every described component
    // runs. What is specific to a family is stronger: a part the root
    // carries must itself be described, or the family is a set of pointers
    // into components nobody has contracted.
    for (const ref of units[DIRECTORY].contract.family_membership?.members ?? []) {
      const target = resolveComponentRef(ref);
      expect(target.contractId, `${ref}: ${target.stem} ships no compiled contract`).toBe(ref);
    }
  });

  it('the root is the only member the roster calls a root', () => {
    // The rule the compiler enforces, asserted from the outside: every member
    // names the family, and exactly one of them is its root - which is what
    // makes `members` derivable at all.
    const roster = familyRoster('native_select');
    expect(roster.root).toBe(ROOT_REF);
    expect(roster.parts).toEqual(PART_STEMS.map((stem) => componentRef(stem, contractMajor(DIRECTORY, stem))).sort());
  });
});

describe('native-select family: what nests where', () => {
  it('the root accepts the option and the opt-group, nothing else', () => {
    // Authored order: the compiler preserves the overlay's own sequence
    // here, unlike a family root's member list, which it sorts.
    expect(units[DIRECTORY].contract.accepts).toEqual({
      content: 'specified',
      components: PART_STEMS.map((stem) => componentRef(stem, contractMajor(DIRECTORY, stem))),
    });
  });

  it('the opt-group accepts only the option', () => {
    expect(units['native-select-opt-group'].contract.accepts).toEqual({
      content: 'specified',
      components: [componentRef('native-select-option', contractMajor(DIRECTORY, 'native-select-option'))],
    });
  });

  it("every part's mount points are FILLED from the contracts that accept it", () => {
    // The family's shape read back out of the derivation rather than
    // authored: the root accepts the option and the opt-group, and the
    // opt-group accepts the option, so the option's `mounted_in` is exactly
    // those two contracts while the opt-group's is the root alone. Nothing in
    // the three overlays writes a mount point, so the two directions cannot
    // disagree - what is asserted here is that the derivation produces the
    // family the overlays describe. The compiler sorts mount points
    // alphabetically by their component reference (mountPointsAccepting),
    // which here puts the opt-group's ref before the root's.
    expect(units['native-select-option'].contract.mounted_in).toEqual([
      { container: pascalCase('native-select-opt-group'), component: componentRef('native-select-opt-group', contractMajor(DIRECTORY, 'native-select-opt-group')) },
      { container: pascalCase(DIRECTORY), component: componentRef(DIRECTORY, contractMajor(DIRECTORY, DIRECTORY)) },
    ]);
    expect(units['native-select-opt-group'].contract.mounted_in).toEqual([
      { container: pascalCase(DIRECTORY), component: componentRef(DIRECTORY, contractMajor(DIRECTORY, DIRECTORY)) },
    ]);
  });

  it('gives the root no mount point at all - nothing in the kit mounts a NativeSelect', () => {
    // Absent, not an empty list: no contract accepts the root inside it, and
    // an empty list would read as "may be mounted nowhere".
    expect(units[DIRECTORY].contract.mounted_in).toBeUndefined();
  });

  it('every nesting reference in the family points inside the family', () => {
    // Resolution itself is the shared suite's check. What this asserts is
    // the family's own shape: a part may only nest under, or contain,
    // another member of the same family - a reference leaving the family
    // would make a part independently mountable, which is exactly what a
    // compound component is not.
    const familyRefs = new Set(Object.values(units).map(({ contract }) => bareGtsId(String(contract.$id))));
    for (const { stem, contract } of Object.values(units)) {
      const mounts = (contract.mounted_in ?? [])
        .map((entry) => entry.component)
        .filter((ref): ref is string => ref !== undefined);
      for (const ref of [...(contract.accepts.components ?? []), ...mounts]) {
        expect(familyRefs.has(ref), `${stem}: it names "${ref}", which is not a member of this family`).toBe(true);
      }
    }
  });
});

describe('native-select family: what the schema cannot assert', () => {
  it('leaves nothing partly checked, and so carries no prop statements', () => {
    // The root's only declared props are className and size, both plain
    // types the schema states in full, and the parts declare nothing - their
    // every prop is a native attribute on the element surface. With no
    // partly-checked property there is no pairing for prop_statements to
    // make; an entry here would be a statement about a prop the schema
    // already states, which the pairing refuses.
    for (const { stem, contract } of Object.values(units)) {
      expect(partlyCheckedPropertyNames(contract), stem).toEqual([]);
      expect(Object.keys(contract.prop_statements ?? {}), stem).toEqual([]);
    }
  });

  it('files the root redeclared props as properties and the native attributes as forwarded surface', () => {
    // The filing rule on the family: `className` and `size` are declared in
    // native-select.tsx and reach the contract typed, while `disabled`,
    // `children` and the event handlers stay on the <select>'s element
    // surface - a native select has no primitive whose props could become
    // API props.
    const rootProps = units[DIRECTORY].contract.props.properties;
    expect(rootProps.className).toEqual({ type: 'string' });
    expect(rootProps.size).toEqual({ type: 'string', enum: ['default', 'sm'] });
    for (const stem of ALL_STEMS) {
      for (const prop of ['children', 'disabled', 'role', 'onClick', 'value']) {
        expect(units[stem].contract.props.properties, `${stem}.${prop}`).not.toHaveProperty(prop);
      }
    }
  });
});

describe('native-select family in a GTS store', () => {
  function registeredStore(): GTS {
    return unitStore(Object.values(units));
  }

  it('every component in the family validates as an instance of the component type', () => {
    const gts = registeredStore();
    for (const { stem, contract } of Object.values(units)) {
      const result = gts.validateInstance(contract.$id);
      expect(result.ok, `${stem}: ${result.error}`).toBe(true);
    }
  });

  it('each member names the surface of the element it renders', () => {
    // Agreement between the two things that could disagree: the element the
    // extraction resolved and the reference the component holds. Worth
    // stating on this family, because it is the one in the kit where every
    // member renders a different element - a family shares a root and not a
    // surface.
    for (const { stem, contract, elementSurface } of Object.values(units)) {
      expect(contract.forwards_to, stem).toBe(bareGtsId(String(elementSurface.$id)));
    }
    expect(units[DIRECTORY].contract.forwards_to).toBe(elementTypeRef('dom_select'));
    expect(units['native-select-option'].contract.forwards_to).toBe(elementTypeRef('dom_option'));
    expect(units['native-select-opt-group'].contract.forwards_to).toBe(elementTypeRef('dom_optgroup'));
  });

  it('fails when the component type is not registered - negative control', () => {
    const gts = unitStore(Object.values(units), { componentType: false, vocabulary: false });
    const result = gts.validateInstance(units[DIRECTORY].contract.$id);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Schema not found');
  });

  it('every component validates as an instance of the committed component type', () => {
    // Real here because both parts omit `family_membership.members`, the
    // parts omit every meaning field the root carries, and all three omit
    // every growth surface - exactly the "genuinely absent, not merely
    // undefined" case validateContractInstance's JSON round-trip exists for.
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
