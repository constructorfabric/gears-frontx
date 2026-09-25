// Conformance for the twenty-three contracts of the sidebar directory - one
// family whose root is SidebarProvider (the element every other part reads
// its state from, and the one the panel and the main area sit in), not the
// directory's primary Sidebar, which is the panel part. One file because the
// interesting assertions are about how the parts nest; the per-component
// shape comes from testing.ts's assertContractFreshness.
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

const DIRECTORY = 'sidebar';
const ROOT = 'sidebar-provider';
const PART_STEMS = [
  'sidebar',
  'sidebar-trigger',
  'sidebar-rail',
  'sidebar-inset',
  'sidebar-input',
  'sidebar-header',
  'sidebar-footer',
  'sidebar-separator',
  'sidebar-content',
  'sidebar-group',
  'sidebar-group-label',
  'sidebar-group-action',
  'sidebar-group-content',
  'sidebar-menu',
  'sidebar-menu-item',
  'sidebar-menu-button',
  'sidebar-menu-action',
  'sidebar-menu-badge',
  'sidebar-menu-skeleton',
  'sidebar-menu-sub',
  'sidebar-menu-sub-item',
  'sidebar-menu-sub-button',
] as const;
const ALL_STEMS = [ROOT, ...PART_STEMS] as const;

for (const stem of ALL_STEMS) assertContractFreshness(DIRECTORY, stem);

const units = compileUnits(DIRECTORY, ALL_STEMS);
const componentType = buildComponentType();
const ref = (stem: string) => componentRef(stem, contractMajor(DIRECTORY, stem));

// What each container of the family holds, as the overlays state it. The
// mount points of every part are filled from exactly this.
// The roots of two other families the sidebar hosts: a Collapsible around a
// group or a row that opens and closes, and a DropdownMenu whose trigger
// renders as a row's button or action. A root may sit in another family's
// container; a part may not.
const COLLAPSIBLE_REF = componentRef('collapsible', contractMajor('collapsible', 'collapsible'));
const DROPDOWN_MENU_REF = componentRef('dropdown-menu', contractMajor('dropdown-menu', 'dropdown-menu'));
const OUTSIDE_ROOTS: Record<string, readonly string[]> = {
  'sidebar-content': [COLLAPSIBLE_REF],
  'sidebar-menu-item': [COLLAPSIBLE_REF, DROPDOWN_MENU_REF],
};
const NESTING: Record<string, readonly string[]> = {
  'sidebar-provider': ['sidebar', 'sidebar-inset', 'sidebar-trigger'],
  sidebar: ['sidebar-header', 'sidebar-content', 'sidebar-footer', 'sidebar-separator', 'sidebar-rail'],
  'sidebar-header': ['sidebar-menu', 'sidebar-group', 'sidebar-input', 'sidebar-separator'],
  'sidebar-footer': ['sidebar-menu', 'sidebar-group', 'sidebar-input', 'sidebar-separator'],
  'sidebar-content': ['sidebar-group', 'sidebar-separator'],
  'sidebar-group': ['sidebar-group-label', 'sidebar-group-action', 'sidebar-group-content'],
  'sidebar-group-content': ['sidebar-menu', 'sidebar-input'],
  'sidebar-menu': ['sidebar-menu-item'],
  'sidebar-menu-item': [
    'sidebar-menu-button',
    'sidebar-menu-action',
    'sidebar-menu-badge',
    'sidebar-menu-sub',
    'sidebar-menu-skeleton',
  ],
  'sidebar-menu-sub': ['sidebar-menu-sub-item'],
  'sidebar-menu-sub-item': ['sidebar-menu-sub-button'],
};

