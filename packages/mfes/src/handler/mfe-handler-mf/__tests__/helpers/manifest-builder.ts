/**
 * Shared manifest/graph-file fixture builders for `mfe-handler-mf` test
 * suites — the `./unit-format` contract shapes.
 *
 * `buildGraphFile` emits a graph-file JSON document per
 * `SharedDepGraphFile` (`src/unit-format/graph-file.ts`), computing the
 * real SHA-256 content identities the runtime verifies; `graphSharedDep`
 * mints the manifest `shared[]` entry referencing it; `buildManifest` /
 * `buildEntry` assemble the `MfManifest` / `MfeEntryMF` a `load()` call
 * consumes, exercising the `graphFile` / `requires` / `entryRoots` /
 * `lazyChunkRoots` / `sharedChunkRule` / `sharedBase` fields added by the
 * `mf_manifest.v1` schema work.
 */
import { createHash } from 'node:crypto';

import type {
  MfManifest,
  MfManifestRoot,
  MfManifestShared,
} from '../../../../manifest/mf-manifest';
import type { MfeEntryMF } from '../../../../types/mfe-entry-mf';
import type { SharedDepGraphFile } from '../../../../unit-format/graph-file';

export const MANIFEST_ID = 'mock.mfe.mf_manifest.v1~test.manifest.v1';
export const ENTRY_BASE_ID = 'mock.mfe.entry.v1~';
export const ENTRY_ID = `${ENTRY_BASE_ID}test.entry.v1`;
export const PUBLIC_PATH = 'http://localhost:3099/';

/** SHA-256 hex digest of `text` — the same identity the runtime verifies. */
export function sha256Hex(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * The unit identity key for the per-load unit-reference map:
 * `package@version` joined with the unit's sorted member module paths
 * (`cpt-frontx-adr-shared-dep-reuse`).
 */
export function unitIdentityKey(
  name: string,
  version: string,
  modulePaths: readonly string[],
): string {
  return `${name}@${version}@${[...modulePaths].sort().join(',')}`;
}

export interface UnitSpec {
  modulePaths: string[];
  bareImports?: string[];
  /** Bare specifiers as written, subpaths included; omitted when undefined. */
  bareSpecifiers?: string[];
  relativeImports?: string[];
  source: string;
}

export interface BuiltGraphFile {
  /** The serialized graph-file document. */
  text: string;
  /** SHA-256 of `text` — the manifest `graphFile.contentHash`. */
  hash: string;
  /** SHA-256 of each unit's `source`, in `units` order. */
  unitHashes: string[];
  /** Location (route key) of each unit, in `units` order. */
  unitLocations: string[];
  packHash?: string;
  packLocation?: string;
  /** The parsed graph-file document. */
  graph: SharedDepGraphFile;
}

/**
 * Build a graph-file document for one `name@version`, computing every
 * content identity. `packSource`, when given, adds a `pack` member.
 * `requires` is included only when not `undefined` (an explicit `[]`
 * stays an explicit empty list — distinct from an absent field).
 */
export function buildGraphFile(
  name: string,
  version: string,
  units: readonly UnitSpec[],
  mainModulePath: string,
  requires?: string[],
  packSource?: string,
  extras?: Partial<SharedDepGraphFile>,
): BuiltGraphFile {
  const unitHashes = units.map((unit) => sha256Hex(unit.source));
  const unitLocations = units.map(
    (unit, i) =>
      `shared/${name}/${unit.modulePaths[0].replace(/\.js$/, '')}.${unitHashes[i]}.js`,
  );
  const graph: SharedDepGraphFile = {
    name,
    version,
    unitMode: 'units',
    units: units.map((unit, i) => ({
      contentHash: unitHashes[i],
      modulePaths: unit.modulePaths,
      bareImports: unit.bareImports ?? [],
      ...(unit.bareSpecifiers !== undefined
        ? { bareSpecifiers: unit.bareSpecifiers }
        : {}),
      relativeImports: unit.relativeImports ?? [],
      location: unitLocations[i],
    })),
    mainModulePath,
    ...(requires !== undefined ? { requires } : {}),
    ...(packSource !== undefined
      ? {
          pack: {
            contentHash: sha256Hex(packSource),
            location: `shared/${name}/pack.${sha256Hex(packSource)}.js`,
          },
        }
      : {}),
    ...extras,
  };
  const text = JSON.stringify(graph);
  return {
    text,
    hash: sha256Hex(text),
    unitHashes,
    unitLocations,
    packHash: graph.pack?.contentHash,
    packLocation: graph.pack?.location,
    graph,
  };
}

export interface GraphSharedDepOptions {
  version?: string;
  requires?: string[];
  sharedChunkRule?: string;
  /** When false, `chunkPath` is omitted — a units-only entry. */
  withChunkPath?: boolean;
}

/** A manifest `shared[]` entry referencing a built graph file. */
export function graphSharedDep(
  name: string,
  graph: { hash: string },
  options: GraphSharedDepOptions = {},
): MfManifestShared {
  const entry: MfManifestShared = {
    name,
    version: options.version ?? '1.0.0',
    chunkPath: `shared/${name}.js`,
    unwrapKey: null,
    graphFile: {
      location: `shared/${name}.graph.json`,
      contentHash: graph.hash,
    },
  };
  if (options.withChunkPath === false) {
    // `chunkPath` is a required manifest field; a units-only entry still
    // carries it as the whole-package fallback address.
    entry.chunkPath = `shared/${name}.js`;
  }
  if (options.requires !== undefined) {
    entry.requires = options.requires;
  }
  if (options.sharedChunkRule !== undefined) {
    entry.sharedChunkRule = options.sharedChunkRule;
  }
  return entry;
}

export interface BuildManifestOptions {
  metaData?: Partial<MfManifest['metaData']>;
  /** Roots per expose module path; key is the exposed module id. */
  entryRoots?: Record<string, MfManifestRoot[]>;
  lazyChunkRoots?: Record<string, MfManifestRoot[]>;
}

/** Assemble the `MfManifest` a `load()` consumes. */
export function buildManifest(
  shared: MfManifestShared[],
  options: BuildManifestOptions = {},
): MfManifest {
  return {
    id: MANIFEST_ID,
    name: 'testMfe',
    metaData: {
      name: 'testMfe',
      type: 'app',
      buildInfo: { buildVersion: '1.0.0', buildName: 'testMfe' },
      remoteEntry: { name: 'remoteEntry.js', path: '', type: 'module' },
      globalName: 'testMfe',
      publicPath: PUBLIC_PATH,
      ...options.metaData,
    },
    shared,
    ...(options.entryRoots !== undefined
      ? { entryRoots: options.entryRoots }
      : {}),
    ...(options.lazyChunkRoots !== undefined
      ? { lazyChunkRoots: options.lazyChunkRoots }
      : {}),
  };
}

/** The `MfeEntryMF` wrapping `manifest` for `handler.load(...)`. */
export function buildEntry(
  manifest: MfManifest,
  exposedModule = './lifecycle',
): MfeEntryMF {
  return {
    id: ENTRY_ID,
    requiredProperties: [],
    actions: [],
    domainActions: [],
    manifest,
    exposedModule,
    exposeAssets: {
      js: { sync: ['assets/lifecycle.js'], async: [] },
      css: { sync: [], async: [] },
    },
  };
}
