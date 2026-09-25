// Compiler unit tests for the one rule that decides how a prop the
// provider-safe subset cannot express reaches a reader: it is described, not
// left blank.
//
// The defect this suite pins down was found by reading the compiled
// artifacts as an agent would. The accordion root's `value`, `defaultValue`
// and `onValueChange` were each the literal `{}` - and an empty schema in a
// props contract reads as "anything goes", so the reader concluded `value`
// and `defaultValue` were plain strings when their real type is
// `AccordionValue<Value>`. Nothing in the harness was wrong about the TYPE;
// the compiler simply had nowhere to put it once extract.ts's expressType
// returned undefined.
//
// Compiled from a real extraction rather than a synthetic
// ComponentExtraction: the whole point is that the type text a reader ends
// up with is the checker's own printed type, so a hand-written typeText
// would test the string formatting and nothing else.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import Ajv2020 from 'ajv/dist/2020';
import { parse as parseYaml } from 'yaml';
import { describe, expect, it } from 'vitest';

import { classifyProps, diffOwnPropsSchema } from './check-lib';
import {
  addContractTypes,
  assertHostElementStatement,
  assertOverlayReferencesRealProps,
  buildComponentType,
  buildFamilyRoster,
  buildOverlaySchema,
  buildPropsAndRequired,
  buildVocabularyTypes,
  closedFamiliesOf,
  collectOverlays,
  compileContractFrom,
  describeBranches,
  describeUnexpressedType,
  exportNameOf,
  findUntypedPropMismatches,
  groupCoverage,
  groupPattern,
  leavesTypeToTsc,
  listedNames,
  mountPointsAccepting,
  loadElementSurface,
  loadElementSurfaces,
  noHostElementRefusal,
  overlayFailuresMentioning,
  parseOverlay,
  partlyCheckedPropertyNames,
  resolveTargetExtraction,
  sharedAttributeConflicts,
  type CompiledContract,
} from './compile';
import { extractComponent } from './extract';
import { componentRef, componentRefPrefix, vocabularyTypeId } from './ids';
import { applyContractTestTimeout, mountPointsOutsideFamily } from './testing';

// This suite builds a real TypeScript program through extractComponent -
// several seconds on a CI-class runner. Must run before any
// describe()/it() in the file; see applyContractTestTimeout's own comment in
// testing.ts.
applyContractTestTimeout();

const fixture = (name: string) => join(process.cwd(), 'scripts/contracts/__fixtures__', name);

const [picker] = extractComponent(fixture('untypeable-props.fixture.tsx'));
const elementSurface = loadElementSurface('div');

describe('the hand-written element surface', () => {
  const properties = elementSurface.properties as Record<string, { type?: string; description?: string }>;

  it('states the TypeScript type of every attribute it cannot assert', () => {
    // `style` and `children` are the two React attributes no JSON Schema
    // type covers, so each carries its TypeScript type rather than `{}`.
    expect(properties.style.type).toBeUndefined();
    expect(properties.style.description).toContain('TS: CSSProperties');
    expect(properties.children.description).toContain('TS: ReactNode');
  });

  it('types the attributes it can, rather than describing everything', () => {
    expect(properties.className).toEqual({ type: 'string' });
    expect(properties.tabIndex).toEqual({ type: 'number' });
  });

  it('leaves no property schema empty, in any committed surface', () => {
    // Driven from the committed set rather than from `div` alone: the rule
    // is about every surface a contract can name, and a file written next
    // week is exactly the one nobody would remember to name here.
    const empty = loadElementSurfaces().flatMap((surface) => {
      const declarations = {
        ...(surface.properties as Record<string, Record<string, unknown>>),
        ...(surface.patternProperties as Record<string, Record<string, unknown>>),
      };
      return Object.entries(declarations)
        .filter(([, schema]) => Object.keys(schema).length === 0)
        .map(([name]) => `${String(surface.$id)}: ${name}`);
    });
    expect(empty).toEqual([]);
  });

  it('admits the aria-, data- and event-handler families by pattern rather than by name', () => {
    expect(Object.keys(elementSurface.patternProperties as Record<string, unknown>).sort()).toEqual(['^aria-', '^data-', '^on[A-Z]']);
  });
});

describe('the surfaces for <img> and <option>', () => {
  const img = loadElementSurface('img').properties as Record<string, { type?: string; enum?: string[] }>;

  it("states the img element's own attributes, the enumerated ones as enums", () => {
    expect(img.loading).toEqual({ type: 'string', enum: ['eager', 'lazy'] });
    expect(img.decoding).toEqual({ type: 'string', enum: ['async', 'auto', 'sync'] });
    expect(img.crossOrigin).toEqual({ type: 'string', enum: ['', 'anonymous', 'use-credentials'] });
    expect(img.referrerPolicy?.enum).toContain('strict-origin-when-cross-origin');
    for (const name of ['srcSet', 'sizes']) expect(img[name], name).toEqual({ type: 'string' });
  });

  it('leaves children out of the img surface, since a void element cannot take any', () => {
    expect(Object.keys(img)).not.toContain('children');
  });

  it("states the option element's label", () => {
    expect((loadElementSurface('option').properties as Record<string, unknown>).label).toEqual({ type: 'string' });
  });

  it('says of a union of JSON types that the compiler left it to tsc, not that JSON Schema cannot state it', () => {
    const union = /^TS: (?:string|number|boolean|readonly string\[\])(?: \| (?:string|number|boolean|readonly string\[\]))+\./;
    let matched = 0;
    for (const surface of loadElementSurfaces()) {
      for (const [name, schema] of Object.entries(surface.properties as Record<string, { description?: string }>)) {
        if (schema.description === undefined || !union.test(schema.description)) continue;
        matched += 1;
        expect(schema.description, `${String(surface.$id)} ${name}`).toContain('The compiler emits one JSON type per property');
        expect(schema.description, `${String(surface.$id)} ${name}`).not.toContain('Not expressible');
      }
    }
    // `value` and img's `width`/`height` are such unions today; a pattern
    // that stopped matching them would pass this test by checking nothing.
    expect(matched).toBeGreaterThan(0);
  });
});

