// Conformance for the fifteen contracts of the combobox directory: the
// Combobox family (root and fourteen parts). One file because the
// interesting assertions are about how the parts relate; the per-component
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

const DIRECTORY = 'combobox';
const FAMILY = 'combobox';
const PART_STEMS = [
  'combobox-value',
  'combobox-trigger',
  'combobox-input',
  'combobox-content',
  'combobox-list',
  'combobox-empty',
  'combobox-group',
  'combobox-label',
  'combobox-collection',
  'combobox-item',
  'combobox-separator',
  'combobox-chips',
  'combobox-chip',
  'combobox-chips-input',
] as const;
const ALL_STEMS = [DIRECTORY, ...PART_STEMS] as const;
// Base UI's Combobox.Root, Combobox.Value and Combobox.Collection render no
// element of their own, so these three name no surface.
const NO_HOST = ['combobox', 'combobox-value', 'combobox-collection'] as const;

for (const stem of ALL_STEMS) assertContractFreshness(DIRECTORY, stem);

const units = compileUnits(DIRECTORY, ALL_STEMS, { allowNoHostElement: true });
const componentType = buildComponentType();
const ref = (stem: string) => componentRef(stem, contractMajor(DIRECTORY, stem));
const mountedIn = (stem: string) => (units[stem].contract.mounted_in ?? []).map((entry) => entry.component).sort();

