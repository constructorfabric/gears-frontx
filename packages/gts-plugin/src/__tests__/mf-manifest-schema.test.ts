/**
 * Schema tests for the closed manifest and MFE entry contracts
 * (`cpt-frontx-adr-mfe-asset-discovery`, `cpt-frontx-algo-gts-type-provider-manifest-entry-types`):
 * the manifest fields, their value formats, `units`, `lists`, `metaData.sharedBase`,
 * the entry's `exposeAssets` and its `manifest` instance reference, and the
 * removal of every field outside the contract.
 *
 * Every case registers a candidate instance against the schema the plugin
 * registers at construction; `register` throws on schema failure, so a
 * not-toThrow / toThrow pair is the validation verdict.
 *
 * @cpt-algo:cpt-frontx-algo-gts-type-provider-manifest-entry-types:p1
 */
import { beforeEach, describe, expect, it } from 'vitest';
import mfManifestSchema from '../frontx.mfes/schemas/mfe/mf_manifest.v1.json';
import { GtsPlugin } from '../plugin';
import { resetRealm } from './realm-support';

const MANIFEST_TYPE = 'gts.frontx.mfes.mfe.mf_manifest.v1~';
const ENTRY_MF_TYPE = 'gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~';
const HASH = 'a'.repeat(64);

let seq = 0;
let plugin: GtsPlugin;

type Obj = Record<string, unknown>;

const manifest = (over: Obj = {}): Obj => ({
  id: `${MANIFEST_TYPE}test.mfe.app.m${seq++}.v1`,
  metaData: { publicPath: 'https://cdn.example.com/mfe/' },
  shared: [{ name: 'react', version: '19.2.4', chunkPath: 'shared/react.js' }],
  ...over,
});

const sharedEntry = (extra: Obj = {}): Obj => ({ name: 'react', version: '19.2.4', chunkPath: 'shared/react.js', ...extra });

const entry = (manifestId: string, over: Obj = {}): Obj => ({
  id: `${ENTRY_MF_TYPE}test.mfe.app.e${seq++}.v1`,
  requiredProperties: [],
  actions: [],
  domainActions: [],
  manifest: manifestId,
  exposedModule: './lifecycle',
  exposeAssets: { js: { sync: ['a.js'] }, css: { sync: [], async: [] } },
  ...over,
});

const accepts = (entity: unknown) => {
  expect(() => plugin.register(entity)).not.toThrow();
};
// The reason the library gives; every rejection case asserts the one it expects.
const CLOSED = /Reason: [^\n]*(unevaluated|additional)/i;
const REQUIRED = /Reason: [^\n]*required property/;
const PATTERN = /Reason: [^\n]*should match/;
const TYPE = /Reason: [^\n]*not of type/;
const MIN_LENGTH = /Reason: [^\n]*minimum length/;
const TOO_FEW = /Reason: [^\n]*Too few items/;
const NOT_FOUND = /Reason: [^\n]*not found in registry/;
const ONE_OF = /Reason: [^\n]*oneof/i;
const ANONYMOUS = /Reason: [^\n]*no type identifier/;
const rejects = (entity: unknown, reason: RegExp) => {
  expect(() => plugin.register(entity)).toThrow(reason);
};

beforeEach(() => {
  resetRealm();
  plugin = new GtsPlugin({ isolated: true });
});