describe('an enum the element surface also declares', () => {
  const extractions = extractComponent(fixture('button-type-enum.fixture.tsx'));
  const buttonSurface = loadElementSurface('button');

  it('agrees with the surface as a set, whatever order either side lists the values in', () => {
    // The surface writes `type` as submit, reset, button; the extractor
    // sorts. Compared as written, the two were reported as a conflict over
    // the one prop they agree about.
    const action = extractions.find((e) => e.name === 'Action')!;
    const { properties } = buildPropsAndRequired('action', action, buttonSurface);
    // `default` is the one the component writes, `type = 'button'`.
    expect(properties.type).toEqual({ type: 'string', enum: ['button', 'reset', 'submit'], default: 'button' });
  });

  it('still refuses an enum whose values differ from the surface, naming the prop', () => {
    const narrow = extractions.find((e) => e.name === 'NarrowAction')!;
    expect(() => buildPropsAndRequired('narrow-action', narrow, buttonSurface)).toThrow(/prop "type".*one prop, one\s+shape/s);
  });
});

describe('what two element kinds both declare', () => {
  it('is declared identically by every committed surface', () => {
    // The files are hand-written, so nothing constructs this agreement: the
    // global attributes (className, id, style, title, role, tabIndex, and
    // children in every surface but the void <img>'s) and the three
    // patterns are typed out per file. The
    // compatibility check reads a difference between two surfaces as a
    // narrowing a consumer feels, which is only true while what they share
    // they state the same way.
    expect(sharedAttributeConflicts(loadElementSurfaces())).toEqual([]);
  });

  it('names the attribute when two kinds disagree about it', () => {
    // The refusal the compile gives: by attribute name, with both sides, so
    // the answer is which file to fix rather than that something is wrong.
    const conflicts = sharedAttributeConflicts([
      { $id: 'a', properties: { tabIndex: { type: 'number' } } },
      { $id: 'b', properties: { tabIndex: { type: 'string' } }, patternProperties: { '^data-': {} } },
    ]);
    expect(conflicts).toEqual(['"tabIndex": a declares {"type":"number"}, b declares {"type":"string"}']);
  });

  it('is silent about an attribute only one kind declares', () => {
    const conflicts = sharedAttributeConflicts([
      { $id: 'a', properties: { disabled: { type: 'boolean' } } },
      { $id: 'b', properties: { href: { type: 'string' } } },
    ]);
    expect(conflicts).toEqual([]);
  });
});

describe('a declared prop the schema cannot state in full', () => {
  const { properties, partiallyTypedProps } = buildPropsAndRequired("picker", picker, elementSurface);

  it('states the kind it can, and the rest next to the slot record that holds it', () => {
    // `selection: Value[]` depends on the component's own type parameter -
    // the same shape as the accordion root's `AccordionValue<Value>`, just
    // arriving through an own prop. It is checkably an array; what is in it
    // is checked by tsc alone, which is what the slot record and the prose
    // beside it are for.
    expect(properties.selection.type).toBe('array');
    expect(properties.selection.items).toBeUndefined();
    expect(properties.selection.description).toContain('Value[]');
    expect(partiallyTypedProps.selection.typeText).toBe('Value[]');
  });

  it('types an alias that unwraps to an array of a stated element type, and leaves it undescribed', () => {
    // The type is read, not its printed name: the alias name matches no
    // keyword, and the array of strings behind it is stated in full.
    expect(properties.chosen).toEqual({ type: 'array', items: { type: 'string' } });
    expect(partiallyTypedProps.chosen).toBeUndefined();
  });

  it('describes a function prop, which is a type it can state nothing about', () => {
    expect(properties.onSelectionChange.type).toBeUndefined();
    expect(properties.onSelectionChange.description).toContain('(next: Value[]) => void');
  });

  it('leaves a typed own prop typed and undescribed', () => {
    expect(properties.label).toEqual({ type: 'string' });
  });

  it('carries no module specifier into any property description', () => {
    const leaking = Object.entries(properties).filter(([, schema]) => schema.description?.includes('import(') === true);
    expect(leaking.map(([name]) => name)).toEqual([]);
  });
});

describe('describeUnexpressedType', () => {
  it('describes a type the schema states nothing about', () => {
    expect(describeUnexpressedType({}, 'Value[]', false)).toEqual({
      description: 'TS: Value[]. The compiler emits one JSON type per property; this type is left to tsc.',
    });
  });

  it('names the compiler rule rather than a limit of JSON Schema, which a union does not have', () => {
    // `string | number` is a JSON Schema `type` list; saying JSON Schema
    // cannot express it was false, and the reason nothing is asserted is
    // the compiler's own one-type rule.
    const described = describeUnexpressedType({}, 'string | number', false);
    expect(described.description).toContain('The compiler emits one JSON type per property');
    expect(described.description).not.toContain('Not expressible');
  });

  it('describes what is left of a type the schema states only in part', () => {
    // "Not expressible" said of a type that partly is would be false, so a
    // partly stated type keeps both halves: the assertion and the prose.
    expect(describeUnexpressedType({ type: 'array' }, 'ColumnDef<TFeatures, TData>[]', false)).toEqual({
      type: 'array',
      description:
        'TS: ColumnDef<TFeatures, TData>[]. Not fully expressible in JSON Schema; what the type states beyond the kind above is checked by tsc.',
    });
  });

  it('leaves a type the schema states in full undescribed', () => {
    expect(describeUnexpressedType({ type: 'array', items: { type: 'string' } }, 'string[]', true)).toEqual({
      type: 'array',
      items: { type: 'string' },
    });
  });

  it('leaves an existing description alone', () => {
    const described = {
      description: 'Partially typed: ReactNode. No JSON Schema type exists for it; shape checked by tsc, see x-uikit.partially_typed_props.',
    };
    expect(describeUnexpressedType(described, 'ReactNode', false)).toEqual(described);
  });
});


