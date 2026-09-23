// Conformance: the compiled contract may never disagree with the code.
//
// assertContractFreshness (below) recompiles the contract from source and
// diffs it against the committed button.contract.json/.instance.json copy
// (freshness); everything else in this file compiles in-memory and checks
// the invariants that make the contract trustworthy: axes and defaults
// mirror the cva() call exactly, the overlay only references props that
// exist, and the $id obeys the GTS segment grammar.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { GTS, parseGtsID } from '@globaltypesystem/gts-ts';
import type { SchemaObject } from 'ajv';
// Draft 2020-12 needs Ajv's 2020 build; the default `ajv` export only knows
// draft-07 and rejects the contract's $schema outright. No other option
// changes were needed: the metamodel sticks to standard keywords, so Ajv's
// default strict mode accepts it as is.
import Ajv2020 from 'ajv/dist/2020';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import {
  addContractTypes,
  ANNOTATION_KEYWORDS,
  assertKnownAttestationClaims,
  assertOverlayReferencesRealProps,
  assertValidatesAgainst,
  buildComponentType,
  buildOverlaySchema,
  buildPropsAndRequired,
  CLASSIFICATION_KEY,
  compileContract,
  type CompiledContract,
  compilePropsValidator,
  liftPropsSchema,
  loadComponentType,
  loadElementSurface,
  OPEN_UNEVALUATED,
  type Overlay,
  parseOverlay,
  partlyCheckedPropertyNames,
  resolveTargetExtraction,
} from '../../../scripts/contracts/compile';
import type { ComponentExtraction } from '../../../scripts/contracts/extract';
import { classifyProps } from '../../../scripts/contracts/check-lib';
import { contractMajor } from '../../../scripts/contracts/compile';
import {
  bareGtsId,
  COMPONENT_TYPE_ID_BARE,
  componentRef,
  componentRefPattern,
  domElementToken,
  elementTypeId,
  elementTypeRef,
  METAMODEL_VERSION,
  propsSchemaId,
} from '../../../scripts/contracts/ids';
import {
  applyContractTestTimeout,
  assertContractFreshness,
  registeredKitStore,
  resolveComponentRef,
  unitStore,
  validateContractInstance,
} from '../../../scripts/contracts/testing';

// assertContractFreshness below builds a real TypeScript program - several
// seconds on a CI-class runner, comfortably under 5s locally - so only CI
// hits vitest's default test timeout. Must run before any describe()/it()
// in the file; see applyContractTestTimeout's own comment in testing.ts.
applyContractTestTimeout();

// Freshness: the committed button.contract.json must equal a fresh compile.
// Every other suite below compiles fresh in memory and never touches the
// committed copy, so this is the one check standing between "the code is
// right" and "what shipped is right" - see testing.ts.
assertContractFreshness('button');

// One document: Button's identity, everything it means, what the extraction
// read off its source, and its props surface.
const contract = compileContract('button');
const componentType = loadComponentType();
// The element Button renders, and the hand-written type for it - shared with
// AccordionTrigger and with every future component that renders a <button>,
// which is why it is committed once under scripts/contracts/elements/
// rather than derived per component.
const ELEMENT_TYPE_ID = elementTypeId(domElementToken('button'));
const elementSurface = loadElementSurface('button');

// A schema keyword ($id, $ref) carries the URI form `gts://...`; gts-ts
// strips it before parsing or keying the store (store.normalizeSchema), so
// anything talking to the library gets the bare id - bareGtsId (ids.ts) is
// the one place that conversion lives.

// The props validator every "props validation" test below uses: the harness's
// own (compile.ts's compilePropsValidator), which resolves the surface this
// contract NAMES and applies it beside the contract. The composition is the
// harness's job rather than this file's, so the one place a contract and its
// host element's surface meet is the same one every other reader goes
// through.
function compileValidator(): ReturnType<Ajv2020['compile']> {
  return compilePropsValidator(contract);
}
const extraction = resolveTargetExtraction('button');
// The kit's component directories, one per shipped component.
const COMPONENTS_DIR = join(process.cwd(), 'src/components');
const committedComponentType = JSON.parse(
  readFileSync(join(process.cwd(), 'scripts/contracts/ui-component.meta.json'), 'utf8'),
) as SchemaObject;

