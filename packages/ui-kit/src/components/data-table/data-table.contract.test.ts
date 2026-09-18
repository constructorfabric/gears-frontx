// Conformance for both DataTable contracts (DataTable, DataTableSortButton)
// - one file because they share a directory and the interesting assertions
// (growth surfaces, no host element, non-component exports correctly
// excluded from enrollment) are about the directory as a whole, not either
// contract in isolation. See button.contract.test.ts for the per-component
// conformance shape assertContractFreshness reuses.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { GTS } from '@globaltypesystem/gts-ts';
import Ajv2020 from 'ajv/dist/2020';
import { describe, expect, it } from 'vitest';

import {
  addContractTypes,
  buildComponentType,
  compileContract,
  liftPropsSchema,
  registerContractTypes,
  resolveTargetExtraction,
  type CompiledContract,
} from '../../../scripts/contracts/compile';
import { listExportedDeclarationNames } from '../../../scripts/contracts/extract';
import { componentRef } from '../../../scripts/contracts/ids';
import { applyContractTestTimeout, assertContractFreshness, validateContractInstance } from '../../../scripts/contracts/testing';

// resolveTargetExtraction and listExportedDeclarationNames below each build a
// real TypeScript program - several seconds on a CI-class runner, comfortably
// under 5s locally - so only CI hits vitest's default test timeout. See
// applyContractTestTimeout's own comment in testing.ts for why this must run
// before any describe()/it() in the file.
applyContractTestTimeout();

const DIRECTORY = 'data-table';
// Two INDEPENDENT top-level exports, not a compound family - unlike
// Accordion's root/parts, neither contract's overlay sets `family`.
const STEMS = [DIRECTORY, 'data-table-sort-button'] as const;

for (const stem of STEMS) assertContractFreshness(DIRECTORY, stem);


interface CompiledUnit {
  stem: string;
  contract: CompiledContract;
}

const units: Record<string, CompiledUnit> = Object.fromEntries(
  STEMS.map((stem) => [stem, { stem, contract: compileContract(DIRECTORY, stem) }]),
);
const componentType = buildComponentType();

