/**
 * Acceptance: OP-012 — `UnitFormatConformance` checks the pack's
 * `bareImports` against the graph's `requires` and its `bareSpecifiers`
 * against its `bareImports`, resolves a unit's relative imports against
 * EVERY member module path (not only the first), and verifies the
 * manifest→graph hash-chain leg when a manifest is supplied.
 */
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { UnitFormatConformance } from '../../../../unit-format/UnitFormatConformance';
import type { SharedDepGraphFile } from '../../../../unit-format/graph-file';

const sha256 = (text: string): string =>
  createHash('sha256').update(text).digest('hex');

const dirs: string[] = [];
afterEach(() => {
  while (dirs.length > 0) {
    rmSync(dirs.pop() as string, { recursive: true, force: true });
  }
});

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
  packBareImports?: string[];
  packBareSpecifiers?: string[];
}

/** Emit one producer output into `dir`, returning the graph document. */
function emit(dir: string, spec: OutputSpec): SharedDepGraphFile {
  const key = `${spec.name}@${spec.version}`;
  mkdirSync(join(dir, key), { recursive: true });
  const units = spec.units.map((u, i) => {
    const source = u.source ?? `// unit ${i} of ${key}\n`;
    const hash = sha256(source);
    const unitName = u.modulePaths[0].replace(/\.js$/, '');
    const location = `${key}/${unitName}.${hash}.js`;
    mkdirSync(dirname(join(dir, location)), { recursive: true });
    writeFileSync(join(dir, location), source);
    return {
      contentHash: hash,
      modulePaths: u.modulePaths,
      bareImports: u.bareImports ?? [],
      ...(u.bareSpecifiers !== undefined
        ? { bareSpecifiers: u.bareSpecifiers }
        : {}),
      relativeImports: u.relativeImports ?? [],
      location,
    };
  });
  let pack;
  if (spec.packSource !== undefined) {
    const hash = sha256(spec.packSource);
    const location = `${key}.pack.${hash}.js`;
    writeFileSync(join(dir, location), spec.packSource);
    pack = {
      contentHash: hash,
      location,
      ...(spec.packBareImports !== undefined
        ? { bareImports: spec.packBareImports }
        : {}),
      ...(spec.packBareSpecifiers !== undefined
        ? { bareSpecifiers: spec.packBareSpecifiers }
        : {}),
    };
  }
  const graph: SharedDepGraphFile = {
    name: spec.name,
    version: spec.version,
    unitMode: spec.units.length > 1 ? 'units' : 'single',
    units,
    requires: spec.requires,
    mainModulePath: spec.units[0].modulePaths[0],
    pack,
    producer: { name: 'test-producer', version: '1.0.0' },
  };
  const graphText = JSON.stringify(graph);
  const graphHash = sha256(graphText);
  const graphName = `${key}.graph.${graphHash}.json`;
  writeFileSync(join(dir, graphName), graphText);
  return graph;
}

function pair(): { a: string; b: string } {
  const a = mkdtempSync(join(tmpdir(), 'ufc-a-'));
  const b = mkdtempSync(join(tmpdir(), 'ufc-b-'));
  dirs.push(a, b);
  return { a, b };
}

const conformance = new UnitFormatConformance();

