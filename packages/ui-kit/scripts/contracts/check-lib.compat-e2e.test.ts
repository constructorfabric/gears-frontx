// End-to-end coverage for decideCompat's headline breaking-change scenarios
// (demo review M9). check-lib.test.ts's own `decideCompat` suite feeds
// synthetic gtsBackwardCompatible/gtsBackwardErrors booleans directly - that
// proves the DECISION rule (major bump vs fail) but never proves gts-ts's
// own checkCompatibility actually catches, or fails to catch, the class of
// change this guard exists for. This suite compiles two REAL schema
// versions per scenario, registers them in a REAL GTS instance (the same
// construction check.ts's checkCompatForUnit uses: a fresh store per run,
// old/new registered under synthetic minor-versioned ids so they never
// collide, each trimmed by sharedPropsSchemas to the props both declare), and
// runs the real backward-compatibility check plus the real diffOwnPropsSchema
// - only decideCompat itself is a function under test here, unmocked.
//
// The library never sees an added or removed prop, because the trimming
// leaves both out, so the rename and new-required-prop scenarios below rely
// on diffOwnPropsSchema to catch them (see the module comment above
// diffOwnPropsSchema in check-lib.ts).
import { GTS } from '@globaltypesystem/gts-ts';
import { describe, expect, it } from 'vitest';

import { decideCompat, diffOwnPropsSchema, extractContractMajor, sharedPropsSchemas, synthesizeVersionedId } from './check-lib';
import { bareGtsId, propsSchemaId } from './ids';
import { applyContractTestTimeout } from './testing';

// This suite builds no TypeScript program either, but registers real
// compiled schemas in a real GTS store and runs the real backward-
// compatibility check per scenario - real work, and it gets the same 120s
// margin as the rest of the contracts test surface rather than depending on
// this specific suite staying fast forever. Must run before any
// describe()/it() in the file; see applyContractTestTimeout's own comment
// in testing.ts.
applyContractTestTimeout();

const COMPONENT = 'compat-e2e-fixture';

// A minimal but real lifted props type: the same $id grammar liftPropsSchema
// stamps on for every real component, with a hand-picked properties/required
// set per scenario below. STANDALONE, with no parent - a props surface has
// nothing above it to derive from. No host-element reference either: these
// scenarios are about a component's OWN props, and the forwarded surface has
// its own comparison (check.e2e.test.ts).
function schema(major: number, properties: Record<string, { type?: string; enum?: string[]; description?: string }>, required: string[]) {
  return {
    $id: propsSchemaId(COMPONENT, major),
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object' as const,
    properties,
    required,
    unevaluatedProperties: { 'x-uikit-classification': 'unchecked' } as const,
  };
}

// The real library's own backward decision for two whole schemas, as given.
function rawBackwardDecision(old: Record<string, unknown>, fresh: Record<string, unknown>) {
  const gts = new GTS();
  const oldSynthetic = { ...old, $id: synthesizeVersionedId(String(old.$id), 0) };
  const newSynthetic = { ...fresh, $id: synthesizeVersionedId(String(fresh.$id), 1) };
  gts.register(oldSynthetic);
  gts.register(newSynthetic);
  return gts.checkCompatibility(bareGtsId(oldSynthetic.$id), bareGtsId(newSynthetic.$id), 'backward');
}

// The same decision on what check.ts hands the library: both revisions
// trimmed to the props they both declare. This is what the project reads as
// ONE of its compatibility signals, and what the suite below pins, so a
// change in it is a test failure here rather than a silently weaker gate.
function gtsBackwardDecision(old: ReturnType<typeof schema>, fresh: ReturnType<typeof schema>) {
  return rawBackwardDecision(...sharedPropsSchemas(old, fresh));
}

// Registers old/new under synthetic minor-versioned ids in one fresh GTS
// store (mirrors checkCompatForUnit exactly), runs the real backward check
// plus the real own-props diff, and hands both to the real decideCompat.
function checkRealCompat(old: ReturnType<typeof schema>, fresh: ReturnType<typeof schema>) {
  const result = gtsBackwardDecision(old, fresh);

  return decideCompat({
    component: COMPONENT,
    oldMajor: extractContractMajor(old.$id),
    newMajor: extractContractMajor(fresh.$id),
    gtsBackwardCompatible: result.is_backward_compatible,
    gtsBackwardErrors: result.backward_errors,
    ownPropsDiff: diffOwnPropsSchema(old, fresh),
  });
}

