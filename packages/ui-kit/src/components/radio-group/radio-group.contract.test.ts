// Conformance for both RadioGroup contracts (root and item) - one file
// because the interesting assertions are about how the two relate (family
// membership, composition refs), not about either in isolation. See
// button.contract.test.ts for the per-component conformance shape this
// reuses via testing.ts's assertContractFreshness, and
// accordion.contract.test.ts for the larger family this follows - this
// family has one part instead of three, so it skips the multi-level mount
// checks a bigger family needs.
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

// assertContractFreshness below builds a real TypeScript program - several
// seconds on a CI-class runner, comfortably under 5s locally - so only CI
// hits vitest's default test timeout. Must run before any describe()/it()
// in the file; see applyContractTestTimeout's own comment in testing.ts.
applyContractTestTimeout();

const DIRECTORY = 'radio-group';
// stem === directory for the root (see compile.ts's resolveTargetExtraction
// default), so it is not listed alongside the one part below.
const PART_STEMS = ['radio-group-item'] as const;
const ALL_STEMS = [DIRECTORY, ...PART_STEMS] as const;

for (const stem of ALL_STEMS) assertContractFreshness(DIRECTORY, stem);

const units = compileUnits(DIRECTORY, ALL_STEMS);
const componentType = buildComponentType();

// The ref every pointer at RadioGroup itself should agree on - built once so
// a typo in one overlay shows up as a mismatch against this, not just
// against itself.
const ROOT_REF = componentRef(DIRECTORY, contractMajor(DIRECTORY, DIRECTORY));
// Label sits outside the family: the root hosts it as the caption beside an
// item, and it is referenced at its own contract's major.
const LABEL_REF = componentRef('label', contractMajor('label', 'label'));

