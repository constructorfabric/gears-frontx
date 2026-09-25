// Conformance for the eight contracts of the sheet directory: the Sheet root
// and its seven parts. One file because the interesting assertions are about
// how the eight relate; the per-component shape comes from testing.ts's
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

const DIRECTORY = 'sheet';
const PART_STEMS = [
  'sheet-trigger',
  'sheet-close',
  'sheet-content',
  'sheet-header',
  'sheet-footer',
  'sheet-title',
  'sheet-description',
] as const;
const ALL_STEMS = [DIRECTORY, ...PART_STEMS] as const;

for (const stem of ALL_STEMS) assertContractFreshness(DIRECTORY, stem);

// The root renders no element of its own (Base UI's Dialog.Root only
// provides context), so it names no surface; every part does.
const units = compileUnits(DIRECTORY, ALL_STEMS, { allowNoHostElement: true });
const componentType = buildComponentType();
const ref = (stem: string) => componentRef(stem, contractMajor(DIRECTORY, stem));

describe('sheet directory: component type validity', () => {
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

describe('sheet family: membership resolves', () => {
  it('the root names the family, calls itself root, and carries all seven parts', () => {
    const root = units[DIRECTORY].contract.family_membership;
    expect(root?.name).toBe('sheet');
    expect(root?.role).toBe('root');
    expect(root?.members).toEqual(PART_STEMS.map(ref).sort());
  });

  it('every part names the same family, calls itself a part, and lists no members', () => {
    for (const stem of PART_STEMS) {
      const membership = units[stem].contract.family_membership;
      expect(membership?.name, stem).toBe('sheet');
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
    const roster = familyRoster('sheet');
    expect(roster.root).toBe(ref(DIRECTORY));
    expect(roster.parts).toEqual(PART_STEMS.map(ref).sort());
  });
});

describe('sheet directory: what nests where', () => {
  it('the root accepts SheetTrigger and SheetContent and nothing else', () => {
    expect(units[DIRECTORY].contract.accepts).toEqual({
      content: 'specified',
      components: [ref('sheet-trigger'), ref('sheet-content')],
    });
  });

  it('the header accepts SheetTitle and SheetDescription and nothing else', () => {
    expect(units['sheet-header'].contract.accepts).toEqual({
      content: 'specified',
      components: [ref('sheet-title'), ref('sheet-description')],
    });
  });

  it('the panel and the footer take any content, so they fill no mount point', () => {
    for (const stem of ['sheet-content', 'sheet-footer']) {
      expect(units[stem].contract.accepts, stem).toEqual({ content: 'unconstrained' });
    }
    for (const stem of ['sheet-header', 'sheet-footer', 'sheet-close']) {
      expect(units[stem].contract.mounted_in, stem).toBeUndefined();
    }
  });

  it("every filled mount point is the family container that accepts the part", () => {
    const expected: Record<string, string> = {
      'sheet-trigger': DIRECTORY,
      'sheet-content': DIRECTORY,
      'sheet-title': 'sheet-header',
      'sheet-description': 'sheet-header',
    };
    for (const [stem, container] of Object.entries(expected)) {
      expect(units[stem].contract.mounted_in, stem).toEqual([
        { container: pascalCase(container), component: ref(container) },
      ]);
    }
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

describe('sheet directory: what the schema cannot assert', () => {
  it("the root's callbacks, children, handle, modal and trigger ids carry prop statements emitted into their descriptions", () => {
    const statements = units[DIRECTORY].contract.prop_statements ?? {};
    const properties = units[DIRECTORY].contract.props.properties;
    for (const prop of ['children', 'modal', 'onOpenChange', 'onOpenChangeComplete', 'actionsRef', 'handle', 'triggerId', 'defaultTriggerId']) {
      expect(Object.keys(statements), prop).toContain(prop);
      expect(properties[prop].description, prop).toContain(statements[prop].states);
    }
  });

  it("the root's open state is typed, with no prop statement", () => {
    const root = units[DIRECTORY].contract;
    for (const prop of ['open', 'defaultOpen', 'disablePointerDismissal']) {
      expect(root.props.properties[prop], prop).toMatchObject({ type: 'boolean' });
      expect(Object.keys(root.prop_statements ?? {}), prop).not.toContain(prop);
    }
  });

  it("the panel's side is a typed enum and its portal and focus props carry prop statements", () => {
    const content = units['sheet-content'].contract;
    expect(content.props.properties.side).toMatchObject({ type: 'string', enum: ['top', 'right', 'bottom', 'left'] });
    for (const prop of ['showCloseButton', 'showBackdrop']) {
      expect(content.props.properties[prop], prop).toMatchObject({ type: 'boolean' });
    }
    expect(content.props.properties.closeLabel).toMatchObject({ type: 'string' });
    for (const prop of ['container', 'initialFocus', 'finalFocus', 'render', 'style']) {
      expect(Object.keys(content.prop_statements ?? {}), prop).toContain(prop);
    }
  });

  it("the panel's unexposed_parts name the Portal, Backdrop and Close it composes", () => {
    const parts = (units['sheet-content'].contract.unexposed_parts ?? []).map((entry) => entry.part);
    expect(parts).toEqual(['Dialog.Portal', 'Dialog.Backdrop', 'Dialog.Close']);
  });

  it("the panel's capabilities are switched by its close-button and backdrop props", () => {
    const content = units['sheet-content'].contract;
    expect((content.capabilities ?? []).map((entry) => entry.enabled_by)).toEqual(['showCloseButton', 'showBackdrop']);
    const ids = content.invariants.map((entry) => entry.id);
    expect(ids).toContain('internal-backdrop-blocks-while-modal');
    expect(ids).toContain('named-by-its-title-described-by-its-description');
  });
});

describe('sheet directory in a GTS store', () => {
  it('every component validates as an instance of the component type', () => {
    const gts = unitStore(Object.values(units));
    for (const { stem, contract } of Object.values(units)) {
      const result = gts.validateInstance(contract.$id);
      expect(result.ok, `${stem}: ${result.error}`).toBe(true);
    }
  });

  it('the buttons name the button surface, the regions the div surface, title h2, description p, the root none', () => {
    for (const { stem, contract, elementSurface } of Object.values(units)) {
      if (elementSurface) expect(contract.forwards_to, stem).toBe(bareGtsId(String(elementSurface.$id)));
    }
    const expected: Record<string, string> = {
      'sheet-trigger': 'dom_button',
      'sheet-close': 'dom_button',
      'sheet-content': 'dom_div',
      'sheet-header': 'dom_div',
      'sheet-footer': 'dom_div',
      'sheet-title': 'dom_h2',
      'sheet-description': 'dom_p',
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
