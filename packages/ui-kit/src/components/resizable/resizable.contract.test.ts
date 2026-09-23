// Conformance for the three contracts of the resizable directory: the
// ResizablePanelGroup root and its two parts, ResizablePanel and
// ResizableHandle. The directory exports no component named after itself,
// so the root keeps its own stem. One file because the interesting
// assertions are about how the three relate; the per-component shape comes
// from testing.ts's assertContractFreshness.
import Ajv2020 from 'ajv/dist/2020';
import { describe, expect, it } from 'vitest';

import {
  addContractTypes,
  buildComponentType,
  contractMajor,
  familyRoster,
  findUntypedPropMismatches,
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

const DIRECTORY = 'resizable';
const FAMILY = 'resizable';
const ROOT = 'resizable-panel-group';
const PART_STEMS = ['resizable-panel', 'resizable-handle'] as const;
const ALL_STEMS = [ROOT, ...PART_STEMS] as const;

for (const stem of ALL_STEMS) assertContractFreshness(DIRECTORY, stem);

const units = compileUnits(DIRECTORY, ALL_STEMS);
const componentType = buildComponentType();
const ref = (stem: string) => componentRef(stem, contractMajor(DIRECTORY, stem));

describe('resizable family: component type validity', () => {
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

describe('resizable family: membership resolves', () => {
  it('the group names the family, calls itself root, and carries the panel and the handle', () => {
    const root = units[ROOT].contract.family_membership;
    expect(root?.name).toBe(FAMILY);
    expect(root?.role).toBe('root');
    expect(root?.members).toEqual(PART_STEMS.map(ref).sort());
  });

  it('every part names the same family, calls itself a part, and lists no members', () => {
    for (const stem of PART_STEMS) {
      const membership = units[stem].contract.family_membership;
      expect(membership?.name, stem).toBe(FAMILY);
      expect(membership?.role, stem).toBe('part');
      expect(membership?.members, stem).toBeUndefined();
    }
  });

  it('every part the root carries ships a compiled contract of its own', () => {
    for (const member of units[ROOT].contract.family_membership?.members ?? []) {
      const target = resolveComponentRef(member);
      expect(target.contractId, `${member}: ${target.stem} ships no compiled contract`).toBe(member);
    }
  });

  it('the roster has the group as root and the two parts', () => {
    const roster = familyRoster(FAMILY);
    expect(roster.root).toBe(ref(ROOT));
    expect(roster.parts).toEqual(PART_STEMS.map(ref).sort());
  });
});

describe('resizable family: what nests where', () => {
  it('the group accepts ResizablePanel and ResizableHandle and nothing else', () => {
    expect(units[ROOT].contract.accepts).toEqual({
      content: 'specified',
      components: [ref('resizable-panel'), ref('resizable-handle')],
    });
  });

  it("every part's mount point is FILLED from the group that accepts it", () => {
    for (const stem of PART_STEMS) {
      expect(units[stem].contract.mounted_in, stem).toEqual([{ container: pascalCase(ROOT), component: ref(ROOT) }]);
    }
  });

  it('a panel holds anything, a nested group included, and the handle holds nothing', () => {
    expect(units['resizable-panel'].contract.accepts).toEqual({ content: 'unconstrained' });
    expect(units['resizable-handle'].contract.accepts).toEqual({ content: 'nothing' });
    // An unconstrained panel fills no mount point, so the group has none.
    expect(units[ROOT].contract.mounted_in).toBeUndefined();
  });

  it('every nesting reference in the family points inside the family', () => {
    const familyRefs = new Set(ALL_STEMS.map((stem) => bareGtsId(String(units[stem].contract.$id))));
    for (const stem of ALL_STEMS) {
      const { contract } = units[stem];
      const mounts = (contract.mounted_in ?? []).map((entry) => entry.component).filter((r): r is string => r !== undefined);
      for (const nested of [...(contract.accepts.components ?? []), ...mounts]) {
        expect(familyRefs.has(nested), `${stem}: it names "${nested}", which is not a member of this family`).toBe(true);
      }
    }
  });
});

describe('resizable family: what the schema cannot assert', () => {
  it('every prop the schema leaves open carries a prop statement, and no fully typed prop does', () => {
    for (const { stem, contract } of Object.values(units)) {
      expect(findUntypedPropMismatches(contract), stem).toEqual([]);
    }
  });

  it("the library's callbacks, refs and size unions carry prop statements emitted into their descriptions", () => {
    const expected: Record<string, string[]> = {
      [ROOT]: ['children', 'defaultLayout', 'elementRef', 'groupRef', 'onLayoutChange', 'onLayoutChanged', 'resizeTargetMinimumSize', 'style'],
      'resizable-panel': ['defaultSize', 'minSize', 'maxSize', 'collapsedSize', 'elementRef', 'panelRef', 'onResize', 'style'],
      'resizable-handle': ['elementRef', 'style'],
    };
    for (const [stem, props] of Object.entries(expected)) {
      const statements = units[stem].contract.prop_statements ?? {};
      const properties = units[stem].contract.props.properties;
      for (const prop of props) {
        expect(Object.keys(statements), `${stem}.${prop}`).toContain(prop);
        expect(properties[prop].description, `${stem}.${prop}`).toContain(statements[prop].states);
      }
    }
  });

  it("the library's own props are filed as typed API with no prop statement", () => {
    const group = units[ROOT].contract;
    expect(group.props.properties.orientation).toEqual({ type: 'string', enum: ['horizontal', 'vertical'] });
    const panel = units['resizable-panel'].contract;
    expect(panel.props.properties.collapsible).toEqual({ type: 'boolean' });
    const handle = units['resizable-handle'].contract;
    expect(handle.props.properties.withHandle.type).toBe('boolean');
    for (const [stem, prop] of [
      [ROOT, 'orientation'],
      ['resizable-panel', 'collapsible'],
      ['resizable-handle', 'withHandle'],
    ] as const) {
      expect(Object.keys(units[stem].contract.prop_statements ?? {}), `${stem}.${prop}`).not.toContain(prop);
    }
  });

  it('the panel and the handle name the internal structure they compose', () => {
    expect((units['resizable-panel'].contract.unexposed_parts ?? []).length).toBe(1);
    expect((units['resizable-handle'].contract.unexposed_parts ?? []).map((entry) => entry.part)).toEqual(['the grip']);
  });
});

describe('resizable family in a GTS store', () => {
  it('every component validates as an instance of the component type', () => {
    const gts = unitStore(Object.values(units));
    for (const { stem, contract } of Object.values(units)) {
      const result = gts.validateInstance(contract.$id);
      expect(result.ok, `${stem}: ${result.error}`).toBe(true);
    }
  });

  it('all three name the div surface they render', () => {
    for (const { stem, contract, elementSurface } of Object.values(units)) {
      expect(contract.forwards_to, stem).toBe(bareGtsId(String(elementSurface.$id)));
      expect(contract.forwards_to, stem).toBe(elementTypeRef('dom_div'));
    }
  });

  it('fails when the component type is not registered - negative control', () => {
    const gts = unitStore(Object.values(units), { componentType: false, vocabulary: false });
    const result = gts.validateInstance(units[ROOT].contract.$id);
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
    const root = units[ROOT].contract;
    const corrupted = { ...root, bogus_field: true } as typeof root;
    const result = validateContractInstance(corrupted);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/additional propert/i);
  });
});
