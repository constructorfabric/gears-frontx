// Conformance for all seven Card contracts (the root and its six parts) -
// one file because the interesting assertions are about how the seven
// relate (family membership, composition refs), not about any one of them
// in isolation. See empty.contract.test.ts for the two-level family shape
// this follows: the root hosts CardHeader, CardContent and CardFooter, and
// CardHeader in turn hosts CardTitle, CardDescription and CardAction.
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

const DIRECTORY = 'card';
const HEADER = 'card-header';
// The parts the root hosts directly, and the ones the header hosts.
const ROOT_HOSTED = [HEADER, 'card-content', 'card-footer'] as const;
const HEADER_HOSTED = ['card-title', 'card-description', 'card-action'] as const;
const PART_STEMS = [...ROOT_HOSTED, ...HEADER_HOSTED] as const;
const ALL_STEMS = [DIRECTORY, ...PART_STEMS] as const;

for (const stem of ALL_STEMS) assertContractFreshness(DIRECTORY, stem);

// Every export here renders a plain div (card.tsx wraps no primitive), so
// each one names a surface.
const units = compileUnits(DIRECTORY, ALL_STEMS);
const componentType = buildComponentType();

const ref = (stem: string) => componentRef(stem, contractMajor(DIRECTORY, stem));
const ROOT_REF = ref(DIRECTORY);

describe('card family: component type validity', () => {
  it('all seven contracts validate against the component type', () => {
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

describe('card family: membership resolves', () => {
  it('the root names the family, calls itself root, and carries all six parts', () => {
    const root = units[DIRECTORY].contract.family_membership;
    expect(root?.name).toBe('card');
    expect(root?.role).toBe('root');
    expect(root?.members).toEqual(PART_STEMS.map(ref).sort());
  });

  it('every part names the same family, calls itself a part, and lists no members', () => {
    for (const stem of PART_STEMS) {
      const membership = units[stem].contract.family_membership;
      expect(membership?.name, stem).toBe('card');
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
    const roster = familyRoster('card');
    expect(roster.root).toBe(ROOT_REF);
    expect(roster.parts).toEqual(PART_STEMS.map(ref).sort());
  });
});

describe('card family: what nests where', () => {
  it('the root accepts the header, the content and the footer, and nothing else', () => {
    expect(units[DIRECTORY].contract.accepts).toEqual({ content: 'specified', components: ROOT_HOSTED.map(ref) });
  });

  it('the header accepts title, description and action, and nothing else', () => {
    expect(units[HEADER].contract.accepts).toEqual({ content: 'specified', components: HEADER_HOSTED.map(ref) });
  });

  it('the header action accepts Button, the one reference that leaves the family', () => {
    expect(units['card-action'].contract.accepts).toEqual({
      content: 'specified',
      components: [componentRef('button', contractMajor('button', 'button'))],
    });
  });

  it("every part's mount point is FILLED from the member that accepts it, and only that member", () => {
    // Nothing in any overlay writes a mount point: each one is derived from
    // an `accepts` list, so the two directions cannot disagree.
    for (const stem of ROOT_HOSTED) {
      expect(units[stem].contract.mounted_in, stem).toEqual([{ container: pascalCase(DIRECTORY), component: ROOT_REF }]);
    }
    for (const stem of HEADER_HOSTED) {
      expect(units[stem].contract.mounted_in, stem).toEqual([{ container: pascalCase(HEADER), component: ref(HEADER) }]);
    }
  });

  it('gives the root no mount point at all - nothing in the kit mounts a Card', () => {
    expect(units[DIRECTORY].contract.mounted_in).toBeUndefined();
  });

  it('every nesting reference among the family containers points inside the family', () => {
    // CardAction's own `accepts` names Button on purpose (see its overlay
    // and the test above) - a nesting fact about a different pair of
    // contracts, not a family cross-link, so it is left out here.
    const familyRefs = new Set(Object.values(units).map(({ contract }) => bareGtsId(String(contract.$id))));
    for (const stem of [DIRECTORY, HEADER]) {
      for (const accepted of units[stem].contract.accepts.components ?? []) {
        expect(familyRefs.has(accepted), `${stem}: it names "${accepted}", which is not a member of this family`).toBe(true);
      }
    }
    for (const stem of PART_STEMS) {
      const mounts = (units[stem].contract.mounted_in ?? [])
        .map((entry) => entry.component)
        .filter((mount): mount is string => mount !== undefined);
      for (const mount of mounts) {
        expect(familyRefs.has(mount), `${stem}: it is mounted in "${mount}", which is not a member of this family`).toBe(true);
      }
    }
  });
});

describe('card family: leaf content and the two axes', () => {
  it('the two text parts take text, and the body and the footer take anything', () => {
    for (const stem of ['card-title', 'card-description']) {
      expect(units[stem].contract.accepts, stem).toEqual({ content: 'specified', text: true });
    }
    for (const stem of ['card-content', 'card-footer']) {
      expect(units[stem].contract.accepts, stem).toEqual({ content: 'unconstrained' });
    }
  });

  it('carries `size` on the root only and `typography` on the two text parts only', () => {
    // The code is the owner of both axes (card.tsx's cva recipes); this
    // checks they reached the contracts they belong to and no other.
    for (const stem of ALL_STEMS) {
      const properties = units[stem].contract.props.properties;
      expect(Object.keys(properties).includes('size'), `${stem}.size`).toBe(stem === DIRECTORY);
      expect(Object.keys(properties).includes('typography'), `${stem}.typography`).toBe(
        stem === 'card-title' || stem === 'card-description',
      );
    }
  });
});

describe('card family in a GTS store', () => {
  it('all seven components validate as an instance of the component type', () => {
    // Every export renders a <div>, so there is one distinct element
    // surface across the family, registered once.
    const gts = unitStore(Object.values(units));
    for (const { stem, contract } of Object.values(units)) {
      const result = gts.validateInstance(contract.$id);
      expect(result.ok, `${stem}: ${result.error}`).toBe(true);
    }
  });

  it('every member names the div surface it renders', () => {
    for (const { stem, contract, elementSurface } of Object.values(units)) {
      expect(contract.forwards_to, stem).toBe(bareGtsId(String(elementSurface.$id)));
      expect(contract.forwards_to, stem).toBe(elementTypeRef('dom_div'));
    }
  });

  it('fails when the component type is not registered - negative control', () => {
    const gts = unitStore(Object.values(units), { componentType: false, vocabulary: false });
    const result = gts.validateInstance(units[DIRECTORY].contract.$id);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Schema not found');
  });

  it('all seven components validate as an instance of the committed component type', () => {
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
