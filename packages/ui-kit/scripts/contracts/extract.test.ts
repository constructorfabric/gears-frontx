// Extractor unit tests: each fixture under __fixtures__ reproduces one shape
// a syntax-only reading misses entirely or merges incorrectly - F15
// (type-alias props), F16 (cva resolved by text match, not by symbol), F17
// (multiple exported components merged into one extraction). A fixture that regresses silently is worse than one that
// fails loudly, so several of these assert on the FAILURE path too
// (cva-unresolvable), not just the happy path.
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  classifyDeclarationSite,
  extractComponent,
  isBooleanAxis,
  listExportedDeclarationNames,
  stripModuleSpecifiers,
} from './extract';
import { domElementToken, elementTypeId, elementTypeIdPattern } from './ids';
import { applyContractTestTimeout } from './testing';

// Each fixture below is its own tsx path, so extractComponent's per-path
// cache (see extract.ts) cannot help here - a real TypeScript program build
// is several seconds on a CI-class runner, comfortably under 5s locally, so
// only CI hits vitest's default test timeout. Must run before any
// describe()/it() in the file; see applyContractTestTimeout's own comment
// in testing.ts.
applyContractTestTimeout();

const fixturesDir = join(process.cwd(), 'scripts/contracts/__fixtures__');
const fixture = (name: string) => join(fixturesDir, name);

describe('extractComponent: type alias and intersection props (F15)', () => {
  const [banner] = extractComponent(fixture('alias-intersection.fixture.tsx'));

  it('reads a `type` alias props declaration, not just `interface`', () => {
    // BannerProps is a `type` alias, not an interface; reading only
    // `ts.isInterfaceDeclaration` would miss it, which is F15 - 42 of 63 kit
    // components declare at least one type-alias props type.
    expect(banner).toBeDefined();
    expect(banner.name).toBe('Banner');
  });

  it("resolves the component's own prop out of an intersection member", () => {
    // `tone` lives in the inline object-literal half of
    // `ComponentProps<'div'> & { tone: ... }` - checker.getPropertiesOfType
    // on the parameter's resolved type merges both halves, so this is
    // exactly the case Omit/Pick/intersection unwrapping has to get right.
    const tone = banner.ownProps.find((p) => p.name === 'tone');
    expect(tone).toBeDefined();
    expect(tone?.optional).toBe(false);
  });

  it('states an own literal-union prop as a string enum', () => {
    // The checker's answer, not a parse of the printed text: what the
    // compiler puts in `properties` comes from here, so this is the layer
    // that owns the fact.
    const tone = banner.ownProps.find((p) => p.name === 'tone');
    expect(tone?.expressed).toEqual({ schema: { type: 'string', enum: ['critical', 'info', 'warning'] }, complete: true });
  });

  it('orders the enum by value rather than in the order the checker hands the members over', () => {
    // The fixture writes `'info' | 'warning' | 'critical'`; the checker's
    // own order follows its internal type ids, which follow what the program
    // bound first, so only a sorted list is the same in every program.
    const tone = banner.ownProps.find((p) => p.name === 'tone');
    const values = tone?.expressed?.schema.enum ?? [];
    expect(values).toEqual([...values].sort());
  });

  it('classifies the ComponentProps<\'div\'> half as forwarded DOM surface, not own', () => {
    const own = new Set(banner.ownProps.map((p) => p.name));
    const forwarded = new Set(banner.forwardedProps.map((p) => p.name));
    expect(own.has('tone')).toBe(true);
    expect(own.has('id')).toBe(false);
    expect(forwarded.has('id')).toBe(true);
    expect(forwarded.has('hidden')).toBe(true);
    // No primitive library in this fixture's heritage, so nothing is this
    // component's API by way of one - the middle set is empty, not merged
    // into either of the other two.
    expect(banner.apiProps).toEqual([]);
    expect(banner.unclassifiedProps).toEqual([]);
  });

  it("resolves the host element from ComponentProps<'div'>", () => {
    expect(banner.elementKind).toBe('div');
  });
});

describe('extractComponent: a Base UI part prop is API, a React attribute is forwarded surface', () => {
  const extractions = extractComponent(fixture('base-ui-api-props.fixture.tsx'));
  const wrapsButton = extractions.find((e) => e.name === 'WrapsButtonPrimitive')!;
  const wrapsAccordionRoot = extractions.find((e) => e.name === 'WrapsAccordionRootPrimitive')!;

  it("files a Base UI part's own props as this component's API", () => {
    // The rule the whole classification exists for: these are declared under
    // @base-ui/react, so filing them by declaration file alone would have
    // called them forwarded DOM surface - which is how nine accordion-root
    // props ended up in a 233-entry generated file nobody read.
    const buttonApi = new Set(wrapsButton.apiProps.map((p) => p.name));
    for (const prop of ['nativeButton', 'render']) expect(buttonApi, prop).toContain(prop);
    const rootApi = new Set(wrapsAccordionRoot.apiProps.map((p) => p.name));
    for (const prop of ['multiple', 'value', 'defaultValue', 'onValueChange']) expect(rootApi, prop).toContain(prop);
  });

  it("files React's own DOM attributes as forwarded surface, whichever primitive is underneath", () => {
    for (const extraction of [wrapsButton, wrapsAccordionRoot]) {
      const forwarded = new Set(extraction.forwardedProps.map((p) => p.name));
      for (const prop of ['id', 'title', 'onClick', 'children']) expect(forwarded, `${extraction.name}: ${prop}`).toContain(prop);
      expect(extraction.apiProps.map((p) => p.name), extraction.name).not.toContain('onClick');
    }
  });

  it('resolves the host element each primitive renders, which is what decides the shared surface', () => {
    expect(wrapsButton.elementKind).toBe('button');
    expect(wrapsAccordionRoot.elementKind).toBe('div');
  });

  it('classifies nothing as unplaceable, so neither component is refused', () => {
    for (const extraction of [wrapsButton, wrapsAccordionRoot]) {
      expect(extraction.unclassifiedProps, extraction.name).toEqual([]);
    }
  });
});

