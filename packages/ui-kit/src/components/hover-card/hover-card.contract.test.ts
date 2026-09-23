// Conformance for the three contracts of the hover-card directory: the
// HoverCard family (root, trigger, content). One file because the
// interesting assertions are about how the three relate; the per-component
// shape comes from testing.ts's assertContractFreshness.
import { GTS } from '@globaltypesystem/gts-ts';
import Ajv2020 from 'ajv/dist/2020';
import { describe, expect, it } from 'vitest';

import {
  addContractTypes,
  buildComponentType,
  compileContract,
  contractMajor,
  familyRoster,
  liftPropsSchema,
  loadElementSurface,
  pascalCase,
  registerContractTypes,
  resolveTargetExtraction,
  type CompiledContract,
} from '../../../scripts/contracts/compile';
import { bareGtsId, componentRef, elementTypeRef } from '../../../scripts/contracts/ids';
import {
  applyContractTestTimeout,
  assertContractFreshness,
  resolveComponentRef,
  validateContractInstance,
} from '../../../scripts/contracts/testing';

// Must run before any describe()/it() in the file; see
// applyContractTestTimeout's own comment in testing.ts.
applyContractTestTimeout();

const DIRECTORY = 'hover-card';
const FAMILY = 'hover_card';
const PART_STEMS = ['hover-card-trigger', 'hover-card-content'] as const;
const ALL_STEMS = [DIRECTORY, ...PART_STEMS] as const;

for (const stem of ALL_STEMS) assertContractFreshness(DIRECTORY, stem);

interface CompiledUnit {
  stem: string;
  contract: CompiledContract;
  elementKind: string | undefined;
  elementSurface: Record<string, unknown> | undefined;
}

function compileUnit(stem: string): CompiledUnit {
  const extraction = resolveTargetExtraction(DIRECTORY, stem);
  const contract = compileContract(DIRECTORY, stem);
  // The root renders no element of its own (Base UI's PreviewCard.Root only
  // provides context), so it carries no surface; the trigger and the content do.
  return {
    stem,
    contract,
    elementKind: extraction.elementKind,
    elementSurface: extraction.elementKind === undefined ? undefined : loadElementSurface(extraction.elementKind),
  };
}

const units: Record<string, CompiledUnit> = Object.fromEntries(ALL_STEMS.map((stem) => [stem, compileUnit(stem)]));
const componentType = buildComponentType();
const ref = (stem: string) => componentRef(stem, contractMajor(DIRECTORY, stem));

describe('hover-card directory: component type validity', () => {
  it('every one of the three validates against the component type', () => {
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

describe('hover-card family: membership resolves', () => {
  it('the root names the family, calls itself root, and carries the trigger and the content', () => {
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

  it('the roster read from the other end has the root and the two parts', () => {
    const roster = familyRoster(FAMILY);
    expect(roster.root).toBe(ref(DIRECTORY));
    expect(roster.parts).toEqual(PART_STEMS.map(ref).sort());
  });
});

describe('hover-card directory: what nests where', () => {
  it('the root accepts HoverCardTrigger and HoverCardContent and nothing else', () => {
    expect(units[DIRECTORY].contract.accepts).toEqual({
      content: 'specified',
      components: [ref('hover-card-trigger'), ref('hover-card-content')],
    });
  });

  it("every part's mount point is FILLED from the root that accepts it", () => {
    for (const stem of PART_STEMS) {
      expect(units[stem].contract.mounted_in, stem).toEqual([
        { container: pascalCase(DIRECTORY), component: ref(DIRECTORY) },
      ]);
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
});

describe('hover-card directory: what the schema cannot assert', () => {
  it("the root's callbacks, children and handle carry prop statements emitted into their descriptions", () => {
    const statements = units[DIRECTORY].contract.prop_statements ?? {};
    const properties = units[DIRECTORY].contract.props.properties;
    for (const prop of ['children', 'onOpenChange', 'onOpenChangeComplete', 'actionsRef', 'handle', 'triggerId', 'defaultTriggerId']) {
      expect(Object.keys(statements), prop).toContain(prop);
      expect(properties[prop].description, prop).toContain(statements[prop].states);
    }
  });

  it("the root's open state and the trigger's timings are typed, with no prop statement", () => {
    const root = units[DIRECTORY].contract;
    for (const prop of ['open', 'defaultOpen']) {
      expect(root.props.properties[prop], prop).toEqual({ type: 'boolean' });
      expect(Object.keys(root.prop_statements ?? {}), prop).not.toContain(prop);
    }
    const trigger = units['hover-card-trigger'].contract;
    for (const prop of ['delay', 'closeDelay']) {
      expect(trigger.props.properties[prop], prop).toEqual({ type: 'number' });
      expect(Object.keys(trigger.prop_statements ?? {}), prop).not.toContain(prop);
    }
  });

  it("the trigger's handle, payload, render and style carry prop statements", () => {
    const statements = units['hover-card-trigger'].contract.prop_statements ?? {};
    for (const prop of ['handle', 'payload', 'render', 'style']) {
      expect(Object.keys(statements), prop).toContain(prop);
    }
  });

  it("the content's placement enums are typed and its offset unions carry prop statements", () => {
    const content = units['hover-card-content'].contract;
    expect(content.props.properties.side).toEqual({
      type: 'string',
      enum: ['top', 'right', 'bottom', 'left', 'inline-end', 'inline-start'],
    });
    expect(content.props.properties.align).toEqual({ type: 'string', enum: ['center', 'start', 'end'] });
    for (const prop of ['container', 'sideOffset', 'alignOffset', 'collisionBoundary', 'collisionPadding']) {
      expect(Object.keys(content.prop_statements ?? {}), prop).toContain(prop);
    }
  });

  it("the content's unexposed_parts name the Portal and Positioner it composes", () => {
    const parts = (units['hover-card-content'].contract.unexposed_parts ?? []).map((entry) => entry.part);
    expect(parts).toEqual(['PreviewCard.Portal', 'PreviewCard.Positioner']);
  });
});

describe('hover-card directory in a GTS store', () => {
  function register(gts: GTS): void {
    const surfaces = new Map<string, Record<string, unknown>>();
    for (const { elementSurface } of Object.values(units)) {
      if (elementSurface) surfaces.set(String(elementSurface.$id), elementSurface);
    }
    for (const surface of surfaces.values()) gts.register(surface);
    for (const { contract } of Object.values(units)) gts.register(JSON.parse(JSON.stringify(contract)) as Record<string, unknown>);
  }

  it('every component validates as an instance of the component type', () => {
    const gts = new GTS();
    gts.register(componentType);
    registerContractTypes((entity) => gts.register(entity));
    register(gts);
    for (const { stem, contract } of Object.values(units)) {
      const result = gts.validateInstance(contract.$id);
      expect(result.ok, `${stem}: ${result.error}`).toBe(true);
    }
  });

  it('the trigger names the anchor (dom_a) surface, the content the div surface, the root none', () => {
    for (const { stem, contract, elementSurface } of Object.values(units)) {
      if (elementSurface) expect(contract.forwards_to, stem).toBe(bareGtsId(String(elementSurface.$id)));
    }
    expect(units['hover-card-trigger'].contract.forwards_to).toBe(elementTypeRef('dom_a'));
    expect(units['hover-card-content'].contract.forwards_to).toBe(elementTypeRef('dom_div'));
    expect(units[DIRECTORY].elementKind).toBeUndefined();
    expect(units[DIRECTORY].contract.forwards_to).toBeUndefined();
  });

  it('fails when the component type is not registered - negative control', () => {
    const gts = new GTS();
    register(gts);
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