describe('button contract conformance', () => {
  it('mirrors every cva axis and value, both directions', () => {
    for (const [axis, values] of Object.entries(extraction.axes)) {
      expect(contract.props.properties[axis]?.enum).toEqual(values);
    }
    const enumProps = Object.entries(contract.props.properties).filter(([, schema]) => schema.enum !== undefined);
    expect(enumProps.map(([name]) => name).sort()).toEqual(Object.keys(extraction.axes).sort());
  });

  it('mirrors defaultVariants', () => {
    for (const [axis, def] of Object.entries(extraction.defaults)) {
      expect(contract.props.properties[axis]?.default).toBe(def);
    }
  });

  it('required mirrors every declared and API prop the extraction reported as non-optional', () => {
    // No fixture: derived from the same extraction the contract was built
    // from, and over BOTH prop sets - an API prop of the primitive underneath
    // reaches `properties` on the same footing as a declared one, so it
    // reaches `required` the same way. Button has none today (className,
    // icon, loading, focusableWhenDisabled, nativeButton, render and style
    // are all optional), so this also proves `required` is `[]`, not an
    // absent field, when nothing is required.
    expect(Array.isArray(contract.props.required)).toBe(true);
    const expected = [...extraction.ownProps, ...extraction.apiProps]
      .filter((prop) => prop.name in contract.props.properties && !prop.optional)
      .map((prop) => prop.name)
      .sort();
    expect([...contract.props.required].sort()).toEqual(expected);
  });

  it('overlay references only props that exist in code', () => {
    const known = new Set([...Object.keys(extraction.axes), ...extraction.ownProps.map((prop) => prop.name)]);
    for (const prop of Object.keys(contract.deprecations.props ?? {})) {
      expect(known, `deprecated prop "${prop}" is not a real prop`).toContain(prop);
    }
    const iconsVia = contract.accepts.icons_via;
    if (iconsVia !== undefined) {
      expect(known).toContain(iconsVia);
    }
  });

  it('carries a GTS instance id the real parser accepts', () => {
    // Asserted with gts-ts rather than a local regex: the grammar belongs to
    // gts-ts, and a hand-rolled copy is exactly how the previous id came to
    // be ungrammatical without anything noticing.
    const parsed = parseGtsID(contract.$id);
    expect(parsed.ok, parsed.error).toBe(true);
    // Two segments: the component type, then this component's own instance
    // segment. Each carries 5 dot-tokens
    // (vendor.package.namespace.type.vMAJOR) - the token count
    // Gts.parseSegment enforces - and the namespace slot is `_` in both,
    // because inside `uikit` there is no category above `component` and no
    // category above one component. The second segment has no trailing `~`:
    // that is what makes it an instance rather than a type.
    expect(parsed.segments.map((segment) => segment.segment)).toEqual([
      'frontx.uikit._.component.v1~',
      'frontx.uikit._.button.v1',
    ]);
    expect(parsed.segments[0].isType, 'the first segment names the component type').toBe(true);
    expect(parsed.segments[1].isType, 'the second segment names an instance').toBe(false);
    expect(contract.$id).toMatch(new RegExp(componentRefPattern()));
  });

  it('is an instance of the component type, and NAMES its host element surface', () => {
    // A component is not a type descended from anything: there is no parent
    // reference in the document and no chain to keep in step with the id.
    // What the id says is which type this is an instance of, and `gts_type`
    // says it again in the field gts-ts reads off an entity.
    //
    // The host element's surface is a reference the component holds - the
    // same id, bare, because an id-valued field holds an id - and the surface
    // it resolves to is what the file itself declares.
    expect(contract).not.toHaveProperty('allOf');
    expect(contract.gts_type).toBe(COMPONENT_TYPE_ID_BARE);
    expect(contract.$id.startsWith(COMPONENT_TYPE_ID_BARE)).toBe(true);
    expect(contract.forwards_to).toBe(bareGtsId(ELEMENT_TYPE_ID));
    expect(elementSurface.$id).toBe(ELEMENT_TYPE_ID);
  });

  it('leaves the surface open with an annotated classification rather than closing it', () => {
    // `unevaluatedProperties: false` answered "invalid" to two different
    // things - a typo'd kit prop and a name this harness has not classified
    // yet - and only the first is a mistake. The schema admits both and
    // annotates the classification; classifyProps is what tells them apart (see
    // "the props-classification report" below). `additionalProperties` was never
    // an option here for a different reason: it only sees its sibling
    // `properties`, so it would reject every forwarded attribute the moment a
    // validator composed the host element's surface in beside the contract.
    expect(contract.props.unevaluatedProperties).toEqual(OPEN_UNEVALUATED);
    expect(contract.props.unevaluatedProperties[CLASSIFICATION_KEY]).toBe('unchecked');
    expect(contract).not.toHaveProperty('additionalProperties');
  });

  it('extraction reported nothing it could not read', () => {
    expect(extraction.cannotExtract).toEqual([]);
  });

  it('files a React DOM attribute as forwarded surface and a Base UI part prop as this component\'s API', () => {
    // The filing rule, on the two props that make it visible. `disabled` is
    // declared by React's ButtonHTMLAttributes: it is the same attribute for
    // every component that renders a <button>, so it belongs to the element
    // surface and not to this contract. `nativeButton` is declared by Base
    // UI's own props for its Button part: it is Button's API, wearing Base
    // UI's declaration site as an accident of how the kit wraps it, so it
    // belongs in `properties` - filed as forwarded surface it was one of 233
    // entries in a generated file nobody read.
    expect(extraction.forwardedProps.map((p) => p.name)).toContain('disabled');
    expect(elementSurface.properties).toHaveProperty('disabled');
    expect(contract.props.properties).not.toHaveProperty('disabled');

    expect(extraction.apiProps.map((p) => p.name)).toContain('nativeButton');
    expect(contract.props.properties.nativeButton).toEqual({ type: 'boolean' });
  });

  it('gives an API prop the schema cannot type its TypeScript type, not an empty schema', () => {
    // The measured defect: an agent shown three unconstrained properties
    // concluded they took plain strings. `render` is a union of a React
    // element and a callback, so nothing can be asserted about it - what a
    // reader gets instead is the checker's own printed type, followed by the
    // overlay's own `prop_statements.render` entry (states/because), which the
    // compiler emits into the same description beside the `TS:` text.
    expect(contract.props.properties.render.type).toBeUndefined();
    expect(contract.props.properties.render.description).toMatch(/^TS: .*The compiler emits one JSON type per property; this type is left to tsc\./s);
    expect(contract.props.properties.render.description).toContain('ComponentRenderFn');
    expect(contract.props.properties.render.description).toContain('render replaces the rendered element with one the caller supplies');
  });

  it('terminates the authored statement before the reason that follows it', () => {
    // `states` is authored as a phrase and read inside a description that
    // continues with `because`, so without a terminator the two fragments run
    // together into one sentence that reads as neither. Asserted on the real
    // emission rather than on the helper, because the defect was in the join.
    const statements = contract.prop_statements ?? {};
    for (const [name, statement] of Object.entries(statements)) {
      expect(statement.states.trimEnd(), name).not.toMatch(/[.!?]$/);
      expect(contract.props.properties[name].description, name).toContain(`${statement.states}. ${statement.because}`);
    }
  });

  it("records only the kit's own slotted props in x-uikit.partially_typed_props, not every partly checked property", () => {
    // Two kinds of property go unchecked by the schema, and they are
    // documented in different places: `icon` is the kit's own slot and its
    // type lives in x-uikit.partially_typed_props, while `render`/`style` are
    // the primitive's API and their types live in their own descriptions plus
    // a `prop_statements` entry. Both are named by the pairing (see
    // testing.ts); only the first is the kit's own.
    expect(partlyCheckedPropertyNames(contract)).toEqual(['icon', 'render', 'style']);
    expect(Object.keys(contract['x-uikit'].partially_typed_props)).toEqual(['icon']);
  });

  it('classifies className as a declared prop, and keeps the narrower declaration', () => {
    // button.tsx redeclares `className?: string`, narrower than Base UI's
    // `string | ((state) => string)` union: this is a deliberate, kit-wide
    // convention (every component does it, see accordion.tsx), not an
    // accidental duplicate. The element surface declares `className` too, as
    // a plain string - the two agree, and the component's own declaration is
    // what the contract carries.
    expect(extraction.ownProps.map((p) => p.name)).toContain('className');
    expect(elementSurface.properties).toHaveProperty('className');
    expect(contract.props.properties.className).toEqual({ type: 'string' });
  });
});

