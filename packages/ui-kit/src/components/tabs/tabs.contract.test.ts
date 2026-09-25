// Conformance for all four Tabs contracts (root, list, trigger, content) -
// one file because the interesting assertions are about how the four
// relate (family membership, composition refs), not about any one of them
// in isolation. See button.contract.test.ts for the per-component
// conformance shape this reuses via testing.ts's assertContractFreshness;
// this file adds what a single, non-compound component has no need for.
import { GTS } from '@globaltypesystem/gts-ts';
import Ajv2020 from 'ajv/dist/2020';
import { describe, expect, it } from 'vitest';

import {
  addContractTypes,
  buildComponentType,
  type CompiledContract,
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

const DIRECTORY = 'tabs';
// stem === directory for the root (see compile.ts's resolveTargetExtraction
// default), so it is not listed alongside the three parts below.
const PART_STEMS = ['tabs-list', 'tabs-trigger', 'tabs-content'] as const;
const ALL_STEMS = [DIRECTORY, ...PART_STEMS] as const;

for (const stem of ALL_STEMS) assertContractFreshness(DIRECTORY, stem);

const units = compileUnits(DIRECTORY, ALL_STEMS);
const componentType = buildComponentType();

// The ref every pointer at Tabs itself should agree on - built once so a
// typo in one overlay shows up as a mismatch against this, not just against
// itself.
const ROOT_REF = componentRef(DIRECTORY, contractMajor(DIRECTORY, DIRECTORY));

describe('tabs family: component type validity', () => {
  it('every one of the four validates against the component type', () => {
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

describe('tabs family: membership resolves', () => {
  it('the root names the family, calls itself root, and carries every part', () => {
    const root = units[DIRECTORY].contract.family_membership;
    expect(root?.name).toBe('tabs');
    expect(root?.role).toBe('root');
    expect(root?.members).toEqual(
      PART_STEMS.map((stem) => componentRef(stem, contractMajor(DIRECTORY, stem))).sort(),
    );
  });

  it('every part names the same family, calls itself a part, and lists no members', () => {
    for (const stem of PART_STEMS) {
      const membership = units[stem].contract.family_membership;
      expect(membership?.name, stem).toBe('tabs');
      expect(membership?.role, stem).toBe('part');
      expect(membership?.members, stem).toBeUndefined();
    }
  });

  it('every part the root carries ships a compiled contract of its own', () => {
    // That each of these references resolves at all - to a component the kit
    // ships, at the major that component ships - is the shared suite's check
    // (assertContractFreshness, testing.ts), which every described component
    // runs. What is specific to a family is stronger: a part the root carries
    // must itself be described, or the family is a set of pointers into
    // components nobody has contracted.
    for (const ref of units[DIRECTORY].contract.family_membership?.members ?? []) {
      const target = resolveComponentRef(ref);
      expect(target.contractId, `${ref}: ${target.stem} ships no compiled contract`).toBe(ref);
    }
  });

  it('the root is the only member the roster calls a root', () => {
    // The rule the compiler enforces, asserted from the outside: every member
    // names the family, and exactly one of them is its root - which is what
    // makes `members` derivable at all.
    const roster = familyRoster('tabs');
    expect(roster.root).toBe(ROOT_REF);
    expect(roster.parts).toEqual(PART_STEMS.map((stem) => componentRef(stem, contractMajor(DIRECTORY, stem))).sort());
  });
});

describe('tabs family: what nests where', () => {
  // Every accepted component and every filled mount point across the family
  // that carries a component reference (not a container outside the kit,
  // which does not) - gathered once so the resolution check does not repeat
  // itself per unit.
  function nestingRefs(meaning: CompiledContract): string[] {
    const mounts = (meaning.mounted_in ?? [])
      .map((entry) => entry.component)
      .filter((ref): ref is string => ref !== undefined);
    return [...(meaning.accepts.components ?? []), ...mounts];
  }

  it('the root accepts TabsList and TabsContent and nothing else', () => {
    expect(units[DIRECTORY].contract.accepts).toEqual({
      content: 'specified',
      components: [
        componentRef('tabs-list', contractMajor(DIRECTORY, 'tabs-list')),
        componentRef('tabs-content', contractMajor(DIRECTORY, 'tabs-content')),
      ],
    });
  });

  it('the list accepts TabsTrigger and nothing else', () => {
    expect(units['tabs-list'].contract.accepts).toEqual({
      content: 'specified',
      components: [componentRef('tabs-trigger', contractMajor(DIRECTORY, 'tabs-trigger'))],
    });
  });

  it("every part's mount points are FILLED from the contract that accepts it", () => {
    // The family's shape read back out of the derivation rather than
    // authored: the root accepts the list and the content, the list accepts
    // the trigger, and each part's `mounted_in` is exactly the contract that
    // accepted it. Nothing in the four overlays writes a mount point, so the
    // two directions cannot disagree - what is asserted here is that the
    // derivation produces the family the overlays describe.
    for (const stem of ['tabs-list', 'tabs-content'] as const) {
      expect(units[stem].contract.mounted_in, stem).toEqual([
        { container: pascalCase(DIRECTORY), component: componentRef(DIRECTORY, contractMajor(DIRECTORY, DIRECTORY)) },
      ]);
    }
    expect(units['tabs-trigger'].contract.mounted_in).toEqual([
      { container: pascalCase('tabs-list'), component: componentRef('tabs-list', contractMajor(DIRECTORY, 'tabs-list')) },
    ]);
  });

  it('gives the root no mount point at all - nothing in the kit mounts a Tabs', () => {
    // Absent, not an empty list: no contract accepts the root inside it, and
    // an empty list would read as "may be mounted nowhere".
    expect(units[DIRECTORY].contract.mounted_in).toBeUndefined();
  });

  it('every nesting reference in the family points inside the family', () => {
    // Resolution itself is the shared suite's check. What this asserts is
    // the family's own shape: a part may only nest under, or contain,
    // another member of the same family - a reference leaving the family
    // would make the parts independently mountable, which is exactly what a
    // compound component is not.
    const familyRefs = new Set(Object.values(units).map(({ contract }) => bareGtsId(String(contract.$id))));
    for (const { stem, contract } of Object.values(units)) {
      for (const ref of nestingRefs(contract)) {
        expect(familyRefs.has(ref), `${stem}: it names "${ref}", which is not a member of this family`).toBe(true);
      }
    }
  });
});

describe('tabs family: what the schema cannot assert', () => {
  it("the root's value/defaultValue/onValueChange are covered by prop statements the compiler emits into the property description", () => {
    // The measured defect this closes: an unconstrained `value` reads as
    // "any string will do" when the primitive actually types it `any` and
    // compares it by identity - the statement is keyed on the property
    // itself and emitted into that property's own description beside the
    // `TS:` text.
    const statements = units[DIRECTORY].contract.prop_statements ?? {};
    for (const prop of ['value', 'defaultValue', 'onValueChange']) {
      expect(Object.keys(statements), prop).toContain(prop);
    }
    const properties = units[DIRECTORY].contract.props.properties;
    for (const prop of ['value', 'defaultValue']) {
      expect(properties[prop].description, prop).toContain(statements[prop].states);
    }
  });

  it('the list carries variant and size as cva axes the overlay never restates', () => {
    const properties = units['tabs-list'].contract.props.properties;
    expect(properties.variant, 'variant').toEqual({ type: 'string', enum: ['default', 'line'], default: 'default' });
    expect(properties.size, 'size').toEqual({ type: 'string', enum: ['sm', 'default'], default: 'default' });
    // Neither axis carries a prop statement: their values are fully stated
    // by the schema above, so an overlay entry for either would be refused.
    const statements = units['tabs-list'].contract.prop_statements ?? {};
    expect(Object.keys(statements)).not.toContain('variant');
    expect(Object.keys(statements)).not.toContain('size');
  });

  it("the list's unexposed_parts entry documents the internally rendered Indicator", () => {
    const unexposedParts = units['tabs-list'].contract.unexposed_parts ?? [];
    expect(unexposedParts.some((entry) => /Indicator/.test(entry.part))).toBe(true);
  });

  it('the content carries the animate capability, enabled by its own prop', () => {
    const capabilities = units['tabs-content'].contract.capabilities ?? [];
    const animateCapability = capabilities.find((entry) => entry.enabled_by === 'animate');
    expect(animateCapability, 'animate capability').toBeDefined();
    expect(units['tabs-content'].contract.props.properties.animate, 'animate schema').toEqual({
      type: 'boolean',
      default: true,
    });
  });

  it('files a Base UI part prop as API and a React attribute as forwarded surface', () => {
    // The filing rule on the family: `orientation` is Base UI's own
    // TabsRootProps and reaches the contract typed, while `children` and
    // `role` are React's div attributes and stay on the element surface.
    expect(units[DIRECTORY].contract.props.properties.orientation).toEqual({
      type: 'string',
      enum: ['horizontal', 'vertical'],
    });
    for (const prop of ['children', 'role', 'onClick']) {
      expect(units[DIRECTORY].contract.props.properties, prop).not.toHaveProperty(prop);
    }
  });
});

describe('tabs family in a GTS store', () => {
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

  it('each part names the surface of the element it renders', () => {
    // Agreement between the two things that could disagree: the element the
    // extraction resolved and the reference the component holds. Worth
    // stating on this family in particular, because it is the one place in
    // the kit where a family spans two elements - the trigger renders a
    // <button>, the other three a <div> - so a family shares a root and not
    // a surface.
    for (const { stem, contract, elementSurface } of Object.values(units)) {
      expect(contract.forwards_to, stem).toBe(bareGtsId(String(elementSurface.$id)));
    }
    expect(units['tabs-trigger'].contract.forwards_to).toBe(elementTypeRef('dom_button'));
    expect(units[DIRECTORY].contract.forwards_to).toBe(elementTypeRef('dom_div'));
  });

  it('fails when the component type is not registered - negative control', () => {
    const gts = unitStore(Object.values(units), { componentType: false, vocabulary: false });
    const result = gts.validateInstance(units[DIRECTORY].contract.$id);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Schema not found');
  });

  it('every component validates as an instance of the committed component type', () => {
    // Real here because the parts omit `family_membership.members` and most
    // growth surfaces, which is exactly the "genuinely absent, not merely
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