describe('the vocabulary the component type references', () => {
  const builtIds = new Set(buildVocabularyTypes().map((type) => String(type.$id)));

  function gtsRefs(node: unknown, found: string[] = []): string[] {
    if (Array.isArray(node)) {
      for (const item of node) gtsRefs(item, found);
      return found;
    }
    if (node !== null && typeof node === 'object') {
      for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
        if (key === '$ref' && typeof value === 'string' && value.startsWith('gts://')) found.push(value);
        else gtsRefs(value, found);
      }
    }
    return found;
  }

  it('is complete: every reference resolves to a type the builder writes', () => {
    // A field added to the component type or the overlay schema naming a type
    // nobody builds would fail at validation time with an unresolvable
    // reference, far from the edit that caused it. This is that failure moved
    // to the build.
    const referenced = new Set([
      ...gtsRefs(buildComponentType()),
      ...gtsRefs(buildOverlaySchema()),
      ...gtsRefs(buildVocabularyTypes()),
    ]);
    expect([...referenced].filter((ref) => !builtIds.has(ref))).toEqual([]);
  });

  it('states an optional meaning field as the plain reference, with no null alternative and no default', () => {
    // The nullable widening and the nine `default: null`s existed for one
    // reason: gts-ts's trait machinery demanded a value or a schema default
    // for every property an x-gts-traits-schema declared, regardless of
    // `required`. A component is an instance of the component type now, and a
    // property an instance does not carry is simply absent - so a field the
    // vocabulary does not require is stated exactly as the vocabulary defines
    // it.
    const properties = buildComponentType().properties as Record<string, Record<string, unknown>>;
    expect(properties.family_membership.$ref).toEqual(expect.stringContaining('family_membership'));
    expect(properties.family_membership.anyOf).toBeUndefined();
    expect(buildComponentType().required).not.toContain('family_membership');
    for (const [name, definition] of Object.entries(properties)) {
      expect(definition.default, `${name} carries a default`).toBeUndefined();
    }
  });

  it('holds a mount point to the note rule its own description states, both ways', () => {
    // The two halves lived in parseOverlay alone, which governs the authoring
    // side: a hand-written contract carrying a bare container validated
    // against the published type and left every reader to guess why the
    // component belongs there. Exercised through the registered type rather
    // than against the object literal, because what a reader validates
    // against is the committed vocabulary file.
    const ajv = new Ajv2020();
    addContractTypes(ajv);
    const validate = ajv.getSchema(vocabularyTypeId('mount_point'));
    expect(validate).toBeDefined();
    const filled = { container: 'AccordionItem', component: componentRef('accordion-item', 1) };
    expect(validate?.(filled)).toBe(true);
    expect(validate?.({ ...filled, note: 'redundant beside a kit component' })).toBe(false);
    const outside = { container: "a column's header render function", note: 'TanStack Table hands it the column' };
    expect(validate?.(outside)).toBe(true);
    expect(validate?.({ container: "a column's header render function" })).toBe(false);
  });

  it('rejects a document claiming a type other than the component type, under plain Ajv', () => {
    // `x-gts-ref` is the pointer form and gts-ts is what resolves it - but it
    // strips the keyword before validating, so a reader holding nothing but
    // this schema and an Ajv gets whatever the schema itself asserts. `const`
    // is what carries the id for that reader: without it a component could
    // name any type at all and still validate.
    const ajv = new Ajv2020();
    addContractTypes(ajv);
    const validate = ajv.compile(buildComponentType());
    const committed = JSON.parse(readFileSync(join(process.cwd(), 'src/components/button/button.contract.json'), 'utf8')) as Record<
      string,
      unknown
    >;
    expect(validate(committed), ajv.errorsText(validate.errors)).toBe(true);
    expect(validate({ ...committed, gts_type: 'total nonsense not an id' })).toBe(false);
  });
});

describe('a boolean cva axis', () => {
  const [panel] = extractComponent(fixture('boolean-axis.fixture.tsx'));
  const { properties } = buildPropsAndRequired('panel', panel, { properties: {} });

  it('compiles to a boolean property, not to the string enum its keys look like', () => {
    // What VariantProps types the prop as, and therefore the only shape a
    // caller can satisfy: `<Panel fullWidth />` passes a boolean, and a
    // contract stating `enum: ['true','false']` on a string rejected it.
    expect(properties.fullWidth).toEqual({ type: 'boolean', default: false });
    expect(properties.raised).toEqual({ type: 'boolean' });
    // The mirrored single-key form: cva types a `false`-only map as a
    // boolean for the same reason it types a `true`-only one that way.
    expect(properties.unstyled).toEqual({ type: 'boolean' });
  });

  it('leaves a string axis a string enum with its own default', () => {
    expect(properties.emphasis).toEqual({ type: 'string', enum: ['low', 'high'], default: 'low' });
  });
});

