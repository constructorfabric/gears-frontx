// Conformance for the six contracts of the chart directory: ChartContainer,
// ChartStyle, ChartTooltip, ChartTooltipContent, ChartLegend and
// ChartLegendContent. They are independent exports, not a compound family:
// the tooltip and legend sit inside a Recharts chart element and their
// content components go into a `content` prop, so every mount point is a
// container outside the kit. One file because the interesting assertions are
// about how the six relate; the per-component shape comes from testing.ts's
// assertContractFreshness.
import Ajv2020 from 'ajv/dist/2020';
import { describe, expect, it } from 'vitest';

import { addContractTypes, buildComponentType, liftPropsSchema } from '../../../scripts/contracts/compile';
import { bareGtsId, elementTypeRef } from '../../../scripts/contracts/ids';
import {
  applyContractTestTimeout,
  assertContractFreshness,
  compileUnits,
  unitStore,
  validateContractInstance,
} from '../../../scripts/contracts/testing';

// Must run before any describe()/it() in the file; see
// applyContractTestTimeout's own comment in testing.ts.
applyContractTestTimeout();

const DIRECTORY = 'chart';
const STEMS = [
  'chart-container',
  'chart-style',
  'chart-tooltip',
  'chart-tooltip-content',
  'chart-legend',
  'chart-legend-content',
] as const;
// The three components whose root is a div the kit renders.
const DIV_HOSTED = ['chart-container', 'chart-tooltip-content', 'chart-legend-content'] as const;
// ChartStyle renders a <style> element with no attributes of the caller's;
// ChartTooltip and ChartLegend are the library's components re-exported.
const UNHOSTED = ['chart-style', 'chart-tooltip', 'chart-legend'] as const;

for (const stem of STEMS) assertContractFreshness(DIRECTORY, stem);

const units = compileUnits(DIRECTORY, STEMS, { allowNoHostElement: true });
const componentType = buildComponentType();

