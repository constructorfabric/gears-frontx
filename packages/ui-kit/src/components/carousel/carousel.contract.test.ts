// Conformance for the five Carousel contracts (root, content, item, previous,
// next) - one file because the interesting assertions are about how the five
// relate (family membership, what nests where), not about any one in
// isolation. The per-component shape comes from testing.ts's
// assertContractFreshness.
import Ajv2020 from 'ajv/dist/2020';
import { describe, expect, it } from 'vitest';

import {
  addContractTypes,
  buildComponentType,
  contractMajor,
  familyRoster,
  liftPropsSchema,
  pascalCase,
} from '../../../scripts/contracts/compile';
import { bareGtsId, componentRef, elementTypeRef } from '../../../scripts/contracts/ids';
import {
  applyContractTestTimeout,
  assertContractFreshness,
  compileUnits,
  resolveComponentRef,
  unitStore,
  validateContractInstance,
} from '../../../scripts/contracts/testing';

// Must run before any describe()/it() in the file; see
// applyContractTestTimeout's own comment in testing.ts.
applyContractTestTimeout();

const DIRECTORY = 'carousel';
const PART_STEMS = ['carousel-content', 'carousel-item', 'carousel-previous', 'carousel-next'] as const;
const NAV_STEMS = ['carousel-previous', 'carousel-next'] as const;
const ALL_STEMS = [DIRECTORY, ...PART_STEMS] as const;

for (const stem of ALL_STEMS) assertContractFreshness(DIRECTORY, stem);

const units = compileUnits(DIRECTORY, ALL_STEMS);
const componentType = buildComponentType();
const ref = (stem: string) => componentRef(stem, contractMajor(DIRECTORY, stem));
// Button sits outside the family: the root hosts it as a custom step control,
// at Button's own major.
const BUTTON_REF = componentRef('button', contractMajor('button', 'button'));

