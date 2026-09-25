// Conformance for the fifteen contracts of the menubar directory: the Menubar
// family (the bar, its menus, their triggers and popups, and the rows,
// groups and submenu parts re-exported from dropdown-menu under Menubar
// names). One file because the interesting assertions are about how the
// fifteen relate; the per-component shape comes from testing.ts's
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

const DIRECTORY = 'menubar';
const FAMILY = 'menubar';
const PART_STEMS = [
  'menubar-menu',
  'menubar-trigger',
  'menubar-content',
  'menubar-group',
  'menubar-label',
  'menubar-item',
  'menubar-checkbox-item',
  'menubar-radio-group',
  'menubar-radio-item',
  'menubar-separator',
  'menubar-shortcut',
  'menubar-sub',
  'menubar-sub-trigger',
  'menubar-sub-content',
] as const;
const ALL_STEMS = [DIRECTORY, ...PART_STEMS] as const;

for (const stem of ALL_STEMS) assertContractFreshness(DIRECTORY, stem);

// MenubarMenu and MenubarSub re-export Base UI's Menu.Root and
// Menu.SubmenuRoot, which only provide context, so they name no surface.
const units = compileUnits(DIRECTORY, ALL_STEMS, { allowNoHostElement: true });
const componentType = buildComponentType();
const ref = (stem: string) => componentRef(stem, contractMajor(DIRECTORY, stem));
const mount = (stem: string) => ({ container: pascalCase(stem), component: ref(stem) });

// What each part is mounted in, read from the accepting side: every entry
// here comes from one container's `accepts.components`.
const POPUP_ROWS = [
  'menubar-group',
  'menubar-item',
  'menubar-checkbox-item',
  'menubar-radio-group',
  'menubar-separator',
  'menubar-sub',
] as const;
const EXPECTED_MOUNTS: Record<(typeof PART_STEMS)[number], string[]> = {
  'menubar-menu': [DIRECTORY],
  'menubar-trigger': ['menubar-menu'],
  'menubar-content': ['menubar-menu'],
  'menubar-group': ['menubar-content', 'menubar-sub-content'],
  'menubar-label': ['menubar-group', 'menubar-radio-group'],
  'menubar-item': ['menubar-content', 'menubar-group', 'menubar-sub-content'],
  'menubar-checkbox-item': ['menubar-content', 'menubar-group', 'menubar-sub-content'],
  'menubar-radio-group': ['menubar-content', 'menubar-sub-content'],
  'menubar-radio-item': ['menubar-radio-group'],
  'menubar-separator': ['menubar-content', 'menubar-sub-content'],
  'menubar-shortcut': ['menubar-checkbox-item', 'menubar-item', 'menubar-radio-item'],
  'menubar-sub': ['menubar-content', 'menubar-group', 'menubar-sub-content'],
  'menubar-sub-trigger': ['menubar-sub'],
  'menubar-sub-content': ['menubar-sub'],
};

