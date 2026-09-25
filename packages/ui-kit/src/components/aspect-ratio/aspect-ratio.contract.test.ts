// Conformance for the AspectRatio contract.
//
// assertContractFreshness (below) recompiles the contract from source and
// diffs it against the committed aspect-ratio.contract.json copy (freshness);
// everything else in this file compiles in-memory and checks the facts that
// make THIS component's contract trustworthy: exactly the two props the
// source declares, no variant axis, the committed div surface it forwards to,
// and a content statement that matches the untouched-children reality. See
// button.contract.test.ts for the full per-component conformance shape this
// file is the small-standalone-component instance of.
import { GTS } from '@globaltypesystem/gts-ts';
import { describe, expect, it } from 'vitest';

import { compileContract, loadElementSurface, resolveTargetExtraction } from '../../../scripts/contracts/compile';
import { bareGtsId, domElementToken, elementTypeId } from '../../../scripts/contracts/ids';
import {
  applyContractTestTimeout,
  assertContractFreshness,
  resolveComponentRef,
  unitStore,
  validateContractInstance,
} from '../../../scripts/contracts/testing';

// resolveTargetExtraction below builds a real TypeScript program - several
// seconds on a CI-class runner, comfortably under 5s locally - so only CI
// hits vitest's default test timeout. Must run before any describe()/it()
// in the file; see applyContractTestTimeout's own comment in testing.ts.
applyContractTestTimeout();

// Freshness: the committed aspect-ratio.contract.json must equal a fresh
// compile. This is the one check standing between "the code is right" and
// "what shipped is right" - see testing.ts.
assertContractFreshness('aspect-ratio');

const contract = compileContract('aspect-ratio');
const extraction = resolveTargetExtraction('aspect-ratio');

// The element AspectRatio renders, and the hand-written surface shared with
// every other component that renders a <div>.
const ELEMENT_TYPE_ID = elementTypeId(domElementToken('div'));
const elementSurface = loadElementSurface('div');

describe('aspect-ratio contract conformance', () => {
  it('carries exactly the two props the source declares, one of them required', () => {
    // AspectRatio wraps a plain div (no primitive), so its props surface is
    // its own declarations alone: `ratio` (required) and `className`. The
    // 279 forwarded div attributes live on the element surface, not here.
    expect(Object.keys(contract.props.properties).sort()).toEqual(['className', 'ratio']);
    expect(contract.props.properties.ratio).toEqual({ type: 'number' });
    expect(contract.props.properties.className).toEqual({ type: 'string' });
    expect([...contract.props.required].sort()).toEqual(['ratio']);
  });

  it('has no variant axis: the extraction reports none and no property carries an enum or a default', () => {
    // The component styles with a CSS custom property, not a variant helper,
    // so both directions must agree that there is nothing to enumerate.
    expect(extraction.axes).toEqual({});
    expect(extraction.defaults).toEqual({});
    for (const [name, schema] of Object.entries(contract.props.properties)) {
      expect(schema.enum, name).toBeUndefined();
      expect(schema.default, name).toBeUndefined();
    }
  });

  it('extraction reported nothing it could not read or classify', () => {
    expect(extraction.cannotExtract).toEqual([]);
    expect(extraction.unclassifiedProps).toEqual([]);
  });

  it('names the committed div surface, which declares the attributes this component is about', () => {
    expect(extraction.elementKind).toBe('div');
    expect(contract.forwards_to).toBe(bareGtsId(ELEMENT_TYPE_ID));
    expect(elementSurface.$id).toBe(ELEMENT_TYPE_ID);
    // The ratio reaches the DOM through `style` and the kit class through
    // `className`; both are declared by the shared surface rather than by
    // this contract.
    expect(elementSurface.properties).toHaveProperty('style');
    expect(elementSurface.properties).toHaveProperty('className');
  });

  it('answers "unconstrained" for content, with no detail beside it', () => {
    // The box forwards children untouched: any React node may go inside and
    // nothing examines it, so there is no text flag and no component list to
    // state - detail beside an answered question is refused anyway.
    expect(contract.accepts).toEqual({ content: 'unconstrained' });
  });

  it('states no growth surface and no prop statement', () => {
    // Both declared props are fully stated by the schema (number, string), so
    // a prop_statements entry would be a second answer to an answered
    // question; and the component takes no node slot, has no prop-switched
    // behaviour, ships no companion export and is no part of a family.
    expect(contract.prop_statements ?? {}).toEqual({});
    expect(contract.slots).toBeUndefined();
    expect(contract.capabilities).toBeUndefined();
    expect(contract.companions).toBeUndefined();
    expect(contract.family_membership).toBeUndefined();
  });

  it('keeps its two honest unknowns as attestations', () => {
    // Nobody has checked an assistive-technology or directionality claim on
    // a plain layout box, so the contract must not carry a borrowed verdict.
    expect(contract.attestations.a11y).toEqual({ outcome: 'unknown' });
    expect(contract.attestations.rtl).toEqual({ outcome: 'unknown' });
  });
});

describe('aspect-ratio in a GTS store', () => {
  function registeredStore(): GTS {
    return unitStore([{ contract, elementSurface }]);
  }

  it('validates as an instance of the component type', () => {
    const gts = registeredStore();
    const result = gts.validateInstance(contract.$id);
    expect(result.ok, result.error).toBe(true);
  });

  it('validates against the committed component type through the shared helper', () => {
    const result = validateContractInstance(contract);
    expect(result.ok, result.error).toBe(true);
  });

  it('carries an id a component reference can resolve back to', () => {
    // Resolution reads the kit's directories and the committed contract.json
    // from disk, so this also proves the compiled copy is where a referrer
    // would find it.
    const target = resolveComponentRef(contract.$id);
    expect(target.directory).toBe('aspect-ratio');
    expect(target.stem).toBe('aspect-ratio');
    expect(target.contractId).toBe(bareGtsId(contract.$id));
  });
});