describe('button props validation', () => {
  it('admits a typo in a kit prop rather than rejecting it', () => {
    // Deliberate, and the reason `unevaluatedProperties` is open: Ajv cannot
    // tell `variannt` from a React attribute this harness has not classified,
    // and answering "invalid" to both made the second unusable. The
    // classification of `variannt` is made by classifyProps below, which can see that
    // `variant` exists.
    const validate = compileValidator();
    expect(validate({ variannt: 'ghost' })).toBe(true);
  });

  it('accepts aria-*, data-* and className alongside valid kit props', () => {
    const validate = compileValidator();
    const props = {
      variant: 'ghost',
      size: 'sm',
      className: 'my-button',
      'aria-label': 'Delete item',
      'data-testid': 'delete-button',
    };
    expect(validate(props), new Ajv2020().errorsText(validate.errors)).toBe(true);
  });

  it('accepts the element surface and the primitive API side by side', () => {
    // `name`/`form`/`title` come from the hand-written <button> surface,
    // `render`/`nativeButton` from Base UI's own props for its Button part
    // and so from this contract's own properties. A consumer passing both at
    // once is the ordinary case, and the two halves have to compose.
    const validate = compileValidator();
    const props = {
      variant: 'default',
      name: 'confirm',
      form: 'checkout',
      render: () => null,
      nativeButton: true,
      title: 'Confirm the order',
    };
    expect(validate(props), new Ajv2020().errorsText(validate.errors)).toBe(true);
  });

  it('rejects a value the element surface does type, once the surface is composed in', () => {
    // The element surface is not decoration: `type` on a <button> is one of
    // three values, and a fourth fails even though the prop itself is
    // forwarded rather than declared by the kit. It fails through the
    // COMPOSITION - the validator resolved the reference the contract holds
    // and applied the surface beside it - not through the schema body, which
    // no longer merges the surface in. A validator that ignores the reference
    // gets the open classification instead, which is the honest answer for a reader
    // that never looked the surface up.
    const validate = compileValidator();
    expect(validate({ type: 'sumbit' })).toBe(false);
    const contractAlone = new Ajv2020();
    // The kit's own annotations, declared the one way every other Ajv
    // instance here declares them (compile.ts's ANNOTATION_KEYWORDS), so a
    // keyword added to that list does not have to be remembered again here.
    for (const keyword of ANNOTATION_KEYWORDS) contractAlone.addKeyword({ keyword });
    expect(contractAlone.compile(liftPropsSchema(contract))({ type: 'sumbit' })).toBe(true);
  });

  it('still rejects a value outside an axis enum', () => {
    // Closure is not the only assertion the schema carries; a real prop with
    // an impossible value has to fail too.
    const validate = compileValidator();
    expect(validate({ variant: 'plunger' })).toBe(false);
  });

  it('accepts a slot prop the schema cannot type', () => {
    // `icon` is a ReactNode: annotation-only in the schema, so it passes
    // instead of rejecting correct usage.
    const validate = compileValidator();
    expect(validate({ icon: 'anything', 'aria-label': 'Delete' })).toBe(true);
  });
});

describe('the props-classification report', () => {
  // What replaced closure. The schema admits every name; this is where a name
  // gets a classification, and it is the one that can make the distinction Ajv
  // cannot: a near-miss of a kit prop is an error, an unrecognized name is
  // merely unchecked.
  const surface = elementSurface as { properties?: Record<string, unknown>; patternProperties?: Record<string, unknown> };

  it('counts a kit prop, a forwarded attribute and a pattern match as known', () => {
    const report = classifyProps(
      { variant: 'ghost', nativeButton: true, disabled: true, 'aria-label': 'Delete', 'data-testid': 'x', onClick: () => {} },
      contract.props,
      surface,
    );
    expect(report.known).toEqual(['aria-label', 'data-testid', 'disabled', 'nativeButton', 'onClick', 'variant']);
    expect(report.unchecked).toEqual([]);
    expect(report.nearMiss).toEqual([]);
  });

  it('upgrades a one-edit miss of a kit prop to a near miss, naming what it is probably meant to be', () => {
    const report = classifyProps({ variannt: 'ghost' }, contract.props, surface);
    expect(report.unchecked).toEqual(['variannt']);
    expect(report.nearMiss).toEqual([{ prop: 'variannt', probably: 'variant' }]);
  });

  it('leaves an unrecognized name unchecked rather than calling it an error', () => {
    // `tooltip` is not one edit from any prop Button declares. The honest
    // answer is that nothing here checks it - which is a report, not a
    // refusal, and the distinction the open schema exists to preserve.
    const report = classifyProps({ tooltip: 'Delete' }, contract.props, surface);
    expect(report.unchecked).toEqual(['tooltip']);
    expect(report.nearMiss).toEqual([]);
  });

  it('does not call a near-miss of a forwarded DOM attribute an error', () => {
    // `classNam` is one edit from `className`, which the kit DOES declare, so
    // it is a near miss; `titl` is one edit from `title`, which only the
    // element surface declares - a typo in a DOM attribute is React's
    // business, not this contract's, and reporting it here would make the
    // report noisier than the thing it replaced.
    const nearOwn = classifyProps({ classNam: 'x' }, contract.props, surface);
    expect(nearOwn.nearMiss).toEqual([{ prop: 'classNam', probably: 'className' }]);
    const nearElement = classifyProps({ titl: 'x' }, contract.props, surface);
    expect(nearElement.unchecked).toEqual(['titl']);
    expect(nearElement.nearMiss).toEqual([]);
  });

  it('treats a withheld prop as unchecked, because the kit does not offer it', () => {
    // Accordion's root withholds `orientation`; Button withholds nothing, so this
    // checks the mechanism on the contract that has one - a withheld prop is
    // not in `properties`, so it lands in `unchecked` exactly like any other
    // name the contract does not account for.
    const accordion = compileContract('accordion');
    const report = classifyProps({ orientation: 'horizontal' }, accordion.props, undefined);
    expect(report.unchecked).toEqual(['orientation']);
  });
});