describe('manifest fields', () => {
  it('accepts a manifest carrying exactly the required fields', () => {
    const entity = manifest();
    accepts(entity);
    expect(plugin.validateInstance(entity.id as string).valid).toBe(true);
  });

  it.each(['id', 'metaData', 'shared'])('rejects a manifest without %s', (field) => {
    const entity = manifest();
    delete entity[field];
    rejects(entity, field === 'id' ? ANONYMOUS : REQUIRED);
  });

  it('rejects metaData without publicPath', () => {
    rejects(manifest({ metaData: { sharedBase: '/shared/' } }), REQUIRED);
  });

  it('accepts metaData.sharedBase and rejects a non-string one', () => {
    accepts(manifest({ metaData: { publicPath: '/', sharedBase: 'https://cdn.example.com/shared/' } }));
    rejects(manifest({ metaData: { publicPath: '/', sharedBase: 42 } }), TYPE);
  });

  it.each([
    ['name', 'a-name'],
    ['metaData', { publicPath: '/', name: 'x' }],
    ['metaData', { publicPath: '/', type: 'app' }],
    ['metaData', { publicPath: '/', buildInfo: { buildVersion: '1', buildName: 'x' } }],
    ['metaData', { publicPath: '/', remoteEntry: { name: 'r.js', path: '', type: 'module' } }],
    ['metaData', { publicPath: '/', globalName: 'g' }],
    ['entryRoots', { './lifecycle': ['react'] }],
    ['lazyChunkRoots', { 'chunks/a.js': ['react'] }],
  ])('rejects the removed field %s', (field, value) => {
    rejects(manifest({ [field as string]: value }), CLOSED);
  });

  it.each(['unwrapKey', 'graphFile', 'requires', 'sharedChunkRule'])('rejects the removed shared[] field %s', (field) => {
    rejects(manifest({ shared: [sharedEntry({ [field]: field === 'unwrapKey' ? null : 'x' })] }), CLOSED);
  });
});

describe('shared[] value formats', () => {
  it('accepts a contentHash of 64 lowercase hex characters, and none', () => {
    accepts(manifest({ shared: [sharedEntry({ contentHash: HASH })] }));
    accepts(manifest({ shared: [sharedEntry()] }));
  });

  it('rejects a malformed contentHash', () => {
    for (const bad of ['not-a-hash', 'A'.repeat(64), 'a'.repeat(63), 'a'.repeat(65), '']) {
      rejects(manifest({ shared: [sharedEntry({ contentHash: bad })] }), PATTERN);
    }
  });

  it('accepts a scoped name and rejects a name with a colon or an empty one', () => {
    accepts(manifest({ shared: [sharedEntry({ name: '@gears-frontx/mfes' })] }));
    rejects(manifest({ shared: [sharedEntry({ name: 'react:19' })] }), PATTERN);
    rejects(manifest({ shared: [sharedEntry({ name: '' })] }), PATTERN);
  });

  it('accepts a prerelease version and rejects one with a colon or an at sign', () => {
    accepts(manifest({ shared: [sharedEntry({ version: '1.0.0-beta.1' })] }));
    rejects(manifest({ shared: [sharedEntry({ version: '1:0' })] }), PATTERN);
    rejects(manifest({ shared: [sharedEntry({ version: 'react@1.0.0' })] }), PATTERN);
    rejects(manifest({ shared: [sharedEntry({ version: '' })] }), PATTERN);
  });

  it('rejects an empty chunkPath', () => {
    rejects(manifest({ shared: [sharedEntry({ chunkPath: '' })] }), MIN_LENGTH);
  });
});

const unitOf = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  location: 'shared/a.js',
  contentHash: HASH,
  answers: ['a'],
  imports: [],
  ...extra,
});
const listOf = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  units: [HASH],
  ownChunks: ['assets/a.js'],
  ...extra,
});

describe('units', () => {
  it('accepts units carrying location, a 64-hex contentHash, answers and imports of strings or { unit } edges', () => {
    accepts(manifest({ units: [unitOf(), unitOf({ imports: ['react', { unit: HASH }] })] }));
    accepts(manifest({ units: [] }));
  });

  it('rejects a unit that lacks a required field', () => {
    for (const field of ['location', 'contentHash', 'answers', 'imports']) {
      const unit = unitOf();
      delete unit[field];
      rejects(manifest({ units: [unit] }), REQUIRED);
    }
  });

  it('rejects a malformed contentHash in a unit or in an import edge', () => {
    rejects(manifest({ units: [unitOf({ contentHash: 'nope' })] }), PATTERN);
    rejects(manifest({ units: [unitOf({ contentHash: 'A'.repeat(64) })] }), PATTERN);
    rejects(manifest({ units: [unitOf({ imports: [{ unit: 'nope' }] })] }), ONE_OF);
  });

  it('rejects a unit that is not an object, an import edge that is neither a string nor { unit }, and units that are not an array', () => {
    rejects(manifest({ units: ['a.js'] }), TYPE);
    rejects(manifest({ units: [unitOf({ imports: [1] })] }), ONE_OF);
    rejects(manifest({ units: [unitOf({ imports: [{}] })] }), ONE_OF);
    rejects(manifest({ units: { a: unitOf() } }), TYPE);
  });
});

