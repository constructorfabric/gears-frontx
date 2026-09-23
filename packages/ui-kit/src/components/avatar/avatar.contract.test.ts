// Conformance for the six contracts of the avatar directory: the avatar
// family (Avatar with its Image, Fallback and Badge parts) and the
// avatar_group family (AvatarGroup with its Count part). One file because
// the interesting assertions are about how the six relate - two families
// in one directory, and a group that hosts the other family's Avatar
// roots; the per-component shape comes from testing.ts's assertContractFreshness.
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

const DIRECTORY = 'avatar';
const AVATAR_PARTS = ['avatar-image', 'avatar-fallback', 'avatar-badge'] as const;
const GROUP = 'avatar-group';
const GROUP_PARTS = ['avatar-group-count'] as const;
const AVATAR_FAMILY = [DIRECTORY, ...AVATAR_PARTS] as const;
const GROUP_FAMILY = [GROUP, ...GROUP_PARTS] as const;
const ALL_STEMS = [...AVATAR_FAMILY, ...GROUP_FAMILY] as const;

for (const stem of ALL_STEMS) assertContractFreshness(DIRECTORY, stem);

const units = compileUnits(DIRECTORY, ALL_STEMS);
const componentType = buildComponentType();
const ref = (stem: string) => componentRef(stem, contractMajor(DIRECTORY, stem));

