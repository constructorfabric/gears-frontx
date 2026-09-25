// Conformance for the direction directory's one contract, DirectionProvider,
// a re-export of Base UI's own provider. The directory's hook useDirection and
// the TextDirection type are companions, not components. The per-component
// shape comes from testing.ts's assertContractFreshness.
import { describe, expect, it } from 'vitest';

import { liftPropsSchema } from '../../../scripts/contracts/compile';
import {
  applyContractTestTimeout,
  assertContractFreshness,
  compileUnit,
  unitStore,
  validateContractInstance,
} from '../../../scripts/contracts/testing';

// Must run before any describe()/it() in the file; see
// applyContractTestTimeout's own comment in testing.ts.
applyContractTestTimeout();

const DIRECTORY = 'direction';
const STEM = 'direction-provider';

assertContractFreshness(DIRECTORY, STEM);

// DirectionProvider renders no element (Base UI's own provider is a bare
// context provider), so it names no host surface.
const unit = compileUnit(DIRECTORY, STEM, { allowNoHostElement: true });
const { contract } = unit;

describe('direction-provider contract', () => {
  it('lifts a props type named after its stem', () => {
    expect(liftPropsSchema(contract).$id).toContain('props.direction_provider.v');
  });

  it('names no host element surface', () => {
    expect(unit.elementKind).toBeUndefined();
    expect(contract.forwards_to).toBeUndefined();
  });

  it('types direction as the two reading directions and states children', () => {
    expect(contract.props.properties.direction).toEqual({ type: 'string', enum: ['ltr', 'rtl'] });
    const statements = contract.prop_statements ?? {};
    expect(Object.keys(statements)).toEqual(['children']);
    expect(contract.props.properties.children.description).toContain(statements.children.states);
  });

  it('lists the hook and the direction type as companions', () => {
    expect((contract.companions ?? []).map((entry) => entry.export)).toEqual(['useDirection', 'TextDirection']);
  });

  it('constrains nothing inside it and carries no mount point or family', () => {
    expect(contract.accepts).toEqual({ content: 'unconstrained' });
    expect(contract.mounted_in).toBeUndefined();
    expect(contract.family_membership).toBeUndefined();
  });
});

describe('direction-provider in a GTS store', () => {
  it('validates as an instance of the component type', () => {
    const result = unitStore([unit]).validateInstance(contract.$id);
    expect(result.ok, result.error).toBe(true);
  });

  it('fails when the component type is not registered - negative control', () => {
    const result = unitStore([unit], { componentType: false, vocabulary: false }).validateInstance(contract.$id);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Schema not found');
  });

  it('validates as an instance of the committed component type', () => {
    const result = validateContractInstance(contract);
    expect(result.ok, result.error).toBe(true);
  });

  it('rejects the contract when it carries an unknown key - negative control', () => {
    const corrupted = { ...contract, bogus_field: true } as typeof contract;
    const result = validateContractInstance(corrupted);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/additional propert/i);
  });
});
