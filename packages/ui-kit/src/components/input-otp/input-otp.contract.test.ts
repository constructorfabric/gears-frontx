// Conformance for all four InputOtp contracts (root, group, slot,
// separator) - one file because the interesting assertions are about how
// the four relate (family membership, composition refs), not about any one
// of them in isolation. See button.contract.test.ts for the per-component
// conformance shape this reuses via testing.ts's assertContractFreshness,
// and tabs.contract.test.ts for the four-part family this follows.
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
// seconds on a CI-class runner - so only CI hits vitest's default test
// timeout. Must run before any describe()/it() in the file; see
// applyContractTestTimeout's own comment in testing.ts.
applyContractTestTimeout();

const DIRECTORY = 'input-otp';
// stem === directory for the root (see compile.ts's resolveTargetExtraction
// default), so it is not listed alongside the three parts below.
const PART_STEMS = ['input-otp-group', 'input-otp-slot', 'input-otp-separator'] as const;
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
  // Every export here renders a real element (the group a plain <div>, the
  // other three a Base UI part), so elementKind is never undefined - a
  // defensive message beats a bare "Cannot read properties of undefined" if
  // that ever changes.
  if (!extraction.elementKind) {
    throw new Error(`${stem}: expected a host element kind, extraction resolved none`);
  }
  return { stem, contract, elementSurface: loadElementSurface(extraction.elementKind) };
}

const units: Record<string, CompiledUnit> = Object.fromEntries(ALL_STEMS.map((stem) => [stem, compileUnit(stem)]));
const componentType = buildComponentType();

const ROOT_REF = componentRef(DIRECTORY, contractMajor(DIRECTORY, DIRECTORY));
const partRef = (stem: string) => componentRef(stem, contractMajor(DIRECTORY, stem));

