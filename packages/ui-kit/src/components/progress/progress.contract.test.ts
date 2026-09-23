// Conformance for all five Progress contracts (root, track, indicator,
// label, value) - one file because the interesting assertions are about how
// the five relate (family membership, composition refs, the authored
// outside-the-kit mount), not about any one of them in isolation. See
// accordion.contract.test.ts for the per-family shape this follows;
// assertContractFreshness below reuses the per-component checks of
// button.contract.test.ts through testing.ts.
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

const DIRECTORY = 'progress';
// stem === directory for the root (see compile.ts's resolveTargetExtraction
// default), so it is not listed alongside the four parts below.
const PART_STEMS = ['progress-track', 'progress-indicator', 'progress-label', 'progress-value'] as const;
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
  // Every export here renders a real element (all five wrap a Base UI
  // primitive), so elementKind is never undefined - a defensive message
  // beats a bare "Cannot read properties of undefined" if that ever changes.
  if (!extraction.elementKind) {
    throw new Error(`${stem}: expected a host element kind, extraction resolved none`);
  }
  return { stem, contract, elementSurface: loadElementSurface(extraction.elementKind) };
}

const units: Record<string, CompiledUnit> = Object.fromEntries(ALL_STEMS.map((stem) => [stem, compileUnit(stem)]));
const componentType = buildComponentType();

// The ref every pointer at Progress itself should agree on - built once so a
// typo in one overlay shows up as a mismatch against this, not just against
// itself.
const ROOT_REF = componentRef(DIRECTORY, contractMajor(DIRECTORY, DIRECTORY));

