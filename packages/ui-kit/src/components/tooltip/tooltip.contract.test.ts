// Conformance for the four contracts of the tooltip directory: the Tooltip
// family (root, trigger, content) and its directory neighbour
// TooltipProvider, which wraps any number of Tooltip roots and is no part of
// the family. One file because the interesting assertions are about how the
// four relate; the per-component shape comes from testing.ts's
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

const DIRECTORY = 'tooltip';
const PART_STEMS = ['tooltip-trigger', 'tooltip-content'] as const;
const PROVIDER = 'tooltip-provider';
const FAMILY_STEMS = [DIRECTORY, ...PART_STEMS] as const;
const ALL_STEMS = [...FAMILY_STEMS, PROVIDER] as const;

for (const stem of ALL_STEMS) assertContractFreshness(DIRECTORY, stem);

// The root and the provider render no element of their own (Base UI's
// Tooltip.Root and Tooltip.Provider only provide context), so they name no
// surface; the trigger and the content do.
const units = compileUnits(DIRECTORY, ALL_STEMS, { allowNoHostElement: true });
const componentType = buildComponentType();
const ref = (stem: string) => componentRef(stem, contractMajor(DIRECTORY, stem));

describe('tooltip directory: component type validity', () => {
  it('every one of the four validates against the component type', () => {
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

describe('tooltip family: membership resolves', () => {
  it('the root names the family, calls itself root, and carries the trigger and the content', () => {
    const root = units[DIRECTORY].contract.family_membership;
    expect(root?.name).toBe('tooltip');
    expect(root?.role).toBe('root');
    expect(root?.members).toEqual(PART_STEMS.map(ref).sort());
  });

  it('every part names the same family, calls itself a part, and lists no members', () => {
    for (const stem of PART_STEMS) {
      const membership = units[stem].contract.family_membership;
      expect(membership?.name, stem).toBe('tooltip');
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

  it('the roster has the root and the two parts, and not the provider', () => {
    const roster = familyRoster('tooltip');
    expect(roster.root).toBe(ref(DIRECTORY));
    expect(roster.parts).toEqual(PART_STEMS.map(ref).sort());
    expect(roster.parts).not.toContain(ref(PROVIDER));
  });

  it('the provider belongs to no family - it wraps many Tooltip roots and none requires it', () => {
    expect(units[PROVIDER].contract.family_membership).toBeUndefined();
  });
});

describe('tooltip directory: what nests where', () => {
  it('the root accepts TooltipTrigger and TooltipContent and nothing else', () => {
    expect(units[DIRECTORY].contract.accepts).toEqual({
      content: 'specified',
      components: [ref('tooltip-trigger'), ref('tooltip-content')],
    });
  });

  it("every part's mount point is FILLED from the root that accepts it", () => {
    for (const stem of PART_STEMS) {
      expect(units[stem].contract.mounted_in, stem).toEqual([
        { container: pascalCase(DIRECTORY), component: ref(DIRECTORY) },
      ]);
    }
  });

  it('the provider constrains nothing inside it, so nothing gains a mount point from it', () => {
    // It groups tooltips through context at any depth, so a toolbar or a
    // whole app sits between it and each Tooltip; the root therefore has no
    // mount point, and neither does the provider.
    expect(units[PROVIDER].contract.accepts).toEqual({ content: 'unconstrained' });
    expect(units[DIRECTORY].contract.mounted_in).toBeUndefined();
    expect(units[PROVIDER].contract.mounted_in).toBeUndefined();
  });

  it('every nesting reference in the family points inside the family', () => {
    const familyRefs = new Set(FAMILY_STEMS.map((stem) => bareGtsId(String(units[stem].contract.$id))));
    for (const stem of FAMILY_STEMS) {
      const { contract } = units[stem];
      const mounts = (contract.mounted_in ?? []).map((entry) => entry.component).filter((r): r is string => r !== undefined);
      for (const nested of [...(contract.accepts.components ?? []), ...mounts]) {
        expect(familyRefs.has(nested), `${stem}: it names "${nested}", which is not a member of this family`).toBe(true);
      }
    }
  });
});

describe('tooltip directory: what the schema cannot assert', () => {
  it("the root's callbacks, children and handle carry prop statements emitted into their descriptions", () => {
    const statements = units[DIRECTORY].contract.prop_statements ?? {};
    const properties = units[DIRECTORY].contract.props.properties;
    for (const prop of ['children', 'onOpenChange', 'onOpenChangeComplete', 'actionsRef', 'handle', 'triggerId', 'defaultTriggerId']) {
      expect(Object.keys(statements), prop).toContain(prop);
      expect(properties[prop].description, prop).toContain(statements[prop].states);
    }
  });

  it("the root's open state and the provider's timings are typed, with no prop statement", () => {
    const root = units[DIRECTORY].contract;
    for (const prop of ['open', 'defaultOpen', 'disabled']) {
      expect(root.props.properties[prop], prop).toEqual({ type: 'boolean' });
      expect(Object.keys(root.prop_statements ?? {}), prop).not.toContain(prop);
    }
    const provider = units[PROVIDER].contract;
    // `delay` carries the default the provider writes for itself.
    for (const [prop, schema] of [
      ['delay', { type: 'number', default: 0 }],
      ['closeDelay', { type: 'number' }],
      ['timeout', { type: 'number' }],
    ] as const) {
      expect(provider.props.properties[prop], prop).toEqual(schema);
      expect(Object.keys(provider.prop_statements ?? {}), prop).not.toContain(prop);
    }
  });

  it("the content's placement enums are typed and its offset unions carry prop statements", () => {
    const content = units['tooltip-content'].contract;
    expect(content.props.properties.side).toEqual({
      type: 'string',
      enum: ['bottom', 'inline-end', 'inline-start', 'left', 'right', 'top'],
      default: 'top',
    });
    expect(content.props.properties.align).toEqual({ type: 'string', enum: ['center', 'end', 'start'], default: 'center' });
    for (const prop of ['container', 'sideOffset', 'alignOffset', 'collisionBoundary', 'collisionPadding']) {
      expect(Object.keys(content.prop_statements ?? {}), prop).toContain(prop);
    }
  });

  it("the content's unexposed_parts name the Portal, Positioner and Arrow it composes", () => {
    const parts = (units['tooltip-content'].contract.unexposed_parts ?? []).map((entry) => entry.part);
    expect(parts).toEqual(['Tooltip.Portal', 'Tooltip.Positioner', 'Tooltip.Arrow']);
  });
});

describe('tooltip directory in a GTS store', () => {
  it('every component validates as an instance of the component type', () => {
    const gts = unitStore(Object.values(units));
    for (const { stem, contract } of Object.values(units)) {
      const result = gts.validateInstance(contract.$id);
      expect(result.ok, `${stem}: ${result.error}`).toBe(true);
    }
  });

  it('the trigger names the button surface, the content the div surface, the root and provider none', () => {
    for (const { stem, contract, elementSurface } of Object.values(units)) {
      if (elementSurface) expect(contract.forwards_to, stem).toBe(bareGtsId(String(elementSurface.$id)));
    }
    expect(units['tooltip-trigger'].contract.forwards_to).toBe(elementTypeRef('dom_button'));
    expect(units['tooltip-content'].contract.forwards_to).toBe(elementTypeRef('dom_div'));
    for (const stem of [DIRECTORY, PROVIDER]) {
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