describe('who belongs to one family', () => {
  const root = { ref: 'root-ref', stem: 'accordion', membership: { name: 'accordion', role: 'root' as const } };
  const item = { ref: 'item-ref', stem: 'accordion-item', membership: { name: 'accordion', role: 'part' as const } };
  const trigger = { ref: 'trigger-ref', stem: 'accordion-trigger', membership: { name: 'accordion', role: 'part' as const } };
  const stranger = { ref: 'button-ref', stem: 'button', membership: undefined };

  it('collects the root and its parts by the token every member names', () => {
    // Membership is one statement each member makes about itself, so the
    // family's whole shape is a group-by over those statements - which is what
    // makes a root's `members` derivable instead of authored.
    expect(buildFamilyRoster('accordion', [trigger, stranger, root, item])).toEqual({
      name: 'accordion',
      root: 'root-ref',
      parts: ['item-ref', 'trigger-ref'],
    });
  });

  it('refuses two roots for one family name, naming both', () => {
    // The rule that makes the derivation well-defined at all: with two roots
    // there is no single place a reader can ask what the family contains, and
    // which one won would depend on the order a directory listing came back
    // in.
    const second = { ref: 'other-ref', stem: 'accordion-panel', membership: { name: 'accordion', role: 'root' as const } };
    expect(() => buildFamilyRoster('accordion', [root, item, second])).toThrow(/two roots.*accordion.*accordion-panel/s);
  });

  it('answers with no root for a family nobody roots', () => {
    // Reported rather than thrown here: the refusal belongs to the component
    // being compiled (compileFamilyMembership), which can name itself in the
    // message; this function only says what it found.
    expect(buildFamilyRoster('accordion', [item, trigger])).toEqual({ name: 'accordion', root: undefined, parts: ['item-ref', 'trigger-ref'] });
  });

  it('is empty for a family name nothing names', () => {
    expect(buildFamilyRoster('carousel', [root, item, stranger])).toEqual({ name: 'carousel', root: undefined, parts: [] });
  });
});

describe('mountPointsAccepting: a container naming a major the component no longer ships', () => {
  // Read off the committed root overlay rather than hand-built, so the entry
  // under test is the real accepted-components shape and only the major
  // differs. Moving a major is an edit to every overlay naming the component;
  // dropping the filled mount point for the ones left behind would hide
  // exactly the edit the move demands, which is why this is a refusal rather
  // than a skip.
  const rootPath = join(process.cwd(), 'src/components/accordion/accordion.contract.yaml');
  const rootText = readFileSync(rootPath, 'utf8');
  const itemRef = componentRef('accordion-item', 1);
  const staleRef = componentRef('accordion-item', 2);

  function walk(text: string): ReturnType<typeof collectOverlays>['overlays'] {
    const { overlays, failures } = collectOverlays([{ directory: 'accordion', stem: 'accordion', path: rootPath, text }]);
    expect(failures.map((failure) => failure.message)).toEqual([]);
    return overlays;
  }

  it('derives the mount point when the reference carries the major the component ships', () => {
    // The mount point names the CONTAINER - its export name and its own
    // reference - because that is what a reader of AccordionItem acts on.
    expect(mountPointsAccepting('accordion-item', itemRef, walk(rootText))).toEqual([
      { container: 'Accordion', component: componentRef('accordion', 1) },
    ]);
  });

  it("names a container whose overlay states its export by that export, not by its stem", () => {
    // `export: Toaster` on a stem like `toast-toaster`: the stem in
    // PascalCase would name an export that does not exist.
    const walked = walk(rootText).map((entry) => ({ ...entry, overlay: { ...entry.overlay, export: 'Toaster' } }));
    expect(mountPointsAccepting('accordion-item', itemRef, walked)).toEqual([
      { container: 'Toaster', component: componentRef('accordion', 1) },
    ]);
  });

  it('refuses the stale reference by name, naming both majors and the overlay that carries it', () => {
    expect(rootText).toContain(itemRef);
    expect(() => mountPointsAccepting('accordion-item', itemRef, walk(rootText.replace(itemRef, staleRef)))).toThrow(
      /accordion\/accordion\.contract\.yaml accepts "[^"]*accordion_item\.v2" inside it, but accordion-item ships "[^"]*accordion_item\.v1"/,
    );
  });
});

describe('collectOverlays / usableOverlays: a broken overlay is scoped by what it mentions', () => {
  // The comment on collectOverlays says the point of taking sources as a
  // pure argument is that this scoping can be exercised without writing a
  // file into src/components - this is that exercise. "ghost" stands for a
  // half-written overlay of an UNENROLLED component: real YAML errors are
  // ordinary mid-edit noise, so the walk collects the failure instead of
  // throwing from it, and only a derivation whose own reference the broken
  // text happens to carry is the one usableOverlays cannot answer.
  const brokenPath = '/kit/src/components/ghost/ghost.contract.yaml';
  const accordionNeedle = componentRefPrefix('accordion');
  const buttonNeedle = componentRefPrefix('button');
  // The id the committed accordion contract really carries, read off disk
  // rather than rebuilt from the same expression the assertions use: a needle
  // and a fixture built from one string agree with each other whatever the
  // grammar does, which is exactly how a silently-never-matching needle
  // survived undetected.
  const accordionRef = String(
    (JSON.parse(readFileSync(join(process.cwd(), 'src/components/accordion/accordion.contract.json'), 'utf8')) as { $id: string }).$id,
  );
  // An unterminated flow sequence: real YAML, invalid the moment the `]`
  // never lands - and its text still carries accordion's own reference,
  // because a WIP `accepts.components` entry is exactly the kind of edit that
  // gets interrupted mid-line.
  const broken = {
    directory: 'ghost',
    stem: 'ghost',
    path: brokenPath,
    text: `component: ghost\naccepts:\n  components: [${accordionRef}\n`,
  };

  it('builds a needle the committed contract id really starts with, and no other component\'s', () => {
    // The needle decides whether an unparseable overlay blocks a compile or
    // merely warns, and nothing downstream notices when it stops matching -
    // the refusal silently becomes a console.warn and the output is
    // identical. So it is pinned to a real id here rather than to itself.
    expect(accordionRef.startsWith(accordionNeedle)).toBe(true);
    expect(accordionRef.startsWith(buttonNeedle)).toBe(false);
  });
  // The real, committed button overlay: parseOverlay validates a full
  // component overlay against the overlay schema (intent, accepts,
  // attestations and the rest), so a source has to be a whole valid overlay
  // to land in `overlays` rather than in `failures` for an unrelated reason.
  const button = {
    directory: 'button',
    stem: 'button',
    path: '/kit/src/components/button/button.contract.yaml',
    text: readFileSync(join(process.cwd(), 'src/components/button/button.contract.yaml'), 'utf8'),
  };

  it('collects the broken overlay as a failure instead of throwing, and still parses what does', () => {
    const { overlays, failures } = collectOverlays([broken, button]);
    expect(overlays).toEqual([{ directory: 'button', stem: 'button', overlay: expect.objectContaining({ component: 'button' }) }]);
    expect(failures).toHaveLength(1);
    expect(failures[0].path).toBe(brokenPath);
  });

  it("does not fail button's compile: button's own reference never appears in the broken text, so it is a warning, not a block", () => {
    const { failures } = collectOverlays([broken, button]);
    expect(overlayFailuresMentioning(failures, [buttonNeedle])).toEqual([]);
  });

  it("fails accordion's compile, because the broken file's own text names it, and the failure names the offending file", () => {
    const { failures } = collectOverlays([broken, button]);
    const blocking = overlayFailuresMentioning(failures, [accordionNeedle]);
    expect(blocking).toHaveLength(1);
    expect(blocking[0].path).toBe(brokenPath);
  });
});

