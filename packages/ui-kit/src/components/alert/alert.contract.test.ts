// Conformance for all four Alert contracts (the root and its three parts) -
// one file because the interesting assertions are about how the four
// relate (family membership, composition refs), not about any one of them
// in isolation. See button.contract.test.ts for the per-component
// conformance shape this reuses via testing.ts's assertContractFreshness,
// and radio-group.contract.test.ts for the family shape this follows most
// closely - this family has three flat parts hosted directly by the root
// instead of one, and no part is mounted inside another part.
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

const DIRECTORY = 'alert';
// stem === directory for the root (see compile.ts's resolveTargetExtraction
// default), so it is not listed alongside the three parts below.
const PART_STEMS = ['alert-title', 'alert-description', 'alert-action'] as const;
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
  // Every export here renders a plain div (alert.tsx wraps no primitive at
  // all), so elementKind is never undefined - a defensive message beats a
  // bare "Cannot read properties of undefined" if that ever changes.
  if (!extraction.elementKind) {
    throw new Error(`${stem}: expected a host element kind, extraction resolved none`);
  }
  return { stem, contract, elementSurface: loadElementSurface(extraction.elementKind) };
}

const units: Record<string, CompiledUnit> = Object.fromEntries(ALL_STEMS.map((stem) => [stem, compileUnit(stem)]));
const componentType = buildComponentType();

// The ref every pointer at Alert itself should agree on - built once so a
// typo in one overlay shows up as a mismatch against this, not just against
// itself.
const ROOT_REF = componentRef(DIRECTORY, contractMajor(DIRECTORY, DIRECTORY));

describe('alert family: component type validity', () => {
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

describe('alert family: membership resolves', () => {
  it('the root names the family, calls itself root, and carries all three parts', () => {
    const root = units[DIRECTORY].contract.family_membership;
    expect(root?.name).toBe('alert');
    expect(root?.role).toBe('root');
    expect(root?.members).toEqual(PART_STEMS.map((stem) => componentRef(stem, contractMajor(DIRECTORY, stem))).sort());
  });

  it('every part names the same family, calls itself a part, and lists no members', () => {
    for (const stem of PART_STEMS) {
      const membership = units[stem].contract.family_membership;
      expect(membership?.name, stem).toBe('alert');
      expect(membership?.role, stem).toBe('part');
      expect(membership?.members, stem).toBeUndefined();
    }
  });

  it('every part the root carries ships a compiled contract of its own', () => {
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
    const roster = familyRoster('alert');
    expect(roster.root).toBe(ROOT_REF);
    expect(roster.parts).toEqual(PART_STEMS.map((stem) => componentRef(stem, contractMajor(DIRECTORY, stem))).sort());
  });
});

describe('alert family: what nests where', () => {
  it('the root accepts all three parts and nothing else', () => {
    expect(units[DIRECTORY].contract.accepts).toEqual({
      content: 'specified',
      components: PART_STEMS.map((stem) => componentRef(stem, contractMajor(DIRECTORY, stem))),
    });
  });

  it("every part's mount point is FILLED from the root that accepts it, and only the root", () => {
    // The family's shape read back out of the derivation rather than
    // authored: the root accepts every part, and each part's `mounted_in`
    // is exactly the contract that accepted it. Nothing in any overlay
    // writes a mount point, so the two directions cannot disagree - what is
    // asserted here is that the derivation produces the family the overlays
    // describe, and that no part is hosted inside another part (unlike a
    // nested family such as Accordion's item/trigger/content).
    for (const stem of PART_STEMS) {
      expect(units[stem].contract.mounted_in, stem).toEqual([
        { container: pascalCase(DIRECTORY), component: componentRef(DIRECTORY, contractMajor(DIRECTORY, DIRECTORY)) },
      ]);
    }
  });

  it('gives the root no mount point at all - nothing in the kit mounts an Alert', () => {
    // Absent, not an empty list: no contract accepts the root inside it, and
    // an empty list would read as "may be mounted nowhere".
    expect(units[DIRECTORY].contract.mounted_in).toBeUndefined();
  });

  it('every nesting reference among the family members points inside the family', () => {
    // Resolution itself is the shared suite's check. What this asserts is
    // the family's own shape: every part may only nest under the root, and
    // the root's accepted components are exactly the three parts - a
    // reference leaving the family, among the family's OWN cross-links,
    // would make the parts independently mountable, which is exactly what
    // a compound component is not. AlertAction's own `accepts` names Button,
    // a component outside this family, on purpose (see its overlay) - that
    // reference is a real nesting fact about a different pair of contracts
    // (Alert-family container -> Button), not a family cross-link, so it is
    // deliberately left out of the check below.
    const familyRefs = new Set(Object.values(units).map(({ contract }) => bareGtsId(String(contract.$id))));
    const root = units[DIRECTORY].contract;
    for (const ref of root.accepts.components ?? []) {
      expect(familyRefs.has(ref), `${DIRECTORY}: it names "${ref}", which is not a member of this family`).toBe(true);
    }
    for (const stem of PART_STEMS) {
      const mounts = (units[stem].contract.mounted_in ?? []).map((entry) => entry.component).filter((ref): ref is string => ref !== undefined);
      for (const ref of mounts) {
        expect(familyRefs.has(ref), `${stem}: it is mounted in "${ref}", which is not a member of this family`).toBe(true);
      }
    }
  });
});

describe('alert family in a GTS store', () => {
  function registeredStore(): GTS {
    const gts = new GTS();
    gts.register(componentType);
    // The vocabulary the component type references: a store missing one
    // fails every entity in it rather than one field.
    registerContractTypes((entity) => gts.register(entity));
    // Every export in this family renders a <div>, so there is exactly one
    // distinct element surface across all four components - de-duplicated
    // by $id, because registering the same one twice is not a fact about
    // the family.
    const byId = new Map(Object.values(units).map(({ elementSurface }) => [String(elementSurface.$id), elementSurface]));
    for (const elementSurface of byId.values()) gts.register(elementSurface);
    for (const { contract } of Object.values(units)) gts.register(JSON.parse(JSON.stringify(contract)) as Record<string, unknown>);
    return gts;
  }

  it('all four components in the family validate as an instance of the component type', () => {
    const gts = registeredStore();
    for (const { stem, contract } of Object.values(units)) {
      const result = gts.validateInstance(contract.$id);
      expect(result.ok, `${stem}: ${result.error}`).toBe(true);
    }
  });

  it('every part names the surface of the element it renders', () => {
    // Agreement between the two things that could disagree: the element the
    // extraction resolved and the reference the component holds.
    for (const { stem, contract, elementSurface } of Object.values(units)) {
      expect(contract.forwards_to, stem).toBe(bareGtsId(String(elementSurface.$id)));
    }
    for (const stem of ALL_STEMS) {
      expect(units[stem].contract.forwards_to, stem).toBe(elementTypeRef('dom_div'));
    }
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

  it('all four components validate as an instance of the committed component type', () => {
    // Real here because every part omits `family_membership.members` and
    // every component omits every growth surface, which is exactly the
    // "genuinely absent, not merely undefined" case validateContractInstance's
    // JSON round-trip exists for.
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
