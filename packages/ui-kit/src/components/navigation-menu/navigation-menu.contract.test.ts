// Conformance for the nine contracts of the navigation-menu directory: the
// NavigationMenu family (root, list, item, trigger, icon, content, link,
// viewport, indicator). One file because the interesting assertions are about
// how the nine relate; the per-component shape comes from testing.ts's
// assertContractFreshness.
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

const DIRECTORY = 'navigation-menu';
const FAMILY = 'navigation_menu';
const PART_STEMS = [
  'navigation-menu-list',
  'navigation-menu-item',
  'navigation-menu-icon',
  'navigation-menu-trigger',
  'navigation-menu-content',
  'navigation-menu-link',
  'navigation-menu-viewport',
  'navigation-menu-indicator',
] as const;
const ALL_STEMS = [DIRECTORY, ...PART_STEMS] as const;

for (const stem of ALL_STEMS) assertContractFreshness(DIRECTORY, stem);

const units = compileUnits(DIRECTORY, ALL_STEMS);
const componentType = buildComponentType();
const ref = (stem: string) => componentRef(stem, contractMajor(DIRECTORY, stem));
const mount = (stem: string) => ({ container: pascalCase(stem), component: ref(stem) });

// What each part is mounted in, read from the accepting side. The icon and the
// viewport are accepted by nothing: the trigger and the root render them
// internally, so they carry no mount point at all.
const EXPECTED_MOUNTS: Record<(typeof PART_STEMS)[number], string[] | undefined> = {
  'navigation-menu-list': [DIRECTORY],
  'navigation-menu-item': ['navigation-menu-list'],
  'navigation-menu-icon': undefined,
  'navigation-menu-trigger': ['navigation-menu-item'],
  'navigation-menu-content': ['navigation-menu-item'],
  'navigation-menu-link': ['navigation-menu-item'],
  'navigation-menu-viewport': undefined,
  'navigation-menu-indicator': ['navigation-menu-item'],
};

