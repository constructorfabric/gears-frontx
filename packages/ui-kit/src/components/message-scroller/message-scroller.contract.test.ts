// Conformance for the six contracts of this directory: the MessageScroller
// family (the root and its four parts) and MessageScrollerProvider, which
// wraps the root from above, renders no element and belongs to no family.
// One file because the interesting assertions are about how the contracts
// relate (family membership, composition refs), not about any one of them in
// isolation. See message.contract.test.ts and tooltip.contract.test.ts for
// the shapes this follows.
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

const DIRECTORY = 'message-scroller';
const PROVIDER = 'message-scroller-provider';
const VIEWPORT = 'message-scroller-viewport';
const CONTENT = 'message-scroller-content';
const ITEM = 'message-scroller-item';
const BUTTON = 'message-scroller-button';
const PART_STEMS = [VIEWPORT, CONTENT, ITEM, BUTTON] as const;
const FAMILY_STEMS = [DIRECTORY, ...PART_STEMS] as const;
const ALL_STEMS = [...FAMILY_STEMS, PROVIDER] as const;

for (const stem of ALL_STEMS) assertContractFreshness(DIRECTORY, stem);

// The provider renders no element of its own (the primitive's Provider is
// context only), so the units are compiled host-optional.
const units = compileUnits(DIRECTORY, ALL_STEMS, { allowNoHostElement: true });
const componentType = buildComponentType();

const ref = (stem: string) => componentRef(stem, contractMajor(DIRECTORY, stem));
const ROOT_REF = ref(DIRECTORY);