describe('a prop only some branches of a union props type declare', () => {
  const [picker] = extractComponent(fixture('union-props.fixture.tsx'));
  const { properties, required } = buildPropsAndRequired('picker', picker, {});

  it('reaches the schema as an optional property, its description naming the branches', () => {
    expect(properties.clearable).toEqual({
      type: 'boolean',
      description: 'Declared only by SinglePickerProps of the props union; absent from the others.',
    });
    expect(required).not.toContain('clearable');
    // Required on the range branch, and still not required of a picker on
    // another branch.
    expect(required).not.toContain('anchor');
    expect(properties.anchor.description).toBe('Declared only by RangePickerProps of the props union; absent from the others.');
    expect(required).toContain('label');
  });

  it('puts the branch sentence after the type text where the schema leaves the type to tsc', () => {
    expect(properties.numberOfMonths.description).toMatch(
      /^Partially typed: number \| "one" \| "two" \| undefined\. .* Declared only by RangePickerProps, WeekPickerProps of the props union; absent from the others\.$/,
    );
  });

  it('counts only the prose that opens with the printed type as a gap the pairing is owed a statement for', () => {
    // A branch sentence on a fully typed prop states no gap: read as one, it
    // would demand a prop statement about a property the schema types in full.
    expect(leavesTypeToTsc(properties.clearable)).toBe(false);
    expect(leavesTypeToTsc(properties.numberOfMonths)).toBe(true);
    const contract = { props: { properties } } as unknown as CompiledContract;
    expect(partlyCheckedPropertyNames(contract)).toEqual(['numberOfMonths']);
  });

  it('leaves a prop every branch declares without a branch sentence', () => {
    expect(properties.label).toEqual({ type: 'string' });
    expect(describeBranches({ type: 'string' }, { ...picker.ownProps[0], branches: undefined })).toEqual({ type: 'string' });
  });
});

describe('an overlay naming an export its stem cannot spell', () => {
  const labelOverlay = parseYaml(readFileSync(join(process.cwd(), 'src/components/label/label.contract.yaml'), 'utf8')) as Record<string, unknown>;

  it('admits an `export` field holding a component name', () => {
    expect(parseOverlay('label', { ...labelOverlay, export: 'Label' }).export).toBe('Label');
  });

  it('refuses one that is not a component name', () => {
    expect(() => parseOverlay('label', { ...labelOverlay, export: 'label' })).toThrow(/export/);
  });

  it('selects the export by that name, while the stem stays under the directory', () => {
    // toast.tsx exports Toaster, whose own name does not extend the
    // directory's: the stem `toast-toaster` keeps it resolvable to one
    // directory, and the name is what picks the export. The stem spelled in
    // PascalCase names no export of toast.tsx.
    expect(resolveTargetExtraction('toast', 'toast-toaster', 'Toaster').name).toBe('Toaster');
    expect(() => resolveTargetExtraction('toast', 'toast-toaster', 'ToastToaster')).toThrow(/no exported component named "ToastToaster"/);
  });

  it('defaults to the stem in PascalCase where no overlay names one, and reads the name an overlay gives', () => {
    // No overlay exists for this stem, and label's overlay writes no `export`.
    expect(exportNameOf('toast', 'toast-region')).toBe('ToastRegion');
    expect(exportNameOf('label')).toBe('Label');
    expect(exportNameOf('toast', 'toast-toaster')).toBe('Toaster');
  });
});

describe('the refusal for props forwarded to no host element', () => {
  it('names every heritage node the walk could not read', () => {
    const cell = extractComponent(fixture('wrapped-libraries.fixture.tsx')).find((e) => e.name === 'Cell')!;
    const refusal = noHostElementRefusal('cell', 'cell', cell);
    expect(refusal.message).toContain('no host element kind could be resolved');
    expect(refusal.message).toContain('heritage could not be read at');
    expect(refusal.message).toContain('"HTMLElement"');
  });

  it('says so when nothing was left unread and the types simply name no element', () => {
    const handlers = extractComponent(fixture('wrapped-libraries.fixture.tsx')).find((e) => e.name === 'Handlers')!;
    expect(handlers.forwardedProps.length).toBeGreaterThan(0);
    expect(handlers.cannotExtract).toEqual([]);
    expect(noHostElementRefusal('handlers', 'handlers', handlers).message).toContain('do not say which element it renders');
  });
});

describe('where a family member may be mounted', () => {
  const roster = {
    name: 'menu',
    root: componentRef('menu', 1),
    parts: [componentRef('menu-item', 1)],
  };
  const elsewhere = componentRef('toolbar', 1);

  it('fails a part mounted outside its own family', () => {
    const part = { family_membership: { name: 'menu', role: 'part' as const }, mounted_in: [{ container: 'Toolbar', component: elsewhere }] };
    expect(mountPointsOutsideFamily(part, roster)).toEqual([`"${elsewhere}" is not a member of family "menu"`]);
  });

  it('passes a part mounted inside its own family', () => {
    const part = { family_membership: { name: 'menu', role: 'part' as const }, mounted_in: [{ container: 'Menu', component: roster.root }] };
    expect(mountPointsOutsideFamily(part, roster)).toEqual([]);
  });

  it("passes a root mounted inside another component's container", () => {
    // A group hosting the roots of its members: the root is a component in
    // its own right, so nothing becomes independently mountable.
    const root = { family_membership: { name: 'menu', role: 'root' as const }, mounted_in: [{ container: 'Toolbar', component: elsewhere }] };
    expect(mountPointsOutsideFamily(root, roster)).toEqual([]);
  });
});

