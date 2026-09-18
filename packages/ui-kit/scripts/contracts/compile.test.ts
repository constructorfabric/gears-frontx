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
import { describe, expect, it } from 'vitest';

import {
  addContractTypes,
  buildComponentType,
  buildFamilyRoster,
  buildOverlaySchema,
  buildPropsAndRequired,
  buildVocabularyTypes,
  collectOverlays,
  describeUnexpressedType,
  mountPointsAccepting,
  loadElementSurface,
  loadElementSurfaces,
  overlayFailuresMentioning,
  sharedAttributeConflicts,
} from './compile';
import { extractComponent } from './extract';
import { componentRef, componentRefPrefix, vocabularyTypeId } from './ids';
import { applyContractTestTimeout } from './testing';

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
    // type covers - and the case that used to emit `{}` per component, 233
    // times over, for props nobody had written down.
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

describe('what two element kinds both declare', () => {
  it('is declared identically by every committed surface', () => {
    // The files are hand-written, so nothing constructs this agreement: the
    // global attributes (className, id, style, title, role, tabIndex,
    // children) and the three patterns are typed out per file. The
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
    // What the old text-based classifier got wrong on the accordion root:
    // the printed alias name matched nothing, so a fully expressible type
    // was declared inexpressible and slotted.
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
      description: 'TS: Value[]. Not expressible in JSON Schema, checked by tsc.',
    });
  });

  it('describes what is left of a type the schema states only in part', () => {
    // The claim the wording used to make - "not expressible" of a type that
    // partly is - is the defect this whole rule came from, so a partly
    // stated type keeps both halves: the assertion and the prose.
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
  // text happens to carry is the one usableOverlays can no longer answer.
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
