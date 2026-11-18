/**
 * Schema tests for the closed manifest and MFE entry contracts
 * (`cpt-frontx-adr-mfe-asset-discovery`, `cpt-frontx-algo-gts-type-provider-manifest-entry-types`):
 * the manifest fields, their value formats, `entryLists`, `metaData.sharedBase`,
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

describe('entryLists', () => {
  it('accepts values carrying a location and a 64-hex contentHash, keyed by any module name', () => {
    accepts(manifest({ entryLists: { './lifecycle': { location: 'lists/a.json', contentHash: HASH } } }));
    accepts(manifest({ entryLists: {} }));
  });

  it('rejects a value without location or contentHash, or with a malformed hash', () => {
    rejects(manifest({ entryLists: { './a': { contentHash: HASH } } }), REQUIRED);
    rejects(manifest({ entryLists: { './a': { location: 'a.json' } } }), REQUIRED);
    rejects(manifest({ entryLists: { './a': { location: 'a.json', contentHash: 'nope' } } }), PATTERN);
    rejects(manifest({ entryLists: { './a': { location: 'a.json', contentHash: 'A'.repeat(64) } } }), PATTERN);
  });

  it('rejects a value that is not an object, and a list that is not keyed', () => {
    rejects(manifest({ entryLists: { './a': 'a.json' } }), TYPE);
    rejects(manifest({ entryLists: ['a.json'] }), TYPE);
  });
});

describe('every contract field together', () => {
  it('accepts a manifest and an entry that carry every contract field, the optional ones included', () => {
    const m = manifest({
      metaData: { publicPath: 'https://cdn.example.com/mfe/', sharedBase: 'https://cdn.example.com/shared/' },
      shared: [sharedEntry({ contentHash: HASH })],
      entryLists: { './lifecycle': { location: 'lists/a.json', contentHash: HASH } },
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
