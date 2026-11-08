/**
 * Shared manifest fixture builders for `mfe-handler-mf` test suites —
 * the `MfManifest`/`MfeEntryMF` shapes a `load()` call consumes,
 * exercising the `requires` / `entryLists` / `sharedChunkRule` /
 * `sharedBase` fields.
 */
import { createHash } from 'node:crypto';

import type {
  MfManifest,
  MfManifestShared,
} from '../../../../manifest/mf-manifest';
import type { MfeEntryMF } from '../../../../types/mfe-entry-mf';
import type { SharedDepEntryListRefs } from '../../../../unit-format/fetch-list';

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

export interface SharedDepOptions {
  version?: string;
  requires?: string[];
  sharedChunkRule?: string;
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
    unwrapKey: null,
  };
  if (options.contentHash !== undefined) {
    entry.contentHash = options.contentHash;
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
  entryLists?: SharedDepEntryListRefs;
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
    ...(options.entryLists !== undefined
      ? { entryLists: options.entryLists }
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
