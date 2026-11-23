/**
 * Shared manifest fixture builders for `mfe-handler-mf` test suites —
 * the `MfManifest`/`MfeEntryMF` shapes a `load()` call consumes,
 * exercising the `units` / `lists` / `sharedBase` fields. An entry references its
 * manifest by id, so `buildEntry` registers the manifest it is given.
 */
import { createHash } from 'node:crypto';

import type {
  MfManifest,
  MfManifestShared,
} from '../../../../manifest/mf-manifest';
import type { MfeEntryMF } from '../../../../types/mfe-entry-mf';
import { registerManifest } from './registered-manifest';
import type {
  SharedDepFetchList,
  SharedDepImportEdge,
  SharedDepUnit,
} from '../../../../unit-format/fetch-list';

export const MANIFEST_ID = 'mock.mfe.mf_manifest.v1~test.manifest.v1';
export const ENTRY_BASE_ID = 'mock.mfe.entry.v1~';
export const ENTRY_ID = `${ENTRY_BASE_ID}test.entry.v1`;
export const PUBLIC_PATH = 'http://localhost:3099/';

/** SHA-256 hex digest of `text` — a declared content identity (the runtime only uses it as a sharing key). */
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

export interface SharedDepOptions {
  version?: string;
  chunkPath?: string;
  contentHash?: string;
}

/** A manifest `shared[]` entry. */
export function sharedDep(
  name: string,
  options: SharedDepOptions = {},
): MfManifestShared {
  const entry: MfManifestShared = {
    name,
    version: options.version ?? '1.0.0',
    chunkPath: options.chunkPath ?? `shared/${name}.js`,
  };
  if (options.contentHash !== undefined) {
    entry.contentHash = options.contentHash;
  }
  return entry;
}

/**
 * A fetch list with its lazy and pattern lists nested, the way a test
 * writes it; `flattenLists` holds each once under its key, as the manifest
 * does.
 */
export interface NestedList {
  units: string[];
  ownChunks: string[];
  lazy?: Record<string, NestedList>;
  patterns?: Record<string, NestedList>;
}

/** Hold every list of `roots`, nested ones included, once under its key. */
export function flattenLists(
  roots: Readonly<Record<string, NestedList>>,
): Record<string, SharedDepFetchList> {
  const out: Record<string, SharedDepFetchList> = {};
  const walk = (key: string, list: NestedList): void => {
    out[key] = {
      units: list.units,
      ownChunks: list.ownChunks,
      ...(list.lazy !== undefined ? { lazy: Object.keys(list.lazy) } : {}),
      ...(list.patterns !== undefined ? { patterns: Object.keys(list.patterns) } : {}),
    };
    for (const [childKey, child] of Object.entries({ ...list.lazy, ...list.patterns })) {
      walk(childKey, child);
    }
  };
  for (const [key, list] of Object.entries(roots)) walk(key, list);
  return out;
}

export interface BuildManifestOptions {
  metaData?: Partial<MfManifest['metaData']>;
  units?: SharedDepUnit[];
  lists?: Record<string, NestedList>;
}

/** Assemble the `MfManifest` a `load()` consumes. */
export function buildManifest(
  shared: MfManifestShared[],
  options: BuildManifestOptions = {},
): MfManifest {
  return {
    id: MANIFEST_ID,
    metaData: {
      publicPath: PUBLIC_PATH,
      ...options.metaData,
    },
    shared,
    ...(options.units !== undefined ? { units: options.units } : {}),
    ...(options.lists !== undefined ? { lists: flattenLists(options.lists) } : {}),
  };
}

/** A unit-table entry whose declared content identity is the hash of `text`. */
export function unitOf(
  location: string,
  text: string,
  answers: string[] = [],
  imports: SharedDepImportEdge[] = [],
): SharedDepUnit {
  return { location, contentHash: sha256Hex(text), answers, imports };
}

/** A fetch list naming `units` by content identity. */
export function listOf(
  units: readonly SharedDepUnit[],
  rest: Partial<NestedList> = {},
): NestedList {
  return {
    units: units.map((unit) => unit.contentHash),
    ownChunks: [],
    ...rest,
  };
}

/**
 * A manifest as a registry holds a producer's JSON: whatever shape the
 * producer wrote, unchecked. Parsing makes the value `any`, so no type
 * assertion stands between a fixture and the handler's own checks.
 */
export function jsonManifest(written: object): MfManifest {
  return JSON.parse(JSON.stringify(written));
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
    manifest: registerManifest(manifest),
    exposedModule,
    exposeAssets: {
      js: { sync: ['assets/lifecycle.js'] },
      css: { sync: [], async: [] },
    },
  };
}