describe('a default the component writes for itself', () => {
  const extractions = extractComponent(fixture('prop-defaults.fixture.tsx'));
  const byName = (name: string) => extractions.find((e) => e.name === name)!;

  it('is the default of the property it names', () => {
    const { properties } = buildPropsAndRequired('chip', byName('Chip'), {});
    expect(properties.tone).toMatchObject({ type: 'string', default: 'info' });
    expect(properties.count).toMatchObject({ type: 'number', default: 3 });
    expect(properties.dense).toMatchObject({ type: 'boolean', default: false });
    expect(properties.offset).toMatchObject({ default: -1 });
    expect(properties.hint.default).toBeNull();
  });

  it("wins over a reused variant declaration's default for the same axis", () => {
    const { properties } = buildPropsAndRequired('outline-action', byName('OutlineAction'), {});
    expect(properties.variant).toEqual({ type: 'string', enum: ['default', 'outline'], default: 'outline' });
  });

  it('leaves the variant default in place where the component writes none', () => {
    const { properties } = buildPropsAndRequired('action', byName('Action'), {});
    expect(properties.variant.default).toBe('default');
  });

  it("states an axis removed with Omit as the component's own prop, with the component's own default", () => {
    const { properties } = buildPropsAndRequired('quiet-action', byName('QuietAction'), {});
    expect(properties.variant).toEqual({ type: 'string', enum: ['loud', 'quiet'], default: 'quiet' });
  });

  it('is noted, not stated, where the contract has no property for the prop it names', () => {
    const { properties, notes } = buildPropsAndRequired('submit-button', byName('SubmitButton'), loadElementSurface('button'));
    expect(properties.type).toBeUndefined();
    expect(notes).toEqual(['default: prop "type" defaults to "submit", but the contract states no property for it - the default is not stated']);
  });

  it("refuses a default its own property's schema rejects, naming both", () => {
    expect(() => buildPropsAndRequired('reset-action', byName('ResetAction'), {})).toThrow(
      /prop "variant" defaults to null, which its own property .* rejects/,
    );
  });

  it('is not stated where the written default is computed', () => {
    const { properties } = buildPropsAndRequired('sized', byName('Sized'), {});
    expect(properties.size).toEqual({ type: 'string' });
  });
});

describe('an overlay stating that nothing renders the forwarded attributes', () => {
  const forwarded = [{ name: 'aria-label', optional: true, typeText: 'string', expressed: undefined, declarationFile: '@types/react/index.d.ts' }];
  const statement = { host_element: { none: 'the library renders them onto no element.' } };
  const noBody = { elementKind: undefined, forwardedProps: forwarded, hasBody: false };

  it('is admitted for a component with no body of its own whose source names no element, and names what it leaves out', () => {
    expect(assertHostElementStatement('legend', statement, noBody)).toBe(
      'host element: none - 1 React attribute(s) the props type admits are not described by an element surface (aria-label): the library renders them onto no element.',
    );
  });

  it('is refused where the props type names an element', () => {
    expect(() => assertHostElementStatement('legend', statement, { ...noBody, elementKind: 'div' })).toThrow(/names "div"/);
  });

  it('is refused where nothing is forwarded', () => {
    expect(() => assertHostElementStatement('legend', statement, { ...noBody, forwardedProps: [] })).toThrow(/forwards no React attributes/);
  });

  it('is refused for every bodied component, whatever its body returns first', () => {
    // An early `return null`, a fragment, one of two elements: each still
    // renders an element on some path, so the body - not a statement - says
    // where the props go.
    for (const component of extractComponent(fixture('rendered-root.fixture.tsx')).filter((e) => e.hasBody)) {
      expect(() => assertHostElementStatement(component.name, statement, component), component.name).toThrow(/body of its own/);
    }
  });

  it('is absent from a contract whose overlay does not state it', () => {
    expect(assertHostElementStatement('legend', {}, noBody)).toBeUndefined();
  });
});

describe('a library alias compiled with the statement, end to end', () => {
  const [legendish] = extractComponent(fixture('library-alias.fixture.tsx'));
  const overlay = parseOverlay('legendish', {
    component: 'legendish',
    intent: 'Show which series a chart draws, as the library lays it out.',
    typical_uses: ['A legend under a chart'],
    dont_use_when: [{ situation: 'A legend the kit lays out itself', instead: { target: 'a list of kit Badges', note: 'The kit ships no legend of its own.' } }],
    accepts: { content: 'nothing' },
    host_element: { none: 'the library passes them to its content renderer as props, not to an element.' },
    invariants: [],
    anti_patterns: [],
    deprecations: {},
    attestations: { a11y: { outcome: 'unknown' }, rtl: { outcome: 'unknown' } },
    examples: {
      good: [{ title: 'Under a chart', code: '<Legendish align="left" />' }],
      bad: [{ title: 'Aligned where the legend has no side', code: '<Legendish align="center" />', why: 'align takes left or right.' }],
    },
  });

  it('names no element surface and records what it leaves undescribed and why', () => {
    expect(legendish.hasBody).toBe(false);
    const contract = compileContractFrom('legendish', 'legendish', legendish, overlay);
    expect(contract.forwards_to).toBeUndefined();
    expect(contract.props.properties.align).toMatchObject({ type: 'string', enum: ['left', 'right'] });
    const notes = contract['x-uikit'].cannot_extract;
    expect(notes[notes.length - 1]).toMatch(
      /^host element: none - \d+ React attribute\(s\) the props type admits are not described by an element surface \(aria-[a-z]+.*\): the library passes them/,
    );
  });

  it('is refused without the statement, naming the forwarded props', () => {
    const { host_element: _dropped, ...withoutStatement } = overlay;
    expect(() => compileContractFrom('legendish', 'legendish', legendish, withoutStatement)).toThrow(/no host element kind could be resolved/);
  });
});

