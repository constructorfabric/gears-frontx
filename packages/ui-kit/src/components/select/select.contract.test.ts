// Conformance for the ten contracts of the select directory: the Select
// family (root, trigger, value, content, group, label, item, separator and
// the two scroll buttons). One file because the interesting assertions are
// about how the ten relate; the per-component shape comes from testing.ts's
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

const DIRECTORY = 'select';
const FAMILY = 'select';
const PART_STEMS = [
  'select-value',
  'select-trigger',
  'select-content',
  'select-group',
  'select-label',
  'select-item',
  'select-separator',
  'select-scroll-up-button',
  'select-scroll-down-button',
] as const;
const ALL_STEMS = [DIRECTORY, ...PART_STEMS] as const;
const SCROLL_STEMS = ['select-scroll-up-button', 'select-scroll-down-button'] as const;

for (const stem of ALL_STEMS) assertContractFreshness(DIRECTORY, stem);

// The root renders no element of its own (Base UI's Select.Root provides
// context and a hidden input), so it names no surface; every part does.
const units = compileUnits(DIRECTORY, ALL_STEMS, { allowNoHostElement: true });
const componentType = buildComponentType();
const ref = (stem: string) => componentRef(stem, contractMajor(DIRECTORY, stem));
const mountOf = (stem: string) => ({ container: pascalCase(stem), component: ref(stem) });