describe('lists', () => {
  it('accepts lists keyed by any module name or lazy-target location, naming the lists they reach by key', () => {
    accepts(manifest({ lists: { './lifecycle': listOf() } }));
    accepts(manifest({ lists: {} }));
    accepts(
      manifest({
        lists: {
          './lifecycle': listOf({ lazy: ['assets/l.js'], patterns: ['locales/en.js'] }),
          'assets/l.js': listOf({ lazy: ['assets/m.js'] }),
          'assets/m.js': listOf(),
          'locales/en.js': listOf(),
        },
      })
    );
  });

  it('rejects a list without units or ownChunks', () => {
    rejects(manifest({ lists: { './a': { ownChunks: [] } } }), REQUIRED);
    rejects(manifest({ lists: { './a': { units: [] } } }), REQUIRED);
    rejects(manifest({ lists: { 'assets/l.js': { units: [] } } }), REQUIRED);
  });

  it('rejects a malformed content identity in a list', () => {
    rejects(manifest({ lists: { './a': listOf({ units: ['nope'] }) } }), PATTERN);
    rejects(manifest({ lists: { './a': listOf({ units: ['A'.repeat(64)] }) } }), PATTERN);
  });

  it('rejects an empty location, in a unit or in a list', () => {
    rejects(manifest({ units: [unitOf({ location: '' })] }), MIN_LENGTH);
    rejects(manifest({ lists: { './a': listOf({ ownChunks: [''] }) } }), MIN_LENGTH);
    rejects(manifest({ lists: { './a': listOf({ lazy: [''] }) } }), MIN_LENGTH);
    rejects(manifest({ lists: { './a': listOf({ patterns: [''] }) } }), MIN_LENGTH);
  });

  it('rejects a value that is not an object, lists that are not keyed, and lazy or patterns that are not arrays of keys', () => {
    rejects(manifest({ lists: { './a': 'a.json' } }), TYPE);
    rejects(manifest({ lists: ['a.json'] }), TYPE);
    rejects(manifest({ lists: { './a': listOf({ lazy: { 'x.js': listOf() } }) } }), TYPE);
    rejects(manifest({ lists: { './a': listOf({ patterns: [1] }) } }), TYPE);
  });
});

describe('registration cost', () => {
  // The schema engine compiles a `$ref` target afresh for every value it
  // validates, regex patterns included. A per-value format reached through
  // `$ref` or `$defs` would therefore be recompiled for each hash in the unit
  // table and lists, making registration cost grow with the manifest. Registration
  // sits on the shell's critical path to the first mount, so the manifest schema
  // declares every format inline.
  const HASH_PATTERN = '^[0-9a-f]{64}$';

  const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

  const keysIn = (node: unknown, found: string[] = []): string[] => {
    if (Array.isArray(node)) {
      for (const item of node) keysIn(item, found);
    } else if (isRecord(node)) {
      for (const [key, value] of Object.entries(node)) {
        found.push(key);
        keysIn(value, found);
      }
    }
    return found;
  };

  // Schema nodes that validate a content identity: a `contentHash` or `unit`
  // property, and the string items of a `units` array.
  const hashPositions = (node: unknown, out: unknown[] = []): unknown[] => {
    if (Array.isArray(node)) {
      for (const item of node) hashPositions(item, out);
    } else if (isRecord(node)) {
      const props = node.properties;
      if (isRecord(props)) {
        for (const [name, sub] of Object.entries(props)) {
          if (name === 'contentHash' || name === 'unit') out.push(sub);
          if (name === 'units' && isRecord(sub) && isRecord(sub.items) && sub.items.type === 'string') {
            out.push(sub.items);
          }
        }
      }
      for (const value of Object.values(node)) hashPositions(value, out);
    }
    return out;
  };

  it('declares no $ref and no $defs in the manifest schema', () => {
    const forbidden = keysIn(mfManifestSchema).filter((key) => key === '$ref' || key === '$defs');
    expect(forbidden).toEqual([]);
  });

  it('inlines the content-hash pattern wherever a hash is validated', () => {
    const positions = hashPositions(mfManifestSchema);
    expect(positions.length).toBeGreaterThanOrEqual(4);
    for (const position of positions) {
      expect(isRecord(position) ? position.pattern : undefined).toBe(HASH_PATTERN);
    }
  });
});