describe('a prop statement group', () => {
  const untyped = { description: 'TS: () => void. The compiler emits one JSON type per property; this type is left to tsc.' };
  const properties = { onAbort: untyped, onBlur: untyped, onClick: untyped, open: { type: 'boolean' } };
  const handlers = { match: '^on[A-Z]', states: 'An event handler passed through', because: 'A function.' };
  const clicks = { match: '^onClick$', states: 'The click handler', because: 'A function.' };
  const contract = (statements: Record<string, { states: string; because: string }>, groups: (typeof handlers)[]) =>
    ({ props: { properties }, prop_statements: statements, prop_statement_groups: groups }) as unknown as CompiledContract;

  it('covers every partially typed prop it alone matches', () => {
    // `open` is typed in full; `^on[A-Z]` does not reach it here, and a
    // pattern that did would state nothing about it - the check is on what
    // the schema leaves to tsc.
    expect([...groupCoverage(properties, {}, [handlers]).keys()]).toEqual(['onAbort', 'onBlur', 'onClick']);
    expect(findUntypedPropMismatches(contract({}, [handlers]))).toEqual([]);
  });

  it('skips a fully typed prop its pattern matches rather than refusing it', () => {
    const everything = { match: '^o', states: 'Something', because: 'A reason.' };
    expect([...groupCoverage(properties, {}, [everything]).keys()]).not.toContain('open');
    expect(findUntypedPropMismatches(contract({}, [everything]))).toEqual([]);
  });

  it('gives way to an explicit statement about a prop it matches', () => {
    const explicit = { onClick: { states: 'onClick is its own fact', because: 'A function.' } };
    expect(groupCoverage(properties, explicit, [handlers]).has('onClick')).toBe(false);
    expect(findUntypedPropMismatches(contract(explicit, [handlers]))).toEqual([]);
  });

  it('covers nothing two groups both match, and reports that overlap alone', () => {
    // `^onClick$` covers nothing else, but it is no orphan: the overlap is
    // its whole problem, reported once.
    expect(findUntypedPropMismatches(contract({}, [handlers, clicks]))).toEqual([
      '"onClick" is matched by 2 prop statement groups (^on[A-Z], ^onClick$) and named by no statement of its own - no one of them covers it',
    ]);
  });

  it("does not take a prop named like an object's own built-ins as explicitly stated", () => {
    const withBuiltins = { ...properties, constructor: untyped };
    expect(groupCoverage(withBuiltins, {}, [{ match: '^constructor$', states: 's', because: 'b' }]).has('constructor')).toBe(true);
  });

  it('is an orphan when it covers no property, the way a statement about a typed prop is', () => {
    const explicit = { onClick: { states: 'onClick is its own fact', because: 'A function.' } };
    expect(findUntypedPropMismatches(contract(explicit, [handlers, clicks]))).toEqual([
      'the prop statement group "^onClick$" covers no property: it matches none the schema leaves to tsc that no statement of its own names',
    ]);
  });

  it('is refused at admission when its pattern does not parse or names no prop the component has', () => {
    const extraction = extractComponent(fixture('untypeable-props.fixture.tsx'))[0];
    const base = { deprecations: {}, accepts: { content: 'nothing' }, prop_statements: {} } as unknown as Parameters<typeof assertOverlayReferencesRealProps>[1];
    expect(() =>
      assertOverlayReferencesRealProps('picker', { ...base, prop_statement_groups: [{ match: '^(on', states: 's', because: 'b' }] }, extraction),
    ).toThrow(/is not a regular expression/);
    expect(() =>
      assertOverlayReferencesRealProps('picker', { ...base, prop_statement_groups: [{ match: '^zzz', states: 's', because: 'b' }] }, extraction),
    ).toThrow(/names no prop/);
    // Unbalanced parens that would parse once wrapped, letting `Close` escape
    // the anchor, are refused as not a regular expression.
    expect(() =>
      assertOverlayReferencesRealProps('picker', { ...base, prop_statement_groups: [{ match: '^onClick)|(Close', states: 's', because: 'b' }] }, extraction),
    ).toThrow(/is not a regular expression/);
    expect(() => groupPattern({ match: '^onClick)|(Close', states: 's', because: 'b' })).toThrow();
  });

  it('refuses a list of exact names at admission when any listed name is not a prop', () => {
    const extraction = extractComponent(fixture('untypeable-props.fixture.tsx'))[0];
    const base = { deprecations: {}, accepts: { content: 'nothing' }, prop_statements: {} } as unknown as Parameters<typeof assertOverlayReferencesRealProps>[1];
    const real = [...extraction.ownProps, ...extraction.apiProps].map((prop) => prop.name)[0];
    expect(() =>
      assertOverlayReferencesRealProps('picker', { ...base, prop_statement_groups: [{ match: `^(${real}|${real}Typo)$`, states: 's', because: 'b' }] }, extraction),
    ).toThrow(new RegExp(`lists "${real}Typo", which is not a real prop`));
    expect(listedNames('^(a|b)$')).toEqual(['a', 'b']);
    expect(listedNames('^a$')).toEqual(['a']);
    expect(listedNames('^on[A-Z]')).toBeUndefined();
    expect(listedNames('^(a|b)')).toBeUndefined();
  });

  it('anchors every alternative of its pattern, not only the first', () => {
    const pattern = groupPattern({ match: '^onClick|Close', states: 's', because: 'b' });
    expect(pattern.test('Close')).toBe(true);
    expect(pattern.test('onClose')).toBe(false);
    expect(pattern.test('onClick')).toBe(true);
  });

  it("is carried once in the contract and emitted into each covered property's description", () => {
    const [extraction] = extractComponent(fixture('handler-props.fixture.tsx'));
    const kbd = parseYaml(readFileSync(join(process.cwd(), 'src/components/kbd/kbd.contract.yaml'), 'utf8')) as Record<string, unknown>;
    const overlay = parseOverlay('handlers', {
      ...kbd,
      component: 'handlers',
      prop_statement_groups: [{ match: '^on[A-Z]', states: 'An event handler passed through', because: 'A function.' }],
    });
    const contract = compileContractFrom('handlers', 'handlers', extraction, overlay);
    expect(contract.prop_statement_groups).toEqual([{ match: '^on[A-Z]', states: 'An event handler passed through', because: 'A function.' }]);
    expect(contract.prop_statements).toBeUndefined();
    for (const prop of ['onAbort', 'onBlur']) {
      expect(contract.props.properties[prop].description, prop).toMatch(/An event handler passed through\. A function\.$/);
    }
    expect(findUntypedPropMismatches(contract)).toEqual([]);
  });

  it('must be anchored at the start, in the grammar of the element surfaces', () => {
    const kbd = parseYaml(readFileSync(join(process.cwd(), 'src/components/kbd/kbd.contract.yaml'), 'utf8')) as Record<string, unknown>;
    expect(() => parseOverlay('kbd', { ...kbd, prop_statement_groups: [{ match: 'on[A-Z]', states: 's', because: 'b' }] })).toThrow(/match/);
  });
});

