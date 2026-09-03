// Conformance: the compiled contract may never disagree with the code.
//
// In CI this test recompiles the contract from source and diffs it against
// the shipped dist/contracts copy (freshness); the demo compiles in-memory
// and checks the invariants that make the contract trustworthy: axes and
// defaults mirror the cva() call exactly, the overlay only references props
// that exist, and the $id obeys the GTS segment grammar.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { SchemaObject } from 'ajv';
// Draft 2020-12 needs Ajv's 2020 build; the default `ajv` export only knows
// draft-07 and rejects the contract's $schema outright. No other option
// changes were needed: the metamodel sticks to standard keywords, so Ajv's
// default strict mode accepts it as is.
import Ajv2020 from 'ajv/dist/2020';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { compileContract, compileInstance } from '../../../scripts/contracts/compile';
import { extractComponent } from '../../../scripts/contracts/extract';

const contract = compileContract('button');
const instance = compileInstance('button');
// vitest rewrites import.meta.url to a root-relative path, so resolve from
// the package cwd instead.
const extraction = extractComponent(join(process.cwd(), 'src/components/button/button.tsx'));
const metaSchema = JSON.parse(
  readFileSync(join(process.cwd(), 'scripts/contracts/ui-component.meta.json'), 'utf8'),
) as SchemaObject;

// Grammar of a GTS component type reference; the capture is the component
// token, snake_case where the kit directory is kebab-case.
const COMPONENT_TYPE_REF = /^gts\.frontx\.uikit\.component\.([a-z_][a-z0-9_]*)\.v\d+~$/;

describe('button contract conformance', () => {
  it('mirrors every cva axis and value, both directions', () => {
    for (const [axis, values] of Object.entries(extraction.axes)) {
      expect(contract.properties[axis]?.enum).toEqual(values);
    }
    const enumProps = Object.entries(contract.properties).filter(([, schema]) => schema.enum !== undefined);
    expect(enumProps.map(([name]) => name).sort()).toEqual(Object.keys(extraction.axes).sort());
  });

  it('mirrors defaultVariants', () => {
    for (const [axis, def] of Object.entries(extraction.defaults)) {
      expect(contract.properties[axis]?.default).toBe(def);
    }
  });

  it('overlay references only props that exist in code', () => {
    const known = new Set([...Object.keys(extraction.axes), ...extraction.ownProps.map((prop) => prop.name)]);
    for (const prop of Object.keys(contract['x-uikit'].deprecations.props ?? {})) {
      expect(known, `deprecated prop "${prop}" is not a real prop`).toContain(prop);
    }
    const iconsVia = contract['x-uikit'].composition.children.icons_via;
    if (iconsVia !== undefined) {
      expect(known).toContain(iconsVia);
    }
  });

  it('carries a grammatical GTS type id', () => {
    expect(contract.$id).toMatch(/^gts:\/\/gts\.[a-z_][a-z0-9_]*(\.[a-z0-9_]+){3}\.v\d+~$/);
  });

  it('extraction reported nothing it could not read', () => {
    expect(extraction.cannotExtract).toEqual([]);
  });
});

describe('button contract instance', () => {
  it('validates against the component metamodel', () => {
    const ajv = new Ajv2020();
    const validate = ajv.compile(metaSchema);
    expect(validate(instance), ajv.errorsText(validate.errors)).toBe(true);
  });

  it('carries a grammatical GTS instance id', () => {
    expect(instance.id).toMatch(
      /^gts\.frontx\.uikit\.meta\.component\.v1~frontx\.uikit\.component\.[a-z_][a-z0-9_]*\.v\d+$/,
    );
  });

  it('points at the props schema it was compiled with', () => {
    expect(instance.props_schema).toBe(contract.$id);
  });

  it('every dont_use_when alternative resolves to a component the kit ships', () => {
    // Demo stand-in for the registry existence check x-gts-ref performs:
    // grammar alone would happily accept an id nothing implements.
    expect(instance.dont_use_when.length).toBeGreaterThan(0);
    for (const { rule, instead } of instance.dont_use_when) {
      const match = COMPONENT_TYPE_REF.exec(instead);
      if (match === null) {
        throw new Error(`dont_use_when "${rule}": "${instead}" is not a GTS component type id`);
      }
      const dir = join(process.cwd(), 'src/components', match[1].replace(/_/g, '-'));
      expect(
        existsSync(dir),
        `dont_use_when "${rule}" points at "${instead}", but no such component exists (${dir})`,
      ).toBe(true);
    }
  });

  it('every good example is syntactically valid TSX', () => {
    // Syntax only. Real CI runs these through a tsc program against the kit's
    // own declarations, which also catches a prop that does not exist or has
    // the wrong type; that needs the built .d.ts, so the demo stops at parse.
    for (const { title, code } of instance.examples.good) {
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
    expect(instance.examples.bad.length).toBeGreaterThan(0);
    for (const { title, why } of instance.examples.bad) {
      expect(why.trim(), `bad example "${title}" has no reason`).not.toBe('');
    }
  });
});
