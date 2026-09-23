// Conformance: the compiled contract may never disagree with the code.
//
// assertContractFreshness (below) recompiles the contract from source and
// diffs it against the committed textarea.contract.json copy (freshness),
// and runs the shared suite over it: component references resolved, mount
// points derived, the host element surface resolved, and the whole document
// validated as an instance of the component type. Everything else in this
// file compiles in memory and checks what the contract claims about a
// pass-through component: Textarea forwards the whole native textarea
// attribute set and declares nothing of its own, so every prop a consumer
// passes is either element surface or unchecked.
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

assertContractFreshness('textarea');

const contract = compileContract('textarea');
const extraction = resolveTargetExtraction('textarea');
const ELEMENT_TYPE_ID = elementTypeId(domElementToken('textarea'));
const elementSurface = loadElementSurface('textarea');

function compileValidator(): ReturnType<typeof compilePropsValidator> {
  return compilePropsValidator(contract);
}

describe('textarea contract conformance', () => {
  it('forwards the whole native textarea attribute set and declares nothing of its own', () => {
    // textarea.tsx types its props as ComponentProps<'textarea'> and spreads
    // them through: no cva, no declared props, no primitive API. The one
    // work it does beyond forwarding - merging a consumer className after
    // the kit class, and rebuilding a `rows` floor through a --rows custom
    // property - touches only props the element surface already owns.
    expect(extraction.elementKind).toBe('textarea');
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

  it('names the textarea element surface it forwards to', () => {
    // The surface is hand-written once per element kind and shared by every
    // component rendering that element; the contract holds it as a
    // reference, and the reference resolves to the committed file.
    expect(contract.forwards_to).toBe(bareGtsId(ELEMENT_TYPE_ID));
    expect(elementSurface.$id).toBe(ELEMENT_TYPE_ID);
  });

  it('keeps the native state attributes on the element surface, not as kit props', () => {
    // `rows` and `disabled` are native textarea attributes - the same ones
    // for every component rendering a <textarea> - so the surface owns them
    // and the contract's own properties name nothing, even though `rows` is
    // the one attribute the component reads before forwarding, to set the
    // --rows floor (see the invariant on the overlay).
    expect(elementSurface.properties).toHaveProperty('rows');
    expect(elementSurface.properties).toHaveProperty('disabled');
    expect(contract.props.properties).not.toHaveProperty('rows');
    expect(contract.props.properties).not.toHaveProperty('disabled');
  });

  it('admits the native attributes through the composed surface, valid and mistyped', () => {
    // The validator composes the surface beside the contract, so a native
    // attribute is checked by the surface's own shape even though the
    // contract's body carries no properties: rows is a number, and a string
    // fails through the composition.
    const validate = compileValidator();
    expect(validate({ rows: 6, disabled: true, placeholder: 'Notes' })).toBe(true);
    expect(validate({ rows: 'six' })).toBe(false);
  });

  it('accepts the state and naming attributes consumers set by hand', () => {
    // aria-invalid drives the destructive restyle (see the contract's own
    // invariant); aria-*, data-* and on* handlers are open by pattern on
    // the surface, and className rides through unchecked.
    const validate = compileValidator();
    expect(validate({ 'aria-invalid': 'true', 'data-testid': 'notes', className: 'consumer' })).toBe(true);
    expect(validate({ 'aria-label': 'Notes', onChange: () => {} })).toBe(true);
  });

  it('takes no content: the field is its value, not its children', () => {
    // accepts is the one authored nesting statement. children is an
    // attribute React itself warns against on a textarea; a consumer sets
    // defaultValue or value instead, so no component, no text, no icon slot.
    expect(contract.accepts.content).toBe('nothing');
    expect(contract.accepts.components).toBeUndefined();
    expect(contract.accepts.text).toBeUndefined();
  });

  it('recommends Input for single-line values, by reference', () => {
    // The rule whose target is Input names a kit component, at the major
    // Input's own contract carries.
    const input = contract.dont_use_when.find((entry) => entry.instead.target === 'Input');
    expect(input, 'the single-line rule is gone').toBeDefined();
    expect(input?.instead.component).toBe(componentRef('input', contractMajor('input')));
    expect(resolveComponentRef(input?.instead.component as string).directory).toBe('input');
  });

  it('points the rich-text case outside the kit, with a reason and no component', () => {
    // The absence of a component reference is the honest statement that the
    // kit ships nothing for the case; the note says what a reader does
    // instead, and the target names the thing they act on.
    const rich = contract.dont_use_when.find(
      (entry) => entry.instead.target === 'a third-party rich-text editor styled with the theme\'s tokens',
    );
    expect(rich, 'the rich-text rule is gone').toBeDefined();
    expect(rich?.instead.component).toBeUndefined();
    expect(rich?.instead.note, 'the rule says why the kit ships nothing').toBeTruthy();
  });

  it('validates as an instance of the component type', () => {
    const result = validateContractInstance(contract);
    expect(result.ok, result.error).toBe(true);
  });
});
