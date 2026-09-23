// Conformance for the fourteen contracts of the context-menu directory: the
// ContextMenu family (root, submenu root and twelve rendered parts). One
// file because the interesting assertions are about how the parts relate;
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

const DIRECTORY = 'context-menu';
const FAMILY = 'context_menu';
const PART_STEMS = [
  'context-menu-trigger',
  'context-menu-content',
  'context-menu-group',
  'context-menu-label',
  'context-menu-item',
  'context-menu-checkbox-item',
  'context-menu-radio-group',
  'context-menu-radio-item',
  'context-menu-separator',
  'context-menu-shortcut',
  'context-menu-sub',
  'context-menu-sub-trigger',
  'context-menu-sub-content',
] as const;
const ALL_STEMS = [DIRECTORY, ...PART_STEMS] as const;
// The two exports that only provide context (the primitive's ContextMenu.Root
// and SubmenuRoot) render no element of their own.
const ELEMENTLESS = new Set<string>([DIRECTORY, 'context-menu-sub']);

for (const stem of ALL_STEMS) assertContractFreshness(DIRECTORY, stem);

const units = compileUnits(DIRECTORY, ALL_STEMS, { allowNoHostElement: true });
const componentType = buildComponentType();
const ref = (stem: string) => componentRef(stem, contractMajor(DIRECTORY, stem));
const mountedIn = (stem: string) => (units[stem].contract.mounted_in ?? []).map((entry) => entry.component);

// The rows a menu popup hosts; the root popup and a submenu popup host the same.
const POPUP_ROWS = [
  'context-menu-group',
  'context-menu-item',
  'context-menu-checkbox-item',
  'context-menu-radio-group',
  'context-menu-separator',
  'context-menu-sub',
];

describe('context-menu directory: component type validity', () => {
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

describe('context-menu family: membership resolves', () => {
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

describe('context-menu directory: what nests where', () => {
  it('the root accepts the trigger and the popup and nothing else', () => {
    expect(units[DIRECTORY].contract.accepts).toEqual({
      content: 'specified',
      components: [ref('context-menu-trigger'), ref('context-menu-content')],
    });
  });

  it('the root popup and the submenu popup accept the same rows, and no bare label', () => {
    for (const stem of ['context-menu-content', 'context-menu-sub-content']) {
      expect(units[stem].contract.accepts, stem).toEqual({ content: 'specified', components: POPUP_ROWS.map(ref) });
    }
  });

  it('a label is mounted only inside a group or a radio group', () => {
    expect(mountedIn('context-menu-label')).toEqual([ref('context-menu-group'), ref('context-menu-radio-group')]);
  });

  it('a radio item is mounted only inside a radio group', () => {
    expect(mountedIn('context-menu-radio-item')).toEqual([ref('context-menu-radio-group')]);
  });

  it('the submenu trigger and popup are mounted only inside a submenu', () => {
    for (const stem of ['context-menu-sub-trigger', 'context-menu-sub-content']) {
      expect(mountedIn(stem), stem).toEqual([ref('context-menu-sub')]);
    }
  });

  it('a shortcut is mounted in the three row kinds that style it', () => {
    expect(mountedIn('context-menu-shortcut')).toEqual(
      ['context-menu-checkbox-item', 'context-menu-item', 'context-menu-radio-item'].map(ref),
    );
  });

  it("the trigger's and the popup's mount point is FILLED from the root that accepts them", () => {
    for (const stem of ['context-menu-trigger', 'context-menu-content']) {
      expect(units[stem].contract.mounted_in, stem).toEqual([{ container: pascalCase(DIRECTORY), component: ref(DIRECTORY) }]);
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

describe('context-menu directory: what the schema cannot assert', () => {
  it("the root's callbacks, children, handle and trigger ids carry prop statements emitted into their descriptions", () => {
    const statements = units[DIRECTORY].contract.prop_statements ?? {};
    const properties = units[DIRECTORY].contract.props.properties;
    for (const prop of ['children', 'onOpenChange', 'onOpenChangeComplete', 'actionsRef', 'handle', 'triggerId', 'defaultTriggerId']) {
      expect(Object.keys(statements), prop).toContain(prop);
      expect(properties[prop].description, prop).toContain(statements[prop].states);
    }
  });

  it('the open state of the root and the submenu is typed, with no prop statement', () => {
    for (const stem of [DIRECTORY, 'context-menu-sub']) {
      const { contract } = units[stem];
      for (const prop of ['open', 'defaultOpen', 'disabled']) {
        expect(contract.props.properties[prop], `${stem}.${prop}`).toEqual({ type: 'boolean' });
        expect(Object.keys(contract.prop_statements ?? {}), `${stem}.${prop}`).not.toContain(prop);
      }
    }
  });

  it("the item's variant axis is extracted from the code, not authored", () => {
    expect(units['context-menu-item'].contract.props.properties.variant).toMatchObject({
      type: 'string',
      enum: ['default', 'destructive'],
    });
  });

  it("both popups' offset, boundary, container and focus unions carry prop statements", () => {
    for (const stem of ['context-menu-content', 'context-menu-sub-content']) {
      const statements = Object.keys(units[stem].contract.prop_statements ?? {});
      for (const prop of ['container', 'sideOffset', 'alignOffset', 'collisionBoundary', 'collisionPadding', 'finalFocus']) {
        expect(statements, `${stem}.${prop}`).toContain(prop);
      }
    }
  });

  it("the radio group's and radio item's untyped values carry prop statements", () => {
    expect(Object.keys(units['context-menu-radio-group'].contract.prop_statements ?? {})).toEqual(
      expect.arrayContaining(['value', 'defaultValue', 'onValueChange']),
    );
    expect(Object.keys(units['context-menu-radio-item'].contract.prop_statements ?? {})).toContain('value');
  });

  it('the shortcut, a plain span, needs no prop statement at all', () => {
    expect(units['context-menu-shortcut'].contract.prop_statements).toBeUndefined();
  });

  it('the popups name the Portal and Positioner, the checkable rows their indicator', () => {
    for (const stem of ['context-menu-content', 'context-menu-sub-content']) {
      const parts = (units[stem].contract.unexposed_parts ?? []).map((entry) => entry.part);
      expect(parts, stem).toEqual(['ContextMenu.Portal', 'ContextMenu.Positioner']);
    }
    for (const stem of ['context-menu-checkbox-item', 'context-menu-radio-item']) {
      const parts = (units[stem].contract.unexposed_parts ?? []).map((entry) => entry.part);
      expect(parts.some((part) => /Indicator/.test(part)), stem).toBe(true);
    }
  });
});

describe('context-menu directory in a GTS store', () => {
  it('every component validates as an instance of the component type', () => {
    const gts = unitStore(Object.values(units));
    for (const { stem, contract } of Object.values(units)) {
      const result = gts.validateInstance(contract.$id);
      expect(result.ok, `${stem}: ${result.error}`).toBe(true);
    }
  });

  it('the shortcut names the span surface, every other rendered part the div surface, the two roots none', () => {
    for (const { stem, contract, elementKind, elementSurface } of Object.values(units)) {
      if (ELEMENTLESS.has(stem)) {
        expect(elementKind, stem).toBeUndefined();
        expect(contract.forwards_to, stem).toBeUndefined();
        continue;
      }
      expect(contract.forwards_to, stem).toBe(bareGtsId(String(elementSurface?.$id)));
      expect(contract.forwards_to, stem).toBe(elementTypeRef(stem === 'context-menu-shortcut' ? 'dom_span' : 'dom_div'));
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