describe('avatar directory: component type validity', () => {
  it('every one of the six validates against the component type', () => {
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

describe('avatar directory: two families resolve', () => {
  it('Avatar is the root of the avatar family and carries the image, the fallback and the badge', () => {
    const root = units[DIRECTORY].contract.family_membership;
    expect(root?.name).toBe('avatar');
    expect(root?.role).toBe('root');
    expect(root?.members).toEqual(AVATAR_PARTS.map(ref).sort());
  });

  it('AvatarGroup is the root of the avatar_group family and carries the count', () => {
    const root = units[GROUP].contract.family_membership;
    expect(root?.name).toBe('avatar_group');
    expect(root?.role).toBe('root');
    expect(root?.members).toEqual(GROUP_PARTS.map(ref).sort());
  });

  it('every part names its own family, calls itself a part, and lists no members', () => {
    for (const [family, parts] of [
      ['avatar', AVATAR_PARTS],
      ['avatar_group', GROUP_PARTS],
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
    // A group wraps several Avatar roots, so it is no part of the avatar
    // family, and an Avatar is no part of the group's family either.
    const avatar = familyRoster('avatar');
    expect(avatar.root).toBe(ref(DIRECTORY));
    expect(avatar.parts).toEqual(AVATAR_PARTS.map(ref).sort());
    const group = familyRoster('avatar_group');
    expect(group.root).toBe(ref(GROUP));
    expect(group.parts).toEqual(GROUP_PARTS.map(ref).sort());
    for (const stem of GROUP_FAMILY) expect(avatar.parts, stem).not.toContain(ref(stem));
    for (const stem of AVATAR_FAMILY) expect(group.parts, stem).not.toContain(ref(stem));
  });
});

describe('avatar directory: what nests where', () => {
  it('Avatar accepts its image, fallback and badge and nothing else', () => {
    expect(units[DIRECTORY].contract.accepts).toEqual({
      content: 'specified',
      components: AVATAR_PARTS.map(ref),
    });
  });

  it('AvatarGroup accepts Avatar roots and the count, and nothing else', () => {
    expect(units[GROUP].contract.accepts).toEqual({
      content: 'specified',
      components: [ref(DIRECTORY), ref('avatar-group-count')],
    });
  });

  it("every part's mount point is FILLED from the root that accepts it", () => {
    for (const stem of AVATAR_PARTS) {
      expect(units[stem].contract.mounted_in, stem).toEqual([
        { container: pascalCase(DIRECTORY), component: ref(DIRECTORY) },
      ]);
    }
    expect(units['avatar-group-count'].contract.mounted_in).toEqual([
      { container: pascalCase(GROUP), component: ref(GROUP) },
    ]);
  });

  it('Avatar is mounted in AvatarGroup and MessageAvatar, filled, and on its own in the application, authored', () => {
    // A family root may be mounted in another directory's container; only
    // parts are held to their own family. Those entries are filled from the
    // containers' own overlays, so they are checked by containment.
    const mounts = units[DIRECTORY].contract.mounted_in ?? [];
    expect(mounts).toContainEqual({ container: pascalCase(GROUP), component: ref(GROUP) });
    expect(mounts).toContainEqual({
      container: pascalCase('message-avatar'),
      component: componentRef('message-avatar', contractMajor('message', 'message-avatar')),
    });
    const outside = mounts.filter((entry) => entry.component === undefined);
    expect(outside).toHaveLength(1);
    expect(outside[0]?.container).toBe('any layout in the consuming application');
    expect(outside[0]?.note).toBeTruthy();
  });

  it('gives the group no mount point at all - nothing in the kit mounts an AvatarGroup', () => {
    expect(units[GROUP].contract.mounted_in).toBeUndefined();
  });

  it('every accepts reference and every part mount point stays inside its family, except the group hosting Avatar roots', () => {
    // The root's own mount points are left out: a family root may be
    // mounted in another directory's container (MessageAvatar), filled from
    // that container's overlay.
    for (const family of [AVATAR_FAMILY, GROUP_FAMILY]) {
      const familyRefs = new Set(family.map((stem) => bareGtsId(String(units[stem].contract.$id))));
      for (const stem of family) {
        const { contract } = units[stem];
        const mounts =
          stem === DIRECTORY || stem === GROUP
            ? []
            : (contract.mounted_in ?? []).map((entry) => entry.component).filter((r): r is string => r !== undefined);
        for (const nested of [...(contract.accepts.components ?? []), ...mounts]) {
          // The one crossing: the group hosts Avatar roots from the other family.
          if (stem === GROUP && nested === ref(DIRECTORY)) continue;
          expect(familyRefs.has(nested), `${stem}: it names "${nested}", which is not a member of this family`).toBe(true);
        }
      }
    }
  });
});

describe('avatar directory: what the schema cannot assert', () => {
  it("the root's size is a typed enum with no prop statement", () => {
    const root = units[DIRECTORY].contract;
    expect(root.props.properties.size).toMatchObject({ type: 'string', enum: ['default', 'sm', 'lg'], default: 'default' });
    expect(Object.keys(root.prop_statements ?? {})).not.toContain('size');
  });

  it("the image's status callback and the primitive's render and style carry prop statements", () => {
    const image = units['avatar-image'].contract;
    for (const prop of ['onLoadingStatusChange', 'render', 'style']) {
      const statement = image.prop_statements?.[prop];
      expect(statement, prop).toBeDefined();
      expect(image.props.properties[prop].description, prop).toContain(statement?.states);
    }
  });

  it("the fallback's delay is typed and needs no prop statement", () => {
    const fallback = units['avatar-fallback'].contract;
    expect(fallback.props.properties.delay).toEqual({ type: 'number' });
    expect(Object.keys(fallback.prop_statements ?? {})).not.toContain('delay');
  });

  it('the fill axes of the fallback and the count are typed enums with their defaults and no prop statements', () => {
    // avatar.tsx builds both cva calls from one shared `fillAxes` object;
    // the extractor follows that identifier to its initializer, so `tone`
    // and `variant` reach the contract as the axes they are.
    for (const stem of ['avatar-fallback', 'avatar-group-count']) {
      const contract = units[stem].contract;
      expect(contract.props.properties.tone, stem).toEqual({
        type: 'string',
        enum: ['neutral', 'accent', 'info', 'success', 'warning', 'danger'],
        default: 'neutral',
      });
      expect(contract.props.properties.variant, stem).toEqual({ type: 'string', enum: ['solid', 'soft'], default: 'soft' });
      for (const prop of ['tone', 'variant']) {
        expect(Object.keys(contract['x-uikit'].partially_typed_props), `${stem}.${prop}`).not.toContain(prop);
        expect(Object.keys(contract.prop_statements ?? {}), `${stem}.${prop}`).not.toContain(prop);
      }
    }
  });

  it('the badge and the group declare nothing beyond className, so they carry no prop statements', () => {
    for (const stem of ['avatar-badge', GROUP]) {
      expect(Object.keys(units[stem].contract.props.properties), stem).toEqual(['className']);
      expect(units[stem].contract.prop_statements, stem).toBeUndefined();
    }
  });
});

describe('avatar directory in a GTS store', () => {
  it('every component validates as an instance of the component type', () => {
    const gts = unitStore(Object.values(units));
    for (const { stem, contract } of Object.values(units)) {
      const result = gts.validateInstance(contract.$id);
      expect(result.ok, `${stem}: ${result.error}`).toBe(true);
    }
  });

  it('each component names the surface of the element it renders', () => {
    // The primitive's Root and Fallback render a span and its Image an img;
    // the badge is the kit's own span, the group and the count its own divs.
    for (const { stem, contract, elementSurface } of Object.values(units)) {
      expect(contract.forwards_to, stem).toBe(bareGtsId(String(elementSurface.$id)));
    }
    const expected: Record<string, string> = {
      avatar: 'dom_span',
      'avatar-image': 'dom_img',
      'avatar-fallback': 'dom_span',
      'avatar-badge': 'dom_span',
      'avatar-group': 'dom_div',
      'avatar-group-count': 'dom_div',
    };
    for (const [stem, token] of Object.entries(expected)) {
      expect(units[stem].contract.forwards_to, stem).toBe(elementTypeRef(token));
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