describe('classifyDeclarationSite', () => {
  // The whole of the harness's coupling to the libraries it knows, asserted
  // directly: a package no list names resolves to neither side, which is what
  // makes the compiler refuse such a component instead of filing its API as
  // forwarded surface.
  it('recognizes the primitive libraries, the wrapped libraries and React, and nothing else', () => {
    expect(classifyDeclarationSite('@base-ui/react/accordion/root/AccordionRoot.d.mts')).toBe('primitive-library');
    expect(classifyDeclarationSite('@base-ui/react/internals/types.d.mts')).toBe('primitive-library');
    expect(classifyDeclarationSite('@shadcn/react/dist/questionnaire/index.d.ts')).toBe('primitive-library');
    for (const file of [
      'recharts/types/component/Tooltip.d.ts',
      'react-day-picker/dist/esm/types/props.d.ts',
      'cmdk/dist/index.d.ts',
      'react-resizable-panels/dist/react-resizable-panels.d.ts',
    ]) {
      expect(classifyDeclarationSite(file), file).toBe('wrapped-library');
    }
    expect(classifyDeclarationSite('@types/react/index.d.ts')).toBe('react-dom');
    expect(classifyDeclarationSite('@radix-ui/react-accordion/dist/index.d.ts')).toBe('elsewhere');
    // The kit's own files never reach this function as "own"; asked directly,
    // they belong to no dependency list.
    expect(classifyDeclarationSite('src/components/button/button.tsx')).toBe('elsewhere');
  });
});

describe("extractComponent: a prop a sibling kit file declares is this package's API", () => {
  const [trigger] = extractComponent(fixture('sibling-props.fixture.tsx'));

  it('files it with the component own props rather than leaving it unplaced', () => {
    // `loading` and `icon` come from sibling-props.base.fixture.tsx, which
    // the kit wrote; read as "declared elsewhere", the component was refused.
    const own = trigger.ownProps.map((p) => p.name);
    expect(own).toEqual(expect.arrayContaining(['icon', 'loading', 'side']));
    expect(trigger.unclassifiedProps).toEqual([]);
    expect(trigger.ownProps.find((p) => p.name === 'loading')?.declarationFile).toBe(
      'scripts/contracts/__fixtures__/sibling-props.base.fixture.tsx',
    );
  });

  it("still files React's attributes as forwarded surface and resolves the sibling's element", () => {
    expect(trigger.forwardedProps.map((p) => p.name)).toContain('onClick');
    expect(trigger.elementKind).toBe('button');
  });
});

describe('extractComponent: the libraries a component wraps', () => {
  const extractions = extractComponent(fixture('wrapped-libraries.fixture.tsx'));
  const byName = (name: string) => extractions.find((e) => e.name === name)!;

  it("reads the second primitive library's props helper for its element, and files its props as API", () => {
    const title = byName('SecondTitle');
    expect(title.elementKind).toBe('legend');
    expect(title.apiProps.map((p) => p.name)).toContain('render');
    expect(title.unclassifiedProps).toEqual([]);
    expect(title.cannotExtract).toEqual([]);
  });

  it('takes the tag a multi-tag primitive documents it renders, and says a caller may render another', () => {
    const heading = byName('PopoverHeading');
    expect(heading.elementKind).toBe('h2');
    const note = heading.cannotExtract.find((msg) => msg.includes('admits 6 host elements'));
    expect(note).toContain('"h2"');
    expect(note?.startsWith('heritage:')).toBe(true);
  });

  it("files a third-party component's props as API and reads its element from the DOM interface", () => {
    const panel = byName('Panel');
    expect(panel.elementKind).toBe('div');
    expect(panel.apiProps.map((p) => p.name)).toEqual(expect.arrayContaining(['collapsible', 'defaultSize', 'minSize']));
    expect(panel.unclassifiedProps).toEqual([]);
  });

  it('files a React attribute the library restates as its API, whatever order the declarations come in', () => {
    // The panel's props restate `id`, `className` and `style` beside
    // React's `HTMLAttributes<HTMLDivElement>`; the library's declaration is
    // the one its component documents, so it decides the set.
    const panel = byName('Panel');
    expect(panel.apiProps.map((p) => p.name)).toEqual(expect.arrayContaining(['className', 'id', 'style']));
    expect(panel.forwardedProps.map((p) => p.name)).not.toEqual(expect.arrayContaining(['id']));
  });

  it('maps a DOM interface to its tag only where it stands for one, and notes the rest', () => {
    expect(byName('Region').elementKind).toBe('div');
    expect(byName('Region').cannotExtract).toEqual([]);
    const cell = byName('Cell');
    expect(cell.elementKind).toBeUndefined();
    expect(cell.cannotExtract.some((msg) => msg.includes('"HTMLElement"') && msg.includes('no single tag'))).toBe(true);
  });
});

describe('extractComponent: a directory that only re-exports', () => {
  it("reads a re-exported primitive component as a component, with the primitive's props as its API", () => {
    const extractions = extractComponent(fixture('re-export.fixture.tsx'));
    expect(extractions.map((e) => e.name)).toEqual(['DirectionProvider']);
    const [provider] = extractions;
    expect(provider.apiProps.map((p) => p.name)).toEqual(['children', 'direction']);
    expect(provider.elementKind).toBeUndefined();
    expect(provider.forwardedProps).toEqual([]);
  });

  it('lists every re-exported name among the exports, so the enrollment report can say which are not components', () => {
    expect(listExportedDeclarationNames(fixture('re-export.fixture.tsx'))).toEqual([
      'DirectionProvider',
      'useDirection',
      'DirectionProviderProps',
    ]);
  });
});

