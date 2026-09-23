// Conformance for all three Collapsible contracts (root, trigger, content) -
// one file because the interesting assertions are about how the three relate
// (family membership, composition refs), not about any one of them in
// isolation. See button.contract.test.ts for the per-component conformance
// shape this reuses via testing.ts's assertContractFreshness, and
// accordion.contract.test.ts for the larger family this follows - here both
// parts sit directly under the root, so there is one level of mounting.
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

// assertContractFreshness below builds a real TypeScript program, which can
// exceed vitest's default test timeout on a CI-class runner. Must run before
// any describe()/it() in the file; see applyContractTestTimeout's own comment
// in testing.ts.
applyContractTestTimeout();

const DIRECTORY = 'collapsible';
// stem === directory for the root (see compile.ts's resolveTargetExtraction
// default), so it is not listed alongside the two parts below.
const PART_STEMS = ['collapsible-trigger', 'collapsible-content'] as const;
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
  // Every export here wraps a Base UI Collapsible part that renders a real
  // element, so elementKind is never undefined - a defensive message beats a
  // bare "Cannot read properties of undefined" if that ever changes.
  if (!extraction.elementKind) {
    throw new Error(`${stem}: expected a host element kind, extraction resolved none`);
  }
  return { stem, contract, elementSurface: loadElementSurface(extraction.elementKind) };
}

const units: Record<string, CompiledUnit> = Object.fromEntries(ALL_STEMS.map((stem) => [stem, compileUnit(stem)]));
const componentType = buildComponentType();

const ROOT_REF = componentRef(DIRECTORY, contractMajor(DIRECTORY, DIRECTORY));
const PART_REFS = PART_STEMS.map((stem) => componentRef(stem, contractMajor(DIRECTORY, stem)));

describe('collapsible family: component type validity', () => {
  it('all three validate against the component type', () => {
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

describe('collapsible family: membership resolves', () => {
  it('the root names the family, calls itself root, and carries both parts', () => {
    const root = units[DIRECTORY].contract.family_membership;
    expect(root?.name).toBe('collapsible');
    expect(root?.role).toBe('root');
    expect(root?.members).toEqual([...PART_REFS].sort());
  });

  it('every part names the same family, calls itself a part, and lists no members', () => {
    for (const stem of PART_STEMS) {
      const membership = units[stem].contract.family_membership;
      expect(membership?.name, stem).toBe('collapsible');
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
    const roster = familyRoster('collapsible');
    expect(roster.root).toBe(ROOT_REF);
    expect(roster.parts).toEqual([...PART_REFS].sort());
  });
});

describe('collapsible family: what nests where', () => {
  it('the root accepts the trigger and the content, nothing else', () => {
    expect(units[DIRECTORY].contract.accepts).toEqual({ content: 'specified', components: PART_REFS });
  });

  it('the trigger takes its caption as text and the panel takes any content', () => {
    expect(units['collapsible-trigger'].contract.accepts).toEqual({ content: 'specified', text: true });
    expect(units['collapsible-content'].contract.accepts).toEqual({ content: 'unconstrained' });
  });

  it("both parts' mount points are FILLED from the root that accepts them", () => {
    // Nothing in the three overlays writes a mount point, so the two
    // directions cannot disagree - what is asserted here is that the
    // derivation produces the family the overlays describe.
    for (const stem of PART_STEMS) {
      expect(units[stem].contract.mounted_in, stem).toEqual([{ container: pascalCase(DIRECTORY), component: ROOT_REF }]);
    }
  });

  it('gives the root no mount point at all - nothing in the kit mounts a Collapsible', () => {
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

describe('collapsible family: what the schema cannot assert', () => {
  it("the root's onOpenChange statement reaches the property description", () => {
    const statements = units[DIRECTORY].contract.prop_statements ?? {};
    expect(Object.keys(statements)).toContain('onOpenChange');
    expect(units[DIRECTORY].contract.props.properties.onOpenChange.description).toContain(statements.onOpenChange.states);
  });

  it('every member states render and style, whose function forms no schema type covers', () => {
    for (const stem of ALL_STEMS) {
      const statements = units[stem].contract.prop_statements ?? {};
      for (const prop of ['render', 'style']) {
        expect(Object.keys(statements), `${stem}.${prop}`).toContain(prop);
        expect(units[stem].contract.props.properties[prop].description, `${stem}.${prop}`).toContain(statements[prop].states);
      }
    }
  });

  it('files a Base UI part prop as API and a React attribute as forwarded surface', () => {
    // `open`/`defaultOpen`/`disabled` are Base UI's own CollapsibleRootProps,
    // `keepMounted`/`hiddenUntilFound` its CollapsiblePanelProps and
    // `nativeButton` its trigger's NativeButtonProps - all reach the
    // contract typed - while `children`, `role` and `onClick` are React's
    // element attributes and stay on the element surface.
    const root = units[DIRECTORY].contract.props.properties;
    for (const prop of ['open', 'defaultOpen', 'disabled']) expect(root[prop], prop).toEqual({ type: 'boolean' });
    const content = units['collapsible-content'].contract.props.properties;
    for (const prop of ['keepMounted', 'hiddenUntilFound']) expect(content[prop], prop).toEqual({ type: 'boolean' });
    expect(units['collapsible-trigger'].contract.props.properties.nativeButton).toEqual({ type: 'boolean' });
    for (const stem of ALL_STEMS) {
      for (const prop of ['children', 'role', 'onClick']) {
        expect(units[stem].contract.props.properties, `${stem}.${prop}`).not.toHaveProperty(prop);
      }
    }
  });
});

describe('collapsible family in a GTS store', () => {
  function registeredStore(): GTS {
    const gts = new GTS();
    gts.register(componentType);
    registerContractTypes((entity) => gts.register(entity));
    // The root and the panel render a <div>, the trigger a <button>: two
    // distinct surfaces across three components, de-duplicated by $id.
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

  it('each member names the surface of the element it renders', () => {
    for (const { stem, contract, elementSurface } of Object.values(units)) {
      expect(contract.forwards_to, stem).toBe(bareGtsId(String(elementSurface.$id)));
    }
    expect(units[DIRECTORY].contract.forwards_to).toBe(elementTypeRef('dom_div'));
    expect(units['collapsible-trigger'].contract.forwards_to).toBe(elementTypeRef('dom_button'));
    expect(units['collapsible-content'].contract.forwards_to).toBe(elementTypeRef('dom_div'));
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