describe('radio-group family: component type validity', () => {
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

describe('radio-group family: membership resolves', () => {
  it('the root names the family, calls itself root, and carries the item', () => {
    const root = units[DIRECTORY].contract.family_membership;
    expect(root?.name).toBe('radio_group');
    expect(root?.role).toBe('root');
    expect(root?.members).toEqual(PART_STEMS.map((stem) => componentRef(stem, contractMajor(DIRECTORY, stem))).sort());
  });

  it('the item names the same family, calls itself a part, and lists no members', () => {
    const membership = units['radio-group-item'].contract.family_membership;
    expect(membership?.name).toBe('radio_group');
    expect(membership?.role).toBe('part');
    expect(membership?.members).toBeUndefined();
  });

  it('the part the root carries ships a compiled contract of its own', () => {
    // That the reference resolves at all - to a component the kit ships, at
    // the major that component ships - is the shared suite's check
    // (assertContractFreshness, testing.ts), which every described
    // component runs. What is specific to a family is stronger: a part the
    // root carries must itself be described, or the family is a pointer
    // into a component nobody has contracted.
    for (const ref of units[DIRECTORY].contract.family_membership?.members ?? []) {
      const target = resolveComponentRef(ref);
      expect(target.contractId, `${ref}: ${target.stem} ships no compiled contract`).toBe(ref);
    }
  });

  it('the root is the only member the roster calls a root', () => {
    // The rule the compiler enforces, asserted from the outside: every
    // member names the family, and exactly one of them is its root - which
    // is what makes `members` derivable at all.
    const roster = familyRoster('radio_group');
    expect(roster.root).toBe(ROOT_REF);
    expect(roster.parts).toEqual(PART_STEMS.map((stem) => componentRef(stem, contractMajor(DIRECTORY, stem))).sort());
  });
});

describe('radio-group family: what nests where', () => {
  it('the root accepts RadioGroupItem and the Label captioning it, nothing else', () => {
    // The item takes no content, so its visible caption is a sibling Label
    // whose htmlFor names the item's id (Base UI puts that id on the item's
    // hidden native input); the root therefore hosts both.
    expect(units[DIRECTORY].contract.accepts).toEqual({
      content: 'specified',
      components: [componentRef('radio-group-item', contractMajor(DIRECTORY, 'radio-group-item')), LABEL_REF],
    });
  });

  it("the item's mount point is FILLED from the contract that accepts it", () => {
    // The family's shape read back out of the derivation rather than
    // authored: the root accepts the item, and the item's `mounted_in` is
    // exactly the contract that accepted it. Nothing in either overlay
    // writes a mount point, so the two directions cannot disagree - what is
    // asserted here is that the derivation produces the family the overlays
    // describe.
    expect(units['radio-group-item'].contract.mounted_in).toEqual([
      { container: pascalCase(DIRECTORY), component: componentRef(DIRECTORY, contractMajor(DIRECTORY, DIRECTORY)) },
    ]);
  });

  it('gives the root no mount point at all - nothing in the kit mounts a RadioGroup', () => {
    // Absent, not an empty list: no contract accepts the root inside it, and
    // an empty list would read as "may be mounted nowhere".
    expect(units[DIRECTORY].contract.mounted_in).toBeUndefined();
  });

  it('every nesting reference in the family points inside the family, except the caption Label', () => {
    // Resolution itself is the shared suite's check. What this asserts is
    // the family's own shape: the item may only nest under the root, and
    // the root's only other accepted component is Label, which belongs to no
    // family and captions an item from beside it - a reference to any other
    // component would make a part independently mountable, which is exactly
    // what a compound component is not.
    const familyRefs = new Set(Object.values(units).map(({ contract }) => bareGtsId(String(contract.$id))));
    for (const { stem, contract } of Object.values(units)) {
      const mounts = (contract.mounted_in ?? []).map((entry) => entry.component).filter((ref): ref is string => ref !== undefined);
      for (const ref of [...(contract.accepts.components ?? []), ...mounts]) {
        if (stem === DIRECTORY && ref === LABEL_REF) continue;
        expect(familyRefs.has(ref), `${stem}: it names "${ref}", which is not a member of this family`).toBe(true);
      }
    }
  });
});

describe('radio-group family: what the schema cannot assert', () => {
  it("both contracts' props statements name their generic-typed value prop, and the compiler emits them into the property description", () => {
    // The measured pattern this closes (same shape as Accordion's `value`):
    // Base UI's Radio and RadioGroup both type `value` as the caller's own
    // generic `Value`, which no JSON Schema type can state - so each
    // contract's prop_statements entry is the one place that says what kind
    // of thing it actually is, and the compiler folds it into the
    // property's own description beside the `TS:` text.
    for (const stem of ALL_STEMS) {
      const statements = units[stem].contract.prop_statements ?? {};
      expect(Object.keys(statements), stem).toContain('value');
      const properties = units[stem].contract.props.properties;
      expect(properties.value.description, stem).toContain(statements.value.states);
    }
  });

  it('files a Base UI part prop as API and a React attribute as forwarded surface', () => {
    // The filing rule on the family: `disabled` is Base UI's own prop and
    // reaches the contract typed, while `children` and `role` are React's
    // element attributes and stay on the element surface.
    expect(units[DIRECTORY].contract.props.properties.disabled).toEqual({ type: 'boolean' });
    expect(units['radio-group-item'].contract.props.properties.disabled).toEqual({ type: 'boolean' });
    for (const stem of ALL_STEMS) {
      for (const prop of ['children', 'role', 'onClick']) {
        expect(units[stem].contract.props.properties, `${stem}.${prop}`).not.toHaveProperty(prop);
      }
    }
  });

  it("the item's unexposed_parts entry documents the Radio.Indicator composition", () => {
    const unexposedParts = units['radio-group-item'].contract.unexposed_parts ?? [];
    expect(unexposedParts.some((entry) => /Indicator/.test(entry.part) || /Indicator/.test(entry.reason))).toBe(true);
  });
});

describe('radio-group family in a GTS store', () => {
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

  it('each part names the surface of the element it renders', () => {
    // Agreement between the two things that could disagree: the element the
    // extraction resolved and the reference the component holds.
    for (const { stem, contract, elementSurface } of Object.values(units)) {
      expect(contract.forwards_to, stem).toBe(bareGtsId(String(elementSurface.$id)));
    }
    expect(units[DIRECTORY].contract.forwards_to).toBe(elementTypeRef('dom_div'));
    expect(units['radio-group-item'].contract.forwards_to).toBe(elementTypeRef('dom_span'));
  });

  it('fails when the component type is not registered - negative control', () => {
    const gts = unitStore(Object.values(units), { componentType: false, vocabulary: false });
    const result = gts.validateInstance(units[DIRECTORY].contract.$id);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Schema not found');
  });

  it('both components validate as an instance of the committed component type', () => {
    // Real here because the item omits `family_membership.members` and both
    // omit every growth surface, which is exactly the "genuinely absent,
    // not merely undefined" case validateContractInstance's JSON round-trip
    // exists for.
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
