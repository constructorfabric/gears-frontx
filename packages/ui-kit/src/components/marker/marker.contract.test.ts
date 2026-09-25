// Conformance for the three marker contracts (the root and its two parts) -
// one file because the interesting assertions are about how the three
// relate (family membership, composition refs), not about any one of them
// in isolation. See empty.contract.test.ts for the family shape this
// follows; this family is flat: the root hosts both parts directly.
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

const DIRECTORY = 'marker';
const PART_STEMS = ['marker-icon', 'marker-content'] as const;
const ALL_STEMS = [DIRECTORY, ...PART_STEMS] as const;

for (const stem of ALL_STEMS) assertContractFreshness(DIRECTORY, stem);

const units = compileUnits(DIRECTORY, ALL_STEMS);
const componentType = buildComponentType();

const ref = (stem: string) => componentRef(stem, contractMajor(DIRECTORY, stem));
const ROOT_REF = ref(DIRECTORY);

describe('marker family: component type validity', () => {
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

describe('marker family: membership resolves', () => {
  it('the root names the family, calls itself root, and carries both parts', () => {
    const root = units[DIRECTORY].contract.family_membership;
    expect(root?.name).toBe('marker');
    expect(root?.role).toBe('root');
    expect(root?.members).toEqual(PART_STEMS.map(ref).sort());
  });

  it('every part names the same family, calls itself a part, and lists no members', () => {
    for (const stem of PART_STEMS) {
      const membership = units[stem].contract.family_membership;
      expect(membership?.name, stem).toBe('marker');
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

  it('the root is the only member the roster calls a root', () => {
    const roster = familyRoster('marker');
    expect(roster.root).toBe(ROOT_REF);
    expect(roster.parts).toEqual(PART_STEMS.map(ref).sort());
  });
});

describe('marker family: what nests where', () => {
  it('the root accepts its two parts and nothing else, with no bare text', () => {
    expect(units[DIRECTORY].contract.accepts).toEqual({ content: 'specified', components: PART_STEMS.map(ref) });
  });

  it('both parts take any content', () => {
    for (const stem of PART_STEMS) {
      expect(units[stem].contract.accepts, stem).toEqual({ content: 'unconstrained' });
    }
  });

  it("every part's mount point is FILLED from the root's accepts, and only the root", () => {
    for (const stem of PART_STEMS) {
      expect(units[stem].contract.mounted_in, stem).toEqual([{ container: pascalCase(DIRECTORY), component: ROOT_REF }]);
    }
  });

  it('gives the root no mount point at all - nothing in the kit names Marker in its accepts', () => {
    expect(units[DIRECTORY].contract.mounted_in).toBeUndefined();
  });

  it('every nesting reference in the family points inside the family', () => {
    const familyRefs = new Set(Object.values(units).map(({ contract }) => bareGtsId(String(contract.$id))));
    for (const { stem, contract } of Object.values(units)) {
      const mounts = (contract.mounted_in ?? []).map((entry) => entry.component).filter((mount): mount is string => mount !== undefined);
      for (const nested of [...(contract.accepts.components ?? []), ...mounts]) {
        expect(familyRefs.has(nested), `${stem}: it names "${nested}", which is not a member of this family`).toBe(true);
      }
    }
  });
});

describe('marker family: what the schema cannot assert', () => {
  it("the root's render prop carries the one prop statement, emitted into its description", () => {
    const statements = units[DIRECTORY].contract.prop_statements ?? {};
    expect(Object.keys(statements)).toEqual(['render']);
    expect(units[DIRECTORY].contract.props.properties.render.description).toContain(statements.render.states);
  });

  it('neither part declares a kit prop of its own, and no contract has a partially typed prop left over', () => {
    for (const stem of PART_STEMS) {
      expect(units[stem].contract.props.properties, stem).toEqual({});
      expect(units[stem].contract.prop_statements, stem).toBeUndefined();
    }
    for (const { stem, contract } of Object.values(units)) {
      expect(Object.keys(contract['x-uikit'].partially_typed_props), stem).toEqual([]);
    }
  });

  it('the cva builder is a companion of the root', () => {
    expect((units[DIRECTORY].contract.companions ?? []).map((entry) => entry.export)).toEqual(['markerVariants']);
  });
});

describe('marker family in a GTS store', () => {
  function registeredStore(): GTS {
    return unitStore(Object.values(units));
  }

  it('all three components validate as an instance of the component type', () => {
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
    for (const stem of PART_STEMS) {
      expect(units[stem].contract.forwards_to, stem).toBe(elementTypeRef('dom_span'));
    }
  });

  it('fails when the component type is not registered - negative control', () => {
    const gts = unitStore(Object.values(units), { componentType: false, vocabulary: false });
    const result = gts.validateInstance(units[DIRECTORY].contract.$id);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Schema not found');
  });

  it('all three components validate as an instance of the committed component type', () => {
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
