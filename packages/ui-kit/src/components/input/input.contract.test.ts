// Conformance: the compiled contract may never disagree with the code.
//
// assertContractFreshness (below) recompiles the contract from source and
// diffs it against the committed input.contract.json copy (freshness), and
// runs the shared suite over it: partially typed properties paired with
// prop statements, component references resolved, the host element surface
// resolved, and the whole document validated as an instance of the
// component type. Everything else in this file compiles in memory and
// checks what the contract claims about Input: one native input over a
// Base UI API, two slots, no styling axes of its own.
import { describe, expect, it } from 'vitest';

import {
  compileContract,
  compilePropsValidator,
  loadElementSurface,
  partlyCheckedPropertyNames,
  resolveTargetExtraction,
} from '../../../scripts/contracts/compile';
import {
  applyContractTestTimeout,
  assertContractFreshness,
  resolveComponentRef,
  validateContractInstance,
} from '../../../scripts/contracts/testing';
import { bareGtsId, domElementToken, elementTypeId } from '../../../scripts/contracts/ids';

// assertContractFreshness builds a real TypeScript program - several seconds
// on a CI-class runner - so only CI hits vitest's default test timeout.
// Must run before any describe()/it() in the file.
applyContractTestTimeout();

assertContractFreshness('input');

const contract = compileContract('input');
const extraction = resolveTargetExtraction('input');
const ELEMENT_TYPE_ID = elementTypeId(domElementToken('input'));
const elementSurface = loadElementSurface('input');

function compileValidator(): ReturnType<typeof compilePropsValidator> {
  return compilePropsValidator(contract);
}

describe('input contract conformance', () => {
  it('declares two slots and a className over the Base UI Input API, with no axes', () => {
    // input.tsx declares exactly className, icon and end; everything else in
    // `properties` is the primitive's API (value/defaultValue/onValueChange,
    // render, style) arriving on the same footing. No cva is involved, so
    // axes and defaults are empty and nothing is required.
    expect(extraction.elementKind).toBe('input');
    expect(extraction.axes).toEqual({});
    expect(extraction.defaults).toEqual({});
    expect(extraction.unclassifiedProps).toEqual([]);
    expect(extraction.cannotExtract).toEqual([]);
    expect(extraction.ownProps.map((prop) => prop.name).sort()).toEqual(['className', 'end', 'icon']);
    expect(extraction.apiProps.map((prop) => prop.name).sort()).toEqual([
      'defaultValue',
      'onValueChange',
      'render',
      'style',
      'value',
    ]);
    expect(Object.keys(contract.props.properties).sort()).toEqual([
      'className',
      'defaultValue',
      'end',
      'icon',
      'onValueChange',
      'render',
      'style',
      'value',
    ]);
    expect(contract.props.required).toEqual([]);
  });

  it('names the input element surface it forwards to', () => {
    // The surface is hand-written once per element kind and shared by every
    // component rendering that element; the contract holds it as a
    // reference, and the reference resolves to the committed file.
    expect(contract.forwards_to).toBe(bareGtsId(ELEMENT_TYPE_ID));
    expect(elementSurface.$id).toBe(ELEMENT_TYPE_ID);
  });

  it('takes no content: a native input has no slot for children', () => {
    expect(contract.accepts.content).toBe('nothing');
    expect(contract.accepts.components).toBeUndefined();
    expect(contract.accepts.text).toBeUndefined();
  });

  it('keeps the consumer className a declared prop narrowed to a string', () => {
    // input.tsx redeclares `className?: string`, narrower than Base UI's
    // `string | ((state) => string)` union - the kit-wide convention, and
    // the declaration is what the contract carries.
    expect(extraction.ownProps.map((prop) => prop.name)).toContain('className');
    expect(contract.props.properties.className).toEqual({ type: 'string' });
  });

  it('pairs a prop statement with every property the schema asserts nothing about', () => {
    // The both-ways pairing itself is the shared suite's check
    // (findUntypedPropMismatches, asserted in assertContractFreshness);
    // this names the intended members so a regression prints the set rather
    // than an empty diff: the two ReactNode slots, the three-way value
    // union, the change callback and the two Base UI escape hatches.
    const partlyChecked = partlyCheckedPropertyNames(contract).sort();
    expect(partlyChecked).toEqual(['defaultValue', 'end', 'icon', 'onValueChange', 'render', 'style', 'value']);
    for (const name of partlyChecked) {
      expect(contract.prop_statements ?? {}, name).toHaveProperty(name);
    }
  });

  it('carries the two slots, and only props the schema cannot fully type', () => {
    // slots is the structured statement of what takes a React node; every
    // entry must be a partly typed prop, or the schema states it in full
    // and the slot entry claims otherwise.
    const slotProps = (contract.slots ?? []).map((slot) => slot.prop);
    expect(slotProps).toEqual(['icon', 'end']);
    const partlyChecked = new Set(partlyCheckedPropertyNames(contract));
    for (const prop of slotProps) {
      expect(partlyChecked.has(prop), prop).toBe(true);
    }
  });

  it('resolves every alternative it recommends to a directory the kit ships', () => {
    // Input's boundary is the kit's other value-entry components. Each
    // reference must resolve to a directory the kit ships.
    const refs = contract.dont_use_when
      .map((entry) => entry.instead.component)
      .filter((ref): ref is string => ref !== undefined);
    expect(refs).toHaveLength(4);
    expect(refs.map((ref) => resolveComponentRef(ref).directory).sort()).toEqual([
      'input-group',
      'radio-group',
      'select',
      'textarea',
    ]);
    for (const ref of refs) {
      expect(ref, ref).toMatch(/\.v1$/);
    }
  });

  it('admits native attributes and slot nodes side by side', () => {
    const validate = compileValidator();
    expect(validate({ placeholder: 'Find', type: 'search', icon: 'anything', 'aria-label': 'Search' })).toBe(true);
  });

  it('checks a forwarded attribute through the composed element surface', () => {
    // `disabled` is filed as forwarded surface, not a kit prop - so the
    // refusal of a non-boolean comes from the COMPOSITION, the surface the
    // contract's forwards_to reference resolves to, not from the schema
    // body.
    const validate = compileValidator();
    expect(validate({ disabled: true })).toBe(true);
    expect(validate({ disabled: 'yes' })).toBe(false);
  });

  it('admits the three-way value union the schema annotates but cannot check', () => {
    // value/defaultValue assert nothing (see prop_statements), so a number
    // or an array passes the validator; tsc is the checker there.
    const validate = compileValidator();
    expect(validate({ value: 42 })).toBe(true);
    expect(validate({ defaultValue: ['a', 'b'] })).toBe(true);
  });

  it('validates as an instance of the component type', () => {
    const result = validateContractInstance(contract);
    expect(result.ok, result.error).toBe(true);
  });
});