describe('select directory: component type validity', () => {
  it('every one of the ten validates against the component type', () => {
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

describe('select family: membership resolves', () => {
  it('the root names the family, calls itself root, and carries all nine parts', () => {
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

  it('the roster read from the other end has the root and the nine parts', () => {
    const roster = familyRoster(FAMILY);
    expect(roster.root).toBe(ref(DIRECTORY));
    expect(roster.parts).toEqual(PART_STEMS.map(ref).sort());
  });
});

describe('select directory: what nests where', () => {
  it('the root accepts the trigger and the content and nothing else', () => {
    expect(units[DIRECTORY].contract.accepts).toEqual({
      content: 'specified',
      components: [ref('select-trigger'), ref('select-content')],
    });
  });

  it('the trigger accepts SelectValue or plain text', () => {
    expect(units['select-trigger'].contract.accepts).toEqual({
      content: 'specified',
      components: [ref('select-value')],
      text: true,
    });
  });

  it('the content accepts groups, items and separators, but neither the label nor the scroll buttons', () => {
    // SelectLabel throws outside a SelectGroup, and the content renders its
    // own pair of scroll buttons around the list.
    expect(units['select-content'].contract.accepts).toEqual({
      content: 'specified',
      components: [ref('select-group'), ref('select-item'), ref('select-separator')],
    });
  });

  it('a group accepts its label and items', () => {
    expect(units['select-group'].contract.accepts).toEqual({
      content: 'specified',
      components: [ref('select-label'), ref('select-item')],
    });
  });

  it('the leaves take text, or nothing at all', () => {
    for (const stem of ['select-value', 'select-label', 'select-item']) {
      expect(units[stem].contract.accepts, stem).toEqual({ content: 'specified', text: true });
    }
    for (const stem of ['select-separator', ...SCROLL_STEMS]) {
      expect(units[stem].contract.accepts, stem).toEqual({ content: 'nothing' });
    }
  });

  it("every part's mount point is FILLED from the contracts that accept it", () => {
    expect(units['select-trigger'].contract.mounted_in).toEqual([mountOf(DIRECTORY)]);
    expect(units['select-content'].contract.mounted_in).toEqual([mountOf(DIRECTORY)]);
    expect(units['select-value'].contract.mounted_in).toEqual([mountOf('select-trigger')]);
    expect(units['select-group'].contract.mounted_in).toEqual([mountOf('select-content')]);
    expect(units['select-separator'].contract.mounted_in).toEqual([mountOf('select-content')]);
    expect(units['select-label'].contract.mounted_in).toEqual([mountOf('select-group')]);
    expect(units['select-item'].contract.mounted_in).toEqual([mountOf('select-content'), mountOf('select-group')]);
  });

  it("the root's mount points are FILLED from ButtonGroup and Field, and from nothing else", () => {
    // A family root may be mounted in another directory's container; only
    // parts are held to their own family. Both entries are filled from the
    // containers' own overlays.
    expect(units[DIRECTORY].contract.mounted_in).toEqual([
      { container: 'ButtonGroup', component: componentRef('button-group', contractMajor('button-group', 'button-group')) },
      { container: 'Field', component: componentRef('field', contractMajor('field', 'field')) },
    ]);
  });

  it('the two scroll buttons have no mount point: nothing in the kit accepts them', () => {
    for (const stem of SCROLL_STEMS) {
      expect(units[stem].contract.mounted_in, stem).toBeUndefined();
    }
  });

  it('every accepts reference and every part mount point points inside the family', () => {
    // The root's own mount points are left out: they are ButtonGroup and
    // Field, asserted above.
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

describe('select directory: what the schema cannot assert', () => {
  it("the root's generic value, callbacks and item data carry prop statements emitted into their descriptions", () => {
    const statements = units[DIRECTORY].contract.prop_statements ?? {};
    const properties = units[DIRECTORY].contract.props.properties;
    for (const prop of [
      'value',
      'defaultValue',
      'onValueChange',
      'multiple',
      'items',
      'itemToStringLabel',
      'itemToStringValue',
      'isItemEqualToValue',
      'onOpenChange',
      'onOpenChangeComplete',
      'actionsRef',
      'inputRef',
    ]) {
      expect(Object.keys(statements), prop).toContain(prop);
      expect(properties[prop].description, prop).toContain(statements[prop].states);
    }
  });

  it("the root's open state and flags are typed, with no prop statement", () => {
    const root = units[DIRECTORY].contract;
    for (const prop of ['open', 'defaultOpen', 'disabled', 'readOnly', 'required', 'modal']) {
      expect(root.props.properties[prop], prop).toEqual({ type: 'boolean' });
      expect(Object.keys(root.prop_statements ?? {}), prop).not.toContain(prop);
    }
  });

  it("the trigger's size and variant axes are the cva's, and carry no prop statement", () => {
    const trigger = units['select-trigger'].contract;
    expect(trigger.props.properties.size).toMatchObject({ enum: ['default', 'sm'] });
    expect(trigger.props.properties.variant).toMatchObject({ enum: ['default', 'filter'] });
    for (const prop of ['size', 'variant']) {
      expect(Object.keys(trigger.prop_statements ?? {}), prop).not.toContain(prop);
    }
  });

  it("the content's placement enums are typed and its offset unions carry prop statements", () => {
    const content = units['select-content'].contract;
    expect(content.props.properties.side).toEqual({
      type: 'string',
      enum: ['bottom', 'inline-end', 'inline-start', 'left', 'right', 'top'],
      default: 'bottom',
    });
    expect(content.props.properties.align).toEqual({ type: 'string', enum: ['center', 'end', 'start'], default: 'center' });
    expect(content.props.properties.alignItemWithTrigger).toEqual({ type: 'boolean', default: true });
    for (const prop of ['container', 'sideOffset', 'alignOffset', 'collisionBoundary', 'collisionPadding', 'finalFocus']) {
      expect(Object.keys(content.prop_statements ?? {}), prop).toContain(prop);
    }
  });

  it("the item's untyped value carries a prop statement", () => {
    const item = units['select-item'].contract;
    expect(Object.keys(item.prop_statements ?? {})).toContain('value');
    expect(item.props.properties.value.description).toContain(item.prop_statements?.value.states);
  });

  it('the composed primitive parts are named under unexposed_parts', () => {
    const parts = (stem: string) => (units[stem].contract.unexposed_parts ?? []).map((entry) => entry.part);
    expect(parts('select-trigger')).toEqual(['Select.Icon']);
    expect(parts('select-content')).toEqual(['Select.Portal', 'Select.Positioner', 'Select.List']);
    expect(parts('select-item')).toEqual(['Select.ItemText', 'Select.ItemIndicator']);
  });
});

describe('select directory in a GTS store', () => {
  it('every component validates as an instance of the component type', () => {
    const gts = unitStore(Object.values(units));
    for (const { stem, contract } of Object.values(units)) {
      const result = gts.validateInstance(contract.$id);
      expect(result.ok, `${stem}: ${result.error}`).toBe(true);
    }
  });

  it('the trigger names the button surface, the value the span surface, every other part the div surface, the root none', () => {
    for (const { stem, contract, elementSurface } of Object.values(units)) {
      if (elementSurface) expect(contract.forwards_to, stem).toBe(bareGtsId(String(elementSurface.$id)));
    }
    expect(units['select-trigger'].contract.forwards_to).toBe(elementTypeRef('dom_button'));
    expect(units['select-value'].contract.forwards_to).toBe(elementTypeRef('dom_span'));
    for (const stem of PART_STEMS.filter((s) => s !== 'select-trigger' && s !== 'select-value')) {
      expect(units[stem].contract.forwards_to, stem).toBe(elementTypeRef('dom_div'));
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
