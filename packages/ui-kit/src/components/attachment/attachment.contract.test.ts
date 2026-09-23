// Conformance for the nine attachment contracts - one file because the
// interesting assertions are about how they relate, not about any one in
// isolation. Attachment and its seven parts form the attachment family
// (root and parts, as in radio-group.contract.test.ts), nested one level
// deeper for the title/description column and the action row;
// AttachmentGroup belongs to no family: it wraps whole attachments, so it
// is not a part of the thing it wraps, and its accepts names the root.
import { GTS } from '@globaltypesystem/gts-ts';
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

const DIRECTORY = 'attachment';
const GROUP = 'attachment-group';
const CONTENT = 'attachment-content';
const ACTIONS = 'attachment-actions';
// The parts the root hosts directly, and the ones its two inner containers host.
const ROOT_HOSTED = ['attachment-media', CONTENT, ACTIONS, 'attachment-trigger'] as const;
const CONTENT_HOSTED = ['attachment-title', 'attachment-description'] as const;
const ACTIONS_HOSTED = ['attachment-action'] as const;
const PART_STEMS = [...ROOT_HOSTED, ...CONTENT_HOSTED, ...ACTIONS_HOSTED] as const;
const FAMILY_STEMS = [DIRECTORY, ...PART_STEMS] as const;
const ALL_STEMS = [...FAMILY_STEMS, GROUP] as const;

for (const stem of ALL_STEMS) assertContractFreshness(DIRECTORY, stem);

const units = compileUnits(DIRECTORY, ALL_STEMS);
const componentType = buildComponentType();

const ref = (stem: string) => componentRef(stem, contractMajor(DIRECTORY, stem));
const ROOT_REF = ref(DIRECTORY);

