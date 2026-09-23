// Conformance for all eight Table contracts (the root and its seven parts) -
// one file because the interesting assertions are about how the eight
// relate (family membership, composition refs), not about any one of them
// in isolation. See card.contract.test.ts for the two-level family shape
// this follows: the root hosts the caption and the three row groups, each
// row group hosts TableRow, and TableRow hosts the two cell kinds.
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

const DIRECTORY = 'table';
const ROW = 'table-row';
// The parts the root hosts directly, the row groups among them, and the
// cells a row hosts.
const ROOT_HOSTED = ['table-caption', 'table-header', 'table-body', 'table-footer'] as const;
const ROW_GROUPS = ['table-header', 'table-body', 'table-footer'] as const;
const CELLS = ['table-head', 'table-cell'] as const;
const PART_STEMS = [...ROOT_HOSTED, ROW, ...CELLS] as const;
const ALL_STEMS = [DIRECTORY, ...PART_STEMS] as const;

// Each export renders its own native table element (table.tsx wraps no
// primitive), so each one names the surface of that element.
const HOST: Record<(typeof ALL_STEMS)[number], string> = {
  table: 'dom_table',
  'table-caption': 'dom_caption',
  'table-header': 'dom_thead',
  'table-body': 'dom_tbody',
  'table-footer': 'dom_tfoot',
  'table-row': 'dom_tr',
  'table-head': 'dom_th',
  'table-cell': 'dom_td',
};

for (const stem of ALL_STEMS) assertContractFreshness(DIRECTORY, stem);

const units = compileUnits(DIRECTORY, ALL_STEMS);
const componentType = buildComponentType();

const ref = (stem: string) => componentRef(stem, contractMajor(DIRECTORY, stem));
const ROOT_REF = ref(DIRECTORY);

describe('table family: component type validity', () => {
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

describe('table family: membership resolves', () => {
  it('the root names the family, calls itself root, and carries all seven parts', () => {
    const root = units[DIRECTORY].contract.family_membership;
    expect(root?.name).toBe('table');
    expect(root?.role).toBe('root');
    expect(root?.members).toEqual(PART_STEMS.map(ref).sort());
  });

  it('every part names the same family, calls itself a part, and lists no members', () => {
    for (const stem of PART_STEMS) {
      const membership = units[stem].contract.family_membership;
      expect(membership?.name, stem).toBe('table');
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
    const roster = familyRoster('table');
    expect(roster.root).toBe(ROOT_REF);
    expect(roster.parts).toEqual(PART_STEMS.map(ref).sort());
  });
});

describe('table family: what nests where', () => {
  it('the root accepts the caption and the three row groups, and nothing else', () => {
    expect(units[DIRECTORY].contract.accepts).toEqual({ content: 'specified', components: ROOT_HOSTED.map(ref) });
  });

  it('every row group accepts TableRow only', () => {
    for (const stem of ROW_GROUPS) {
      expect(units[stem].contract.accepts, stem).toEqual({ content: 'specified', components: [ref(ROW)] });
    }
  });

  it('a row accepts the heading cell and the data cell, and nothing else', () => {
    expect(units[ROW].contract.accepts).toEqual({ content: 'specified', components: CELLS.map(ref) });
  });

  it('the caption takes text, and both cells take anything', () => {
    expect(units['table-caption'].contract.accepts).toEqual({ content: 'specified', text: true });
    for (const stem of CELLS) {
      expect(units[stem].contract.accepts, stem).toEqual({ content: 'unconstrained' });
    }
  });

  it("every part's mount point is FILLED from the members that accept it, and only those", () => {
    // Nothing in any overlay writes a mount point: each one is derived from
    // an `accepts` list, so the two directions cannot disagree.
    for (const stem of ROOT_HOSTED) {
      expect(units[stem].contract.mounted_in, stem).toEqual([{ container: pascalCase(DIRECTORY), component: ROOT_REF }]);
    }
    expect(units[ROW].contract.mounted_in).toEqual(
      [...ROW_GROUPS].sort().map((stem) => ({ container: pascalCase(stem), component: ref(stem) })),
    );
    for (const stem of CELLS) {
      expect(units[stem].contract.mounted_in, stem).toEqual([{ container: pascalCase(ROW), component: ref(ROW) }]);
    }
  });

  it('gives the root no mount point at all - no kit contract names Table in its accepts', () => {
    expect(units[DIRECTORY].contract.mounted_in).toBeUndefined();
  });

  it('every nesting reference in the family points inside the family', () => {
    const familyRefs = new Set(Object.values(units).map(({ contract }) => bareGtsId(String(contract.$id))));
    for (const { stem, contract } of Object.values(units)) {
      const mounts = (contract.mounted_in ?? []).map((entry) => entry.component).filter((mount): mount is string => mount !== undefined);
      for (const reference of [...(contract.accepts.components ?? []), ...mounts]) {
        expect(familyRefs.has(reference), `${stem}: it names "${reference}", which is not a member of this family`).toBe(true);
      }
    }
  });
});

describe('table family: kit props and growth surfaces', () => {
  it('carries kit props on the root and on TableHead only, every one fully typed', () => {
    // The parts other than TableHead declare nothing of their own: their
    // whole surface is the native element's, behind `forwards_to`.
    expect(Object.keys(units[DIRECTORY].contract.props.properties).sort()).toEqual(['density', 'label', 'variant']);
    expect(Object.keys(units['table-head'].contract.props.properties).sort()).toEqual(['resizable', 'resizeMinWidth']);
    for (const stem of PART_STEMS.filter((s) => s !== 'table-head')) {
      expect(Object.keys(units[stem].contract.props.properties), stem).toEqual([]);
    }
    for (const { stem, contract } of Object.values(units)) {
      expect(contract.prop_statements, stem).toBeUndefined();
    }
  });

  it('declares column resize as TableHead capability, turned on by resizable', () => {
    const capabilities = units['table-head'].contract.capabilities ?? [];
    expect(capabilities.map((capability) => [capability.name, capability.enabled_by])).toEqual([['column_resize', 'resizable']]);
    for (const stem of ALL_STEMS.filter((s) => s !== 'table-head')) {
      expect(units[stem].contract.capabilities, stem).toBeUndefined();
    }
  });

  it('names the two internal elements the kit does not export', () => {
    expect((units[DIRECTORY].contract.unexposed_parts ?? []).map((entry) => entry.part)).toEqual([
      'the horizontal scroll wrapper div',
    ]);
    expect((units['table-head'].contract.unexposed_parts ?? []).some((entry) => /TableColumnResizer/.test(entry.part))).toBe(true);
  });
});

describe('table family in a GTS store', () => {
  it('all eight components validate as an instance of the component type', () => {
    const gts = unitStore(Object.values(units));
    for (const { stem, contract } of Object.values(units)) {
      const result = gts.validateInstance(contract.$id);
      expect(result.ok, `${stem}: ${result.error}`).toBe(true);
    }
  });

  it('every member names the surface of the native element it renders', () => {
    for (const { stem, contract, elementSurface } of Object.values(units)) {
      expect(contract.forwards_to, stem).toBe(bareGtsId(String(elementSurface.$id)));
      expect(contract.forwards_to, stem).toBe(elementTypeRef(HOST[stem as (typeof ALL_STEMS)[number]]));
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