describe('message-scroller directory: component type validity', () => {
  it('all six contracts validate against the component type', () => {
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

describe('message-scroller family: membership resolves', () => {
  it('the root names the family, calls itself root, and carries all four parts', () => {
    const root = units[DIRECTORY].contract.family_membership;
    expect(root?.name).toBe('message_scroller');
    expect(root?.role).toBe('root');
    expect(root?.members).toEqual(PART_STEMS.map(ref).sort());
  });

  it('every part names the same family, calls itself a part, and lists no members', () => {
    for (const stem of PART_STEMS) {
      const membership = units[stem].contract.family_membership;
      expect(membership?.name, stem).toBe('message_scroller');
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

  it('the roster has the root and the four parts, and not the provider', () => {
    const roster = familyRoster('message_scroller');
    expect(roster.root).toBe(ROOT_REF);
    expect(roster.parts).toEqual(PART_STEMS.map(ref).sort());
    expect(units[PROVIDER].contract.family_membership).toBeUndefined();
  });
});

describe('message-scroller family: what nests where', () => {
  it('the root accepts the viewport and the jump button, and nothing else', () => {
    expect(units[DIRECTORY].contract.accepts).toEqual({ content: 'specified', components: [ref(VIEWPORT), ref(BUTTON)] });
  });

  it('the viewport accepts the content, and the content accepts items, and nothing else', () => {
    expect(units[VIEWPORT].contract.accepts).toEqual({ content: 'specified', components: [ref(CONTENT)] });
    expect(units[CONTENT].contract.accepts).toEqual({ content: 'specified', components: [ref(ITEM)] });
  });

  it('an item accepts any content, the button text, and the provider anything', () => {
    expect(units[ITEM].contract.accepts).toEqual({ content: 'unconstrained' });
    expect(units[BUTTON].contract.accepts).toEqual({ content: 'specified', text: true });
    expect(units[PROVIDER].contract.accepts).toEqual({ content: 'unconstrained' });
  });

  it("every part's mount point is FILLED from the member that accepts it, and only that member", () => {
    const host: Record<(typeof PART_STEMS)[number], string> = {
      [VIEWPORT]: DIRECTORY,
      [CONTENT]: VIEWPORT,
      [ITEM]: CONTENT,
      [BUTTON]: DIRECTORY,
    };
    for (const stem of PART_STEMS) {
      expect(units[stem].contract.mounted_in, stem).toEqual([{ container: pascalCase(host[stem]), component: ref(host[stem]) }]);
    }
  });

  it('neither the root nor the provider gains a mount point, since the provider constrains nothing', () => {
    expect(units[DIRECTORY].contract.mounted_in).toBeUndefined();
    expect(units[PROVIDER].contract.mounted_in).toBeUndefined();
  });

  it('every family member names only members of the family', () => {
    const familyRefs = new Set(FAMILY_STEMS.map((stem) => bareGtsId(String(units[stem].contract.$id))));
    for (const stem of FAMILY_STEMS) {
      const { contract } = units[stem];
      const mounts = (contract.mounted_in ?? []).map((entry) => entry.component).filter((mount): mount is string => mount !== undefined);
      for (const named of [...(contract.accepts.components ?? []), ...mounts]) {
        expect(familyRefs.has(named), `${stem}: it names "${named}", which is not a member of this family`).toBe(true);
      }
    }
  });
});

describe('message-scroller directory: what the schema states', () => {
  it("states the button's render and the provider's children, and nothing else", () => {
    for (const { stem, contract } of Object.values(units)) {
      const expected = stem === BUTTON ? ['render'] : stem === PROVIDER ? ['children'] : [];
      expect(Object.keys(contract.prop_statements ?? {}), stem).toEqual(expected);
      for (const prop of expected) {
        expect(contract.props.properties[prop].description, `${stem}.${prop}`).toContain(contract.prop_statements?.[prop].states);
      }
    }
  });

  it("types the provider's settings and the item's id and anchor fully", () => {
    const provider = units[PROVIDER].contract.props.properties;
    expect(provider.autoScroll).toEqual({ type: 'boolean' });
    expect(provider.defaultScrollPosition).toEqual({ type: 'string', enum: ['end', 'last-anchor', 'start'] });
    for (const prop of ['scrollEdgeThreshold', 'scrollMargin', 'scrollPreviousItemPeek']) {
      expect(provider[prop], prop).toEqual({ type: 'number' });
    }
    const item = units[ITEM].contract.props.properties;
    expect(item.messageId).toEqual({ type: 'string' });
    expect(item.scrollAnchor).toEqual({ type: 'boolean' });
  });

  it("lists the three hooks as the provider's companions", () => {
    expect((units[PROVIDER].contract.companions ?? []).map((entry) => entry.export)).toEqual([
      'useMessageScroller',
      'useMessageScrollerScrollable',
      'useMessageScrollerVisibility',
    ]);
  });
});

describe('message-scroller directory in a GTS store', () => {
  it('all six components validate as an instance of the component type', () => {
    const gts = unitStore(Object.values(units));
    for (const { stem, contract } of Object.values(units)) {
      const result = gts.validateInstance(contract.$id);
      expect(result.ok, `${stem}: ${result.error}`).toBe(true);
    }
  });

  it('the button names the button surface, the other parts the div surface, the provider none', () => {
    for (const { stem, contract, elementSurface } of Object.values(units)) {
      if (elementSurface) expect(contract.forwards_to, stem).toBe(bareGtsId(String(elementSurface.$id)));
    }
    expect(units[BUTTON].contract.forwards_to).toBe(elementTypeRef('dom_button'));
    for (const stem of [DIRECTORY, VIEWPORT, CONTENT, ITEM]) {
      expect(units[stem].contract.forwards_to, stem).toBe(elementTypeRef('dom_div'));
    }
    expect(units[PROVIDER].contract.forwards_to).toBeUndefined();
    expect(units[PROVIDER].elementSurface).toBeUndefined();
  });

  it('fails when the component type is not registered - negative control', () => {
    const gts = unitStore(Object.values(units), { componentType: false, vocabulary: false });
    const result = gts.validateInstance(units[DIRECTORY].contract.$id);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Schema not found');
  });

  it('all six components validate as an instance of the committed component type', () => {
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