describe('input-otp family: component type validity', () => {
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

describe('input-otp family: membership resolves', () => {
  it('the root names the family, calls itself root, and carries every part', () => {
    const root = units[DIRECTORY].contract.family_membership;
    expect(root?.name).toBe('input_otp');
    expect(root?.role).toBe('root');
    expect(root?.members).toEqual(PART_STEMS.map(partRef).sort());
  });

  it('every part names the same family, calls itself a part, and lists no members', () => {
    for (const stem of PART_STEMS) {
      const membership = units[stem].contract.family_membership;
      expect(membership?.name, stem).toBe('input_otp');
      expect(membership?.role, stem).toBe('part');
      expect(membership?.members, stem).toBeUndefined();
    }
  });

  it('every part the root carries ships a compiled contract of its own', () => {
    for (const ref of units[DIRECTORY].contract.family_membership?.members ?? []) {
      const target = resolveComponentRef(ref);
      expect(target.contractId, `${ref}: ${target.stem} ships no compiled contract`).toBe(ref);
    }
  });

  it('the root is the only member the roster calls a root', () => {
    const roster = familyRoster('input_otp');
    expect(roster.root).toBe(ROOT_REF);
    expect(roster.parts).toEqual(PART_STEMS.map(partRef).sort());
  });
});

describe('input-otp family: what nests where', () => {
  function nestingRefs(meaning: CompiledContract): string[] {
    const mounts = (meaning.mounted_in ?? [])
      .map((entry) => entry.component)
      .filter((ref): ref is string => ref !== undefined);
    return [...(meaning.accepts.components ?? []), ...mounts];
  }

  it('the root accepts InputOtpGroup and InputOtpSeparator and nothing else', () => {
    expect(units[DIRECTORY].contract.accepts).toEqual({
      content: 'specified',
      components: [partRef('input-otp-group'), partRef('input-otp-separator')],
    });
  });

  it('the group accepts InputOtpSlot and nothing else', () => {
    expect(units['input-otp-group'].contract.accepts).toEqual({
      content: 'specified',
      components: [partRef('input-otp-slot')],
    });
  });

  it('the slot, a native input, accepts nothing, and the separator examines nothing about its children', () => {
    expect(units['input-otp-slot'].contract.accepts).toEqual({ content: 'nothing' });
    expect(units['input-otp-separator'].contract.accepts).toEqual({ content: 'unconstrained' });
  });

  it("every part's mount points are FILLED from the contract that accepts it", () => {
    for (const stem of ['input-otp-group', 'input-otp-separator'] as const) {
      expect(units[stem].contract.mounted_in, stem).toEqual([{ container: pascalCase(DIRECTORY), component: ROOT_REF }]);
    }
    expect(units['input-otp-slot'].contract.mounted_in).toEqual([
      { container: pascalCase('input-otp-group'), component: partRef('input-otp-group') },
    ]);
  });

  it('gives the root no mount point at all - nothing in the kit mounts an InputOtp', () => {
    expect(units[DIRECTORY].contract.mounted_in).toBeUndefined();
  });

  it('every nesting reference in the family points inside the family', () => {
    const familyRefs = new Set(Object.values(units).map(({ contract }) => bareGtsId(String(contract.$id))));
    for (const { stem, contract } of Object.values(units)) {
      for (const ref of nestingRefs(contract)) {
        expect(familyRefs.has(ref), `${stem}: it names "${ref}", which is not a member of this family`).toBe(true);
      }
    }
  });
});

describe('input-otp family: what the schema cannot assert', () => {
  it("the root's callbacks and normalizer are covered by prop statements the compiler emits into the property description", () => {
    const statements = units[DIRECTORY].contract.prop_statements ?? {};
    const properties = units[DIRECTORY].contract.props.properties;
    for (const prop of ['onValueChange', 'onValueComplete', 'onValueInvalid', 'normalizeValue']) {
      expect(Object.keys(statements), prop).toContain(prop);
      expect(properties[prop].description, prop).toContain(statements[prop].states);
    }
  });

  it('the controlled value is a plain string the schema states in full, so it carries no prop statement', () => {
    // Unlike a generic-typed `value` (RadioGroup, Tabs), OTPField types
    // `value`/`defaultValue` as string, so an overlay statement for either
    // would be refused.
    const properties = units[DIRECTORY].contract.props.properties;
    expect(properties.value).toEqual({ type: 'string' });
    expect(properties.defaultValue).toEqual({ type: 'string' });
    const statements = units[DIRECTORY].contract.prop_statements ?? {};
    expect(Object.keys(statements)).not.toContain('value');
    expect(Object.keys(statements)).not.toContain('defaultValue');
  });

  it('files a Base UI part prop as API and a React attribute as forwarded surface', () => {
    expect(units[DIRECTORY].contract.props.properties['length']).toEqual({ type: 'number' });
    expect(units[DIRECTORY].contract.props.required).toContain('length');
    for (const stem of ALL_STEMS) {
      for (const prop of ['children', 'role', 'onClick']) {
        expect(units[stem].contract.props.properties, `${stem}.${prop}`).not.toHaveProperty(prop);
      }
    }
  });

  it('the slot declares no index prop - position comes from render order', () => {
    expect(units['input-otp-slot'].contract.props.properties).not.toHaveProperty('index');
  });

  it("the root's unexposed_parts entry documents the hidden validation input", () => {
    const unexposedParts = units[DIRECTORY].contract.unexposed_parts ?? [];
    expect(unexposedParts.some((entry) => /hidden validation input/.test(entry.part))).toBe(true);
  });
});

describe('input-otp family in a GTS store', () => {
  function registeredStore(): GTS {
    const gts = new GTS();
    gts.register(componentType);
    registerContractTypes((entity) => gts.register(entity));
    // Three of the four render a <div> and the slot renders an <input>, so
    // there are two distinct schemas across four components - de-duplicated
    // by $id, because registering the same one twice is not a fact about the
    // family.
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
    for (const { stem, contract, elementSurface } of Object.values(units)) {
      expect(contract.forwards_to, stem).toBe(bareGtsId(String(elementSurface.$id)));
    }
    expect(units['input-otp-slot'].contract.forwards_to).toBe(elementTypeRef('dom_input'));
    for (const stem of [DIRECTORY, 'input-otp-group', 'input-otp-separator'] as const) {
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