describe('chart directory: component type validity', () => {
  it('every one of the six validates against the component type', () => {
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

  it('none states a family - six independent exports, not a compound family', () => {
    for (const { stem, contract } of Object.values(units)) {
      expect(contract.family_membership, stem).toBeUndefined();
    }
  });
});

describe('chart directory: what nests where', () => {
  it('the container constrains nothing inside it, and every other component takes no children', () => {
    expect(units['chart-container'].contract.accepts).toEqual({ content: 'unconstrained' });
    for (const stem of STEMS.filter((s) => s !== 'chart-container')) {
      expect(units[stem].contract.accepts, stem).toEqual({ content: 'nothing' });
    }
  });

  it('the tooltip and legend mount in a chart element, their content in a content prop - all outside the kit', () => {
    const container = (stem: string) => (units[stem].contract.mounted_in ?? []).map((entry) => entry.container);
    for (const stem of ['chart-tooltip', 'chart-legend']) expect(container(stem), stem).toEqual([expect.stringContaining('Recharts chart element')]);
    expect(container('chart-tooltip-content')).toEqual(['the `content` prop of ChartTooltip']);
    expect(container('chart-legend-content')).toEqual(['the `content` prop of ChartLegend']);
    for (const stem of STEMS) {
      for (const entry of units[stem].contract.mounted_in ?? []) {
        expect(entry.component, stem).toBeUndefined();
        expect(entry.note, stem).toBeTruthy();
      }
    }
  });

  it('the container and the style element carry no mount point', () => {
    expect(units['chart-container'].contract.mounted_in).toBeUndefined();
    expect(units['chart-style'].contract.mounted_in).toBeUndefined();
  });
});

describe('chart directory: host elements', () => {
  it('the container and both content components name the div surface', () => {
    for (const stem of DIV_HOSTED) {
      expect(units[stem].contract.forwards_to, stem).toBe(elementTypeRef('dom_div'));
      const surface = units[stem].elementSurface;
      expect(surface, stem).toBeDefined();
      if (surface) expect(units[stem].contract.forwards_to, stem).toBe(bareGtsId(String(surface.$id)));
    }
  });

  it('the style element and the two library re-exports name none', () => {
    for (const stem of UNHOSTED) {
      expect(units[stem].elementKind, stem).toBeUndefined();
      expect(units[stem].contract.forwards_to, stem).toBeUndefined();
    }
  });

  it("the legend records that the attributes it admits reach its content renderer, not an element", () => {
    const notes = units['chart-legend'].contract['x-uikit'].cannot_extract;
    expect(notes).toEqual([
      expect.stringMatching(
        /^host element: none - \d+ React attribute\(s\) .*aria-label.*: the legend's attributes are passed to its content renderer as props; whether they reach an element depends on that renderer\.$/,
      ),
    ]);
  });

  it('the tooltip, with no attributes of its own to place, records nothing of the kind', () => {
    expect(units['chart-tooltip'].contract['x-uikit'].cannot_extract).toEqual([]);
  });
});

describe('chart directory: what the schema cannot assert', () => {
  it("the container's config and children, and ChartStyle's config, carry prop statements", () => {
    expect(Object.keys(units['chart-container'].contract.prop_statements ?? {}).sort()).toEqual(['children', 'config', 'initialDimension']);
    expect(Object.keys(units['chart-style'].contract.prop_statements ?? {})).toEqual(['config']);
  });

  it("the legend's handlers are stated once, by a group, as never called by the kit's legend content", () => {
    const contract = units['chart-legend'].contract;
    expect(contract.prop_statement_groups?.map((group) => group.match)).toEqual(['^on[A-Z]']);
    expect(Object.keys(contract.prop_statements ?? {}).filter((prop) => prop.startsWith('on'))).toEqual(['onBBoxUpdate']);
    for (const prop of ['onClick', 'onMouseEnter', 'onKeyDown', 'onWheelCapture']) {
      expect(contract.props.properties[prop]?.description, prop).toMatch(/ChartLegendContent keeps it off its elements and never calls it/);
    }
  });

  it('onBBoxUpdate, which the group pattern also matches, carries its own statement and no per-item claim', () => {
    const description = units['chart-legend'].contract.props.properties.onBBoxUpdate?.description ?? '';
    expect(description).toMatch(/the legend never calls it/);
    expect(description).not.toMatch(/per item/);
  });

  it('both content components admit no event handler, children or dangerouslySetInnerHTML', () => {
    for (const stem of ['chart-tooltip-content', 'chart-legend-content']) {
      const names = Object.keys(units[stem].contract.props.properties);
      expect(names.filter((name) => /^on[A-Z]/.test(name)), stem).toEqual([]);
      expect(names, stem).not.toContain('children');
      expect(names, stem).not.toContain('dangerouslySetInnerHTML');
    }
  });

  it("the content components close the element surface's handler family their props types admit nothing of", () => {
    // Both omit every DOM handler from their props types and drop any that
    // arrive, so read beside dom_div they must not accept `on*` names; the
    // container forwards handlers and closes nothing.
    for (const stem of ['chart-legend-content', 'chart-tooltip-content']) {
      expect(units[stem].contract.props.patternProperties?.['^on[A-Z]']?.not, stem).toEqual({});
    }
    expect(units['chart-container'].contract.props.patternProperties).toBeUndefined();
  });

  it("the content components state the settings they receive but do not read once each, as groups", () => {
    expect(units['chart-legend-content'].contract.prop_statement_groups?.map((group) => group.match)).toEqual(['^(formatter|labelStyle)$']);
    const tooltipGroups = units['chart-tooltip-content'].contract.prop_statement_groups ?? [];
    expect(tooltipGroups.map((group) => group.match)).toEqual([
      '^(allowEscapeViewBox|animationEasing|axisId|content|contentStyle|cursor|defaultIndex|isAnimationActive|itemSorter|itemStyle|labelStyle|offset|payloadUniqBy|portal|position|reverseDirection|wrapperStyle)$',
    ]);
    expect(Object.keys(units['chart-tooltip-content'].contract.prop_statements ?? {}).sort()).toEqual(['formatter', 'label', 'labelFormatter', 'payload']);
  });

  it('the container names ChartConfig as its companion type', () => {
    expect((units['chart-container'].contract.companions ?? []).map((companion) => companion.export)).toEqual(['ChartConfig']);
  });
});

describe('chart directory in a GTS store', () => {
  it('every component validates as an instance of the component type', () => {
    const gts = unitStore(Object.values(units));
    for (const { stem, contract } of Object.values(units)) {
      const result = gts.validateInstance(contract.$id);
      expect(result.ok, `${stem}: ${result.error}`).toBe(true);
    }
  });

  it('fails when the component type is not registered - negative control', () => {
    const gts = unitStore(Object.values(units), { componentType: false, vocabulary: false });
    const result = gts.validateInstance(units['chart-container'].contract.$id);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Schema not found');
  });

  it('every component validates as an instance of the committed component type', () => {
    for (const { stem, contract } of Object.values(units)) {
      const result = validateContractInstance(contract);
      expect(result.ok, `${stem}: ${result.error}`).toBe(true);
    }
  });

  it('rejects the container when it carries an unknown key - negative control', () => {
    const container = units['chart-container'].contract;
    const corrupted = { ...container, bogus_field: true } as typeof container;
    const result = validateContractInstance(corrupted);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/additional propert/i);
  });
});
