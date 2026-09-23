// Conformance for both ScrollArea contracts (root and ScrollBar) - one file
// because the interesting assertions are about how the two relate (family
// membership, the export the part's overlay names), not about either in
// isolation. The per-component shape comes from testing.ts's
// assertContractFreshness; radio-group.contract.test.ts is the family suite
// this follows.
import Ajv2020 from 'ajv/dist/2020';
import { describe, expect, it } from 'vitest';

import {
  addContractTypes,
  buildComponentType,
  contractMajor,
  familyRoster,
  liftPropsSchema,
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

const DIRECTORY = 'scroll-area';
// ScrollBar's name does not extend the directory's, so its stem keeps the
// directory prefix and its overlay names the export.
const BAR = 'scroll-area-scroll-bar';
const ALL_STEMS = [DIRECTORY, BAR] as const;

for (const stem of ALL_STEMS) assertContractFreshness(DIRECTORY, stem);

const units = compileUnits(DIRECTORY, ALL_STEMS);
const componentType = buildComponentType();
const ref = (stem: string) => componentRef(stem, contractMajor(DIRECTORY, stem));

describe('scroll-area family: component type validity', () => {
  it('both contracts validate against the component type', () => {
    const ajv = new Ajv2020();
    addContractTypes(ajv);
    const validate = ajv.compile(componentType);
    for (const { stem, contract } of Object.values(units)) {
      expect(validate(JSON.parse(JSON.stringify(contract))), `${stem}: ${ajv.errorsText(validate.errors)}`).toBe(true);
    }
  });

  it('each one lifts a props type named after its stem', () => {
    for (const { stem, contract } of Object.values(units)) {
      expect(liftPropsSchema(contract).$id, stem).toContain(`props.${stem.replace(/-/g, '_')}.v`);
    }
  });

  it('the bar describes the ScrollBar export, read through its overlay', () => {
    // The extraction behind the bar's contract is the ScrollBar export's:
    // its own props (orientation, keepMounted) reach the schema, the root's
    // overflowEdgeThreshold does not.
    const bar = units[BAR].contract.props.properties;
    expect(bar.orientation).toEqual({ type: 'string', enum: ['horizontal', 'vertical'], default: 'vertical' });
    expect(bar.keepMounted).toEqual({ type: 'boolean' });
    expect(bar).not.toHaveProperty('overflowEdgeThreshold');
  });
});

describe('scroll-area family: membership resolves', () => {
  it('the root names the family, calls itself root, and carries the bar', () => {
    const root = units[DIRECTORY].contract.family_membership;
    expect(root?.name).toBe('scroll_area');
    expect(root?.role).toBe('root');
    expect(root?.members).toEqual([ref(BAR)]);
  });

  it('the bar names the same family, calls itself a part, and lists no members', () => {
    const membership = units[BAR].contract.family_membership;
    expect(membership?.name).toBe('scroll_area');
    expect(membership?.role).toBe('part');
    expect(membership?.members).toBeUndefined();
  });

  it('the part the root carries ships a compiled contract of its own', () => {
    for (const member of units[DIRECTORY].contract.family_membership?.members ?? []) {
      const target = resolveComponentRef(member);
      expect(target.contractId, `${member}: ${target.stem} ships no compiled contract`).toBe(member);
    }
  });

  it('the root is the only member the roster calls a root', () => {
    const roster = familyRoster('scroll_area');
    expect(roster.root).toBe(ref(DIRECTORY));
    expect(roster.parts).toEqual([ref(BAR)]);
  });
});

describe('scroll-area family: what nests where', () => {
  it('the root constrains nothing inside it, and the bar accepts nothing', () => {
    // The root renders whatever it is given inside its viewport, so it names
    // no component list; the bar renders only its own thumb.
    expect(units[DIRECTORY].contract.accepts).toEqual({ content: 'unconstrained' });
    expect(units[BAR].contract.accepts).toEqual({ content: 'nothing' });
  });

  it('neither contract carries a mount point', () => {
    // No accepts list names either one, and neither overlay states a
    // container outside the kit; absent, not an empty list.
    for (const stem of ALL_STEMS) expect(units[stem].contract.mounted_in, stem).toBeUndefined();
  });
});

describe('scroll-area family: what the schema cannot assert', () => {
  it("the root's threshold union and both render/style props carry prop statements emitted into their descriptions", () => {
    const expected: Record<string, string[]> = {
      [DIRECTORY]: ['overflowEdgeThreshold', 'render', 'style'],
      [BAR]: ['render', 'style'],
    };
    for (const stem of ALL_STEMS) {
      const statements = units[stem].contract.prop_statements ?? {};
      expect(Object.keys(statements).sort(), stem).toEqual(expected[stem]);
      for (const prop of expected[stem]) {
        expect(units[stem].contract.props.properties[prop].description, `${stem}.${prop}`).toContain(statements[prop].states);
      }
    }
  });

  it('the unexposed parts name the viewport and corner on the root and the thumb on the bar', () => {
    const parts = (stem: string) => (units[stem].contract.unexposed_parts ?? []).map((entry) => entry.part);
    expect(parts(DIRECTORY)).toEqual(['ScrollArea.Viewport', 'ScrollArea.Corner']);
    expect(parts(BAR)).toEqual(['ScrollArea.Thumb']);
  });
});

describe('scroll-area family in a GTS store', () => {
  it('both components validate as an instance of the component type', () => {
    const gts = unitStore(Object.values(units));
    for (const { stem, contract } of Object.values(units)) {
      const result = gts.validateInstance(contract.$id);
      expect(result.ok, `${stem}: ${result.error}`).toBe(true);
    }
  });

  it('both name the div surface they render', () => {
    for (const { stem, contract, elementSurface } of Object.values(units)) {
      expect(contract.forwards_to, stem).toBe(bareGtsId(String(elementSurface.$id)));
      expect(contract.forwards_to, stem).toBe(elementTypeRef('dom_div'));
    }
  });

  it('fails when the component type is not registered - negative control', () => {
    const gts = unitStore(Object.values(units), { componentType: false, vocabulary: false });
    const result = gts.validateInstance(units[DIRECTORY].contract.$id);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Schema not found');
  });

  it('both validate as an instance of the committed component type', () => {
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