describe('extractComponent: a union props type', () => {
  const extractions = extractComponent(fixture('union-props.fixture.tsx'));
  const picker = extractions.find((e) => e.name === 'Picker')!;
  const prop = (name: string) => picker.ownProps.find((p) => p.name === name);

  it('keeps a prop every branch declares as it was, with no branch list', () => {
    expect(prop('label')).toMatchObject({ optional: false });
    expect(prop('label')?.branches).toBeUndefined();
  });

  it('adds a prop only some branches declare, as optional and named with its branches', () => {
    expect(prop('clearable')).toMatchObject({ optional: true, branches: ['SinglePickerProps'], expressed: { schema: { type: 'boolean' } } });
  });

  it('reads a prop one branch requires as optional, since a caller may be on another branch', () => {
    expect(prop('anchor')).toMatchObject({ optional: true, branches: ['RangePickerProps'], typeText: 'string | undefined' });
  });

  it('reads an optional union parameter the same way: `undefined` adds no branch', () => {
    const optional = extractions.find((e) => e.name === 'OptionalPicker')!;
    const label = optional.ownProps.find((p) => p.name === 'label');
    expect(label?.optional).toBe(false);
    expect(label?.branches).toBeUndefined();
    expect(optional.ownProps.map((p) => p.name)).toEqual(picker.ownProps.map((p) => p.name));
  });

  it('names the declaring branches in a fixed order, not the order the checker holds them in', () => {
    expect(prop('numberOfMonths')?.branches).toEqual([...(prop('numberOfMonths')?.branches ?? [])].sort());
  });

  it('keeps the first host element where branches render different ones, and notes it; `undefined` adds no note', () => {
    const [linkOrButton] = extractComponent(fixture('union-host-elements.fixture.tsx'));
    expect(linkOrButton.elementKind).toBe('a');
    expect(linkOrButton.cannotExtract).toHaveLength(1);
    expect(linkOrButton.cannotExtract[0]).toContain('render different host elements (a, button)');
  });

  it('states nothing about a branch-only prop the branches type differently, and prints both types', () => {
    const months = prop('numberOfMonths');
    expect(months?.branches).toEqual(['RangePickerProps', 'WeekPickerProps']);
    expect(months?.expressed).toBeUndefined();
    expect(months?.typeText).toBe('number | "one" | "two" | undefined');
  });
});

describe('extractComponent: no host element for a from-scratch props type', () => {
  // Alpha/Beta (two-components.fixture.tsx) extend nothing - no DOM element,
  // no Base UI primitive - the exact shape DataTableProps has (T6): every
  // own prop is declared in the component's own file, so there is no
  // forwarded surface to name and the element walk must say so rather than
  // guessing.
  const extractions = extractComponent(fixture('two-components.fixture.tsx'));

  it('leaves elementKind undefined and every inherited set empty', () => {
    for (const extraction of extractions) {
      expect(extraction.elementKind).toBeUndefined();
      expect(extraction.apiProps).toEqual([]);
      expect(extraction.forwardedProps).toEqual([]);
      expect(extraction.unclassifiedProps).toEqual([]);
    }
  });
});

describe('extractComponent: multiple exported components in one file (F17)', () => {
  const extractions = extractComponent(fixture('two-components.fixture.tsx'));

  it('returns one extraction per exported component, not one merged extraction', () => {
    expect(extractions.map((e) => e.name).sort()).toEqual(['Alpha', 'Beta']);
  });

  it("binds each extraction to its OWN props type - neither leaks the other's props", () => {
    const alpha = extractions.find((e) => e.name === 'Alpha')!;
    const beta = extractions.find((e) => e.name === 'Beta')!;
    expect(alpha.ownProps.map((p) => p.name)).toEqual(['tone']);
    expect(beta.ownProps.map((p) => p.name)).toEqual(['emphasis']);
  });
});

describe('extractComponent: cva resolution through the checker (F16)', () => {
  it("resolves a cva config declared in a SIBLING file, not the component's own .tsx", () => {
    const [chip] = extractComponent(fixture('cva-sibling.fixture.tsx'));
    expect(chip.axes).toEqual({ tone: ['neutral', 'accent'] });
    expect(chip.defaults).toEqual({ tone: 'neutral' });
    expect(chip.cannotExtract).toEqual([]);
  });

  it('resolves a cva call imported under an aliased local name', () => {
    const [tag] = extractComponent(fixture('cva-aliased.fixture.tsx'));
    expect(tag.axes).toEqual({ size: ['sm', 'lg'] });
    expect(tag.defaults).toEqual({ size: 'sm' });
    expect(tag.cannotExtract).toEqual([]);
  });

  it("follows cva's second argument to a variable's initializer when it is not an inline object literal", () => {
    const [badge] = extractComponent(fixture('cva-config-variable.fixture.tsx'));
    expect(badge.axes).toEqual({ weight: ['light', 'bold'] });
    expect(badge.defaults).toEqual({ weight: 'light' });
    expect(badge.cannotExtract).toEqual([]);
  });

  it("follows a shared const passed as cva's `variants` to its object literal", () => {
    // avatar.tsx's shape: one `fillAxes` object behind two cva calls. Read
    // only as an inline literal, both axes reached the contract with no
    // values and no default, and nothing said so.
    const extractions = extractComponent(fixture('cva-shared-variants.fixture.tsx'));
    const inline = extractions.find((e) => e.name === 'InlineDefaults')!;
    expect(inline.axes).toEqual({ tone: ['neutral', 'accent'], variant: ['solid', 'soft'] });
    expect(inline.defaults).toEqual({ tone: 'neutral', variant: 'soft' });
    expect(inline.cannotExtract).toEqual([]);
  });

  it("follows a shared const passed as cva's `defaultVariants` the same way", () => {
    const extractions = extractComponent(fixture('cva-shared-variants.fixture.tsx'));
    const shared = extractions.find((e) => e.name === 'SharedDefaults')!;
    expect(shared.axes).toEqual({ tone: ['neutral', 'accent'], variant: ['solid', 'soft'] });
    expect(shared.defaults).toEqual({ tone: 'accent' });
    expect(shared.cannotExtract).toEqual([]);
  });

  it('reports a `cva:` cannotExtract entry when `variants` cannot be followed to an object literal', () => {
    const extractions = extractComponent(fixture('cva-shared-variants.fixture.tsx'));
    const unresolvable = extractions.find((e) => e.name === 'Unresolvable')!;
    expect(unresolvable.axes).toEqual({});
    expect(unresolvable.cannotExtract.some((msg) => msg.startsWith('cva:') && msg.includes('variants'))).toBe(true);
  });

  it('reports a `cva:` cannotExtract entry, not silence, when VariantProps names an unresolvable config', () => {
    // The negative control: a component whose VariantProps heritage cannot
    // be traced to a real cva(...) call must say so, loudly, rather than
    // compiling with an empty `variants` object indistinguishable from "no
    // variants at all" - the exact silent-loss defect F16 documents.
    const [mystery] = extractComponent(fixture('cva-unresolvable.fixture.tsx'));
    expect(mystery.axes).toEqual({});
    expect(mystery.cannotExtract.some((msg) => msg.startsWith('cva:'))).toBe(true);
    expect(mystery.cannotExtract.some((msg) => msg.includes('mysteryVariants'))).toBe(true);
  });
});

