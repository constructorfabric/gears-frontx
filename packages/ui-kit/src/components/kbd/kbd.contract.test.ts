// Conformance for both kbd contracts (Kbd, KbdGroup) - one file because
// the interesting assertions are about how the two relate (the group hosting
// Kbd, and no family between them, since Kbd also stands alone in running
// text), not about either in isolation. See button.contract.test.ts for the
// per-component conformance shape.
import { GTS } from '@globaltypesystem/gts-ts';
import Ajv2020 from 'ajv/dist/2020';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import {
  addContractTypes,
  buildComponentType,
  contractMajor,
  liftPropsSchema,
  pascalCase,
  resolveTargetExtraction,
} from '../../../scripts/contracts/compile';
import { bareGtsId, componentRef, elementTypeRef } from '../../../scripts/contracts/ids';
import {
  applyContractTestTimeout,
  assertContractFreshness,
  compileUnits,
  unitStore,
  validateContractInstance,
} from '../../../scripts/contracts/testing';

// assertContractFreshness below builds a real TypeScript program - several
// seconds on a CI-class runner, comfortably under 5s locally - so only CI
// hits vitest's default test timeout. Must run before any describe()/it()
// in the file; see applyContractTestTimeout's own comment in testing.ts.
applyContractTestTimeout();

const DIRECTORY = 'kbd';
// stem === directory for Kbd (see compile.ts's resolveTargetExtraction
// default), so the group is the one export listed separately.
const PART_STEMS = ['kbd-group'] as const;
const ALL_STEMS = [DIRECTORY, ...PART_STEMS] as const;

for (const stem of ALL_STEMS) assertContractFreshness(DIRECTORY, stem);

const units = compileUnits(DIRECTORY, ALL_STEMS);
const componentType = buildComponentType();

// The ref every pointer at Kbd itself should agree on - built once so a
// typo in one overlay shows up as a mismatch against this, not just against
// itself.
const KBD_REF = componentRef(DIRECTORY, contractMajor(DIRECTORY, DIRECTORY));
const GROUP_REF = componentRef('kbd-group', contractMajor(DIRECTORY, 'kbd-group'));

