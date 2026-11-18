/**
 * Parity of the manifest and MFE entry types with the runtime's contract
 * types. The TypeScript compiler API reads `MfManifest` and `MfeEntryMF` (with
 * the `MfeEntry` fields it extends) from the mfes sources; the shipped
 * schemas are read as JSON. Both reduce to one field tree — field names,
 * required flags and nesting — and the two trees must be equal. A mutated
 * copy of either side must make the check fail.
 *
 * @cpt-algo:cpt-frontx-algo-gts-type-provider-manifest-entry-types:p1
 */
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { loadSchemas } from '../loader';
import type { JSONSchema } from '../types';

type Node =
  | { kind: 'scalar' }
  | { kind: 'array'; items: Node }
  | { kind: 'map'; value: Node }
  | { kind: 'object'; fields: Record<string, { required: boolean; node: Node }> };

// Absolute paths of the runtime's contract sources, derived from this file's URL
// (no Node built-in import: the package boundary rule admits only ecosystem packages).
const sourcePath = (relative: string): string => decodeURIComponent(new URL(relative, import.meta.url).pathname);
const ENTRY_MF_FILE = sourcePath('../../../mfes/src/types/mfe-entry-mf.ts');
const MANIFEST_FILE = sourcePath('../../../mfes/src/manifest/mf-manifest.ts');

type SourceEdit = Record<string, (text: string) => string>;

// ---------------------------------------------------------------------------
// TypeScript side
// ---------------------------------------------------------------------------

function typeScriptTrees(edits: SourceEdit = {}): { manifest: Node; entry: Node } {
  const options: ts.CompilerOptions = {
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
  };
  const host = ts.createCompilerHost(options);
  const readFile = host.readFile.bind(host);
  host.readFile = (name) => {
    const text = readFile(name);
    const edit = edits[name];
    return text !== undefined && edit ? edit(text) : text;
  };
  const getSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (name, languageVersion, onError, shouldCreate) => {
    const edit = edits[name];
    if (!edit) return getSourceFile(name, languageVersion, onError, shouldCreate);
    return ts.createSourceFile(name, edit(ts.sys.readFile(name) ?? ''), languageVersion, true);
  };
  const program = ts.createProgram([ENTRY_MF_FILE, MANIFEST_FILE], options, host);
  const checker = program.getTypeChecker();

  const declared = (file: string, name: string): ts.Type => {
    const source = program.getSourceFile(file);
    if (!source) throw new Error(`source not loaded: ${file}`);
    const symbol = checker.getSymbolAtLocation(source)?.exports?.get(name as ts.__String);
    if (!symbol) throw new Error(`${name} is not exported by ${file}`);
    return checker.getDeclaredTypeOfSymbol(symbol);
  };

  const convert = (type: ts.Type): Node => {
    const value = checker.getNonNullableType(type);
    if (checker.isArrayType(value) || checker.isTupleType(value)) {
      const [item] = checker.getTypeArguments(value as ts.TypeReference);
      return { kind: 'array', items: convert(item) };
    }
    const props = checker.getPropertiesOfType(value);
    const indexType = checker.getIndexTypeOfType(value, ts.IndexKind.String);
    if (indexType && props.length === 0) return { kind: 'map', value: convert(indexType) };
    if (value.flags & ts.TypeFlags.Object && props.length > 0) return { kind: 'object', fields: fields(value) };
    return { kind: 'scalar' };
  };

  const fields = (type: ts.Type): Record<string, { required: boolean; node: Node }> => {
    const out: Record<string, { required: boolean; node: Node }> = {};
    for (const prop of checker.getPropertiesOfType(type)) {
      const decl = prop.valueDeclaration ?? prop.declarations?.[0];
      if (!decl) continue;
      out[prop.name] = {
        required: !(prop.flags & ts.SymbolFlags.Optional),
        node: convert(checker.getTypeOfSymbolAtLocation(prop, decl)),
      };
    }
    return out;
  };

  return {
    manifest: convert(declared(MANIFEST_FILE, 'MfManifest')),
    entry: convert(declared(ENTRY_MF_FILE, 'MfeEntryMF')),
  };
}

// ---------------------------------------------------------------------------
// Schema side
// ---------------------------------------------------------------------------

type Schema = Record<string, unknown>;