describe('attachment: component type validity', () => {
  it('all nine contracts validate against the component type', () => {
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

describe('attachment family: membership resolves', () => {
  it('the root names the family, calls itself root, and carries all seven parts', () => {
    const root = units[DIRECTORY].contract.family_membership;
    expect(root?.name).toBe('attachment');
    expect(root?.role).toBe('root');
    expect(root?.members).toEqual(PART_STEMS.map(ref).sort());
  });

  it('every part names the same family, calls itself a part, and lists no members', () => {
    for (const stem of PART_STEMS) {
      const membership = units[stem].contract.family_membership;
      expect(membership?.name, stem).toBe('attachment');
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

  it('the root is the only member the roster calls a root, and the group is not in the roster', () => {
    const roster = familyRoster('attachment');
    expect(roster.root).toBe(ROOT_REF);
    expect(roster.parts).toEqual(PART_STEMS.map(ref).sort());
    expect(roster.parts).not.toContain(ref(GROUP));
  });

  it('the group states no family membership', () => {
    // A wrapper around whole attachments is not a part of the attachment:
    // an Attachment also stands on its own.
    expect(units[GROUP].contract.family_membership).toBeUndefined();
  });
});

describe('attachment: what nests where', () => {
  it('the root accepts media, content, actions and trigger, and nothing else', () => {
    expect(units[DIRECTORY].contract.accepts).toEqual({ content: 'specified', components: ROOT_HOSTED.map(ref) });
  });

  it('the content column accepts title and description, and the action row accepts the action', () => {
    expect(units[CONTENT].contract.accepts).toEqual({ content: 'specified', components: CONTENT_HOSTED.map(ref) });
    expect(units[ACTIONS].contract.accepts).toEqual({ content: 'specified', components: ACTIONS_HOSTED.map(ref) });
  });

  it('the group accepts Attachment and nothing else', () => {
    expect(units[GROUP].contract.accepts).toEqual({ content: 'specified', components: [ROOT_REF] });
  });

  it('the leaf parts state their own content', () => {
    expect(units['attachment-media'].contract.accepts).toEqual({ content: 'unconstrained' });
    expect(units['attachment-trigger'].contract.accepts).toEqual({ content: 'nothing' });
    for (const stem of CONTENT_HOSTED) {
      expect(units[stem].contract.accepts, stem).toEqual({ content: 'specified', text: true });
    }
    expect(units['attachment-action'].contract.accepts).toEqual({ content: 'specified', text: true, icons_via: 'icon' });
  });

  it("every part's mount point is FILLED from the member that accepts it, and only that member", () => {
    for (const stem of ROOT_HOSTED) {
      expect(units[stem].contract.mounted_in, stem).toEqual([{ container: pascalCase(DIRECTORY), component: ROOT_REF }]);
    }
    for (const stem of CONTENT_HOSTED) {
      expect(units[stem].contract.mounted_in, stem).toEqual([{ container: pascalCase(CONTENT), component: ref(CONTENT) }]);
    }
    for (const stem of ACTIONS_HOSTED) {
      expect(units[stem].contract.mounted_in, stem).toEqual([{ container: pascalCase(ACTIONS), component: ref(ACTIONS) }]);
    }
  });

  it("the root's mount points include the group, FILLED from its accepts, and one authored entry outside the kit", () => {
    const mounts = units[DIRECTORY].contract.mounted_in ?? [];
    expect(mounts).toContainEqual({ container: pascalCase(GROUP), component: ref(GROUP) });
    const outside = mounts.filter((entry) => entry.component === undefined);
    expect(outside).toHaveLength(1);
    expect(outside[0]?.container).toBe('any parent in the consuming application');
  });

  it('gives the group no mount point at all - nothing in the kit names AttachmentGroup in its accepts', () => {
    expect(units[GROUP].contract.mounted_in).toBeUndefined();
  });

  it('every accepts reference, and every part mount point, points inside the directory', () => {
    // The root's own mount points are left out: a family root may be
    // mounted in another directory's container, and those entries are
    // filled from that container's overlay.
    const directoryRefs = new Set(Object.values(units).map(({ contract }) => bareGtsId(String(contract.$id))));
    for (const { stem, contract } of Object.values(units)) {
      const mounts =
        stem === DIRECTORY
          ? []
          : (contract.mounted_in ?? []).map((entry) => entry.component).filter((mount): mount is string => mount !== undefined);
      for (const nested of [...(contract.accepts.components ?? []), ...mounts]) {
        expect(directoryRefs.has(nested), `${stem}: it names "${nested}", which is not a contract of this directory`).toBe(true);
      }
    }
  });
});

describe('attachment: what the schema states', () => {
  it("the action's size default is the `sm` it writes into its own props, over Button's", () => {
    expect(units['attachment-action'].contract.props.properties.size.default).toBe('sm');
  });
});

describe('attachment: what the schema cannot assert', () => {
  const STATEMENTS: Record<string, string[]> = {
    'attachment-action': ['icon', 'render', 'style'],
    'attachment-trigger': ['render'],
  };

  it('the action and the trigger carry exactly the prop statements their untyped props need, emitted into their descriptions', () => {
    for (const [stem, names] of Object.entries(STATEMENTS)) {
      const statements = units[stem].contract.prop_statements ?? {};
      expect(Object.keys(statements).sort(), stem).toEqual(names);
      for (const name of names) {
        expect(units[stem].contract.props.properties[name].description, `${stem}.${name}`).toContain(statements[name].states);
      }
    }
  });

  it('no other contract carries a prop statement, and only the action keeps a kit slot in partially_typed_props', () => {
    for (const { stem, contract } of Object.values(units)) {
      expect(Object.keys(contract['x-uikit'].partially_typed_props), stem).toEqual(stem === 'attachment-action' ? ['icon'] : []);
      if (!(stem in STATEMENTS)) expect(contract.prop_statements, stem).toBeUndefined();
    }
  });

  it('the group, the content column, the action row, the title and the description declare no kit prop', () => {
    for (const stem of [GROUP, CONTENT, ACTIONS, ...CONTENT_HOSTED]) {
      expect(units[stem].contract.props.properties, stem).toEqual({});
    }
  });

  it('the two cva builders are companions of the contracts whose classes they build', () => {
    expect((units[DIRECTORY].contract.companions ?? []).map((entry) => entry.export)).toEqual(['attachmentVariants']);
    expect((units['attachment-media'].contract.companions ?? []).map((entry) => entry.export)).toEqual([
      'attachmentMediaVariants',
    ]);
  });
});

describe('attachment contracts in a GTS store', () => {
  function registeredStore(): GTS {
    return unitStore(Object.values(units));
  }

  it('all nine components validate as an instance of the component type', () => {
    const gts = registeredStore();
    for (const { stem, contract } of Object.values(units)) {
      const result = gts.validateInstance(contract.$id);
      expect(result.ok, `${stem}: ${result.error}`).toBe(true);
    }
  });

  it('every contract names the element surface it renders', () => {
    const SURFACE: Record<string, string> = {
      'attachment-title': 'dom_span',
      'attachment-description': 'dom_span',
      'attachment-action': 'dom_button',
      'attachment-trigger': 'dom_button',
    };
    for (const { stem, contract, elementSurface } of Object.values(units)) {
      expect(contract.forwards_to, stem).toBe(bareGtsId(String(elementSurface.$id)));
      expect(contract.forwards_to, stem).toBe(elementTypeRef(SURFACE[stem] ?? 'dom_div'));
    }
  });

  it('fails when the component type is not registered - negative control', () => {
    const gts = unitStore(Object.values(units), { componentType: false, vocabulary: false });
    const result = gts.validateInstance(units[DIRECTORY].contract.$id);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Schema not found');
  });

  it('all nine components validate as an instance of the committed component type', () => {
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
