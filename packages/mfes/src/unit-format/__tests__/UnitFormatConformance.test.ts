import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, afterEach } from 'vitest';

import { UnitFormatConformance } from '../UnitFormatConformance';
import type { SharedDepGraphFile } from '../graph-file';
import type { UnitFormatViolationRule } from '../UnitFormatViolation';

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

interface UnitSpec {
  modulePaths: string[];
  bareImports?: string[];
  bareSpecifiers?: string[];
  relativeImports?: string[];
  source?: string;
}

interface OutputSpec {
  name: string;
  version: string;
  units: UnitSpec[];
  requires?: string[];
  packSource?: string;
  producer?: { name: string; version: string };
  entryModulePaths?: Record<string, string>;
}

/**
 * Emit one conforming `package@version` output into `dir`: the unit files
 * under `<pkg>@<version>/`, the optional pack, and the content-addressed
 * graph file — all named by the contract's rules with real SHA-256 names.
 */
function emitConformingOutput(dir: string, spec: OutputSpec): SharedDepGraphFile {
  const key = `${spec.name}@${spec.version}`;
  const unitDir = join(dir, key);
  mkdirSync(unitDir, { recursive: true });

  const units = spec.units.map((u, i) => {
    const source = u.source ?? `// unit ${i} of ${key}\n`;
    const hash = sha256(source);
    const unitName = u.modulePaths[0].replace(/\.js$/, '');
    const location = `${key}/${unitName}.${hash}.js`;
    writeFileSync(join(unitDir, `${unitName}.${hash}.js`), source);
    return {
      contentHash: hash,
      modulePaths: u.modulePaths,
      bareImports: u.bareImports ?? [],
      ...(u.bareSpecifiers !== undefined ? { bareSpecifiers: u.bareSpecifiers } : {}),
      relativeImports: u.relativeImports ?? [],
      location,
    };
  });

  let pack;
  if (spec.packSource !== undefined) {
    const hash = sha256(spec.packSource);
    const location = `${key}.pack.${hash}.js`;
    writeFileSync(join(dir, location), spec.packSource);
    pack = { contentHash: hash, location };
  }

  const graph: SharedDepGraphFile = {
    name: spec.name,
    version: spec.version,
    unitMode: spec.units.length > 1 ? 'units' : 'single',
    units,
    requires: spec.requires,
    mainModulePath: spec.units[0].modulePaths[0],
    ...(spec.entryModulePaths !== undefined ? { entryModulePaths: spec.entryModulePaths } : {}),
    pack,
    producer: spec.producer ?? { name: 'test-producer', version: '1.0.0' },
  };
  const graphText = JSON.stringify(graph, null, 2);
  const graphHash = sha256(graphText);
  writeFileSync(join(dir, `${key}.graph.${graphHash}.json`), graphText);
  return graph;
}

const rules = (violations: { rule: UnitFormatViolationRule }[]) =>
  violations.map((v) => v.rule);

