// Conformance for the eight contracts of the Dialog family (root, trigger,
// close, content, header, footer, title, description). One file because the
// interesting assertions are about how the eight relate; the per-component
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

const DIRECTORY = 'dialog';
const PART_STEMS = [
  'dialog-trigger',
  'dialog-close',
  'dialog-content',
  'dialog-header',
  'dialog-footer',
  'dialog-title',
  'dialog-description',
] as const;
const ALL_STEMS = [DIRECTORY, ...PART_STEMS] as const;

for (const stem of ALL_STEMS) assertContractFreshness(DIRECTORY, stem);

// The root renders no element of its own (Base UI's Dialog.Root only
// provides context), so it names no surface; every part does.
const units = compileUnits(DIRECTORY, ALL_STEMS, { allowNoHostElement: true });
const componentType = buildComponentType();
const ref = (stem: string) => componentRef(stem, contractMajor(DIRECTORY, stem));

describe('dialog family: component type validity', () => {
  it('every one of the eight validates against the component type', () => {
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

describe('dialog family: membership resolves', () => {
  it('the root names the family, calls itself root, and carries all seven parts', () => {
    const root = units[DIRECTORY].contract.family_membership;
    expect(root?.name).toBe('dialog');
    expect(root?.role).toBe('root');
    expect(root?.members).toEqual(PART_STEMS.map(ref).sort());
  });

  it('every part names the same family, calls itself a part, and lists no members', () => {
    for (const stem of PART_STEMS) {
      const membership = units[stem].contract.family_membership;
      expect(membership?.name, stem).toBe('dialog');
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

  it('the roster has the root and the seven parts', () => {
    const roster = familyRoster('dialog');
    expect(roster.root).toBe(ref(DIRECTORY));
    expect(roster.parts).toEqual(PART_STEMS.map(ref).sort());
  });
});

describe('dialog family: what nests where', () => {
  it('the root accepts DialogTrigger and DialogContent and nothing else', () => {
    expect(units[DIRECTORY].contract.accepts).toEqual({
      content: 'specified',
      components: [ref('dialog-trigger'), ref('dialog-content')],
    });
  });

  it('the header accepts DialogTitle and DialogDescription and nothing else', () => {
    expect(units['dialog-header'].contract.accepts).toEqual({
      content: 'specified',
      components: [ref('dialog-title'), ref('dialog-description')],
    });
  });

  it('the popup and the footer constrain nothing inside them', () => {
    for (const stem of ['dialog-content', 'dialog-footer']) {
      expect(units[stem].contract.accepts, stem).toEqual({ content: 'unconstrained' });
    }
  });

  it("each hosted part's mount point is FILLED from the container that accepts it", () => {
    const hosts: Record<string, string> = {
      'dialog-trigger': DIRECTORY,
      'dialog-content': DIRECTORY,
      'dialog-title': 'dialog-header',
      'dialog-description': 'dialog-header',
    };
    for (const [stem, host] of Object.entries(hosts)) {
      expect(units[stem].contract.mounted_in, stem).toEqual([{ container: pascalCase(host), component: ref(host) }]);
    }
  });

  it('parts placed in the unconstrained popup gain no mount point, and the root has none', () => {
    // DialogContent lists nothing, so the header, the footer and the close
    // button are placed there without a filled mount point.
    for (const stem of [DIRECTORY, 'dialog-close', 'dialog-header', 'dialog-footer']) {
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

describe('dialog family: what the schema cannot assert', () => {
  it("the root's callbacks, children, handle and modal union carry prop statements emitted into their descriptions", () => {
    const statements = units[DIRECTORY].contract.prop_statements ?? {};
    const properties = units[DIRECTORY].contract.props.properties;
    for (const prop of [
      'children',
      'onOpenChange',
      'onOpenChangeComplete',
      'actionsRef',
      'handle',
      'modal',
      'triggerId',
      'defaultTriggerId',
    ]) {
      expect(Object.keys(statements), prop).toContain(prop);
      expect(properties[prop].description, prop).toContain(statements[prop].states);
    }
  });

  it("the root's open state and dismissal switch are typed, with no prop statement", () => {
    const root = units[DIRECTORY].contract;
    for (const prop of ['open', 'defaultOpen', 'disablePointerDismissal']) {
      expect(root.props.properties[prop], prop).toEqual({ type: 'boolean' });
      expect(Object.keys(root.prop_statements ?? {}), prop).not.toContain(prop);
    }
  });

  it("the popup's own props are typed and its portal and focus props carry prop statements", () => {
    const content = units['dialog-content'].contract;
    expect(content.props.properties.size).toEqual({ type: 'string', enum: ['default', 'lg'], default: 'default' });
    for (const prop of ['showCloseButton', 'showBackdrop']) {
      expect(content.props.properties[prop], prop).toEqual({ type: 'boolean', default: true });
    }
    expect(content.props.properties.closeLabel).toEqual({ type: 'string', default: 'Close' });
    for (const prop of ['container', 'initialFocus', 'finalFocus', 'render', 'style']) {
      expect(Object.keys(content.prop_statements ?? {}), prop).toContain(prop);
    }
  });

  it("the popup's unexposed_parts name the Portal, Backdrop and built-in Close it composes", () => {
    const parts = (units['dialog-content'].contract.unexposed_parts ?? []).map((entry) => entry.part);
    expect(parts).toEqual(['Dialog.Portal', 'Dialog.Backdrop', 'Dialog.Close']);
  });
});

describe('dialog family in a GTS store', () => {
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
    const surfaces: Record<string, string> = {
      'dialog-trigger': 'dom_button',
      'dialog-close': 'dom_button',
      'dialog-content': 'dom_div',
      'dialog-header': 'dom_div',
      'dialog-footer': 'dom_div',
      'dialog-title': 'dom_h2',
      'dialog-description': 'dom_p',
    };
    for (const [stem, token] of Object.entries(surfaces)) {
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
