// Conformance for all four Accordion contracts (root, item, trigger,
// content) - one file because the interesting assertions are about how the
// four relate (family membership, composition refs), not about any one of
// them in isolation. See button.contract.test.ts for the per-component
// conformance shape this reuses via testing.ts's assertContractFreshness;
// this file adds what a single, non-compound component has no need for.
import { GTS } from '@globaltypesystem/gts-ts';
import Ajv2020 from 'ajv/dist/2020';
import { describe, expect, it } from 'vitest';

import {
  addContractTypes,
  buildComponentType,
  compileContract,
  contractMajor,
  familyRoster,
  liftPropsSchema,
  loadElementSurface,
  pascalCase,
  registerContractTypes,
  resolveTargetExtraction,
  type CompiledContract,
} from '../../../scripts/contracts/compile';
import { bareGtsId, componentRef, elementTypeRef } from '../../../scripts/contracts/ids';
import {
  applyContractTestTimeout,
  assertContractFreshness,
  resolveComponentRef,
  validateContractInstance,
} from '../../../scripts/contracts/testing';

// assertContractFreshness below builds a real TypeScript program - several
// seconds on a CI-class runner, comfortably under 5s locally - so only CI
// hits vitest's default test timeout. Must run before any describe()/it()
// in the file; see applyContractTestTimeout's own comment in testing.ts.
applyContractTestTimeout();

const DIRECTORY = 'accordion';
// stem === directory for the root (see compile.ts's resolveTargetExtraction
// default), so it is not listed alongside the three parts below.
const PART_STEMS = ['accordion-item', 'accordion-trigger', 'accordion-content'] as const;
const ALL_STEMS = [DIRECTORY, ...PART_STEMS] as const;

for (const stem of ALL_STEMS) assertContractFreshness(DIRECTORY, stem);

interface CompiledUnit {
  stem: string;
  contract: CompiledContract;
  elementSurface: Record<string, unknown>;
}

function compileUnit(stem: string): CompiledUnit {
  const extraction = resolveTargetExtraction(DIRECTORY, stem);
  const contract = compileContract(DIRECTORY, stem);
  // Every export here renders a real element (all four wrap a Base UI
  // primitive), so elementKind is never undefined - a defensive message
  // beats a bare "Cannot read properties of undefined" if that ever changes.
  if (!extraction.elementKind) {
    throw new Error(`${stem}: expected a host element kind, extraction resolved none`);
  }
  return { stem, contract, elementSurface: loadElementSurface(extraction.elementKind) };
}

const units: Record<string, CompiledUnit> = Object.fromEntries(ALL_STEMS.map((stem) => [stem, compileUnit(stem)]));
const componentType = buildComponentType();

// The ref every pointer at Accordion itself should agree on - built once so a
// typo in one overlay shows up as a mismatch against this, not just against
// itself.
const ROOT_REF = componentRef(DIRECTORY, contractMajor(DIRECTORY, DIRECTORY));

