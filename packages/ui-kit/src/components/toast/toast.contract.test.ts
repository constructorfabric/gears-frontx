// Conformance for the toast directory's one contract, Toaster. Its export
// name does not extend the directory's, so the stem is toast-toaster and the
// overlay names the export; the directory's other exports (the `toast`
// manager, createToastManager, useToastManager) are companions, not
// components. The per-component shape comes from testing.ts's
// assertContractFreshness.
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

const DIRECTORY = 'toast';
const STEM = 'toast-toaster';

assertContractFreshness(DIRECTORY, STEM);

// Toaster renders no element of its own around its children (Base UI's
// Toast.Provider only provides context, and the region is portalled), so it
// names no host surface.
const unit = compileUnit(DIRECTORY, STEM, { allowNoHostElement: true });
const { contract } = unit;

describe('toast-toaster contract', () => {
  it('lifts a props type named after its stem', () => {
    expect(liftPropsSchema(contract).$id).toContain('props.toast_toaster.v');
  });

  it('names no host element surface', () => {
    expect(unit.elementKind).toBeUndefined();
    expect(contract.forwards_to).toBeUndefined();
  });

  it("types the kit's labels and the primitive's timing, and states the rest", () => {
    const properties = contract.props.properties;
    expect(properties.closeLabel).toEqual({ type: 'string', default: 'Close toast' });
    expect(properties.label).toEqual({ type: 'string', default: 'Notifications' });
    for (const prop of ['limit', 'timeout']) expect(properties[prop], prop).toEqual({ type: 'number' });
    const statements = contract.prop_statements ?? {};
    expect(Object.keys(statements).sort()).toEqual(['children', 'container', 'toastManager']);
    for (const prop of Object.keys(statements)) {
      expect(properties[prop].description, prop).toContain(statements[prop].states);
    }
  });

  it('lists the three non-component exports as companions', () => {
    expect((contract.companions ?? []).map((entry) => entry.export)).toEqual(['toast', 'createToastManager', 'useToastManager']);
  });

  it('constrains nothing inside it and carries no mount point or family', () => {
    expect(contract.accepts).toEqual({ content: 'unconstrained' });
    expect(contract.mounted_in).toBeUndefined();
    expect(contract.family_membership).toBeUndefined();
  });
});

describe('toast-toaster in a GTS store', () => {
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
