// Conformance: the compiled contract may never disagree with the code.
//
// assertContractFreshness (below) recompiles the contract from source and
// diffs it against the committed label.contract.json copy (freshness), and
// runs the shared suite over it: partially typed properties paired with
// prop statements, component references resolved, mount points derived,
// the host element surface resolved, and the whole document validated as
// an instance of the component type. Everything else in this file compiles
// in memory and checks what the contract claims about a pass-through
// component: Label forwards the whole native label attribute set and
// declares nothing of its own, so every prop a consumer passes is either
// element surface or unchecked.
import { describe, expect, it } from 'vitest';

import {
  compileContract,
  compilePropsValidator,
  contractMajor,
  loadElementSurface,
  resolveTargetExtraction,
} from '../../../scripts/contracts/compile';
import {
  applyContractTestTimeout,
  assertContractFreshness,
  resolveComponentRef,
  validateContractInstance,
} from '../../../scripts/contracts/testing';
import { bareGtsId, componentRef, domElementToken, elementTypeId } from '../../../scripts/contracts/ids';

// assertContractFreshness builds a real TypeScript program - several seconds
// on a CI-class runner - so only CI hits vitest's default test timeout.
// Must run before any describe()/it() in the file.
applyContractTestTimeout();

assertContractFreshness('label');

const contract = compileContract('label');
const extraction = resolveTargetExtraction('label');
const ELEMENT_TYPE_ID = elementTypeId(domElementToken('label'));
const elementSurface = loadElementSurface('label');

function compileValidator(): ReturnType<typeof compilePropsValidator> {
  return compilePropsValidator(contract);
}

describe('label contract conformance', () => {
  it('forwards the whole native label attribute set and declares nothing of its own', () => {
    // label.tsx types its props as ComponentProps<'label'> and spreads them
    // through: no cva, no declared props, no primitive API. The contract's
    // own properties list is therefore empty and everything a consumer
    // passes is forwarded surface - which is exactly what the filing rule
    // says for React DOM attributes.
    expect(extraction.elementKind).toBe('label');
    expect(extraction.ownProps).toEqual([]);
    expect(extraction.apiProps).toEqual([]);
    expect(extraction.axes).toEqual({});
    expect(extraction.defaults).toEqual({});
    expect(extraction.unclassifiedProps).toEqual([]);
    expect(extraction.cannotExtract).toEqual([]);
    expect(extraction.forwardedProps.length).toBeGreaterThan(0);
    expect(Object.keys(contract.props.properties)).toEqual([]);
    expect(contract.props.required).toEqual([]);
  });

  it('names the label element surface it forwards to', () => {
    // The surface is hand-written once per element kind and shared by every
    // component rendering that element; the contract holds it as a
    // reference, and the reference resolves to the committed file.
    expect(contract.forwards_to).toBe(bareGtsId(ELEMENT_TYPE_ID));
    expect(elementSurface.$id).toBe(ELEMENT_TYPE_ID);
  });

  it('keeps the association props on the element surface, not as kit props', () => {
    // htmlFor carries the association and is the same attribute for every
    // component rendering a <label>, so the surface owns it and the
    // contract's own properties name nothing.
    expect(elementSurface.properties).toHaveProperty('htmlFor');
    expect(contract.props.properties).not.toHaveProperty('htmlFor');
  });

  it('admits the association attributes through the composed surface, both valid and mistyped', () => {
    // The validator composes the surface beside the contract, so a native
    // attribute is checked by the surface's own shape even though the
    // contract's body carries no properties: htmlFor is a string, and a
    // non-string fails through the composition.
    const validate = compileValidator();
    expect(validate({ htmlFor: 'email' })).toBe(true);
    expect(validate({ htmlFor: 42 })).toBe(false);
  });

  it('accepts the state and naming attributes consumers set by hand', () => {
    // data-disabled dims the label (see the contract's own invariant), and
    // aria-* is open by pattern on the surface - both pass the composed
    // validator, and both reach the DOM as forwarded attributes.
    const validate = compileValidator();
    expect(validate({ 'data-disabled': '', className: 'consumer' })).toBe(true);
    expect(validate({ 'aria-label': 'Email address' })).toBe(true);
  });

  it('names exactly the inline controls it hosts, and each reference resolves', () => {
    // accepts is the one authored nesting statement: the kit components a
    // Label may wrap are the inline controls. Each reference must name a
    // component the kit ships, at the major the target's own contract
    // carries.
    const accepted = contract.accepts.components ?? [];
    expect(accepted).toHaveLength(2);
    for (const ref of accepted) {
      const target = resolveComponentRef(ref);
      expect(target.directory).toBe(target.stem);
      expect(ref).toBe(componentRef(target.stem, contractMajor(target.stem)));
    }
    expect(accepted).toContain(componentRef('checkbox', contractMajor('checkbox')));
    expect(accepted).toContain(componentRef('switch', contractMajor('switch')));
  });

  it('recommends FieldLabel for the composed case, by reference', () => {
    // The one recommendation that names a kit component: inside a Field
    // composition the caption is FieldLabel, which renders this Label with
    // Field's spacing.
    const fieldLabel = contract.dont_use_when.map((entry) => entry.instead.component).find((ref) => ref !== undefined);
    expect(fieldLabel).toBe('gts.frontx.uikit._.component.v1~frontx.uikit._.field_label.v1');
    const target = resolveComponentRef(fieldLabel as string);
    expect(target.directory).toBe('field');
    expect(target.stem).toBe('field-label');
  });

  it('validates as an instance of the component type', () => {
    const result = validateContractInstance(contract);
    expect(result.ok, result.error).toBe(true);
  });
});