describe('every contract field together', () => {
  it('accepts a manifest and an entry that carry every contract field, the optional ones included', () => {
    const m = manifest({
      metaData: { publicPath: 'https://cdn.example.com/mfe/', sharedBase: 'https://cdn.example.com/shared/' },
      shared: [sharedEntry({ contentHash: HASH })],
      units: [unitOf()],
      lists: { './lifecycle': listOf({ lazy: ['assets/l.js'], patterns: ['locales/en.js'] }), 'assets/l.js': listOf(), 'locales/en.js': listOf() },
    });
    accepts(m);
    accepts(
      entry(m.id as string, {
        optionalProperties: [],
        exposeAssets: { js: { sync: ['a.js', 'b.js'] }, css: { sync: ['a.css'], async: ['b.css'] } },
      })
    );
  });
});

describe('MFE entry', () => {
  let manifestId: string;

  beforeEach(() => {
    const m = manifest();
    manifestId = m.id as string;
    plugin.register(m);
  });

  it('accepts an entry referencing a registered manifest', () => {
    const e = entry(manifestId);
    accepts(e);
    expect(plugin.validateInstance(e.id as string).valid).toBe(true);
  });

  it('rejects an entry referencing a manifest that is not registered', () => {
    rejects(entry(`${MANIFEST_TYPE}test.mfe.app.absent.v1`), NOT_FOUND);
  });

  it('rejects an inline manifest object', () => {
    rejects(entry(manifestId, { manifest: manifest() }), TYPE);
  });

  it.each(['manifest', 'exposedModule', 'exposeAssets'])('rejects an entry without %s', (field) => {
    const e = entry(manifestId);
    delete e[field];
    rejects(e, REQUIRED);
  });

  it('rejects an empty exposedModule', () => {
    rejects(entry(manifestId, { exposedModule: '' }), MIN_LENGTH);
  });

  it('requires a non-empty exposeAssets.js.sync', () => {
    rejects(entry(manifestId, { exposeAssets: { js: { sync: [] }, css: { sync: [], async: [] } } }), TOO_FEW);
    rejects(entry(manifestId, { exposeAssets: { js: {}, css: { sync: [], async: [] } } }), REQUIRED);
  });

  it('rejects exposeAssets.js.async', () => {
    rejects(entry(manifestId, { exposeAssets: { js: { sync: ['a.js'], async: [] }, css: { sync: [], async: [] } } }), CLOSED);
  });

  it('requires both stylesheet lists', () => {
    accepts(entry(manifestId, { exposeAssets: { js: { sync: ['a.js'] }, css: { sync: ['a.css'], async: ['b.css'] } } }));
    rejects(entry(manifestId, { exposeAssets: { js: { sync: ['a.js'] }, css: { sync: [] } } }), REQUIRED);
    rejects(entry(manifestId, { exposeAssets: { js: { sync: ['a.js'] }, css: { async: [] } } }), REQUIRED);
    rejects(entry(manifestId, { exposeAssets: { js: { sync: ['a.js'] } } }), REQUIRED);
  });
});
