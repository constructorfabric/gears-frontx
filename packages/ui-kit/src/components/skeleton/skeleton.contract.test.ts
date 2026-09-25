// Conformance for the Skeleton contract.
//
// assertContractFreshness (below) recompiles the contract from source and
// diffs it against the committed skeleton.contract.json copy (freshness),
// then runs the shared checks: component references resolve, the host
// element surface is committed and grammatical, and the whole document
// validates as an instance of the component type. Everything else in this
// file compiles fresh in memory and asserts what makes THIS component's
// contract trustworthy: a styled div with no props, axes or variants of its
// own, whose whole consumer surface is the forwarded native div.
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { compileContract, resolveTargetExtraction } from '../../../scripts/contracts/compile';
import { bareGtsId, domElementToken, elementTypeId } from '../../../scripts/contracts/ids';
import { applyContractTestTimeout, assertContractFreshness } from '../../../scripts/contracts/testing';

// The freshness suite below builds a real TypeScript program - several
// seconds on a CI-class runner, comfortably under 5s locally - so only CI
// hits vitest's default test timeout. Must run before any describe()/it()
// in the file; see applyContractTestTimeout's own comment in testing.ts.
applyContractTestTimeout();

assertContractFreshness('skeleton');

const contract = compileContract('skeleton');
const extraction = resolveTargetExtraction('skeleton');

describe('skeleton contract conformance', () => {
  it('extraction reported nothing it could not read', () => {
    expect(extraction.cannotExtract).toEqual([]);
  });

  it('declares no axes and no props of its own: the surface is the forwarded div', () => {
    // SkeletonProps is ComponentProps<'div'> verbatim - there is no cva call
    // and nothing declared in skeleton.tsx, so the contract's own properties
    // are empty, nothing is required, and everything a consumer passes
    // belongs to the host element's surface, which the contract names by
    // reference rather than restates.
    expect(extraction.axes).toEqual({});
    expect(extraction.ownProps).toEqual([]);
    expect(extraction.apiProps).toEqual([]);
    expect(extraction.unclassifiedProps).toEqual([]);
    expect(Object.keys(contract.props.properties)).toEqual([]);
    expect(contract.props.required).toEqual([]);
  });

  it('names the committed div surface as its forwarded element', () => {
    // The one element the kit renders here is a plain div, and the surface
    // it forwards to is the hand-written one shared with every other
    // component that renders a <div>.
    const ELEMENT_TYPE_ID = elementTypeId(domElementToken('div'));
    expect(contract.forwards_to).toBe(bareGtsId(ELEMENT_TYPE_ID));
  });

  it('every good example is syntactically valid TSX', () => {
    for (const { title, code } of contract.examples.good) {
      const { diagnostics } = ts.transpileModule(code, {
        fileName: 'example.tsx',
        reportDiagnostics: true,
        compilerOptions: { jsx: ts.JsxEmit.Preserve, target: ts.ScriptTarget.Latest },
      });
      const messages = (diagnostics ?? []).map((d) => ts.flattenDiagnosticMessageText(d.messageText, ' '));
      expect(messages, `good example "${title}" does not parse`).toEqual([]);
    }
  });

  it('every bad example says why it is bad', () => {
    expect(contract.examples.bad.length).toBeGreaterThan(0);
    for (const { title, why } of contract.examples.bad) {
      expect(why.trim(), `bad example "${title}" has no reason`).not.toBe('');
    }
  });
});
