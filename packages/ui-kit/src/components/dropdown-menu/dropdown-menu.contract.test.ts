// Conformance for the fourteen contracts of the dropdown-menu directory: the
// DropdownMenu family (root, trigger, popup, rows, groups, submenu parts). One
// file because the interesting assertions are about how the fourteen relate;
// the per-component shape comes from testing.ts's assertContractFreshness.
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

const DIRECTORY = 'dropdown-menu';
const FAMILY = 'dropdown_menu';
const PART_STEMS = [
  'dropdown-menu-trigger',
  'dropdown-menu-content',
  'dropdown-menu-group',
  'dropdown-menu-label',
  'dropdown-menu-item',
  'dropdown-menu-checkbox-item',
  'dropdown-menu-radio-group',
  'dropdown-menu-radio-item',
  'dropdown-menu-separator',
  'dropdown-menu-shortcut',
  'dropdown-menu-sub',
  'dropdown-menu-sub-trigger',
  'dropdown-menu-sub-content',
] as const;
const ALL_STEMS = [DIRECTORY, ...PART_STEMS] as const;

for (const stem of ALL_STEMS) assertContractFreshness(DIRECTORY, stem);

// The root and the submenu root re-export Base UI's Menu.Root and
// Menu.SubmenuRoot, which only provide context, so they name no surface.
const units = compileUnits(DIRECTORY, ALL_STEMS, { allowNoHostElement: true });
const componentType = buildComponentType();
const ref = (stem: string) => componentRef(stem, contractMajor(DIRECTORY, stem));
const mount = (stem: string) => ({ container: pascalCase(stem), component: ref(stem) });

// What each part is mounted in, read from the accepting side: every entry
// here comes from one container's `accepts.components`.
const POPUP_ROWS = [
  'dropdown-menu-group',
  'dropdown-menu-item',
  'dropdown-menu-checkbox-item',
  'dropdown-menu-radio-group',
  'dropdown-menu-separator',
  'dropdown-menu-sub',
] as const;
const EXPECTED_MOUNTS: Record<(typeof PART_STEMS)[number], string[]> = {
  'dropdown-menu-trigger': [DIRECTORY],
  'dropdown-menu-content': [DIRECTORY],
  'dropdown-menu-group': ['dropdown-menu-content', 'dropdown-menu-sub-content'],
  'dropdown-menu-label': ['dropdown-menu-group', 'dropdown-menu-radio-group'],
  'dropdown-menu-item': ['dropdown-menu-content', 'dropdown-menu-group', 'dropdown-menu-sub-content'],
  'dropdown-menu-checkbox-item': ['dropdown-menu-content', 'dropdown-menu-group', 'dropdown-menu-sub-content'],
  'dropdown-menu-radio-group': ['dropdown-menu-content', 'dropdown-menu-sub-content'],
  'dropdown-menu-radio-item': ['dropdown-menu-radio-group'],
  'dropdown-menu-separator': ['dropdown-menu-content', 'dropdown-menu-sub-content'],
  'dropdown-menu-shortcut': ['dropdown-menu-checkbox-item', 'dropdown-menu-item', 'dropdown-menu-radio-item'],
  'dropdown-menu-sub': ['dropdown-menu-content', 'dropdown-menu-group', 'dropdown-menu-sub-content'],
  'dropdown-menu-sub-trigger': ['dropdown-menu-sub'],
  'dropdown-menu-sub-content': ['dropdown-menu-sub'],
};