describe('combobox directory: component type validity', () => {
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

describe('combobox family: membership resolves', () => {
  it('the root names the family, calls itself root, and carries every part', () => {
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

  it('the useComboboxAnchor hook is a companion of the root, not a component', () => {
    const companions = (units[DIRECTORY].contract.companions ?? []).map((entry) => entry.export);
    expect(companions).toEqual(['useComboboxAnchor']);
  });
});

describe('combobox directory: what nests where', () => {
  it('the root accepts the two fields and the popup', () => {
    expect(units[DIRECTORY].contract.accepts).toEqual({
      content: 'specified',
      components: [ref('combobox-input'), ref('combobox-chips'), ref('combobox-content')],
    });
  });

  it('the single-line field accepts only a trigger of its own', () => {
    expect(units['combobox-input'].contract.accepts).toEqual({
      content: 'specified',
      components: [ref('combobox-trigger')],
    });
  });

  it('the popup accepts the list and the no-results message, the list its items and sections', () => {
    expect(units['combobox-content'].contract.accepts.components).toEqual([ref('combobox-list'), ref('combobox-empty')]);
    expect(units['combobox-list'].contract.accepts.components).toEqual([
      ref('combobox-item'),
      ref('combobox-group'),
      ref('combobox-separator'),
      ref('combobox-collection'),
    ]);
  });

  it('the chips field accepts the value, the chips and the chips input', () => {
    expect(units['combobox-chips'].contract.accepts.components).toEqual([
      ref('combobox-value'),
      ref('combobox-chip'),
      ref('combobox-chips-input'),
    ]);
  });

  it('the separator and the chips input accept nothing', () => {
    expect(units['combobox-separator'].contract.accepts).toEqual({ content: 'nothing' });
    expect(units['combobox-chips-input'].contract.accepts).toEqual({ content: 'nothing' });
  });

  it("every part's mount points are FILLED from the family members that accept it", () => {
    expect(mountedIn('combobox-input')).toEqual([ref(DIRECTORY)]);
    expect(mountedIn('combobox-chips')).toEqual([ref(DIRECTORY)]);
    expect(mountedIn('combobox-trigger')).toEqual([ref('combobox-input')]);
    expect(mountedIn('combobox-content')).toEqual([ref(DIRECTORY)]);
    expect(mountedIn('combobox-list')).toEqual([ref('combobox-content')]);
    expect(mountedIn('combobox-empty')).toEqual([ref('combobox-content')]);
    expect(mountedIn('combobox-item')).toEqual(
      [ref('combobox-list'), ref('combobox-group'), ref('combobox-collection')].sort(),
    );
    expect(mountedIn('combobox-label')).toEqual([ref('combobox-group')]);
    expect(mountedIn('combobox-chip')).toEqual([ref('combobox-chips'), ref('combobox-value')].sort());
    expect(mountedIn('combobox-value')).toEqual([ref('combobox-chips')]);
    expect(mountedIn('combobox-chips-input')).toEqual([ref('combobox-chips')]);
    for (const stem of PART_STEMS) {
      for (const entry of units[stem].contract.mounted_in ?? []) {
        expect(entry.container, stem).toBe(pascalCase(String(resolveComponentRef(String(entry.component)).stem)));
      }
    }
  });

  it("the root's one mount point is FILLED from Field, and from nothing else", () => {
    // A family root may be mounted in another directory's container; only
    // parts are held to their own family. The entry is filled from Field's
    // own overlay, which accepts Combobox among its controls.
    expect(units[DIRECTORY].contract.mounted_in).toEqual([{ container: 'Field', component: componentRef('field', contractMajor('field', 'field')) }]);
  });

  it('every accepts reference and every part mount point points inside the family', () => {
    // The root's own mount point is left out: it is Field, asserted above.
    const familyRefs = new Set(ALL_STEMS.map((stem) => bareGtsId(String(units[stem].contract.$id))));
    for (const stem of ALL_STEMS) {
      const { contract } = units[stem];
      const mounts =
        stem === DIRECTORY
          ? []
          : (contract.mounted_in ?? []).map((entry) => entry.component).filter((r): r is string => r !== undefined);
      for (const nested of [...(contract.accepts.components ?? []), ...mounts]) {
        expect(familyRefs.has(nested), `${stem}: it names "${nested}", which is not a member of this family`).toBe(true);
      }
    }
  });
});

describe('combobox directory: what the schema cannot assert', () => {
  it("the root's generic value, callbacks, item functions and refs carry prop statements emitted into their descriptions", () => {
    const statements = units[DIRECTORY].contract.prop_statements ?? {};
    const properties = units[DIRECTORY].contract.props.properties;
    for (const prop of [
      'value',
      'defaultValue',
      'onValueChange',
      'inputValue',
      'defaultInputValue',
      'onInputValueChange',
      'items',
      'filter',
      'itemToStringLabel',
      'isItemEqualToValue',
      'multiple',
      'actionsRef',
    ]) {
      expect(Object.keys(statements), prop).toContain(prop);
      expect(properties[prop].description, prop).toContain(statements[prop].states);
    }
  });

  it("the root's open state and the field's own switches and labels are typed, with no prop statement", () => {
    const root = units[DIRECTORY].contract;
    for (const prop of ['open', 'defaultOpen', 'autoHighlight', 'disabled']) {
      expect(root.props.properties[prop], prop).toEqual({ type: 'boolean' });
      expect(Object.keys(root.prop_statements ?? {}), prop).not.toContain(prop);
    }
    const input = units['combobox-input'].contract;
    // Each with the default combobox.tsx writes for it.
    for (const [prop, type, value] of [
      ['showTrigger', 'boolean', true],
      ['showClear', 'boolean', false],
      ['toggleLabel', 'string', 'Toggle options'],
      ['clearLabel', 'string', 'Clear value'],
    ] as const) {
      expect(input.props.properties[prop], prop).toEqual({ type, default: value });
      expect(Object.keys(input.prop_statements ?? {}), prop).not.toContain(prop);
    }
    const chip = units['combobox-chip'].contract;
    expect(chip.props.properties.showRemove).toEqual({ type: 'boolean', default: true });
    expect(chip.props.properties.removeLabel).toEqual({ type: 'string', default: 'Remove' });
  });

  it("the list's, the value's and the collection's function children carry prop statements", () => {
    for (const stem of ['combobox-list', 'combobox-value', 'combobox-collection']) {
      expect(Object.keys(units[stem].contract.prop_statements ?? {}), stem).toContain('children');
    }
  });

  it("the content's anchor, offsets and focus targets carry prop statements", () => {
    const content = units['combobox-content'].contract;
    for (const prop of ['container', 'anchor', 'sideOffset', 'alignOffset', 'collisionBoundary', 'collisionPadding', 'initialFocus', 'finalFocus']) {
      expect(Object.keys(content.prop_statements ?? {}), prop).toContain(prop);
    }
  });

  it('the composed primitive parts the kit does not export are named as unexposed', () => {
    const parts = (stem: string) => (units[stem].contract.unexposed_parts ?? []).map((entry) => entry.part);
    expect(parts('combobox-content')).toEqual(['Combobox.Portal', 'Combobox.Positioner']);
    expect(parts('combobox-input')).toEqual(['Combobox.Clear']);
    expect(parts('combobox-item')).toEqual(['Combobox.ItemIndicator']);
    expect(parts('combobox-chip')).toEqual(['Combobox.ChipRemove']);
  });
});

describe('combobox directory in a GTS store', () => {
  it('every component validates as an instance of the component type', () => {
    const gts = unitStore(Object.values(units));
    for (const { stem, contract } of Object.values(units)) {
      const result = gts.validateInstance(contract.$id);
      expect(result.ok, `${stem}: ${result.error}`).toBe(true);
    }
  });

  it('each part names the surface of the element it renders, the three element-less exports none', () => {
    for (const { stem, contract, elementSurface } of Object.values(units)) {
      if (elementSurface) expect(contract.forwards_to, stem).toBe(bareGtsId(String(elementSurface.$id)));
    }
    expect(units['combobox-trigger'].contract.forwards_to).toBe(elementTypeRef('dom_button'));
    expect(units['combobox-input'].contract.forwards_to).toBe(elementTypeRef('dom_input'));
    expect(units['combobox-chips-input'].contract.forwards_to).toBe(elementTypeRef('dom_input'));
    for (const stem of ['combobox-content', 'combobox-list', 'combobox-empty', 'combobox-group', 'combobox-label', 'combobox-item', 'combobox-separator', 'combobox-chips', 'combobox-chip']) {
      expect(units[stem].contract.forwards_to, stem).toBe(elementTypeRef('dom_div'));
    }
    for (const stem of NO_HOST) {
      expect(units[stem].elementKind, stem).toBeUndefined();
      expect(units[stem].contract.forwards_to, stem).toBeUndefined();
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