describe('extractComponent: JSDoc @default, on a real component', () => {
  // Button, not a fixture: Base UI's own nativeButton?: boolean carries a
  // real @default true tag (internals/types.d.mts), and button.tsx's own
  // focusableWhenDisabled documents @default false the same way - one
  // inherited, one own, both worth keeping next to the fact they document
  // rather than discarding at extraction time.
  const [button] = extractComponent(join(process.cwd(), 'src/components/button/button.tsx'));

  it("reads an API prop's @default tag from its Base UI declaration", () => {
    const nativeButton = button.apiProps.find((p) => p.name === 'nativeButton');
    expect(nativeButton?.jsDocDefault).toBe('true');
  });

  it("reads an own prop's @default tag from the component's own declaration", () => {
    const focusableWhenDisabled = button.ownProps.find((p) => p.name === 'focusableWhenDisabled');
    expect(focusableWhenDisabled?.jsDocDefault).toBe('false');
  });
});

describe('what JSON Schema can state about a prop type', () => {
  const [picker] = extractComponent(fixture('untypeable-props.fixture.tsx'));
  const prop = (name: string) => picker.ownProps.find((p) => p.name === name);

  it('unwraps an alias to the array behind it, with the element type as items', () => {
    // The defect a reviewer found on the accordion contract, reproduced:
    // `Chosen` is `Value[]` with `Value = string`, and a classifier reading
    // the printed alias NAME declares it inexpressible. Nothing about the
    // name is expressible; the type is an array of strings.
    expect(prop('chosen')?.expressed).toEqual({ schema: { type: 'array', items: { type: 'string' } }, complete: true });
  });

  it('states the kind of an array whose element type it cannot state', () => {
    // `Value[]` over the component's own unconstrained parameter: still an
    // array, so `type` is not withheld, and `items` is - a partial `items`
    // would constrain what the element does not.
    expect(prop('selection')?.expressed).toEqual({ schema: { type: 'array' }, complete: false });
  });

  it('states nothing about a function prop', () => {
    expect(prop('onSelectionChange')?.expressed).toBeUndefined();
  });

  it('states a plain string prop in full', () => {
    expect(prop('label')?.expressed).toEqual({ schema: { type: 'string' }, complete: true });
  });

  it('names every prop type without a module specifier in it', () => {
    // A printed `import("<path>")` puts the machine's own filesystem layout
    // and a foreign package's internal file names into a committed
    // artifact. React's `style` and `onClick` arrive through
    // ComponentProps<'div'> and are exactly where the printer would emit
    // one.
    const everyProp = [...picker.ownProps, ...picker.apiProps, ...picker.forwardedProps, ...picker.unclassifiedProps];
    expect(everyProp.filter((p) => p.typeText.includes('import(')).map((p) => p.name)).toEqual([]);
    expect(prop('onSelectionChange')?.typeText).toBe('(next: Value[]) => void');
  });
});

describe('stripModuleSpecifiers', () => {
  it('keeps the type name and drops the module it was resolved from', () => {
    expect(stripModuleSpecifiers('import("@types/react/index").CSSProperties | undefined')).toBe('CSSProperties | undefined');
  });

  it('leaves text with no specifier in it alone', () => {
    expect(stripModuleSpecifiers('(next: Value[]) => void')).toBe('(next: Value[]) => void');
  });
});

describe('extractComponent: heritage shapes recognized by resolved symbol, not identifier text (M1)', () => {
  it('classifies an aliased ComponentProps import the same as the unaliased form', () => {
    // `import { ComponentProps as ReactComponentProps }` - a text match on
    // the identifier "ComponentProps" would have missed this entirely.
    const [card] = extractComponent(fixture('aliased-component-props.fixture.tsx'));
    expect(card.cannotExtract).toEqual([]);
    expect(card.elementKind).toBe('section');
    expect(card.ownProps.map((p) => p.name)).toContain('heading');
    expect(card.forwardedProps.map((p) => p.name)).toContain('id');
  });

  it('does not mistake a locally shadowed "Omit" for the real global utility type', () => {
    // Omit has no module export to alias via `import ... as ...` - the
    // failure mode that matters for it is the opposite of ComponentProps's:
    // a local name collision. A text match would unwrap this shadow's first
    // "type argument" (ComponentProps<'span'>) and silently
    // resolve a `span` forwarded kind/origin through a utility type that
    // is not really Omit<T, K> at all. The forwarded props ARE present on
    // the checker-resolved type (this shadow really does forward them) -
    // proving this is a case of "found real props, refused to guess which
    // element they belong to," not "there was nothing here to find." The
    // compiler refuses such a component; see compileContract.
    const [gadget] = extractComponent(fixture('aliased-omit.fixture.tsx'));
    expect(gadget.elementKind).toBeUndefined();
    expect(gadget.forwardedProps.length).toBeGreaterThan(0);
    expect(gadget.cannotExtract.length).toBeGreaterThan(0);
  });

  it('reports a cannotExtract entry for a heritage member wrapped in an unrecognized generic type helper', () => {
    // `Readonly<ComponentProps<'div'>>` - Readonly IS a real, resolvable
    // type alias, so the walk unwraps into it, but its underlying shape (a
    // mapped type) is a node kind neither walk understands, and the walk
    // says so rather than giving up in silence.
    const [widget] = extractComponent(fixture('unknown-wrapper.fixture.tsx'));
    expect(widget.cannotExtract.some((msg) => msg.includes('MappedType'))).toBe(true);
  });
});