// A minimal overlay satisfying every metamodel constraint, used to isolate
// one failure at a time in the tests below - not Button's real overlay, so
// a change to button.contract.yaml can never make one of these tests fail
// for an unrelated reason.
const validOverlay: Overlay = {
  component: 'button',
  intent: 'Trigger a single action in the current context.',
  typical_uses: ['A one-off action with an immediate effect'],
  dont_use_when: [
    {
      situation: 'Navigation between routes or pages',
      instead: { target: 'NavigationMenu', component: 'gts.frontx.uikit._.component.v1~frontx.uikit._.navigation_menu.v1' },
    },
  ],
  accepts: { content: 'specified', text: true },
  invariants: [],
  anti_patterns: [],
  deprecations: {},
  attestations: { a11y: { outcome: 'unknown' }, rtl: { outcome: 'unknown' } },
  examples: {
    good: [{ title: 'Minimal use', code: '<Button />' }],
    bad: [{ title: 'Minimal misuse', code: '<Button />', why: 'placeholder reason' }],
  },
};

describe('overlay and extraction safety', () => {
  it('accepts a well-formed overlay unchanged', () => {
    expect(parseOverlay('button', validOverlay)).toEqual(validOverlay);
  });

  it('rejects an overlay with an unknown key, naming the key and the component', () => {
    const withUnknownKey = { ...validOverlay, typo_field: 'nope' };
    expect(() => parseOverlay('button', withUnknownKey)).toThrow('typo_field');
    expect(() => parseOverlay('button', withUnknownKey)).toThrow('button');
  });

  it('accepts a recommendation the kit ships no component for', () => {
    // `component` is optional and its ABSENCE is the statement: a rule whose
    // honest answer is "not a component of this kit" no longer has to name the
    // nearest kit component to satisfy a required reference.
    const outside = {
      ...validOverlay,
      dont_use_when: [{ situation: 'Navigation between routes or pages', instead: { target: "the consuming app's link component" } }],
    };
    expect(parseOverlay('button', outside)).toEqual(outside);
  });

  it('rejects a recommendation that does not say what to use', () => {
    // A `note` alone is a reason with no next move - the same gap a "don't"
    // without an "instead" leaves, one level down.
    const reasonOnly = {
      ...validOverlay,
      dont_use_when: [{ situation: 'Navigation between routes or pages', instead: { note: 'the kit ships no Link component' } }],
    };
    expect(() => parseOverlay('button', reasonOnly)).toThrow(/target/);
  });

  it('rejects an overlay that restates a machine-owned field, by name', () => {
    // `variants` (plural, matching the cva config the compiler extracts) is
    // the exact typo F9 caught: an overlay author reaching for the wrong
    // key silently lost the field instead of failing to compile.
    const withMachineOwnedKey = { ...validOverlay, variants: {} };
    expect(() => parseOverlay('button', withMachineOwnedKey)).toThrow(/machine-owned field\(s\): variants/);
  });

  it('rejects an overlay whose component field does not match the directory', () => {
    const wrongComponent = { ...validOverlay, component: 'not-button' };
    expect(() => parseOverlay('button', wrongComponent)).toThrow(/"not-button".*"button"/s);
  });

  // A synthetic extraction, not a fixture component under src/components:
  // the element-surface conflict check only needs a ComponentExtraction
  // shape, and this keeps the test next to the assertion instead of in a
  // directory a reviewer has to go find. `disabled` is chosen because the
  // hand-written <button> surface really does declare it as a boolean.
  function syntheticExtraction(
    ownProps: ComponentExtraction['ownProps'],
    apiProps: ComponentExtraction['apiProps'] = [],
  ): ComponentExtraction {
    return {
      name: 'Button',
      axes: {},
      booleanAxes: [],
      defaults: {},
      propDefaults: {},
      ownProps,
      apiProps,
      forwardedProps: [],
      unclassifiedProps: [],
      elementKind: 'button',
      hasBody: true,
      variantSourceLabels: [],
      cannotExtract: [],
    };
  }

  it('rejects a declared prop whose type conflicts with the element surface, naming both locations', () => {
    const conflicting = syntheticExtraction([
      { name: 'disabled', optional: true, typeText: 'string', declarationFile: 'button.tsx', expressed: { schema: { type: 'string' }, complete: true } },
    ]);
    expect(() => buildPropsAndRequired('button', conflicting, elementSurface)).toThrow(
      /"disabled".*button\.tsx.*asserts \{"type":"string"\}.*element surface's \{"type":"boolean"\}/s,
    );
  });

  it('rejects a cva axis whose enum conflicts with the element surface, naming both shapes', () => {
    // The axes reached `properties` without ever passing the agreement
    // check: an axis named `type` on a component rendering a <button>
    // compiled cleanly beside the surface's own three-value enum, and a
    // validator resolving the reference then accepted only the intersection
    // of the two, which is empty.
    const axisConflict: ComponentExtraction = {
      ...syntheticExtraction([]),
      axes: { type: ['ghost', 'solid'] },
    };
    expect(() => buildPropsAndRequired('button', axisConflict, elementSurface)).toThrow(
      /"type".*cva axis.*asserts \{"type":"string","enum":\["ghost","solid"\]\}.*element surface's \{"type":"string","enum":\["submit","reset","button"\]\}/s,
    );
  });

  it('lets an axis win over an API prop of the same name, and a declared prop win over the axis', () => {
    // The precedence rule spelled out: DECLARED > AXIS > API. An API prop
    // shadowed by an axis loses its shape AND its requiredness, because
    // VariantProps types every axis optional and that is the type a caller
    // is compiled against; a declared prop overwrites the axis outright.
    const axisOverApi: ComponentExtraction = {
      ...syntheticExtraction([], [
        { name: 'tone', optional: false, typeText: 'string', declarationFile: '@base-ui/react/internals/types.d.mts', expressed: { schema: { type: 'string' }, complete: true } },
      ]),
      axes: { tone: ['muted', 'loud'] },
    };
    const fromAxis = buildPropsAndRequired('button', axisOverApi, elementSurface);
    expect(fromAxis.properties.tone).toEqual({ type: 'string', enum: ['muted', 'loud'] });
    expect(fromAxis.required).toEqual([]);

    const declaredOverAxis: ComponentExtraction = {
      ...syntheticExtraction([
        { name: 'tone', optional: true, typeText: '"muted" | undefined', declarationFile: 'button.tsx', expressed: { schema: { type: 'string', enum: ['muted'] }, complete: true } },
      ]),
      axes: { tone: ['muted', 'loud'] },
    };
    const fromDeclaration = buildPropsAndRequired('button', declaredOverAxis, elementSurface);
    expect(fromDeclaration.properties.tone).toEqual({ type: 'string', enum: ['muted'] });
  });

  it('keeps a declared prop that agrees with the element surface, rather than deferring to it', () => {
    // The declaration is the more specific one and the contract carries it:
    // a validator that composes the host element's surface in applies both to
    // the same value, so agreement is all that is required, and a reader of
    // `properties` sees every prop the component declares.
    const agreeing = syntheticExtraction([
      { name: 'disabled', optional: true, typeText: 'boolean | undefined', declarationFile: 'button.tsx', expressed: { schema: { type: 'boolean' }, complete: true } },
    ]);
    const { properties, required } = buildPropsAndRequired('button', agreeing, elementSurface);
    expect(properties.disabled).toEqual({ type: 'boolean' });
    expect(required).toEqual([]);
  });

  it('rejects an API prop whose type conflicts with the element surface, naming its declaration file', () => {
    const conflicting = syntheticExtraction([], [
      { name: 'type', optional: true, typeText: 'boolean', declarationFile: '@base-ui/react/internals/types.d.mts', expressed: { schema: { type: 'boolean' }, complete: true } },
    ]);
    expect(() => buildPropsAndRequired('button', conflicting, elementSurface)).toThrow(
      /"type".*@base-ui\/react\/internals\/types\.d\.mts.*element surface/s,
    );
  });

  it('leaves a withheld API prop out of properties without touching the declared ones', () => {
    const extraction = syntheticExtraction(
      [{ name: 'loading', optional: true, typeText: 'boolean | undefined', declarationFile: 'button.tsx', expressed: { schema: { type: 'boolean' }, complete: true } }],
      [
        { name: 'nativeButton', optional: true, typeText: 'boolean | undefined', declarationFile: '@base-ui/react/internals/types.d.mts', expressed: { schema: { type: 'boolean' }, complete: true } },
        { name: 'render', optional: true, typeText: 'ReactElement', declarationFile: '@base-ui/react/internals/types.d.mts', expressed: undefined },
      ],
    );
    const { properties } = buildPropsAndRequired('button', extraction, elementSurface, ['render']);
    expect(Object.keys(properties).sort()).toEqual(['loading', 'nativeButton']);
  });

  // M11: this cross-check used to live only in the "overlay references only
  // props that exist in code" test above, exercised against Button's own
  // real compile - it now runs inside compile.ts's own compileContract for
  // every component (see "overlay references only props that exist in
  // code" above still passing, unchanged, as the positive control). These
  // two are the negative controls, proving the check actually rejects a
  // stale reference rather than merely never having been triggered yet -
  // Accordion and DataTable get this for free from the same compileContract
  // call, with no per-component test of their own required.
  it('rejects an overlay whose deprecations.props references a prop that does not exist', () => {
    const staleOverlay: Overlay = {
      ...validOverlay,
      deprecations: { props: { ghost: { since: '1.0.0', replacement: 'variant', hint: 'use variant instead' } } },
    };
    const extraction = syntheticExtraction([]);
    expect(() => assertOverlayReferencesRealProps('button', staleOverlay, extraction)).toThrow(
      /deprecations\.props references "ghost"/,
    );
  });

  it('rejects an overlay whose accepts.icons_via references a prop that does not exist', () => {
    const staleOverlay: Overlay = {
      ...validOverlay,
      accepts: { content: 'specified', text: true, icons_via: 'ghostIcon' },
    };
    const extraction = syntheticExtraction([]);
    expect(() => assertOverlayReferencesRealProps('button', staleOverlay, extraction)).toThrow(
      /accepts\.icons_via references "ghostIcon"/,
    );
  });

  it('rejects a deprecation whose own replacement references a prop that does not exist', () => {
    // The seventh prop-name-bearing field, and the one the type-system
    // review found unchecked: a deprecation whose `replacement` does not
    // exist leaves the caller with no next move, the same failure the
    // vocabulary description already argues `replacement` exists to
    // prevent - the key itself ("oldProp") is real here, so this proves the
    // SECOND half of the entry is checked too, not merely the first.
    const extraction = syntheticExtraction([
      { name: 'oldProp', optional: true, typeText: 'string', declarationFile: 'button.tsx', expressed: { schema: { type: 'string' }, complete: true } },
    ]);
    const staleOverlay: Overlay = {
      ...validOverlay,
      deprecations: { props: { oldProp: { since: '1.0.0', replacement: 'ghostReplacement', hint: 'use ghostReplacement instead' } } },
    };
    expect(() => assertOverlayReferencesRealProps('button', staleOverlay, extraction)).toThrow(
      /deprecations\.props\."oldProp"\.replacement references "ghostReplacement"/,
    );
  });

  it("accepts the kit's own attestation claims and rejects one not in the registry", () => {
    // propertyNames' pattern in the trait schema only checks a claim key's
    // SHAPE (lowercase, snake_case) - a typo of a real claim (`ally` beside
    // `a11y`) is well-formed by that rule and would compile clean without
    // this check.
    expect(() => assertKnownAttestationClaims('button', { ...validOverlay, attestations: { a11y: { outcome: 'unknown' }, rtl: { outcome: 'unknown' } } })).not.toThrow();
    expect(() => assertKnownAttestationClaims('button', { ...validOverlay, attestations: { ally: { outcome: 'unknown' } } })).toThrow(
      /attestation claim "ally" is not in the claim list/,
    );
  });

  it('rejects accepts.icons_via when content is not "specified"', () => {
    // icons_via is a fact about WHAT is specified to appear inside, so it
    // makes no sense beside "nothing may appear inside" (content: nothing)
    // or "whatever the consumer puts in it, unexamined" (content:
    // unconstrained) - both used to compile clean carrying it.
    expect(() => parseOverlay('button', { ...validOverlay, accepts: { content: 'nothing', icons_via: 'icon' } })).toThrow(
      /accepts/,
    );
    expect(() => parseOverlay('button', { ...validOverlay, accepts: { content: 'unconstrained', icons_via: 'icon' } })).toThrow(
      /accepts/,
    );
    // The positive control: `content: specified` alongside `icons_via` is
    // exactly what button.contract.yaml itself authors, and stays legal.
    expect(() => parseOverlay('button', { ...validOverlay, accepts: { content: 'specified', text: true, icons_via: 'icon' } })).not.toThrow();
  });

  it('accepts an authored contract major, and rejects one that is not a version', () => {
    // Per-component, because moving it is the one acknowledgement the
    // compatibility check accepts for a narrowing: read off a kit-wide
    // constant, taking that escape hatch meant rewriting every identifier in
    // the kit at once. Absent means 1, which is what every described
    // component carries today.
    expect(parseOverlay('button', { ...validOverlay, major: 2 })).toEqual({ ...validOverlay, major: 2 });
    expect(parseOverlay('button', validOverlay).major).toBeUndefined();
    for (const major of [0, -1, 1.5, '2']) {
      expect(() => parseOverlay('button', { ...validOverlay, major }), String(major)).toThrow(/major/);
    }
  });

  it('declares the major on the overlay schema and not on the component type', () => {
    // The major is not a FIELD of a component - it is part of the identifier
    // the component carries - so declaring it in both places would be one
    // fact written twice with nothing keeping the two in step.
    expect(buildOverlaySchema().properties).toHaveProperty('major');
    expect(buildComponentType().properties).not.toHaveProperty('major');
  });

  it('rejects an overlay that writes a component reference in mounted_in.component, pointing at what fills it', () => {
    // Filled from every other contract's accepted components, so an authored
    // copy is a second writable statement of one fact - the shape that let a
    // part name a parent whose own accepted list did not name it back.
    // `mount_point` is one shape now (no more bare-string form): the
    // authored half writes `container` (+ `note`) and must not write
    // `component` at all.
    const authoredMount = {
      ...validOverlay,
      mounted_in: [{ container: 'Card', component: 'gts.frontx.uikit._.component.v1~frontx.uikit._.card.v1' }],
    };
    expect(() => parseOverlay('button', authoredMount)).toThrow(/mounted_in\.component.*FILLS.*accepts\.components/s);
  });

  it('rejects an overlay that writes a container outside the kit with no reason', () => {
    // Both halves of an outside mount are required: the container is what a
    // reader acts on, and the note is why no kit component fits - which is the
    // whole reason the shape exists rather than the nearest component standing
    // in for one.
    const containerOnly = { ...validOverlay, mounted_in: [{ container: "a column's header render function" }] };
    expect(() => parseOverlay('button', containerOnly)).toThrow(/note/);
  });

  it('rejects an overlay that writes a family root\'s member list', () => {
    // Filled on the root from every contract naming the same family as a
    // part: membership is one statement each member makes about itself.
    const authoredMembers = {
      ...validOverlay,
      family_membership: {
        name: 'button',
        role: 'root',
        members: ['gts.frontx.uikit._.component.v1~frontx.uikit._.card.v1'],
      },
    };
    expect(() => parseOverlay('button', authoredMembers)).toThrow(/family_membership\.members.*FILLS/s);
  });

  it('rejects accepted components or text without content: specified', () => {
    // The one contradiction the vocabulary refuses outright: `content` already
    // answered the question for `unconstrained` and `nothing`, so detail
    // beside either says both that nothing may appear inside and that
    // something may.
    for (const accepts of [
      { content: 'nothing', text: true },
      { content: 'unconstrained', components: ['gts.frontx.uikit._.component.v1~frontx.uikit._.card.v1'] },
    ]) {
      expect(() => parseOverlay('button', { ...validOverlay, accepts }), JSON.stringify(accepts)).toThrow(/accepts/);
    }
    // And the mirror: `specified` with no detail says nothing at all.
    expect(() => parseOverlay('button', { ...validOverlay, accepts: { content: 'specified' } })).toThrow(/accepts/);
  });

  it('rejects a withheld name the primitive underneath does not declare', () => {
    const stale: Overlay = { ...validOverlay, withheld: [{ prop: 'orientaton', reason: 'placeholder' }] };
    const extraction = syntheticExtraction([], [
      { name: 'orientation', optional: true, typeText: 'string', declarationFile: '@base-ui/react/internals/types.d.mts', expressed: { schema: { type: 'string' }, complete: true } },
    ]);
    expect(() => assertOverlayReferencesRealProps('button', stale, extraction)).toThrow(/withholds "orientaton"/);
  });

  it("rejects withholding a prop the component declares itself", () => {
    // A different mistake from the one above, and it gets a different
    // refusal: withholding is for a prop of the primitive the kit does not
    // advertise, never for what the component's own source states.
    const stale: Overlay = { ...validOverlay, withheld: [{ prop: 'loading', reason: 'placeholder' }] };
    const extraction = syntheticExtraction([
      { name: 'loading', optional: true, typeText: 'boolean', declarationFile: 'button.tsx', expressed: { schema: { type: 'boolean' }, complete: true } },
    ]);
    expect(() => assertOverlayReferencesRealProps('button', stale, extraction)).toThrow(/declares itself/);
  });

  it('rejects a prop statement naming a prop that does not exist', () => {
    // `prop_statements` is keyed on the property itself (the dissolved
    // `untyped` catch-all's `about: prop` category moved one level closer to
    // what it is about), which structurally rules out the two failure modes
    // the old flat list needed separate refusals for: a statement naming no
    // prop (there is no key-less entry to write), and a statement about
    // something other than a prop (there is no `about` to mis-set). A bogus
    // KEY is the one thing left to check.
    const stale: Overlay = {
      ...validOverlay,
      prop_statements: { ghostIcon: { states: 'placeholder', because: 'placeholder' } },
    };
    const extraction = syntheticExtraction([]);
    expect(() => assertOverlayReferencesRealProps('button', stale, extraction)).toThrow(
      /overlay prop_statements references "ghostIcon"/,
    );
  });
});