describe('progress family: component type validity', () => {
  it('every one of the five validates against the component type', () => {
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

describe('progress family: membership resolves', () => {
  it('the root names the family, calls itself root, and carries every part', () => {
    const root = units[DIRECTORY].contract.family_membership;
    expect(root?.name).toBe('progress');
    expect(root?.role).toBe('root');
    expect(root?.members).toEqual(
      PART_STEMS.map((stem) => componentRef(stem, contractMajor(DIRECTORY, stem))).sort(),
    );
  });

  it('every part names the same family, calls itself a part, and lists no members', () => {
    for (const stem of PART_STEMS) {
      const membership = units[stem].contract.family_membership;
      expect(membership?.name, stem).toBe('progress');
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
    const roster = familyRoster('progress');
    expect(roster.root).toBe(ROOT_REF);
    expect(roster.parts).toEqual(PART_STEMS.map((stem) => componentRef(stem, contractMajor(DIRECTORY, stem))).sort());
  });
});

describe('progress family: what nests where', () => {
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

  it('the root accepts its label and its value, and nothing else', () => {
    expect(units[DIRECTORY].contract.accepts).toEqual({
      content: 'specified',
      components: [
        componentRef('progress-label', contractMajor(DIRECTORY, 'progress-label')),
        componentRef('progress-value', contractMajor(DIRECTORY, 'progress-value')),
      ],
    });
  });

  it('the track accepts its indicator, and the other parts accept nothing', () => {
    expect(units['progress-track'].contract.accepts).toEqual({
      content: 'specified',
      components: [componentRef('progress-indicator', contractMajor(DIRECTORY, 'progress-indicator'))],
    });
    for (const stem of ['progress-indicator', 'progress-label', 'progress-value'] as const) {
      expect(units[stem].contract.accepts.components, stem).toBeUndefined();
    }
  });

  it("every part's kit mount points are FILLED from the contract that accepts it", () => {
    // The family's shape read back out of the derivation rather than
    // authored: the root accepts the label and the value, the track accepts
    // the indicator, and each filled mount is exactly the contract that
    // accepted it. Nothing in the five overlays writes a component
    // reference into `mounted_in`, so the two directions cannot disagree -
    // what is asserted here is that the derivation produces the family the
    // overlays describe.
    for (const stem of ['progress-label', 'progress-value'] as const) {
      expect(units[stem].contract.mounted_in, stem).toEqual([
        { container: pascalCase(DIRECTORY), component: componentRef(DIRECTORY, contractMajor(DIRECTORY, DIRECTORY)) },
      ]);
    }
    expect(units['progress-indicator'].contract.mounted_in).toEqual([
      {
        container: pascalCase('progress-track'),
        component: componentRef('progress-track', contractMajor(DIRECTORY, 'progress-track')),
      },
    ]);
  });

  it('the track alone states a mount point, and names no component in it', () => {
    // The one authored mount in the family: the kit's wrapper draws its own
    // track, so a standalone track pairs with a root imported from the
    // primitive package - outside the kit, with no contract to fill from.
    // An authored `component` would have been refused by the overlay
    // schema; what is asserted here is that the escape hatch stayed a
    // container-plus-reason.
    const mounts = units['progress-track'].contract.mounted_in ?? [];
    expect(mounts).toHaveLength(1);
    expect(mounts[0].component).toBeUndefined();
    expect(mounts[0].container).toContain('root');
    expect(mounts[0].note).toBeTruthy();
  });

  it('gives the root no mount point at all - nothing in the kit mounts a Progress', () => {
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

describe('progress family: what the schema cannot assert', () => {
  it("the root's prop statements name the six props the schema leaves unasserted, and the compiler emits them into the property descriptions", () => {
    // The measured defect this closes: an agent shown properties that
    // asserted nothing concluded they took plain strings. `value` is
    // `number | null` and `getAriaValueText` is a function, for instance -
    // the compiler emits one JSON type per property, so the overlay's own
    // statement carries the half no schema can state, keyed on the property
    // and emitted into its description beside the `TS:` text.
    const statements = units[DIRECTORY].contract.prop_statements ?? {};
    for (const prop of ['value', 'getAriaValueText', 'format', 'locale', 'render', 'style']) {
      expect(Object.keys(statements), prop).toContain(prop);
      expect(units[DIRECTORY].contract.props.properties[prop].description, prop).toContain(statements[prop].states);
    }
  });

  it("the value part's children statement covers the null-or-function union", () => {
    const statements = units['progress-value'].contract.prop_statements ?? {};
    expect(Object.keys(statements)).toContain('children');
    expect(units['progress-value'].contract.props.properties.children.description).toContain('formattedValue');
  });

  it('the root requires exactly value - the one required prop of the family', () => {
    // `value: number | null` has no `?` in the primitive's props; everything
    // else on all five contracts is optional.
    expect(units[DIRECTORY].contract.props.required).toEqual(['value']);
    for (const stem of PART_STEMS) {
      expect(units[stem].contract.props.required, stem).toEqual([]);
    }
  });

  it('files the primitive API in properties and a React attribute on the element surface', () => {
    // The filing rule on the family: `value` and `min`/`max` are Base UI's
    // own ProgressRootProps and reach the contract's properties, while
    // `children` and `role` are React's div attributes and stay on the
    // element surface.
    for (const prop of ['value', 'min', 'max']) {
      expect(units[DIRECTORY].contract.props.properties, prop).toHaveProperty(prop);
    }
    for (const prop of ['children', 'role', 'onClick']) {
      expect(units[DIRECTORY].contract.props.properties, prop).not.toHaveProperty(prop);
    }
    expect(units[DIRECTORY].contract.props.properties.value.type).toBeUndefined();
    expect(units[DIRECTORY].contract.props.properties.value.description).toMatch(/^TS: /);
  });
});

describe('progress family in a GTS store', () => {
  function registeredStore(): GTS {
    const gts = new GTS();
    gts.register(componentType);
    // The vocabulary the component type references: a store missing one
    // fails every entity in it rather than one field.
    registerContractTypes((entity) => gts.register(entity));
    // The element surfaces this family's five components name. Three render
    // a <div> and two a <span>, so there are two distinct schemas across
    // five components - de-duplicated by $id, because registering the same
    // one twice is not a fact about the family.
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
    // stating on this family in particular, because it is a family that
    // spans two elements - the root, track and indicator render a <div>,
    // the label and value a <span> - so a family shares a root and not a
    // surface.
    for (const { stem, contract, elementSurface } of Object.values(units)) {
      expect(contract.forwards_to, stem).toBe(bareGtsId(String(elementSurface.$id)));
    }
    for (const stem of ['progress-track', 'progress-indicator'] as const) {
      expect(units[stem].contract.forwards_to, stem).toBe(elementTypeRef('dom_div'));
    }
    for (const stem of ['progress-label', 'progress-value'] as const) {
      expect(units[stem].contract.forwards_to, stem).toBe(elementTypeRef('dom_span'));
    }
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
    // Real here because every part omits `family_membership` members and
    // the track omits most growth surfaces, which is exactly the
    // "genuinely absent, not merely undefined" case
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