describe('extractComponent: bare union type in heritage position (N2)', () => {
  it('walks each branch instead of silently resolving nothing, and reads the props of both', () => {
    // A union of props types is walked branch by branch, the way its props
    // are read, so there is nothing left unread.
    const [swatch] = extractComponent(fixture('bare-union-heritage.fixture.tsx'));
    expect(swatch.cannotExtract).toEqual([]);
    expect(swatch.ownProps.map((p) => p.name)).toEqual(['label', 'tone']);
  });
});

describe('extractComponent: a hyphenated element tag reaches a snake_case token (M2)', () => {
  const ELEMENT_ID_PATTERN = new RegExp(elementTypeIdPattern());

  it("keeps the tag as the element kind and normalizes it only where an identifier needs it", () => {
    // Two different things, deliberately: the element kind is the real tag
    // (what a reader and the description call it), and the token is what an
    // identifier and a file name can carry.
    const [widget] = extractComponent(fixture('custom-element-kind.fixture.tsx'));
    expect(widget.elementKind).toBe('my-custom-element');
    expect(domElementToken(widget.elementKind!)).toBe('dom_my_custom_element');
    expect(elementTypeId(domElementToken(widget.elementKind!))).toMatch(ELEMENT_ID_PATTERN);
  });
});

describe('extractComponent: duplicate VariantProps axis names (N1)', () => {
  it('reports a cannotExtract entry naming both sources instead of silently overwriting the axis', () => {
    const [duplicate] = extractComponent(fixture('duplicate-axis.fixture.tsx'));
    const conflict = duplicate.cannotExtract.find((msg) => msg.includes('axis "size"'));
    expect(conflict).toBeDefined();
    expect(conflict).toContain('sizeVariants');
    expect(conflict).toContain('otherSizeVariants');
    // The first-seen heritage entry's values are kept, not overwritten.
    expect(duplicate.axes.size).toEqual(['sm', 'lg']);
  });
});

describe('extractComponent: synthetic property symbol with no declaration (N4)', () => {
  const [widget] = extractComponent(fixture('synthetic-property.fixture.tsx'));

  it('reports a cannotExtract entry for each undeclared synthetic prop', () => {
    expect(widget.cannotExtract.some((msg) => msg.includes('"a"'))).toBe(true);
    expect(widget.cannotExtract.some((msg) => msg.includes('"b"'))).toBe(true);
  });

  it('never emits declarationFile: "unknown" as ordinary prop data', () => {
    const allProps = [...widget.ownProps, ...widget.apiProps, ...widget.forwardedProps, ...widget.unclassifiedProps];
    expect(allProps.some((p) => p.declarationFile === 'unknown')).toBe(false);
  });

  it('still classifies the real own prop correctly', () => {
    expect(widget.ownProps.map((p) => p.name)).toContain('own');
  });
});

describe('extractComponent: components that render through Base UI useRender', () => {
  const extractions = extractComponent(fixture('use-render-component.fixture.tsx'));

  it('recognizes a body that returns useRender(...) with no JSX in it', () => {
    // The kit's own polymorphism idiom: the hook returns the element, so
    // there is no JSX node to find. Eight files under src/components write
    // components this way, and each was read as not a component at all.
    const tag = extractions.find((e) => e.name === 'Tag');
    expect(tag).toBeDefined();
    expect(tag?.ownProps.map((p) => p.name)).toContain('tone');
  });

  it('resolves the hook by symbol, so an aliased import counts too', () => {
    const aliased = extractions.find((e) => e.name === 'AliasedTag');
    expect(aliased).toBeDefined();
    expect(aliased?.ownProps.map((p) => p.name)).toContain('label');
  });

  it("reads the host element from useRender.ComponentProps<'span'>, with nothing left unread", () => {
    // The hook's props helper is `ComponentPropsWithRef<ElementType>` plus
    // `render`; unwrapped instead of recognised, the walk reached React's
    // helper holding the unbound `ElementType` and lost the tag, so every
    // such component forwarded a DOM surface with no element to name it.
    for (const name of ['Tag', 'AliasedTag']) {
      const extraction = extractions.find((e) => e.name === name);
      expect(extraction?.elementKind, name).toBe('span');
      expect(extraction?.forwardedProps.length, name).toBeGreaterThan(0);
      expect(extraction?.cannotExtract, name).toEqual([]);
    }
  });
});

describe('extractComponent: an element argument that is not a tag', () => {
  it('records the argument it could not read instead of returning with nothing said', () => {
    // `ComponentProps<'h1' | 'h2'>` names two tags, so no single host
    // element resolves; the forwarded props are still there, which is what
    // makes the silence worth breaking - the compiler refuses the component,
    // and the note is what says why.
    const [heading] = extractComponent(fixture('host-element-argument.fixture.tsx'));
    expect(heading.elementKind).toBeUndefined();
    expect(heading.forwardedProps.length).toBeGreaterThan(0);
    const note = heading.cannotExtract.find((msg) => msg.includes('host element'));
    expect(note).toContain(`"'h1' | 'h2'"`);
    expect(note).toContain('UnionType');
    expect(note?.startsWith('cva:')).toBe(false);
  });
});