describe('UnitFormatConformance', () => {
  const dirs: string[] = [];
  const makeDir = () => {
    const d = mkdtempSync(join(tmpdir(), 'ufc-'));
    dirs.push(d);
    return d;
  };
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  const conformance = new UnitFormatConformance();

  it('returns no violations for conforming output identical across two builds', () => {
    const a = makeDir();
    const b = makeDir();
    const spec: OutputSpec = {
      name: 'left-pad',
      version: '1.0.0',
      requires: ['dep-lib'],
      units: [
        {
          modulePaths: ['index.js'],
          bareImports: ['dep-lib'],
          relativeImports: ['./util.js'],
          source: "import './util.js';\n",
        },
        { modulePaths: ['util.js'], source: 'export const u = 1;\n' },
      ],
      packSource: '// whole pack\n',
    };
    emitConformingOutput(a, spec);
    emitConformingOutput(b, spec);
    expect(conformance.check(a, b)).toEqual([]);
  });

  it('reports a naming violation for a file outside the naming rules', () => {
    const a = makeDir();
    const b = makeDir();
    const spec: OutputSpec = { name: 'p', version: '1.0.0', units: [{ modulePaths: ['i.js'] }] };
    emitConformingOutput(a, spec);
    emitConformingOutput(b, spec);
    writeFileSync(join(a, 'stray.js'), '// not content addressed\n');
    expect(rules(conformance.check(a, b))).toContain('naming');
  });

  it('reports a hash-chain violation when a unit’s bytes do not match its declared contentHash', () => {
    const a = makeDir();
    const b = makeDir();
    const spec: OutputSpec = { name: 'p', version: '1.0.0', units: [{ modulePaths: ['i.js'] }] };
    const graph = emitConformingOutput(a, spec);
    emitConformingOutput(b, spec);
    const rel = graph.units[0].location;
    writeFileSync(join(a, rel), '// tampered bytes\n');
    expect(rules(conformance.check(a, b))).toContain('hash-chain');
  });

  it('reports a hash-chain violation when the graph file name hash does not match its content', () => {
    const a = makeDir();
    const b = makeDir();
    const spec: OutputSpec = { name: 'p', version: '1.0.0', units: [{ modulePaths: ['i.js'] }] };
    emitConformingOutput(a, spec);
    emitConformingOutput(b, spec);
    const graphFile = readdirSync(a).find((f) => f.includes('.graph.'))!;
    writeFileSync(join(a, graphFile), '{"tampered":true}');
    expect(rules(conformance.check(a, b))).toContain('hash-chain');
  });

  it('reports a requires-closure violation when a unit bare import is absent from requires', () => {
    const a = makeDir();
    const b = makeDir();
    const spec: OutputSpec = {
      name: 'p',
      version: '1.0.0',
      requires: [],
      units: [{ modulePaths: ['i.js'], bareImports: ['undeclared-dep'] }],
    };
    emitConformingOutput(a, spec);
    emitConformingOutput(b, spec);
    expect(rules(conformance.check(a, b))).toContain('requires-closure');
  });

  it('accepts subpath bare specifiers and entry module paths that resolve to units', () => {
    const a = makeDir();
    const b = makeDir();
    const spec: OutputSpec = {
      name: 'dom',
      version: '1.0.0',
      requires: ['dom', 'react'],
      entryModulePaths: { '.': 'index.js', './client': 'client.js' },
      units: [
        { modulePaths: ['index.js'], bareImports: ['react'], bareSpecifiers: ['react/jsx-runtime'] },
        { modulePaths: ['client.js'], bareImports: ['dom'], bareSpecifiers: ['dom'] },
      ],
    };
    emitConformingOutput(a, spec);
    emitConformingOutput(b, spec);
    expect(conformance.check(a, b)).toEqual([]);
  });

  it('reports a requires-closure violation when a bare specifier names a package absent from the unit bare imports', () => {
    const a = makeDir();
    const b = makeDir();
    const spec: OutputSpec = {
      name: 'p',
      version: '1.0.0',
      requires: ['react'],
      units: [{ modulePaths: ['i.js'], bareImports: ['react'], bareSpecifiers: ['@scope/other/sub'] }],
    };
    emitConformingOutput(a, spec);
    emitConformingOutput(b, spec);
    expect(rules(conformance.check(a, b))).toContain('requires-closure');
  });

  it('reports a graph-format violation when an entry module path is owned by no unit', () => {
    const a = makeDir();
    const b = makeDir();
    const spec: OutputSpec = {
      name: 'p',
      version: '1.0.0',
      entryModulePaths: { '.': 'i.js', './client': 'client.js' },
      units: [{ modulePaths: ['i.js'] }],
    };
    emitConformingOutput(a, spec);
    emitConformingOutput(b, spec);
    expect(rules(conformance.check(a, b))).toContain('graph-format');
  });

  it('reports a relative-import violation when an intra-package import resolves to no unit', () => {
    const a = makeDir();
    const b = makeDir();
    const spec: OutputSpec = {
      name: 'p',
      version: '1.0.0',
      units: [{ modulePaths: ['i.js'], relativeImports: ['./missing.js'] }],
    };
    emitConformingOutput(a, spec);
    emitConformingOutput(b, spec);
    expect(rules(conformance.check(a, b))).toContain('relative-import');
  });

  it('reports a byte-identity violation when two builds of the same inputs disagree', () => {
    const a = makeDir();
    const b = makeDir();
    const spec: OutputSpec = { name: 'p', version: '1.0.0', units: [{ modulePaths: ['i.js'] }] };
    emitConformingOutput(a, spec);
    emitConformingOutput(b, { ...spec, units: [{ modulePaths: ['i.js'], source: '// different bytes\n' }] });
    expect(rules(conformance.check(a, b))).toContain('byte-identity');
  });

  it('accepts three byte-identical output sets through checkAll', () => {
    const a = makeDir();
    const b = makeDir();
    const c = makeDir();
    const spec: OutputSpec = {
      name: 'p',
      version: '1.0.0',
      units: [{ modulePaths: ['i.js'], source: 'export const i = 1;\n' }],
    };
    emitConformingOutput(a, spec);
    emitConformingOutput(b, spec);
    emitConformingOutput(c, spec);
    expect(conformance.checkAll([a, b, c])).toEqual([]);
  });

  it('reports a byte-identity violation through checkAll when any set disagrees', () => {
    const a = makeDir();
    const b = makeDir();
    const c = makeDir();
    const spec: OutputSpec = {
      name: 'p',
      version: '1.0.0',
      units: [{ modulePaths: ['i.js'] }],
    };
    emitConformingOutput(a, spec);
    emitConformingOutput(b, spec);
    emitConformingOutput(c, {
      ...spec,
      units: [{ modulePaths: ['i.js'], source: '// different bytes\n' }],
    });
    expect(rules(conformance.checkAll([a, b, c]))).toContain('byte-identity');
  });

  it('checks a single output set through checkAll without a pair to compare', () => {
    const a = makeDir();
    const spec: OutputSpec = {
      name: 'p',
      version: '1.0.0',
      units: [{ modulePaths: ['i.js'] }],
    };
    emitConformingOutput(a, spec);
    expect(conformance.checkAll([a])).toEqual([]);
    writeFileSync(join(a, 'stray.js'), '// not content addressed\n');
    expect(rules(conformance.checkAll([a]))).toContain('naming');
  });

  it('accepts scoped package names in the naming rules', () => {
    const a = makeDir();
    const b = makeDir();
    const spec: OutputSpec = {
      name: '@scope/lib',
      version: '2.1.0',
      units: [{ modulePaths: ['index.js'] }],
    };
    emitConformingOutput(a, spec);
    emitConformingOutput(b, spec);
    expect(conformance.check(a, b)).toEqual([]);
  });
});
