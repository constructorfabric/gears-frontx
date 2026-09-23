// Conformance for the six contracts of the Popover family (root, trigger,
// content, header, title, description). One file because the interesting
// assertions are about how the six relate; the per-component shape comes
// from testing.ts's assertContractFreshness.
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

const DIRECTORY = 'popover';
const PART_STEMS = [
  'popover-trigger',
  'popover-content',
  'popover-header',
  'popover-title',
  'popover-description',
] as const;
const ALL_STEMS = [DIRECTORY, ...PART_STEMS] as const;

for (const stem of ALL_STEMS) assertContractFreshness(DIRECTORY, stem);

// The root renders no element of its own (Base UI's Popover.Root only
// provides context), so it names no surface; every part does.
const units = compileUnits(DIRECTORY, ALL_STEMS, { allowNoHostElement: true });
const componentType = buildComponentType();
const ref = (stem: string) => componentRef(stem, contractMajor(DIRECTORY, stem));

describe('popover family: component type validity', () => {
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

describe('popover family: membership resolves', () => {
  it('the root names the family, calls itself root, and carries all five parts', () => {
    const root = units[DIRECTORY].contract.family_membership;
    expect(root?.name).toBe('popover');
    expect(root?.role).toBe('root');
    expect(root?.members).toEqual(PART_STEMS.map(ref).sort());
  });

  it('every part names the same family, calls itself a part, and lists no members', () => {
    for (const stem of PART_STEMS) {
      const membership = units[stem].contract.family_membership;
      expect(membership?.name, stem).toBe('popover');
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

  it('the roster has the root and the five parts', () => {
    const roster = familyRoster('popover');
    expect(roster.root).toBe(ref(DIRECTORY));
    expect(roster.parts).toEqual(PART_STEMS.map(ref).sort());
  });
});

describe('popover family: what nests where', () => {
  it('the root accepts PopoverTrigger and PopoverContent and nothing else', () => {
    expect(units[DIRECTORY].contract.accepts).toEqual({
      content: 'specified',
      components: [ref('popover-trigger'), ref('popover-content')],
    });
  });

  it('the header accepts PopoverTitle and PopoverDescription and nothing else', () => {
    expect(units['popover-header'].contract.accepts).toEqual({
      content: 'specified',
      components: [ref('popover-title'), ref('popover-description')],
    });
  });

  it('the popup constrains nothing inside it', () => {
    expect(units['popover-content'].contract.accepts).toEqual({ content: 'unconstrained' });
  });

  it("each hosted part's mount point is FILLED from the container that accepts it", () => {
    const hosts: Record<string, string> = {
      'popover-trigger': DIRECTORY,
      'popover-content': DIRECTORY,
      'popover-title': 'popover-header',
      'popover-description': 'popover-header',
    };
    for (const [stem, host] of Object.entries(hosts)) {
      expect(units[stem].contract.mounted_in, stem).toEqual([{ container: pascalCase(host), component: ref(host) }]);
    }
  });

  it('the header, placed in the unconstrained popup, gains no mount point, and the root has none', () => {
    for (const stem of [DIRECTORY, 'popover-header']) {
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

describe('popover family: what the schema cannot assert', () => {
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

  it("the root's open state and the trigger's hover switch and timings are typed, with no prop statement", () => {
    const root = units[DIRECTORY].contract;
    for (const prop of ['open', 'defaultOpen']) {
      expect(root.props.properties[prop], prop).toEqual({ type: 'boolean' });
      expect(Object.keys(root.prop_statements ?? {}), prop).not.toContain(prop);
    }
    const trigger = units['popover-trigger'].contract;
    expect(trigger.props.properties.openOnHover).toEqual({ type: 'boolean' });
    for (const prop of ['delay', 'closeDelay']) {
      expect(trigger.props.properties[prop], prop).toEqual({ type: 'number' });
    }
    for (const prop of ['openOnHover', 'delay', 'closeDelay']) {
      expect(Object.keys(trigger.prop_statements ?? {}), prop).not.toContain(prop);
    }
  });

  it("the trigger's handle, payload, render and style carry prop statements", () => {
    const statements = units['popover-trigger'].contract.prop_statements ?? {};
    for (const prop of ['handle', 'payload', 'render', 'style']) {
      expect(Object.keys(statements), prop).toContain(prop);
    }
  });

  it("the popup's placement enums are typed and its portal, anchor, offset and focus unions carry prop statements", () => {
    const content = units['popover-content'].contract;
    expect(content.props.properties.side).toEqual({
      type: 'string',
      enum: ['bottom', 'inline-end', 'inline-start', 'left', 'right', 'top'],
      default: 'bottom',
    });
    expect(content.props.properties.align).toEqual({ type: 'string', enum: ['center', 'end', 'start'], default: 'center' });
    expect(content.props.properties.positionMethod).toEqual({ type: 'string', enum: ['absolute', 'fixed'] });
    for (const prop of [
      'container',
      'anchor',
      'sideOffset',
      'alignOffset',
      'collisionBoundary',
      'collisionPadding',
      'initialFocus',
      'finalFocus',
      'render',
      'style',
    ]) {
      expect(Object.keys(content.prop_statements ?? {}), prop).toContain(prop);
    }
  });

  it("the popup's unexposed_parts name the Portal and Positioner it composes", () => {
    const parts = (units['popover-content'].contract.unexposed_parts ?? []).map((entry) => entry.part);
    expect(parts).toEqual(['Popover.Portal', 'Popover.Positioner']);
  });

  it("the title's invariant says `render` can replace the h2", () => {
    const invariant = units['popover-title'].contract.invariants.find((entry) => entry.id === 'heading-at-label-weight');
    expect(invariant?.text).toContain('renders an h2 unless `render` replaces it');
  });
});

describe('popover family in a GTS store', () => {
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
      'popover-trigger': 'dom_button',
      'popover-content': 'dom_div',
      'popover-header': 'dom_div',
      'popover-title': 'dom_h2',
      'popover-description': 'dom_p',
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
