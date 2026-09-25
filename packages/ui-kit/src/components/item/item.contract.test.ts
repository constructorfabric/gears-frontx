// Conformance for the ten contracts of the item directory: the item family
// (Item with its Media, Content, Title, Description, Actions, Header and
// Footer parts) and the item_group family (ItemGroup with its Separator
// part). One file because the interesting assertions are about how the ten
// relate - two families in one directory, a two-level nesting inside the
// row, and a group that hosts the other family's Item roots; see
// avatar.contract.test.ts for the same two-family shape.
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

const DIRECTORY = 'item';
const CONTENT = 'item-content';
// The parts the row hosts directly, and the ones ItemContent hosts.
const ROW_HOSTED = ['item-media', CONTENT, 'item-actions', 'item-header', 'item-footer'] as const;
const CONTENT_HOSTED = ['item-title', 'item-description'] as const;
const ITEM_PARTS = [...ROW_HOSTED, ...CONTENT_HOSTED] as const;
const GROUP = 'item-group';
const GROUP_PARTS = ['item-separator'] as const;
const ITEM_FAMILY = [DIRECTORY, ...ITEM_PARTS] as const;
const GROUP_FAMILY = [GROUP, ...GROUP_PARTS] as const;
const ALL_STEMS = [...ITEM_FAMILY, ...GROUP_FAMILY] as const;

for (const stem of ALL_STEMS) assertContractFreshness(DIRECTORY, stem);

const units = compileUnits(DIRECTORY, ALL_STEMS);
const componentType = buildComponentType();
const ref = (stem: string) => componentRef(stem, contractMajor(DIRECTORY, stem));