describe('dropdown-menu directory: component type validity', () => {
  it('every one of the fourteen validates against the component type', () => {
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

describe('dropdown-menu family: membership resolves', () => {
  it('the root names the family, calls itself root, and carries all thirteen parts', () => {
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

  it('the roster read from the other end has the root and the thirteen parts', () => {
    const roster = familyRoster(FAMILY);
    expect(roster.root).toBe(ref(DIRECTORY));
    expect(roster.parts).toEqual(PART_STEMS.map(ref).sort());
  });
});

describe('dropdown-menu directory: what nests where', () => {
  it('the root accepts DropdownMenuTrigger and DropdownMenuContent and nothing else', () => {
    expect(units[DIRECTORY].contract.accepts).toEqual({
      content: 'specified',
      components: [ref('dropdown-menu-trigger'), ref('dropdown-menu-content')],
    });
  });

  it('the first-level popup and the submenu popup accept the same rows, and no bare label', () => {
    for (const stem of ['dropdown-menu-content', 'dropdown-menu-sub-content']) {
      expect(units[stem].contract.accepts, stem).toEqual({ content: 'specified', components: POPUP_ROWS.map(ref) });
    }
  });

  it('the submenu root accepts its sub-trigger and sub-content', () => {
    expect(units['dropdown-menu-sub'].contract.accepts).toEqual({
      content: 'specified',
      components: [ref('dropdown-menu-sub-trigger'), ref('dropdown-menu-sub-content')],
    });
  });

  it('the separator accepts nothing', () => {
    expect(units['dropdown-menu-separator'].contract.accepts).toEqual({ content: 'nothing' });
  });

  it("every part's mount points are FILLED from the containers that accept it", () => {
    for (const stem of PART_STEMS) {
      expect(units[stem].contract.mounted_in, stem).toEqual(EXPECTED_MOUNTS[stem].map(mount));
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

describe('dropdown-menu directory: what the schema cannot assert', () => {
  it("the root's callbacks, children and handle carry prop statements emitted into their descriptions", () => {
    const statements = units[DIRECTORY].contract.prop_statements ?? {};
    const properties = units[DIRECTORY].contract.props.properties;
    for (const prop of ['children', 'onOpenChange', 'onOpenChangeComplete', 'actionsRef', 'handle', 'triggerId', 'defaultTriggerId']) {
      expect(Object.keys(statements), prop).toContain(prop);
      expect(properties[prop].description, prop).toContain(statements[prop].states);
    }
  });

  it("the root's and the submenu's open state are typed, with no prop statement", () => {
    for (const stem of [DIRECTORY, 'dropdown-menu-sub']) {
      const { contract } = units[stem];
      for (const prop of ['open', 'defaultOpen', 'closeParentOnEsc']) {
        expect(contract.props.properties[prop], `${stem}.${prop}`).toEqual({ type: 'boolean' });
        expect(Object.keys(contract.prop_statements ?? {}), `${stem}.${prop}`).not.toContain(prop);
      }
    }
  });

  it("both popups' placement enums are typed and their offset and container unions carry prop statements", () => {
    for (const stem of ['dropdown-menu-content', 'dropdown-menu-sub-content']) {
      const { contract } = units[stem];
      expect(contract.props.properties.side, stem).toEqual({
        type: 'string',
        enum: ['bottom', 'inline-end', 'inline-start', 'left', 'right', 'top'],
      });
      expect(contract.props.properties.align, stem).toEqual({ type: 'string', enum: ['center', 'end', 'start'] });
      expect(contract.props.properties.positionMethod, stem).toEqual({ type: 'string', enum: ['absolute', 'fixed'] });
      for (const prop of ['container', 'sideOffset', 'alignOffset', 'collisionBoundary', 'collisionPadding', 'finalFocus']) {
        expect(Object.keys(contract.prop_statements ?? {}), `${stem}.${prop}`).toContain(prop);
      }
    }
  });

  it("the item's variant and the radio item's indicator side are typed enums from the code", () => {
    expect(units['dropdown-menu-item'].contract.props.properties.variant).toEqual({
      type: 'string',
      enum: ['default', 'destructive'],
      default: 'default',
    });
    expect(units['dropdown-menu-radio-item'].contract.props.properties.indicatorSide).toMatchObject({
      type: 'string',
      enum: ['end', 'start'],
    });
  });

  it("the radio item's value is required and carries a prop statement, as do the radio group's value and callback", () => {
    const item = units['dropdown-menu-radio-item'].contract;
    expect(item.props.required).toContain('value');
    expect(Object.keys(item.prop_statements ?? {})).toContain('value');
    const group = units['dropdown-menu-radio-group'].contract;
    for (const prop of ['value', 'defaultValue', 'onValueChange']) {
      expect(Object.keys(group.prop_statements ?? {}), prop).toContain(prop);
    }
  });

  it('the composed internal parts are named in unexposed_parts', () => {
    const parts = (stem: string) => (units[stem].contract.unexposed_parts ?? []).map((entry) => entry.part);
    expect(parts('dropdown-menu-content')).toEqual(['Menu.Portal', 'Menu.Positioner']);
    expect(parts('dropdown-menu-sub-content')).toEqual(['Menu.Portal', 'Menu.Positioner']);
    expect(parts('dropdown-menu-checkbox-item')).toEqual(['Menu.CheckboxItemIndicator']);
    expect(parts('dropdown-menu-radio-item')).toEqual(['Menu.RadioItemIndicator']);
  });
});

describe('dropdown-menu directory in a GTS store', () => {
  it('every component validates as an instance of the component type', () => {
    const gts = unitStore(Object.values(units));
    for (const { stem, contract } of Object.values(units)) {
      const result = gts.validateInstance(contract.$id);
      expect(result.ok, `${stem}: ${result.error}`).toBe(true);
    }
  });

  it('the trigger names the button surface, the shortcut the span surface, the two roots none, the rest the div surface', () => {
    for (const { stem, contract, elementSurface } of Object.values(units)) {
      if (elementSurface) expect(contract.forwards_to, stem).toBe(bareGtsId(String(elementSurface.$id)));
    }
    expect(units['dropdown-menu-trigger'].contract.forwards_to).toBe(elementTypeRef('dom_button'));
    expect(units['dropdown-menu-shortcut'].contract.forwards_to).toBe(elementTypeRef('dom_span'));
    for (const stem of [DIRECTORY, 'dropdown-menu-sub']) {
      expect(units[stem].elementKind, stem).toBeUndefined();
      expect(units[stem].contract.forwards_to, stem).toBeUndefined();
    }
    const divParts = PART_STEMS.filter(
      (stem) => !['dropdown-menu-trigger', 'dropdown-menu-shortcut', 'dropdown-menu-sub'].includes(stem),
    );
    for (const stem of divParts) {
      expect(units[stem].contract.forwards_to, stem).toBe(elementTypeRef('dom_div'));
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