describe('extractComponent: an element argument that names a component with typeof', () => {
  const extractions = extractComponent(fixture('queried-component-props.fixture.tsx'));
  const byName = (name: string) => extractions.find((e) => e.name === name)!;

  it("continues into a kit-style component's own props type", () => {
    expect(byName('QueriesLocal').elementKind).toBe('section');
    expect(byName('QueriesLocal').cannotExtract).toEqual([]);
  });

  it("continues into a primitive part's props, which only its instantiated type carries", () => {
    // `ComponentPropsWithRef<typeof AccordionPrimitive.Trigger>`: the part is
    // a ForwardRefExoticComponent, whose parameter is React's unbound `P`,
    // so the tag is read off the part's own BaseUIComponentProps<'button'>.
    const primitive = byName('QueriesPrimitive');
    expect(primitive.elementKind).toBe('button');
    expect(primitive.cannotExtract).toEqual([]);
    expect(primitive.apiProps.map((p) => p.name)).toContain('nativeButton');
  });

  it('reads Parameters<typeof X>[0] as the same props type', () => {
    expect(byName('QueriesByParameters').elementKind).toBe('section');
    expect(byName('QueriesByParameters').cannotExtract).toEqual([]);
  });

  it('walks the last overload of an overloaded component and names the ones it passed over', () => {
    // TypeScript infers `ComponentProps<typeof X>` from the last overload,
    // so that is the host element; the earlier overload's `article` is a
    // props type the walk did not read, and the note is what says so.
    const overloaded = byName('QueriesOverloaded');
    expect(overloaded.elementKind).toBe('aside');
    const note = overloaded.cannotExtract.find((msg) => msg.includes('overloads'));
    expect(note).toContain('"Overloaded"');
    expect(note).toContain('2 overloads');
    expect(note?.startsWith('heritage:')).toBe(true);
  });
});

describe('extractComponent: components exported as an alias of a primitive', () => {
  const extractions = extractComponent(fixture('alias-component.fixture.tsx'));

  it('recognizes a body-less export whose type is a component-typed callable', () => {
    // Fifteen exports in the kit are the root of their directory written this
    // way, so a walk that needs a body to read missed the first thing a
    // consumer of each of those directories writes. The props come from the
    // aliased callable's own signature, and the primitive library declares
    // them, so they file as API props.
    const root = extractions.find((e) => e.name === 'Root');
    expect(root).toBeDefined();
    expect(root?.apiProps.map((p) => p.name)).toContain('onOpenChange');
  });

  it('reads the initializer type, so an alias of a local alias counts too', () => {
    const aliased = extractions.find((e) => e.name === 'AliasedRoot');
    expect(aliased).toBeDefined();
    expect(aliased?.apiProps.map((p) => p.name)).toContain('onOpenChange');
  });

  it('leaves out an alias of a callable that merely returns a ReactNode', () => {
    // A number formatter returns a string, and a string is a ReactNode: the
    // test is whether the return can be an ELEMENT, not whether React would
    // render it.
    expect(extractions.map((e) => e.name)).not.toContain('FormatPrice');
  });
});

describe('extractComponent: forwardRef/memo-wrapped components (M8)', () => {
  it('recognizes a memo(...)-wrapped export as component-shaped', () => {
    const extractions = extractComponent(fixture('memo-component.fixture.tsx'));
    const ping = extractions.find((e) => e.name === 'Ping');
    expect(ping).toBeDefined();
    expect(ping?.ownProps.map((p) => p.name)).toEqual(['label']);
  });
});

describe('extractComponent: every prop list sorted by name (N3)', () => {
  it('returns each of the four prop lists in ascending name order', () => {
    const [button] = extractComponent(join(process.cwd(), 'src/components/button/button.tsx'));
    for (const list of [button.ownProps, button.apiProps, button.forwardedProps, button.unclassifiedProps]) {
      const names = list.map((p) => p.name);
      expect(names).toEqual([...names].sort());
    }
  });
});

describe('extractComponent: a boolean cva variant', () => {
  const [panel] = extractComponent(fixture('boolean-axis.fixture.tsx'));

  it('reads the variant map keys as written, and names which axes are boolean', () => {
    expect(panel.axes).toEqual({
      fullWidth: ['true', 'false'],
      raised: ['true'],
      unstyled: ['false'],
      emphasis: ['low', 'high'],
    });
    expect(panel.booleanAxes).toEqual(['fullWidth', 'raised', 'unstyled']);
  });

  it('reads a boolean default instead of losing it, and reports nothing it could not read', () => {
    // The default is written as `false`, not as a string literal; read as a
    // string only, it would be lost, and a note that did not begin `cva:`
    // would let the axis ship with no default at all.
    expect(panel.defaults).toEqual({ fullWidth: 'false', emphasis: 'low' });
    expect(panel.cannotExtract).toEqual([]);
  });
});

describe('isBooleanAxis', () => {
  it('recognizes every shape cva uses for a boolean variant, both single-key forms included', () => {
    // cva resolves `StringToBoolean<'false'>` to `boolean` exactly as it
    // resolves the `'true'` key, so a map with only a `false` key types the
    // prop as a boolean too - compiled as a string enum it stated a prop
    // accepting only the string "false", which no caller can satisfy.
    expect(isBooleanAxis(['true', 'false'])).toBe(true);
    expect(isBooleanAxis(['false', 'true'])).toBe(true);
    expect(isBooleanAxis(['true'])).toBe(true);
    expect(isBooleanAxis(['false'])).toBe(true);
  });

  it('is false for a string axis, including one that merely contains "true"', () => {
    // A map pairing `true` with real string keys is an ordinary string axis
    // whose keys happen to include one.
    for (const values of [['low', 'high'], ['true', 'high'], [], ['true', 'false', 'maybe']]) {
      expect(isBooleanAxis(values), values.join('|')).toBe(false);
    }
  });
});

