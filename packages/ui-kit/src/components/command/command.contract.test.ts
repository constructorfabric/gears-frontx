// Conformance for the nine contracts of the command directory: the Command
// root, CommandDialog (a second entry point that renders its own Command
// inside the kit's Dialog) and the seven parts they host. One file because
// the interesting assertions are about how the nine relate; the
// per-component shape comes from testing.ts's assertContractFreshness.
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

const DIRECTORY = 'command';
const PART_STEMS = [
  'command-dialog',
  'command-input',
  'command-list',
  'command-empty',
  'command-group',
  'command-item',
  'command-shortcut',
  'command-separator',
] as const;
const ALL_STEMS = [DIRECTORY, ...PART_STEMS] as const;

for (const stem of ALL_STEMS) assertContractFreshness(DIRECTORY, stem);

// CommandDialog's root is the kit's Dialog root, which renders no element of
// its own, so it names no surface; every other member does.
const units = compileUnits(DIRECTORY, ALL_STEMS, { allowNoHostElement: true });
const componentType = buildComponentType();
const ref = (stem: string) => componentRef(stem, contractMajor(DIRECTORY, stem));
const mountsOf = (stem: string) => (units[stem].contract.mounted_in ?? []).map((entry) => entry.component).sort();

describe('command directory: component type validity', () => {
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

describe('command family: membership resolves', () => {
  it('the root names the family, calls itself root, and carries every part', () => {
    const root = units[DIRECTORY].contract.family_membership;
    expect(root?.name).toBe('command');
    expect(root?.role).toBe('root');
    expect(root?.members).toEqual(PART_STEMS.map(ref).sort());
  });

  it('every part names the same family, calls itself a part, and lists no members', () => {
    for (const stem of PART_STEMS) {
      const membership = units[stem].contract.family_membership;
      expect(membership?.name, stem).toBe('command');
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

  it('the roster has the root and the eight parts', () => {
    const roster = familyRoster('command');
    expect(roster.root).toBe(ref(DIRECTORY));
    expect(roster.parts).toEqual(PART_STEMS.map(ref).sort());
  });
});

describe('command family: what nests where', () => {
  it('the root and CommandDialog both accept the input and the list, and nothing else', () => {
    for (const stem of [DIRECTORY, 'command-dialog']) {
      expect(units[stem].contract.accepts, stem).toEqual({
        content: 'specified',
        components: [ref('command-input'), ref('command-list')],
      });
    }
  });

  it('the list accepts the empty message, groups, items and separators', () => {
    expect(units['command-list'].contract.accepts).toEqual({
      content: 'specified',
      components: [ref('command-empty'), ref('command-group'), ref('command-item'), ref('command-separator')],
    });
  });

  it('a group accepts items, and an item accepts text and a shortcut', () => {
    expect(units['command-group'].contract.accepts).toEqual({ content: 'specified', components: [ref('command-item')] });
    expect(units['command-item'].contract.accepts).toEqual({
      content: 'specified',
      text: true,
      components: [ref('command-shortcut')],
    });
  });

  it("every part's mount point is FILLED from the contracts that accept it", () => {
    expect(mountsOf('command-input')).toEqual([ref(DIRECTORY), ref('command-dialog')].sort());
    expect(mountsOf('command-list')).toEqual([ref(DIRECTORY), ref('command-dialog')].sort());
    expect(mountsOf('command-empty')).toEqual([ref('command-list')]);
    expect(mountsOf('command-separator')).toEqual([ref('command-list')]);
    expect(mountsOf('command-item')).toEqual([ref('command-group'), ref('command-list')].sort());
    expect(mountsOf('command-shortcut')).toEqual([ref('command-item')]);
    expect(units['command-shortcut'].contract.mounted_in).toEqual([
      { container: pascalCase('command-item'), component: ref('command-item') },
    ]);
  });

  it('the root and CommandDialog have no mount point: nothing in the kit accepts them', () => {
    expect(units[DIRECTORY].contract.mounted_in).toBeUndefined();
    expect(units['command-dialog'].contract.mounted_in).toBeUndefined();
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

describe('command directory: what the schema cannot assert', () => {
  it('the callbacks, React-node props and unions carry prop statements emitted into their descriptions', () => {
    const expected: Record<string, string[]> = {
      command: ['children', 'defaultValue', 'filter', 'onValueChange'],
      'command-dialog': [
        'children',
        'title',
        'description',
        'modal',
        'onOpenChange',
        'onOpenChangeComplete',
        'actionsRef',
        'handle',
        'triggerId',
        'defaultTriggerId',
      ],
      'command-input': ['onValueChange'],
      'command-list': ['children'],
      'command-empty': ['children'],
      'command-group': ['children', 'heading'],
      'command-item': ['children', 'onSelect'],
    };
    for (const [stem, props] of Object.entries(expected)) {
      const { contract } = units[stem];
      const statements = contract.prop_statements ?? {};
      expect(Object.keys(statements).sort(), stem).toEqual([...props].sort());
      for (const prop of props) {
        expect(contract.props.properties[prop].description, `${stem}.${prop}`).toContain(statements[prop].states);
      }
    }
    expect(units['command-shortcut'].contract.prop_statements).toBeUndefined();
    expect(units['command-separator'].contract.prop_statements).toBeUndefined();
  });

  it("files the library's own props as API, typed, and leaves React's element attributes on the surface", () => {
    const root = units[DIRECTORY].contract.props.properties;
    for (const prop of ['shouldFilter', 'loop', 'vimBindings', 'disablePointerSelection', 'asChild']) {
      expect(root[prop], prop).toEqual({ type: 'boolean' });
    }
    expect(root.value).toEqual({ type: 'string' });
    expect(root.label).toEqual({ type: 'string' });
    expect(units['command-item'].contract.props.properties.disabled).toEqual({ type: 'boolean' });
    expect(units['command-separator'].contract.props.properties.alwaysRender).toEqual({ type: 'boolean' });
    for (const stem of ALL_STEMS) {
      for (const prop of ['role', 'onClick', 'id']) {
        expect(units[stem].contract.props.properties, `${stem}.${prop}`).not.toHaveProperty(prop);
      }
    }
  });

  it("CommandDialog's API is the Dialog root's props plus its own, and no Command root prop", () => {
    const dialog = units['command-dialog'].contract.props.properties;
    for (const prop of ['open', 'defaultOpen', 'disablePointerDismissal']) {
      expect(dialog[prop], prop).toEqual({ type: 'boolean' });
    }
    expect(dialog.showCloseButton).toEqual({ type: 'boolean', default: false });
    for (const prop of ['shouldFilter', 'filter', 'loop', 'label', 'value']) {
      expect(dialog, prop).not.toHaveProperty(prop);
    }
    expect(units['command-dialog'].contract.props.required).toEqual(['children']);
  });

  it('the extractor could read every member in full', () => {
    for (const stem of ALL_STEMS) {
      expect(units[stem].contract['x-uikit'].cannot_extract, stem).toEqual([]);
    }
  });
});

describe('command directory in a GTS store', () => {
  it('every component validates as an instance of the component type', () => {
    const gts = unitStore(Object.values(units));
    for (const { stem, contract } of Object.values(units)) {
      const result = gts.validateInstance(contract.$id);
      expect(result.ok, `${stem}: ${result.error}`).toBe(true);
    }
  });

  it('the input names the input surface, the shortcut the span surface, CommandDialog none, the rest the div surface', () => {
    for (const { stem, contract, elementSurface } of Object.values(units)) {
      if (elementSurface) expect(contract.forwards_to, stem).toBe(bareGtsId(String(elementSurface.$id)));
    }
    expect(units['command-input'].contract.forwards_to).toBe(elementTypeRef('dom_input'));
    expect(units['command-shortcut'].contract.forwards_to).toBe(elementTypeRef('dom_span'));
    for (const stem of [DIRECTORY, 'command-list', 'command-empty', 'command-group', 'command-item', 'command-separator']) {
      expect(units[stem].contract.forwards_to, stem).toBe(elementTypeRef('dom_div'));
    }
    expect(units['command-dialog'].elementKind).toBeUndefined();
    expect(units['command-dialog'].contract.forwards_to).toBeUndefined();
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