describe('decideCompat against a real GTS instance and real gts-ts compatibility check', () => {
  it('fails when an enum value is removed from an own prop, major unchanged', () => {
    const old = schema(1, { variant: { type: 'string', enum: ['default', 'destructive'] } }, []);
    const fresh = schema(1, { variant: { type: 'string', enum: ['default'] } }, []);
    expect(checkRealCompat(old, fresh).decision).toBe('fail');
  });

  it('fails when an optional own prop becomes required, major unchanged', () => {
    const old = schema(1, { label: { type: 'string' } }, []);
    const fresh = schema(1, { label: { type: 'string' } }, ['label']);
    expect(checkRealCompat(old, fresh).decision).toBe('fail');
  });

  it('fails when a new required own prop is added, major unchanged', () => {
    const old = schema(1, { label: { type: 'string' } }, []);
    const fresh = schema(1, { label: { type: 'string' }, id: { type: 'string' } }, ['id']);
    expect(checkRealCompat(old, fresh).decision).toBe('fail');
  });

  it('fails when an own prop is renamed (old name gone, new name added)', () => {
    const old = schema(1, { iconName: { type: 'string' } }, []);
    const fresh = schema(1, { icon: { type: 'string' } }, []);
    const decision = checkRealCompat(old, fresh);
    expect(decision.decision).toBe('fail');
    expect(decision.notes[0]).toContain('own prop "iconName" removed');
  });

  it('passes the same enum removal when the contract major moved, with a note naming both versions', () => {
    const old = schema(1, { variant: { type: 'string', enum: ['default', 'destructive'] } }, []);
    const fresh = schema(2, { variant: { type: 'string', enum: ['default'] } }, []);
    const decision = checkRealCompat(old, fresh);
    expect(decision.decision).toBe('pass');
    expect(decision.notes[0]).toContain('v1 -> v2');
  });

  it('passes when nothing changed', () => {
    const old = schema(1, { label: { type: 'string' } }, []);
    const fresh = schema(1, { label: { type: 'string' } }, []);
    expect(checkRealCompat(old, fresh).decision).toBe('pass');
  });

  it('passes when a property that asserts nothing only gains prose naming its TypeScript type', () => {
    // A property with no type/enum accepts anything either way; the prose
    // added to it (compile.ts's describeUntypeableProperty) tells a reader
    // what tsc checks instead. gts-ts's own backward check is asserted here
    // rather than assumed, because this project reads its decision as one of
    // three compatibility signals - if the library ever started treating an
    // annotation as a schema change, every recompile of an existing
    // contract would start refusing itself.
    const old = schema(1, { icon: {} }, []);
    const fresh = schema(1, { icon: { description: 'TS: ReactNode. Not expressible in JSON Schema, checked by tsc.' } }, []);
    expect(checkRealCompat(old, fresh).decision).toBe('pass');
  });
});

describe("what gts-ts's own backward decision does and does not see", () => {
  // Pinned, not assumed. Every one of these was measured against the
  // installed library, and a future version of gts-ts that starts (or stops)
  // reporting one of them makes this suite fail here rather than quietly
  // changing how much the gate catches.
  it('reports a dropped enum value', () => {
    const decision = gtsBackwardDecision(
      schema(1, { variant: { type: 'string', enum: ['default', 'destructive'] } }, []),
      schema(1, { variant: { type: 'string', enum: ['default'] } }, []),
    );
    expect(decision.is_backward_compatible).toBe(false);
  });

  it('reports a constraint appearing where the property asserted nothing', () => {
    const decision = gtsBackwardDecision(schema(1, { tone: {} }, []), schema(1, { tone: { type: 'string' } }, []));
    expect(decision.is_backward_compatible).toBe(false);
  });

  it('reports an enum appearing on a property that already carried its type', () => {
    // Every value outside the new union stops validating, and this is the
    // shape the compiler emits the day a plain `string` prop becomes a
    // literal union.
    const decision = gtsBackwardDecision(
      schema(1, { tone: { type: 'string' } }, []),
      schema(1, { tone: { type: 'string', enum: ['info', 'warning'] } }, []),
    );
    expect(decision.is_backward_compatible).toBe(false);
  });

  it('reports an optional property that newly became required', () => {
    const decision = gtsBackwardDecision(
      schema(1, { label: { type: 'string' } }, []),
      schema(1, { label: { type: 'string' } }, ['label']),
    );
    expect(decision.is_backward_compatible).toBe(false);
  });

  it('names no property in what it reports', () => {
    // One verdict for the whole schema: the reason diffOwnPropsSchema applies
    // the same rules itself and names each finding.
    const decision = gtsBackwardDecision(
      schema(1, { variant: { type: 'string', enum: ['default', 'destructive'] } }, []),
      schema(1, { variant: { type: 'string', enum: ['default'] } }, []),
    );
    expect(decision.changed_properties).toEqual([]);
    expect(decision.backward_errors.join(' ')).not.toContain('variant');
  });

  it('never sees a property added or removed, because the trimming leaves both out', () => {
    const added = gtsBackwardDecision(schema(1, { label: { type: 'string' } }, []), schema(1, { label: { type: 'string' }, size: { type: 'string' } }, []));
    expect(added.is_backward_compatible).toBe(true);
    const vanished = gtsBackwardDecision(schema(1, { icon: { type: 'string' } }, []), schema(1, {}, []));
    expect(vanished.is_backward_compatible).toBe(true);
  });

  it('reads a property added to the untrimmed props body as a narrowing', () => {
    // Why sharedPropsSchemas exists. The props body leaves every undeclared
    // name unchecked, so the base accepted `size` with any value, and a new
    // revision typing it rejects some of those values. Handed the whole
    // schemas, the library would refuse every new optional prop.
    const decision = rawBackwardDecision(schema(1, { label: { type: 'string' } }, []), schema(1, { label: { type: 'string' }, size: { type: 'string' } }, []));
    expect(decision.is_backward_compatible).toBe(false);
  });
});

describe('an own-props narrowing, named by the own-props diff', () => {
  it('fails at an unchanged major on an enum appearing over an existing type', () => {
    const old = schema(1, { tone: { type: 'string' } }, []);
    const fresh = schema(1, { tone: { type: 'string', enum: ['info', 'warning'] } }, []);
    const decision = checkRealCompat(old, fresh);
    expect(decision.decision).toBe('fail');
    expect(decision.notes[0]).toContain('own prop "tone" enum constraint added');
  });

  it('accepts the same change with the contract major moved', () => {
    const old = schema(1, { tone: { type: 'string' } }, []);
    const fresh = schema(2, { tone: { type: 'string', enum: ['info', 'warning'] } }, []);
    expect(checkRealCompat(old, fresh).decision).toBe('pass');
  });
});
