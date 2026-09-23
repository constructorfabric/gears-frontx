// Conformance for the six contracts of this directory: the Message family
// (the root and its four parts) and MessageGroup, which stacks whole Message
// rows and belongs to no family. One file because the interesting
// assertions are about how the contracts relate (family membership,
// composition refs), not about any one of them in isolation. See
// empty.contract.test.ts for the family shape this follows; unlike Empty,
// only the root names its parts in `accepts` - MessageContent hosts a Bubble
// from another family and so accepts unconstrained content, which leaves
// MessageHeader and MessageFooter without a filled kit mount point.
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

const DIRECTORY = 'message';
const GROUP = 'message-group';
// The parts the root hosts directly, and the ones that go inside
// MessageContent.
const ROOT_HOSTED = ['message-avatar', 'message-content'] as const;
const CONTENT_HOSTED = ['message-header', 'message-footer'] as const;
const PART_STEMS = [...ROOT_HOSTED, ...CONTENT_HOSTED] as const;
const FAMILY_STEMS = [DIRECTORY, ...PART_STEMS] as const;
const ALL_STEMS = [...FAMILY_STEMS, GROUP] as const;

for (const stem of ALL_STEMS) assertContractFreshness(DIRECTORY, stem);

// Every export here renders a plain div (message.tsx wraps no primitive),
// so each one names a surface.
const units = compileUnits(DIRECTORY, ALL_STEMS);
const componentType = buildComponentType();

const ref = (stem: string) => componentRef(stem, contractMajor(DIRECTORY, stem));
const ROOT_REF = ref(DIRECTORY);

describe('message directory: component type validity', () => {
  it('all six contracts validate against the component type', () => {
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

describe('message family: membership resolves', () => {
  it('the root names the family, calls itself root, and carries all four parts', () => {
    const root = units[DIRECTORY].contract.family_membership;
    expect(root?.name).toBe('message');
    expect(root?.role).toBe('root');
    expect(root?.members).toEqual(PART_STEMS.map(ref).sort());
  });

  it('every part names the same family, calls itself a part, and lists no members', () => {
    for (const stem of PART_STEMS) {
      const membership = units[stem].contract.family_membership;
      expect(membership?.name, stem).toBe('message');
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

  it('the root is the only member the roster calls a root, and MessageGroup is not on it', () => {
    const roster = familyRoster('message');
    expect(roster.root).toBe(ROOT_REF);
    expect(roster.parts).toEqual(PART_STEMS.map(ref).sort());
    expect(units[GROUP].contract.family_membership).toBeUndefined();
  });
});

describe('message family: what nests where', () => {
  it('the root accepts the avatar slot and the content column, and nothing else', () => {
    expect(units[DIRECTORY].contract.accepts).toEqual({ content: 'specified', components: ROOT_HOSTED.map(ref) });
  });

  it('the content column, the avatar slot, the header, the footer and the group accept unconstrained content', () => {
    for (const stem of [...PART_STEMS, GROUP]) {
      expect(units[stem].contract.accepts, stem).toEqual({ content: 'unconstrained' });
    }
  });

  it("the root's parts get their mount point FILLED from the root, and only from it", () => {
    for (const stem of ROOT_HOSTED) {
      expect(units[stem].contract.mounted_in, stem).toEqual([{ container: pascalCase(DIRECTORY), component: ROOT_REF }]);
    }
  });

  it('gives the header, the footer, the root and the group no kit mount point', () => {
    // Absent, not an empty list: MessageContent accepts unconstrained
    // content, so nothing names the header or footer, and no contract in
    // the kit names the root or the group inside it.
    for (const stem of [...CONTENT_HOSTED, DIRECTORY, GROUP]) {
      expect(units[stem].contract.mounted_in, stem).toBeUndefined();
    }
  });

  it('every nesting reference in the family points inside the family', () => {
    const familyRefs = new Set(FAMILY_STEMS.map((stem) => bareGtsId(String(units[stem].contract.$id))));
    for (const stem of FAMILY_STEMS) {
      const { contract } = units[stem];
      const mounts = (contract.mounted_in ?? []).map((entry) => entry.component).filter((mount): mount is string => mount !== undefined);
      for (const nested of [...(contract.accepts.components ?? []), ...mounts]) {
        expect(familyRefs.has(nested), `${stem}: it names "${nested}", which is not a member of this family`).toBe(true);
      }
    }
  });
});

describe('message directory: what the schema states', () => {
  it("types the root's align fully, so no member needs a prop statement", () => {
    expect(units[DIRECTORY].contract.props.properties.align).toEqual({ type: 'string', enum: ['end', 'start'] });
    for (const { stem, contract } of Object.values(units)) {
      expect(contract.prop_statements ?? {}, stem).toEqual({});
    }
  });

  it('declares no kit prop on any export but the root', () => {
    for (const stem of [...PART_STEMS, GROUP]) {
      expect(units[stem].contract.props.properties, stem).toEqual({});
    }
  });
});

describe('message directory in a GTS store', () => {
  it('all six components validate as an instance of the component type', () => {
    // Every export renders a <div>, so there is one distinct element
    // surface across the directory, registered once.
    const gts = unitStore(Object.values(units));
    for (const { stem, contract } of Object.values(units)) {
      const result = gts.validateInstance(contract.$id);
      expect(result.ok, `${stem}: ${result.error}`).toBe(true);
    }
  });

  it('every export names the div surface it renders', () => {
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

  it('all six components validate as an instance of the committed component type', () => {
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