describe('accordion family: component type validity', () => {
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

describe('accordion family: membership resolves', () => {
  it('the root names the family, calls itself root, and carries every part', () => {
    const root = units[DIRECTORY].contract.family_membership;
    expect(root?.name).toBe('accordion');
    expect(root?.role).toBe('root');
    expect(root?.members).toEqual(
      PART_STEMS.map((stem) => componentRef(stem, contractMajor(DIRECTORY, stem))).sort(),
    );
  });

  it('every part names the same family, calls itself a part, and lists no members', () => {
    for (const stem of PART_STEMS) {
      const membership = units[stem].contract.family_membership;
      expect(membership?.name, stem).toBe('accordion');
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
    const roster = familyRoster('accordion');
    expect(roster.root).toBe(ROOT_REF);
    expect(roster.parts).toEqual(PART_STEMS.map((stem) => componentRef(stem, contractMajor(DIRECTORY, stem))).sort());
  });
});

describe('accordion family: what nests where', () => {
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

  it("the root accepts AccordionItem and nothing else", () => {
    expect(units[DIRECTORY].contract.accepts).toEqual({
      content: 'specified',
      components: [componentRef('accordion-item', contractMajor(DIRECTORY, 'accordion-item'))],
    });
  });

  it("every part's mount points are FILLED from the contract that accepts it", () => {
    // The family's shape read back out of the derivation rather than
    // authored: the root accepts the item, the item accepts the trigger and
    // the panel, and each part's `mounted_in` is exactly the contract that
    // accepted it. Nothing in the four overlays writes a mount point, so the
    // two directions cannot disagree - what is asserted here is that the
    // derivation produces the family the overlays describe.
    expect(units['accordion-item'].contract.mounted_in).toEqual([
      { container: pascalCase(DIRECTORY), component: componentRef(DIRECTORY, contractMajor(DIRECTORY, DIRECTORY)) },
    ]);
    for (const stem of ['accordion-trigger', 'accordion-content'] as const) {
      expect(units[stem].contract.mounted_in, stem).toEqual([
        { container: pascalCase('accordion-item'), component: componentRef('accordion-item', contractMajor(DIRECTORY, 'accordion-item')) },
      ]);
    }
  });

  it('gives the root no mount point at all - nothing in the kit mounts an Accordion', () => {
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

describe('accordion family: what the schema cannot assert', () => {
  it("the root's props statements name the three generic-typed props, and the compiler emits them into the property description", () => {
    // The measured defect this closes: an agent shown the root's `value` and
    // `defaultValue` as unconstrained properties concluded they took plain
    // strings. `AccordionValue<Value>` is `Value[]`, so the schema states
    // the array - the one fact that rules a plain string out - and the type
    // text plus the overlay's own statement carry the half no schema can
    // state, which is what the elements are. The statement is keyed on the
    // property itself now (the dissolved `untyped` catch-all's `about: prop`
    // category), and emitted into that property's own description beside
    // the `TS:` text.
    const statements = units[DIRECTORY].contract.prop_statements ?? {};
    for (const prop of ['value', 'defaultValue', 'onValueChange']) {
      expect(Object.keys(statements), prop).toContain(prop);
    }
    const properties = units[DIRECTORY].contract.props.properties;
    for (const prop of ['value', 'defaultValue']) {
      expect(properties[prop].type, prop).toBe('array');
      expect(properties[prop].items, prop).toBeUndefined();
      expect(properties[prop].description, prop).toContain('AccordionValue<Value>');
      expect(properties[prop].description, prop).toContain(statements[prop].states);
    }
  });

  it('the root withholds orientation and carries the reason on the entry itself', () => {
    // The kit's own root stylesheet fixes a column layout, so Base UI's
    // horizontal orientation is not something this kit offers. Left out of
    // `properties`, and the reason is on the `withheld` entry rather than in a
    // second statement saying the same thing beside it.
    const withheld = units[DIRECTORY].contract.withheld ?? [];
    expect(withheld.map((entry) => entry.prop)).toEqual(['orientation']);
    expect(withheld[0].reason).toContain('flex-direction: column');
    expect(units[DIRECTORY].contract.props.properties).not.toHaveProperty('orientation');
    expect(units[DIRECTORY].contract.unexposed_parts ?? []).toEqual([]);
  });

  it("the trigger's unexposed_parts entry documents the Header+Trigger composition", () => {
    const unexposedParts = units['accordion-trigger'].contract.unexposed_parts ?? [];
    expect(unexposedParts.some((entry) => /Header/.test(entry.part) || /Header/.test(entry.reason))).toBe(true);
  });

  it('files a Base UI part prop as API and a React attribute as forwarded surface', () => {
    // The filing rule on the family: `multiple` is Base UI's own
    // AccordionRootProps and reaches the contract typed, while `children`
    // and `role` are React's div attributes and stay on the element surface.
    expect(units[DIRECTORY].contract.props.properties.multiple).toEqual({ type: 'boolean' });
    for (const prop of ['children', 'role', 'onClick']) {
      expect(units[DIRECTORY].contract.props.properties, prop).not.toHaveProperty(prop);
    }
  });
});

describe('accordion family in a GTS store', () => {
  function registeredStore(): GTS {
    const gts = new GTS();
    gts.register(componentType);
    // The vocabulary the component type references: a store missing one
    // fails every entity in it rather than one field.
    registerContractTypes((entity) => gts.register(entity));
    // The element surfaces this family's four components name. Three of the
    // four render a <div> and the trigger renders a <button>, so there are
    // two distinct schemas across four components - de-duplicated by $id,
    // because registering the same one twice is not a fact about the family.
    const byId = new Map(Object.values(units).map(({ elementSurface }) => [String(elementSurface.$id), elementSurface]));
    for (const elementSurface of byId.values()) gts.register(elementSurface);
    for (const { contract } of Object.values(units)) gts.register(JSON.parse(JSON.stringify(contract)) as Record<string, unknown>);
    return gts;
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
    expect(units['accordion-trigger'].contract.forwards_to).toBe(elementTypeRef('dom_button'));
    expect(units[DIRECTORY].contract.forwards_to).toBe(elementTypeRef('dom_div'));
  });

  it('fails when the component type is not registered - negative control', () => {
    const gts = new GTS();
    const byId = new Map(Object.values(units).map(({ elementSurface }) => [String(elementSurface.$id), elementSurface]));
    for (const elementSurface of byId.values()) gts.register(elementSurface);
    for (const { contract } of Object.values(units)) gts.register(JSON.parse(JSON.stringify(contract)) as Record<string, unknown>);
    const result = gts.validateInstance(units[DIRECTORY].contract.$id);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Schema not found');
  });

  it('every component validates as an instance of the committed component type', () => {
    // Real here because three of these four (item, trigger, content) omit
    // `family_membership` and all four omit every growth surface, which is
    // exactly the "genuinely absent, not merely undefined" case
    // validateContractInstance's JSON round-trip exists for.
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