describe('a default the body gives through `??` or an attribute before the spread', () => {
  const extractions = extractComponent(fixture('body-defaults.fixture.tsx'));
  const byName = (name: string) => extractions.find((e) => e.name === name)!;

  it("is the property's default, over the reused variant declaration's", () => {
    expect(buildPropsAndRequired('coalesced', byName('Coalesced'), {}).properties.variant).toEqual({
      type: 'string',
      enum: ['default', 'ghost', 'solid'],
      default: 'ghost',
    });
    const { properties } = buildPropsAndRequired('attribute-first', byName('AttributeFirst'), {});
    expect(properties.variant.default).toBe('ghost');
    expect(properties.size).toEqual({ type: 'number', default: 2 });
    expect(properties.disabled).toEqual({ type: 'boolean', default: true });
  });

  it("leaves the variant declaration's default where the attribute follows the spread", () => {
    expect(buildPropsAndRequired('attribute-after', byName('AttributeAfter'), {}).properties.variant.default).toBe('default');
  });
});

describe('an element surface family the props type admits no name of', () => {
  const divSurface = loadElementSurface('div');
  const prop = (name: string) => ({ name, optional: true, typeText: 'string', expressed: undefined, declarationFile: '@types/react/index.d.ts' });
  const noHandlers = {
    axes: {},
    ownProps: [prop('label')],
    apiProps: [],
    forwardedProps: [prop('id'), prop('title')],
    admitsUnlistedProps: false,
  };

  it('is closed in the props body where no prop the type admits matches it', () => {
    expect(Object.keys(closedFamiliesOf(noHandlers, divSurface).patternProperties ?? {})).toEqual(['^on[A-Z]']);
  });

  it('stays open where the type admits one of its names', () => {
    expect(closedFamiliesOf({ ...noHandlers, forwardedProps: [prop('onClick')] }, divSurface)).toEqual({});
  });

  it('never closes a hyphenated family, which any component admits whatever its type declares', () => {
    const closed = Object.keys(closedFamiliesOf(noHandlers, divSurface).patternProperties ?? {});
    expect(closed).not.toContain('^aria-');
    expect(closed).not.toContain('^data-');
  });

  it('closes nothing for a props type that admits names it does not list', () => {
    const extractions = extractComponent(fixture('handler-props.fixture.tsx'));
    const indexed = extractions.find((e) => e.name === 'Indexed')!;
    expect(indexed.admitsUnlistedProps).toBe(true);
    for (const name of ['TemplateIndexed', 'IntersectionIndexed']) {
      expect(extractions.find((e) => e.name === name)!.admitsUnlistedProps, name).toBe(true);
    }
    // A number index admits no attribute name, so it leaves the families closable.
    for (const name of ['Handlers', 'NumberIndexed']) {
      expect(extractions.find((e) => e.name === name)!.admitsUnlistedProps, name).toBe(false);
    }
    expect(closedFamiliesOf({ ...noHandlers, admitsUnlistedProps: true }, divSurface)).toEqual({});
  });

  it('makes a closed name unchecked even where the surface declares it outright', () => {
    const surface = { ...divSurface, properties: { ...(divSurface.properties as object), onClick: { description: 'x' } } };
    const contract = { properties: {}, ...closedFamiliesOf(noHandlers, divSurface) };
    expect(classifyProps({ onClick: () => undefined }, contract, surface).unchecked).toEqual(['onClick']);
  });

  it('closes nothing where the contract names no surface', () => {
    expect(closedFamiliesOf(noHandlers, undefined)).toEqual({});
  });

  it('makes a name of the closed family unchecked rather than known in the classification report', () => {
    const contract = { properties: { label: {} }, ...closedFamiliesOf(noHandlers, divSurface) };
    const report = classifyProps({ label: 'x', onClick: () => undefined, 'aria-label': 'y' }, contract, divSurface);
    expect(report.unchecked).toContain('onClick');
    expect(report.known).toEqual(['aria-label', 'label']);
  });

  it('is a narrowing when a later revision closes it', () => {
    const closed = { properties: {}, required: [], ...closedFamiliesOf(noHandlers, divSurface) };
    const diff = diffOwnPropsSchema({ properties: {}, required: [] }, closed);
    expect(diff.compatible).toBe(false);
    expect(diff.narrowedProps).toEqual([{ prop: '^on[A-Z]', reason: 'the attribute family ^on[A-Z] is closed: its names are no longer accepted' }]);
  });
});