describe('acceptance: OP-012 conformance pack, member-path and manifest checks', () => {
  it('OP-012: pack bareImports not covered by requires is a requires-closure violation', () => {
    const { a, b } = pair();
    const spec: OutputSpec = {
      name: 'pkg',
      version: '1.0.0',
      units: [{ modulePaths: ['index.js'] }],
      requires: [],
      packSource: 'import "lodash";\n',
      packBareImports: ['lodash'],
    };
    emit(a, spec);
    emit(b, spec);
    const violations = conformance.check(a, b);
    expect(
      violations.some(
        (v) => v.rule === 'requires-closure' && /pack|lodash/.test(v.detail),
      ),
    ).toBe(true);
  });

  it('OP-012: a pack bareSpecifier whose package is absent from pack bareImports is a violation', () => {
    const { a, b } = pair();
    const spec: OutputSpec = {
      name: 'pkg',
      version: '1.0.0',
      units: [{ modulePaths: ['index.js'] }],
      requires: ['react'],
      packSource: 'x\n',
      packBareImports: [],
      packBareSpecifiers: ['react/jsx-runtime'],
    };
    emit(a, spec);
    emit(b, spec);
    const violations = conformance.check(a, b);
    expect(
      violations.some((v) => v.rule === 'requires-closure'),
    ).toBe(true);
  });

  it('OP-012: a relative import resolvable through a non-first member module path is not a violation', () => {
    const { a, b } = pair();
    const spec: OutputSpec = {
      name: 'pkg',
      version: '1.0.0',
      units: [
        {
          // './y.js' resolves to 'b/y.js' via member 'b/x.js' —
          // 'a/index.js' would wrongly resolve it to 'a/y.js'.
          modulePaths: ['a/index.js', 'b/x.js'],
          relativeImports: ['./y.js'],
        },
        { modulePaths: ['b/y.js'] },
      ],
    };
    emit(a, spec);
    emit(b, spec);
    const violations = conformance.check(a, b);
    expect(violations.filter((v) => v.rule === 'relative-import')).toEqual(
      [],
    );
  });

  it('OP-012: a supplied manifest extends the hash chain to manifest→graph', () => {
    const { a, b } = pair();
    const spec: OutputSpec = {
      name: 'pkg',
      version: '1.0.0',
      units: [{ modulePaths: ['index.js'] }],
    };
    const graph = emit(a, spec);
    emit(b, spec);
    const graphName = `pkg@1.0.0.graph.${sha256(JSON.stringify(graph))}.json`;
    const writeManifest = (dir: string, contentHash: string): string => {
      const manifest = {
        shared: [
          {
            name: 'pkg',
            version: '1.0.0',
            graphFile: { location: graphName, contentHash },
          },
        ],
      };
      const path = join(dir, 'mf-manifest.json');
      writeFileSync(path, JSON.stringify(manifest));
      return path;
    };
    const good = writeManifest(a, sha256(JSON.stringify(graph)));
    expect(
      conformance.check(a, b, good).filter((v) => v.rule === 'hash-chain'),
    ).toEqual([]);
    const bad = writeManifest(a, '0'.repeat(64));
    expect(
      conformance
        .check(a, b, bad)
        .some((v) => v.rule === 'hash-chain' && /pkg/.test(v.detail)),
    ).toBe(true);
  });

  it('OP-012/RF-004: the manifest leg resolves graphFile.location against metaData.sharedBase', () => {
    const { a, b } = pair();
    const spec: OutputSpec = {
      name: 'pkg',
      version: '1.0.0',
      units: [{ modulePaths: ['index.js'] }],
    };
    const graph = emit(a, spec);
    emit(b, spec);
    const graphName = `pkg@1.0.0.graph.${sha256(JSON.stringify(graph))}.json`;
    // Real layout: manifest at the dist root, graphs under shared/.
    mkdirSync(join(a, 'shared'), { recursive: true });
    writeFileSync(
      join(a, 'shared', graphName),
      JSON.stringify(graph),
    );
    const manifest = {
      metaData: { publicPath: './', sharedBase: 'shared/' },
      shared: [
        {
          name: 'pkg',
          version: '1.0.0',
          graphFile: {
            location: graphName,
            contentHash: sha256(JSON.stringify(graph)),
          },
        },
      ],
    };
    const manifestPath = join(a, 'mf-manifest.json');
    writeFileSync(manifestPath, JSON.stringify(manifest));
    const violations = conformance
      .check(a, b, manifestPath)
      .filter((v) => v.rule === 'hash-chain');
    expect(violations).toEqual([]);
  });

  it('OP-012/RF-004: the manifest leg reports each violation once, not once per output', () => {
    const { a, b } = pair();
    const spec: OutputSpec = {
      name: 'pkg',
      version: '1.0.0',
      units: [{ modulePaths: ['index.js'] }],
    };
    const graph = emit(a, spec);
    emit(b, spec);
    const manifest = {
      shared: [
        {
          name: 'pkg',
          version: '1.0.0',
          graphFile: {
            location: `pkg@1.0.0.graph.${sha256(JSON.stringify(graph))}.json`,
            contentHash: '0'.repeat(64),
          },
        },
      ],
    };
    const manifestPath = join(a, 'mf-manifest.json');
    writeFileSync(manifestPath, JSON.stringify(manifest));
    const violations = conformance
      .check(a, b, manifestPath)
      .filter(
        (v) => v.rule === 'hash-chain' && /pkg/.test(v.detail),
      );
    expect(violations.length).toBe(1);
  });

  it('OP-012/RF-008: a manifest-referenced graph that is not parseable produces a violation', () => {
    const { a, b } = pair();
    const spec: OutputSpec = {
      name: 'pkg',
      version: '1.0.0',
      units: [{ modulePaths: ['index.js'] }],
    };
    emit(a, spec);
    emit(b, spec);
    // A file present and hash-matching, but not valid JSON.
    const bogus = 'not json {{{';
    const bogusName = `pkg@1.0.0.graph.${sha256(bogus)}.json`;
    writeFileSync(join(a, bogusName), bogus);
    writeFileSync(join(b, bogusName), bogus);
    const manifest = {
      shared: [
        {
          name: 'pkg',
          version: '1.0.0',
          graphFile: { location: bogusName, contentHash: sha256(bogus) },
        },
      ],
    };
    const manifestPath = join(a, 'mf-manifest.json');
    writeFileSync(manifestPath, JSON.stringify(manifest));
    const violations = conformance.check(a, b, manifestPath);
    expect(
      violations.some(
        (v) => v.rule === 'graph-format' && /parseable/.test(v.detail),
      ),
    ).toBe(true);
  });

  it('OP-012/RF-003: a unit carrying a dynamic import() is a violation; one in a string is not', () => {
    const { a, b } = pair();
    emit(a, {
      name: 'pkg',
      version: '1.0.0',
      units: [
        {
          modulePaths: ['index.js'],
          source: "const p = import('./lazy.js');\nexport const x = 1;\n",
        },
      ],
    });
    emit(b, {
      name: 'pkg',
      version: '1.0.0',
      units: [
        {
          modulePaths: ['index.js'],
          source: 'const s = "import(\'./lazy.js\')";\nexport const x = 1;\n',
        },
      ],
    });
    const violations = conformance.check(a, b);
    expect(
      violations.some(
        (v) => v.rule === 'graph-format' && /dynamic import/.test(v.detail),
      ),
    ).toBe(true);
    // The string-embedded `import(` in output B is not flagged: exactly
    // one dynamic-import violation, from output A.
    expect(
      violations.filter(
        (v) => v.rule === 'graph-format' && /dynamic import/.test(v.detail),
      ).length,
    ).toBe(1);
  });
});