describe('sidebar family: component type validity', () => {
  it('every one of the twenty-three validates against the component type', () => {
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

describe('sidebar family: membership resolves', () => {
  it('the provider names the family, calls itself root, and carries every other export', () => {
    const root = units[ROOT].contract.family_membership;
    expect(root?.name).toBe('sidebar');
    expect(root?.role).toBe('root');
    expect(root?.members).toEqual(PART_STEMS.map(ref).sort());
  });

  it('every part names the same family, calls itself a part, and lists no members', () => {
    for (const stem of PART_STEMS) {
      const membership = units[stem].contract.family_membership;
      expect(membership?.name, stem).toBe('sidebar');
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

  it('the roster has the provider as its root and the panel as a part', () => {
    const roster = familyRoster('sidebar');
    expect(roster.root).toBe(ref(ROOT));
    expect(roster.parts).toContain(ref(DIRECTORY));
    expect(roster.parts).toEqual(PART_STEMS.map(ref).sort());
  });
});

describe('sidebar family: what nests where', () => {
  it('every container accepts exactly the parts the family nests in it', () => {
    for (const [container, children] of Object.entries(NESTING)) {
      expect(units[container].contract.accepts.components, container).toEqual([
        ...children.map(ref),
        ...(OUTSIDE_ROOTS[container] ?? []),
      ]);
    }
  });

  it("every part's mount points are FILLED from the containers that accept it", () => {
    for (const stem of PART_STEMS) {
      const expected = Object.entries(NESTING)
        .filter(([, children]) => children.includes(stem))
        .map(([container]) => ({ container: pascalCase(container), component: ref(container) }))
        .sort((a, b) => (a.component < b.component ? -1 : a.component > b.component ? 1 : 0));
      expect(units[stem].contract.mounted_in, stem).toEqual(expected);
    }
  });

  it('gives the provider no mount point - nothing in the kit mounts it', () => {
    expect(units[ROOT].contract.mounted_in).toBeUndefined();
  });

  it('the main area takes any content, and the leaf controls take none', () => {
    expect(units['sidebar-inset'].contract.accepts).toEqual({ content: 'unconstrained' });
    for (const stem of ['sidebar-trigger', 'sidebar-rail', 'sidebar-input', 'sidebar-separator', 'sidebar-menu-skeleton']) {
      expect(units[stem].contract.accepts, stem).toEqual({ content: 'nothing' });
    }
  });

  it('every nesting reference points inside the family, except the two outside roots where they are hosted', () => {
    const familyRefs = new Set(ALL_STEMS.map((stem) => bareGtsId(String(units[stem].contract.$id))));
    for (const stem of ALL_STEMS) {
      const { contract } = units[stem];
      const mounts = (contract.mounted_in ?? []).map((entry) => entry.component).filter((r): r is string => r !== undefined);
      for (const nested of [...(contract.accepts.components ?? []), ...mounts]) {
        if ((OUTSIDE_ROOTS[stem] ?? []).includes(nested)) continue;
        expect(familyRefs.has(nested), `${stem}: it names "${nested}", which is not a member of this family`).toBe(true);
      }
    }
  });
});

describe('sidebar family: what the schema cannot assert', () => {
  it("the provider's callback and the menu button's tooltip carry prop statements emitted into their descriptions", () => {
    for (const [stem, prop] of [
      [ROOT, 'onOpenChange'],
      ['sidebar-menu-button', 'tooltip'],
    ] as const) {
      const statements = units[stem].contract.prop_statements ?? {};
      expect(Object.keys(statements), `${stem}.${prop}`).toContain(prop);
      expect(units[stem].contract.props.properties[prop].description, `${stem}.${prop}`).toContain(statements[prop].states);
    }
  });

  it("the provider's open state and the panel's layout props are typed, with no prop statement", () => {
    const provider = units[ROOT].contract;
    for (const prop of ['open', 'defaultOpen']) {
      expect(provider.props.properties[prop], prop).toEqual({ type: 'boolean' });
      expect(Object.keys(provider.prop_statements ?? {}), prop).not.toContain(prop);
    }
    const panel = units[DIRECTORY].contract.props.properties;
    expect(panel.side?.enum).toEqual(expect.arrayContaining(['left', 'right']));
    expect(panel.collapsible?.enum).toEqual(expect.arrayContaining(['icon', 'none', 'offcanvas']));
  });

  it('the provider names useSidebar as its companion, and the menu button its variant builder', () => {
    expect((units[ROOT].contract.companions ?? []).map((entry) => entry.export)).toEqual(['useSidebar']);
    expect((units['sidebar-menu-button'].contract.companions ?? []).map((entry) => entry.export)).toEqual([
      'sidebarMenuButtonVariants',
    ]);
  });
});

describe('sidebar family in a GTS store', () => {
  it('every component validates as an instance of the component type', () => {
    const gts = unitStore(Object.values(units));
    for (const { stem, contract } of Object.values(units)) {
      const result = gts.validateInstance(contract.$id);
      expect(result.ok, `${stem}: ${result.error}`).toBe(true);
    }
  });

  it('each part names the surface of the element it renders', () => {
    for (const { stem, contract, elementSurface } of Object.values(units)) {
      expect(contract.forwards_to, stem).toBe(bareGtsId(String(elementSurface.$id)));
    }
    const hosts: Record<string, string> = {
      'sidebar-provider': 'dom_div',
      sidebar: 'dom_div',
      'sidebar-trigger': 'dom_button',
      'sidebar-rail': 'dom_button',
      'sidebar-inset': 'dom_main',
      'sidebar-input': 'dom_input',
      'sidebar-group-action': 'dom_button',
      'sidebar-menu': 'dom_ul',
      'sidebar-menu-item': 'dom_li',
      'sidebar-menu-button': 'dom_button',
      'sidebar-menu-action': 'dom_button',
      'sidebar-menu-sub': 'dom_ul',
      'sidebar-menu-sub-item': 'dom_li',
      'sidebar-menu-sub-button': 'dom_a',
    };
    for (const stem of ALL_STEMS) {
      expect(units[stem].contract.forwards_to, stem).toBe(elementTypeRef(hosts[stem] ?? 'dom_div'));
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