function schemaTrees(schemas: JSONSchema[]): { manifest: Node; entry: Node } {
  const byId = new Map(schemas.map((s) => [String((s as Schema).$id), s as Schema]));

  // The properties and required list a schema contributes, with its allOf bases merged in.
  const flatten = (schema: Schema): { properties: Record<string, Schema>; required: Set<string> } => {
    const properties: Record<string, Schema> = {};
    const required = new Set<string>();
    for (const part of (schema.allOf as Schema[] | undefined) ?? []) {
      const target = part.$ref ? byId.get(String(part.$ref)) : part;
      if (!target) throw new Error(`unresolved $ref ${String(part.$ref)}`);
      const base = flatten(target);
      Object.assign(properties, base.properties);
      base.required.forEach((r) => required.add(r));
    }
    Object.assign(properties, (schema.properties as Record<string, Schema> | undefined) ?? {});
    for (const r of (schema.required as string[] | undefined) ?? []) required.add(r);
    return { properties, required };
  };

  const convert = (schema: Schema): Node => {
    if (schema.properties || schema.allOf) {
      const { properties, required } = flatten(schema);
      const out: Record<string, { required: boolean; node: Node }> = {};
      for (const [name, prop] of Object.entries(properties)) out[name] = { required: required.has(name), node: convert(prop) };
      return { kind: 'object', fields: out };
    }
    if (schema.type === 'array') return { kind: 'array', items: convert((schema.items as Schema | undefined) ?? {}) };
    if (schema.type === 'object' && typeof schema.additionalProperties === 'object') {
      return { kind: 'map', value: convert(schema.additionalProperties as Schema) };
    }
    return { kind: 'scalar' };
  };

  const get = (id: string): Schema => {
    const schema = byId.get(`gts://${id}`);
    if (!schema) throw new Error(`schema not shipped: ${id}`);
    return schema;
  };
  return {
    manifest: convert(get('gts.frontx.mfes.mfe.mf_manifest.v1~')),
    entry: convert(get('gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~')),
  };
}

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------

function diff(a: Node, b: Node, path = '$'): string[] {
  if (a.kind !== b.kind) return [`${path}: ${a.kind} vs ${b.kind}`];
  if (a.kind === 'array' && b.kind === 'array') return diff(a.items, b.items, `${path}[]`);
  if (a.kind === 'map' && b.kind === 'map') return diff(a.value, b.value, `${path}{}`);
  if (a.kind === 'object' && b.kind === 'object') {
    const out: string[] = [];
    for (const name of new Set([...Object.keys(a.fields), ...Object.keys(b.fields)])) {
      const left = a.fields[name];
      const right = b.fields[name];
      if (!left || !right) out.push(`${path}.${name}: only in ${left ? 'types' : 'schema'}`);
      else {
        if (left.required !== right.required) out.push(`${path}.${name}: required ${left.required} vs ${right.required}`);
        out.push(...diff(left.node, right.node, `${path}.${name}`));
      }
    }
    return out;
  }
  return [];
}

const parity = (schemas: JSONSchema[] = loadSchemas(), edits: SourceEdit = {}): string[] => {
  const types = typeScriptTrees(edits);
  const shipped = schemaTrees(schemas);
  return [
    ...diff(types.manifest, shipped.manifest, 'manifest'),
    ...diff(types.entry, shipped.entry, 'entry'),
  ];
};

describe('manifest and MFE entry types equal the runtime contract types', () => {
  it('reads a non-trivial field tree from the runtime types', () => {
    const { manifest, entry } = typeScriptTrees();
    expect(manifest.kind === 'object' && Object.keys(manifest.fields).sort()).toEqual(['entryLists', 'id', 'metaData', 'shared']);
    expect(entry.kind === 'object' && Object.keys(entry.fields)).toEqual(
      expect.arrayContaining(['id', 'requiredProperties', 'optionalProperties', 'actions', 'domainActions', 'manifest', 'exposedModule', 'exposeAssets'])
    );
  });

  it('passes: same fields, same required flags, at every level', () => {
    expect(parity()).toEqual([]);
  });

  it('fails when a runtime field becomes required', () => {
    const edits: SourceEdit = { [MANIFEST_FILE]: (t) => t.replace('sharedBase?: string', 'sharedBase: string') };
    expect(parity(loadSchemas(), edits).join('\n')).toContain('sharedBase: required true vs false');
  });

  it('fails when a runtime type gains a nested field', () => {
    const edits: SourceEdit = { [MANIFEST_FILE]: (t) => t.replace('  chunkPath: string;', '  chunkPath: string;\n  extra: string;') };
    expect(parity(loadSchemas(), edits).join('\n')).toContain('manifest.shared[].extra: only in types');
  });

  it('fails when the runtime entry gains a field', () => {
    const edits: SourceEdit = { [ENTRY_MF_FILE]: (t) => t.replace('exposedModule: string;', 'exposedModule: string;\n  extra?: string;') };
    expect(parity(loadSchemas(), edits).join('\n')).toContain('entry.extra: only in types');
  });

  it('fails when a schema loses a required flag or gains a field', () => {
    const mutated = structuredClone(loadSchemas()) as Schema[];
    const manifest = mutated.find((s) => String(s.$id).endsWith('mf_manifest.v1~')) as Schema;
    manifest.required = (manifest.required as string[]).filter((r) => r !== 'shared');
    (manifest.properties as Record<string, unknown>).extra = { type: 'string' };
    const out = parity(mutated as JSONSchema[]).join('\n');
    expect(out).toContain('manifest.shared: required true vs false');
    expect(out).toContain('manifest.extra: only in schema');
  });
});
