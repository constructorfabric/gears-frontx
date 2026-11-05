/**
 * Schema tests for `mf_manifest.v1.json` shared-dependency reuse fields:
 * `graphFile` (location + contentHash), `requires`, `entryRoots`,
 * `lazyChunkRoots`, `sharedChunkRule` and `metaData.sharedBase`
 * (`cpt-frontx-dod-mfe-loading-manifest-field-discovery`).
 *
 * Every case registers a candidate manifest instance against the schema the
 * plugin registers at construction; `register` throws on schema failure, so
 * a not-toThrow / toThrow pair is the validation verdict.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { GtsPlugin } from '../plugin';
import { resetRealm } from './realm-support';

const TYPE = 'gts.frontx.mfes.mfe.mf_manifest.v1~';
const HASH = 'a'.repeat(64);

let seq = 0;
let plugin: GtsPlugin;

type ManifestOverrides = {
  metaData?: Record<string, unknown>;
  shared?: Record<string, unknown>[];
  root?: Record<string, unknown>;
};

const manifest = (overrides: ManifestOverrides = {}) => ({
  id: `${TYPE}test.mfe.app.m${seq++}.v1`,
  name: 'test-mfe',
  metaData: {
    name: 'test-mfe',
    type: 'app',
    buildInfo: { buildVersion: '1.0.0', buildName: 'test' },
    remoteEntry: { name: 'remoteEntry.js', path: '', type: 'module' },
    publicPath: 'https://cdn.example.com/mfe/',
    ...overrides.metaData,
  },
  shared: overrides.shared ?? [
    { name: 'react', version: '19.2.4', chunkPath: 'shared/react.js', unwrapKey: null },
  ],
  ...overrides.root,
});

const sharedEntry = (extra: Record<string, unknown> = {}) => ({
  name: 'react',
  version: '19.2.4',
  chunkPath: 'shared/react.js',
  unwrapKey: null,
  ...extra,
});

const accepts = (entity: unknown) => {
  expect(() => plugin.register(entity)).not.toThrow();
};
const rejects = (entity: unknown) => {
  expect(() => plugin.register(entity)).toThrow();
};

beforeEach(() => {
  resetRealm();
  plugin = new GtsPlugin({ isolated: true });
});

describe('mf_manifest.v1 backward compatibility', () => {
  // Scenario: an old manifest carrying none of the new fields still validates.
  it('accepts a manifest with none of the new fields', () => {
    const entity = manifest();
    accepts(entity);
    expect(plugin.validateInstance((entity as { id: string }).id).valid).toBe(true);
  });
});

describe('shared[].graphFile', () => {
  // Scenario: graphFile.location + graphFile.contentHash — valid and invalid.
  it('accepts a shared entry whose graphFile carries location and a 64-hex contentHash', () => {
    accepts(manifest({ shared: [sharedEntry({ graphFile: { location: 'shared/react.graph.json', contentHash: HASH } })] }));
    accepts(
      manifest({
        shared: [sharedEntry({ graphFile: { location: 'https://cdn.example.com/graphs/react.graph.json', contentHash: HASH } })],
      })
    );
  });

  it('rejects a graphFile missing location or contentHash, or with a malformed hash', () => {
    rejects(manifest({ shared: [sharedEntry({ graphFile: { contentHash: HASH } })] }));
    rejects(manifest({ shared: [sharedEntry({ graphFile: { location: 'shared/react.graph.json' } })] }));
    rejects(manifest({ shared: [sharedEntry({ graphFile: { location: 'shared/react.graph.json', contentHash: 'not-a-hash' } })] }));
    rejects(
      manifest({ shared: [sharedEntry({ graphFile: { location: 'shared/react.graph.json', contentHash: 'A'.repeat(64) } })] })
    );
  });
});

describe('shared[].requires', () => {
  // Scenario: requires — bare package names only, no version specifiers or paths.
  it('accepts requires lists of bare package names', () => {
    accepts(manifest({ shared: [sharedEntry({ requires: ['react-dom', '@scope/pkg'] })] }));
    accepts(manifest({ shared: [sharedEntry({ requires: [] })] }));
  });

  it('rejects requires entries that carry a version specifier, a subpath or a path', () => {
    for (const bad of ['react@19.2.4', 'react/jsx-runtime', '@scope/pkg/sub', './react', '../x', 'react ^19']) {
      rejects(manifest({ shared: [sharedEntry({ requires: [bad] })] }));
    }
    rejects(manifest({ shared: [sharedEntry({ requires: 'react' })] }));
  });
});

describe('entryRoots and lazyChunkRoots', () => {
  const goodRoots = {
    'react': ['react', { name: 'react-dom', version: '19.2.4', modulePaths: ['client.js'] }],
  };

  // Scenario: per-expose roots — package names or unit identifiers.
  it('accepts entryRoots keyed by exposed module name with package-name and unit-id roots', () => {
    accepts(manifest({ root: { entryRoots: goodRoots } }));
    accepts(manifest({ root: { entryRoots: {} } }));
  });

  it('rejects malformed entryRoots', () => {
    rejects(manifest({ root: { entryRoots: { './lifecycle': 'react' } } }));
    rejects(manifest({ root: { entryRoots: { './lifecycle': [{ name: 'react-dom' }] } } }));
    rejects(manifest({ root: { entryRoots: { './lifecycle': [{ name: 'react-dom', version: '19.2.4' }] } } }));
    rejects(manifest({ root: { entryRoots: { './lifecycle': [42] } } }));
  });

  // Scenario: per-lazy-chunk roots — same shape keyed by chunk path.
  it('accepts lazyChunkRoots keyed by chunk path', () => {
    accepts(manifest({ root: { lazyChunkRoots: { 'chunks/lazy-a.js': ['react'] } } }));
  });

  it('rejects malformed lazyChunkRoots', () => {
    rejects(manifest({ root: { lazyChunkRoots: { 'chunks/lazy-a.js': 'react' } } }));
    rejects(manifest({ root: { lazyChunkRoots: ['react'] } }));
  });
});

describe('shared[].sharedChunkRule', () => {
  // Scenario: sharedChunkRule — optional non-empty production-rule identifier.
  it('accepts a shared entry carrying a sharedChunkRule', () => {
    accepts(manifest({ shared: [sharedEntry({ sharedChunkRule: 'unit-format.v1' })] }));
  });

  it('rejects an empty or non-string sharedChunkRule', () => {
    rejects(manifest({ shared: [sharedEntry({ sharedChunkRule: '' })] }));
    rejects(manifest({ shared: [sharedEntry({ sharedChunkRule: 7 })] }));
  });
});

describe('metaData.sharedBase', () => {
  // Scenario: metaData.sharedBase — optional shared-file base location.
  it('accepts metaData.sharedBase', () => {
    accepts(manifest({ metaData: { sharedBase: 'https://cdn.example.com/shared/' } }));
    accepts(manifest({ metaData: { sharedBase: '/shared/' } }));
  });

  it('rejects a non-string sharedBase', () => {
    rejects(manifest({ metaData: { sharedBase: 42 } }));
  });
});

describe('all fields together', () => {
  // Scenario: a manifest carrying every new field at once validates.
  it('accepts a manifest that uses every new field', () => {
    accepts(
      manifest({
        metaData: { sharedBase: 'https://cdn.example.com/shared/' },
        shared: [
          sharedEntry({
            graphFile: { location: 'react.graph.json', contentHash: HASH },
            requires: ['react-dom'],
            sharedChunkRule: 'unit-format.v1',
          }),
        ],
        root: {
          entryRoots: { './lifecycle': ['react'] },
          lazyChunkRoots: { 'chunks/lazy-a.js': [{ name: 'react-dom', version: '19.2.4', modulePaths: ['client.js'] }] },
        },
      })
    );
  });
});
