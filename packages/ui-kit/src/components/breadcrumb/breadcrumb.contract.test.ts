// Conformance for all seven Breadcrumb contracts (the root and its six
// parts) - one file because the interesting assertions are about how the
// seven relate (family membership, composition refs), not about any one of
// them in isolation. See card.contract.test.ts for the multi-level family
// shape this follows: the root hosts BreadcrumbList, the list hosts
// BreadcrumbItem and BreadcrumbSeparator, and the item hosts
// BreadcrumbLink, BreadcrumbPage and BreadcrumbEllipsis.
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

const DIRECTORY = 'breadcrumb';
const LIST = 'breadcrumb-list';
const ITEM = 'breadcrumb-item';
const LIST_HOSTED = [ITEM, 'breadcrumb-separator'] as const;
const ITEM_HOSTED = ['breadcrumb-link', 'breadcrumb-page', 'breadcrumb-ellipsis'] as const;
const PART_STEMS = [LIST, ...LIST_HOSTED, ...ITEM_HOSTED] as const;
const ALL_STEMS = [DIRECTORY, ...PART_STEMS] as const;

for (const stem of ALL_STEMS) assertContractFreshness(DIRECTORY, stem);

const units = compileUnits(DIRECTORY, ALL_STEMS);
const componentType = buildComponentType();

const ref = (stem: string) => componentRef(stem, contractMajor(DIRECTORY, stem));
const ROOT_REF = ref(DIRECTORY);

describe('breadcrumb family: component type validity', () => {
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

describe('breadcrumb family: membership resolves', () => {
  it('the root names the family, calls itself root, and carries all six parts', () => {
    const root = units[DIRECTORY].contract.family_membership;
    expect(root?.name).toBe('breadcrumb');
    expect(root?.role).toBe('root');
    expect(root?.members).toEqual(PART_STEMS.map(ref).sort());
  });

  it('every part names the same family, calls itself a part, and lists no members', () => {
    for (const stem of PART_STEMS) {
      const membership = units[stem].contract.family_membership;
      expect(membership?.name, stem).toBe('breadcrumb');
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
    const roster = familyRoster('breadcrumb');
    expect(roster.root).toBe(ROOT_REF);
    expect(roster.parts).toEqual(PART_STEMS.map(ref).sort());
  });
});

describe('breadcrumb family: what nests where', () => {
  it('the root accepts the list and nothing else', () => {
    expect(units[DIRECTORY].contract.accepts).toEqual({ content: 'specified', components: [ref(LIST)] });
  });

  it('the list accepts items and separators, and nothing else', () => {
    expect(units[LIST].contract.accepts).toEqual({ content: 'specified', components: LIST_HOSTED.map(ref) });
  });

  it('the item accepts a link, a page or an ellipsis, and nothing else', () => {
    expect(units[ITEM].contract.accepts).toEqual({ content: 'specified', components: ITEM_HOSTED.map(ref) });
  });

  it('the text parts take text and the ellipsis takes nothing', () => {
    for (const stem of ['breadcrumb-link', 'breadcrumb-page', 'breadcrumb-separator']) {
      expect(units[stem].contract.accepts, stem).toEqual({ content: 'specified', text: true });
    }
    expect(units['breadcrumb-ellipsis'].contract.accepts).toEqual({ content: 'nothing' });
  });

  it("every part's mount point is FILLED from the member that accepts it, and only that member", () => {
    expect(units[LIST].contract.mounted_in).toEqual([{ container: pascalCase(DIRECTORY), component: ROOT_REF }]);
    for (const stem of LIST_HOSTED) {
      expect(units[stem].contract.mounted_in, stem).toEqual([{ container: pascalCase(LIST), component: ref(LIST) }]);
    }
    for (const stem of ITEM_HOSTED) {
      expect(units[stem].contract.mounted_in, stem).toEqual([{ container: pascalCase(ITEM), component: ref(ITEM) }]);
    }
  });

  it('gives the root no mount point at all - nothing in the kit mounts a Breadcrumb', () => {
    expect(units[DIRECTORY].contract.mounted_in).toBeUndefined();
  });

  it('every nesting reference among the family containers points inside the family', () => {
    const familyRefs = new Set(Object.values(units).map(({ contract }) => bareGtsId(String(contract.$id))));
    for (const { stem, contract } of Object.values(units)) {
      const mounts = (contract.mounted_in ?? [])
        .map((entry) => entry.component)
        .filter((mount): mount is string => mount !== undefined);
      for (const target of [...(contract.accepts.components ?? []), ...mounts]) {
        expect(familyRefs.has(target), `${stem}: it names "${target}", which is not a member of this family`).toBe(true);
      }
    }
  });
});

describe('breadcrumb family: what the schema cannot assert', () => {
  it('states the link element replacement and the separator content in the property descriptions', () => {
    const link = units['breadcrumb-link'].contract;
    expect(link.props.properties.render.description).toContain(link.prop_statements?.render.states);
    const separator = units['breadcrumb-separator'].contract;
    expect(separator.props.properties.children.description).toContain(separator.prop_statements?.children.states);
  });
});

describe('breadcrumb family in a GTS store', () => {
  it('all seven components validate as an instance of the component type', () => {
    const gts = unitStore(Object.values(units));
    for (const { stem, contract } of Object.values(units)) {
      const result = gts.validateInstance(contract.$id);
      expect(result.ok, `${stem}: ${result.error}`).toBe(true);
    }
  });

  it('every member names the surface of the element it renders', () => {
    const expected: Record<string, string> = {
      [DIRECTORY]: 'dom_nav',
      [LIST]: 'dom_ol',
      [ITEM]: 'dom_li',
      'breadcrumb-separator': 'dom_li',
      'breadcrumb-link': 'dom_a',
      'breadcrumb-page': 'dom_span',
      'breadcrumb-ellipsis': 'dom_span',
    };
    for (const { stem, contract, elementSurface } of Object.values(units)) {
      expect(contract.forwards_to, stem).toBe(bareGtsId(String(elementSurface.$id)));
      expect(contract.forwards_to, stem).toBe(elementTypeRef(expected[stem]));
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