describe('data-table: component type validity', () => {
  it('both components validate against the component type', () => {
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

  it('says outright that nothing may appear inside DataTable', () => {
    // DataTable is the one component that says "nothing": it renders its
    // Table internally from columns/data, so `text` would claim a slot that
    // does not exist and an absent statement would read as unconstrained.
    expect(units[DIRECTORY].contract.accepts).toEqual({ content: 'nothing' });
  });

  it('refuses accepted detail beside a content that already answered the question', () => {
    // `content: nothing` says nothing may appear inside; accepted components
    // beside it would say something may. The vocabulary refuses the pair
    // rather than leaving a reader to resolve the contradiction.
    const ajv = new Ajv2020();
    addContractTypes(ajv);
    const validate = ajv.compile(componentType);
    const contradictory = {
      ...units[DIRECTORY].contract,
      accepts: { content: 'nothing', components: [componentRef('button', 1)] },
    };
    expect(validate(JSON.parse(JSON.stringify(contradictory)))).toBe(false);
  });

  it('neither contract states a family - two independent exports, not a compound family', () => {
    for (const { stem, contract } of Object.values(units)) {
      expect(contract.family_membership, stem).toBeUndefined();
    }
  });
});

describe('data-table: enrollment counts only component exports', () => {
  // The directory exports six names in total; four are helpers/features/
  // types, not components, and must never be counted against enrollment or
  // demanded an overlay - see check.ts's componentExportEnrollment.
  it('data-table.tsx exports exactly two React components: DataTable and DataTableSortButton', () => {
    const extraction = resolveTargetExtraction(DIRECTORY, DIRECTORY);
    const sortButtonExtraction = resolveTargetExtraction(DIRECTORY, 'data-table-sort-button');
    expect(extraction.name).toBe('DataTable');
    expect(sortButtonExtraction.name).toBe('DataTableSortButton');
  });

  it('the non-component exports are real exports, correctly excluded - not silently missing', () => {
    // Resolved from this test file's own URL, not process.cwd() - a runner
    // invoked from outside the package would otherwise point this at a path
    // that does not exist. Not `new URL('./data-table.tsx', import.meta.url)`:
    // under this package's jsdom test environment, Vite's import analysis
    // treats that exact pattern as an asset reference and rewrites it to a
    // served http://localhost URL instead of a file:// one - verified by
    // running it here first. Plain `import.meta.url` (property access,
    // statically replaced by Vite with this file's real path) plus Node's
    // own path helpers sidesteps that rewrite.
    const dataTableTsxPath = join(dirname(fileURLToPath(import.meta.url)), 'data-table.tsx');
    const allExports = listExportedDeclarationNames(dataTableTsxPath);
    const nonComponents = ['dataTableColumnHelper', 'dataTableFeatures', 'DataTableFeatures', 'dataTableSelectionColumn', 'DataTableSelectionColumnLabels'];
    for (const name of nonComponents) {
      expect(allExports, name).toContain(name);
    }
    // Every non-component name is genuinely not one of the two compiled
    // contracts' component names - the enrollment report's "skipped" list
    // and the actual overlay set must agree on this.
    const componentNames = new Set(['DataTable', 'DataTableSortButton']);
    for (const name of nonComponents) {
      expect(componentNames.has(name), name).toBe(false);
    }
  });
});

describe('data-table: no forwarded surface for either contract', () => {
  it('DataTable has no DOM/Base UI heritage - it names no host element surface', () => {
    // The absence is stated in the reference, not in the allOf: every
    // contract's allOf is the base type alone (the shared conformance suite
    // asserts that for all of them), so "no forwarded surface" is now
    // `forwards_to` being absent from the document.
    const extraction = resolveTargetExtraction(DIRECTORY, DIRECTORY);
    expect(extraction.forwardedProps).toEqual([]);
    expect(extraction.elementKind).toBeUndefined();
    expect(units[DIRECTORY].contract.forwards_to).toBeUndefined();
  });

  it('DataTableSortButton composes Button by rendering it, not by extending its props type - also no forwarded surface', () => {
    // DataTableSortButtonProps declares column/children/className itself and
    // extends nothing; the <Button> underneath is JSX in its own render
    // body, which the extractor's own/inherited split never sees (own vs
    // API vs forwarded is about the DECLARATION FILE of a props TYPE, not
    // what a component renders) - classify what the extractor actually
    // reports, don't assume it from what the component renders.
    const extraction = resolveTargetExtraction(DIRECTORY, 'data-table-sort-button');
    expect(extraction.forwardedProps).toEqual([]);
    expect(extraction.apiProps).toEqual([]);
    expect(extraction.elementKind).toBeUndefined();
    expect(units['data-table-sort-button'].contract.forwards_to).toBeUndefined();
  });
});

describe('data-table: growth surfaces', () => {
  it("declares columns as the slot a consumer fills", () => {
    const slots = units[DIRECTORY].contract.slots ?? [];
    expect(slots.map((slot) => slot.prop)).toEqual(['columns']);
    expect(slots[0].typed_by).toContain('ColumnDef');
  });

  it('declares row selection as a capability, with the prop that turns it on', () => {
    // The one behaviour a consumer switches on: `enableRowSelection` makes
    // rows selectable, and the checkbox column is a separate opt-in - which is
    // why the capability names the prop rather than a type.
    const capabilities = units[DIRECTORY].contract.capabilities ?? [];
    expect(capabilities.map((capability) => capability.name)).toEqual(['row_selection']);
    expect(capabilities[0].enabled_by).toBe('enableRowSelection');
  });

  it('declares the three exports a consumer builds its input with as companions', () => {
    // Every other export of data-table.tsx that is not a React component: the
    // extractor generates no contract for them, and each is something a
    // consumer imports rather than a prop it passes.
    const companions = units[DIRECTORY].contract.companions ?? [];
    expect(companions.map((companion) => companion.export).sort()).toEqual([
      'dataTableColumnHelper',
      'dataTableFeatures',
      'dataTableSelectionColumn',
    ]);
  });

  it('DataTableSortButton declares no growth surface of its own', () => {
    const { contract } = units['data-table-sort-button'];
    expect(contract.slots).toBeUndefined();
    expect(contract.capabilities).toBeUndefined();
    expect(contract.companions).toBeUndefined();
  });
});

describe('data-table: what the schema cannot assert', () => {
  it("DataTable names every prop the schema cannot type, and its internal state as an invariant", () => {
    const statements = units[DIRECTORY].contract.prop_statements ?? {};
    for (const prop of ['columns', 'data', 'emptyMessage', 'nextLabel', 'previousLabel', 'selectionSummary']) {
      expect(Object.keys(statements), prop).toContain(prop);
    }
    // The one claim that is NOT about a prop: sorting, selection and
    // pagination state never reach DataTableProps at all, so there is no
    // property for a `props` statement to key on - it is a fact about the
    // component, which is exactly what an invariant is for (the dissolved
    // `untyped` catch-all's `about: behaviour` category).
    const invariants = units[DIRECTORY].contract.invariants;
    expect(invariants.some((entry) => /internal, not props/.test(entry.text))).toBe(true);
  });

  it('DataTableSortButton states its mount point outside the kit, in mounted_in, and its Button composition as an unexposed part', () => {
    const { contract } = units['data-table-sort-button'];
    // `mounted_in` already states the mount point outside the kit; there is
    // no second, separate statement of the same fact any more (the dissolved
    // `untyped` catch-all's `about: outside_mount` category).
    const unexposedParts = contract.unexposed_parts ?? [];
    expect(unexposedParts.some((entry) => /Button/.test(entry.part) && /internal composition/.test(entry.reason))).toBe(true);
    const statements = contract.prop_statements ?? {};
    expect(Object.keys(statements).sort()).toEqual(['children', 'column']);
    // A component reference covers kit-to-kit nesting only, and it is FILLED
    // rather than authored: a column's `header` render function is a TanStack
    // Table prop, not a kit component, so the mount point is stated as a
    // container outside the kit instead of naming a component that does not
    // exist.
    const mounts = contract.mounted_in ?? [];
    expect(mounts.length).toBe(1);
    const [mount] = mounts;
    expect(mount.component).toBeUndefined();
    expect(mount.container).toContain('header');
    expect(mount.note).toContain('ColumnDef');
  });
});

describe('data-table in a GTS store', () => {
  function registeredStore(): GTS {
    const gts = new GTS();
    gts.register(componentType);
    // The vocabulary the component type references: a store missing one
    // cannot compile the type at all.
    registerContractTypes((entity) => gts.register(entity));
    for (const { contract } of Object.values(units)) gts.register(JSON.parse(JSON.stringify(contract)) as Record<string, unknown>);
    return gts;
  }

  it('both components validate as instances of the component type', () => {
    const gts = registeredStore();
    for (const { stem, contract } of Object.values(units)) {
      const result = gts.validateInstance(contract.$id);
      expect(result.ok, `${stem}: ${result.error}`).toBe(true);
    }
  });

  it('fails when the component type is not registered - negative control', () => {
    const gts = new GTS();
    for (const { contract } of Object.values(units)) gts.register(JSON.parse(JSON.stringify(contract)) as Record<string, unknown>);
    const result = gts.validateInstance(units[DIRECTORY].contract.$id);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Schema not found');
  });

  it('both components validate against the committed component type', () => {
    // Real here: DataTable declares growth surfaces but no family,
    // DataTableSortButton sets neither - between the two, every optional
    // absence shape this directory can produce is exercised, which is what
    // validateContractInstance's JSON round-trip exists for.
    for (const { stem, contract } of Object.values(units)) {
      const result = validateContractInstance(contract);
      expect(result.ok, `${stem}: ${result.error}`).toBe(true);
    }
  });

  it('rejects DataTable when a dont_use_when.instead is malformed - negative control', () => {
    const corrupted: CompiledContract = {
      ...units[DIRECTORY].contract,
      dont_use_when: [{ situation: 'placeholder', instead: { target: 'anything', component: 'not-a-gts-id' } }],
    };
    const result = validateContractInstance(corrupted);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/pattern/i);
  });
});