describe('M3: assembled output validated against its own schema before writing', () => {
  it('accepts a value that satisfies the given schema', () => {
    const schema = { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'], additionalProperties: false };
    expect(() => assertValidatesAgainst('button', 'test-value', schema, { ok: true })).not.toThrow();
  });

  it('rejects a value that does not satisfy the given schema, naming the component and what was validated', () => {
    const schema = { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'], additionalProperties: false };
    expect(() => assertValidatesAgainst('button', 'test-value', schema, { ok: 'nope' })).toThrow(
      /button: assembled test-value failed schema validation/,
    );
  });

  it('drops a genuinely-unset field (JSON round-trip) rather than validating it as `undefined`', () => {
    // The exact reason compileContract round-trips through JSON before
    // validating (see testing.ts's validateContractInstance for the same rule
    // applied to a committed document): an own key set to `undefined` must
    // read as absent, not as a value to type-check.
    const schema = { type: 'object', properties: { maybe: { type: ['string', 'null'] } }, additionalProperties: false };
    expect(() => assertValidatesAgainst('button', 'test-value', schema, { maybe: undefined })).not.toThrow();
  });
});

describe('button as a component instance', () => {
  it('validates against the committed component type', () => {
    const ajv = new Ajv2020();
    // The component type reaches most of its shape through references to the
    // vocabulary types, and declares GTS's own reference annotation on the
    // fields that hold an id.
    addContractTypes(ajv);
    const validate = ajv.compile(committedComponentType);
    expect(validate(JSON.parse(JSON.stringify(contract))), ajv.errorsText(validate.errors)).toBe(true);
  });

  it("carries the compiler's METAMODEL_VERSION, not a free-form string", () => {
    expect(contract.metamodel).toBe(METAMODEL_VERSION);
  });

  it('the committed ui-component.meta.json equals a fresh build from ids.ts', () => {
    // buildComponentType() is what validates the document above; this asserts
    // the human-readable copy committed next to it has not drifted - the
    // failure mode this closes is a hand-edited pattern string in the JSON
    // file disagreeing with what ids.ts builds.
    expect(committedComponentType).toEqual(buildComponentType());
  });

  it('lifts a props type whose id names the component and its major', () => {
    // The props surface carries no identifier inside the document, so that
    // the document holds exactly one. The lift is where the props TYPE id
    // comes back, derived from the document's own id rather than passed
    // alongside it.
    expect(liftPropsSchema(contract).$id).toBe(propsSchemaId('button', 1));
  });

  it("recommends something outside the kit for the navigation rule, and names no component for it", () => {
    // The kit ships no Link component. While `instead` could only be a
    // component reference, this rule pointed at NavigationMenu as a stand-in,
    // and agents reading the contract opened NavigationMenu for a single link
    // - a resolver had no way to tell a real recommendation from a
    // placeholder. The absence of `component` is now that statement.
    const navigation = contract.dont_use_when.find((entry) => entry.situation === 'Navigation between routes or pages');
    if (navigation === undefined) throw new Error("Button's navigation rule is gone");
    expect(navigation.instead.target).toMatch(/link component/);
    expect(navigation.instead.component).toBeUndefined();
  });

  it('every good example is syntactically valid TSX', () => {
    // Syntax only. Real CI runs these through a tsc program against the kit's
    // own declarations, which also catches a prop that does not exist or has
    // the wrong type; that needs the built .d.ts, so the demo stops at parse.
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

describe('a component reference names one contract major', () => {
  // Negative control for the shared suite's reference check
  // (assertContractFreshness, testing.ts), which every described component
  // runs against its own references. A reference carries the major it was
  // written against; when a component moves its major, a referrer left
  // behind names a type the kit no longer ships, and the resolver is what
  // makes that visible rather than the name alone matching.
  it('resolves a reference to the contract that ships at exactly that id', () => {
    const target = resolveComponentRef(componentRef('button', contractMajor('button')));
    expect(target.directory).toBe('button');
    expect(target.contractId).toBe(bareGtsId(contract.$id));
  });

  it('does not accept a reference at a major the component does not ship', () => {
    const stale = componentRef('button', contractMajor('button') + 1);
    const target = resolveComponentRef(stale);
    expect(target.contractId).not.toBe(stale);
  });

  // A component a `don't` rule points at may have no contract yet; the kit
  // shipping the component is a directory, not a registration. The example
  // is picked at test time, so enrolling any one component never breaks the
  // case, and it is skipped once every directory ships a contract.
  const undescribed = readdirSync(COMPONENTS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .find((name) => !readdirSync(join(COMPONENTS_DIR, name)).includes(`${name}.contract.json`));

  it.skipIf(undescribed === undefined)('resolves a component that ships no contract to its directory alone', () => {
    // A component that ships no contract has no overlay to state a major, so
    // a reference to one may only name major 1 - see testing.ts's own check.
    const directory = undescribed as string;
    const target = resolveComponentRef(componentRef(directory, 1));
    expect(target.directory).toBe(directory);
    expect(target.contractId).toBeUndefined();
  });
});

// The fields the component type requires of every component, read out of the
// committed schema: a test that restated the list would go on asserting a
// field the schema no longer names.
function requiredFields(schema: Record<string, unknown>): string[] {
  const required = schema.required;
  return isStringArray(required) ? required : [];
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

describe('button in a GTS store', () => {
  // Ajv above checks the document against the type as JSON Schema. This
  // checks it as GTS: registering a document is silent about whether the type
  // it claims exists, so the claim would stay unverified until something
  // happened to resolve it at runtime. GTS.validateInstance resolves the type
  // and validates against it, which turns that into a build-time failure.
  // The vocabulary the component type references is registered with it. A
  // store missing one of them cannot compile the type at all - see "fails
  // when a vocabulary type is not registered" below, which is that failure
  // asserted deliberately.
  function registeredStore(): GTS {
    return unitStore([{ contract, elementSurface }], { componentType });
  }

  it('validates as an instance of the component type, and its element surface as a type', () => {
    const gts = registeredStore();
    const asInstance = gts.validateInstance(contract.$id);
    expect(asInstance.ok, asInstance.error).toBe(true);
    const asType = gts.validateEntity(bareGtsId(ELEMENT_TYPE_ID));
    expect(asType.ok, asType.error).toBe(true);
    expect(asType.entity_type).toBe('schema');
  });

  it('fails when the component type is not registered', () => {
    // Negative control for the check above: without it, a passing
    // validateInstance would prove nothing about whether the type resolves.
    const gts = unitStore([{ contract, elementSurface }], { componentType: false, vocabulary: false });
    const result = gts.validateInstance(contract.$id);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Schema not found');
  });

  it('requires every field the component type requires, and names the one that is missing', () => {
    // Which fields those are is read out of the committed type rather than
    // listed here, so adding or dropping a required field cannot leave this
    // test asserting a field the type stopped naming. `$id` is skipped: a
    // document without one is not this component at all, so there is nothing
    // to look up and the failure is "entity not found" rather than a
    // validation error naming the field.
    const required = requiredFields(componentType).filter((field) => field !== '$id');
    expect(required.length).toBeGreaterThan(0);
    for (const field of required) {
      const stripped = JSON.parse(JSON.stringify(contract)) as Record<string, unknown>;
      delete stripped[field];
      const result = validateContractInstance(stripped as unknown as CompiledContract);
      expect(result.ok, `dropping ${field} still validated`).toBe(false);
      expect(result.error, `dropping ${field} did not name it`).toContain(field);
    }
  });

  it("fails when the surface the component's forwards_to names is absent from the registry", () => {
    // Negative control for the one reference gts-ts resolves itself. It sits
    // directly on a document property, which is as deep as
    // XGtsRefValidator's walk goes, so the surface a component names is
    // resolved by the registry and not only by the conformance suite - a
    // claim worth a failing case, because a reference nested inside a meaning
    // field's value object is never reached by that walk.
    const gts = registeredKitStore();
    const orphaned = JSON.parse(JSON.stringify(contract)) as Record<string, unknown>;
    orphaned.forwards_to = elementTypeRef('dom_nope');
    gts.register(orphaned);
    const result = gts.validateInstance(contract.$id);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('not found in registry');
  });

  it('fails when a vocabulary type the component type references is not registered', () => {
    // Negative control for registeredStore's own registration: the component
    // type names its concepts by reference, so a registry missing one has not
    // checked a component against a smaller schema - it has not checked it at
    // all, and says so.
    const gts = unitStore([{ contract, elementSurface }], { componentType, vocabulary: false });
    const result = gts.validateInstance(contract.$id);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/resolve|reference/i);
  });

  it('validates the whole document against the committed component type', () => {
    // validateContractInstance (testing.ts) documents which gts-ts API this
    // goes through: GTS.validateInstance, which finds the type through the
    // document's own id chain, compiles it with Ajv, and then walks the
    // document for the references that sit directly on a property.
    const result = validateContractInstance(contract);
    expect(result.ok, result.error).toBe(true);
  });

  it('rejects a component carrying a malformed dont_use_when.instead', () => {
    // Negative control: an earlier review round flagged that a broken meaning
    // block registered silently under an undifferentiated annotation -
    // nothing validated it. An `instead` that is not a grammatical component
    // reference fails the instance check instead of passing as an untyped
    // string.
    const corrupted: CompiledContract = {
      ...contract,
      dont_use_when: [{ situation: 'placeholder', instead: { target: 'anything', component: 'not-a-gts-id' } }],
    };
    const result = validateContractInstance(corrupted);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/pattern/i);
  });

  it('rejects a component carrying an unknown key', () => {
    // The closure is an ordinary content-model decision now rather than a
    // condition of the trait machinery, and it still refuses by name...
    const corrupted = { ...contract, bogus_field: true } as CompiledContract;
    const result = validateContractInstance(corrupted);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/additional propert/i);
  });
});
