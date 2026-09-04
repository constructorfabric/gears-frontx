// Kit-wide contract completeness guard: the definition-of-done for a
// component contract, applied to every directory under src/components.
//
// A component is complete when it ships the hand-written overlay
// (<name>.contract.yaml), the two compiled artifacts next to it are in sync
// with a fresh recompile, the instance validates against the component
// metamodel, and the compiled axes still mirror the cva() call in the code.
//
// Constraint, stated on purpose: this guard is deliberately unconditional -
// no ratchet, no allowlist, no "known gaps" file. On this demo branch that
// makes the whole kit fail loudly so the validator can be seen working
// across all 63 components at once, with one named line per component that
// has no contract yet. A production rollout would phase the same gate in
// diff-aware (touched components first) instead of turning it on kit-wide.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import type { SchemaObject } from 'ajv';
// Draft 2020-12 needs Ajv's 2020 build; the default `ajv` export only knows
// draft-07 and rejects the contract's $schema outright.
import Ajv2020 from 'ajv/dist/2020';
import { describe, expect, it } from 'vitest';

import { compileContract, compileInstance } from '../scripts/contracts/compile';
import { extractComponent } from '../scripts/contracts/extract';

// vitest rewrites import.meta.url to a root-relative path, so resolve from
// the package cwd instead.
const packageRoot = process.cwd();
const componentsDir = join(packageRoot, 'src', 'components');

const components = readdirSync(componentsDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

const metaSchema = JSON.parse(
  readFileSync(join(packageRoot, 'scripts', 'contracts', 'ui-component.meta.json'), 'utf8'),
) as SchemaObject;

// On-disk shape the compiler writes: pretty-printed JSON plus a trailing
// newline. Freshness is a byte comparison, not a structural one, so a
// reformatted checked-in artifact is a failure too.
const serialize = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

describe.each(components)('%s contract', (name) => {
  const dir = join(componentsDir, name);
  const overlayPath = join(dir, `${name}.contract.yaml`);

  it('ships a contract overlay', () => {
    expect(
      existsSync(overlayPath),
      `component "${name}": no contract overlay (${name}.contract.yaml) - full anatomy reference: src/components/button`,
    ).toBe(true);
  });

  // Components without the overlay stop at the line above: the rest of the
  // checklist has nothing to read. Everything below is the complete anatomy
  // a covered component satisfies.
  if (!existsSync(overlayPath)) return;

  it('ships a compiled props schema in sync with a fresh recompile', () => {
    const compiledPath = join(dir, `${name}.contract.json`);
    expect(existsSync(compiledPath), `${name}.contract.json is missing - recompile the contract`).toBe(true);
    expect(readFileSync(compiledPath, 'utf8'), `${name}.contract.json is stale`).toBe(serialize(compileContract(name)));
  });

  it('ships a compiled contract instance in sync with a fresh recompile', () => {
    const instancePath = join(dir, `${name}.contract.instance.json`);
    expect(existsSync(instancePath), `${name}.contract.instance.json is missing - recompile the contract`).toBe(true);
    expect(readFileSync(instancePath, 'utf8'), `${name}.contract.instance.json is stale`).toBe(
      serialize(compileInstance(name)),
    );
  });

  it('instance validates against the component metamodel', () => {
    const ajv = new Ajv2020();
    const validate = ajv.compile(metaSchema);
    expect(validate(compileInstance(name)), ajv.errorsText(validate.errors)).toBe(true);
  });

  it('compiled axes mirror the cva() extraction, both directions', () => {
    const contract = compileContract(name);
    const extraction = extractComponent(join(dir, `${name}.tsx`));
    for (const [axis, values] of Object.entries(extraction.axes)) {
      expect(contract.properties[axis]?.enum, `axis "${axis}" disagrees with the code`).toEqual(values);
    }
    const enumProps = Object.entries(contract.properties).filter(([, schema]) => schema.enum !== undefined);
    expect(enumProps.map(([axis]) => axis).sort()).toEqual(Object.keys(extraction.axes).sort());
  });

  it('instance points at the props schema it was compiled with', () => {
    expect(compileInstance(name).props_schema).toBe(compileContract(name).$id);
  });
});