describe('extractComponent: defaults a component writes into its own destructured props', () => {
  const extractions = extractComponent(fixture('prop-defaults.fixture.tsx'));
  const byName = (name: string) => extractions.find((e) => e.name === name)!;

  it('reads every literal kind: string, number, negative number, boolean and null', () => {
    expect(byName('Chip').propDefaults).toEqual({ tone: 'info', count: 3, dense: false, hint: null, offset: -1 });
    expect(byName('Chip').cannotExtract).toEqual([]);
  });

  it('reads a default written over a reused variant axis beside the variant declaration it overrides', () => {
    const outline = byName('OutlineAction');
    expect(outline.defaults).toEqual({ variant: 'default' });
    expect(outline.propDefaults).toEqual({ variant: 'outline' });
  });

  it('does not take an axis the path removes with Omit, so the component own declaration of it is read', () => {
    const quiet = byName('QuietAction');
    expect(quiet.axes).toEqual({});
    expect(quiet.defaults).toEqual({});
    expect(quiet.ownProps.find((p) => p.name === 'variant')?.expressed).toEqual({
      schema: { type: 'string', enum: ['loud', 'quiet'] },
      complete: true,
    });
    expect(quiet.propDefaults).toEqual({ variant: 'quiet' });
  });

  it('does not take an axis an Omit removes on the instantiated type an alias is read from', () => {
    const aliased = byName('OmitAliased');
    expect(aliased.hasBody).toBe(false);
    expect(aliased.axes).toEqual({});
    expect(aliased.ownProps.map((p) => p.name)).toEqual(['label']);
  });

  it('does not take an axis a Pick leaves out', () => {
    expect(byName('LabelOnly').axes).toEqual({});
    expect(byName('LabelOnly').defaults).toEqual({});
  });

  it('reads a renamed binding under the prop name it reads', () => {
    expect(byName('Renamed').propDefaults).toEqual({ tone: 'info' });
  });

  it('notes a computed default instead of evaluating or dropping it', () => {
    const sized = byName('Sized');
    expect(sized.propDefaults).toEqual({});
    expect(sized.cannotExtract).toEqual([
      'default: prop "size" defaults to "DEFAULT_SIZE", which is not a literal - the body gives no single literal default for it',
    ]);
  });
});

describe('extractComponent: whether a component has a body of its own', () => {
  const extractions = extractComponent(fixture('rendered-root.fixture.tsx'));
  const byName = (name: string) => extractions.find((e) => e.name === name)!;

  it('is true for a body whatever it returns first - null, a fragment, one of two elements', () => {
    for (const name of ['NullFirst', 'InFragment', 'EitherTag']) expect(byName(name).hasBody, name).toBe(true);
  });

  it('is false for an alias of a callable declared elsewhere', () => {
    expect(byName('Aliased').hasBody).toBe(false);
  });
});

describe('extractComponent: defaults a body gives other than as a destructured default', () => {
  const extractions = extractComponent(fixture('body-defaults.fixture.tsx'));
  const byName = (name: string) => extractions.find((e) => e.name === name)!;

  it('reads `binding ?? <literal>` as the default, over the reused variant default', () => {
    expect(byName('Coalesced').defaults).toEqual({ variant: 'default' });
    expect(byName('Coalesced').propDefaults).toEqual({ variant: 'ghost' });
  });

  it('notes a binding read both through `??` and as its own value', () => {
    expect(byName('CoalescedRaw').propDefaults).toEqual({});
    expect(byName('CoalescedRaw').cannotExtract[0]).toMatch(/read through `\?\?` and also as its own value/);
  });

  it('reads literal attributes written before the rest spread, or the whole-props spread, for props the spread carries', () => {
    for (const name of ['AttributeFirst', 'AttributeFirstBound']) {
      expect(byName(name).propDefaults, name).toEqual({ variant: 'ghost', size: 2, disabled: true });
    }
  });

  it('reads no default from an attribute written after the spread, which overrides the caller', () => {
    expect(byName('AttributeAfter').propDefaults).toEqual({});
  });

  it('notes a spread on one of several returned elements rather than stating its attributes', () => {
    expect(byName('TwoElements').propDefaults).toEqual({});
    expect(byName('TwoElements').cannotExtract[0]).toMatch(/not the one element the body returns/);
  });
});

describe('extractComponent: an Omit or Pick whose keys it cannot list', () => {
  it('refuses the axes reached through it, rather than keeping ones it may have removed', () => {
    const [omitted] = extractComponent(fixture('body-defaults.fixture.tsx')).filter((e) => e.name === 'OmitGeneric');
    expect(omitted.cannotExtract).toEqual([
      'cva: "typeof baseVariants" is reached through an Omit or Pick whose keys (K) are not string literals - which of its axes the component takes cannot be read',
    ]);
  });

  it('reads `keyof X` through the checker where it resolves to literal keys', () => {
    const [keyof] = extractComponent(fixture('body-defaults.fixture.tsx')).filter((e) => e.name === 'OmitKeyof');
    expect(keyof.axes).toEqual({});
    expect(keyof.cannotExtract).toEqual([]);
  });
});

describe('extractComponent: the edges of a body-written default', () => {
  const extractions = extractComponent(fixture('body-defaults-edges.fixture.tsx'));
  const byName = (name: string) => extractions.find((e) => e.name === name)!;
  const notOnlyReturn = /not the one element the body returns/;

  it('counts a shorthand property as a raw read of the binding, so `??` there is no default', () => {
    expect(byName('ShorthandRaw').propDefaults).toEqual({});
    expect(byName('ShorthandRaw').cannotExtract[0]).toMatch(/also as its own value/);
  });

  it('reads no default where another return renders a fragment or a call, and notes it', () => {
    for (const name of ['FragmentPath', 'CallPath']) {
      expect(byName(name).propDefaults, name).toEqual({});
      expect(byName(name).cannotExtract[0], name).toMatch(notOnlyReturn);
    }
  });

  it('reads no default from a spread under a conditional, an `as` expression or a nested element, and notes it', () => {
    for (const name of ['Ternary', 'AsExpr', 'NestedSpread']) {
      expect(byName(name).propDefaults, name).toEqual({});
      expect(byName(name).cannotExtract[0], name).toMatch(notOnlyReturn);
    }
  });

  it("reads no return of an object method or getter as the component's own", () => {
    for (const name of ['MethodReturn', 'GetterReturn']) {
      expect(byName(name).propDefaults, name).toEqual({});
      expect(byName(name).cannotExtract, name).toEqual([]);
    }
  });

  it('reads no default where another spread follows the rest, and notes it', () => {
    expect(byName('LaterSpread').propDefaults).toEqual({});
    expect(byName('LaterSpread').cannotExtract[0]).toMatch(/another spread follows the rest spread/);
  });

  it('reads a `null` early return as rendering nothing, so the element stays the only one', () => {
    expect(byName('NullPath').propDefaults).toEqual({ variant: 'ghost' });
  });

  it('reads no default from `||` or a re-bound rest', () => {
    for (const name of ['OrDefault', 'Rebound']) expect(byName(name).propDefaults, name).toEqual({});
  });

  it('notes a binding the body reassigns, `??=` included, rather than stating a default', () => {
    for (const name of ['Reassigned', 'NullishAssign']) {
      expect(byName(name).propDefaults, name).toEqual({});
      expect(byName(name).cannotExtract[0], name).toMatch(/is reassigned in the body/);
    }
  });

  it('reads a literal `??` wherever every read of the binding is one, a closure included', () => {
    expect(byName('ClosureOnly').propDefaults).toEqual({ size: 5 });
    expect(byName('CoalescedElsewhere').propDefaults).toEqual({ size: 4 });
  });

  it('reads through forwardRef and memo', () => {
    expect(byName('Forwarded').propDefaults).toEqual({ variant: 'ghost' });
    expect(byName('Memoed').propDefaults).toEqual({ size: 3 });
  });

  it('records nothing for a computed fallback alone', () => {
    const [chained] = extractComponent(fixture('body-defaults.fixture.tsx')).filter((e) => e.name === 'CoalescedComputed');
    expect(chained.propDefaults).toEqual({});
    expect(chained.cannotExtract).toEqual([]);
  });
});

