// Conformance for the ten contracts of the alert-dialog directory: the
// AlertDialog family (root, trigger, content, header, footer, media, title,
// description, action, cancel). One file because the interesting assertions
// are about how the ten relate; the per-component shape comes from
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

const DIRECTORY = 'alert-dialog';
const FAMILY = 'alert_dialog';
const PART_STEMS = [
  'alert-dialog-trigger',
  'alert-dialog-content',
  'alert-dialog-header',
  'alert-dialog-footer',
  'alert-dialog-media',
  'alert-dialog-title',
  'alert-dialog-description',
  'alert-dialog-action',
  'alert-dialog-cancel',
] as const;
const ALL_STEMS = [DIRECTORY, ...PART_STEMS] as const;

for (const stem of ALL_STEMS) assertContractFreshness(DIRECTORY, stem);

// The root renders no element of its own (Base UI's AlertDialog.Root only
// provides context), so it names no surface; every part does.
const units = compileUnits(DIRECTORY, ALL_STEMS, { allowNoHostElement: true });
const componentType = buildComponentType();
const ref = (stem: string) => componentRef(stem, contractMajor(DIRECTORY, stem));
const mountedIn = (stem: string) => (units[stem].contract.mounted_in ?? []).map((entry) => entry.component).sort();

describe('alert-dialog directory: component type validity', () => {
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

describe('alert-dialog family: membership resolves', () => {
  it('the root names the family, calls itself root, and carries the nine parts', () => {
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

describe('alert-dialog directory: what nests where', () => {
  it('the root accepts the trigger and the content and nothing else', () => {
    expect(units[DIRECTORY].contract.accepts).toEqual({
      content: 'specified',
      components: [ref('alert-dialog-trigger'), ref('alert-dialog-content')],
    });
  });

  it('the content accepts anything, so the header and the footer carry no mount point', () => {
    expect(units['alert-dialog-content'].contract.accepts).toEqual({ content: 'unconstrained' });
  });

  it('the header hosts media, title and description; the footer hosts the two close parts', () => {
    expect(units['alert-dialog-header'].contract.accepts.components).toEqual([
      ref('alert-dialog-media'),
      ref('alert-dialog-title'),
      ref('alert-dialog-description'),
    ]);
    expect(units['alert-dialog-footer'].contract.accepts.components).toEqual([
      ref('alert-dialog-cancel'),
      ref('alert-dialog-action'),
    ]);
  });

  it("every part's mount point is FILLED from the member that accepts it", () => {
    const expected: Record<(typeof PART_STEMS)[number], string[]> = {
      'alert-dialog-trigger': [DIRECTORY],
      'alert-dialog-content': [DIRECTORY],
      'alert-dialog-header': [],
      'alert-dialog-footer': [],
      'alert-dialog-media': ['alert-dialog-header'],
      'alert-dialog-title': ['alert-dialog-header'],
      'alert-dialog-description': ['alert-dialog-header'],
      'alert-dialog-action': ['alert-dialog-footer'],
      'alert-dialog-cancel': ['alert-dialog-footer'],
    };
    for (const stem of PART_STEMS) {
      expect(mountedIn(stem), stem).toEqual(expected[stem].map(ref).sort());
      for (const entry of units[stem].contract.mounted_in ?? []) {
        expect(entry.container, stem).toBe(pascalCase(resolveComponentRef(String(entry.component)).stem));
      }
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

  it('the action takes its icon through the icon prop', () => {
    expect(units['alert-dialog-action'].contract.accepts.icons_via).toBe('icon');
  });
});

describe('alert-dialog directory: what the schema cannot assert', () => {
  it("the root's callbacks, children, handle and trigger ids carry prop statements emitted into their descriptions", () => {
    const statements = units[DIRECTORY].contract.prop_statements ?? {};
    const properties = units[DIRECTORY].contract.props.properties;
    for (const prop of ['children', 'onOpenChange', 'onOpenChangeComplete', 'actionsRef', 'handle', 'triggerId', 'defaultTriggerId']) {
      expect(Object.keys(statements), prop).toContain(prop);
      expect(properties[prop].description, prop).toContain(statements[prop].states);
    }
  });

  it('the root takes no modal and no disablePointerDismissal prop, and types its open state', () => {
    const root = units[DIRECTORY].contract;
    expect(Object.keys(root.props.properties)).not.toContain('modal');
    expect(Object.keys(root.props.properties)).not.toContain('disablePointerDismissal');
    for (const prop of ['open', 'defaultOpen']) {
      expect(root.props.properties[prop], prop).toEqual({ type: 'boolean' });
      expect(Object.keys(root.prop_statements ?? {}), prop).not.toContain(prop);
    }
  });

  it("the content's size and showBackdrop are typed, and its portal and focus unions carry prop statements", () => {
    const content = units['alert-dialog-content'].contract;
    expect(content.props.properties.size).toEqual({ type: 'string', enum: ['default', 'sm'], default: 'default' });
    expect(content.props.properties.showBackdrop).toEqual({ type: 'boolean', default: true });
    for (const prop of ['container', 'initialFocus', 'finalFocus', 'render', 'style']) {
      expect(Object.keys(content.prop_statements ?? {}), prop).toContain(prop);
    }
  });

  it("the content's unexposed_parts name the Portal and Backdrop it composes", () => {
    const parts = (units['alert-dialog-content'].contract.unexposed_parts ?? []).map((entry) => entry.part);
    expect(parts).toEqual(['AlertDialog.Portal', 'AlertDialog.Backdrop']);
  });

  it("the action and the cancel carry Button's variant and size axes; only the action takes loading and icon", () => {
    for (const stem of ['alert-dialog-action', 'alert-dialog-cancel']) {
      const properties = units[stem].contract.props.properties;
      expect(properties.variant?.enum, stem).toContain('outline');
      expect(properties.size?.enum, stem).toEqual(['default', 'sm', 'lg']);
    }
    expect(units['alert-dialog-action'].contract.props.properties.loading).toEqual({ type: 'boolean' });
    expect(Object.keys(units['alert-dialog-action'].contract.prop_statements ?? {})).toContain('icon');
    expect(Object.keys(units['alert-dialog-cancel'].contract.props.properties)).not.toContain('loading');
    expect(Object.keys(units['alert-dialog-cancel'].contract.props.properties)).not.toContain('icon');
  });
});

describe('alert-dialog directory in a GTS store', () => {
  it('every component validates as an instance of the component type', () => {
    const gts = unitStore(Object.values(units));
    for (const { stem, contract } of Object.values(units)) {
      const result = gts.validateInstance(contract.$id);
      expect(result.ok, `${stem}: ${result.error}`).toBe(true);
    }
  });

  it('each part names the surface of the element it renders, the root none', () => {
    for (const { stem, contract, elementSurface } of Object.values(units)) {
      if (elementSurface) expect(contract.forwards_to, stem).toBe(bareGtsId(String(elementSurface.$id)));
    }
    const expected: Record<(typeof PART_STEMS)[number], string> = {
      'alert-dialog-trigger': 'dom_button',
      'alert-dialog-content': 'dom_div',
      'alert-dialog-header': 'dom_div',
      'alert-dialog-footer': 'dom_div',
      'alert-dialog-media': 'dom_div',
      'alert-dialog-title': 'dom_h2',
      'alert-dialog-description': 'dom_p',
      'alert-dialog-action': 'dom_button',
      'alert-dialog-cancel': 'dom_button',
    };
    for (const stem of PART_STEMS) {
      expect(units[stem].contract.forwards_to, stem).toBe(elementTypeRef(expected[stem]));
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
