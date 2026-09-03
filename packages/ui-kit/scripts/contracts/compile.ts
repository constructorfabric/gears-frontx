// Contract compiler: merges code-extracted facts with the hand-written
// overlay into two GTS-typed artifacts.
//
//   <out>.json          - props schema, $id gts://gts.frontx.uikit.component.<c>.v1~
//   <out>.instance.json - contract instance, typed by the metamodel
//                         gts://gts.frontx.uikit.meta.component.v1~
//
// The second artifact is what makes the contract structure itself checkable:
// the metamodel is a GTS type, so a malformed contract fails the same
// validator that checks component props, not a review comment. The two stay
// linked through the instance's props_schema field.
//
// The compiled JSON is the canonical contract every consumer reads (Ajv,
// gtsPlugin.registerSchema, projections, the lint). In the real build it is
// written to dist/contracts/<name>.json and shipped in the npm tarball; this
// demo accepts an explicit output path instead.
//
// Usage: npx vite-node scripts/contracts/compile.ts -- <component> [outPath]
//        The instance path is outPath with `.json` swapped for
//        `.instance.json`; both files are written together.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { extractComponent, type Extraction } from './extract';

// Demo shortcut: js-yaml is what the workspace already hoists. Production
// pins the `yaml` package (YAML 1.2) so bare `off`/`no` stay strings.
const yaml = createRequire(import.meta.url)('js-yaml') as { load: (text: string) => unknown };

export interface Examples {
  good: { title: string; code: string }[];
  bad: { title: string; code: string; why: string }[];
}

export interface Overlay {
  component: string;
  intent: string;
  use_when: string[];
  // `instead` is a GTS component type id (see the metamodel's
  // component_type_ref), not a display name - a name resolves to nothing.
  dont_use_when: { rule: string; instead: string }[];
  composition: { children: { kinds: string[]; icons_via?: string } };
  invariants: { id: string; text: string }[];
  anti_patterns: { dont: string; instead: string }[];
  deprecations: { props?: Record<string, { since: string; replacement: string; hint: string }> };
  coverage: Record<string, string>;
  examples: Examples;
}

// The contract instance: the overlay, typed by the metamodel and pointing at
// the props schema. Field order here is the on-disk order.
export interface ContractInstance extends Omit<Overlay, 'component'> {
  id: string;
  metamodel: string;
  component: string;
  props_schema: string;
}

export interface ContractProperty {
  type: string;
  enum?: string[];
  default?: string;
}

export interface CompiledContract {
  $id: string;
  $schema: string;
  title: string;
  type: 'object';
  properties: Record<string, ContractProperty>;
  'x-uikit': {
    metamodel: string;
    slots: Record<string, { typeText: string; optional: boolean }>;
    passthrough: string[];
    cannot_extract: string[];
  } & Omit<Overlay, 'component'>;
}

const kitRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// Version of the overlay vocabulary, not of any component.
const METAMODEL_VERSION = '0.1.0-demo';

// Type id of ui-component.meta.json; prefixes every instance id.
const METAMODEL_TYPE_ID = 'gts.frontx.uikit.meta.component.v1';

// Machine-owned fields the overlay must not restate - one fact, one owner.
const MACHINE_OWNED = ['axes', 'props', 'defaults', 'variants'];

// Normative props stay inside the provider-safe JSON Schema subset; anything
// unrepresentable there (ReactNode slots, render props) is described in
// x-uikit instead of the schema body.
const NORMATIVE_TYPES: Record<string, ContractProperty> = {
  boolean: { type: 'boolean' },
  string: { type: 'string' },
};

// GTS tokens are snake_case; kit directories are kebab-case. Every id built
// here goes through this, so `navigation-menu` never leaks an ungrammatical
// hyphen into a type id.
function gtsToken(component: string): string {
  return component.replace(/-/g, '_');
}

// The props schema's own type id - the value the instance's props_schema
// points at, so the two artifacts can never drift apart by hand.
function propsSchemaId(component: string): string {
  return `gts://gts.frontx.uikit.component.${gtsToken(component)}.v1~`;
}