describe('kbd: component type validity', () => {
  it('both contracts validate against the component type', () => {
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

describe('kbd: no family', () => {
  it('neither contract states a family membership', () => {
    // Kbd is mounted on its own in running text, so it is not a part only
    // KbdGroup may mount; KbdGroup's accepts is the whole relationship.
    for (const { stem, contract } of Object.values(units)) {
      expect(contract.family_membership, stem).toBeUndefined();
    }
  });
});

describe('kbd: what nests where', () => {
  it('the group accepts Kbd and nothing else, and Kbd accepts text only', () => {
    // The one authored statement of the nesting is the group's accepts.
    expect(units['kbd-group'].contract.accepts).toEqual({ content: 'specified', components: [KBD_REF] });
    expect(units[DIRECTORY].contract.accepts).toEqual({ content: 'specified', text: true });
  });

  it("Kbd's mount points are the group, FILLED from its accepts, and running text outside the kit", () => {
    // The group entry is derived from KbdGroup's accepts; the outside-the-kit
    // entry is authored, because nothing in the kit knows about the
    // consuming application's own text.
    const mounts = units[DIRECTORY].contract.mounted_in ?? [];
    expect(mounts).toContainEqual({ container: pascalCase('kbd-group'), component: GROUP_REF });
    const outside = mounts.filter((entry) => entry.component === undefined);
    expect(outside).toHaveLength(1);
    expect(outside[0]?.container).toBe('running text in the consuming application');
  });

  it('gives the group no mount point at all - nothing in the kit mounts a KbdGroup', () => {
    // Absent, not an empty list: no contract accepts the group inside it,
    // and an empty list would read as "may be mounted nowhere".
    expect(units['kbd-group'].contract.mounted_in).toBeUndefined();
  });
});

describe('kbd: what the schema cannot assert', () => {
  it('neither export declares a kit prop of its own - every prop is the element surface', () => {
    // The defining fact of this directory: a pure styling translation over
    // native elements, no primitive and no cva. The contract carries an
    // empty properties map with `required` present but empty, and the
    // extraction reports nothing it had to leave unclassified.
    for (const { stem, contract } of Object.values(units)) {
      const extraction = resolveTargetExtraction(DIRECTORY, stem);
      expect(extraction.axes, stem).toEqual({});
      expect(extraction.ownProps, stem).toEqual([]);
      expect(extraction.unclassifiedProps, stem).toEqual([]);
      expect(extraction.cannotExtract, stem).toEqual([]);
      expect(contract.props.properties, stem).toEqual({});
      expect(Array.isArray(contract.props.required), stem).toBe(true);
      expect(contract.props.required, stem).toEqual([]);
      expect(Object.keys(contract['x-uikit'].partially_typed_props), stem).toEqual([]);
    }
  });

  it('both contracts render the same host element, and name its surface', () => {
    // Both exports render a native <kbd> (the group deliberately, see
    // kbd.tsx's own comment), so there is one element schema across two
    // components.
    // The surface file's $id carries the URI form; bareGtsId is the one
    // conversion, applied before comparing either side.
    const kbdSurfaceId = bareGtsId(elementTypeRef('dom_kbd'));
    for (const { stem, contract, elementSurface } of Object.values(units)) {
      expect(bareGtsId(String(elementSurface.$id)), stem).toBe(kbdSurfaceId);
      expect(contract.forwards_to, stem).toBe(kbdSurfaceId);
    }
  });

  it('every good example is syntactically valid TSX', () => {
    // Syntax only. Real CI runs these through a tsc program against the kit's
    // own declarations, which also catches a prop that does not exist or has
    // the wrong type; that needs the built .d.ts, so the demo stops at parse.
    for (const { stem, contract } of Object.values(units)) {
      for (const { title, code } of contract.examples.good) {
        const { diagnostics } = ts.transpileModule(code, {
          fileName: 'example.tsx',
          reportDiagnostics: true,
          compilerOptions: { jsx: ts.JsxEmit.Preserve, target: ts.ScriptTarget.Latest },
        });
        const messages = (diagnostics ?? []).map((d) => ts.flattenDiagnosticMessageText(d.messageText, ' '));
        expect(messages, `${stem}: good example "${title}" does not parse`).toEqual([]);
      }
    }
  });

  it('every bad example says why it is bad', () => {
    for (const { stem, contract } of Object.values(units)) {
      expect(contract.examples.bad.length, stem).toBeGreaterThan(0);
      for (const { title, why } of contract.examples.bad) {
        expect(why.trim(), `${stem}: bad example "${title}" has no reason`).not.toBe('');
      }
    }
  });
});

describe('kbd contracts in a GTS store', () => {
  function registeredStore(): GTS {
    return unitStore(Object.values(units));
  }

  it('both contracts validate as instances of the component type', () => {
    const gts = registeredStore();
    for (const { stem, contract } of Object.values(units)) {
      const result = gts.validateInstance(contract.$id);
      expect(result.ok, `${stem}: ${result.error}`).toBe(true);
    }
  });

  it('fails when the component type is not registered - negative control', () => {
    const gts = unitStore(Object.values(units), { componentType: false, vocabulary: false });
    const result = gts.validateInstance(units[DIRECTORY].contract.$id);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Schema not found');
  });

  it('both contracts validate as instances of the committed component type', () => {
    // Real here because the group omits every growth surface and
    // `mounted_in`, and neither carries a family - exactly the "genuinely
    // absent, not merely undefined" case validateContractInstance's JSON
    // round-trip exists for.
    for (const { stem, contract } of Object.values(units)) {
      const result = validateContractInstance(contract);
      expect(result.ok, `${stem}: ${result.error}`).toBe(true);
    }
  });

  it('rejects Kbd when it carries an unknown key - negative control', () => {
    const kbd = units[DIRECTORY].contract;
    const corrupted = { ...kbd, bogus_field: true } as typeof kbd;
    const result = validateContractInstance(corrupted);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/additional propert/i);
  });
});
