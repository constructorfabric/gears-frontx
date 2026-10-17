// Conformance for all eight PageHeader contracts (the root and its seven
// parts) - one file because the interesting assertions are about how the
// eight relate (family membership, composition refs), not about any one of
// them in isolation. Same nested shape as empty.contract.test.ts: the root
// hosts PageHeaderLeading, PageHeaderContent and PageHeaderActions, and
// PageHeaderContent in turn hosts the eyebrow, the title, the meta and the
// description. Unlike Empty, three parts take any content at all.
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

const DIRECTORY = 'page-header';
const CONTENT = 'page-header-content';
const TITLE = 'page-header-title';
// The parts the root hosts directly, and the ones the content block hosts.
const ROOT_HOSTED = ['page-header-leading', CONTENT, 'page-header-actions'] as const;
const CONTENT_HOSTED = ['page-header-eyebrow', TITLE, 'page-header-meta', 'page-header-description'] as const;
const PART_STEMS = [...ROOT_HOSTED, ...CONTENT_HOSTED] as const;
const ALL_STEMS = [DIRECTORY, ...PART_STEMS] as const;
// The slots that take whatever a page puts in them, and the ones that take text.
const OPEN_SLOTS = ['page-header-leading', 'page-header-meta', 'page-header-actions'] as const;
const TEXT_PARTS = ['page-header-eyebrow', TITLE, 'page-header-description'] as const;

for (const stem of ALL_STEMS) assertContractFreshness(DIRECTORY, stem);

const units = compileUnits(DIRECTORY, ALL_STEMS);
const componentType = buildComponentType();

const ref = (stem: string) => componentRef(stem, contractMajor(DIRECTORY, stem));
const ROOT_REF = ref(DIRECTORY);

describe('page-header family: component type validity', () => {
  it('all eight contracts validate against the component type', () => {
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

describe('page-header family: membership resolves', () => {
  it('the root names the family, calls itself root, and carries all seven parts', () => {
    const root = units[DIRECTORY].contract.family_membership;
    expect(root?.name).toBe('page_header');
    expect(root?.role).toBe('root');
    expect(root?.members).toEqual(PART_STEMS.map(ref).sort());
  });

  it('every part names the same family, calls itself a part, and lists no members', () => {
    for (const stem of PART_STEMS) {
      const membership = units[stem].contract.family_membership;
      expect(membership?.name, stem).toBe('page_header');
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
    const roster = familyRoster('page_header');
    expect(roster.root).toBe(ROOT_REF);
    expect(roster.parts).toEqual(PART_STEMS.map(ref).sort());
  });
});

describe('page-header family: what nests where', () => {
  it('the root accepts the leading slot, the content block and the actions, and nothing else', () => {
    expect(units[DIRECTORY].contract.accepts).toEqual({ content: 'specified', components: ROOT_HOSTED.map(ref) });
  });

  it('the content block accepts the eyebrow, the title, the meta and the description, and nothing else', () => {
    expect(units[CONTENT].contract.accepts).toEqual({ content: 'specified', components: CONTENT_HOSTED.map(ref) });
  });

  it('the leading slot, the meta and the actions take any content', () => {
    for (const stem of OPEN_SLOTS) {
      expect(units[stem].contract.accepts, stem).toEqual({ content: 'unconstrained' });
    }
  });

  it('the eyebrow, the title and the description take text', () => {
    for (const stem of TEXT_PARTS) {
      expect(units[stem].contract.accepts, stem).toEqual({ content: 'specified', text: true });
    }
  });

  it("every part's mount point is FILLED from the member that accepts it, and only that member", () => {
    for (const stem of ROOT_HOSTED) {
      expect(units[stem].contract.mounted_in, stem).toEqual([{ container: pascalCase(DIRECTORY), component: ROOT_REF }]);
    }
    for (const stem of CONTENT_HOSTED) {
      expect(units[stem].contract.mounted_in, stem).toEqual([{ container: pascalCase(CONTENT), component: ref(CONTENT) }]);
    }
  });

  it('gives the root no mount point at all - nothing in the kit mounts a PageHeader', () => {
    expect(units[DIRECTORY].contract.mounted_in).toBeUndefined();
  });
});

describe('page-header family in a GTS store', () => {
  function registeredStore(): GTS {
    return unitStore(Object.values(units));
  }

  it('all eight components validate as an instance of the component type', () => {
    const gts = registeredStore();
    for (const { stem, contract } of Object.values(units)) {
      const result = gts.validateInstance(contract.$id);
      expect(result.ok, `${stem}: ${result.error}`).toBe(true);
    }
  });

  it('the root forwards to the header surface, the title to the h1 one and every other part to the div one', () => {
    for (const { stem, contract, elementSurface } of Object.values(units)) {
      expect(contract.forwards_to, stem).toBe(bareGtsId(String(elementSurface.$id)));
      const expected = stem === DIRECTORY ? 'dom_header' : stem === TITLE ? 'dom_h1' : 'dom_div';
      expect(contract.forwards_to, stem).toBe(elementTypeRef(expected));
    }
  });

  it('fails when the component type is not registered - negative control', () => {
    const gts = unitStore(Object.values(units), { componentType: false, vocabulary: false });
    const result = gts.validateInstance(units[DIRECTORY].contract.$id);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Schema not found');
  });

  it('all eight components validate as an instance of the committed component type', () => {
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