describe('carousel family: component type validity', () => {
  it('every contract validates against the component type', () => {
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

describe('carousel family: membership resolves', () => {
  it('the root names the family, calls itself root, and carries every part', () => {
    const root = units[DIRECTORY].contract.family_membership;
    expect(root?.name).toBe('carousel');
    expect(root?.role).toBe('root');
    expect(root?.members).toEqual(PART_STEMS.map(ref).sort());
  });

  it('every part names the same family, calls itself a part, and lists no members', () => {
    for (const stem of PART_STEMS) {
      const membership = units[stem].contract.family_membership;
      expect(membership?.name, stem).toBe('carousel');
      expect(membership?.role, stem).toBe('part');
      expect(membership?.members, stem).toBeUndefined();
    }
  });

  it('every part the root carries ships a compiled contract of its own', () => {
    for (const member of units[DIRECTORY].contract.family_membership?.members ?? []) {
      const target = resolveComponentRef(member);
      expect(target.contractId, `${member}: ${target.stem} ships no compiled contract`).toBe(member);
    }
  });

  it('the root is the only member the roster calls a root', () => {
    const roster = familyRoster('carousel');
    expect(roster.root).toBe(ref(DIRECTORY));
    expect(roster.parts).toEqual(PART_STEMS.map(ref).sort());
  });
});

describe('carousel family: what nests where', () => {
  it('the root accepts the track, the two step buttons and a custom Button, plus inline text', () => {
    expect(units[DIRECTORY].contract.accepts).toEqual({
      content: 'specified',
      text: true,
      components: [ref('carousel-content'), ref('carousel-previous'), ref('carousel-next'), BUTTON_REF],
    });
  });

  it('the track accepts slides only, and a slide accepts anything', () => {
    expect(units['carousel-content'].contract.accepts).toEqual({ content: 'specified', components: [ref('carousel-item')] });
    expect(units['carousel-item'].contract.accepts).toEqual({ content: 'unconstrained' });
  });

  it('every part mount point is FILLED from the contract that accepts it', () => {
    const rootMount = [{ container: pascalCase(DIRECTORY), component: ref(DIRECTORY) }];
    expect(units['carousel-content'].contract.mounted_in).toEqual(rootMount);
    for (const stem of NAV_STEMS) expect(units[stem].contract.mounted_in, stem).toEqual(rootMount);
    expect(units['carousel-item'].contract.mounted_in).toEqual([
      { container: pascalCase('carousel-content'), component: ref('carousel-content') },
    ]);
  });

  it('every nesting reference in the family points inside the family, except the custom Button', () => {
    const familyRefs = new Set(Object.values(units).map(({ contract }) => bareGtsId(String(contract.$id))));
    for (const { stem, contract } of Object.values(units)) {
      const mounts = (contract.mounted_in ?? []).map((entry) => entry.component).filter((r): r is string => r !== undefined);
      for (const target of [...(contract.accepts.components ?? []), ...mounts]) {
        if (stem === DIRECTORY && target === BUTTON_REF) continue;
        expect(familyRefs.has(target), `${stem}: it names "${target}", which is not a member of this family`).toBe(true);
      }
    }
  });
});

describe('carousel family: what the schema cannot assert', () => {
  it("the root's engine-typed props each carry a statement the compiler folds into the property description", () => {
    const contract = units[DIRECTORY].contract;
    const statements = contract.prop_statements ?? {};
    for (const prop of ['opts', 'plugins', 'setApi']) {
      expect(Object.keys(statements), prop).toContain(prop);
      expect(contract.props.properties[prop].description, prop).toContain(statements[prop].states);
    }
  });

  it('the step buttons carry Button props except icon, the glyph they fix', () => {
    for (const stem of NAV_STEMS) {
      const properties = units[stem].contract.props.properties;
      for (const prop of ['variant', 'size', 'loading', 'render']) expect(properties, `${stem}.${prop}`).toHaveProperty(prop);
      expect(properties, `${stem}.icon`).not.toHaveProperty('icon');
    }
  });

  it('the root lists its hook and engine types as companions', () => {
    const companions = (units[DIRECTORY].contract.companions ?? []).map((entry) => entry.export).sort();
    expect(companions).toEqual(['CarouselApi', 'CarouselOptions', 'CarouselPlugin', 'useCarousel']);
  });
});

describe('carousel family in a GTS store', () => {
  it('every component in the family validates as an instance of the component type', () => {
    const gts = unitStore(Object.values(units));
    for (const { stem, contract } of Object.values(units)) {
      const result = gts.validateInstance(contract.$id);
      expect(result.ok, `${stem}: ${result.error}`).toBe(true);
    }
  });

  it('each part names the surface of the element it renders', () => {
    for (const { stem, contract, elementSurface } of Object.values(units)) {
      expect(contract.forwards_to, stem).toBe(bareGtsId(String(elementSurface.$id)));
    }
    for (const stem of [DIRECTORY, 'carousel-content', 'carousel-item']) {
      expect(units[stem].contract.forwards_to, stem).toBe(elementTypeRef('dom_div'));
    }
    for (const stem of NAV_STEMS) expect(units[stem].contract.forwards_to, stem).toBe(elementTypeRef('dom_button'));
  });

  it('fails when the component type is not registered - negative control', () => {
    const gts = unitStore(Object.values(units), { componentType: false, vocabulary: false });
    const result = gts.validateInstance(units[DIRECTORY].contract.$id);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Schema not found');
  });

  it('every component validates as an instance of the committed component type', () => {
    for (const { stem, contract } of Object.values(units)) {
      const result = validateContractInstance(contract);
      expect(result.ok, `${stem}: ${result.error}`).toBe(true);
    }
  });

  it('rejects the root when it carries an unknown key - negative control', () => {
    const root = units[DIRECTORY].contract;
    const corrupted = { ...root, bogus_field: true } as typeof root;
    const result = validateContractInstance(corrupted);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/additional propert/i);
  });
});