describe('extractComponent: Omit key sets the checker lists another way', () => {
  const extractions = extractComponent(fixture('omit-key-sets.fixture.tsx'));
  const byName = (name: string) => extractions.find((e) => e.name === name)!;

  it('reads keys named through a type alias, so the axis they remove is not refused', () => {
    expect(byName('AliasKeys').axes).toEqual({});
    expect(byName('AliasKeys').cannotExtract).toEqual([]);
  });

  it('reads a key set that resolves to never as removing nothing', () => {
    for (const name of ['OmitNever', 'OmitKeyofEmpty']) {
      expect(byName(name).axes, name).toEqual({ variant: ['a', 'b'] });
      expect(byName(name).cannotExtract, name).toEqual([]);
    }
  });

  it('reads an Omit instantiated inside a generic factory through a type query', () => {
    expect(byName('ViaQuery').axes).toEqual({ variant: ['a', 'b'] });
    expect(byName('ViaQuery').cannotExtract).toEqual([]);
  });
});

describe('extractComponent: the rest or props object used beyond its spread', () => {
  const extractions = extractComponent(fixture('rest-uses.fixture.tsx'));
  const byName = (name: string) => extractions.find((e) => e.name === name)!;
  const touched = /is also read or written through the rest binding in the body/;

  it('states no default for a prop the body reads or writes through the rest or the whole props, and notes it', () => {
    for (const name of ['WholeRawRead', 'RestRawRead', 'MutateRest', 'AssignRest', 'RestReassigned', 'WholeNullishAssign']) {
      expect(byName(name).propDefaults, name).toEqual({});
      expect(byName(name).cannotExtract, name).toEqual([expect.stringMatching(touched)]);
    }
  });

  it('notes a rest spread under a conditional, twice on the element, or returned through `satisfies`', () => {
    expect(byName('CondSpread').propDefaults).toEqual({});
    expect(byName('CondSpread').cannotExtract[0]).toMatch(/spread conditionally on the returned element/);
    expect(byName('RestTwice').cannotExtract[0]).toMatch(/another spread follows the rest spread/);
    expect(byName('Satisfies').cannotExtract[0]).toMatch(/not the one element the body returns/);
  });

  it('counts the rest handed on as a shorthand property as a use of the whole object', () => {
    expect(byName('ShorthandHook').propDefaults).toEqual({});
    expect(byName('ShorthandHook').cannotExtract).toEqual([expect.stringMatching(touched)]);
  });

  it('notes no conditional spread whose only attribute before it is destructured', () => {
    expect(byName('CondSpreadDestructured').propDefaults).toEqual({});
    expect(byName('CondSpreadDestructured').cannotExtract).toEqual([]);
  });

  it('reads a default through try/finally, and none through a copy of the props', () => {
    expect(byName('TryFinally').propDefaults).toEqual({ variant: 'ghost' });
    expect(byName('ComputedSpread').propDefaults).toEqual({});
  });

  it('reads a coalesced default only for a prop the contract states', () => {
    expect(byName('CoalescedForwarded').propDefaults).toEqual({});
    expect(byName('CoalescedForwarded').cannotExtract).toEqual([]);
    for (const name of ['CoalescedTone', 'Tmpl', 'Shadow']) expect(byName(name).propDefaults, name).toEqual({ tone: 'warm' });
  });

  it('records nothing for a binding the body reassigns but never coalesces', () => {
    expect(byName('ReassignedOnly').propDefaults).toEqual({});
    expect(byName('ReassignedOnly').cannotExtract).toEqual([]);
  });
});

describe('extractComponent: key sets and index keys the checker resolves', () => {
  const extractions = extractComponent(fixture('key-sets-and-indexes.fixture.tsx'));
  const byName = (name: string) => extractions.find((e) => e.name === name)!;

  it('reads never, an alias, keyof and Exclude key sets, and Pick of never keeps nothing', () => {
    expect(byName('OmitNone').axes).toEqual({ variant: ['a', 'b'], size: ['s', 'm'] });
    expect(byName('OmitExclude').axes).toEqual({ variant: ['a', 'b'], size: ['s', 'm'] });
    expect(byName('OmitAlias').axes).toEqual({ variant: ['a', 'b'] });
    expect(byName('OmitKeyofOther').axes).toEqual({ variant: ['a', 'b'] });
    expect(byName('PickNever').axes).toEqual({});
    for (const name of ['OmitNone', 'OmitExclude', 'OmitAlias', 'OmitKeyofOther', 'PickNever']) {
      expect(byName(name).cannotExtract, name).toEqual([]);
    }
  });

  it('counts a StringMapping or template-literal index key as admitting unlisted names, and nothing else', () => {
    for (const name of ['MappedIdx', 'MappedOverButton', 'TemplateOverButton']) expect(byName(name).admitsUnlistedProps, name).toBe(true);
    for (const name of ['UnionHandlers', 'NoHandlerButton', 'Generic']) expect(byName(name).admitsUnlistedProps, name).toBe(false);
  });
});