describe('navigation-menu directory: component type validity', () => {
  it('every one of the nine validates against the component type', () => {
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

describe('navigation-menu family: membership resolves', () => {
  it('the root names the family, calls itself root, and carries all eight parts', () => {
    const root = units[DIRECTORY].contract.family_membership;
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
    for (const member of units[DIRECTORY].contract.family_membership?.members ?? []) {
      const target = resolveComponentRef(member);
      expect(target.contractId, `${member}: ${target.stem} ships no compiled contract`).toBe(member);
    }
  });

  it('the roster read from the other end has the root and the eight parts', () => {
    const roster = familyRoster(FAMILY);
    expect(roster.root).toBe(ref(DIRECTORY));
    expect(roster.parts).toEqual(PART_STEMS.map(ref).sort());
  });
});

describe('navigation-menu directory: what nests where', () => {
  it('the root accepts NavigationMenuList and nothing else', () => {
    expect(units[DIRECTORY].contract.accepts).toEqual({
      content: 'specified',
      components: [ref('navigation-menu-list')],
    });
  });

  it('the list accepts NavigationMenuItem and nothing else', () => {
    expect(units['navigation-menu-list'].contract.accepts).toEqual({
      content: 'specified',
      components: [ref('navigation-menu-item')],
    });
  });

  it('the item accepts the trigger, the content, the link and the indicator', () => {
    expect(units['navigation-menu-item'].contract.accepts).toEqual({
      content: 'specified',
      components: [
        ref('navigation-menu-trigger'),
        ref('navigation-menu-content'),
        ref('navigation-menu-link'),
        ref('navigation-menu-indicator'),
      ],
    });
  });

  it('the icon, the viewport and the indicator accept nothing, the content anything', () => {
    for (const stem of ['navigation-menu-icon', 'navigation-menu-viewport', 'navigation-menu-indicator']) {
      expect(units[stem].contract.accepts, stem).toEqual({ content: 'nothing' });
    }
    expect(units['navigation-menu-content'].contract.accepts).toEqual({ content: 'unconstrained' });
  });

  it("every part's mount points are FILLED from the containers that accept it", () => {
    for (const stem of PART_STEMS) {
      const expected = EXPECTED_MOUNTS[stem];
      expect(units[stem].contract.mounted_in, stem).toEqual(expected === undefined ? undefined : expected.map(mount));
    }
  });

  it('the root has no mount point of its own', () => {
    expect(units[DIRECTORY].contract.mounted_in).toBeUndefined();
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

describe('navigation-menu directory: what the schema cannot assert', () => {
  it("the root's value, callbacks and placement unions carry prop statements emitted into their descriptions", () => {
    const statements = units[DIRECTORY].contract.prop_statements ?? {};
    const properties = units[DIRECTORY].contract.props.properties;
    for (const prop of ['value', 'defaultValue', 'onValueChange', 'onOpenChangeComplete', 'actionsRef', 'container']) {
      expect(Object.keys(statements), prop).toContain(prop);
      expect(properties[prop].description, prop).toContain(statements[prop].states);
    }
  });

  it("the root's placement enums are typed from the positioner, with no prop statement", () => {
    const { contract } = units[DIRECTORY];
    expect(contract.props.properties.side).toMatchObject({
      type: 'string',
      enum: ['bottom', 'inline-end', 'inline-start', 'left', 'right', 'top'],
    });
    expect(contract.props.properties.align).toMatchObject({ type: 'string', enum: ['center', 'end', 'start'] });
    expect(contract.props.properties.positionMethod).toMatchObject({ type: 'string', enum: ['absolute', 'fixed'] });
    expect(contract.props.properties.orientation).toMatchObject({ type: 'string', enum: ['horizontal', 'vertical'] });
    for (const prop of ['side', 'align', 'positionMethod', 'orientation']) {
      expect(Object.keys(contract.prop_statements ?? {}), prop).not.toContain(prop);
    }
  });

  it("the link's size is a typed cva axis the overlay never restates", () => {
    const { contract } = units['navigation-menu-link'];
    expect(contract.props.properties.size).toEqual({ type: 'string', enum: ['default', 'compact'], default: 'default' });
    expect(Object.keys(contract.prop_statements ?? {})).not.toContain('size');
  });

  it("the link names navigationMenuTriggerStyle as its companion", () => {
    const companions = units['navigation-menu-link'].contract.companions ?? [];
    expect(companions.map((entry) => entry.export)).toEqual(['navigationMenuTriggerStyle']);
  });

  it("the item's value carries a prop statement", () => {
    expect(Object.keys(units['navigation-menu-item'].contract.prop_statements ?? {})).toContain('value');
  });

  it("the indicator's inner arrow is named in unexposed_parts, and the icon, which is the glyph itself, names none", () => {
    expect((units['navigation-menu-indicator'].contract.unexposed_parts ?? []).length).toBe(1);
    expect(units['navigation-menu-icon'].contract.unexposed_parts).toBeUndefined();
  });
});

describe('navigation-menu directory in a GTS store', () => {
  it('every component validates as an instance of the component type', () => {
    const gts = unitStore(Object.values(units));
    for (const { stem, contract } of Object.values(units)) {
      const result = gts.validateInstance(contract.$id);
      expect(result.ok, `${stem}: ${result.error}`).toBe(true);
    }
  });

  it('each part names the surface of the element the primitive renders', () => {
    for (const { stem, contract, elementSurface } of Object.values(units)) {
      expect(contract.forwards_to, stem).toBe(bareGtsId(String(elementSurface.$id)));
    }
    const expected: Record<(typeof ALL_STEMS)[number], string> = {
      'navigation-menu': 'dom_nav',
      'navigation-menu-list': 'dom_ul',
      'navigation-menu-item': 'dom_li',
      'navigation-menu-icon': 'dom_span',
      'navigation-menu-trigger': 'dom_button',
      'navigation-menu-content': 'dom_div',
      'navigation-menu-link': 'dom_a',
      'navigation-menu-viewport': 'dom_div',
      'navigation-menu-indicator': 'dom_span',
    };
    for (const stem of ALL_STEMS) {
      expect(units[stem].contract.forwards_to, stem).toBe(elementTypeRef(expected[stem]));
    }
  });

  it('fails when the component type is not registered - negative control', () => {
    const gts = unitStore(Object.values(units), { componentType: false, vocabulary: false });
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