describe('menubar directory: component type validity', () => {
  it('every one of the fifteen validates against the component type', () => {
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

describe('menubar family: membership resolves', () => {
  it('the root names the family, calls itself root, and carries all fourteen parts', () => {
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

  it('the roster read from the other end has the root and the fourteen parts', () => {
    const roster = familyRoster(FAMILY);
    expect(roster.root).toBe(ref(DIRECTORY));
    expect(roster.parts).toEqual(PART_STEMS.map(ref).sort());
  });
});

describe('menubar directory: what nests where', () => {
  it('the bar accepts MenubarMenu and nothing else', () => {
    expect(units[DIRECTORY].contract.accepts).toEqual({ content: 'specified', components: [ref('menubar-menu')] });
  });

  it('each menu accepts MenubarTrigger and MenubarContent and nothing else', () => {
    expect(units['menubar-menu'].contract.accepts).toEqual({
      content: 'specified',
      components: [ref('menubar-trigger'), ref('menubar-content')],
    });
  });

  it('the first-level popup and the submenu popup accept the same rows, and no bare label', () => {
    for (const stem of ['menubar-content', 'menubar-sub-content']) {
      expect(units[stem].contract.accepts, stem).toEqual({ content: 'specified', components: POPUP_ROWS.map(ref) });
    }
  });

  it('the submenu root accepts its sub-trigger and sub-content', () => {
    expect(units['menubar-sub'].contract.accepts).toEqual({
      content: 'specified',
      components: [ref('menubar-sub-trigger'), ref('menubar-sub-content')],
    });
  });

  it('the separator accepts nothing', () => {
    expect(units['menubar-separator'].contract.accepts).toEqual({ content: 'nothing' });
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

describe('menubar directory: what the schema cannot assert', () => {
  it("the bar's own state is typed, and only render and style carry prop statements", () => {
    const { contract } = units[DIRECTORY];
    for (const prop of ['modal', 'disabled', 'loopFocus']) {
      expect(contract.props.properties[prop], prop).toEqual({ type: 'boolean' });
    }
    expect(contract.props.properties.orientation).toEqual({ type: 'string', enum: ['horizontal', 'vertical'] });
    expect(Object.keys(contract.prop_statements ?? {}).sort()).toEqual(['render', 'style']);
  });

  it("the menu's callbacks, children and handle carry prop statements emitted into their descriptions", () => {
    const statements = units['menubar-menu'].contract.prop_statements ?? {};
    const properties = units['menubar-menu'].contract.props.properties;
    for (const prop of ['children', 'onOpenChange', 'onOpenChangeComplete', 'actionsRef', 'handle', 'triggerId', 'defaultTriggerId']) {
      expect(Object.keys(statements), prop).toContain(prop);
      expect(properties[prop].description, prop).toContain(statements[prop].states);
    }
  });

  it("the menu's and the submenu's open state are typed, with no prop statement", () => {
    for (const stem of ['menubar-menu', 'menubar-sub']) {
      const { contract } = units[stem];
      for (const prop of ['open', 'defaultOpen', 'closeParentOnEsc']) {
        expect(contract.props.properties[prop], `${stem}.${prop}`).toEqual({ type: 'boolean' });
        expect(Object.keys(contract.prop_statements ?? {}), `${stem}.${prop}`).not.toContain(prop);
      }
    }
  });

  it("both popups' placement enums are typed and their offset and container unions carry prop statements", () => {
    for (const stem of ['menubar-content', 'menubar-sub-content']) {
      const { contract } = units[stem];
      // MenubarContent writes its own `align = 'start'` and passes `side`
      // through to DropdownMenuContent, which defaults it to bottom; the
      // submenu popup is DropdownMenuSubContent re-exported, whose own body
      // writes side right and align start.
      expect(contract.props.properties.side, stem).toEqual({
        type: 'string',
        enum: ['bottom', 'inline-end', 'inline-start', 'left', 'right', 'top'],
        default: stem === 'menubar-content' ? 'bottom' : 'right',
      });
      expect(contract.props.properties.align, stem).toEqual({
        type: 'string',
        enum: ['center', 'end', 'start'],
        default: 'start',
      });
      expect(contract.props.properties.sideOffset?.default, stem).toBe(stem === 'menubar-content' ? 8 : 0);
      expect(contract.props.properties.alignOffset?.default, stem).toBe(stem === 'menubar-content' ? -4 : -3);
      expect(contract.props.properties.positionMethod, stem).toEqual({ type: 'string', enum: ['absolute', 'fixed'] });
      for (const prop of ['container', 'sideOffset', 'alignOffset', 'collisionBoundary', 'collisionPadding', 'finalFocus']) {
        expect(Object.keys(contract.prop_statements ?? {}), `${stem}.${prop}`).toContain(prop);
      }
    }
  });

  it("the item's variant and the radio item's indicator side are typed enums from the code", () => {
    expect(units['menubar-item'].contract.props.properties.variant).toEqual({
      type: 'string',
      enum: ['default', 'destructive'],
      default: 'default',
    });
    // MenubarRadioItem is DropdownMenuRadioItem re-exported, so the default
    // its body writes is the alias's too.
    expect(units['menubar-radio-item'].contract.props.properties.indicatorSide).toMatchObject({
      type: 'string',
      enum: ['end', 'start'],
      default: 'end',
    });
  });

  it("the radio item's value is required and carries a prop statement, as do the radio group's value and callback", () => {
    const item = units['menubar-radio-item'].contract;
    expect(item.props.required).toContain('value');
    expect(Object.keys(item.prop_statements ?? {})).toContain('value');
    const group = units['menubar-radio-group'].contract;
    for (const prop of ['value', 'defaultValue', 'onValueChange']) {
      expect(Object.keys(group.prop_statements ?? {}), prop).toContain(prop);
    }
  });

  it('the composed internal parts are named in unexposed_parts', () => {
    const parts = (stem: string) => (units[stem].contract.unexposed_parts ?? []).map((entry) => entry.part);
    expect(parts('menubar-content')).toEqual(['Menu.Portal', 'Menu.Positioner']);
    expect(parts('menubar-sub-content')).toEqual(['Menu.Portal', 'Menu.Positioner']);
    expect(parts('menubar-checkbox-item')).toEqual(['Menu.CheckboxItemIndicator']);
    expect(parts('menubar-radio-item')).toEqual(['Menu.RadioItemIndicator']);
    expect(parts('menubar-sub-trigger')).toEqual(['the trailing chevron icon']);
  });
});

describe('menubar directory in a GTS store', () => {
  it('every component validates as an instance of the component type', () => {
    const gts = unitStore(Object.values(units));
    for (const { stem, contract } of Object.values(units)) {
      const result = gts.validateInstance(contract.$id);
      expect(result.ok, `${stem}: ${result.error}`).toBe(true);
    }
  });

  it('the trigger names the button surface, the shortcut the span surface, the menu and the submenu none, the rest the div surface', () => {
    for (const { stem, contract, elementSurface } of Object.values(units)) {
      if (elementSurface) expect(contract.forwards_to, stem).toBe(bareGtsId(String(elementSurface.$id)));
    }
    expect(units['menubar-trigger'].contract.forwards_to).toBe(elementTypeRef('dom_button'));
    expect(units['menubar-shortcut'].contract.forwards_to).toBe(elementTypeRef('dom_span'));
    for (const stem of ['menubar-menu', 'menubar-sub']) {
      expect(units[stem].elementKind, stem).toBeUndefined();
      expect(units[stem].contract.forwards_to, stem).toBeUndefined();
    }
    const divStems = ALL_STEMS.filter(
      (stem) => !['menubar-trigger', 'menubar-shortcut', 'menubar-menu', 'menubar-sub'].includes(stem),
    );
    for (const stem of divStems) {
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
