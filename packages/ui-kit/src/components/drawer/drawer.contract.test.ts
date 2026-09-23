// Conformance for the eleven contracts of the drawer directory: the Drawer
// root and its ten parts. One file because the interesting assertions are
// about how the eleven relate; the per-component shape comes from
// testing.ts's assertContractFreshness.
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

const DIRECTORY = 'drawer';
const PART_STEMS = [
  'drawer-trigger',
  'drawer-portal',
  'drawer-close',
  'drawer-swipe-handle',
  'drawer-backdrop',
  'drawer-content',
  'drawer-header',
  'drawer-footer',
  'drawer-title',
  'drawer-description',
] as const;
const ALL_STEMS = [DIRECTORY, ...PART_STEMS] as const;

for (const stem of ALL_STEMS) assertContractFreshness(DIRECTORY, stem);

// The root renders no element of its own (Base UI's Drawer.Root only
// provides context), so it names no surface; every part does.
const units = compileUnits(DIRECTORY, ALL_STEMS, { allowNoHostElement: true });
const componentType = buildComponentType();
const ref = (stem: string) => componentRef(stem, contractMajor(DIRECTORY, stem));

describe('drawer directory: component type validity', () => {
  it('every one of the eleven validates against the component type', () => {
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

describe('drawer family: membership resolves', () => {
  it('the root names the family, calls itself root, and carries all ten parts', () => {
    const root = units[DIRECTORY].contract.family_membership;
    expect(root?.name).toBe('drawer');
    expect(root?.role).toBe('root');
    expect(root?.members).toEqual(PART_STEMS.map(ref).sort());
  });

  it('every part names the same family, calls itself a part, and lists no members', () => {
    for (const stem of PART_STEMS) {
      const membership = units[stem].contract.family_membership;
      expect(membership?.name, stem).toBe('drawer');
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

  it('the roster has the root and the ten parts', () => {
    const roster = familyRoster('drawer');
    expect(roster.root).toBe(ref(DIRECTORY));
    expect(roster.parts).toEqual(PART_STEMS.map(ref).sort());
  });
});

describe('drawer directory: what nests where', () => {
  it('the root accepts DrawerTrigger, DrawerContent, DrawerPortal and DrawerBackdrop and nothing else', () => {
    expect(units[DIRECTORY].contract.accepts).toEqual({
      content: 'specified',
      components: [ref('drawer-trigger'), ref('drawer-content'), ref('drawer-portal'), ref('drawer-backdrop')],
    });
  });

  it('the header accepts DrawerTitle and DrawerDescription and nothing else', () => {
    expect(units['drawer-header'].contract.accepts).toEqual({
      content: 'specified',
      components: [ref('drawer-title'), ref('drawer-description')],
    });
  });

  it('the panel, the footer and the portal take any content; the backdrop and the grab bar take none', () => {
    for (const stem of ['drawer-content', 'drawer-footer', 'drawer-portal']) {
      expect(units[stem].contract.accepts, stem).toEqual({ content: 'unconstrained' });
    }
    for (const stem of ['drawer-backdrop', 'drawer-swipe-handle']) {
      expect(units[stem].contract.accepts, stem).toEqual({ content: 'nothing' });
    }
  });

  it('every filled mount point is the family container that accepts the part', () => {
    const expected: Record<string, string> = {
      'drawer-trigger': DIRECTORY,
      'drawer-content': DIRECTORY,
      'drawer-portal': DIRECTORY,
      'drawer-backdrop': DIRECTORY,
      'drawer-title': 'drawer-header',
      'drawer-description': 'drawer-header',
    };
    for (const [stem, container] of Object.entries(expected)) {
      expect(units[stem].contract.mounted_in, stem).toEqual([
        { container: pascalCase(container), component: ref(container) },
      ]);
    }
    for (const stem of [DIRECTORY, 'drawer-close', 'drawer-swipe-handle', 'drawer-header', 'drawer-footer']) {
      expect(units[stem].contract.mounted_in, stem).toBeUndefined();
    }
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

describe('drawer directory: what the schema cannot assert', () => {
  it("the root's callbacks, children, handle, modal, trigger ids and snap points carry prop statements emitted into their descriptions", () => {
    const statements = units[DIRECTORY].contract.prop_statements ?? {};
    const properties = units[DIRECTORY].contract.props.properties;
    for (const prop of [
      'children',
      'modal',
      'onOpenChange',
      'onOpenChangeComplete',
      'actionsRef',
      'handle',
      'triggerId',
      'defaultTriggerId',
      'snapPoints',
      'snapPoint',
      'defaultSnapPoint',
      'onSnapPointChange',
    ]) {
      expect(Object.keys(statements), prop).toContain(prop);
      expect(properties[prop].description, prop).toContain(statements[prop].states);
    }
  });

  it("the root's side is a typed enum and its open state and grab-bar switch are typed booleans, with no prop statement", () => {
    const root = units[DIRECTORY].contract;
    expect(root.props.properties.side).toMatchObject({ type: 'string', enum: ['bottom', 'left', 'right', 'top'] });
    for (const prop of ['open', 'defaultOpen', 'disablePointerDismissal', 'showSwipeHandle', 'snapToSequentialPoints']) {
      expect(root.props.properties[prop], prop).toMatchObject({ type: 'boolean' });
      expect(Object.keys(root.prop_statements ?? {}), prop).not.toContain(prop);
    }
    expect(root.props.properties).not.toHaveProperty('swipeDirection');
  });

  it("the root's one capability is the grab bar, switched by showSwipeHandle", () => {
    expect((units[DIRECTORY].contract.capabilities ?? []).map((entry) => entry.enabled_by)).toEqual(['showSwipeHandle']);
  });

  it("the panel's portal and focus props carry prop statements, and its composed Viewport and Content are named", () => {
    const content = units['drawer-content'].contract;
    for (const prop of ['container', 'initialFocus', 'finalFocus', 'render', 'style']) {
      expect(Object.keys(content.prop_statements ?? {}), prop).toContain(prop);
    }
    expect((content.unexposed_parts ?? []).map((entry) => entry.part)).toEqual(['Drawer.Viewport', 'Drawer.Content']);
    const ids = content.invariants.map((entry) => entry.id);
    expect(ids).toContain('named-by-its-title-described-by-its-description');
    expect(ids).toContain('backdrop-only-while-modal-and-not-nested');
  });
});

describe('drawer directory in a GTS store', () => {
  it('every component validates as an instance of the component type', () => {
    const gts = unitStore(Object.values(units));
    for (const { stem, contract } of Object.values(units)) {
      const result = gts.validateInstance(contract.$id);
      expect(result.ok, `${stem}: ${result.error}`).toBe(true);
    }
  });

  it('the buttons name the button surface, the layers and regions the div surface, title h2, description p, the root none', () => {
    for (const { stem, contract, elementSurface } of Object.values(units)) {
      if (elementSurface) expect(contract.forwards_to, stem).toBe(bareGtsId(String(elementSurface.$id)));
    }
    const expected: Record<string, string> = {
      'drawer-trigger': 'dom_button',
      'drawer-close': 'dom_button',
      'drawer-portal': 'dom_div',
      'drawer-swipe-handle': 'dom_div',
      'drawer-backdrop': 'dom_div',
      'drawer-content': 'dom_div',
      'drawer-header': 'dom_div',
      'drawer-footer': 'dom_div',
      'drawer-title': 'dom_h2',
      'drawer-description': 'dom_p',
    };
    for (const [stem, token] of Object.entries(expected)) {
      expect(units[stem].contract.forwards_to, stem).toBe(elementTypeRef(token));
    }
    expect(units[DIRECTORY].elementKind).toBeUndefined();
    expect(units[DIRECTORY].contract.forwards_to).toBeUndefined();
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