describe('item directory: component type validity', () => {
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

describe('item directory: two families resolve', () => {
  it('Item is the root of the item family and carries its seven parts', () => {
    const root = units[DIRECTORY].contract.family_membership;
    expect(root?.name).toBe('item');
    expect(root?.role).toBe('root');
    expect(root?.members).toEqual(ITEM_PARTS.map(ref).sort());
  });

  it('ItemGroup is the root of the item_group family and carries the separator', () => {
    const root = units[GROUP].contract.family_membership;
    expect(root?.name).toBe('item_group');
    expect(root?.role).toBe('root');
    expect(root?.members).toEqual(GROUP_PARTS.map(ref).sort());
  });

  it('every part names its own family, calls itself a part, and lists no members', () => {
    for (const [family, parts] of [
      ['item', ITEM_PARTS],
      ['item_group', GROUP_PARTS],
    ] as const) {
      for (const stem of parts) {
        const membership = units[stem].contract.family_membership;
        expect(membership?.name, stem).toBe(family);
        expect(membership?.role, stem).toBe('part');
        expect(membership?.members, stem).toBeUndefined();
      }
    }
  });

  it('every part a root carries ships a compiled contract of its own', () => {
    for (const root of [DIRECTORY, GROUP]) {
      for (const member of units[root].contract.family_membership?.members ?? []) {
        const target = resolveComponentRef(member);
        expect(target.contractId, `${member}: ${target.stem} ships no compiled contract`).toBe(member);
      }
    }
  });

  it('each roster has its own root and parts and none of the other family', () => {
    const item = familyRoster('item');
    expect(item.root).toBe(ref(DIRECTORY));
    expect(item.parts).toEqual(ITEM_PARTS.map(ref).sort());
    const group = familyRoster('item_group');
    expect(group.root).toBe(ref(GROUP));
    expect(group.parts).toEqual(GROUP_PARTS.map(ref).sort());
    for (const stem of GROUP_FAMILY) expect(item.parts, stem).not.toContain(ref(stem));
    for (const stem of ITEM_FAMILY) expect(group.parts, stem).not.toContain(ref(stem));
  });
});

describe('item directory: what nests where', () => {
  it('Item accepts its five row parts and text, and nothing else', () => {
    expect(units[DIRECTORY].contract.accepts).toEqual({
      content: 'specified',
      components: ROW_HOSTED.map(ref),
      text: true,
    });
  });

  it('ItemContent accepts the title and the description, and nothing else', () => {
    expect(units[CONTENT].contract.accepts).toEqual({ content: 'specified', components: CONTENT_HOSTED.map(ref) });
  });

  it('ItemGroup accepts Item roots and the separator, and nothing else', () => {
    expect(units[GROUP].contract.accepts).toEqual({
      content: 'specified',
      components: [ref(DIRECTORY), ref('item-separator')],
    });
  });

  it('the text parts take text, the open slots take anything, and the separator takes nothing', () => {
    for (const stem of CONTENT_HOSTED) {
      expect(units[stem].contract.accepts, stem).toEqual({ content: 'specified', text: true });
    }
    for (const stem of ['item-media', 'item-actions', 'item-header', 'item-footer']) {
      expect(units[stem].contract.accepts, stem).toEqual({ content: 'unconstrained' });
    }
    expect(units['item-separator'].contract.accepts).toEqual({ content: 'nothing' });
  });

  it("every part's mount point is FILLED from the member that accepts it, and only that member", () => {
    for (const stem of ROW_HOSTED) {
      expect(units[stem].contract.mounted_in, stem).toEqual([{ container: pascalCase(DIRECTORY), component: ref(DIRECTORY) }]);
    }
    for (const stem of CONTENT_HOSTED) {
      expect(units[stem].contract.mounted_in, stem).toEqual([{ container: pascalCase(CONTENT), component: ref(CONTENT) }]);
    }
    expect(units['item-separator'].contract.mounted_in).toEqual([{ container: pascalCase(GROUP), component: ref(GROUP) }]);
  });

  it('Item is mounted in ItemGroup, filled, and on its own in the application, authored', () => {
    const mounts = units[DIRECTORY].contract.mounted_in ?? [];
    expect(mounts).toContainEqual({ container: pascalCase(GROUP), component: ref(GROUP) });
    const outside = mounts.filter((entry) => entry.component === undefined);
    expect(outside).toHaveLength(1);
    expect(outside[0]?.container).toBe('any parent in the consuming application');
    expect(outside[0]?.note).toBeTruthy();
  });

  it('gives the group no mount point at all - nothing in the kit mounts an ItemGroup', () => {
    expect(units[GROUP].contract.mounted_in).toBeUndefined();
  });

  it('every accepts reference and every part mount point stays inside its family, except the group hosting Item roots', () => {
    for (const family of [ITEM_FAMILY, GROUP_FAMILY]) {
      const familyRefs = new Set(family.map((stem) => bareGtsId(String(units[stem].contract.$id))));
      for (const stem of family) {
        const { contract } = units[stem];
        const mounts =
          stem === DIRECTORY || stem === GROUP
            ? []
            : (contract.mounted_in ?? []).map((entry) => entry.component).filter((r): r is string => r !== undefined);
        for (const nested of [...(contract.accepts.components ?? []), ...mounts]) {
          // The one crossing: the group hosts Item roots from the other family.
          if (stem === GROUP && nested === ref(DIRECTORY)) continue;
          expect(familyRefs.has(nested), `${stem}: it names "${nested}", which is not a member of this family`).toBe(true);
        }
      }
    }
  });
});

describe('item directory: what the schema cannot assert', () => {
  it("Item's render and the separator's render and style carry prop statements, emitted into their descriptions", () => {
    for (const [stem, props] of [
      [DIRECTORY, ['render']],
      ['item-separator', ['render', 'style']],
    ] as const) {
      const contract = units[stem].contract;
      expect(Object.keys(contract.prop_statements ?? {}).sort(), stem).toEqual([...props].sort());
      for (const prop of props) {
        expect(contract.props.properties[prop].description, `${stem}.${prop}`).toContain(contract.prop_statements?.[prop].states);
      }
    }
  });

  it('no other contract carries a prop statement, and none has a partially typed prop left over', () => {
    for (const { stem, contract } of Object.values(units)) {
      expect(Object.keys(contract['x-uikit'].partially_typed_props), stem).toEqual([]);
      if (stem !== DIRECTORY && stem !== 'item-separator') expect(contract.prop_statements, stem).toBeUndefined();
    }
  });

  it('the two cva axes reach Item and ItemMedia as typed enums with their defaults', () => {
    // The code is the owner of both recipes (item.tsx's itemVariants and
    // itemMediaVariants); this checks they reached the right contracts.
    const root = units[DIRECTORY].contract.props.properties;
    expect(root.variant).toMatchObject({ type: 'string', enum: ['default', 'outline', 'muted'], default: 'default' });
    expect(root.size).toMatchObject({ type: 'string', enum: ['default', 'sm', 'xs'], default: 'default' });
    expect(units['item-media'].contract.props.properties.variant).toMatchObject({
      type: 'string',
      enum: ['default', 'icon', 'image'],
      default: 'default',
    });
  });

  it('the plain parts and the group declare no kit prop of their own', () => {
    for (const stem of [CONTENT, ...CONTENT_HOSTED, 'item-actions', 'item-header', 'item-footer', GROUP]) {
      expect(units[stem].contract.props.properties, stem).toEqual({});
    }
  });
});

describe('item directory in a GTS store', () => {
  it('every component validates as an instance of the component type', () => {
    const gts = unitStore(Object.values(units));
    for (const { stem, contract } of Object.values(units)) {
      const result = gts.validateInstance(contract.$id);
      expect(result.ok, `${stem}: ${result.error}`).toBe(true);
    }
  });

  it('each component names the surface of the element it renders', () => {
    // ItemDescription renders a p; every other export a div (ItemSeparator
    // through the kit's Separator and its primitive).
    for (const { stem, contract, elementSurface } of Object.values(units)) {
      expect(contract.forwards_to, stem).toBe(bareGtsId(String(elementSurface.$id)));
      expect(contract.forwards_to, stem).toBe(elementTypeRef(stem === 'item-description' ? 'dom_p' : 'dom_div'));
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