function loadOverlay(component: string): Overlay {
  const path = join(kitRoot, 'src', 'components', component, `${component}.contract.yaml`);
  const overlay = yaml.load(readFileSync(path, 'utf8')) as Overlay & Record<string, unknown>;

  const shadowed = MACHINE_OWNED.filter((key) => key in overlay);
  if (shadowed.length > 0) {
    throw new Error(`overlay restates machine-owned field(s): ${shadowed.join(', ')}`);
  }
  return overlay;
}

// GTS instance id: metamodel type id, `~`, then the instance segment - which
// carries exactly 5 dot-tokens (frontx.uikit.component.<name>.v<n>).
export function instanceId(component: string): string {
  return `${METAMODEL_TYPE_ID}~frontx.uikit.component.${gtsToken(component)}.v1`;
}

export function compileInstance(component: string): ContractInstance {
  const overlay = loadOverlay(component);
  return {
    id: instanceId(component),
    metamodel: METAMODEL_VERSION,
    component,
    intent: overlay.intent,
    use_when: overlay.use_when,
    dont_use_when: overlay.dont_use_when,
    composition: overlay.composition,
    invariants: overlay.invariants,
    anti_patterns: overlay.anti_patterns,
    deprecations: overlay.deprecations,
    coverage: overlay.coverage,
    examples: overlay.examples,
    props_schema: propsSchemaId(component),
  };
}

export function compileContract(component: string): CompiledContract {
  const dir = join(kitRoot, 'src', 'components', component);
  const extraction: Extraction = extractComponent(join(dir, `${component}.tsx`));
  const overlay = loadOverlay(component);

  const properties: Record<string, ContractProperty> = {};
  const slots: CompiledContract['x-uikit']['slots'] = {};
  for (const [axis, values] of Object.entries(extraction.axes)) {
    properties[axis] = { type: 'string', enum: values };
    if (extraction.defaults[axis] !== undefined) properties[axis].default = extraction.defaults[axis];
  }
  for (const prop of extraction.ownProps) {
    const normative = NORMATIVE_TYPES[prop.typeText];
    if (normative) {
      properties[prop.name] = { ...normative };
    } else {
      // Not expressible in the provider-safe subset - recorded as a slot
      // with its source type, checked by the lint, not by Ajv.
      slots[prop.name] = { typeText: prop.typeText, optional: prop.optional };
    }
  }

  return {
    $id: propsSchemaId(component),
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    title: `UiKit ${component} contract`,
    type: 'object',
    properties,
    'x-uikit': {
      metamodel: METAMODEL_VERSION,
      intent: overlay.intent,
      use_when: overlay.use_when,
      dont_use_when: overlay.dont_use_when,
      composition: overlay.composition,
      invariants: overlay.invariants,
      anti_patterns: overlay.anti_patterns,
      deprecations: overlay.deprecations,
      coverage: overlay.coverage,
      examples: overlay.examples,
      slots,
      passthrough: extraction.passthrough,
      cannot_extract: extraction.cannotExtract,
    },
  };
}

// "Was this module invoked as the entry, rather than imported?" Under plain
// node/tsx argv[1] is this file. Under vite-node it is the runner's own bin:
// everything after `--` becomes the script's argv, so the script path is
// gone and the identity comparison can never match. An import (the
// conformance test, a build script) matches neither branch.
function invokedDirectly(): boolean {
  const entry = process.argv[1];
  if (entry === undefined) return false;
  return import.meta.url === pathToFileURL(entry).href || basename(entry) === 'vite-node';
}

// CLI entry - skipped when the module is imported (e.g. by the conformance test).
if (invokedDirectly()) {
  const [component, outPath] = process.argv.slice(2);
  if (!component) {
    console.error('Usage: npx vite-node scripts/contracts/compile.ts -- <component> [outPath]');
    process.exit(1);
  }
  const contract = compileContract(component);
  const instance = compileInstance(component);
  const out = outPath ?? join(kitRoot, 'dist', 'contracts', `${component}.json`);
  // Derived, not a third argument: the two artifacts describe one component
  // and there is no case for writing them to unrelated places.
  const instanceOut = `${out.replace(/\.json$/, '')}.instance.json`;
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(contract, null, 2)}\n`);
  writeFileSync(instanceOut, `${JSON.stringify(instance, null, 2)}\n`);
  console.log(`wrote ${out}`);
  console.log(`wrote ${instanceOut}`);
}
